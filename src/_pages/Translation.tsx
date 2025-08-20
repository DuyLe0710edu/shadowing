import React, { useState, useEffect, useRef } from "react"
import TTSHighlightedText from './TTSHighlightedText'
import SpeakerIcon from './SpeakerIcon'
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
  const [listenersVersion, setListenersVersion] = useState<number>(0)
  const [lastEventTs, setLastEventTs] = useState<number | null>(null)
  const [lastTranslationEventTs, setLastTranslationEventTs] = useState<number | null>(null)
  const [lastOcrEventTs, setLastOcrEventTs] = useState<number | null>(null)
  const suppressedCountRef = useRef<number>(0)
  const [ttsProgress, setTtsProgress] = useState<{ [id: string]: { start: number|null; end: number|null } }>({})
  const [activeTTSId, setActiveTTSId] = useState<string | null>(null)
  const [nowTs, setNowTs] = useState<number>(Date.now())
  const contentRef = useRef<HTMLDivElement>(null)
  const rawListRef = useRef<HTMLDivElement>(null)
  const historyListRef = useRef<HTMLDivElement>(null)

  // Keep track of last-seen OCR text per region to suppress duplicates
  const lastHistoryTextByRegionRef = useRef<Map<string, string>>(new Map())
  const lastRawTextByRegionRef = useRef<Map<string, string>>(new Map())

  // Normalize OCR text to make duplicate detection robust
  const normalizeOcrText = (text: string): string => {
    if (!text) return ''
    return text
      .normalize('NFKC')
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim()
      .toLowerCase()
  }

  // Heartbeat to evaluate live status dot
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const isLive = lastTranslationEventTs !== null && (nowTs - lastTranslationEventTs) < 5000
  
  // Collapsible panels (default collapsed to prioritize history)
  const [showSelectedRegionsPanel, setShowSelectedRegionsPanel] = useState<boolean>(false)
  const [showHowToUsePanel, setShowHowToUsePanel] = useState<boolean>(false)

  // Bind TTS events once
  useEffect(() => {
    const off1 = window.electronAPI.onTTSProgress?.((data) => {
      setTtsProgress(prev => ({ ...prev, [data.id]: { start: data.start, end: data.end } }))
    })
    const off2 = window.electronAPI.onTTSDone?.((data) => {
      setActiveTTSId(curr => (curr === data.id ? null : curr))
    })
    const off3 = window.electronAPI.onTTSError?.((_data) => {})
    return () => { off1?.(); off2?.(); off3?.() }
  }, [])

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
    // Load persisted translation history
    try {
      const raw = localStorage.getItem('translationHistory')
      if (raw) {
        const list = JSON.parse(raw)
        if (Array.isArray(list)) setTranslationHistory(list)
      }
    } catch {}
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
        setLastEventTs(Date.now())
        setLastTranslationEventTs(Date.now())
        
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
        
        // Time-window dedup: allow repeats after 8s
        setTranslationHistory(prev => {
          const normalized = normalizeOcrText(data.originalText)
          const lastSeen = lastHistoryTextByRegionRef.current.get(data.regionId)
          const allowRepeatAfterMs = 8000
          const lastItemForRegion = prev.find(p => p.regionId === data.regionId)
          const tooSoonRepeat = lastItemForRegion && lastItemForRegion.originalText &&
            normalizeOcrText(lastItemForRegion.originalText) === normalized &&
            (data.timestamp - lastItemForRegion.timestamp) < allowRepeatAfterMs
          if (tooSoonRepeat) {
            suppressedCountRef.current += 1
            return prev
          }
          lastHistoryTextByRegionRef.current.set(data.regionId, normalized)
          const next = [{
            id: `${data.regionId}_${data.timestamp}`,
            regionId: data.regionId,
            originalText: data.originalText,
            translation: data.translation,
            timestamp: data.timestamp
          }, ...prev].slice(0, 200)
          try { localStorage.setItem('translationHistory', JSON.stringify(next)) } catch {}
          return next
        })
        
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
        setLastEventTs(Date.now())
        setSelectedRegions(prev => {
          const idx = prev.findIndex(r => r.id === data.region.id)
          if (idx === -1) return prev
          const next = [...prev]
          next[idx] = { ...data.region }
          return next
        })
        setLastOcrEventTs(Date.now())
        // Update raw feed with duplicate suppression based on normalized text per region
        setRawFeed(prev => {
          const normalized = normalizeOcrText(data.region.lastText || '')
          const lastSeen = lastRawTextByRegionRef.current.get(data.region.id)
          if (lastSeen === normalized) return prev
          lastRawTextByRegionRef.current.set(data.region.id, normalized)
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
  }, [sourceLanguage, targetLanguage, listenersVersion]) // Allow manual rebind

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

          <button
            onClick={() => setView('notecards' as any)}
            className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
          >
            Notecard
          </button>
          
        </div>
      </div>

      {/* Selected Regions (collapsible) */}
      <div className="bg-black/60 backdrop-blur-md rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-md font-medium text-white">Selected Regions</h2>
          <button
            onClick={() => setShowSelectedRegionsPanel(v => !v)}
            className="text-white/70 text-[11px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md leading-none"
          >
            {showSelectedRegionsPanel ? 'Hide' : 'Show'}
          </button>
        </div>
        {showSelectedRegionsPanel && (selectedRegions.length === 0 ? (
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
        ))}
      </div>

      {/* Translation History */}
      <div className="bg-black/60 backdrop-blur-md rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-medium text-white">Translation History</h2>
            <span className={`inline-block w-2 h-2 rounded-full ${isLive ? 'bg-green-400' : 'bg-red-500'}`} title={isLive ? 'Live (translation events)' : 'Idle'}></span>
            <span className="text-[10px] text-red-400">{suppressedCountRef.current > 0 ? `dedup: ${suppressedCountRef.current}` : ''}</span>
            <span className="text-[10px] text-red-400">
              {lastOcrEventTs ? `ocr:${Math.max(0, Math.floor((nowTs - lastOcrEventTs)/1000))}s` : ''}
              {lastTranslationEventTs ? ` / trans:${Math.max(0, Math.floor((nowTs - lastTranslationEventTs)/1000))}s` : ''}
            </span>
          </div>
          <button
            onClick={() => setListenersVersion(v => v + 1)}
            className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
            title="Rebind event listeners"
          >
            Reload
          </button>
        </div>
        
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
          <div className="space-y-2 max-h-64 overflow-y-auto scroll-transparent" ref={historyListRef}>
            {translationHistory.map((item) => (
              <div key={item.id} className="relative bg-black/40 rounded p-3 border-l-2 border-green-500/30">
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
                  {activeTTSId === item.id ? (
                    <TTSHighlightedText text={item.translation} start={ttsProgress[item.id]?.start ?? null} end={ttsProgress[item.id]?.end ?? null} />
                  ) : (
                    <span>{item.translation}</span>
                  )}
                </div>
                <button
                  className={`absolute bottom-2 right-2 p-2 rounded-md transition-colors ${activeTTSId === item.id ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'} text-white/80`}
                  title="Speak translation"
                  onClick={() => {
                    if (activeTTSId && activeTTSId !== item.id) {
                      window.electronAPI.stopSpeech?.()
                    }
                    setActiveTTSId(item.id)
                    window.electronAPI.speakText?.({ id: item.id, text: item.translation, lang: targetLanguage, rate: 0.4 })
                  }}
                >
                  <SpeakerIcon className="w-4 h-4" />
                </button>
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
              onClick={() => { setTranslationHistory([]); lastHistoryTextByRegionRef.current.clear() }}
              className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none transition-colors"
            >
              Clear History
            </button>
          </div>
        )}
      </div>

      {/* Instructions (collapsible) */}
      <div className="bg-black/40 backdrop-blur-md rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">How to Use</h3>
          <button
            onClick={() => setShowHowToUsePanel(v => !v)}
            className="text-white/70 text-[11px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md leading-none"
          >
            {showHowToUsePanel ? 'Hide' : 'Show'}
          </button>
        </div>
        {showHowToUsePanel && (
          <ol className="mt-2 text-xs text-white/70 space-y-1">
            <li>1. Click "Select Region" to choose an area on your screen</li>
            <li>2. Drag to select the subtitle area of your movie/video</li>
            <li>3. Toggle "Monitoring" to start real-time translation</li>
            <li>4. Translations appear as floating overlays AND in history above</li>
          </ol>
        )}
      </div>
    </div>
  )
}

export default Translation