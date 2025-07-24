// area-selection-preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectionCompleted: (selection: { x: number, y: number, width: number, height: number }) => {
    ipcRenderer.send('selection-completed', selection)
  },
  selectionCancelled: () => {
    ipcRenderer.send('selection-cancelled')
  }
})