import { chromium } from 'playwright';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { ProxyManager } from './ProxyManager.js';
import { captchaBypassService } from '../services/CaptchaBypassService.js';
import UserAgent from 'user-agents';

export class BrowserPool {
  constructor() {
    this.browsers = [];
    this.contexts = new Map();
    this.maxBrowsers = config.limits.maxConcurrentBrowsers;
    this.maxPages = config.limits.maxConcurrentPages;
    this.availablePages = [];
    this.inUse = new Set();
    this.proxyManager = new ProxyManager();
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      captchaEncountered: 0,
      pageRecoveries: 0
    };
  }

  async initialize() {
    logger.info('Initializing browser pool');
    
    // Initialize proxy manager
    this.proxyManager.initialize();
    
    for (let i = 0; i < this.maxBrowsers; i++) {
      await this.createBrowser(i);
    }
    
    logger.info(`Browser pool initialized with ${this.browsers.length} browsers`);
  }

  async createBrowser(index) {
    try {
      const proxy = this.proxyManager.getNextProxy();
      const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
      
      const launchArgs = [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
      ];

      const browserOptions = {
        headless: process.env.NODE_ENV === 'production',
        args: launchArgs
      };

      const browser = await chromium.launch(browserOptions);

      const context = await browser.newContext({
        userAgent,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation'],
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': userAgent
        }
      });

      // Add stealth scripts
      await context.addInitScript({
        content: `
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
          Object.defineProperty(navigator, 'permissions', { get: () => ({ query: () => Promise.resolve({ state: Notification.permission }) }) });
          window.chrome = { runtime: {} };
        `
      });

      this.browsers.push({
        id: index,
        browser,
        context,
        pages: [],
        proxy,
        userAgent,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        requestCount: 0,
        errorCount: 0
      });

      // Create initial pages
      for (let i = 0; i < Math.ceil(this.maxPages / this.maxBrowsers); i++) {
        const page = await context.newPage();
        await this.setupPage(page);
        this.availablePages.push({
          browserId: index,
          page,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          requestCount: 0
        });
      }

      logger.info(`Browser ${index} created with proxy: ${proxy? 'enabled' : 'disabled'}`);

    } catch (error) {
      logger.error(`Failed to create browser ${index}:`, error);
    }
  }

  async setupPage(page) {
    // Set default timeout
    page.setDefaultTimeout(config.limits.timeout);
    page.setDefaultNavigationTimeout(config.limits.timeout);

    // Setup captcha handling
    await captchaBypassService.setupCaptchaHandling(page);

    // Block unnecessary resources to speed up page load
    await page.route('**/*', async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      
      // Allow important resources
      if (['document', 'xhr', 'fetch', 'script'].includes(resourceType)) {
        await route.continue();
      } else if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    // Handle page errors
    page.on('error', (error) => {
      logger.error('Page error:', error);
      this.stats.failedRequests++;
    });

    // Handle crashes
    page.on('close', () => {
      logger.debug('Page closed');
    });
  }

  async getPage(options = {}) {
    const { 
      timeout = 5000,
      retries = 3 
    } = options;

    let retryCount = 0;

    while (retryCount < retries) {
      // Wait for available page
      let startTime = Date.now();
      while (this.availablePages.length === 0) {
        if (Date.now() - startTime > timeout) {
          logger.warn('Timeout waiting for available page');
          retryCount++;
          continue;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (this.availablePages.length === 0) continue;

      const pageData = this.availablePages.shift();
      this.inUse.add(pageData);

      // Check if page and browser are still usable
      try {
        const browserData = this.browsers.find(b => b.id === pageData.browserId);
        if (!browserData) {
          logger.debug('Browser not found for page');
          continue;
        }

        // Test page
        await Promise.race([
          pageData.page.evaluate('1'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Page test timeout')), 2000))
        ]);

        pageData.lastUsed = Date.now();
        pageData.requestCount++;
        browserData.lastUsed = Date.now();
        browserData.requestCount++;
        this.stats.totalRequests++;

        return pageData;

      } catch (error) {
        logger.debug('Page is dead, creating recovery:', error.message);
        this.stats.pageRecoveries++;
        this.inUse.delete(pageData);

        // Try to recover
        try {
          await pageData.page.close().catch(() => {});
        } catch (e) {}

        this.createReplacementPage(pageData.browserId);
        retryCount++;
      }
    }

    throw new Error('Failed to get usable page after retries');
  }

  async releasePage(pageData) {
    this.inUse.delete(pageData);
    
    try {
      // Clear sensitive data
      const domains = ['google.com', 'youtube.com', 'instagram.com', 'linkedin.com'];
      for (const domain of domains) {
        await pageData.page.context().clearCookies([{ url: `https://${domain}` }]).catch(() => {});
      }
      
      await Promise.race([
        pageData.page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Clear timeout')), 2000))
      ]);

      // Random delay before returning
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      
      this.availablePages.push(pageData);
      this.stats.successfulRequests++;

    } catch (error) {
      logger.debug('Error releasing page, creating replacement:', error.message);
      this.stats.pageRecoveries++;

      try {
        await pageData.page.close().catch(() => {});
      } catch (e) {}

      this.createReplacementPage(pageData.browserId);
    }
  }

  async createReplacementPage(browserId) {
    try {
      const browser = this.browsers.find(b => b.id === browserId);
      if (browser) {
        const newPage = await browser.context.newPage();
        await this.setupPage(newPage);
        this.availablePages.push({
          browserId: browserId,
          page: newPage,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          requestCount: 0
        });
      }
    } catch (error) {
      logger.error(`Failed to create replacement page for browser ${browserId}:`, error);
    }
  }

  async closeAll() {
    try {
      for (const browser of this.browsers) {
        try {
          await browser.browser.close();
        } catch (error) {
          logger.debug(`Error closing browser ${browser.id}:`, error.message);
        }
      }
      this.browsers = [];
      this.availablePages = [];
      this.inUse.clear();
      logger.info('Browser pool closed');
    } catch (error) {
      logger.error('Error closing browser pool:', error);
    }
  }

  async healthCheck() {
    const activeBrowsers = this.browsers.length;
    const stats = {
      totalBrowsers: activeBrowsers,
      availablePages: this.availablePages.length,
      inUsePages: this.inUse.size,
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      pageRecoveries: this.stats.pageRecoveries,
      captchasEncountered: this.stats.captchaEncountered,
      browsers: this.browsers.map(b => ({
        id: b.id,
        age: `${((Date.now() - b.createdAt) / 1000 / 60).toFixed(1)}m`,
        requests: b.requestCount,
        errors: b.errorCount,
        proxy: b.proxy ? 'enabled' : 'disabled',
        lastUsed: `${((Date.now() - b.lastUsed) / 1000).toFixed(0)}s ago`
      }))
    };
    
    logger.info('Browser pool health:', JSON.stringify(stats, null, 2));
    return stats;
  }
}

export const browserPool = new BrowserPool();