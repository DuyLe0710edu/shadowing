// translationWorker.js - M2M-100 Translation Web Worker
import { pipeline } from '@xenova/transformers';

class TranslationWorker {
  constructor() {
    this.translator = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._loadModel();
    return this.initializationPromise;
  }

  async _loadModel() {
    try {
      console.log('Loading M2M-100 model...');
      
      // Load the M2M-100 418M model (smaller, faster)
      this.translator = await pipeline('translation', 'facebook/m2m100_418M', {
        quantized: true, // Use quantized model for better performance
        cache_dir: './.cache/transformers'
      });
      
      this.isInitialized = true;
      console.log('M2M-100 model loaded successfully');
      
      // Warm up the model with a dummy translation
      await this.translator('Hello world', {
        src_lang: 'en',
        tgt_lang: 'zh'
      });
      
      console.log('Model warmed up and ready');
      return true;
    } catch (error) {
      console.error('Failed to load M2M-100 model:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async translate(text, sourceLang = 'auto', targetLang = 'en') {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Language detection if auto
      let detectedSourceLang = sourceLang;
      if (sourceLang === 'auto') {
        detectedSourceLang = this.detectLanguage(text);
      }

      // Skip translation if source and target are the same
      if (detectedSourceLang === targetLang) {
        return {
          translatedText: text,
          sourceLang: detectedSourceLang,
          targetLang: targetLang,
          confidence: 1.0
        };
      }

      const startTime = performance.now();
      
      const result = await this.translator(text, {
        src_lang: detectedSourceLang,
        tgt_lang: targetLang
      });

      const endTime = performance.now();
      const translationTime = Math.round(endTime - startTime);

      console.log(`Translation completed in ${translationTime}ms`);

      return {
        translatedText: result[0].translation_text,
        sourceLang: detectedSourceLang,
        targetLang: targetLang,
        confidence: result[0].score || 0.9,
        processingTime: translationTime
      };

    } catch (error) {
      console.error('Translation error:', error);
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  detectLanguage(text) {
    // Simple language detection based on character patterns
    // This is a lightweight approach for common subtitle languages
    
    // Chinese characters (CJK Unified Ideographs)
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'zh';
    }
    
    // Japanese (Hiragana, Katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ja';
    }
    
    // Korean (Hangul)
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    }
    
    // Spanish indicators
    if (/[ñáéíóúü¿¡]/.test(text.toLowerCase())) {
      return 'es';
    }
    
    // French indicators
    if (/[àâäéèêëïîôùûüÿç]/.test(text.toLowerCase())) {
      return 'fr';
    }
    
    // German indicators  
    if (/[äöüß]/.test(text.toLowerCase())) {
      return 'de';
    }
    
    // Default to English for Latin script
    return 'en';
  }

  // Support for Pinyin generation for Chinese text
  async translateWithPinyin(text, targetLang = 'en') {
    const result = await this.translate(text, 'auto', targetLang);
    
    // If source was Chinese, add Pinyin (placeholder for now)
    if (result.sourceLang === 'zh') {
      result.pinyin = this.generatePinyin(text);
    }
    
    return result;
  }

  generatePinyin(chineseText) {
    // Placeholder for Pinyin generation
    // In a full implementation, you'd use a library like pinyin-pro
    return `[Pinyin for: ${chineseText}]`;
  }
}

// Initialize worker instance
const worker = new TranslationWorker();

// Handle messages from main thread
self.onmessage = async function(e) {
  const { id, type, data } = e.data;
  
  try {
    let result;
    
    switch (type) {
      case 'initialize':
        result = await worker.initialize();
        break;
        
      case 'translate':
        const { text, sourceLang, targetLang } = data;
        result = await worker.translate(text, sourceLang, targetLang);
        break;
        
      case 'translateWithPinyin':
        const { text: pinyinText, targetLang: pinyinTarget } = data;
        result = await worker.translateWithPinyin(pinyinText, pinyinTarget);
        break;
        
      case 'detectLanguage':
        result = worker.detectLanguage(data.text);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    // Send success response
    self.postMessage({
      id,
      type: 'success',
      result
    });
    
  } catch (error) {
    console.error('Worker error:', error);
    
    // Send error response
    self.postMessage({
      id,
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};

// Handle worker initialization
console.log('Translation worker initialized and ready');