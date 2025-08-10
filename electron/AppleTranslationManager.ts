// AppleTranslationManager.ts - Native Apple Translation with fallback
import path from 'node:path'
import { app } from 'electron'
import fs from 'node:fs'
import { TranslationResult, TranslationRequest } from './TranslationManager'

export interface AppleTranslationRequest {
  text: string
  source: string
  target: string
}

export interface AppleTranslationResponse {
  translatedText: string
  detectedSource?: string
  confidence: number
  processingTime: number
}

export class AppleTranslationManager {
  private nativeBinaryPath: string | null = null
  private isReady: boolean = false
  
  constructor() {
    this.initializeAppleTranslation()
  }
  
  private async initializeAppleTranslation(): Promise<void> {
    try {
      console.log('[APPLE] Initializing Apple Translation service...')
      
      // Only attempt on macOS
      if (process.platform !== 'darwin') {
        console.log('[APPLE] Not macOS, skipping Apple Translation initialization')
        return
      }
      
      // Import execa (CommonJS module)
      const execa = require('execa')
      
      // Try to find the Apple Translation binary
      const appPath = app.getAppPath()
      const developmentPath = path.join(appPath, 'resources', 'native', 'AppleTranslateBridge')
      const productionPath = path.join(process.resourcesPath, 'native', 'AppleTranslateBridge')
      
      // Check which path exists
      if (fs.existsSync(developmentPath)) {
        this.nativeBinaryPath = developmentPath
      } else if (fs.existsSync(productionPath)) {
        this.nativeBinaryPath = productionPath
      } else {
        console.log('[APPLE] Apple Translation binary not found in expected locations')
        return
      }
      
      console.log(`[APPLE] Found Apple Translation binary at: ${this.nativeBinaryPath}`)
      
      // Test if the binary works by sending a test request
      const testRequest = {
        text: "Hello",
        source: "en",
        target: "es"
      }
      
      const result = await execa(this.nativeBinaryPath, {
        input: JSON.stringify(testRequest),
        timeout: 5000,
        reject: false
      })
      
      if (result.exitCode !== 0) {
        const response = JSON.parse(result.stdout)
        if (response.code === 'NOT_IMPLEMENTED') {
          console.log('[APPLE] Apple Translation not yet implemented, will use M2M fallback')
          return
        } else {
          console.log(`[APPLE] Apple Translation test failed: ${response.error}`)
          return
        }
      }
      
      console.log('[APPLE] Apple Translation initialized successfully')
      this.isReady = true
      
    } catch (error) {
      console.warn('[APPLE] Failed to initialize Apple Translation:', error.message)
      console.log('[APPLE] Will fall back to M2M translation')
    }
  }
  
  public async translateWithApple(text: string, sourceLang: string = 'auto', targetLang: string = 'en'): Promise<TranslationResult> {
    if (!this.isReady || !this.nativeBinaryPath) {
      throw new Error('Apple Translation service not ready')
    }
    
    try {
      const execa = require('execa')
      const request: AppleTranslationRequest = {
        text,
        source: sourceLang,
        target: targetLang
      }
      
      console.log(`[APPLE] Starting translation...`)
      console.log(`   - Text: "${text}"`)
      console.log(`   - Source: ${sourceLang}`)
      console.log(`   - Target: ${targetLang}`)
      
      const translationStartTime = Date.now()
      const result = await execa(this.nativeBinaryPath, {
        input: JSON.stringify(request),
        timeout: 10000,
        encoding: 'utf8'
      })
      
      if (result.exitCode !== 0) {
        throw new Error(`Apple Translation failed with exit code ${result.exitCode}: ${result.stderr}`)
      }
      
      // Parse JSON response
      const response: AppleTranslationResponse = JSON.parse(result.stdout)
      const translationEndTime = Date.now()
      const totalTime = translationEndTime - translationStartTime
      
      console.log(`[APPLE] Translation completed in ${totalTime}ms`)
      console.log(`   - Original: "${text}"`)
      console.log(`   - Translated: "${response.translatedText}"`)
      console.log(`   - Detected source: ${response.detectedSource || 'auto'}`)
      console.log(`   - Confidence: ${response.confidence}`)
      
      return {
        id: `apple_trans_${Date.now()}`,
        translatedText: response.translatedText,
        sourceLang: response.detectedSource || sourceLang,
        targetLang: targetLang,
        confidence: response.confidence,
        processingTime: totalTime,
        fromCache: false
      }
      
    } catch (error) {
      console.error('[APPLE] Translation error:', error.message)
      throw new Error(`Apple Translation failed: ${error.message}`)
    }
  }
  
  public isAppleTranslationReady(): boolean {
    return this.isReady && process.platform === 'darwin'
  }
  
  public cleanup(): void {
    console.log('[APPLE] Cleaning up Apple Translation service...')
    this.isReady = false
    this.nativeBinaryPath = null
  }
}