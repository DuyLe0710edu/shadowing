const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectionCompleted: (selection) => {
    ipcRenderer.send('selection-completed', selection)
  },
  selectionCancelled: () => {
    ipcRenderer.send('selection-cancelled')
  }
})