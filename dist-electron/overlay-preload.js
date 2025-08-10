"use strict";
// overlay-preload.ts
// Preload script for region overlay windows. Exposes a small API that allows
// the isolated overlay renderer to receive live OCR updates from the main
// process without breaking context-isolation.
//
// API exposed in the overlay HTML:
//   window.electronOverlayAPI.onUpdate(({ text, confidence, timestamp }) => { ... })
//
// The main process sends two kinds of IPC messages to the overlay window:
//   1. 'overlay-init'   -> { id }
//   2. 'overlay-update' -> { id, text, confidence, timestamp }
//
// The preload caches the `regionId` on init and forwards subsequent updates
// that match this id to any registered callback.
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
let regionId = null;
// The HTML page can register exactly one handler; simple enough for this use-case.
let updateHandler = null;
electron_1.ipcRenderer.on('overlay-init', (_, data) => {
    regionId = data.id;
});
electron_1.ipcRenderer.on('overlay-update', (_, payload) => {
    if (payload.id !== regionId)
        return;
    updateHandler?.({ text: payload.text, confidence: payload.confidence, timestamp: payload.timestamp });
});
electron_1.contextBridge.exposeInMainWorld('electronOverlayAPI', {
    onUpdate: (cb) => {
        updateHandler = cb;
    }
});
//# sourceMappingURL=overlay-preload.js.map