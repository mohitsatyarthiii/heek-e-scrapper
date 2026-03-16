import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

export class ApiKeyManager {
  constructor() {
    this.googleKeys = (config.googleApiKeys || []).map((key, idx) => ({
      key,
      index: idx,
      quotaUsed: 0,
      quotaLimit: 10000, // Default daily quota
      requestsToday: 0,
      resetTime: new Date().toDateString(),
      status: 'active',
      lastError: null,
      lastErrorTime: null,
      consecutiveErrors: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      successfulRequests: 0
    }));

    this.serpKeys = (config.serpApiKeys || []).map((key, idx) => ({
      key,
      index: idx,
      credits: 100, // Initial estimate
      status: 'active',
      lastError: null,
      lastErrorTime: null,
      consecutiveErrors: 0
    }));

    this.currentGoogleKeyIndex = 0;
    this.currentSerpKeyIndex = 0;
    this.rotationStrategy = 'round-robin'; // round-robin or least-used
    
    logger.info(`API Key Manager initialized with ${this.googleKeys.length} Google keys and ${this.serpKeys.length} SerpAPI keys`);
  }

  /**
   * Get next available Google API key
   */
  getNextGoogleKey() {
    if (this.googleKeys.length === 0) {
      logger.warn('No Google API keys available');
      return null;
    }

    // Check if we need to reset daily quota
    const today = new Date().toDateString();
    for (const key of this.googleKeys) {
      if (key.resetTime !== today) {
        key.resetTime = today;
        key.requestsToday = 0;
      }
    }

    // Find available key
    let selectedKey = null;
    let minRequests = Infinity;

    // Skip blocked keys
    const availableKeys = this.googleKeys.filter(
      key => key.status === 'active' && 
              key.consecutiveErrors < 5 &&
              key.requestsToday < key.quotaLimit
    );

    if (availableKeys.length === 0) {
      logger.warn('All Google API keys have reached quota or are blocked');
      // Return the one with least errors
      selectedKey = this.googleKeys.reduce((a, b) => 
        a.consecutiveErrors < b.consecutiveErrors ? a : b
      );
    } else if (this.rotationStrategy === 'least-used') {
      // Find key with least requests
      for (const key of availableKeys) {
        if (key.requestsToday < minRequests) {
          minRequests = key.requestsToday;
          selectedKey = key;
        }
      }
    } else {
      // Round-robin
      for (let i = 0; i < this.googleKeys.length; i++) {
        const idx = (this.currentGoogleKeyIndex + i) % this.googleKeys.length;
        if (availableKeys.includes(this.googleKeys[idx])) {
          selectedKey = this.googleKeys[idx];
          this.currentGoogleKeyIndex = (idx + 1) % this.googleKeys.length;
          break;
        }
      }
    }

    if (!selectedKey) {
      selectedKey = this.googleKeys[0];
    }

    selectedKey.requestsToday++;
    selectedKey.totalRequests++;

    logger.debug(`Using Google API key ${selectedKey.index}: ${selectedKey.requestsToday}/${selectedKey.quotaLimit} requests today`);
    
    return selectedKey;
  }

  /**
   * Get next available SerpAPI key
   */
  getNextSerpKey() {
    if (this.serpKeys.length === 0) {
      logger.warn('No SerpAPI keys available');
      return null;
    }

    // Find available key
    const availableKeys = this.serpKeys.filter(
      key => key.status === 'active' && 
              key.consecutiveErrors < 3
    );

    if (availableKeys.length === 0) {
      logger.warn('All SerpAPI keys are blocked');
      // Return the one with least errors
      return this.serpKeys.reduce((a, b) => 
        a.consecutiveErrors < b.consecutiveErrors ? a : b
      );
    }

    // Round-robin through available keys
    for (let i = 0; i < this.serpKeys.length; i++) {
      const idx = (this.currentSerpKeyIndex + i) % this.serpKeys.length;
      if (availableKeys.includes(this.serpKeys[idx])) {
        this.currentSerpKeyIndex = (idx + 1) % this.serpKeys.length;
        return this.serpKeys[idx];
      }
    }

    return availableKeys[0];
  }

