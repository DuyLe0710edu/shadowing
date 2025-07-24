"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastTranslationHelper = void 0;
// FastTranslationHelper.ts - M2M-100 Real-Time Translation System
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const tesseract_js_1 = require("tesseract.js");
const TransformersWrapper_1 = require("./TransformersWrapper");
class FastTranslationHelper {
    m2m100Translator = null;
    marianTranslators = new Map();
    ocrWorker = null;
    translationCache = new Map();
    isInitialized = false;
    modelsDir;
    // Performance tracking
    performanceStats = {
        totalTranslations: 0,
        cacheHits: 0,
        avgLatency: 0,
        modelLoadTime: 0
    };
    // M2M-100 supported languages (optimized for common subtitle languages)
    supportedLanguages = new Map([
        ['zh', 'zh'], // Chinese
        ['en', 'en'], // English
        ['ja', 'ja'], // Japanese
        ['ko', 'ko'], // Korean
        ['es', 'es'], // Spanish
        ['fr', 'fr'], // French
        ['de', 'de'], // German
        ['it', 'it'], // Italian
        ['pt', 'pt'], // Portuguese
        ['ru', 'ru'], // Russian
        ['ar', 'ar'], // Arabic
        ['hi', 'hi'], // Hindi
        ['th', 'th'], // Thai
        ['vi', 'vi'], // Vietnamese
    ]);
    // Subtitle detection patterns
    subtitlePatterns = {
        dialogue: [
            /^[A-Z][a-z].*[.!?]$/, // Capitalized sentence
            /^["'].*["']$/, // Quoted text
            /^-\s*[A-Z].*$/, // Dash dialogue
            /^[A-Z\s]+:\s*.*$/, // Character name: dialogue
        ],
        narrator: [
            /^\([^)]+\)$/, // (Narrator text)
            /^\[[^\]]+\]$/, // [Action description]
            /^[A-Z\s]+:$/, // Scene description
        ],
        action: [
            /^\*[^*]+\*$/, // *Action*
            /^<[^>]+>$/, // <Sound effect>
            /^\([^)]*sounds?[^)]*\)$/i, // (Sound descriptions)
        ],
        song: [
            /^♪.*♪$/, // Musical notes (keeping these as they're subtitle content)
            /^♫.*♫$/, // Musical notes alternative
            /^~.*~$/, // Tilde wrapped
        ]
    };
    constructor() {
        this.modelsDir = node_path_1.default.join(electron_1.app.getPath("userData"), "ml_models");
        if (!node_fs_1.default.existsSync(this.modelsDir)) {
            node_fs_1.default.mkdirSync(this.modelsDir, { recursive: true });
        }
    }
    async initialize() {
        if (this.isInitialized)
            return;
        const startTime = Date.now();
        console.log("Initializing Fast Translation System...");
        try {
            // Initialize OCR with optimized settings for subtitles
            await this.initializeOCR();
            // Load M2M-100 model (418M version for speed)
            await this.loadM2M100Model();
            // Pre-load common language pairs
            await this.preloadMarianModels(['zh-en', 'ja-en', 'ko-en']);
            this.performanceStats.modelLoadTime = Date.now() - startTime;
            this.isInitialized = true;
            console.log(`Fast Translation System initialized in ${this.performanceStats.modelLoadTime}ms`);
        }
        catch (error) {
            console.error("Failed to initialize Fast Translation System:", error);
            throw error;
        }
    }
    async initializeOCR() {
        try {
            // Optimized OCR settings for subtitle recognition
            this.ocrWorker = await (0, tesseract_js_1.createWorker)('eng+chi_sim+chi_tra+jpn+kor', 1, {
                logger: () => { } // Disable verbose logging for performance
            });
            // Optimize for subtitle text patterns with correct parameter names
            await this.ocrWorker.setParameters({
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?;:()[]{}，。！？；：（）【】《》、-',
                tessedit_pageseg_mode: 6, // PSM_SINGLE_BLOCK 
                preserve_interword_spaces: '1'
            });
            console.log("OCR optimized for subtitle recognition");
        }
        catch (error) {
            console.error("OCR initialization failed:", error);
            throw error;
        }
    }
    async loadM2M100Model() {
        try {
            console.log("Loading M2M-100 model (418M)...");
            // Use the smaller, faster M2M-100 model
            this.m2m100Translator = await TransformersWrapper_1.TransformersWrapper.pipeline('translation', 'facebook/m2m100_418M', {
                cache_dir: this.modelsDir,
                local_files_only: false,
                quantized: true // Enable quantization for 4x speed boost
            });
            console.log("M2M-100 model loaded successfully");
        }
        catch (error) {
            console.error("M2M-100 model loading failed:", error);
            throw error;
        }
    }
    async preloadMarianModels(languagePairs) {
        const marianModels = {
            'zh-en': 'Xenova/opus-mt-zh-en',
            'ja-en': 'Xenova/opus-mt-ja-en',
            'ko-en': 'Xenova/opus-mt-ko-en',
            'en-zh': 'Xenova/opus-mt-en-zh'
        };
        for (const pair of languagePairs) {
            try {
                const modelName = marianModels[pair];
                if (modelName) {
                    console.log(`Loading MarianMT model: ${pair}`);
                    const translator = await TransformersWrapper_1.TransformersWrapper.pipeline('translation', modelName, {
                        cache_dir: this.modelsDir,
                        quantized: true
                    });
                    this.marianTranslators.set(pair, translator);
                    console.log(`MarianMT ${pair} loaded`);
                }
            }
            catch (error) {
                console.log(`Failed to load MarianMT ${pair}, will use M2M-100 fallback`);
            }
        }
    }
    async extractAndTranslateFromImage(imagePath, targetLanguage = 'en', sourceLanguage) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        try {
            // Step 1: Fast OCR extraction (50-100ms)
            const ocrResult = await this.extractTextFromImage(imagePath);
            if (!ocrResult.text || ocrResult.text.trim().length === 0) {
                return null;
            }
            // Step 2: Subtitle pattern detection (5ms)
            const subtitleInfo = this.detectSubtitlePattern(ocrResult.text);
            // Step 3: Language detection if not provided
            const detectedLang = sourceLanguage || await this.detectLanguage(ocrResult.text);
            // Step 4: Fast translation
            const translation = await this.translateText(ocrResult.text, detectedLang, targetLanguage);
            const totalLatency = Date.now() - startTime;
            return {
                ...translation,
                isSubtitle: subtitleInfo.isSubtitle,
                latency: totalLatency
            };
        }
        catch (error) {
            console.error("Extract and translate failed:", error);
            return null;
        }
    }
    async extractTextFromImage(imagePath) {
        if (!this.ocrWorker) {
            throw new Error("OCR worker not initialized");
        }
        try {
            if (!node_fs_1.default.existsSync(imagePath)) {
                throw new Error(`Image file not found: ${imagePath}`);
            }
            const { data: { text, confidence } } = await this.ocrWorker.recognize(imagePath);
            // Clean and optimize text for subtitle processing
            const cleanedText = this.cleanSubtitleText(text);
            return {
                text: cleanedText,
                confidence: confidence / 100
            };
        }
        catch (error) {
            console.error("OCR extraction failed:", error);
            return { text: "", confidence: 0 };
        }
    }
    cleanSubtitleText(text) {
        return text
            .replace(/\n+/g, ' ') // Replace newlines with spaces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af.,!?;:'"()[\]{}，。！？；：""''（）【】《》、-]/g, '') // Keep only text, CJK, and common punctuation
            .trim();
    }
    detectSubtitlePattern(text) {
        for (const [type, patterns] of Object.entries(this.subtitlePatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(text)) {
                    return {
                        isSubtitle: true,
                        subtitleType: type,
                        confidence: 0.9
                    };
                }
            }
        }
        // Fallback: check if it looks like subtitle text
        const hasSubtitleCharacteristics = text.length > 5 && text.length < 200 && // Reasonable subtitle length
            /[.!?]$/.test(text) && // Ends with punctuation
            !/^https?:\/\//.test(text) && // Not a URL
            !/^\d+[\d\s:,.-]*$/.test(text); // Not just numbers/time
        return {
            isSubtitle: hasSubtitleCharacteristics,
            subtitleType: 'unknown',
            confidence: hasSubtitleCharacteristics ? 0.6 : 0.1
        };
    }
    async detectLanguage(text) {
        // Simple language detection based on character patterns
        if (/[\u4e00-\u9fff]/.test(text))
            return 'zh'; // Chinese characters
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text))
            return 'ja'; // Japanese kana
        if (/[\uac00-\ud7af]/.test(text))
            return 'ko'; // Korean hangul
        if (/[\u0600-\u06ff]/.test(text))
            return 'ar'; // Arabic
        if (/[\u0900-\u097f]/.test(text))
            return 'hi'; // Hindi
        if (/[\u0e00-\u0e7f]/.test(text))
            return 'th'; // Thai
        return 'en'; // Default to English
    }
    async translateText(text, sourceLanguage, targetLanguage) {
        const startTime = Date.now();
        // Check cache first (1ms lookup)
        const cacheKey = `${text}|${sourceLanguage}|${targetLanguage}`;
        const cached = this.translationCache.get(cacheKey);
        if (cached) {
            cached.accessCount++;
            cached.lastAccessed = Date.now();
            this.performanceStats.cacheHits++;
            return {
                ...cached.result,
                latency: Date.now() - startTime,
                provider: 'cache'
            };
        }
        try {
            // Try MarianMT first for supported language pairs (fastest)
            const marianPair = `${sourceLanguage}-${targetLanguage}`;
            const marianTranslator = this.marianTranslators.get(marianPair);
            if (marianTranslator) {
                const result = await marianTranslator(text, {
                    max_length: 200,
                    num_beams: 2, // Faster inference
                    early_stopping: true
                });
                const translationResult = this.createTranslationResult(text, result[0].translation_text, sourceLanguage, targetLanguage, 'marian', result[0].score || 0.8, Date.now() - startTime);
                this.cacheTranslation(cacheKey, translationResult);
                return translationResult;
            }
            // Fallback to M2M-100 for any language pair
            if (this.m2m100Translator) {
                const result = await this.m2m100Translator(text, {
                    src_lang: this.supportedLanguages.get(sourceLanguage) || sourceLanguage,
                    tgt_lang: this.supportedLanguages.get(targetLanguage) || targetLanguage,
                    max_length: 200,
                    num_beams: 2,
                    early_stopping: true
                });
                const translationResult = this.createTranslationResult(text, result[0].translation_text, sourceLanguage, targetLanguage, 'm2m100', result[0].score || 0.7, Date.now() - startTime);
                this.cacheTranslation(cacheKey, translationResult);
                return translationResult;
            }
            throw new Error("No translation models available");
        }
        catch (error) {
            console.error("Translation failed:", error);
            // Return original text as fallback
            return this.createTranslationResult(text, text, sourceLanguage, targetLanguage, 'cache', 0.1, Date.now() - startTime);
        }
    }
    createTranslationResult(originalText, translatedText, sourceLanguage, targetLanguage, provider, confidence, latency) {
        this.performanceStats.totalTranslations++;
        this.performanceStats.avgLatency =
            (this.performanceStats.avgLatency + latency) / this.performanceStats.totalTranslations;
        return {
            originalText,
            translatedText,
            confidence,
            latency,
            provider,
            detectedLanguage: sourceLanguage,
            isSubtitle: true, // Will be updated by caller
            timestamp: Date.now(),
            // Note: Pinyin generation would need separate implementation
            // for Chinese text, could be added as post-processing step
        };
    }
    cacheTranslation(key, result) {
        // Implement LRU cache with size limit
        const MAX_CACHE_SIZE = 2000; // Increased for subtitle frequency
        if (this.translationCache.size >= MAX_CACHE_SIZE) {
            // Remove least recently accessed items
            const sortedEntries = Array.from(this.translationCache.entries())
                .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
            // Remove oldest 20% of entries
            const toRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.translationCache.delete(sortedEntries[i][0]);
            }
        }
        this.translationCache.set(key, {
            result,
            accessCount: 1,
            lastAccessed: Date.now()
        });
    }
    getPerformanceStats() {
        return {
            ...this.performanceStats,
            cacheHitRate: this.performanceStats.cacheHits / Math.max(this.performanceStats.totalTranslations, 1),
            cacheSize: this.translationCache.size,
            isInitialized: this.isInitialized
        };
    }
    clearCache() {
        this.translationCache.clear();
        this.performanceStats.cacheHits = 0;
    }
    getSupportedLanguages() {
        return Array.from(this.supportedLanguages.keys());
    }
    async cleanup() {
        if (this.ocrWorker) {
            await this.ocrWorker.terminate();
            this.ocrWorker = null;
        }
        this.translationCache.clear();
        this.marianTranslators.clear();
        this.m2m100Translator = null;
        this.isInitialized = false;
        console.log("Fast Translation System cleaned up");
    }
}
exports.FastTranslationHelper = FastTranslationHelper;
//# sourceMappingURL=FastTranslationHelper.js.map