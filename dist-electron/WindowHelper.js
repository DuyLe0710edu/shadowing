"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const startUrl = isDev
    ? "http://localhost:5180"
    : `file://${node_path_1.default.join(__dirname, "../dist/index.html")}`;
class WindowHelper {
    mainWindow = null;
    isWindowVisible = false;
    windowPosition = null;
    windowSize = null;
    appState;
    // Initialize with explicit number type and 0 value
    screenWidth = 0;
    screenHeight = 0;
    step = 0;
    currentX = 0;
    currentY = 0;
    // Virtual desktop bounds across all displays
    virtualMinX = 0;
    virtualMaxX = 0;
    virtualMinY = 0;
    virtualMaxY = 0;
    constructor(appState) {
        this.appState = appState;
    }
    setWindowDimensions(width, height) {
        if (!this.mainWindow || this.mainWindow.isDestroyed())
            return;
        // Get current window position
        const [currentX, currentY] = this.mainWindow.getPosition();
        // Recalculate virtual bounds in case displays changed
        const displays = electron_1.screen.getAllDisplays();
        this.virtualMinX = Math.min(...displays.map(d => d.bounds.x));
        this.virtualMinY = Math.min(...displays.map(d => d.bounds.y));
        this.virtualMaxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
        this.virtualMaxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
        // Use 75% width if debugging has occurred, otherwise use 60%
        // Fall back to current window width if we cannot compute a reasonable cap
        const primaryWorkAreaWidth = electron_1.screen.getPrimaryDisplay().workAreaSize.width;
        const maxAllowedWidth = Math.floor(primaryWorkAreaWidth * (this.appState.getHasDebugged() ? 0.75 : 0.5)) || (this.windowSize?.width ?? width);
        // Ensure width doesn't exceed max allowed width and height is reasonable
        const newWidth = Math.min(width + 32, maxAllowedWidth);
        const newHeight = Math.ceil(height);
        // Keep current X/Y but clamp within virtual desktop bounds
        const minX = this.virtualMinX;
        const maxX = this.virtualMaxX - newWidth;
        const minY = this.virtualMinY;
        const maxY = this.virtualMaxY - newHeight;
        const newX = Math.min(Math.max(currentX, minX), maxX);
        const newY = Math.min(Math.max(currentY, minY), maxY);
        // Update window bounds
        this.mainWindow.setBounds({
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        });
        // Update internal state
        this.windowPosition = { x: newX, y: newY };
        this.windowSize = { width: newWidth, height: newHeight };
        this.currentX = newX;
    }
    createWindow() {
        if (this.mainWindow !== null)
            return;
        // Compute virtual desktop bounds across all displays so we can move
        // the window freely between monitors using keyboard shortcuts
        const displays = electron_1.screen.getAllDisplays();
        this.virtualMinX = Math.min(...displays.map(d => d.bounds.x));
        this.virtualMinY = Math.min(...displays.map(d => d.bounds.y));
        this.virtualMaxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
        this.virtualMaxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
        this.screenWidth = this.virtualMaxX - this.virtualMinX;
        this.screenHeight = this.virtualMaxY - this.virtualMinY;
        this.step = Math.max(20, Math.floor(this.screenWidth / 10)); // ensure sensible step
        this.currentX = this.virtualMinX; // Start at the left-most point of the virtual desktop
        const windowSettings = {
            height: 600,
            minWidth: undefined,
            maxWidth: undefined,
            x: this.currentX,
            y: 0,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js")
            },
            show: true,
            alwaysOnTop: true,
            frame: false,
            transparent: true,
            fullscreenable: false,
            hasShadow: false,
            backgroundColor: "#00000000",
            focusable: true
        };
        this.mainWindow = new electron_1.BrowserWindow(windowSettings);
        // this.mainWindow.webContents.openDevTools()
        //this.mainWindow.setContentProtection(true)
        this.mainWindow.setContentProtection(false);
        if (process.platform === "darwin") {
            this.mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            });
            this.mainWindow.setHiddenInMissionControl(true);
            this.mainWindow.setAlwaysOnTop(true, "floating");
        }
        if (process.platform === "linux") {
            // Linux-specific optimizations for stealth overlays
            if (this.mainWindow.setHasShadow) {
                this.mainWindow.setHasShadow(false);
            }
            this.mainWindow.setFocusable(false);
        }
        this.mainWindow.setSkipTaskbar(true);
        this.mainWindow.setAlwaysOnTop(true);
        this.mainWindow.loadURL(startUrl).catch((err) => {
            console.error("Failed to load URL:", err);
        });
        const bounds = this.mainWindow.getBounds();
        this.windowPosition = { x: bounds.x, y: bounds.y };
        this.windowSize = { width: bounds.width, height: bounds.height };
        this.currentX = bounds.x;
        this.currentY = bounds.y;
        this.setupWindowListeners();
        this.isWindowVisible = true;
    }
    setupWindowListeners() {
        if (!this.mainWindow)
            return;
        this.mainWindow.on("move", () => {
            if (this.mainWindow) {
                const bounds = this.mainWindow.getBounds();
                this.windowPosition = { x: bounds.x, y: bounds.y };
                this.currentX = bounds.x;
                this.currentY = bounds.y;
            }
        });
        this.mainWindow.on("resize", () => {
            if (this.mainWindow) {
                const bounds = this.mainWindow.getBounds();
                this.windowSize = { width: bounds.width, height: bounds.height };
            }
        });
        this.mainWindow.on("closed", () => {
            this.mainWindow = null;
            this.isWindowVisible = false;
            this.windowPosition = null;
            this.windowSize = null;
        });
    }
    getMainWindow() {
        return this.mainWindow;
    }
    isVisible() {
        return this.isWindowVisible;
    }
    hideMainWindow() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn("Main window does not exist or is destroyed.");
            return;
        }
        const bounds = this.mainWindow.getBounds();
        this.windowPosition = { x: bounds.x, y: bounds.y };
        this.windowSize = { width: bounds.width, height: bounds.height };
        this.mainWindow.hide();
        this.isWindowVisible = false;
    }
    showMainWindow() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.warn("Main window does not exist or is destroyed.");
            return;
        }
        if (this.windowPosition && this.windowSize) {
            this.mainWindow.setBounds({
                x: this.windowPosition.x,
                y: this.windowPosition.y,
                width: this.windowSize.width,
                height: this.windowSize.height
            });
        }
        this.mainWindow.showInactive();
        this.isWindowVisible = true;
    }
    toggleMainWindow() {
        if (this.isWindowVisible) {
            this.hideMainWindow();
        }
        else {
            this.showMainWindow();
        }
    }
    // New methods for window movement
    moveWindowRight() {
        if (!this.mainWindow)
            return;
        const windowWidth = this.windowSize?.width || 0;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        const maxX = this.virtualMaxX - windowWidth;
        this.currentX = Math.min(maxX, this.currentX + this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowLeft() {
        if (!this.mainWindow)
            return;
        const windowWidth = this.windowSize?.width || 0;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        const minX = this.virtualMinX;
        this.currentX = Math.max(minX, this.currentX - this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowDown() {
        if (!this.mainWindow)
            return;
        const windowHeight = this.windowSize?.height || 0;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        const maxY = this.virtualMaxY - windowHeight;
        this.currentY = Math.min(maxY, this.currentY + this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    moveWindowUp() {
        if (!this.mainWindow)
            return;
        const windowHeight = this.windowSize?.height || 0;
        // Ensure currentX and currentY are numbers
        this.currentX = Number(this.currentX) || 0;
        this.currentY = Number(this.currentY) || 0;
        const minY = this.virtualMinY;
        this.currentY = Math.max(minY, this.currentY - this.step);
        this.mainWindow.setPosition(Math.round(this.currentX), Math.round(this.currentY));
    }
    cleanup() {
        // Close main window if it exists
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.close();
            this.mainWindow = null;
        }
    }
}
exports.WindowHelper = WindowHelper;
//# sourceMappingURL=WindowHelper.js.map