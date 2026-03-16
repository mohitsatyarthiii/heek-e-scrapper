import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export class ProxyManager {
  constructor() {
    this.proxies = [...config.proxies];
    this.currentIndex = 0;
    this.failedProxies = new Map();
    this.proxyStats = new Map();
    this.rotationInterval = null;
    this.maxFailures = 3;
    this.cooldownPeriod = 5 * 60 * 1000; // 5 minutes
  }

  initialize() {
    // Initialize stats for each proxy
    this.proxies.forEach(proxy => {
      this.proxyStats.set(proxy.url, {
        successes: 0,
        failures: 0,
        lastUsed: null,
        avgResponseTime: 0,
        totalRequests: 0
      });
    });

    // Start proxy rotation
    this.startRotation();

    logger.info(`Proxy manager initialized with ${this.proxies.length} proxies`);
  }

  getNextProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    // Try to find a working proxy
    const startIndex = this.currentIndex;
    let attempts = 0;

    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      const stats = this.proxyStats.get(proxy.url);

      // Check if proxy is on cooldown
      if (this.isProxyAvailable(proxy)) {
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        
        // Update stats
        stats.lastUsed = Date.now();
        stats.totalRequests++;
        
        return this.createAgent(proxy);
      }

      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      attempts++;
    }

    // If all proxies are on cooldown, return the first one anyway
    const fallbackProxy = this.proxies[0];
    logger.warn('All proxies on cooldown, using fallback proxy');
    
    return this.createAgent(fallbackProxy);
  }

  createAgent(proxy) {
    const { url, username, password } = proxy;
    
    // Parse proxy URL
    const proxyUrl = new URL(url);
    
    // Add auth if provided
    if (username && password) {
      proxyUrl.username = username;
      proxyUrl.password = password;
    }

    // Create appropriate agent based on protocol
    if (proxyUrl.protocol.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl.toString());
    } else {
      return new HttpsProxyAgent(proxyUrl.toString());
    }
  }

  isProxyAvailable(proxy) {
    const stats = this.proxyStats.get(proxy.url);
    
    if (!stats) return true;
    
    // Check if proxy has failed too many times
    if (stats.failures >= this.maxFailures) {
      const timeSinceLastFail = Date.now() - (stats.lastFailTime || 0);
      if (timeSinceLastFail < this.cooldownPeriod) {
        return false; // Still in cooldown
      } else {
        // Reset failures after cooldown
        stats.failures = 0;
      }
    }
    
    return true;
  }

  reportSuccess(proxyUrl) {
    const stats = this.proxyStats.get(proxyUrl);
    if (stats) {
      stats.successes++;
      
      // Update average response time
      if (stats.lastResponseTime) {
        const responseTime = Date.now() - stats.lastRequestTime;
        stats.avgResponseTime = (stats.avgResponseTime * (stats.totalRequests - 1) + responseTime) / stats.totalRequests;
      }
    }
  }

  reportFailure(proxyUrl, error) {
    const stats = this.proxyStats.get(proxyUrl);
    if (stats) {
      stats.failures++;
      stats.lastFailTime = Date.now();
      stats.lastError = error.message;
      
      logger.debug(`Proxy ${proxyUrl} failed (${stats.failures}/${this.maxFailures}): ${error.message}`);
      
      // Move failed proxy to end of list
      this.moveProxyToEnd(proxyUrl);
    }
  }

  moveProxyToEnd(proxyUrl) {
    const index = this.proxies.findIndex(p => p.url === proxyUrl);
    if (index !== -1) {
      const [proxy] = this.proxies.splice(index, 1);
      this.proxies.push(proxy);
    }
  }

  startRotation() {
    // Rotate proxies every 5 minutes
    this.rotationInterval = setInterval(() => {
      this.rotateProxies();
    }, 5 * 60 * 1000);
  }

  rotateProxies() {
    // Shuffle proxies array
    for (let i = this.proxies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.proxies[i], this.proxies[j]] = [this.proxies[j], this.proxies[i]];
    }
    
    logger.debug('Proxies rotated');
  }

  async testProxy(proxy) {
    try {
      const agent = this.createAgent(proxy);
      const startTime = Date.now();
      
      const response = await fetch('https://api.ipify.org?format=json', {
        agent,
        timeout: 5000
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        logger.info(`Proxy ${proxy.url} working (IP: ${data.ip}, Response time: ${responseTime}ms)`);
        
        const stats = this.proxyStats.get(proxy.url);
        if (stats) {
          stats.working = true;
          stats.responseTime = responseTime;
        }
        
        return true;
      }
    } catch (error) {
      logger.debug(`Proxy ${proxy.url} test failed: ${error.message}`);
      
      const stats = this.proxyStats.get(proxy.url);
      if (stats) {
        stats.working = false;
        stats.lastError = error.message;
      }
    }
    
    return false;
  }

  async testAllProxies() {
    logger.info('Testing all proxies...');
    
    const results = await Promise.all(
      this.proxies.map(proxy => this.testProxy(proxy))
    );
    
    const workingCount = results.filter(r => r).length;
    logger.info(`Proxy test complete: ${workingCount}/${this.proxies.length} working`);
    
    return {
      total: this.proxies.length,
      working: workingCount,
      failed: this.proxies.length - workingCount
    };
  }

  getStats() {
    const stats = {};
    
    for (const [url, data] of this.proxyStats) {
      stats[url] = {
        ...data,
        successRate: data.totalRequests > 0 
          ? (data.successes / data.totalRequests * 100).toFixed(2) + '%'
          : 'N/A'
      };
    }
    
    return stats;
  }

  async addProxy(proxyUrl) {
    const proxy = { url: proxyUrl };
    this.proxies.push(proxy);
    this.proxyStats.set(proxyUrl, {
      successes: 0,
      failures: 0,
      lastUsed: null,
      avgResponseTime: 0,
      totalRequests: 0
    });
    
    // Test the new proxy
    const working = await this.testProxy(proxy);
    
    logger.info(`Added proxy ${proxyUrl} (${working ? 'working' : 'not working'})`);
    
    return working;
  }

  removeProxy(proxyUrl) {
    const index = this.proxies.findIndex(p => p.url === proxyUrl);
    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.proxyStats.delete(proxyUrl);
      logger.info(`Removed proxy ${proxyUrl}`);
      return true;
    }
    return false;
  }

  stopRotation() {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }
}

export const proxyManager = new ProxyManager();