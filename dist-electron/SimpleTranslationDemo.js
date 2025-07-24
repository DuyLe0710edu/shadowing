"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleTranslationDemo = void 0;
// SimpleTranslationDemo.ts - Simple demo without M2M-100 for now
const AreaSelectionHelper_1 = require("./AreaSelectionHelper");
const LLMHelper_1 = require("./LLMHelper");
const TranslationOverlayHelper_1 = require("./TranslationOverlayHelper");
class SimpleTranslationDemo {
    areaSelectionHelper;
    llmHelper;
    translationOverlayHelper;
    ocrWorker = null;
    constructor() {
        this.areaSelectionHelper = new AreaSelectionHelper_1.AreaSelectionHelper();
        this.translationOverlayHelper = new TranslationOverlayHelper_1.TranslationOverlayHelper();
        const apiKey = process.env.GEMINI_API_KEY || '';
        this.llmHelper = new LLMHelper_1.LLMHelper(apiKey);
        this.initializeOCR();
        this.setupRegionEventHandlers();
    }
    async initializeOCR() {
        try {
            console.log('Starting OCR worker initialization...');
            const { createWorker } = await Promise.resolve().then(() => __importStar(require('tesseract.js')));
            this.ocrWorker = await createWorker('eng+chi_sim+chi_tra');
            await this.ocrWorker.setParameters({
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz一二三四五六七八九十百千万亿你我他她它们的是在有这那个了与和对于从到以及但是如果因为所以然后也还',
                tessedit_pageseg_mode: '6'
            });
            console.log('OCR worker initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize OCR:', error);
        }
    }
    setupRegionEventHandlers() {
        const { ipcMain } = require('electron');
        console.log('Setting up region event handlers...');
        ipcMain.on('region-changed', async (event, data) => {
            console.log('Received region-changed event:', data);
            if (data.filepath) {
                await this.processRegionChange(data.region, data.filepath);
            }
        });
    }
    async processRegionChange(region, imagePath) {
        try {
            console.log(`Processing region change for ${region.id} with image: ${imagePath}`);
            if (!this.ocrWorker) {
                console.log('OCR worker not initialized, skipping text extraction');
                return;
            }
            console.log(`Starting OCR recognition...`);
            const { data: { text } } = await this.ocrWorker.recognize(imagePath);
            const cleanText = text.trim();
            console.log(`OCR result: "${cleanText}" (length: ${cleanText.length})`);
            if (cleanText && cleanText.length > 3) {
                console.log(`Valid text extracted: "${cleanText}"`);
                const translation = await this.translateWithGemini(cleanText);
                console.log(`Translation result: "${translation}"`);
                // Show floating overlay near the region
                await this.translationOverlayHelper.createTranslationOverlay(region.id, region, cleanText, translation);
                this.notifyTranslationReady({
                    regionId: region.id,
                    originalText: cleanText,
                    translation: translation,
                    timestamp: Date.now()
                });
            }
            else {
                console.log(`Text too short or empty, skipping translation`);
            }
        }
        catch (error) {
            console.error('Error processing region change:', error);
        }
    }
    notifyTranslationReady(translationData) {
        const { BrowserWindow } = require('electron');
        const allWindows = BrowserWindow.getAllWindows();
        const mainWindow = allWindows.find((window) => !window.isDestroyed() && window.webContents.getURL().includes("index.html"));
        if (mainWindow) {
            mainWindow.webContents.send('translation-ready', translationData);
        }
    }
    async startAreaSelection() {
        await this.areaSelectionHelper.startAreaSelection();
    }
    getSelectedRegions() {
        return this.areaSelectionHelper.getSelectedRegions();
    }
    async deleteRegion(regionId) {
        return this.areaSelectionHelper.deleteRegion(regionId);
    }
    async toggleRegionMonitoring(regionId) {
        return this.areaSelectionHelper.toggleRegionMonitoring(regionId);
    }
    async translateWithGemini(text) {
        try {
            // Use existing Gemini integration for translation
            const problemInfo = {
                text: text,
                task: 'Translate this text to English. If it\'s Chinese, also provide Pinyin with tone marks.'
            };
            const result = await this.llmHelper.generateSolution(problemInfo);
            return result.solution?.code || 'Translation failed';
        }
        catch (error) {
            console.error('Translation error:', error);
            return 'Translation failed';
        }
    }
    cleanup() {
        this.areaSelectionHelper.cleanup();
        this.translationOverlayHelper.closeAllOverlays();
        if (this.ocrWorker) {
            this.ocrWorker.terminate();
        }
    }
}
exports.SimpleTranslationDemo = SimpleTranslationDemo;
//# sourceMappingURL=SimpleTranslationDemo.js.map