import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"

interface TranslationProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "translation">>
}

interface RawLine {
  id: string
  regionId: string
  text: string
  ts: number
}

interface SelectedRegion {
  id: string
  x: number
  y: number
  width: number
  height: number
  isActive: boolean
  lastText?: string
}

const Translation: React.FC<TranslationProps> = ({ setView }) => {
  const [selectedRegions, setSelectedRegions] = useState<SelectedRegion[]>([])
  const [isSelecting, setIsSelecting] = useState(false)
  const [translations, setTranslations] = useState<Map<string, string>>(new Map())
  const [rawFeed, setRawFeed] = useState<RawLine[]>([])
  const [translationHistory, setTranslationHistory] = useState<Array<{
    id: string
    regionId: string
    originalText: string
    translation: string
    timestamp: number
  }>>([])
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [sourceLanguage, setSourceLanguage] = useState<string>('auto')
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const rawListRef = useRef<HTMLDivElement>(null)
  const historyListRef = useRef<HTMLDivElement>(null)

  const languages = [
    { code: 'auto', name: 'Auto-detect', flag: '🌐' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' },
    { code: 'ja', name: '日本語 (Japanese)', flag: '🇯🇵' },
    { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' },
    { code: 'es', name: 'Español (Spanish)', flag: '🇪🇸' },
    { code: 'fr', name: 'Français (French)', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch (German)', flag: '🇩🇪' },
    { code: 'it', name: 'Italiano (Italian)', flag: '🇮🇹' },
    { code: 'pt', name: 'Português (Portuguese)', flag: '🇵🇹' },
    { code: 'ru', name: 'Русский (Russian)', flag: '🇷🇺' },
    { code: 'ar', name: 'العربية (Arabic)', flag: '🇸🇦' },
    { code: 'hi', name: 'हिन्दी (Hindi)', flag: '🇮🇳' },
    { code: 'th', name: 'ไทย (Thai)', flag: '🇹🇭' },
    { code: 'vi', name: 'Tiếng Việt (Vietnamese)', flag: '🇻🇳' },
    { code: 'nl', name: 'Nederlands (Dutch)', flag: '🇳🇱' },
    { code: 'pl', name: 'Polski (Polish)', flag: '🇵🇱' },
    { code: 'tr', name: 'Türkçe (Turkish)', flag: '🇹🇷' },
    { code: 'id', name: 'Bahasa Indonesia (Indonesian)', flag: '🇮🇩' },
    { code: 'uk', name: 'Українська (Ukrainian)', flag: '🇺🇦' },
  ]
  
  const getLanguageDisplay = (code: string) => {
    const lang = languages.find(l => l.code === code)
    return lang ? `${lang.flag} ${code.toUpperCase()}` : code.toUpperCase()
  }

  const handleSelectArea = async () => {
    try {
      setIsSelecting(true)
      // This will trigger the area selection overlay
      await window.electronAPI.startAreaSelection()
    } catch (error) {
      console.error("Failed to start area selection:", error)
    } finally {
      setIsSelecting(false)
    }
  }

  const toggleRegionMonitoring = async (regionId: string) => {
    try {
      await window.electronAPI.toggleRegionMonitoring(regionId)
      setSelectedRegions(prev => 
        prev.map(region => 
          region.id === regionId 
            ? { ...region, isActive: !region.isActive }
            : region
        )
      )
    } catch (error) {
      console.error("Failed to toggle region monitoring:", error)
    }
  }

  const deleteRegion = async (regionId: string) => {
    try {
      await window.electronAPI.deleteRegion(regionId)
      setSelectedRegions(prev => prev.filter(region => region.id !== regionId))
      setTranslations(prev => {
        const newTranslations = new Map(prev)
        newTranslations.delete(regionId)
        return newTranslations
      })
    } catch (error) {
      console.error("Failed to delete region:", error)
    }
  }

  // Load selected regions and language settings on component mount
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const regions = await window.electronAPI.getSelectedRegions()
        setSelectedRegions(regions)
      } catch (error) {
        console.error("Failed to load regions:", error)
      }
    }
    
    const loadLanguageSettings = async () => {
      try {
        // Try to get persisted language settings
        const settings = await (window.electronAPI as any).getLanguageSettings?.()
        if (settings) {
          console.log('[UI] Loaded persisted language settings:', settings)
          setSourceLanguage(settings.source)
          setTargetLanguage(settings.target)
        }
        setSettingsLoaded(true) // Mark as loaded regardless of success/failure
      } catch (error) {
        console.error("Failed to load language settings:", error)
        setSettingsLoaded(true) // Still mark as loaded to allow saving user changes
      }
    }
    
    loadRegions()
    loadLanguageSettings()
  }, [])

  // Listen for region changes and translation updates
  useEffect(() => {
    const cleanupFunctions = [
      // Listen for language settings requests from main process
      (window.electronAPI as any).onLanguageSettingsRequest?.(() => {
        // Send current language settings back to main process
        console.log('[UI] Responding to language settings request:', { source: sourceLanguage, target: targetLanguage })
        ;(window.electronAPI as any).sendLanguageSettingsResponse?.({
          source: sourceLanguage,
          target: targetLanguage
        })
      }),
      // Listen for translation results
      window.electronAPI.onTranslationReady((data: { 
        regionId: string, 
        originalText: string, 
        translation: string, 
        timestamp: number 
      }) => {
        console.log("Translation ready:", data)
        
        // Update the region with new text
        setSelectedRegions(prev => 
          prev.map(region => 
            region.id === data.regionId 
              ? { ...region, lastText: data.originalText }
              : region
          )
        )
        
        // Update translations
        setTranslations(prev => new Map(prev.set(data.regionId, data.translation)))
        
        // Add to translation history
        setTranslationHistory(prev => [{
          id: `${data.regionId}_${data.timestamp}`,
          regionId: data.regionId,
          originalText: data.originalText,
          translation: data.translation,
          timestamp: data.timestamp
        }, ...prev.slice(0, 49)]) // Keep last 50 translations
        
        // Auto-scroll to top of translation history list
        setTimeout(() => historyListRef.current && (historyListRef.current.scrollTop = 0), 0)
        
        // Notification removed as requested
      }),
      
      // Listen for new regions being added
      window.electronAPI.onRegionAdded((data: { region: SelectedRegion }) => {
        setSelectedRegions(prev => [...prev, data.region])
        // Ensure user lands on the live page immediately
        setView('translation')
      }),
      
      // Listen for region changes (new text detected)
      window.electronAPI.onRegionChanged((data: { region: SelectedRegion }) => {
        setSelectedRegions(prev => {
          const idx = prev.findIndex(r => r.id === data.region.id)
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...data.region }
          return next
        })
        // Update raw feed (deduplicate per region)
        setRawFeed(prev => {
          const last = prev.find(p => p.regionId === data.region.id)
          if (last && last.text === data.region.lastText) return prev
          const updated = [
            { id: `${data.region.id}_${Date.now()}`, regionId: data.region.id, text: data.region.lastText || '', ts: Date.now() },
            ...prev.filter(p => Date.now() - p.ts < 5000)
          ]
          // Auto-scroll raw feed container to top on prepend
          setTimeout(() => rawListRef.current && (rawListRef.current.scrollTop = 0), 0)
          return updated
        })
      }),
      
      // Listen for region deletions
      window.electronAPI.onRegionDeleted?.((data: { region: SelectedRegion }) => {
        setSelectedRegions(prev => prev.filter(region => region.id !== data.region.id))
        setTranslations(prev => {
          const newTranslations = new Map(prev)
          newTranslations.delete(data.region.id)
          return newTranslations
        })
      })
    ].filter(Boolean)

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup?.())
    }
  }, [sourceLanguage, targetLanguage]) // Re-register when language settings change

  // Save language settings when they change (but only after initial load)
  useEffect(() => {
    const saveLanguageSettings = async () => {
      try {
        await (window.electronAPI as any).setLanguageSettings?.({ 
          source: sourceLanguage, 
          target: targetLanguage 
        })
        console.log('[UI] Saved language settings:', { source: sourceLanguage, target: targetLanguage })
      } catch (error) {
        console.error("Failed to save language settings:", error)
      }
    }
    
    // Only save after settings have been loaded to avoid overwriting with initial values
    if (settingsLoaded && sourceLanguage && targetLanguage) {
      saveLanguageSettings()
    }
  }, [sourceLanguage, targetLanguage, settingsLoaded])

  // Save settings when component unmounts (when switching views)
  useEffect(() => {
    return () => {
      // Save on component unmount
      if (settingsLoaded && sourceLanguage && targetLanguage) {
        (window.electronAPI as any).setLanguageSettings?.({ 
          source: sourceLanguage, 
          target: targetLanguage 
        })
        console.log('[UI] Saving settings on unmount:', { source: sourceLanguage, target: targetLanguage })
      }
    }
  }, [sourceLanguage, targetLanguage, settingsLoaded])

  // Purge rawFeed entries older than 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setRawFeed(prev => prev.filter(item => Date.now() - item.ts < 5000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div ref={contentRef} className="relative space-y-3 px-4 py-3">

      {/* Header */}
      <div className="bg-transparent w-fit">
        <div className="pb-3">
          <h1 className="text-lg font-semibold text-white mb-2">Real-Time Translation</h1>
          <p className="text-sm text-white/70 mb-4">
            Select screen regions to monitor for subtitles and get instant translations
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/60 backdrop-blur-md rounded-lg p-3 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={handleSelectArea}
            disabled={isSelecting}
            className={`px-2 py-1 rounded-md transition-colors text-[11px] leading-none ${
              isSelecting
                ? 'bg-white/5 text-white/40 cursor-not-allowed'
                : 'bg-white/10 hover:bg-white/20 text-white/70'
            }`}
          >
            {isSelecting ? 'Selecting...' : 'Select Region'}
          </button>
          
          <button
            onClick={() => setView('queue')}
            className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
          >
            Back to Queue
          </button>
          
          <button
            onClick={() => setView('solutions')}
            className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
          >
            Solutions
          </button>
          
        </div>
      </div>

      {/* Selected Regions */}
      <div className="bg-black/60 backdrop-blur-md rounded-lg p-4">
        <h2 className="text-md font-medium text-white mb-3">Selected Regions</h2>
        
        {selectedRegions.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            <p>No regions selected yet</p>
            <p className="text-sm mt-1">Click "Select Region" to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedRegions.map((region) => (
              <div key={region.id} className="bg-black/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-white font-medium">
                    Region {region.id.substring(0, 8)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleRegionMonitoring(region.id)}
                      className={`px-2 py-1 rounded-md text-[11px] leading-none transition-colors ${
                        region.isActive
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                          : 'bg-white/10 hover:bg-white/20 text-white/70'
                      }`}
                    >
                      {region.isActive ? 'Pause' : 'Start Monitoring'}
                    </button>
                    <button
                      onClick={() => deleteRegion(region.id)}
                      className="px-2 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[11px] leading-none transition-colors border border-red-500/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="text-xs text-white/60 mb-2">
                  Position: {region.x}, {region.y} | Size: {region.width}x{region.height}
                </div>
                
                {region.lastText && (
                  <div className="bg-black/60 rounded p-2">
                    <div className="text-xs text-white/60 mb-1">Original Text:</div>
                    <div className="text-sm text-white">{region.lastText}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Translation History */}
      <div className="bg-black/60 backdrop-blur-md rounded-lg p-4 mb-4">
        <h2 className="text-md font-medium text-white mb-3">Translation History</h2>
        
        {/* Language Selection */}
        <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/60">From:</span>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="bg-white/10 hover:bg-white/20 text-white text-[11px] px-2 py-1 rounded-md border-none outline-none"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-black text-white">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          
          <span className="text-white/60 text-[10px]">→</span>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/60">To:</span>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="bg-white/10 hover:bg-white/20 text-white text-[11px] px-2 py-1 rounded-md border-none outline-none"
            >
              {languages.filter(lang => lang.code !== 'auto').map(lang => (
                <option key={lang.code} value={lang.code} className="bg-black text-white">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          
        </div>
        {/* Live raw subtitle feed (last 5 s) */}
        {rawFeed.length > 0 && (
          <div className="space-y-1 mb-3 max-h-20 overflow-hidden" ref={rawListRef}>
            {rawFeed.map(line => (
              <div key={line.id} className="text-white/70 text-xs truncate">
                {line.text}
              </div>
            ))}
          </div>
        )}
        
        {translationHistory.length === 0 ? (
          <div className="text-center py-4 text-white/50">
            <p>No translations yet</p>
            <p className="text-xs mt-1">Start monitoring regions to see translation history</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto" ref={historyListRef}>
            {translationHistory.map((item) => (
              <div key={item.id} className="bg-black/40 rounded p-3 border-l-2 border-green-500/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-white/60">
                    Region {item.regionId.substring(0, 8)} • {new Date(item.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-xs bg-white/10 rounded px-2 py-1">
                    {getLanguageDisplay(sourceLanguage)}→{getLanguageDisplay(targetLanguage)}
                  </div>
                </div>
                <div className="text-xs text-white/70 mb-2">
                  <span className="font-medium">Original:</span> {item.originalText}
                </div>
                <div className="text-sm text-green-300 font-medium">
                  {item.translation}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {translationHistory.length > 0 && (
          <div className="mt-3 flex justify-between items-center">
            <div className="text-xs text-white/50">
              {translationHistory.length} translation{translationHistory.length !== 1 ? 's' : ''}
            </div>
            <button
              onClick={() => setTranslationHistory([])}
              className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
            >
              Clear History
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-black/40 backdrop-blur-md rounded-lg p-4">
        <h3 className="text-sm font-medium text-white mb-2">How to Use:</h3>
        <ol className="text-xs text-white/70 space-y-1">
          <li>1. Click "Select Region" to choose an area on your screen</li>
          <li>2. Drag to select the subtitle area of your movie/video</li>
          <li>3. Toggle "Monitoring" to start real-time translation</li>
          <li>4. Translations appear as floating overlays AND in history above</li>
        </ol>
      </div>
    </div>
  )
}

export default Translation