  /**
   * Record successful API request
   */
  recordSuccess(keyType, keyIndex, responseTime = 0) {
    if (keyType === 'google' && this.googleKeys[keyIndex]) {
      const key = this.googleKeys[keyIndex];
      key.successfulRequests++;
      key.consecutiveErrors = 0;
      key.lastError = null;
      
      // Calculate average response time
      key.averageResponseTime = (key.averageResponseTime * (key.successfulRequests - 1) + responseTime) / key.successfulRequests;
    } else if (keyType === 'serp' && this.serpKeys[keyIndex]) {
      const key = this.serpKeys[keyIndex];
      key.consecutiveErrors = 0;
      key.lastError = null;
    }
  }

  /**
   * Record failed API request
   */
  recordFailure(keyType, keyIndex, error) {
    if (keyType === 'google' && this.googleKeys[keyIndex]) {
      const key = this.googleKeys[keyIndex];
      key.consecutiveErrors++;
      key.lastError = error?.message || error;
      key.lastErrorTime = new Date();

      // Handle quota exceeded
      if (error?.response?.status === 403 || error?.message?.includes('quota')) {
        key.quotaUsed = key.quotaLimit; // Mark as exhausted
        logger.warn(`Google API key ${keyIndex} quota exceeded`);
      }

      // Block after too many errors
      if (key.consecutiveErrors >= 5) {
        key.status = 'blocked';
        logger.error(`Google API key ${keyIndex} blocked after ${key.consecutiveErrors} consecutive errors`);
      }
    } else if (keyType === 'serp' && this.serpKeys[keyIndex]) {
      const key = this.serpKeys[keyIndex];
      key.consecutiveErrors++;
      key.lastError = error?.message || error;
      key.lastErrorTime = new Date();

      if (key.consecutiveErrors >= 3) {
        key.status = 'blocked';
        logger.error(`SerpAPI key ${keyIndex} blocked after ${key.consecutiveErrors} consecutive errors`);
      }
    }
  }

  /**
   * Update quota usage
   */
  updateQuotaUsage(keyType, keyIndex, used) {
    if (keyType === 'google' && this.googleKeys[keyIndex]) {
      this.googleKeys[keyIndex].quotaUsed = used;
    }
  }

  /**
   * Reset failed keys after cooldown
   */
  resetBlockedKeys(cooldownMinutes = 30) {
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = new Date();

    // Reset Google keys
    this.googleKeys.forEach(key => {
      if (key.status === 'blocked' && key.lastErrorTime) {
        const timeSinceError = now - key.lastErrorTime;
        if (timeSinceError > cooldownMs) {
          key.status = 'active';
          key.consecutiveErrors = 0;
          logger.info(`Reset Google API key ${key.index}`);
        }
      }
    });

    // Reset SerpAPI keys
    this.serpKeys.forEach(key => {
      if (key.status === 'blocked' && key.lastErrorTime) {
        const timeSinceError = now - key.lastErrorTime;
        if (timeSinceError > cooldownMs) {
          key.status = 'active';
          key.consecutiveErrors = 0;
          logger.info(`Reset SerpAPI key ${key.index}`);
        }
      }
    });
  }

  /**
   * Get statistics about API keys
   */
  getStats() {
    return {
      google: {
        total: this.googleKeys.length,
        active: this.googleKeys.filter(k => k.status === 'active').length,
        blocked: this.googleKeys.filter(k => k.status === 'blocked').length,
        keys: this.googleKeys.map(k => ({
          index: k.index,
          status: k.status,
          requestsToday: k.requestsToday,
          quotaLimit: k.quotaLimit,
          consecutiveErrors: k.consecutiveErrors,
          successfulRequests: k.successfulRequests,
          averageResponseTime: k.averageResponseTime.toFixed(2) + 'ms'
        }))
      },
      serp: {
        total: this.serpKeys.length,
        active: this.serpKeys.filter(k => k.status === 'active').length,
        blocked: this.serpKeys.filter(k => k.status === 'blocked').length
      }
    };
  }

  /**
   * Log stats periodically
   */
  startStatsLogging(intervalMinutes = 30) {
    setInterval(() => {
      logger.info('API Key Manager Stats:', JSON.stringify(this.getStats(), null, 2));
    }, intervalMinutes * 60 * 1000);
  }
}

// Singleton instance
export const apiKeyManager = new ApiKeyManager();
