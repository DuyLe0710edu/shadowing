# Technical Architecture Documentation

## Project Structure

### Root Directory
```
shadowing/
├── src/                    # React frontend source
├── electron/              # Electron main process
├── dist/                  # Built frontend assets  
├── dist-electron/         # Compiled Electron files
├── renderer/              # Alternative React setup (unused)
├── worker-script/         # Background worker
└── claude note/           # Documentation (added by Claude)
```

### Frontend Architecture (`src/`)
```
src/
├── App.tsx               # Main React application
├── main.tsx             # React entry point
├── _pages/              # Main application views
│   ├── Debug.tsx        # Code debugging interface
│   ├── Queue.tsx        # Screenshot queue management
│   └── Solutions.tsx    # AI solution display
├── components/          # Reusable React components
│   ├── Queue/          # Screenshot queue components
│   ├── Solutions/      # Solution display components
│   └── ui/             # Base UI components
├── types/              # TypeScript type definitions
└── lib/                # Utility functions
```

### Backend Architecture (`electron/`)
```
electron/
├── main.ts              # Electron main process entry
├── preload.ts           # Renderer<->Main bridge
├── ipcHandlers.ts       # IPC event handlers
├── WindowHelper.ts      # Window management
├── ScreenshotHelper.ts  # Screenshot capture
├── ProcessingHelper.ts  # AI processing coordination
├── LLMHelper.ts         # Gemini AI integration
└── shortcuts.ts         # Global keyboard shortcuts
```

## Core Components

### 1. Main Process (`electron/main.ts`)
**Purpose**: Central application state and coordination

**Key Responsibilities**:
- Initialize Electron app
- Manage application state via `AppState` singleton
- Coordinate between helpers (Window, Screenshot, Processing, Shortcuts)
- Handle view management (queue/solutions/debug)

**Code Location**: `electron/main.ts:8-50`

### 2. Window Management (`electron/WindowHelper.ts`)
**Purpose**: Handle transparent overlay window

**Key Features**:
- Creates transparent, always-on-top window
- Manages window positioning and sizing
- Handles window show/hide functionality
- Updates content dimensions dynamically

### 3. Screenshot System (`electron/ScreenshotHelper.ts`)
**Purpose**: Capture and manage screenshots

**Workflow**:
1. Capture screenshot via keyboard shortcut
2. Save to local storage with preview
3. Maintain queue of up to 5 screenshots
4. Trigger OCR text extraction
5. Send to AI processing pipeline

### 4. AI Processing (`electron/LLMHelper.ts`)
**Purpose**: Google Gemini integration

**Methods**:
- `generateSolution()` - Analyze screenshots and generate code solutions
- `analyzeAudioFromBase64()` - Process voice recordings  
- `extractProblemStatement()` - OCR and text analysis
- `debugSolution()` - Code improvement and debugging

**API Integration**:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
```

### 5. Frontend State Management
**Technology**: React Query for data fetching and caching

**Key Queries**:
- `["extras"]` - Screenshot queue
- `["problem_statement"]` - Extracted problem data
- `["solution"]` - Generated code solution
- `["new_solution"]` - Debug mode solution
- `["audio_result"]` - Voice recording analysis

## Data Flow Architecture

### Screenshot Processing Pipeline
```
User presses Cmd+H
    ↓
ScreenshotHelper.takeScreenshot()
    ↓
Save file + generate preview
    ↓
Emit screenshot-taken event
    ↓
React Query refetch screenshots
    ↓
UI updates with new screenshot
```

### Solution Generation Pipeline  
```
User presses Cmd+Enter
    ↓
ProcessingHelper.processScreenshots()
    ↓
Extract text via OCR (Tesseract.js)
    ↓
LLMHelper.generateSolution()
    ↓
Send to Gemini API
    ↓
Emit solution-success event
    ↓
React Query cache update
    ↓
UI displays solution
```

### Audio Processing Pipeline
```
MediaRecorder captures audio
    ↓
Convert to base64
    ↓
IPC to main process
    ↓
LLMHelper.analyzeAudioFromBase64()
    ↓
Gemini audio analysis
    ↓
Return text + suggestions
    ↓
Update UI with results
```

## IPC Communication

### Event System
**Location**: `electron/main.ts:30-45`

**Events**:
- `processing-unauthorized` - API key issues
- `processing-no-screenshots` - Empty queue
- `initial-start` - Solution generation begins
- `solution-success` - Solution completed
- `solution-error` - Processing failed
- `debug-start` - Debug mode begins
- `debug-success` - Debug completed

### IPC Handlers (`electron/ipcHandlers.ts`)
**Exposed Methods**:
- `take-screenshot` - Capture screen
- `get-screenshots` - Retrieve queue
- `delete-screenshot` - Remove item
- `process-screenshots` - Generate solution
- `analyze-audio-base64` - Process audio
- `update-content-dimensions` - Resize window
- `quit-app` - Exit application

## Security & Permissions

### Electron Security
```typescript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js')
}
```

### API Access
- **Preload Script**: Safely exposes IPC methods to renderer
- **Context Isolation**: Prevents direct Node.js access
- **Type Safety**: TypeScript definitions for all exposed APIs

## Dependencies

### Key Frontend Dependencies
- **React 18.3.1** - UI framework
- **React Query 3.39.3** - Data fetching/caching
- **Tailwind CSS 3.4.15** - Styling
- **React Syntax Highlighter** - Code display
- **Lucide React** - Icons

### Key Backend Dependencies  
- **Electron 33.2.0** - Desktop framework
- **@google/generative-ai 0.2.1** - Gemini API
- **Screenshot-desktop 1.15.0** - Screen capture
- **Tesseract.js 5.0.5** - OCR processing
- **Sharp 0.33.5** - Image processing

### Development Dependencies
- **TypeScript 5.6.3** - Type safety
- **Vite 5.4.11** - Build tool
- **Electron Builder 25.1.8** - App packaging

## Build & Deployment

### Development Scripts
```json
"dev": "vite",
"electron:dev": "tsc -p electron/tsconfig.json && electron .",
"app:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\""
```

### Production Build
```json
"build": "npm run clean && tsc && vite build",
"app:build": "npm run build && electron-builder"
```

### Distribution Targets
- **macOS**: DMG, ZIP
- **Windows**: NSIS installer, Portable
- **Linux**: AppImage, DEB

## Environment Setup

### Required Environment Variables
```bash
GEMINI_API_KEY=your_api_key_here
```

### Development Ports
- **Vite Dev Server**: 5173 (default) or 5180 (configured)
- **Electron**: Connects to Vite server in development

This architecture provides a solid foundation for the transparent overlay application with proper separation of concerns, type safety, and efficient data flow between the Electron main process and React renderer.