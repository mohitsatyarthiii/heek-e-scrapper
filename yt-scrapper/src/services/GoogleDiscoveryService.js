import axios from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { browserPool } from '../lib/BrowserPool.js';
import { apiKeyManager } from './ApiKeyManager.js';
import { captchaBypassService } from './CaptchaBypassService.js';
import { emailExtractor } from '../utils/email.js';
import UserAgent from 'user-agents';

export class GoogleDiscoveryService {
  constructor() {
    this.apiKeyManager = apiKeyManager;
    
    axiosRetry(axios, {
      retries: config.limits.maxRetries,
      retryDelay: axiosRetry.exponentialDelay
    });

    // Start periodic stats logging
    this.apiKeyManager.startStatsLogging(60);
  }

  async discoverChannels(keyword, options = {}) {
    const { country = 'india' } = options;
    const channels = new Map();
    
    // Email-focused queries - optimized for 5-6k emails/day
    const emailQueries = [
      `site:youtube.com "@gmail.com" ${keyword}`,
      `site:youtube.com "@hotmail.com" ${keyword}`,
      `site:youtube.com "@outlook.com" ${keyword}`,
      `site:youtube.com "business inquiries" ${keyword}`,
      `site:youtube.com "contact" ${keyword}`,
      `site:youtube.com "email" ${keyword}`,
      `site:youtube.com "collaboration" ${keyword}`,
      `site:youtube.com "sponsorship" ${keyword}`,
      `site:youtube.com "collab" ${keyword}`,
      `"${keyword}" "email" site:youtube.com`,
      `"${keyword}" "contact me" youtube`,
      `"${keyword}" "inquiry" youtube`,
      `intitle:"${keyword}" "contact" youtube`,
      `inurl:/c/ "${keyword}" "email"`,
      `inurl:/channel/ "${keyword}" "email"`,
      `site:youtube.com/about "${keyword}" "email"`,
      `site:youtube.com/channel "${keyword}" "@"`,
      `"${keyword} youtube" "contact" "email"`,
      `"${keyword} channel" "business inquiry"`,
      `"${keyword} youtube" collaboration email`
    ];

    // Add location-specific queries for better targeting
    const locationQueries = emailQueries.map(q => `${q} ${country}`)
      .concat(emailQueries.map(q => `${q} india`))
      .slice(0, 30);

    const allQueries = [...emailQueries, ...locationQueries].slice(0, 40);

    logger.info(`🔍 Google Discovery: ${allQueries.length} email-focused queries for "${keyword}" in ${country}`);

    let queryIndex = 0;
    for (const query of allQueries) {
      queryIndex++;
      try {
        let results = [];
        
        // Try SerpAPI first (more reliable)
        if (this.apiKeyManager.serpKeys.length > 0) {
          results = await this.searchWithSerpAPI(query);
          if (results.length === 0 && this.apiKeyManager.googleKeys.length > 0) {
            // Fallback to Google API if SerpAPI returns nothing
            results = await this.searchWithGoogleAPI(query);
          }
        } else if (this.apiKeyManager.googleKeys.length > 0) {
          // Use Google API directly
          results = await this.searchWithGoogleAPI(query);
        } else {
          // Fallback to scraping
          results = await this.searchWithScraping(query);
        }

        let channelsFound = 0;
        for (const result of results) {
          const channel = this.extractYouTubeChannel(result, query);
          
          if (channel && !channels.has(channel.url)) {
            // Check if result contains email indicators
            const hasEmailInSnippet = result.snippet?.includes('@') || 
                                     result.snippet?.includes('email') ||
                                     result.snippet?.includes('contact') ||
                                     result.snippet?.includes('collab') ||
                                     result.snippet?.includes('business');
            
            channels.set(channel.url, {
              ...channel,
              sourceQuery: query,
              hasEmailContext: hasEmailInSnippet,
              emailHint: this.extractEmailHint(result.snippet),
              source: 'google',
              discoveredAt: new Date()
            });
            
            if (hasEmailContext) channelsFound++;
          }
        }

        logger.debug(`Query ${queryIndex}/${allQueries.length}: "${query}" - Found ${results.length} results, ${channelsFound} with email context`);

        // Adaptive rate limiting
        await this.adaptiveDelay(queryIndex, allQueries.length);
        
      } catch (error) {
        logger.debug(`Google query ${queryIndex} failed: "${query}"`, error.message);
      }
    }

    const results = Array.from(channels.values());
    logger.info(`✅ Google discovery complete: Found ${channels.size} unique channels`);
    return results;
  }

