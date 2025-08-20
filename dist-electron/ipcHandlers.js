"use strict";
// ipcHandlers.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeIpcHandlers = initializeIpcHandlers;
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function initializeIpcHandlers(appState) {
    electron_1.ipcMain.handle("update-content-dimensions", async (event, { width, height }) => {
        if (width && height) {
            appState.setWindowDimensions(width, height);
        }
    });
    electron_1.ipcMain.handle("delete-screenshot", async (event, path) => {
        return appState.deleteScreenshot(path);
    });
    electron_1.ipcMain.handle("take-screenshot", async () => {
        try {
            const screenshotPath = await appState.takeScreenshot();
            const preview = await appState.getImagePreview(screenshotPath);
            return { path: screenshotPath, preview };
        }
        catch (error) {
            console.error("Error taking screenshot:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("get-screenshots", async () => {
        console.log({ view: appState.getView() });
        try {
            let previews = [];
            if (appState.getView() === "queue") {
                previews = await Promise.all(appState.getScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            else {
                previews = await Promise.all(appState.getExtraScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            previews.forEach((preview) => console.log(preview.path));
            return previews;
        }
        catch (error) {
            console.error("Error getting screenshots:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("toggle-window", async () => {
        appState.toggleMainWindow();
    });
    electron_1.ipcMain.handle("reset-queues", async () => {
        try {
            appState.clearQueues();
            console.log("Screenshot queues have been cleared.");
            return { success: true };
        }
        catch (error) {
            console.error("Error resetting queues:", error);
            return { success: false, error: error.message };
        }
    });
    // IPC handler for analyzing audio from base64 data
    electron_1.ipcMain.handle("analyze-audio-base64", async (event, data, mimeType) => {
        try {
            const result = await appState.processingHelper.processAudioBase64(data, mimeType);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-base64 handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing audio from file path
    electron_1.ipcMain.handle("analyze-audio-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.processAudioFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-file handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing image from file path
    electron_1.ipcMain.handle("analyze-image-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-image-file handler:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("quit-app", () => {
        electron_1.app.quit();
    });
    // TTS handlers
    electron_1.ipcMain.handle('speak-text', async (_evt, payload) => {
        try {
            return appState.getSpeechTTSManager().speak(payload);
        }
        catch (e) {
            console.error('speak-text failed', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('stop-speech', async () => {
        try {
            return appState.getSpeechTTSManager().stop();
        }
        catch (e) {
            console.error('stop-speech failed', e);
            return false;
        }
    });
    // Translation system handlers
    electron_1.ipcMain.handle("start-area-selection", async () => {
        return await appState.startAreaSelection();
    });
    electron_1.ipcMain.handle("get-selected-regions", async () => {
        return appState.getTranslationManager().getSelectedRegions();
    });
    electron_1.ipcMain.handle("delete-region", async (event, regionId) => {
        return await appState.getTranslationManager().deleteRegion(regionId);
    });
    electron_1.ipcMain.handle("toggle-region-monitoring", async (event, regionId) => {
        return await appState.getTranslationManager().toggleRegionMonitoring(regionId);
    });
    // Language settings handlers
    const getSettingsFilePath = () => node_path_1.default.join(electron_1.app.getPath("userData"), "settings.json");
    const loadPersistedSettings = () => {
        try {
            const settingsFile = getSettingsFilePath();
            if (node_fs_1.default.existsSync(settingsFile)) {
                const settings = JSON.parse(node_fs_1.default.readFileSync(settingsFile, 'utf8'));
                console.log('[SETTINGS] Loaded persisted language settings:', settings);
                return settings;
            }
        }
        catch (error) {
            console.warn('[SETTINGS] Failed to load persisted settings:', error.message);
        }
        return { source: 'auto', target: 'en' };
    };
    const saveSettings = (settings) => {
        try {
            const settingsFile = getSettingsFilePath();
            node_fs_1.default.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
            console.log('[SETTINGS] Saved language settings:', settings);
        }
        catch (error) {
            console.warn('[SETTINGS] Failed to save settings:', error.message);
        }
    };
    let currentLanguageSettings = loadPersistedSettings();
    electron_1.ipcMain.handle("set-language-settings", async (event, settings) => {
        currentLanguageSettings = settings;
        saveSettings(settings); // Persist to disk
        console.log('Language settings updated:', settings);
        return true;
    });
    electron_1.ipcMain.handle("get-language-settings", async () => {
        return currentLanguageSettings;
    });
    // Language settings communication handlers for TranslationManager
    electron_1.ipcMain.on("language-settings-response", (event, settings) => {
        // Update stored settings when received from renderer
        currentLanguageSettings = settings;
        saveSettings(settings); // Persist to disk
        console.log('Language settings received from renderer:', settings);
    });
    // Notecard generation
    electron_1.ipcMain.handle('generate-notecards', async (_evt, payload) => {
        try {
            const list = await appState.getProcessingHelper().getLLMHelper().generateVocabCards(payload.items, payload.source, payload.target, payload.limit ?? 30);
            return list;
        }
        catch (e) {
            console.error('generate-notecards failed:', e?.message);
            return [];
        }
    });
}
//# sourceMappingURL=ipcHandlers.js.map