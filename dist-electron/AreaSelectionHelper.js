"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AreaSelectionHelper = void 0;
// AreaSelectionHelper.ts
const electron_1 = require("electron");
const uuid_1 = require("uuid");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_2 = require("electron");
const screenshot_desktop_1 = __importDefault(require("screenshot-desktop"));
const sharp_1 = __importDefault(require("sharp"));
class AreaSelectionHelper {
    selectedRegions = new Map();
    selectionWindow = null;
    monitoringInterval = null;
    MONITOR_INTERVAL = 1000; // Check every second
    regionsDir;
    constructor() {
        this.regionsDir = node_path_1.default.join(electron_2.app.getPath("userData"), "selected_regions");
        if (!node_fs_1.default.existsSync(this.regionsDir)) {
            node_fs_1.default.mkdirSync(this.regionsDir, { recursive: true });
        }
    }
    async startAreaSelection() {
        console.log('Starting area selection...');
        if (this.selectionWindow) {
            console.log('Closing existing selection window');
            this.selectionWindow.close();
        }
        // Get all displays
        const displays = electron_1.screen.getAllDisplays();
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        // Create a transparent window covering all displays
        this.selectionWindow = new electron_1.BrowserWindow({
            x: 0,
            y: 0,
            width: electron_1.screen.getPrimaryDisplay().size.width,
            height: electron_1.screen.getPrimaryDisplay().size.height,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            fullscreen: false,
            show: false,
            backgroundColor: '#00000000',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "area-selection-preload.js")
            }
        });
        // Window is transparent, selection elements will be visible
        // Load the selection overlay HTML
        const selectionHtml = this.generateSelectionHTML();
        this.selectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(selectionHtml)}`);
        // Handle selection completion
        this.selectionWindow.webContents.once("did-finish-load", () => {
            console.log('Selection window loaded, showing window');
            this.selectionWindow?.webContents.send("init-selection", displays);
            this.selectionWindow?.show();
        });
        // Handle selection events
        electron_1.ipcMain.once("selection-completed", (_, selection) => {
            this.handleSelectionCompleted(selection);
        });
        electron_1.ipcMain.once("selection-cancelled", () => {
            this.stopAreaSelection();
        });
    }
    stopAreaSelection() {
        if (this.selectionWindow) {
            this.selectionWindow.close();
            this.selectionWindow = null;
        }
    }
    async handleSelectionCompleted(selection) {
        const regionId = (0, uuid_1.v4)();
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const region = {
            id: regionId,
            x: selection.x,
            y: selection.y,
            width: selection.width,
            height: selection.height,
            displayId: primaryDisplay.id,
            isActive: false
        };
        this.selectedRegions.set(regionId, region);
        this.stopAreaSelection();
        // Take initial screenshot of the region
        await this.captureRegion(region);
        // Notify main window about new region
        this.notifyRegionChange("region-added", region);
    }
    async captureRegion(region) {
        try {
            // Capture the specific region
            const screenshot = await this.captureRegionScreenshot(region);
            if (!screenshot)
                return null;
            // Save the screenshot  
            const timestamp = Date.now();
            const filename = `region_${region.id}_${timestamp}.png`;
            const filepath = node_path_1.default.join(this.regionsDir, filename);
            await node_fs_1.default.promises.writeFile(filepath, screenshot);
            return filepath;
        }
        catch (error) {
            console.error("Error capturing region:", error);
            return null;
        }
    }
    async captureRegionScreenshot(region) {
        try {
            // Use screenshot-desktop to capture the full screen
            const sources = await electron_1.desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1920, height: 1080 }
            });
            if (sources.length === 0)
                return null;
            // Get the display that contains this region
            const display = electron_1.screen.getDisplayMatching({
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height
            });
            // Take screenshot of entire screen first
            const fullScreenshot = await (0, screenshot_desktop_1.default)({ screen: display.id });
            // Crop to the selected region using Sharp
            const croppedImage = await (0, sharp_1.default)(fullScreenshot)
                .extract({
                left: Math.max(0, region.x - display.bounds.x),
                top: Math.max(0, region.y - display.bounds.y),
                width: region.width,
                height: region.height
            })
                .png()
                .toBuffer();
            return croppedImage;
        }
        catch (error) {
            console.error("Error in captureRegionScreenshot:", error);
            return null;
        }
    }
    startMonitoring() {
        if (this.monitoringInterval) {
            console.log(`Monitoring already running, clearing previous interval`);
            clearInterval(this.monitoringInterval);
        }
        console.log(`Starting monitoring with ${this.MONITOR_INTERVAL}ms interval`);
        this.monitoringInterval = setInterval(async () => {
            console.log(`Monitoring tick - checking active regions...`);
            let activeCount = 0;
            for (const [regionId, region] of this.selectedRegions) {
                if (region.isActive) {
                    activeCount++;
                    console.log(`Checking region ${regionId} for changes...`);
                    await this.checkRegionForChanges(region);
                }
            }
            console.log(`Checked ${activeCount} active regions`);
        }, this.MONITOR_INTERVAL);
    }
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    async checkRegionForChanges(region) {
        try {
            const screenshot = await this.captureRegionScreenshot(region);
            if (!screenshot)
                return;
            // Generate a hash of the image to detect changes
            const imageHash = await this.generateImageHash(screenshot);
            if (region.lastTextHash && region.lastTextHash === imageHash) {
                // No change detected
                return;
            }
            // Update the hash
            region.lastTextHash = imageHash;
            // Save the screenshot for OCR processing
            const filepath = await this.saveRegionScreenshot(region, screenshot);
            if (filepath) {
                // Notify that this region has changed and needs translation
                this.notifyRegionChange("region-changed", region, filepath);
            }
        }
        catch (error) {
            console.error("Error checking region for changes:", error);
        }
    }
    async generateImageHash(imageBuffer) {
        // Use Sharp to generate a simple hash based on image statistics
        const stats = await (0, sharp_1.default)(imageBuffer).stats();
        const hash = stats.channels.map(channel => Math.round(channel.mean).toString(16)).join('');
        return hash;
    }
    async saveRegionScreenshot(region, screenshot) {
        const timestamp = Date.now();
        const filename = `region_${region.id}_${timestamp}.png`;
        const filepath = node_path_1.default.join(this.regionsDir, filename);
        await node_fs_1.default.promises.writeFile(filepath, screenshot);
        return filepath;
    }
    getSelectedRegions() {
        return Array.from(this.selectedRegions.values());
    }
    deleteRegion(regionId) {
        const region = this.selectedRegions.get(regionId);
        if (!region)
            return false;
        // Stop monitoring this region
        region.isActive = false;
        // Remove from map
        this.selectedRegions.delete(regionId);
        // Clean up any saved screenshots for this region
        this.cleanupRegionFiles(regionId);
        this.notifyRegionChange("region-deleted", region);
        return true;
    }
    toggleRegionMonitoring(regionId) {
        const region = this.selectedRegions.get(regionId);
        if (!region) {
            console.log(`Region ${regionId} not found`);
            return false;
        }
        region.isActive = !region.isActive;
        console.log(`Region ${regionId} monitoring ${region.isActive ? 'ENABLED' : 'DISABLED'}`);
        if (region.isActive && !this.monitoringInterval) {
            console.log(`Starting monitoring interval...`);
            this.startMonitoring();
        }
        this.notifyRegionChange("region-toggled", region);
        return true;
    }
    cleanupRegionFiles(regionId) {
        try {
            const files = node_fs_1.default.readdirSync(this.regionsDir);
            const regionFiles = files.filter(file => file.includes(`region_${regionId}_`));
            for (const file of regionFiles) {
                node_fs_1.default.unlinkSync(node_path_1.default.join(this.regionsDir, file));
            }
        }
        catch (error) {
            console.error("Error cleaning up region files:", error);
        }
    }
    notifyRegionChange(event, region, filepath) {
        // Find the main window and send the event
        const allWindows = electron_1.BrowserWindow.getAllWindows();
        const mainWindow = allWindows.find(window => !window.isDestroyed() && window.webContents.getURL().includes("index.html"));
        if (mainWindow) {
            mainWindow.webContents.send(event, { region, filepath });
        }
    }
    generateSelectionHTML() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0);
            cursor: crosshair;
            overflow: hidden;
            user-select: none;
            margin: 0;
            padding: 0;
        }
        .selection-box {
            position: absolute;
            border: 2px dashed #ffffff;
            background: transparent;
            pointer-events: none;
            z-index: 9999;
        }
        .instructions {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: transparent;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 16px;
            font-weight: bold;
            z-index: 10000;
            border: 2px dashed white;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            animation: fadeInOut 6s ease-in-out;
        }
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            15% { opacity: 1; transform: translateX(-50%) translateY(0px); }
            85% { opacity: 1; transform: translateX(-50%) translateY(0px); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
    </style>
</head>
<body>
    <div class="instructions">
         Drag to select subtitle area on your video • Press Escape to cancel
    </div>
    <script>
        let isSelecting = false;
        let startX, startY;
        let selectionBox = null;

        document.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
            document.body.appendChild(selectionBox);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isSelecting || !selectionBox) return;
            
            const currentX = e.clientX;
            const currentY = e.clientY;
            
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        document.addEventListener('mouseup', (e) => {
            if (!isSelecting || !selectionBox) return;
            
            const currentX = e.clientX;
            const currentY = e.clientY;
            
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            
            // Only proceed if selection is large enough
            if (width > 20 && height > 20) {
                window.electronAPI.selectionCompleted({
                    x: left,
                    y: top,
                    width: width,
                    height: height
                });
            } else {
                window.electronAPI.selectionCancelled();
            }
            
            isSelecting = false;
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                window.electronAPI.selectionCancelled();
            }
        });
    </script>
</body>
</html>
    `;
    }
    cleanup() {
        this.stopMonitoring();
        this.stopAreaSelection();
        this.selectedRegions.clear();
    }
}
exports.AreaSelectionHelper = AreaSelectionHelper;
//# sourceMappingURL=AreaSelectionHelper.js.map