  async searchWithSerpAPI(query) {
    const startTime = Date.now();
    const serpKey = this.apiKeyManager.getNextSerpKey();
    
    if (!serpKey) {
      logger.warn('No SerpAPI keys available');
      return [];
    }

    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          api_key: serpKey.key,
          num: 100,
          gl: 'in',
          hl: 'en',
          device: 'desktop'
        },
        timeout: 15000
      });

      const responseTime = Date.now() - startTime;
      this.apiKeyManager.recordSuccess('serp', serpKey.index, responseTime);

      return response.data.organic_results || [];
      
    } catch (error) {
      this.apiKeyManager.recordFailure('serp', serpKey.index, error);
      logger.debug(`SerpAPI failed (${error.response?.status}):`, error.message);
      return [];
    }
  }

  async searchWithGoogleAPI(query) {
    const startTime = Date.now();
    const googleKey = this.apiKeyManager.getNextGoogleKey();
    
    if (!googleKey) {
      logger.warn('No Google API keys available');
      return [];
    }

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          q: query,
          key: googleKey.key,
          cx: process.env.GOOGLE_CX,
          num: 10
        },
        timeout: 10000
      });

      const responseTime = Date.now() - startTime;
      this.apiKeyManager.recordSuccess('google', googleKey.index, responseTime);

      return response.data.items || [];
      
    } catch (error) {
      this.apiKeyManager.recordFailure('google', googleKey.index, error);
      logger.debug(`Google API failed (${error.response?.status}):`, error.message);
      return [];
    }
  }

  async searchWithScraping(query) {
    const results = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      const userAgent = new UserAgent().toString();
      await page.setExtraHTTPHeaders({ 'User-Agent': userAgent });
      
      // Mimic human behavior
      await captchaBypassService.mimicHumanBehavior(page);
      
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=100`, {
        waitUntil: 'networkidle',
        timeout: 20000
      });

      // Check for captcha
      const hasCaptcha = await captchaBypassService.checkForCaptcha(page);
      if (hasCaptcha.length > 0) {
        logger.warn('Captcha detected during Google search, attempting bypass...');
        const bypassed = await captchaBypassService.bypassCaptcha(page);
        if (!bypassed) {
          logger.warn('Failed to bypass Google captcha');
          return results;
        }
      }

      // Wait for results
      await page.waitForSelector('div#search', { timeout: 5000 });

      // Extract results
      const searchResults = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('div.g').forEach(result => {
          const titleEl = result.querySelector('h3');
          const linkEl = result.querySelector('a');
          const snippetEl = result.querySelector('div.VwiC3b, div[data-content-feature="1"]');
          
          if (titleEl && linkEl && linkEl.href.includes('youtube.com')) {
            items.push({
              title: titleEl.innerText,
              link: linkEl.href,
              snippet: snippetEl ? snippetEl.innerText : '',
              displayedLink: result.querySelector('cite')?.innerText || ''
            });
          }
        });
        return items;
      });

      results.push(...searchResults);

      // Scroll and load more results
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await this.delay(1000);
        
        const moreResults = await page.evaluate(() => {
          const items = [];
          document.querySelectorAll('div.g').forEach(result => {
            const titleEl = result.querySelector('h3');
            const linkEl = result.querySelector('a');
            
            if (titleEl && linkEl && linkEl.href.includes('youtube.com')) {
              items.push({
                title: titleEl.innerText,
                link: linkEl.href,
                snippet: result.querySelector('div.VwiC3b')?.innerText || ''
              });
            }
          });
          return items;
        });

        results.push(...moreResults);
      }

    } catch (error) {
      logger.debug(`Google scraping failed:`, error.message);
    } finally {
      if (pageData) await browserPool.releasePage(pageData);
    }

    return results;
  }

  extractYouTubeChannel(result, query) {
    const url = result.link || result.url;
    if (!url || !url.includes('youtube.com')) return null;

    let channelId = null;
    let channelUrl = null;

    if (url.includes('/channel/')) {
      channelId = url.split('/channel/')[1].split(/[?#/]/)[0];
      channelUrl = `https://youtube.com/channel/${channelId}`;
    } else if (url.includes('/c/') || url.includes('/user/') || url.includes('/@')) {
      channelUrl = url.split('?')[0];
      channelId = channelUrl.split('/').pop();
    } else if (url.includes('/watch')) {
      // Skip video URLs
      return null;
    } else {
      return null;
    }

    return {
      url: channelUrl,
      channelId,
      title: result.title?.replace(/ - YouTube$/, '') || '',
      snippet: result.snippet || '',
      sourceQuery: query
    };
  }

  extractEmailHint(snippet) {
    if (!snippet) return null;
    
    // Look for actual email
    const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) return emailMatch[0];
    
    // Look for email keywords
    if (snippet.includes('contact') || snippet.includes('email') || snippet.includes('inquiry')) {
      return 'probable-email';
    }
    
    return null;
  }

  async adaptiveDelay(currentQuery, totalQueries) {
    // More aggressive at the beginning, slower towards the end to avoid rate limits
    const progress = currentQuery / totalQueries;
    let delayMs = 500;
    
    if (progress > 0.7) {
      delayMs = 2000; // Slower near the end
    } else if (progress > 0.5) {
      delayMs = 1500;
    } else if (progress > 0.3) {
      delayMs = 1000;
    }

    // Add jitter
    delayMs += Math.random() * 500;
    await this.delay(delayMs);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get API statistics
  getApiStats() {
    return this.apiKeyManager.getStats();
  }
}

export const googleDiscoveryService = new GoogleDiscoveryService();