// TranslationOverlayHelper.ts - Manages floating translation overlay windows
import { BrowserWindow, screen } from "electron"
import path from "node:path"
import { SelectedRegion } from './AreaSelectionHelper'

export interface TranslationOverlay {
  id: string
  regionId: string
  window: BrowserWindow
  originalText: string
  translation: string
}

export class TranslationOverlayHelper {
  private overlays: Map<string, TranslationOverlay> = new Map()

  public async createTranslationOverlay(
    regionId: string, 
    region: SelectedRegion, 
    originalText: string, 
    translation: string
  ): Promise<string> {
    
    // Close existing overlay for this region
    await this.closeOverlay(regionId)

    const overlayId = `overlay_${regionId}_${Date.now()}`
    
    // Position overlay near the region but not overlapping
    const overlayX = region.x + region.width + 10
    const overlayY = region.y
    
    // Calculate overlay size based on content
    const overlayWidth = Math.min(400, Math.max(200, translation.length * 8))
    const overlayHeight = Math.max(100, Math.ceil(translation.length / 50) * 60)

    const overlayWindow = new BrowserWindow({
      x: overlayX,
      y: overlayY,
      width: overlayWidth,
      height: overlayHeight,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // Generate overlay HTML content
    const overlayHtml = this.generateOverlayHTML(originalText, translation)
    overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`)

    // Store overlay reference
    const overlay: TranslationOverlay = {
      id: overlayId,
      regionId,
      window: overlayWindow,
      originalText,
      translation
    }

    this.overlays.set(overlayId, overlay)

    // Auto-close overlay after 10 seconds
    setTimeout(() => {
      this.closeOverlay(regionId)
    }, 10000)

    console.log(`Created translation overlay ${overlayId} for region ${regionId}`)
    return overlayId
  }

  public async closeOverlay(regionId: string): Promise<void> {
    for (const [overlayId, overlay] of this.overlays) {
      if (overlay.regionId === regionId) {
        if (!overlay.window.isDestroyed()) {
          overlay.window.close()
        }
        this.overlays.delete(overlayId)
        console.log(`Closed overlay ${overlayId}`)
      }
    }
  }

  public closeAllOverlays(): void {
    for (const [overlayId, overlay] of this.overlays) {
      if (!overlay.window.isDestroyed()) {
        overlay.window.close()
      }
    }
    this.overlays.clear()
    console.log('Closed all translation overlays')
  }

  private generateOverlayHTML(originalText: string, translation: string): string {
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
            font-family: system-ui, -apple-system, sans-serif;
            background: transparent;
            color: white;
            padding: 12px;
            border-radius: 8px;
            border: 2px dashed white;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .original {
            font-size: 11px;
            color: white;
            margin-bottom: 6px;
            border-bottom: 1px dashed white;
            padding-bottom: 4px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
        }
        .translation {
            font-size: 13px;
            font-weight: 500;
            color: white;
            line-height: 1.4;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
        }
        .fade-out {
            animation: fadeOut 2s ease-in-out 8s forwards;
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    </style>
</head>
<body class="fade-out">
    <div class="original">${originalText}</div>
    <div class="translation">${translation}</div>
</body>
</html>
    `
  }
}