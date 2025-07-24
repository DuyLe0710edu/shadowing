"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationHelper = void 0;
// TranslationHelper.ts
const generative_ai_1 = require("@google/generative-ai");
const axios_1 = __importDefault(require("axios"));
const node_fs_1 = __importDefault(require("node:fs"));
const tesseract_js_1 = require("tesseract.js");
class TranslationHelper {
    geminiModel;
    ocrWorker = null;
    translationCache = new Map();
    MAX_CACHE_SIZE = 1000;
    providers = [
        { name: 'gemini', enabled: true, priority: 1 },
        { name: 'google', enabled: true, priority: 2 },
        { name: 'offline', enabled: true, priority: 3 }
    ];
    SYSTEM_PROMPT = `You are a specialized translation assistant focused on language learning, particularly Mandarin Chinese. 

When translating:
1. Provide accurate, contextual translations that preserve meaning and cultural nuances
2. For Chinese text, ALWAYS include Pinyin with tone marks (e.g., nǐ hǎo, shì jiè)
3. For movie subtitles, maintain natural conversation flow
4. Identify idioms, slang, or cultural expressions and explain them
5. For Mandarin learners, include tone numbers in brackets after Pinyin: nǐ(3) hǎo(3)

Format your response as JSON:
{
  "translatedText": "English translation",
  "pinyin": "pīn yīn with tone marks", 
  "tones": [tone numbers array],
  "detectedLanguage": "detected language code",
  "confidence": confidence score 0-1,
  "notes": "any cultural or linguistic notes"
}`;
    constructor() {
        this.initializeGemini();
        this.initializeOCR();
    }
    initializeGemini() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
                this.geminiModel = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    generationConfig: {
                        temperature: 0.3, // Lower temperature for more consistent translations
                        topP: 0.8,
                        topK: 40,
                        maxOutputTokens: 1024,
                    }
                });
            }
        }
        catch (error) {
            console.error("Error initializing Gemini:", error);
        }
    }
    async initializeOCR() {
        try {
            this.ocrWorker = await (0, tesseract_js_1.createWorker)('eng+chi_sim+chi_tra', 1, {
                logger: m => console.log(m) // OCR progress logging
            });
            // Optimize for subtitle text
            await this.ocrWorker.setParameters({
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?;:()[]{}，。！？；：（）【】《》、',
                tessedit_pageseg_mode: 6, // PSM_SINGLE_BLOCK
                preserve_interword_spaces: '1'
            });
        }
        catch (error) {
            console.error("Error initializing OCR:", error);
        }
    }
    async extractTextFromImage(imagePath) {
        if (!this.ocrWorker) {
            await this.initializeOCR();
        }
        try {
            if (!node_fs_1.default.existsSync(imagePath)) {
                throw new Error(`Image file not found: ${imagePath}`);
            }
            const { data: { text, confidence } } = await this.ocrWorker.recognize(imagePath);
            // Clean up the extracted text
            const cleanedText = this.cleanExtractedText(text);
            return {
                text: cleanedText,
                confidence: confidence / 100 // Convert to 0-1 scale
            };
        }
        catch (error) {
            console.error("Error extracting text from image:", error);
            return { text: "", confidence: 0 };
        }
    }
    cleanExtractedText(text) {
        return text
            .replace(/\n+/g, ' ') // Replace multiple newlines with single space
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .replace(/[^\w\s\u4e00-\u9fff.,!?;:'"()[\]{}，。！？；：""''（）【】《》、-]/g, '') // Keep only letters, numbers, Chinese characters, and common punctuation
            .trim();
    }
    async translateText(text, targetLanguage = 'en', sourceLanguage) {
        // Check cache first
        const cacheKey = `${text}-${targetLanguage}-${sourceLanguage || 'auto'}`;
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }
        // Try providers in priority order
        for (const provider of this.providers.sort((a, b) => a.priority - b.priority)) {
            if (!provider.enabled)
                continue;
            try {
                let result = null;
                switch (provider.name) {
                    case 'gemini':
                        result = await this.translateWithGemini(text, targetLanguage, sourceLanguage);
                        break;
                    case 'google':
                        result = await this.translateWithGoogle(text, targetLanguage, sourceLanguage);
                        break;
                    case 'offline':
                        result = await this.translateOffline(text, targetLanguage, sourceLanguage);
                        break;
                }
                if (result && result.confidence > 0.5) {
                    // Cache successful translation
                    this.cacheTranslation(cacheKey, result);
                    return result;
                }
            }
            catch (error) {
                console.error(`Translation failed with ${provider.name}:`, error);
                continue;
            }
        }
        // Fallback result if all providers fail
        return {
            originalText: text,
            translatedText: text,
            confidence: 0,
            provider: 'offline',
            detectedLanguage: sourceLanguage || 'unknown',
            timestamp: Date.now()
        };
    }
    async translateWithGemini(text, targetLanguage, sourceLanguage) {
        if (!this.geminiModel)
            return null;
        try {
            const prompt = `${this.SYSTEM_PROMPT}

Translate this text to ${targetLanguage}: "${text}"

Detected source language: ${sourceLanguage || 'auto-detect'}

Remember to include Pinyin for any Chinese text and maintain natural language flow for subtitles.`;
            const result = await this.geminiModel.generateContent(prompt);
            const response = await result.response;
            const responseText = response.text();
            // Try to parse JSON response
            let parsedResponse;
            try {
                // Extract JSON from response if it's wrapped in other text
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            }
            catch {
                // Fallback to plain text parsing
                parsedResponse = {
                    translatedText: responseText,
                    detectedLanguage: sourceLanguage || 'unknown',
                    confidence: 0.8
                };
            }
            return {
                originalText: text,
                translatedText: parsedResponse.translatedText || responseText,
                pinyin: parsedResponse.pinyin,
                tones: parsedResponse.tones,
                confidence: parsedResponse.confidence || 0.8,
                provider: 'gemini',
                detectedLanguage: parsedResponse.detectedLanguage || 'unknown',
                timestamp: Date.now()
            };
        }
        catch (error) {
            console.error("Gemini translation error:", error);
            return null;
        }
    }
    async translateWithGoogle(text, targetLanguage, sourceLanguage) {
        try {
            // Note: This would require Google Translate API key
            // For now, implementing a placeholder that could be extended
            const response = await axios_1.default.post('https://translate.googleapis.com/translate_a/single', {
                client: 'gtx',
                sl: sourceLanguage || 'auto',
                tl: targetLanguage,
                dt: 't',
                q: text
            }, {
                params: {
                    client: 'gtx',
                    sl: sourceLanguage || 'auto',
                    tl: targetLanguage,
                    dt: 't',
                    q: text
                }
            });
            if (response.data && response.data[0] && response.data[0][0]) {
                let translatedText = response.data[0][0][0];
                let detectedLang = response.data[2] || sourceLanguage || 'unknown';
                // If translating from Chinese, attempt to generate Pinyin
                let pinyinResult;
                if (detectedLang.startsWith('zh')) {
                    pinyinResult = await this.generatePinyin(text);
                }
                return {
                    originalText: text,
                    translatedText,
                    pinyin: pinyinResult?.pinyin,
                    tones: pinyinResult?.tones,
                    confidence: 0.7,
                    provider: 'google',
                    detectedLanguage: detectedLang,
                    timestamp: Date.now()
                };
            }
        }
        catch (error) {
            console.error("Google Translate error:", error);
        }
        return null;
    }
    async translateOffline(text, targetLanguage, sourceLanguage) {
        // Placeholder for offline translation
        // Could integrate with local translation models like OPUS-MT
        // For now, just return the original text as a fallback
        return {
            originalText: text,
            translatedText: `[OFFLINE] ${text}`,
            confidence: 0.3,
            provider: 'offline',
            detectedLanguage: sourceLanguage || 'unknown',
            timestamp: Date.now()
        };
    }
    async generatePinyin(chineseText) {
        try {
            // This would integrate with a Pinyin library
            // For now, using a placeholder that could be extended with libraries like:
            // - pinyin-pro
            // - node-pinyin
            // - pinyin4js
            // Placeholder implementation
            const syllables = chineseText.split('').map((char, index) => ({
                text: char,
                pinyin: `pin${index}`,
                tone: Math.floor(Math.random() * 4) + 1
            }));
            return {
                text: chineseText,
                pinyin: syllables.map(s => s.pinyin).join(' '),
                tones: syllables.map(s => s.tone),
                syllables
            };
        }
        catch (error) {
            console.error("Error generating Pinyin:", error);
            return undefined;
        }
    }
    cacheTranslation(key, result) {
        // Implement LRU cache
        if (this.translationCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.translationCache.keys().next().value;
            this.translationCache.delete(firstKey);
        }
        this.translationCache.set(key, result);
    }
    getProviderStatus() {
        return [...this.providers];
    }
    setProviderEnabled(providerName, enabled) {
        const provider = this.providers.find(p => p.name === providerName);
        if (provider) {
            provider.enabled = enabled;
        }
    }
    clearCache() {
        this.translationCache.clear();
    }
    getCacheStats() {
        return {
            size: this.translationCache.size,
            maxSize: this.MAX_CACHE_SIZE
        };
    }
    async cleanup() {
        if (this.ocrWorker) {
            await this.ocrWorker.terminate();
            this.ocrWorker = null;
        }
        this.translationCache.clear();
    }
}
exports.TranslationHelper = TranslationHelper;
//# sourceMappingURL=TranslationHelper.js.map