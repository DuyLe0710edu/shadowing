// ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState } from "./main"
import fs from "node:fs"
import path from "node:path"

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Translation system handlers
  ipcMain.handle("start-area-selection", async () => {
    return await appState.startAreaSelection()
  })

  ipcMain.handle("get-selected-regions", async () => {
    return appState.getTranslationManager().getSelectedRegions()
  })

  ipcMain.handle("delete-region", async (event, regionId: string) => {
    return await appState.getTranslationManager().deleteRegion(regionId)
  })

  ipcMain.handle("toggle-region-monitoring", async (event, regionId: string) => {
    return await appState.getTranslationManager().toggleRegionMonitoring(regionId)
  })

  // Language settings handlers
  const getSettingsFilePath = () => path.join(app.getPath("userData"), "settings.json")
  
  const loadPersistedSettings = (): { source: string, target: string } => {
    try {
      const settingsFile = getSettingsFilePath()
      if (fs.existsSync(settingsFile)) {
        const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
        console.log('[SETTINGS] Loaded persisted language settings:', settings)
        return settings
      }
    } catch (error) {
      console.warn('[SETTINGS] Failed to load persisted settings:', error.message)
    }
    return { source: 'auto', target: 'en' }
  }
  
  const saveSettings = (settings: { source: string, target: string }) => {
    try {
      const settingsFile = getSettingsFilePath()
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8')
      console.log('[SETTINGS] Saved language settings:', settings)
    } catch (error) {
      console.warn('[SETTINGS] Failed to save settings:', error.message)
    }
  }
  
  let currentLanguageSettings = loadPersistedSettings()
  
  ipcMain.handle("set-language-settings", async (event, settings: { source: string, target: string }) => {
    currentLanguageSettings = settings
    saveSettings(settings) // Persist to disk
    console.log('Language settings updated:', settings)
    return true
  })

  ipcMain.handle("get-language-settings", async () => {
    return currentLanguageSettings
  })

  // Language settings communication handlers for TranslationManager
  ipcMain.on("language-settings-response", (event, settings: { source: string, target: string }) => {
    // Update stored settings when received from renderer
    currentLanguageSettings = settings
    saveSettings(settings) // Persist to disk
    console.log('Language settings received from renderer:', settings)
  })
}
