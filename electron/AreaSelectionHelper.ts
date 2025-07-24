// AreaSelectionHelper.ts
import { BrowserWindow, screen, desktopCapturer, ipcMain } from "electron"
import { v4 as uuidv4 } from "uuid"
import path from "node:path"
import fs from "node:fs"
import { app } from "electron"
import screenshot from "screenshot-desktop"
import sharp from "sharp"

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
  private monitoringInterval: NodeJS.Timeout | null = null
  private readonly MONITOR_INTERVAL = 1000 // Check every second
  private readonly regionsDir: string

  constructor() {
    this.regionsDir = path.join(app.getPath("userData"), "selected_regions")
    if (!fs.existsSync(this.regionsDir)) {
      fs.mkdirSync(this.regionsDir, { recursive: true })
    }
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

    // Create a transparent window covering all displays
    this.selectionWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width: screen.getPrimaryDisplay().size.width,
      height: screen.getPrimaryDisplay().size.height,
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
    
    const region: SelectedRegion = {
      id: regionId,
      x: selection.x,
      y: selection.y,
      width: selection.width,
      height: selection.height,
      displayId: primaryDisplay.id,
      isActive: false
    }

    this.selectedRegions.set(regionId, region)
    this.stopAreaSelection()

    // Take initial screenshot of the region
    await this.captureRegion(region)

    // Notify main window about new region
    this.notifyRegionChange("region-added", region)
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
      // Use screenshot-desktop to capture the full screen
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })

      if (sources.length === 0) return null

      // Get the display that contains this region
      const display = screen.getDisplayMatching({
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height
      })

      // Take screenshot of entire screen first
      const fullScreenshot = await screenshot({ screen: display.id })
      
      // Crop to the selected region using Sharp
      const croppedImage = await sharp(fullScreenshot)
        .extract({
          left: Math.max(0, region.x - display.bounds.x),
          top: Math.max(0, region.y - display.bounds.y),
          width: region.width,
          height: region.height
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
      console.log(`Monitoring already running, clearing previous interval`)
      clearInterval(this.monitoringInterval)
    }

    console.log(`Starting monitoring with ${this.MONITOR_INTERVAL}ms interval`)
    
    this.monitoringInterval = setInterval(async () => {
      console.log(`Monitoring tick - checking active regions...`)
      let activeCount = 0
      
      for (const [regionId, region] of this.selectedRegions) {
        if (region.isActive) {
          activeCount++
          console.log(`Checking region ${regionId} for changes...`)
          await this.checkRegionForChanges(region)
        }
      }
      
      console.log(`Checked ${activeCount} active regions`)
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

      // Generate a hash of the image to detect changes
      const imageHash = await this.generateImageHash(screenshot)
      
      if (region.lastTextHash && region.lastTextHash === imageHash) {
        // No change detected
        return
      }

      // Update the hash
      region.lastTextHash = imageHash

      // Save the screenshot for OCR processing
      const filepath = await this.saveRegionScreenshot(region, screenshot)
      if (filepath) {
        // Notify that this region has changed and needs translation
        this.notifyRegionChange("region-changed", region, filepath)
      }
    } catch (error) {
      console.error("Error checking region for changes:", error)
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
    
    // Remove from map
    this.selectedRegions.delete(regionId)

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

    region.isActive = !region.isActive
    console.log(`Region ${regionId} monitoring ${region.isActive ? 'ENABLED' : 'DISABLED'}`)
    
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
    const mainWindow = allWindows.find(window => !window.isDestroyed() && window.webContents.getURL().includes("index.html"))
    
    if (mainWindow) {
      mainWindow.webContents.send(event, { region, filepath })
    }
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

  public cleanup(): void {
    this.stopMonitoring()
    this.stopAreaSelection()
    this.selectedRegions.clear()
  }
}