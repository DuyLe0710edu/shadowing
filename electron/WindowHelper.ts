
import { BrowserWindow, screen } from "electron"
import { AppState } from "main"
import path from "node:path"

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../dist/index.html")}`

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private appState: AppState

  // Initialize with explicit number type and 0 value
  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 0
  private currentX: number = 0
  private currentY: number = 0
  // Virtual desktop bounds across all displays
  private virtualMinX: number = 0
  private virtualMaxX: number = 0
  private virtualMinY: number = 0
  private virtualMaxY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // Get current window position
    const [currentX, currentY] = this.mainWindow.getPosition()

    // Recalculate virtual bounds in case displays changed
    const displays = screen.getAllDisplays()
    this.virtualMinX = Math.min(...displays.map(d => d.bounds.x))
    this.virtualMinY = Math.min(...displays.map(d => d.bounds.y))
    this.virtualMaxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width))
    this.virtualMaxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height))

    // Use 75% width if debugging has occurred, otherwise use 60%
    // Fall back to current window width if we cannot compute a reasonable cap
    const primaryWorkAreaWidth = screen.getPrimaryDisplay().workAreaSize.width
    const maxAllowedWidth = Math.floor(
      primaryWorkAreaWidth * (this.appState.getHasDebugged() ? 0.75 : 0.5)
    ) || (this.windowSize?.width ?? width)

    // Ensure width doesn't exceed max allowed width and height is reasonable
    const newWidth = Math.min(width + 32, maxAllowedWidth)
    const newHeight = Math.ceil(height)

    // Keep current X/Y but clamp within virtual desktop bounds
    const minX = this.virtualMinX
    const maxX = this.virtualMaxX - newWidth
    const minY = this.virtualMinY
    const maxY = this.virtualMaxY - newHeight
    const newX = Math.min(Math.max(currentX, minX), maxX)
    const newY = Math.min(Math.max(currentY, minY), maxY)

    // Update window bounds
    this.mainWindow.setBounds({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    })

    // Update internal state
    this.windowPosition = { x: newX, y: newY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    // Compute virtual desktop bounds across all displays so we can move
    // the window freely between monitors using keyboard shortcuts
    const displays = screen.getAllDisplays()
    this.virtualMinX = Math.min(...displays.map(d => d.bounds.x))
    this.virtualMinY = Math.min(...displays.map(d => d.bounds.y))
    this.virtualMaxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width))
    this.virtualMaxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height))

    this.screenWidth = this.virtualMaxX - this.virtualMinX
    this.screenHeight = this.virtualMaxY - this.virtualMinY

    this.step = Math.max(20, Math.floor(this.screenWidth / 10)) // ensure sensible step
    this.currentX = this.virtualMinX // Start at the left-most point of the virtual desktop

    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      height: 600,
      minWidth: undefined,
      maxWidth: undefined,
      x: this.currentX,
      y: 0,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js")
      },
      show: true,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      fullscreenable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      focusable: true
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    // this.mainWindow.webContents.openDevTools()
    //this.mainWindow.setContentProtection(true)
    this.mainWindow.setContentProtection(false)
    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }
    if (process.platform === "linux") {
      // Linux-specific optimizations for stealth overlays
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      this.mainWindow.setFocusable(false)
    } 
    this.mainWindow.setSkipTaskbar(true)
    this.mainWindow.setAlwaysOnTop(true)

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("Failed to load URL:", err)
    })

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.currentX = bounds.x
    this.currentY = bounds.y

    this.setupWindowListeners()
    this.isWindowVisible = true
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.currentX = bounds.x
        this.currentY = bounds.y
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
      }
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public hideMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    if (this.windowPosition && this.windowSize) {
      this.mainWindow.setBounds({
        x: this.windowPosition.x,
        y: this.windowPosition.y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.mainWindow.showInactive()

    this.isWindowVisible = true
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  // New methods for window movement
  public moveWindowRight(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    const maxX = this.virtualMaxX - windowWidth
    this.currentX = Math.min(maxX, this.currentX + this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowLeft(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    const minX = this.virtualMinX
    this.currentX = Math.max(minX, this.currentX - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowDown(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    const maxY = this.virtualMaxY - windowHeight
    this.currentY = Math.min(maxY, this.currentY + this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowUp(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    const minY = this.virtualMinY
    this.currentY = Math.max(minY, this.currentY - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public cleanup(): void {
    // Close main window if it exists
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
      this.mainWindow = null
    }
  }
}
