// OverlayWindowHelper.ts
import { BrowserWindow, screen, ipcMain } from "electron"
import path from "node:path"
import { TranslationResult } from "./TranslationHelper"

export interface OverlayPosition {
  x: number
  y: number
  width: number
  height: number
  anchor: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center'
}

export interface OverlayStyle {
  theme: 'dark' | 'light' | 'auto'
  opacity: number
  fontSize: number
  fontFamily: string
  backgroundColor: string
  textColor: string
  borderRadius: number
  padding: number
}

export interface OverlayConfig {
  id: string
  regionId: string
  position: OverlayPosition
  style: OverlayStyle
  visible: boolean
  displayMode: 'sidebar' | 'tooltip' | 'inline' | 'floating'
  autoHide: boolean
  autoHideDelay: number
}

export class OverlayWindowHelper {
  private overlayWindows: Map<string, BrowserWindow> = new Map()
  private overlayConfigs: Map<string, OverlayConfig> = new Map()
  private isDev = process.env.NODE_ENV === "development"

  private defaultStyle: OverlayStyle = {
    theme: 'dark',
    opacity: 0.9,
    fontSize: 14,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    textColor: '#ffffff',
    borderRadius: 8,
    padding: 12
  }

  constructor() {
    this.setupIpcHandlers()
  }

  private setupIpcHandlers(): void {
    ipcMain.handle("create-translation-overlay", (_, config: Partial<OverlayConfig>) => 
      this.createOverlay(config))
    ipcMain.handle("update-overlay-translation", (_, overlayId: string, translation: TranslationResult) => 
      this.updateOverlayTranslation(overlayId, translation))
    ipcMain.handle("update-overlay-position", (_, overlayId: string, position: OverlayPosition) => 
      this.updateOverlayPosition(overlayId, position))
    ipcMain.handle("update-overlay-style", (_, overlayId: string, style: Partial<OverlayStyle>) => 
      this.updateOverlayStyle(overlayId, style))
    ipcMain.handle("show-overlay", (_, overlayId: string) => this.showOverlay(overlayId))
    ipcMain.handle("hide-overlay", (_, overlayId: string) => this.hideOverlay(overlayId))
    ipcMain.handle("destroy-overlay", (_, overlayId: string) => this.destroyOverlay(overlayId))
    ipcMain.handle("get-overlay-configs", () => this.getOverlayConfigs())
  }

  public createOverlay(config: Partial<OverlayConfig>): string {
    const overlayId = config.id || `overlay_${Date.now()}`
    
    const defaultConfig: OverlayConfig = {
      id: overlayId,
      regionId: config.regionId || '',
      position: config.position || this.calculateOptimalPosition(),
      style: { ...this.defaultStyle, ...config.style },
      visible: config.visible !== false,
      displayMode: config.displayMode || 'sidebar',
      autoHide: config.autoHide || false,
      autoHideDelay: config.autoHideDelay || 3000
    }

    // Store the configuration
    this.overlayConfigs.set(overlayId, defaultConfig)

    // Create the overlay window
    const overlayWindow = this.createOverlayWindow(defaultConfig)
    this.overlayWindows.set(overlayId, overlayWindow)

    return overlayId
  }

