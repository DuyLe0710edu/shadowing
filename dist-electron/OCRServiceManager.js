"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCRServiceManager = void 0;
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
class OCRServiceManager {
    ocrProcess = null;
    serviceUrl = 'http://127.0.0.1:8765';
    isReady = false;
    async start() {
        console.log('[OCR] Starting EasyOCR service...');
        const pythonScript = path_1.default.join(__dirname, 'ocr_service.py');
        const pythonPath = '/Users/duy.ggy/.pyenv/versions/3.11.3/bin/python3';
        // Use -B to disable .pyc caching so we always run the fresh script
        this.ocrProcess = (0, child_process_1.spawn)(pythonPath, ['-B', pythonScript]);
        // Handle process output
        this.ocrProcess.stdout?.on('data', (data) => {
            console.log(`[OCR] ${data.toString().trim()}`);
        });
        this.ocrProcess.stderr?.on('data', (data) => {
            const line = data.toString().trim();
            const nonErrorPrefixes = [
                'This is a development server',
                'Press CTRL+C to quit',
                'Using CPU.',
                "'pin_memory' argument is set as true"
            ];
            if (nonErrorPrefixes.some(p => line.includes(p))) {
                // Treat as info, not error
                console.log(`[OCR] ${line}`);
            }
            else {
                console.error(`[OCR] Error: ${line}`);
            }
        });
        this.ocrProcess.on('exit', (code) => {
            console.log(`[OCR] Service exited with code ${code}`);
            this.isReady = false;
        });
        // Wait for service to be ready
        await this.waitForService();
        this.isReady = true;
        console.log('[OCR] Service ready');
    }
    async waitForService() {
        for (let i = 0; i < 30; i++) {
            try {
                const response = await axios_1.default.get(`${this.serviceUrl}/health`, { timeout: 2000 });
                if (response.data.status === 'ready') {
                    console.log(`[OCR] GPU enabled: ${response.data.gpu_enabled}`);
                    return;
                }
            }
            catch {
                // Service not ready yet, wait and retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error('OCR service failed to start within 30 seconds');
    }
    async extractText(imagePath) {
        if (!this.isReady) {
            throw new Error('OCR service not ready');
        }
        try {
            const response = await axios_1.default.post(`${this.serviceUrl}/ocr`, {
                image_path: imagePath
            }, { timeout: 1000000 });
            return {
                text: response.data.text,
                confidence: response.data.confidence,
                wordCount: response.data.word_count
            };
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`OCR service error: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }
    isServiceReady() {
        return this.isReady;
    }
    stop() {
        if (this.ocrProcess) {
            console.log('[OCR] Stopping service...');
            this.ocrProcess.kill('SIGTERM');
            this.ocrProcess = null;
            this.isReady = false;
        }
    }
}
exports.OCRServiceManager = OCRServiceManager;
//# sourceMappingURL=OCRServiceManager.js.map