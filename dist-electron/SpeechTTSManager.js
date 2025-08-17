"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeechTTSManager = void 0;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
class SpeechTTSManager {
    appState;
    currentProc = null;
    currentId = null;
    constructor(appState) {
        this.appState = appState;
    }
    getBinaryPath() {
        // Look under resources/native similar to other bridges
        const candidate = node_path_1.default.join(process.cwd(), 'resources', 'native', 'SpeechTTSBridge');
        if (node_fs_1.default.existsSync(candidate))
            return candidate;
        // Try development build path (native/SpeechTTSBridge/.build/...)
        try {
            const devBin = node_path_1.default.join(process.cwd(), 'native', 'SpeechTTSBridge', '.build');
            const platform = node_fs_1.default.readdirSync(devBin).find((d) => d.includes('apple-macosx'));
            if (platform) {
                const exec = node_path_1.default.join(devBin, platform, 'release', 'SpeechTTSBridge');
                if (node_fs_1.default.existsSync(exec))
                    return exec;
            }
        }
        catch { }
        return null;
    }
    stop() {
        if (this.currentProc) {
            try {
                this.currentProc.kill();
            }
            catch { }
            this.currentProc = null;
            this.emitToRenderer('tts-done', { id: this.currentId });
            this.currentId = null;
            return true;
        }
        return false;
    }
    speak(payload) {
        this.stop();
        const bin = this.getBinaryPath();
        if (!bin) {
            // Fallback: if binary missing, immediately emit done so UI doesn’t hang
            this.emitToRenderer('tts-error', { id: payload.id, error: 'SpeechTTSBridge not found' });
            return false;
        }
        const args = ['--id', payload.id, '--text', payload.text];
        if (payload.lang)
            args.push('--lang', payload.lang);
        if (typeof payload.rate === 'number')
            args.push('--rate', String(payload.rate));
        try {
            const child = (0, node_child_process_1.spawn)(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            this.currentProc = child;
            this.currentId = payload.id;
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                const lines = chunk.split(/\n+/).filter(Boolean);
                for (const line of lines) {
                    try {
                        const evt = JSON.parse(line);
                        if (evt.type === 'word')
                            this.emitToRenderer('tts-progress', { id: evt.id, start: evt.start, end: evt.end });
                        else if (evt.type === 'done')
                            this.emitToRenderer('tts-done', { id: evt.id });
                    }
                    catch { }
                }
            });
            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (d) => {
                this.emitToRenderer('tts-error', { id: payload.id, error: d.toString() });
            });
            child.on('exit', () => {
                this.emitToRenderer('tts-done', { id: payload.id });
                if (this.currentProc === child)
                    this.currentProc = null;
            });
            return true;
        }
        catch (e) {
            this.emitToRenderer('tts-error', { id: payload.id, error: e?.message || 'spawn failed' });
            return false;
        }
    }
    emitToRenderer(channel, data) {
        const win = this.appState.getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    }
}
exports.SpeechTTSManager = SpeechTTSManager;
//# sourceMappingURL=SpeechTTSManager.js.map