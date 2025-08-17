"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationManager = void 0;
// TranslationManager.ts - Unified translation with Apple/M2M backends
const AreaSelectionHelper_1 = require("./AreaSelectionHelper");
const TranslationOverlayHelper_1 = require("./TranslationOverlayHelper");
const TranslationCache_1 = require("./TranslationCache");
const AppleTranslationManager_1 = require("./AppleTranslationManager");
const node_path_1 = __importDefault(require("node:path"));
class TranslationManager {
    areaSelectionHelper;
    translationOverlayHelper;
    translationCache;
    appleTranslationManager;
    translationWorker = null;
    isWorkerReady = false;
    pendingRequests = new Map();
    requestCounter = 0;
    ENABLE_FLOATING_TRANSLATION_OVERLAY = false;
    constructor(ocrServiceManager) {
        this.areaSelectionHelper = new AreaSelectionHelper_1.AreaSelectionHelper(ocrServiceManager);
        this.translationOverlayHelper = new TranslationOverlayHelper_1.TranslationOverlayHelper();
        this.translationCache = new TranslationCache_1.TranslationCache();
        this.appleTranslationManager = new AppleTranslationManager_1.AppleTranslationManager();
        // Initialize workers/services
        this.initializeTranslationWorker();
        this.setupRegionEventHandlers();
    }
    initializeTranslationWorker() {
        try {
            console.log(`[WORKER] Initializing M2M translation worker...`);
            // Create the translation worker
            // When running from dist-electron, look in src/workers
            // When running in development, path should be relative to project root
            const workerPath = node_path_1.default.join(__dirname, '../src/workers/translationWorker.js');
            console.log(`[WORKER] Worker path: ${workerPath}`);
            // Check if worker file exists
            const fs = require('fs');
            if (!fs.existsSync(workerPath)) {
                console.error(`[WORKER] Worker file not found at: ${workerPath}`);
                console.error(`[WORKER] Skipping M2M worker initialization - Apple Translation will be primary`);
                return;
            }
            this.translationWorker = new Worker(workerPath, { type: 'module' });
            console.log(`[WORKER] Worker created successfully`);
            // Handle messages from worker
            this.translationWorker.onmessage = (event) => {
                console.log(`[WORKER] Message received from worker:`, event.data);
                this.handleWorkerMessage(event.data);
            };
            // Handle worker errors
            this.translationWorker.onerror = (error) => {
                console.error(`[WORKER]  Worker error:`, error);
                this.isWorkerReady = false;
            };
            console.log(`[WORKER] Sending initialization request...`);
            // Initialize the worker
            this.sendWorkerMessage('initialize', {})
                .then(() => {
                this.isWorkerReady = true;
                console.log(`[WORKER]  Translation worker ready!`);
            })
                .catch((error) => {
                console.error(`[WORKER]  Failed to initialize translation worker:`, error);
                console.error(`   - This might be due to:`);
                console.error(`     1. Worker file not found`);
                console.error(`     2. @xenova/transformers not installed`);
                console.error(`     3. Model download failure`);
                console.error(`     4. Network connectivity issues`);
            });
        }
        catch (error) {
            console.error(`[WORKER]  Failed to create translation worker:`, error);
        }
    }
    handleWorkerMessage(message) {
        const { id, type, result, error } = message;
        const pendingRequest = this.pendingRequests.get(id);
        if (!pendingRequest) {
            console.warn('Received response for unknown request:', id);
            return;
        }
        this.pendingRequests.delete(id);
        if (type === 'success') {
            pendingRequest.resolve(result);
        }
        else if (type === 'error') {
            pendingRequest.reject(new Error(error.message));
        }
    }
    sendWorkerMessage(type, data) {
        return new Promise((resolve, reject) => {
            if (!this.translationWorker) {
                reject(new Error('Translation worker not initialized'));
                return;
            }
            const id = `req_${++this.requestCounter}_${Date.now()}`;
            this.pendingRequests.set(id, { resolve, reject });
            this.translationWorker.postMessage({ id, type, data });
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Translation request timeout'));
                }
            }, 10000);
        });
    }
    setupRegionEventHandlers() {
        const { ipcMain } = require('electron');
        console.log('Setting up region event handlers...');
        ipcMain.on('region-changed', async (event, data) => {
            console.log('Received region-changed event:', data);
            if (data.filepath) {
                await this.processRegionChange(data.region, data.filepath);
            }
        });
    }
    async processRegionChange(region, imagePath) {
        const debugId = `${region.id.substring(0, 8)}_${Date.now()}`;
        try {
            console.log(`==================== TRANSLATION PIPELINE START [${debugId}] ====================`);
            console.log(`Region ID: ${region.id}`);
            console.log(`Region active: ${region.isActive}`);
            console.log(`Region position: ${region.x}, ${region.y} (${region.width}x${region.height})`);
            console.log(`Region last text: "${region.lastText || 'none'}"`);
            // Get the text that was already extracted by AreaSelectionHelper
            const cleanText = region.lastText?.trim() || '';
            console.log(`Using pre-extracted text: "${cleanText}" (length: ${cleanText.length})`);
            if (cleanText && cleanText.length > 2) {
                console.log(`Valid text available, proceeding with translation`);
                // Check cache first
                const cachedResult = this.translationCache.get(cleanText);
                if (cachedResult) {
                    console.log('Using cached translation:', cachedResult.translatedText);
                    await this.displayTranslation(region, cleanText, cachedResult.translatedText, true);
                    console.log(`==================== PIPELINE COMPLETE (CACHED) [${debugId}] ====================`);
                    return;
                }
                console.log(`Starting translation...`);
                // Get language settings from IPC handler
                const { ipcMain } = require('electron');
                let sourceLang = 'auto';
                let targetLang = 'en'; // Default to English
                // Helper function to get persisted settings
                const getPersistedSettings = () => {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const { app } = require('electron');
                        const settingsFile = path.join(app.getPath("userData"), "settings.json");
                        if (fs.existsSync(settingsFile)) {
                            const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
                            console.log('[TRANSLATION] Using persisted settings as fallback:', settings);
                            return settings;
                        }
                    }
                    catch (error) {
                        console.warn('[TRANSLATION] Failed to load persisted settings:', error.message);
                    }
                    return { source: 'auto', target: 'en' };
                };
                // Try to get current language settings from the IPC handler
                try {
                    const languageSettings = await new Promise((resolve) => {
                        const { BrowserWindow } = require('electron');
                        const allWindows = BrowserWindow.getAllWindows();
                        const mainWindow = allWindows.find((window) => !window.isDestroyed() && window.webContents.getURL().includes("index.html"));
                        if (mainWindow) {
                            console.log('[TRANSLATION] Requesting language settings from renderer...');
                            mainWindow.webContents.send('get-language-settings-request');
                            // Use persisted settings if no response in 500ms (increased timeout)
                            const timeout = setTimeout(() => {
                                console.log('[TRANSLATION] Language settings request timed out, using persisted fallback');
                                const fallbackSettings = getPersistedSettings();
                                resolve(fallbackSettings);
                            }, 500);
                            const handler = (event, settings) => {
                                clearTimeout(timeout);
                                ipcMain.removeListener('language-settings-response', handler);
                                console.log('[TRANSLATION] Received language settings from renderer:', settings);
                                resolve(settings);
                            };
                            ipcMain.once('language-settings-response', handler);
                        }
                        else {
                            console.log('[TRANSLATION] Main window not found, using persisted settings');
                            const fallbackSettings = getPersistedSettings();
                            resolve(fallbackSettings);
                        }
                    });
                    sourceLang = languageSettings.source || 'auto';
                    targetLang = languageSettings.target || 'en';
                }
                catch (error) {
                    console.log(`[TRANSLATION] Error getting language settings, using defaults:`, error);
                }
                console.log(`Using language settings: ${sourceLang} -> ${targetLang}`);
                // Choose translation backend based on availability
                const translationStartTime = Date.now();
                const translation = await this.translateText(cleanText, sourceLang, targetLang);
                const translationEndTime = Date.now();
                const translationTime = translationEndTime - translationStartTime;
                console.log(`Translation completed!`);
                console.log(`   - Original: "${cleanText}"`);
                console.log(`   - Translated: "${translation.translatedText}"`);
                console.log(`   - Source lang: ${translation.sourceLang}`);
                console.log(`   - Target lang: ${translation.targetLang}`);
                console.log(`   - Confidence: ${translation.confidence}`);
                console.log(`   - Translation time: ${translationTime}ms`);
                // Cache the result
                this.translationCache.set(cleanText, translation);
                console.log(`Translation cached`);
                // Display translation
                console.log(`Displaying translation overlay and UI notification`);
                await this.displayTranslation(region, cleanText, translation.translatedText, false);
                console.log(`==================== PIPELINE COMPLETE (SUCCESS) [${debugId}] ====================`);
            }
            else {
                console.log(`Text too short or empty, skipping translation`);
                console.log(`   - Text length: ${cleanText.length}`);
                console.log(`   - Minimum required: 3 characters`);
                console.log(`==================== PIPELINE COMPLETE (SKIPPED) [${debugId}] ====================`);
            }
        }
        catch (error) {
            console.error(`ERROR in translation pipeline [${debugId}]:`, error);
            console.error(`   - Error message: ${error.message}`);
            console.error(`   - Error stack:`, error.stack);
            console.log(`==================== PIPELINE FAILED [${debugId}] ====================`);
        }
    }
    async translateWithM2M(text, sourceLang = 'auto', targetLang = 'en') {
        console.log(`[M2M] Starting translation...`);
        console.log(`   - Text: "${text}"`);
        console.log(`   - Source: ${sourceLang}`);
        console.log(`   - Target: ${targetLang}`);
        console.log(`   - Worker ready: ${this.isWorkerReady}`);
        if (!this.isWorkerReady || !this.translationWorker) {
            console.error(`[M2M] Translation worker not ready or not available`);
            throw new Error('Translation worker not ready - M2M translation unavailable');
        }
        try {
            console.log(`[M2M] Sending translation request to worker...`);
            const result = await this.sendWorkerMessage('translateWithPinyin', {
                text,
                sourceLang,
                targetLang
            });
            console.log(`[M2M]  Worker response received:`, result);
            return {
                id: `trans_${Date.now()}`,
                translatedText: result.translatedText,
                sourceLang: result.sourceLang,
                targetLang: result.targetLang,
                confidence: result.confidence,
                processingTime: result.processingTime,
                fromCache: false
            };
        }
        catch (error) {
            console.error(`[M2M]  Translation error:`, error);
            throw error;
        }
    }
    async displayTranslation(region, originalText, translation, fromCache) {
        // Optionally show floating overlay near the region (disabled for UX clarity)
        if (this.ENABLE_FLOATING_TRANSLATION_OVERLAY) {
            await this.translationOverlayHelper.createTranslationOverlay(region.id, region, originalText, translation);
        }
        // Notify the UI
        this.notifyTranslationReady({
            regionId: region.id,
            originalText: originalText,
            translation: translation,
            timestamp: Date.now(),
            fromCache: fromCache
        });
    }
    notifyTranslationReady(translationData) {
        const { BrowserWindow } = require('electron');
        const allWindows = BrowserWindow.getAllWindows();
        const mainWindow = allWindows.find((window) => {
            if (window.isDestroyed())
                return false;
            const url = window.webContents.getURL();
            // Support both dev server and packaged app
            return url.includes('index.html') || url.startsWith('http://localhost');
        });
        if (mainWindow) {
            mainWindow.webContents.send('translation-ready', translationData);
        }
    }
    // Public API methods
    async startAreaSelection() {
        await this.areaSelectionHelper.startAreaSelection();
    }
    getSelectedRegions() {
        return this.areaSelectionHelper.getSelectedRegions();
    }
    async deleteRegion(regionId) {
        return this.areaSelectionHelper.deleteRegion(regionId);
    }
    async toggleRegionMonitoring(regionId) {
        return this.areaSelectionHelper.toggleRegionMonitoring(regionId);
    }
    async translateText(text, sourceLang = 'auto', targetLang = 'en') {
        console.log(`[TRANSLATION] Selecting backend...`);
        // Try Apple Translation first (if available on macOS)
        if (this.appleTranslationManager.isAppleTranslationReady()) {
            console.log(`[TRANSLATION] Using Apple Translation backend`);
            try {
                return await this.appleTranslationManager.translateWithApple(text, sourceLang, targetLang);
            }
            catch (error) {
                console.warn(`[TRANSLATION] Apple Translation failed, falling back to M2M:`, error.message);
                // Fall through to M2M
            }
        }
        // Fallback to M2M-100
        console.log(`[TRANSLATION] Using M2M-100 backend`);
        return this.translateWithM2M(text, sourceLang, targetLang);
    }
    getCacheStats() {
        return this.translationCache.getStats();
    }
    clearCache() {
        this.translationCache.clear();
    }
    cleanup() {
        this.areaSelectionHelper.cleanup();
        this.translationOverlayHelper.closeAllOverlays();
        this.translationCache.clear();
        this.appleTranslationManager.cleanup();
        if (this.translationWorker) {
            this.translationWorker.terminate();
        }
        // Clear pending requests
        this.pendingRequests.clear();
    }
}
exports.TranslationManager = TranslationManager;
//# sourceMappingURL=TranslationManager.js.map