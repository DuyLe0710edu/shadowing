import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"

interface TranslationProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "translation">>
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
  const [translationHistory, setTranslationHistory] = useState<Array<{
    id: string
    regionId: string
    originalText: string
    translation: string
    timestamp: number
  }>>([])
  const contentRef = useRef<HTMLDivElement>(null)

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

  // Load selected regions on component mount
  useEffect(() => {
    const loadRegions = async () => {
      try {
        const regions = await window.electronAPI.getSelectedRegions()
        setSelectedRegions(regions)
      } catch (error) {
        console.error("Failed to load regions:", error)
      }
    }
    loadRegions()
  }, [])

  // Listen for region changes and translation updates
  useEffect(() => {
    const cleanupFunctions = [
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
        
        // Notification removed as requested
      }),
      
      // Listen for new regions being added
      window.electronAPI.onRegionAdded((data: { region: SelectedRegion }) => {
        setSelectedRegions(prev => [...prev, data.region])
      }),
      
      // Listen for region changes (new text detected)
      window.electronAPI.onRegionChanged((data: { region: SelectedRegion, translation: string }) => {
        setSelectedRegions(prev => 
          prev.map(region => 
            region.id === data.region.id ? data.region : region
          )
        )
        setTranslations(prev => new Map(prev.set(data.region.id, data.translation)))
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
        <div className="flex items-center gap-3">
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
          
          <div className="text-[10px] text-white/50 ml-2">
            Select screen area for subtitle monitoring
          </div>
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
                  <div className="bg-black/60 rounded p-2 mb-2">
                    <div className="text-xs text-white/60 mb-1">Original Text:</div>
                    <div className="text-sm text-white">{region.lastText}</div>
                  </div>
                )}
                
                {translations.has(region.id) && (
                  <div className="bg-blue-900/30 rounded p-2">
                    <div className="text-xs text-blue-300 mb-1">Translation:</div>
                    <div className="text-sm text-blue-100">{translations.get(region.id)}</div>
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
        
        {translationHistory.length === 0 ? (
          <div className="text-center py-4 text-white/50">
            <p>No translations yet</p>
            <p className="text-xs mt-1">Start monitoring regions to see translation history</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {translationHistory.map((item) => (
              <div key={item.id} className="bg-black/40 rounded p-3 border-l-2 border-green-500/30">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-white/60">
                    Region {item.regionId.substring(0, 8)} • {new Date(item.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div className="text-xs text-white/70 mb-1">
                  <span className="font-medium">Original:</span> {item.originalText}
                </div>
                <div className="text-xs text-green-300">
                  <span className="font-medium">Translation:</span> {item.translation}
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