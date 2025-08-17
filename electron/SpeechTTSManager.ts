import { AppState } from './main'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

export class SpeechTTSManager {
  private appState: AppState
  private currentProc: ChildProcessWithoutNullStreams | null = null
  private currentId: string | null = null

  constructor(appState: AppState) {
    this.appState = appState
  }

  private getBinaryPath(): string | null {
    // Look under resources/native similar to other bridges
    const candidate = path.join(process.cwd(), 'resources', 'native', 'SpeechTTSBridge')
    if (fs.existsSync(candidate)) return candidate
    // Try development build path (native/SpeechTTSBridge/.build/...)
    try {
      const devBin = path.join(process.cwd(), 'native', 'SpeechTTSBridge', '.build')
      const platform = fs.readdirSync(devBin).find((d) => d.includes('apple-macosx'))
      if (platform) {
        const exec = path.join(devBin, platform, 'release', 'SpeechTTSBridge')
        if (fs.existsSync(exec)) return exec
      }
    } catch {}
    return null
  }

  public stop(): boolean {
    if (this.currentProc) {
      try { this.currentProc.kill() } catch {}
      this.currentProc = null
      this.emitToRenderer('tts-done', { id: this.currentId })
      this.currentId = null
      return true
    }
    return false
  }

  public speak(payload: { id: string; text: string; lang?: string; rate?: number }): boolean {
    this.stop()
    const bin = this.getBinaryPath()
    if (!bin) {
      // Fallback: if binary missing, immediately emit done so UI doesn’t hang
      this.emitToRenderer('tts-error', { id: payload.id, error: 'SpeechTTSBridge not found' })
      return false
    }
    const args: string[] = ['--id', payload.id, '--text', payload.text]
    if (payload.lang) args.push('--lang', payload.lang)
    if (typeof payload.rate === 'number') args.push('--rate', String(payload.rate))
    try {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      this.currentProc = child
      this.currentId = payload.id
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        const lines = chunk.split(/\n+/).filter(Boolean)
        for (const line of lines) {
          try {
            const evt = JSON.parse(line)
            if (evt.type === 'word') this.emitToRenderer('tts-progress', { id: evt.id, start: evt.start, end: evt.end })
            else if (evt.type === 'done') this.emitToRenderer('tts-done', { id: evt.id })
          } catch {}
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (d: string) => {
        this.emitToRenderer('tts-error', { id: payload.id, error: d.toString() })
      })
      child.on('exit', () => {
        this.emitToRenderer('tts-done', { id: payload.id })
        if (this.currentProc === child) this.currentProc = null
      })
      return true
    } catch (e: any) {
      this.emitToRenderer('tts-error', { id: payload.id, error: e?.message || 'spawn failed' })
      return false
    }
  }

  private emitToRenderer(channel: string, data: any) {
    const win = this.appState.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}


