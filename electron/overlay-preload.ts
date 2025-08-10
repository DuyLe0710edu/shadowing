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

import { contextBridge, ipcRenderer } from 'electron'

let regionId: string | null = null

// The HTML page can register exactly one handler; simple enough for this use-case.
let updateHandler: ((data: { text: string; confidence: number; timestamp: number }) => void) | null = null

ipcRenderer.on('overlay-init', (_, data: { id: string }) => {
  regionId = data.id
})

ipcRenderer.on(
  'overlay-update',
  (_, payload: { id: string; text: string; confidence: number; timestamp: number }) => {
    if (payload.id !== regionId) return
    updateHandler?.({ text: payload.text, confidence: payload.confidence, timestamp: payload.timestamp })
  }
)

contextBridge.exposeInMainWorld('electronOverlayAPI', {
  onUpdate: (cb: typeof updateHandler) => {
    updateHandler = cb
  }
})
