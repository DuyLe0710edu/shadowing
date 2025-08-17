import { contextBridge, ipcRenderer } from "electron"

// Pending event buffers to avoid losing early IPC before renderer subscribes
const pendingTranslationReady: any[] = []
const pendingRegionChanged: any[] = []
let translationReadyHandler: ((data: any) => void) | null = null
let regionChangedHandler: ((data: any) => void) | null = null

// Early listeners fill buffers; real callbacks get set via exposed API below
ipcRenderer.on("translation-ready", (_: any, data: any) => {
  if (translationReadyHandler) translationReadyHandler(data)
  else pendingTranslationReady.push(data)
})
ipcRenderer.on("region-changed", (_: any, data: any) => {
  if (regionChangedHandler) regionChangedHandler(data)
  else pendingRegionChanged.push(data)
})

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
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
  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
  
  // Translation system
  startAreaSelection: () => Promise<void>
  getSelectedRegions: () => Promise<any[]>
  deleteRegion: (regionId: string) => Promise<boolean>
  toggleRegionMonitoring: (regionId: string) => Promise<boolean>
  onTranslationReady: (callback: (data: any) => void) => () => void
  onRegionAdded: (callback: (data: any) => void) => () => void
  onRegionChanged: (callback: (data: any) => void) => () => void
  
  // Language settings
  onLanguageSettingsRequest?: (callback: () => void) => () => void
  sendLanguageSettingsResponse?: (settings: { source: string, target: string }) => void
  getLanguageSettings?: () => Promise<{ source: string, target: string }>
  setLanguageSettings?: (settings: { source: string, target: string }) => Promise<boolean>
}

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  analyzeAudioFromBase64: (data: string, mimeType: string) => ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
  analyzeAudioFile: (path: string) => ipcRenderer.invoke("analyze-audio-file", path),
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  quitApp: () => ipcRenderer.invoke("quit-app"),

  // Translation system
  startAreaSelection: () => ipcRenderer.invoke("start-area-selection"),
  getSelectedRegions: () => ipcRenderer.invoke("get-selected-regions"),
  deleteRegion: (regionId: string) => ipcRenderer.invoke("delete-region", regionId),
  toggleRegionMonitoring: (regionId: string) => ipcRenderer.invoke("toggle-region-monitoring", regionId),
  
  // Translation events (buffer + flush once subscribed)
  onTranslationReady: (callback: (data: any) => void) => {
    translationReadyHandler = callback
    // flush any pending
    if (pendingTranslationReady.length) {
      const copy = pendingTranslationReady.splice(0)
      copy.forEach((d) => callback(d))
    }
    // return an unsubscribe that clears handler
    return () => { translationReadyHandler = null }
  },
  onRegionAdded: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("region-added", subscription)
    return () => {
      ipcRenderer.removeListener("region-added", subscription)
    }
  },
  onRegionChanged: (callback: (data: any) => void) => {
    regionChangedHandler = callback
    if (pendingRegionChanged.length) {
      const copy = pendingRegionChanged.splice(0)
      copy.forEach((d) => callback(d))
    }
    return () => { regionChangedHandler = null }
  },
  // Expose optional region-deleted listener used by UI cleanup
  onRegionDeleted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('region-deleted', subscription)
    return () => {
      ipcRenderer.removeListener('region-deleted', subscription)
    }
  },
  
  // Language settings
  onLanguageSettingsRequest: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("get-language-settings-request", subscription)
    return () => {
      ipcRenderer.removeListener("get-language-settings-request", subscription)
    }
  },
  sendLanguageSettingsResponse: (settings: { source: string, target: string }) => {
    ipcRenderer.send("language-settings-response", settings)
  },
  getLanguageSettings: () => ipcRenderer.invoke("get-language-settings"),
  setLanguageSettings: (settings: { source: string, target: string }) => ipcRenderer.invoke("set-language-settings", settings)
} as ElectronAPI)
