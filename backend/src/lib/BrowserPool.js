import { chromium } from "playwright";

export class BrowserPool {
  constructor(maxBrowsers = 3, proxyManager = null) {
    this.maxBrowsers = maxBrowsers;

    this.proxyManager = proxyManager;

    this.browsers = [];

    this.available = [];

    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    for (let i = 0; i < this.maxBrowsers; i++) {
      const proxy = this.proxyManager?.getProxy();

      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        proxy: proxy || undefined,
      });

      this.browsers.push(browser);

      this.available.push(browser);
    }

    this.initialized = true;

    console.log(`🌐 BrowserPool initialized with ${this.maxBrowsers} browsers`);
  }

  /**
   * Checkout browser from pool
   */
  async checkout() {
    while (this.available.length === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const browser = this.available.pop();

    return {
      browser,
    };
  }

  /**
   * Release browser back to pool
   */
  release(entry) {
    if (!entry?.browser) return;

    this.available.push(entry.browser);
  }

  /**
   * Get proxy for scraper context
   */
  getProxy() {
    return this.proxyManager?.getProxy() || null;
  }

  /**
   * Pool status
   */
  getStatus() {
    return {
      total: this.browsers.length,
      available: this.available.length,
      busy: this.browsers.length - this.available.length,
      proxy: this.proxyManager?.count() || 0,
    };
  }

  /**
   * Shutdown all browsers
   */
  async shutdown() {
    console.log("🛑 Shutting down BrowserPool...");

    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch {}
    }

    this.browsers = [];
    this.available = [];
    this.initialized = false;
  }
}