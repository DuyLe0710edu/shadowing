"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppleTranslationManager = void 0;
// AppleTranslationManager.ts - Native Apple Translation with fallback
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
class AppleTranslationManager {
    nativeBinaryPath = null;
    isReady = false;
    constructor() {
        this.initializeAppleTranslation();
    }
    async initializeAppleTranslation() {
        try {
            console.log('[APPLE] Initializing Apple Translation service...');
            // Only attempt on macOS
            if (process.platform !== 'darwin') {
                console.log('[APPLE] Not macOS, skipping Apple Translation initialization');
                return;
            }
            // Import execa (CommonJS module)
            const execa = require('execa');
            // Try to find the Apple Translation binary
            const appPath = electron_1.app.getAppPath();
            const developmentPath = node_path_1.default.join(appPath, 'resources', 'native', 'AppleTranslateBridge');
            const productionPath = node_path_1.default.join(process.resourcesPath, 'native', 'AppleTranslateBridge');
            // Check which path exists
            if (node_fs_1.default.existsSync(developmentPath)) {
                this.nativeBinaryPath = developmentPath;
            }
            else if (node_fs_1.default.existsSync(productionPath)) {
                this.nativeBinaryPath = productionPath;
            }
            else {
                console.log('[APPLE] Apple Translation binary not found in expected locations');
                return;
            }
            console.log(`[APPLE] Found Apple Translation binary at: ${this.nativeBinaryPath}`);
            // Test if the binary works by sending a test request
            const testRequest = {
                text: "Hello",
                source: "en",
                target: "es"
            };
            const result = await execa(this.nativeBinaryPath, {
                input: JSON.stringify(testRequest),
                timeout: 5000,
                reject: false
            });
            if (result.exitCode !== 0) {
                const response = JSON.parse(result.stdout);
                if (response.code === 'NOT_IMPLEMENTED') {
                    console.log('[APPLE] Apple Translation not yet implemented, will use M2M fallback');
                    return;
                }
                else {
                    console.log(`[APPLE] Apple Translation test failed: ${response.error}`);
                    return;
                }
            }
            console.log('[APPLE] Apple Translation initialized successfully');
            this.isReady = true;
        }
        catch (error) {
            console.warn('[APPLE] Failed to initialize Apple Translation:', error.message);
            console.log('[APPLE] Will fall back to M2M translation');
        }
    }
    async translateWithApple(text, sourceLang = 'auto', targetLang = 'en') {
        if (!this.isReady || !this.nativeBinaryPath) {
            throw new Error('Apple Translation service not ready');
        }
        try {
            const execa = require('execa');
            const request = {
                text,
                source: sourceLang,
                target: targetLang
            };
            console.log(`[APPLE] Starting translation...`);
            console.log(`   - Text: "${text}"`);
            console.log(`   - Source: ${sourceLang}`);
            console.log(`   - Target: ${targetLang}`);
            const translationStartTime = Date.now();
            const result = await execa(this.nativeBinaryPath, {
                input: JSON.stringify(request),
                timeout: 10000,
                encoding: 'utf8'
            });
            if (result.exitCode !== 0) {
                throw new Error(`Apple Translation failed with exit code ${result.exitCode}: ${result.stderr}`);
            }
            // Parse JSON response
            const response = JSON.parse(result.stdout);
            const translationEndTime = Date.now();
            const totalTime = translationEndTime - translationStartTime;
            console.log(`[APPLE] Translation completed in ${totalTime}ms`);
            console.log(`   - Original: "${text}"`);
            console.log(`   - Translated: "${response.translatedText}"`);
            console.log(`   - Detected source: ${response.detectedSource || 'auto'}`);
            console.log(`   - Confidence: ${response.confidence}`);
            return {
                id: `apple_trans_${Date.now()}`,
                translatedText: response.translatedText,
                sourceLang: response.detectedSource || sourceLang,
                targetLang: targetLang,
                confidence: response.confidence,
                processingTime: totalTime,
                fromCache: false
            };
        }
        catch (error) {
            console.error('[APPLE] Translation error:', error.message);
            throw new Error(`Apple Translation failed: ${error.message}`);
        }
    }
    isAppleTranslationReady() {
        return this.isReady && process.platform === 'darwin';
    }
    cleanup() {
        console.log('[APPLE] Cleaning up Apple Translation service...');
        this.isReady = false;
        this.nativeBinaryPath = null;
    }
}
exports.AppleTranslationManager = AppleTranslationManager;
//# sourceMappingURL=AppleTranslationManager.js.map