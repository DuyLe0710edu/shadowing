// AreaSelectionHelper.ts
import { BrowserWindow, screen, desktopCapturer, ipcMain } from "electron"
import { v4 as uuidv4 } from "uuid"
import path from "node:path"
import fs from "node:fs"
import { app } from "electron"
import screenshot from "screenshot-desktop"
import sharp from "sharp"
import { OCRServiceManager, OCRResult } from "./OCRServiceManager"

export interface SelectedRegion {
  id: string
  x: number
  y: number
  width: number
  height: number
  displayId: number
  isActive: boolean
  lastText?: string
  lastTextHash?: string
}

export interface RegionChangeData {
  regionId: string
  newText: string
  confidence: number
  timestamp: number
}

export class AreaSelectionHelper {
  private selectedRegions: Map<string, SelectedRegion> = new Map()
  private selectionWindow: BrowserWindow | null = null
  private regionOverlays: Map<string, BrowserWindow> = new Map()
  private monitoringInterval: NodeJS.Timeout | null = null
  private readonly MONITOR_INTERVAL = 1000 // Check every second
  private readonly regionsDir: string
  private ocrServiceManager: OCRServiceManager
  private lastToggleAtByRegion: Map<string, number> = new Map()

  constructor(ocrServiceManager: OCRServiceManager) {
    this.regionsDir = path.join(app.getPath("userData"), "selected_regions")
    if (!fs.existsSync(this.regionsDir)) {
      fs.mkdirSync(this.regionsDir, { recursive: true })
    }
    this.ocrServiceManager = ocrServiceManager
    
    // Load persisted regions on startup, but default them to inactive
    this.loadPersistedRegions()
  }

