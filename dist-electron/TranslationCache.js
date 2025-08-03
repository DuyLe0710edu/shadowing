"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationCache = void 0;
class TranslationCache {
    cache = new Map();
    hitCount = 0;
    missCount = 0;
    maxEntries = 1000;
    maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    constructor(maxEntries = 1000, maxAge = 24 * 60 * 60 * 1000) {
        this.maxEntries = maxEntries;
        this.maxAge = maxAge;
        // Clean up expired entries every 30 minutes
        setInterval(() => {
            this.cleanupExpired();
        }, 30 * 60 * 1000);
    }
    /**
     * Generate cache key from text and language parameters
     */
    generateKey(text, sourceLang = 'auto', targetLang = 'en') {
        // Normalize text for consistent caching
        const normalizedText = text.trim().toLowerCase();
        return `${sourceLang}-${targetLang}-${normalizedText}`;
    }
    /**
     * Get translation from cache
     */
    get(text, sourceLang = 'auto', targetLang = 'en') {
        const key = this.generateKey(text, sourceLang, targetLang);
        const entry = this.cache.get(key);
        if (!entry) {
            this.missCount++;
            return null;
        }
        // Check if entry is expired
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }
        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.hitCount++;
        console.log(`Cache hit for: "${text.substring(0, 30)}..." (accessed ${entry.accessCount} times)`);
        return entry;
    }
    /**
     * Store translation result in cache
     */
    set(text, result, sourceLang = 'auto', targetLang = 'en') {
        const key = this.generateKey(text, sourceLang, targetLang);
        // Check if we need to evict entries
        if (this.cache.size >= this.maxEntries) {
            this.evictLeastRecentlyUsed();
        }
        const cacheEntry = {
            translatedText: result.translatedText,
            sourceLang: result.sourceLang,
            targetLang: result.targetLang,
            confidence: result.confidence,
            timestamp: Date.now(),
            accessCount: 1,
            lastAccessed: Date.now()
        };
        this.cache.set(key, cacheEntry);
        console.log(`Cached translation for: "${text.substring(0, 30)}..." -> "${result.translatedText.substring(0, 30)}..."`);
    }
    /**
     * Remove least recently used entries to make space
     */
    evictLeastRecentlyUsed() {
        let oldestKey = null;
        let oldestAccess = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.lastAccessed < oldestAccess) {
                oldestAccess = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
            console.log('Evicted LRU cache entry');
        }
    }
    /**
     * Remove expired entries
     */
    cleanupExpired() {
        const now = Date.now();
        let removedCount = 0;
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.maxAge) {
                this.cache.delete(key);
                removedCount++;
            }
        }
        if (removedCount > 0) {
            console.log(`Cleaned up ${removedCount} expired cache entries`);
        }
    }
    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
        // Estimate memory usage (rough calculation)
        let memoryBytes = 0;
        for (const [key, entry] of this.cache) {
            memoryBytes += key.length * 2; // UTF-16 characters
            memoryBytes += (entry.translatedText.length + entry.sourceLang.length + entry.targetLang.length) * 2;
            memoryBytes += 64; // Approximate overhead for numbers and objects
        }
        const memoryMB = (memoryBytes / (1024 * 1024)).toFixed(2);
        return {
            totalEntries: this.cache.size,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: Math.round(hitRate * 100) / 100,
            memoryUsage: `${memoryMB} MB`
        };
    }
    /**
     * Clear all cache entries
     */
    clear() {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        console.log('Translation cache cleared');
    }
    /**
     * Get most frequently accessed translations
     */
    getPopularTranslations(limit = 10) {
        const entries = Array.from(this.cache.entries())
            .map(([key, entry]) => ({
            text: key.split('-').slice(2).join('-'), // Remove lang prefixes
            entry
        }))
            .sort((a, b) => b.entry.accessCount - a.entry.accessCount)
            .slice(0, limit);
        return entries;
    }
    /**
     * Preload common translations for better performance
     */
    preloadCommonTranslations() {
        const commonPhrases = [
            { text: "Hello", result: { translatedText: "你好", sourceLang: "en", targetLang: "zh", confidence: 1.0 } },
            { text: "Thank you", result: { translatedText: "谢谢", sourceLang: "en", targetLang: "zh", confidence: 1.0 } },
            { text: "Goodbye", result: { translatedText: "再见", sourceLang: "en", targetLang: "zh", confidence: 1.0 } }
        ];
        commonPhrases.forEach(({ text, result }) => {
            this.set(text, result);
        });
        console.log(`Preloaded ${commonPhrases.length} common translations`);
    }
}
exports.TranslationCache = TranslationCache;
//# sourceMappingURL=TranslationCache.js.map