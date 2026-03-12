export class ProxyManager {
  constructor(proxies = []) {
    this.proxies = proxies;
    this.index = 0;
  }

  /**
   * Get next proxy (round-robin)
   */
  getProxy() {
    if (!this.proxies.length) return null;

    const proxy = this.proxies[this.index];

    this.index = (this.index + 1) % this.proxies.length;

    return this.formatProxy(proxy);
  }

  /**
   * Format proxy for Playwright
   */
  formatProxy(proxyString) {
    if (!proxyString) return null;

    try {
      const url = new URL(proxyString);

      return {
        server: `${url.protocol}//${url.hostname}:${url.port}`,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch {
      return {
        server: proxyString,
      };
    }
  }

  /**
   * Get total proxies
   */
  count() {
    return this.proxies.length;
  }
}