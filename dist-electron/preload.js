"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESSING_EVENTS = void 0;
const electron_1 = require("electron");
// Pending event buffers to avoid losing early IPC before renderer subscribes
const pendingTranslationReady = [];
const pendingRegionChanged = [];
let translationReadyHandler = null;
let regionChangedHandler = null;
// Early listeners fill buffers; real callbacks get set via exposed API below
electron_1.ipcRenderer.on("translation-ready", (_, data) => {
    if (translationReadyHandler)
        translationReadyHandler(data);
    else
        pendingTranslationReady.push(data);
});
electron_1.ipcRenderer.on("region-changed", (_, data) => {
    if (regionChangedHandler)
        regionChangedHandler(data);
    else
        pendingRegionChanged.push(data);
});
exports.PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
};
// Expose the Electron API to the renderer process
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    updateContentDimensions: (dimensions) => electron_1.ipcRenderer.invoke("update-content-dimensions", dimensions),
    takeScreenshot: () => electron_1.ipcRenderer.invoke("take-screenshot"),
    getScreenshots: () => electron_1.ipcRenderer.invoke("get-screenshots"),
    deleteScreenshot: (path) => electron_1.ipcRenderer.invoke("delete-screenshot", path),
    // Event listeners
    onScreenshotTaken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("screenshot-taken", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-taken", subscription);
        };
    },
    onSolutionsReady: (callback) => {
        const subscription = (_, solutions) => callback(solutions);
        electron_1.ipcRenderer.on("solutions-ready", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("solutions-ready", subscription);
        };
    },
    onResetView: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("reset-view", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("reset-view", subscription);
        };
    },
    onSolutionStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        };
    },
    onDebugStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        };
    },
    onDebugSuccess: (callback) => {
        electron_1.ipcRenderer.on("debug-success", (_event, data) => callback(data));
        return () => {
            electron_1.ipcRenderer.removeListener("debug-success", (_event, data) => callback(data));
        };
    },
    onDebugError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        };
    },
    onSolutionError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        };
    },
    onProcessingNoScreenshots: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        };
    },
    onProblemExtracted: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        };
    },
    onSolutionSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        };
    },
    onUnauthorized: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        };
    },
    moveWindowLeft: () => electron_1.ipcRenderer.invoke("move-window-left"),
    moveWindowRight: () => electron_1.ipcRenderer.invoke("move-window-right"),
    analyzeAudioFromBase64: (data, mimeType) => electron_1.ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
    analyzeAudioFile: (path) => electron_1.ipcRenderer.invoke("analyze-audio-file", path),
    analyzeImageFile: (path) => electron_1.ipcRenderer.invoke("analyze-image-file", path),
    quitApp: () => electron_1.ipcRenderer.invoke("quit-app"),
    // Translation system
    startAreaSelection: () => electron_1.ipcRenderer.invoke("start-area-selection"),
    getSelectedRegions: () => electron_1.ipcRenderer.invoke("get-selected-regions"),
    deleteRegion: (regionId) => electron_1.ipcRenderer.invoke("delete-region", regionId),
    toggleRegionMonitoring: (regionId) => electron_1.ipcRenderer.invoke("toggle-region-monitoring", regionId),
    // Translation events (buffer + flush once subscribed)
    onTranslationReady: (callback) => {
        translationReadyHandler = callback;
        // flush any pending
        if (pendingTranslationReady.length) {
            const copy = pendingTranslationReady.splice(0);
            copy.forEach((d) => callback(d));
        }
        // return an unsubscribe that clears handler
        return () => { translationReadyHandler = null; };
    },
    onRegionAdded: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("region-added", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("region-added", subscription);
        };
    },
    onRegionChanged: (callback) => {
        regionChangedHandler = callback;
        if (pendingRegionChanged.length) {
            const copy = pendingRegionChanged.splice(0);
            copy.forEach((d) => callback(d));
        }
        return () => { regionChangedHandler = null; };
    },
    // Expose optional region-deleted listener used by UI cleanup
    onRegionDeleted: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('region-deleted', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('region-deleted', subscription);
        };
    },
    // Language settings
    onLanguageSettingsRequest: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("get-language-settings-request", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("get-language-settings-request", subscription);
        };
    },
    sendLanguageSettingsResponse: (settings) => {
        electron_1.ipcRenderer.send("language-settings-response", settings);
    },
    getLanguageSettings: () => electron_1.ipcRenderer.invoke("get-language-settings"),
    setLanguageSettings: (settings) => electron_1.ipcRenderer.invoke("set-language-settings", settings)
});
// Extend the exposed API with a UI-driven translate call
electron_1.contextBridge.exposeInMainWorld('electronAPI', Object.assign({}, window.electronAPI, {
    uiTranslateText: (text, source, target) => electron_1.ipcRenderer.invoke('ui-translate-text', { text, source, target })
}));
//# sourceMappingURL=preload.js.map