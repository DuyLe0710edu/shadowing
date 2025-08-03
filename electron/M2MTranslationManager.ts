// M2MTranslationManager.ts - Fast local translation using M2M-100
import { AreaSelectionHelper } from './AreaSelectionHelper'
import { TranslationOverlayHelper } from './TranslationOverlayHelper'
import { TranslationCache } from './TranslationCache'
import { OCRServiceManager } from './OCRServiceManager'
import path from 'node:path'

export interface TranslationRequest {
  id: string
  text: string
  sourceLang?: string
  targetLang?: string
  timestamp: number
}

export interface TranslationResult {
  id: string
  translatedText: string
  sourceLang: string
  targetLang: string
  confidence: number
  processingTime: number
  fromCache: boolean
}

export class M2MTranslationManager {
  private areaSelectionHelper: AreaSelectionHelper
  private translationOverlayHelper: TranslationOverlayHelper
  private translationCache: TranslationCache
  private translationWorker: Worker | null = null
  private isWorkerReady: boolean = false
  private pendingRequests: Map<string, { resolve: Function, reject: Function }> = new Map()
  private requestCounter: number = 0

  constructor(ocrServiceManager: OCRServiceManager) {
    this.areaSelectionHelper = new AreaSelectionHelper(ocrServiceManager)
    this.translationOverlayHelper = new TranslationOverlayHelper()
    this.translationCache = new TranslationCache()
    this.initializeTranslationWorker()
    this.setupRegionEventHandlers()
  }


  private initializeTranslationWorker() {
    try {
      console.log(`[WORKER] Initializing M2M translation worker...`)
      
      // Create the translation worker
      const workerPath = path.join(__dirname, '../src/workers/translationWorker.js')
      console.log(`[WORKER] Worker path: ${workerPath}`)
      
      this.translationWorker = new Worker(workerPath, { type: 'module' })
      console.log(`[WORKER] Worker created successfully`)
      
      // Handle messages from worker
      this.translationWorker.onmessage = (event) => {
        console.log(`[WORKER] Message received from worker:`, event.data)
        this.handleWorkerMessage(event.data)
      }
      
      // Handle worker errors
      this.translationWorker.onerror = (error) => {
        console.error(`[WORKER]  Worker error:`, error)
        this.isWorkerReady = false
      }
      
      console.log(`[WORKER] Sending initialization request...`)
      
      // Initialize the worker
      this.sendWorkerMessage('initialize', {})
        .then(() => {
          this.isWorkerReady = true
          console.log(`[WORKER]  Translation worker ready!`)
        })
        .catch((error) => {
          console.error(`[WORKER]  Failed to initialize translation worker:`, error)
          console.error(`   - This might be due to:`)
          console.error(`     1. Worker file not found`)
          console.error(`     2. @xenova/transformers not installed`)
          console.error(`     3. Model download failure`)
          console.error(`     4. Network connectivity issues`)
        })
        
    } catch (error) {
      console.error(`[WORKER]  Failed to create translation worker:`, error)
    }
  }

  private handleWorkerMessage(message: any) {
    const { id, type, result, error } = message
    
    const pendingRequest = this.pendingRequests.get(id)
    if (!pendingRequest) {
      console.warn('Received response for unknown request:', id)
      return
    }
    
    this.pendingRequests.delete(id)
    
    if (type === 'success') {
      pendingRequest.resolve(result)
    } else if (type === 'error') {
      pendingRequest.reject(new Error(error.message))
    }
  }

  private sendWorkerMessage(type: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.translationWorker) {
        reject(new Error('Translation worker not initialized'))
        return
      }
      
      const id = `req_${++this.requestCounter}_${Date.now()}`
      this.pendingRequests.set(id, { resolve, reject })
      
