export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  quitApp: () => Promise<void>
  
  // Translation system
  startAreaSelection: () => Promise<void>
  getSelectedRegions: () => Promise<any[]>
  deleteRegion: (regionId: string) => Promise<boolean>
  toggleRegionMonitoring: (regionId: string) => Promise<boolean>
  onTranslationReady: (callback: (data: any) => void) => () => void
  onRegionAdded: (callback: (data: any) => void) => () => void
  onRegionChanged: (callback: (data: any) => void) => () => void
  onRegionDeleted?: (callback: (data: any) => void) => () => void
  
  // Language settings
  onLanguageSettingsRequest?: (callback: () => void) => () => void
  sendLanguageSettingsResponse?: (settings: { source: string, target: string }) => void
  getLanguageSettings?: () => Promise<{ source: string, target: string }>
  setLanguageSettings?: (settings: { source: string, target: string }) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 