  public async startAreaSelection(): Promise<void> {
    console.log('Starting area selection...')
    
    if (this.selectionWindow) {
      console.log('Closing existing selection window')
      this.selectionWindow.close()
    }

    // Get all displays
    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()

    // Create a transparent window covering the entire screen (including menubar area)
    const bounds = primaryDisplay.bounds
    this.selectionWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
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
        preload: path.join(__dirname, "area-selection-preload.js")
      }
    })
    
    console.log(`Selection window bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`)

    // Window is transparent, selection elements will be visible

    // Load the selection overlay HTML
    const selectionHtml = this.generateSelectionHTML()
    this.selectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(selectionHtml)}`)

    // Handle selection completion
    this.selectionWindow.webContents.once("did-finish-load", () => {
      console.log('Selection window loaded, showing window')
      this.selectionWindow?.webContents.send("init-selection", displays)
      this.selectionWindow?.show()
    })

    // Handle selection events
    ipcMain.once("selection-completed", (_, selection: { x: number, y: number, width: number, height: number }) => {
      this.handleSelectionCompleted(selection)
    })

    ipcMain.once("selection-cancelled", () => {
      this.stopAreaSelection()
    })
  }

  public stopAreaSelection(): void {
    if (this.selectionWindow) {
      this.selectionWindow.close()
      this.selectionWindow = null
    }
  }

  private async handleSelectionCompleted(selection: { x: number, y: number, width: number, height: number }) {
    const regionId = uuidv4()
    const primaryDisplay = screen.getPrimaryDisplay()
    const bounds = primaryDisplay.bounds
    const workArea = primaryDisplay.workArea
    const scaleFactor = primaryDisplay.scaleFactor
    
    
    console.log(`[DEBUG] Raw browser selection coords: x=${selection.x}, y=${selection.y}, w=${selection.width}, h=${selection.height}`)
    console.log(`[DEBUG] Primary display bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`)
    console.log(`[DEBUG] Primary display workArea: x=${workArea.x}, y=${workArea.y}, w=${workArea.width}, h=${workArea.height}`)
    console.log(`[DEBUG] Display scale factor: ${scaleFactor}`)
    
    // Check if selection window was positioned correctly
    if (this.selectionWindow) {
      const windowBounds = this.selectionWindow.getBounds()
      console.log(`[DEBUG] Selection window bounds: x=${windowBounds.x}, y=${windowBounds.y}, w=${windowBounds.width}, h=${windowBounds.height}`)
      console.log(`[DEBUG] Selection window position matches display bounds: ${windowBounds.x === bounds.x && windowBounds.y === bounds.y}`)
    }
    
    // Convert selection coordinates to screen coordinates
    // Since selection window covers full bounds, coordinates should be absolute
    const region: SelectedRegion = {
      id: regionId,
      x: bounds.x + selection.x,
      y: bounds.y + selection.y,
      width: selection.width,
      height: selection.height,
      displayId: primaryDisplay.id,
      isActive: false
    }
    
    console.log(`[DEBUG] Calculated region coords: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height}`)
    console.log(`[DEBUG] Region center point: x=${region.x + region.width/2}, y=${region.y + region.height/2}`)
    console.log(`[DEBUG] Screen center point: x=${bounds.width/2}, y=${bounds.height/2}`)
    
    // Additional debug info to understand the coordinate system
    const mousePosition = screen.getCursorScreenPoint()
    console.log(`[DEBUG] Current mouse position: x=${mousePosition.x}, y=${mousePosition.y}`)
    
    // Check if region coordinates are within display bounds
    const withinBounds = region.x >= bounds.x && 
                        region.y >= bounds.y && 
                        region.x + region.width <= bounds.x + bounds.width && 
                        region.y + region.height <= bounds.y + bounds.height
    console.log(`[DEBUG] Region within display bounds: ${withinBounds}`)
    console.log(`==================== COORDINATE DEBUG END ====================`)

    this.selectedRegions.set(regionId, region)
    this.saveRegions() // Persist after adding region
    this.stopAreaSelection()

    // Create overlay window but keep hidden until user activates monitoring
    this.createRegionOverlay(region)

    // Start monitoring only if there is at least one active region
    if (!this.monitoringInterval && Array.from(this.selectedRegions.values()).some(r => r.isActive)) {
      console.log('[MONITOR] Starting after detecting an active region')
      this.startMonitoring()
    }

    // Do not capture while inactive

    // Notify main window about new region
    this.notifyRegionChange('region-added', region)
  }

  public async captureRegion(region: SelectedRegion): Promise<string | null> {
    try {
      // Capture the specific region
      const screenshot = await this.captureRegionScreenshot(region)
      if (!screenshot) return null

      // Save the screenshot  
      const timestamp = Date.now()
      const filename = `region_${region.id}_${timestamp}.png`
      const filepath = path.join(this.regionsDir, filename)
      
      await fs.promises.writeFile(filepath, screenshot)
      
      return filepath
    } catch (error) {
      console.error("Error capturing region:", error)
      return null
    }
  }

  private async captureRegionScreenshot(region: SelectedRegion): Promise<Buffer | null> {
    try {
      console.log(`[SCREENSHOT] Capturing region: x=${region.x}, y=${region.y}, w=${region.width}, h=${region.height}`)
      
      // Get the display that contains this region
      const display = screen.getDisplayMatching({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      })
      
      console.log(`[SCREENSHOT] Display bounds: x=${display.bounds.x}, y=${display.bounds.y}, w=${display.bounds.width}, h=${display.bounds.height}`)

      // Take screenshot of the entire screen
      const fullScreenshot = await screenshot()  // PNG buffer
      
      // Calculate crop coordinates relative to the full screenshot.
      // NOTE: Electron region coordinates are in *logical* pixels, whereas the
      // screenshot buffer is in *device* pixels.  We therefore scale by the
      // display’s scaleFactor (2.0 on most Retina Macs) to avoid vertical
      // offset bugs where the wrong part of the screen is captured.
      const factor = display.scaleFactor || 1

      const cropLeftLogical = region.x - display.bounds.x
      const cropTopLogical  = region.y - display.bounds.y

      const cropLeft = Math.round(cropLeftLogical * factor)
      const cropTop  = Math.round(cropTopLogical  * factor)
      const cropWidth  = Math.round(region.width  * factor)
      const cropHeight = Math.round(region.height * factor)
      
      console.log(`[SCREENSHOT] Crop coordinates (device pixels): left=${cropLeft}, top=${cropTop}, w=${cropWidth}, h=${cropHeight} (scaleFactor=${factor})`)
      
      // Ensure crop coordinates are within bounds
      const safeLeft   = Math.max(0, Math.min(cropLeft,  display.bounds.width  * factor - cropWidth))
      const safeTop    = Math.max(0, Math.min(cropTop,   display.bounds.height * factor - cropHeight))
      const safeWidth  = Math.min(cropWidth,  display.bounds.width  * factor - safeLeft)
      const safeHeight = Math.min(cropHeight, display.bounds.height * factor - safeTop)
      
      console.log(`[SCREENSHOT] Safe crop (device pixels): left=${safeLeft}, top=${safeTop}, w=${safeWidth}, h=${safeHeight}`)
      
      // Crop to the selected region using Sharp
      const croppedImage = await sharp(fullScreenshot)
        .extract({
          left: safeLeft,
          top: safeTop,
          width: safeWidth,
          height: safeHeight
        })
        .png()
        .toBuffer()

      return croppedImage
    } catch (error) {
      console.error("Error in captureRegionScreenshot:", error)
      return null
    }
  }

  public startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    console.log(`[MONITOR] Started (${this.selectedRegions.size} regions)`)
    
    this.monitoringInterval = setInterval(async () => {
      for (const [regionId, region] of this.selectedRegions) {
        if (region.isActive) {
          try {
            await this.checkRegionForChanges(region)
          } catch (error) {
            console.error(`[MONITOR] Region ${regionId.substring(0, 8)} error:`, error.message)
          }
        }
      }
    }, this.MONITOR_INTERVAL)
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  private async checkRegionForChanges(region: SelectedRegion): Promise<void> {
    try {
      const screenshot = await this.captureRegionScreenshot(region)
      if (!screenshot) return

      const filepath = await this.saveRegionScreenshot(region, screenshot)
      if (!filepath) return

      // Extract text using OCR service
      const ocrResult = await this.extractTextFromImage(filepath)
      const extractedText = ocrResult.text
      
      // Compare with previous text
      if (region.lastText === extractedText) return

      // Update region with new text
      region.lastText = extractedText

      // Only proceed if we have meaningful text
      if (extractedText && extractedText.trim().length > 2) {
        this.notifyRegionChange('region-changed', region, filepath)
        // Live-update the overlay with the new raw text and its metadata
        const overlay = this.regionOverlays.get(region.id)
        overlay?.webContents.send('overlay-update', {
          id: region.id,
          text: extractedText,
          confidence: ocrResult.confidence,
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error(`[REGION] Error:`, error.message)
    }
  }

  private async extractTextFromImage(imagePath: string): Promise<OCRResult> {
    try {
      const result = await this.ocrServiceManager.extractText(imagePath)

      // Accept all OCR results regardless of confidence so that the raw
      // text is always visible in the UI.  Low-confidence hits are still
      // logged for debugging, but we no longer discard them.
      if (result.confidence < 70) {
        console.log(`[OCR] Low confidence (${result.confidence}%) – displaying anyway`)
      }

      console.log(`[OCR] "${result.text}" (${result.confidence}%)`)
      result.text = result.text.trim()
      return result
    } catch (error) {
      console.error(`[OCR] Failed:`, error.message)
      return { text: '', confidence: 0, wordCount: 0 }
    }
  }

  private async generateImageHash(imageBuffer: Buffer): Promise<string> {
    // Use Sharp to generate a simple hash based on image statistics
    const stats = await sharp(imageBuffer).stats()
    const hash = stats.channels.map(channel => 
      Math.round(channel.mean).toString(16)
    ).join('')
    return hash
  }

  private async saveRegionScreenshot(region: SelectedRegion, screenshot: Buffer): Promise<string> {
    const timestamp = Date.now()
    const filename = `region_${region.id}_${timestamp}.png`
    const filepath = path.join(this.regionsDir, filename)
    
    await fs.promises.writeFile(filepath, screenshot)
    return filepath
  }

  public getSelectedRegions(): SelectedRegion[] {
    return Array.from(this.selectedRegions.values())
  }

  public deleteRegion(regionId: string): boolean {
    const region = this.selectedRegions.get(regionId)
    if (!region) return false

    // Stop monitoring this region
    region.isActive = false
    
    // Destroy the overlay for this region
    this.destroyRegionOverlay(regionId)
    
    // Remove from map
    this.selectedRegions.delete(regionId)
    this.saveRegions() // Persist after deleting region

    // Clean up any saved screenshots for this region
    this.cleanupRegionFiles(regionId)

    this.notifyRegionChange("region-deleted", region)
    return true
  }

  public toggleRegionMonitoring(regionId: string): boolean {
    const region = this.selectedRegions.get(regionId)
    if (!region) {
      console.log(`Region ${regionId} not found`)
      return false
    }

    // Debounce rapid toggles to avoid race conditions with capture loop
    const now = Date.now()
    const last = this.lastToggleAtByRegion.get(regionId) || 0
    if (now - last < 250) {
      return false
    }
    this.lastToggleAtByRegion.set(regionId, now)

    region.isActive = !region.isActive
    this.saveRegions() // Persist after toggling region state
    console.log(`Region ${regionId} monitoring ${region.isActive ? 'ENABLED' : 'DISABLED'}`)
    
    // Ensure overlay exists when enabling; remove/hide when disabling
    const overlay = this.regionOverlays.get(region.id)
    if (region.isActive) {
      if (!overlay || overlay.isDestroyed()) {
        this.createRegionOverlay(region)
      } else {
        this.updateRegionOverlay(region)
      }
      // Prime capture so UI updates immediately
      this.captureRegion(region).catch(() => {})
    } else {
      this.updateRegionOverlay(region)
    }
    
    if (region.isActive && !this.monitoringInterval) {
      console.log(`Starting monitoring interval...`)
      this.startMonitoring()
    }

    this.notifyRegionChange("region-toggled", region)
    return true
  }

  private cleanupRegionFiles(regionId: string): void {
    try {
      const files = fs.readdirSync(this.regionsDir)
      const regionFiles = files.filter(file => file.includes(`region_${regionId}_`))
      
      for (const file of regionFiles) {
        fs.unlinkSync(path.join(this.regionsDir, file))
      }
    } catch (error) {
      console.error("Error cleaning up region files:", error)
    }
  }

  private notifyRegionChange(event: string, region: SelectedRegion, filepath?: string): void {
    // Find the main window and send the event
    const allWindows = BrowserWindow.getAllWindows()
    const mainWindow = allWindows.find(window => {
      if (window.isDestroyed()) return false
      const url = window.webContents.getURL()
      return url.includes('index.html') || url.startsWith('http://localhost')
    })
    
    if (mainWindow) {
      mainWindow.webContents.send(event, { region, filepath })
    }
    // Also notify other main-process listeners (e.g., M2MTranslationManager)
    ipcMain.emit(event, null, { region, filepath })
  }

  private generateSelectionHTML(): string {
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
    `
  }

  private createRegionOverlay(region: SelectedRegion): void {
    console.log(`Creating overlay for region ${region.id}`)
    
    const overlay = new BrowserWindow({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      frame: false,
      transparent: true,
      alwaysOnTop: false, // Start hidden behind other windows
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'overlay-preload.js')
      }
    })

    // Create a subtle overlay HTML
    const overlayHtml = this.generateOverlayHTML(region)
    overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`)

    overlay.webContents.once('did-finish-load', () => {
      // Tell the overlay which region it belongs to so it can filter updates
      overlay.webContents.send('overlay-init', { id: region.id })

      if (region.isActive) {
        overlay.show()
      }
    })

    // Store the overlay
    this.regionOverlays.set(region.id, overlay)
  }

  private generateOverlayHTML(region: SelectedRegion): string {
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
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.2);
            overflow: hidden;
            user-select: none;
            margin: 0;
            padding: 0;
            position: relative;
            box-sizing: border-box;
        }
        .region-label {
            position: absolute;
            top: 2px;
            left: 2px;
            background: rgba(0, 0, 0, 0.7);
            color: rgba(255, 255, 255, 0.9);
            padding: 2px 6px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 9px;
            font-weight: 500;
            border-radius: 3px;
            pointer-events: none;
            backdrop-filter: blur(4px);
        }
        .active-indicator {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 6px;
            height: 6px;
            background: rgba(0, 255, 100, 0.8);
            border-radius: 50%;
            box-shadow: 0 0 8px rgba(0, 255, 100, 0.4);
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 0.8; transform: scale(1); box-shadow: 0 0 8px rgba(0, 255, 100, 0.4); }
            50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 12px rgba(0, 255, 100, 0.6); }
            100% { opacity: 0.8; transform: scale(1); box-shadow: 0 0 8px rgba(0, 255, 100, 0.4); }
        }
    </style>
</head>
<body>
    <div class="region-label"></div>
    <div class="active-indicator" style="display: ${region.isActive ? 'block' : 'none'}"></div>
</body>
</html>
    `
  }

  private updateRegionOverlay(region: SelectedRegion): void {
    const overlay = this.regionOverlays.get(region.id)
    if (!overlay || overlay.isDestroyed()) {
      return
    }

    if (region.isActive) {
      overlay.show()
      overlay.setAlwaysOnTop(true, 'screen-saver')
    } else {
      overlay.hide()
      overlay.setAlwaysOnTop(false)
    }

    // Update the overlay content to show active state
    const overlayHtml = this.generateOverlayHTML(region)
    overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`)
  }

  private destroyRegionOverlay(regionId: string): void {
    const overlay = this.regionOverlays.get(regionId)
    if (overlay && !overlay.isDestroyed()) {
      overlay.close()
    }
    this.regionOverlays.delete(regionId)
  }

  private getRegionsFilePath(): string {
    return path.join(app.getPath("userData"), "regions.json")
  }

  private loadPersistedRegions(): void {
    try {
      const regionsFile = this.getRegionsFilePath()
      if (fs.existsSync(regionsFile)) {
        const regionsData = JSON.parse(fs.readFileSync(regionsFile, 'utf8'))
        console.log('[REGIONS] Loading persisted regions:', regionsData)
        
        // Convert array back to Map
        if (Array.isArray(regionsData)) {
          for (const region of regionsData) {
            // Default loaded regions to inactive until user explicitly enables
            const normalized = { ...region, isActive: false as boolean }
            this.selectedRegions.set(normalized.id, normalized)
          }
          console.log(`[REGIONS] Loaded ${regionsData.length} persisted regions`)
        }
      }
    } catch (error) {
      console.warn('[REGIONS] Failed to load persisted regions:', error.message)
    }
  }

  private saveRegions(): void {
    try {
      const regionsFile = this.getRegionsFilePath()
      const regionsArray = Array.from(this.selectedRegions.values())
      fs.writeFileSync(regionsFile, JSON.stringify(regionsArray, null, 2), 'utf8')
      console.log(`[REGIONS] Saved ${regionsArray.length} regions to storage`)
    } catch (error) {
      console.warn('[REGIONS] Failed to save regions:', error.message)
    }
  }

  public cleanup(): void {
    this.stopMonitoring()
    this.stopAreaSelection()
    
    // Save regions before cleanup
    this.saveRegions()
    
    // Close all region overlays
    for (const [regionId, overlay] of this.regionOverlays) {
      if (!overlay.isDestroyed()) {
        overlay.close()
      }
    }
    this.regionOverlays.clear()
    
    this.selectedRegions.clear()
  }
}