      this.translationWorker.postMessage({ id, type, data })
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Translation request timeout'))
        }
      }, 10000)
    })
  }

  private setupRegionEventHandlers() {
    const { ipcMain } = require('electron')
    
    console.log('Setting up region event handlers...')
    
    ipcMain.on('region-changed', async (event: any, data: { region: any, filepath: string }) => {
      console.log('Received region-changed event:', data)
      if (data.filepath) {
        await this.processRegionChange(data.region, data.filepath)
      }
    })
  }

  private async processRegionChange(region: any, imagePath: string) {
    const debugId = `${region.id.substring(0, 8)}_${Date.now()}`
    
    try {
      console.log(`==================== TRANSLATION PIPELINE START [${debugId}] ====================`)
      console.log(`Region ID: ${region.id}`)
      console.log(`Region active: ${region.isActive}`)
      console.log(`Region position: ${region.x}, ${region.y} (${region.width}x${region.height})`)
      console.log(`Region last text: "${region.lastText || 'none'}"`)
      
      // Get the text that was already extracted by AreaSelectionHelper
      const cleanText = region.lastText?.trim() || ''
      console.log(`Using pre-extracted text: "${cleanText}" (length: ${cleanText.length})`)
      
      if (cleanText && cleanText.length > 2) {
        console.log(`Valid text available, proceeding with translation`)
        
        // Check cache first
        const cachedResult = this.translationCache.get(cleanText)
        if (cachedResult) {
          console.log('Using cached translation:', cachedResult.translatedText)
          await this.displayTranslation(region, cleanText, cachedResult.translatedText, true)
          console.log(`==================== PIPELINE COMPLETE (CACHED) [${debugId}] ====================`)
          return
        }
        
        console.log(`Starting M2M-100 translation...`)
        
        // Translate using M2M-100 worker
        const translationStartTime = Date.now()
        const translation = await this.translateWithM2M(cleanText)
        const translationEndTime = Date.now()
        const translationTime = translationEndTime - translationStartTime
        
        console.log(`Translation completed!`)
        console.log(`   - Original: "${cleanText}"`)
        console.log(`   - Translated: "${translation.translatedText}"`)
        console.log(`   - Source lang: ${translation.sourceLang}`)
        console.log(`   - Target lang: ${translation.targetLang}`)
        console.log(`   - Confidence: ${translation.confidence}`)
        console.log(`   - Translation time: ${translationTime}ms`)
        
        // Cache the result
        this.translationCache.set(cleanText, translation)
        console.log(`Translation cached`)
        
        // Display translation
        console.log(`Displaying translation overlay and UI notification`)
        await this.displayTranslation(region, cleanText, translation.translatedText, false)
        
        console.log(`==================== PIPELINE COMPLETE (SUCCESS) [${debugId}] ====================`)
        
      } else {
        console.log(`Text too short or empty, skipping translation`)
        console.log(`   - Text length: ${cleanText.length}`)
        console.log(`   - Minimum required: 3 characters`)
        console.log(`==================== PIPELINE COMPLETE (SKIPPED) [${debugId}] ====================`)
      }
    } catch (error) {
      console.error(`ERROR in translation pipeline [${debugId}]:`, error)
      console.error(`   - Error message: ${error.message}`)
      console.error(`   - Error stack:`, error.stack)
      console.log(`==================== PIPELINE FAILED [${debugId}] ====================`)
    }
  }

  private async translateWithM2M(text: string, sourceLang: string = 'auto', targetLang: string = 'en'): Promise<TranslationResult> {
    console.log(`[M2M] Starting translation...`)
    console.log(`   - Text: "${text}"`)
    console.log(`   - Source: ${sourceLang}`)
    console.log(`   - Target: ${targetLang}`)
    console.log(`   - Worker ready: ${this.isWorkerReady}`)
    
    if (!this.isWorkerReady) {
      console.error(`[M2M]  Translation worker not ready`)
      throw new Error('Translation worker not ready')
    }

    try {
      console.log(`[M2M] Sending translation request to worker...`)
      const result = await this.sendWorkerMessage('translateWithPinyin', {
        text,
        sourceLang,
        targetLang
      })
      
      console.log(`[M2M]  Worker response received:`, result)
      
      return {
        id: `trans_${Date.now()}`,
        translatedText: result.translatedText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        confidence: result.confidence,
        processingTime: result.processingTime,
        fromCache: false
      }
      
    } catch (error) {
      console.error(`[M2M]  Translation error:`, error)
      throw error
    }
  }

  private async displayTranslation(region: any, originalText: string, translation: string, fromCache: boolean) {
    // Show floating overlay near the region
    await this.translationOverlayHelper.createTranslationOverlay(
      region.id,
      region,
      originalText,
      translation
    )

    // Notify the UI
    this.notifyTranslationReady({
      regionId: region.id,
      originalText: originalText,
      translation: translation,
      timestamp: Date.now(),
      fromCache: fromCache
    })
  }

  private notifyTranslationReady(translationData: any) {
    const { BrowserWindow } = require('electron')
    const allWindows = BrowserWindow.getAllWindows()
    const mainWindow = allWindows.find((window: any) => 
      !window.isDestroyed() && window.webContents.getURL().includes("index.html")
    )
    
    if (mainWindow) {
      mainWindow.webContents.send('translation-ready', translationData)
    }
  }

  // Public API methods
  public async startAreaSelection(): Promise<void> {
    await this.areaSelectionHelper.startAreaSelection()
  }

  public getSelectedRegions() {
    return this.areaSelectionHelper.getSelectedRegions()
  }

  public async deleteRegion(regionId: string): Promise<boolean> {
    return this.areaSelectionHelper.deleteRegion(regionId)
  }

  public async toggleRegionMonitoring(regionId: string): Promise<boolean> {
    return this.areaSelectionHelper.toggleRegionMonitoring(regionId)
  }

  public async translateText(text: string, sourceLang?: string, targetLang?: string): Promise<TranslationResult> {
    return this.translateWithM2M(text, sourceLang, targetLang)
  }

  public getCacheStats() {
    return this.translationCache.getStats()
  }

  public clearCache() {
    this.translationCache.clear()
  }

  public cleanup(): void {
    this.areaSelectionHelper.cleanup()
    this.translationOverlayHelper.closeAllOverlays()
    this.translationCache.clear()
    
    
    if (this.translationWorker) {
      this.translationWorker.terminate()
    }
    
    // Clear pending requests
    this.pendingRequests.clear()
  }
}