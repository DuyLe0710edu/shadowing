"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCRServiceManager = void 0;
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const os_1 = require("os");
class OCRServiceManager {
    isReady = false;
    nativeBinaryPath = null;
    async start() {
        console.log('[OCR] Initializing native OCR service...');
        // Determine which OCR backend to use based on platform
        if ((0, os_1.platform)() === 'darwin') {
            await this.initializeVisionOCR();
        }
        else {
            await this.initializeFallbackOCR();
        }
        this.isReady = true;
        console.log('[OCR] Service ready');
    }
    async initializeVisionOCR() {
        try {
            // Import execa (CommonJS module)
            const execa = require('execa');
            const fs = require('fs');
            // Try to find the Vision OCR binary (check development path first)
            const appPath = electron_1.app.getAppPath();
            const developmentPath = path_1.default.join(appPath, 'resources', 'native', 'VisionOCRBridge');
            const productionPath = path_1.default.join(process.resourcesPath, 'native', 'VisionOCRBridge');
            // Check which path exists
            if (fs.existsSync(developmentPath)) {
                this.nativeBinaryPath = developmentPath;
            }
            else if (fs.existsSync(productionPath)) {
                this.nativeBinaryPath = productionPath;
            }
            else {
                throw new Error('Vision OCR binary not found in expected locations');
            }
            console.log(`[OCR] Found Vision OCR binary at: ${this.nativeBinaryPath}`);
            // Test if the binary works
            const result = await execa(this.nativeBinaryPath, [], {
                timeout: 5000,
                reject: false
            });
            if (result.exitCode === 1 && (result.stderr.includes('Usage:') || result.stdout.includes('Usage:'))) {
                console.log('[OCR] Vision.framework OCR initialized successfully');
                return;
            }
            throw new Error(`Vision OCR binary test failed: exitCode=${result.exitCode}, output="${result.stdout || result.stderr}"`);
        }
        catch (error) {
            console.warn('[OCR] Failed to initialize Vision OCR:', error.message);
            console.log('[OCR] Falling back to alternative OCR method');
            await this.initializeFallbackOCR();
        }
    }
    async initializeFallbackOCR() {
        // Fallback for non-macOS platforms or when Vision OCR fails
        console.log('[OCR] Using fallback OCR - limited functionality');
        console.log('[OCR] Note: For best performance, use macOS with Vision.framework support');
        // TODO: Future enhancement - implement EasyOCR fallback for Windows/Linux
        // This could restore the Python EasyOCR service for cross-platform support
        this.nativeBinaryPath = null;
    }
    async extractText(imagePath, languages) {
        if (!this.isReady) {
            throw new Error('OCR service not ready');
        }
        if (this.nativeBinaryPath) {
            return this.extractTextWithVision(imagePath, languages);
        }
        else {
            return this.extractTextWithFallback(imagePath);
        }
    }
    async extractTextWithVision(imagePath, languages) {
        try {
            // Import execa (CommonJS module)
            const execa = require('execa');
            const args = [imagePath];
            // Add language codes if provided
            if (languages && languages.length > 0) {
                args.push(...languages);
            }
            else {
                // Default to common CJK + English for subtitle translation
                args.push('en', 'zh', 'ja', 'ko');
            }
            console.log(`[OCR] Running Vision OCR: ${this.nativeBinaryPath} ${args.join(' ')}`);
            const result = await execa(this.nativeBinaryPath, args, {
                timeout: 10000,
                encoding: 'utf8'
            });
            if (result.exitCode !== 0) {
                throw new Error(`Vision OCR failed with exit code ${result.exitCode}: ${result.stderr}`);
            }
            // Parse JSON response
            const ocrResult = JSON.parse(result.stdout);
            if (ocrResult.error) {
                throw new Error(`Vision OCR error: ${ocrResult.error}`);
            }
            console.log(`[OCR] Vision OCR result: "${ocrResult.text}" (confidence: ${ocrResult.confidence}%)`);
            return {
                text: ocrResult.text,
                confidence: ocrResult.confidence,
                wordCount: ocrResult.wordCount
            };
        }
        catch (error) {
            console.error('[OCR] Vision OCR failed:', error.message);
            throw new Error(`Vision OCR failed: ${error.message}`);
        }
    }
    async extractTextWithFallback(imagePath) {
        // Placeholder fallback implementation
        console.warn('[OCR] Fallback OCR called - Vision.framework not available');
        console.warn('[OCR] This typically means you are on a non-macOS system');
        console.warn('[OCR] Real-time translation features will be limited');
        // Return empty result to prevent crashes
        return {
            text: '',
            confidence: 0,
            wordCount: 0
        };
    }
    isServiceReady() {
        return this.isReady;
    }
    stop() {
        console.log('[OCR] Stopping native OCR service...');
        this.isReady = false;
        this.nativeBinaryPath = null;
    }
}
exports.OCRServiceManager = OCRServiceManager;
//# sourceMappingURL=OCRServiceManager.js.map