"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// area-selection-preload.ts
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    selectionCompleted: (selection) => {
        electron_1.ipcRenderer.send('selection-completed', selection);
    },
    selectionCancelled: () => {
        electron_1.ipcRenderer.send('selection-cancelled');
    }
});
//# sourceMappingURL=area-selection-preload.js.map