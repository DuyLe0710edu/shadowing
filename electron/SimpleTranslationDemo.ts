// SimpleTranslationDemo.ts - Simple demo without M2M-100 for now
import { AreaSelectionHelper } from './AreaSelectionHelper'
import { LLMHelper } from './LLMHelper'
import { TranslationOverlayHelper } from './TranslationOverlayHelper'

export class SimpleTranslationDemo {
  private areaSelectionHelper: AreaSelectionHelper
  private llmHelper: LLMHelper
  private translationOverlayHelper: TranslationOverlayHelper
  private ocrWorker: any = null

  constructor() {
    this.areaSelectionHelper = new AreaSelectionHelper()
    this.translationOverlayHelper = new TranslationOverlayHelper()
    const apiKey = process.env.GEMINI_API_KEY || ''
    this.llmHelper = new LLMHelper(apiKey)
    this.initializeOCR()
    this.setupRegionEventHandlers()
  }

  private async initializeOCR() {
    try {
      console.log('Starting OCR worker initialization...')
      const { createWorker } = await import('tesseract.js')
      this.ocrWorker = await createWorker('eng+chi_sim+chi_tra')
      await this.ocrWorker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz一二三四五六七八九十百千万亿你我他她它们的是在有这那个了与和对于从到以及但是如果因为所以然后也还',
        tessedit_pageseg_mode: '6'
      })
      console.log('OCR worker initialized successfully')
    } catch (error) {
      console.error('Failed to initialize OCR:', error)
    }
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
    try {
      console.log(`Processing region change for ${region.id} with image: ${imagePath}`)
      
      if (!this.ocrWorker) {
        console.log('OCR worker not initialized, skipping text extraction')
        return
      }

      console.log(`Starting OCR recognition...`)
      
      const { data: { text } } = await this.ocrWorker.recognize(imagePath)
      const cleanText = text.trim()
      
      console.log(`OCR result: "${cleanText}" (length: ${cleanText.length})`)
      
      if (cleanText && cleanText.length > 3) {
        console.log(`Valid text extracted: "${cleanText}"`)
        
        const translation = await this.translateWithGemini(cleanText)
        console.log(`Translation result: "${translation}"`)
        
        // Show floating overlay near the region
        await this.translationOverlayHelper.createTranslationOverlay(
          region.id,
          region,
          cleanText,
          translation
        )

        this.notifyTranslationReady({
          regionId: region.id,
          originalText: cleanText,
          translation: translation,
          timestamp: Date.now()
        })
      } else {
        console.log(`Text too short or empty, skipping translation`)
      }
    } catch (error) {
      console.error('Error processing region change:', error)
    }
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

  public async translateWithGemini(text: string): Promise<string> {
    try {
      // Use existing Gemini integration for translation
      const problemInfo = {
        text: text,
        task: 'Translate this text to English. If it\'s Chinese, also provide Pinyin with tone marks.'
      }
      const result = await this.llmHelper.generateSolution(problemInfo)
      return result.solution?.code || 'Translation failed'
    } catch (error) {
      console.error('Translation error:', error)
      return 'Translation failed'
    }
  }

  public cleanup(): void {
    this.areaSelectionHelper.cleanup()
    this.translationOverlayHelper.closeAllOverlays()
    if (this.ocrWorker) {
      this.ocrWorker.terminate()
    }
  }
}