  private createOverlayWindow(config: OverlayConfig): BrowserWindow {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
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
        preload: path.join(__dirname, "overlay-preload.js"),
        devTools: this.isDev
      }
    }

    const window = new BrowserWindow(windowOptions)
    
    // Load the overlay HTML
    const overlayHtml = this.generateOverlayHTML(config)
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`)

    // Handle window events
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('overlay-config', config)
    })

    // Set initial visibility
    if (!config.visible) {
      window.hide()
    }

    return window
  }

  private calculateOptimalPosition(): OverlayPosition {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    
    // Default to right sidebar position
    const overlayWidth = 350
    const overlayHeight = 400
    
    return {
      x: screenWidth - overlayWidth - 20,
      y: 100,
      width: overlayWidth,
      height: overlayHeight,
      anchor: 'topRight'
    }
  }

  public updateOverlayTranslation(overlayId: string, translation: TranslationResult): boolean {
    const window = this.overlayWindows.get(overlayId)
    const config = this.overlayConfigs.get(overlayId)
    
    if (!window || !config || window.isDestroyed()) {
      return false
    }

    // Send translation data to overlay window
    window.webContents.send('translation-update', translation)

    // Handle auto-hide functionality
    if (config.autoHide) {
      this.showOverlay(overlayId)
      setTimeout(() => {
        this.hideOverlay(overlayId)
      }, config.autoHideDelay)
    }

    return true
  }

  public updateOverlayPosition(overlayId: string, position: OverlayPosition): boolean {
    const window = this.overlayWindows.get(overlayId)
    const config = this.overlayConfigs.get(overlayId)
    
    if (!window || !config || window.isDestroyed()) {
      return false
    }

    // Update position
    window.setBounds({
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height
    })

    // Update configuration
    config.position = position
    this.overlayConfigs.set(overlayId, config)

    return true
  }

  public updateOverlayStyle(overlayId: string, styleUpdate: Partial<OverlayStyle>): boolean {
    const window = this.overlayWindows.get(overlayId)
    const config = this.overlayConfigs.get(overlayId)
    
    if (!window || !config || window.isDestroyed()) {
      return false
    }

    // Merge style updates
    config.style = { ...config.style, ...styleUpdate }
    this.overlayConfigs.set(overlayId, config)

    // Send style update to overlay window
    window.webContents.send('style-update', config.style)

    return true
  }

  public showOverlay(overlayId: string): boolean {
    const window = this.overlayWindows.get(overlayId)
    const config = this.overlayConfigs.get(overlayId)
    
    if (!window || !config || window.isDestroyed()) {
      return false
    }

    window.show()
    config.visible = true
    this.overlayConfigs.set(overlayId, config)

    return true
  }

  public hideOverlay(overlayId: string): boolean {
    const window = this.overlayWindows.get(overlayId)
    const config = this.overlayConfigs.get(overlayId)
    
    if (!window || !config || window.isDestroyed()) {
      return false
    }

    window.hide()
    config.visible = false
    this.overlayConfigs.set(overlayId, config)

    return true
  }

  public destroyOverlay(overlayId: string): boolean {
    const window = this.overlayWindows.get(overlayId)
    
    if (window && !window.isDestroyed()) {
      window.close()
    }

    this.overlayWindows.delete(overlayId)
    this.overlayConfigs.delete(overlayId)

    return true
  }

  public getOverlayConfigs(): OverlayConfig[] {
    return Array.from(this.overlayConfigs.values())
  }

  public repositionOverlayForRegion(overlayId: string, regionBounds: { x: number, y: number, width: number, height: number }): boolean {
    const config = this.overlayConfigs.get(overlayId)
    if (!config) return false

    let newPosition: OverlayPosition

    switch (config.displayMode) {
      case 'sidebar':
        // Position to the right of the region
        newPosition = {
          x: regionBounds.x + regionBounds.width + 20,
          y: regionBounds.y,
          width: 350,
          height: Math.max(400, regionBounds.height),
          anchor: 'topLeft'
        }
        break

      case 'tooltip':
        // Position below the region
        newPosition = {
          x: regionBounds.x,
          y: regionBounds.y + regionBounds.height + 10,
          width: Math.max(300, regionBounds.width),
          height: 200,
          anchor: 'topLeft'
        }
        break

      case 'floating':
        // Position in optimal screen location
        newPosition = this.calculateOptimalPosition()
        break

      default:
        return false
    }

    // Ensure the overlay stays within screen bounds
    const display = screen.getDisplayMatching(regionBounds)
    newPosition = this.constrainToDisplay(newPosition, display)

    return this.updateOverlayPosition(overlayId, newPosition)
  }

  private constrainToDisplay(position: OverlayPosition, display: Electron.Display): OverlayPosition {
    const workArea = display.workArea

    // Adjust position to stay within screen bounds
    if (position.x + position.width > workArea.x + workArea.width) {
      position.x = workArea.x + workArea.width - position.width - 20
    }
    if (position.y + position.height > workArea.y + workArea.height) {
      position.y = workArea.y + workArea.height - position.height - 20
    }
    if (position.x < workArea.x) {
      position.x = workArea.x + 20
    }
    if (position.y < workArea.y) {
      position.y = workArea.y + 20
    }

    return position
  }

  private generateOverlayHTML(config: OverlayConfig): string {
    const style = config.style
    
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
    `
  }

  public cleanup(): void {
    // Close all overlay windows
    for (const [overlayId, window] of this.overlayWindows) {
      if (!window.isDestroyed()) {
        window.close()
      }
    }
    
    this.overlayWindows.clear()
    this.overlayConfigs.clear()
  }
}