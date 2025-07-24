"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverlayWindowHelper = void 0;
// OverlayWindowHelper.ts
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
class OverlayWindowHelper {
    overlayWindows = new Map();
    overlayConfigs = new Map();
    isDev = process.env.NODE_ENV === "development";
    defaultStyle = {
        theme: 'dark',
        opacity: 0.9,
        fontSize: 14,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        textColor: '#ffffff',
        borderRadius: 8,
        padding: 12
    };
    constructor() {
        this.setupIpcHandlers();
    }
    setupIpcHandlers() {
        electron_1.ipcMain.handle("create-translation-overlay", (_, config) => this.createOverlay(config));
        electron_1.ipcMain.handle("update-overlay-translation", (_, overlayId, translation) => this.updateOverlayTranslation(overlayId, translation));
        electron_1.ipcMain.handle("update-overlay-position", (_, overlayId, position) => this.updateOverlayPosition(overlayId, position));
        electron_1.ipcMain.handle("update-overlay-style", (_, overlayId, style) => this.updateOverlayStyle(overlayId, style));
        electron_1.ipcMain.handle("show-overlay", (_, overlayId) => this.showOverlay(overlayId));
        electron_1.ipcMain.handle("hide-overlay", (_, overlayId) => this.hideOverlay(overlayId));
        electron_1.ipcMain.handle("destroy-overlay", (_, overlayId) => this.destroyOverlay(overlayId));
        electron_1.ipcMain.handle("get-overlay-configs", () => this.getOverlayConfigs());
    }
    createOverlay(config) {
        const overlayId = config.id || `overlay_${Date.now()}`;
        const defaultConfig = {
            id: overlayId,
            regionId: config.regionId || '',
            position: config.position || this.calculateOptimalPosition(),
            style: { ...this.defaultStyle, ...config.style },
            visible: config.visible !== false,
            displayMode: config.displayMode || 'sidebar',
            autoHide: config.autoHide || false,
            autoHideDelay: config.autoHideDelay || 3000
        };
        // Store the configuration
        this.overlayConfigs.set(overlayId, defaultConfig);
        // Create the overlay window
        const overlayWindow = this.createOverlayWindow(defaultConfig);
        this.overlayWindows.set(overlayId, overlayWindow);
        return overlayId;
    }
    createOverlayWindow(config) {
        const windowOptions = {
            x: config.position.x,
            y: config.position.y,
            width: config.position.width,
            height: config.position.height,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: false,
            hasShadow: false,
            backgroundColor: '#00000000',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "overlay-preload.js"),
                devTools: this.isDev
            }
        };
        const window = new electron_1.BrowserWindow(windowOptions);
        // Load the overlay HTML
        const overlayHtml = this.generateOverlayHTML(config);
        window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`);
        // Handle window events
        window.webContents.once('did-finish-load', () => {
            window.webContents.send('overlay-config', config);
        });
        // Set initial visibility
        if (!config.visible) {
            window.hide();
        }
        return window;
    }
    calculateOptimalPosition() {
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        // Default to right sidebar position
        const overlayWidth = 350;
        const overlayHeight = 400;
        return {
            x: screenWidth - overlayWidth - 20,
            y: 100,
            width: overlayWidth,
            height: overlayHeight,
            anchor: 'topRight'
        };
    }
    updateOverlayTranslation(overlayId, translation) {
        const window = this.overlayWindows.get(overlayId);
        const config = this.overlayConfigs.get(overlayId);
        if (!window || !config || window.isDestroyed()) {
            return false;
        }
        // Send translation data to overlay window
        window.webContents.send('translation-update', translation);
        // Handle auto-hide functionality
        if (config.autoHide) {
            this.showOverlay(overlayId);
            setTimeout(() => {
                this.hideOverlay(overlayId);
            }, config.autoHideDelay);
        }
        return true;
    }
    updateOverlayPosition(overlayId, position) {
        const window = this.overlayWindows.get(overlayId);
        const config = this.overlayConfigs.get(overlayId);
        if (!window || !config || window.isDestroyed()) {
            return false;
        }
        // Update position
        window.setBounds({
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height
        });
        // Update configuration
        config.position = position;
        this.overlayConfigs.set(overlayId, config);
        return true;
    }
    updateOverlayStyle(overlayId, styleUpdate) {
        const window = this.overlayWindows.get(overlayId);
        const config = this.overlayConfigs.get(overlayId);
        if (!window || !config || window.isDestroyed()) {
            return false;
        }
        // Merge style updates
        config.style = { ...config.style, ...styleUpdate };
        this.overlayConfigs.set(overlayId, config);
        // Send style update to overlay window
        window.webContents.send('style-update', config.style);
        return true;
    }
    showOverlay(overlayId) {
        const window = this.overlayWindows.get(overlayId);
        const config = this.overlayConfigs.get(overlayId);
        if (!window || !config || window.isDestroyed()) {
            return false;
        }
        window.show();
        config.visible = true;
        this.overlayConfigs.set(overlayId, config);
        return true;
    }
    hideOverlay(overlayId) {
        const window = this.overlayWindows.get(overlayId);
        const config = this.overlayConfigs.get(overlayId);
        if (!window || !config || window.isDestroyed()) {
            return false;
        }
        window.hide();
        config.visible = false;
        this.overlayConfigs.set(overlayId, config);
        return true;
    }
    destroyOverlay(overlayId) {
        const window = this.overlayWindows.get(overlayId);
        if (window && !window.isDestroyed()) {
            window.close();
        }
        this.overlayWindows.delete(overlayId);
        this.overlayConfigs.delete(overlayId);
        return true;
    }
    getOverlayConfigs() {
        return Array.from(this.overlayConfigs.values());
    }
    repositionOverlayForRegion(overlayId, regionBounds) {
        const config = this.overlayConfigs.get(overlayId);
        if (!config)
            return false;
        let newPosition;
        switch (config.displayMode) {
            case 'sidebar':
                // Position to the right of the region
                newPosition = {
                    x: regionBounds.x + regionBounds.width + 20,
                    y: regionBounds.y,
                    width: 350,
                    height: Math.max(400, regionBounds.height),
                    anchor: 'topLeft'
                };
                break;
            case 'tooltip':
                // Position below the region
                newPosition = {
                    x: regionBounds.x,
                    y: regionBounds.y + regionBounds.height + 10,
                    width: Math.max(300, regionBounds.width),
                    height: 200,
                    anchor: 'topLeft'
                };
                break;
            case 'floating':
                // Position in optimal screen location
                newPosition = this.calculateOptimalPosition();
                break;
            default:
                return false;
        }
        // Ensure the overlay stays within screen bounds
        const display = electron_1.screen.getDisplayMatching(regionBounds);
        newPosition = this.constrainToDisplay(newPosition, display);
        return this.updateOverlayPosition(overlayId, newPosition);
    }
    constrainToDisplay(position, display) {
        const workArea = display.workArea;
        // Adjust position to stay within screen bounds
        if (position.x + position.width > workArea.x + workArea.width) {
            position.x = workArea.x + workArea.width - position.width - 20;
        }
        if (position.y + position.height > workArea.y + workArea.height) {
            position.y = workArea.y + workArea.height - position.height - 20;
        }
        if (position.x < workArea.x) {
            position.x = workArea.x + 20;
        }
        if (position.y < workArea.y) {
            position.y = workArea.y + 20;
        }
        return position;
    }
    generateOverlayHTML(config) {
        const style = config.style;
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: ${style.fontFamily};
            font-size: ${style.fontSize}px;
            color: ${style.textColor};
            background: ${style.backgroundColor};
            border-radius: ${style.borderRadius}px;
            padding: ${style.padding}px;
            opacity: ${style.opacity};
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .translation-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .original-text {
            font-weight: 500;
            line-height: 1.4;
            word-wrap: break-word;
        }
        
        .pinyin-text {
            font-style: italic;
            opacity: 0.8;
            font-size: 0.9em;
            line-height: 1.3;
        }
        
        .translated-text {
            font-size: 1.1em;
            line-height: 1.5;
            word-wrap: break-word;
        }
        
        .tone-1 { color: #ff6b6b; }
        .tone-2 { color: #4ecdc4; }
        .tone-3 { color: #45b7d1; }
        .tone-4 { color: #96ceb4; }
        .tone-0 { color: #feca57; }
        
        .confidence-indicator {
            position: absolute;
            top: 5px;
            right: 5px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            opacity: 0.6;
        }
        
        .confidence-high { background: #2ecc71; }
        .confidence-medium { background: #f39c12; }
        .confidence-low { background: #e74c3c; }
        
        .provider-badge {
            position: absolute;
            bottom: 5px;
            right: 5px;
            font-size: 10px;
            opacity: 0.5;
            text-transform: uppercase;
        }
        
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.7;
        }
        
        .loading-spinner {
            width: 20px;
            height: 20px;
            border: 2px solid transparent;
            border-top: 2px solid currentColor;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.5;
            text-align: center;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="translation-container">
        <div class="empty-state">
            Select a region and start monitoring to see translations here
        </div>
    </div>
    
    <div class="confidence-indicator confidence-medium"></div>
    <div class="provider-badge">gemini</div>
    
    <script>
        let currentTranslation = null;
        let currentConfig = null;
        
        // Handle overlay configuration
        window.electronAPI.onOverlayConfig((config) => {
            currentConfig = config;
            updateTheme(config.style);
        });
        
        // Handle translation updates
        window.electronAPI.onTranslationUpdate((translation) => {
            currentTranslation = translation;
            displayTranslation(translation);
        });
        
        // Handle style updates
        window.electronAPI.onStyleUpdate((style) => {
            updateTheme(style);
        });
        
        function displayTranslation(translation) {
            const container = document.querySelector('.translation-container');
            
            let html = '';
            
            if (translation.originalText) {
                html += '<div class="original-text">' + escapeHtml(translation.originalText) + '</div>';
            }
            
            if (translation.pinyin) {
                html += '<div class="pinyin-text">' + formatPinyin(translation.pinyin, translation.tones) + '</div>';
            }
            
            if (translation.translatedText) {
                html += '<div class="translated-text">' + escapeHtml(translation.translatedText) + '</div>';
            }
            
            container.innerHTML = html;
            
            // Update confidence indicator
            updateConfidenceIndicator(translation.confidence);
            
            // Update provider badge
            updateProviderBadge(translation.provider);
        }
        
        function formatPinyin(pinyin, tones) {
            if (!tones || tones.length === 0) {
                return escapeHtml(pinyin);
            }
            
            const syllables = pinyin.split(' ');
            return syllables.map((syllable, index) => {
                const tone = tones[index] || 0;
                return '<span class="tone-' + tone + '">' + escapeHtml(syllable) + '</span>';
            }).join(' ');
        }
        
        function updateConfidenceIndicator(confidence) {
            const indicator = document.querySelector('.confidence-indicator');
            indicator.className = 'confidence-indicator ';
            
            if (confidence >= 0.8) {
                indicator.className += 'confidence-high';
            } else if (confidence >= 0.5) {
                indicator.className += 'confidence-medium';
            } else {
                indicator.className += 'confidence-low';
            }
        }
        
        function updateProviderBadge(provider) {
            const badge = document.querySelector('.provider-badge');
            badge.textContent = provider || 'unknown';
        }
        
        function updateTheme(style) {
            document.body.style.fontFamily = style.fontFamily;
            document.body.style.fontSize = style.fontSize + 'px';
            document.body.style.color = style.textColor;
            document.body.style.background = style.backgroundColor;
            document.body.style.borderRadius = style.borderRadius + 'px';
            document.body.style.padding = style.padding + 'px';
            document.body.style.opacity = style.opacity;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>
    `;
    }
    cleanup() {
        // Close all overlay windows
        for (const [overlayId, window] of this.overlayWindows) {
            if (!window.isDestroyed()) {
                window.close();
            }
        }
        this.overlayWindows.clear();
        this.overlayConfigs.clear();
    }
}
exports.OverlayWindowHelper = OverlayWindowHelper;
//# sourceMappingURL=OverlayWindowHelper.js.map