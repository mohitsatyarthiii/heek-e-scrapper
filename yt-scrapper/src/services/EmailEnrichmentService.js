import { browserPool } from '../lib/BrowserPool.js';
import { emailExtractor } from '../utils/email.js';
import { logger } from '../utils/logger.js';

export class EmailEnrichmentService {
  constructor() {
    this.enrichedChannels = new Map();
    this.visitedUrls = new Set();
  }

  async enrichChannel(channelData) {
    if (this.enrichedChannels.has(channelData.url)) {
      return this.enrichedChannels.get(channelData.url);
    }
    
    logger.info(`Enriching channel: ${channelData.title}`);
    
    const enriched = {
      ...channelData,
      emails: new Set(channelData.emails || []),
      socialProfiles: [],
      websites: channelData.websites || [],
      linktreeData: null
    };
    
    // Enrich from websites
    for (const website of enriched.websites) {
      if (this.visitedUrls.has(website)) continue;
      this.visitedUrls.add(website);
      
      const websiteEmails = await this.scrapeWebsite(website);
      websiteEmails.forEach(email => enriched.emails.add(email));
      
      // Check if it's a linktree/beacons page
      if (website.includes('linktr.ee') || website.includes('beacons.ai')) {
        enriched.linktreeData = await this.scrapeLinktree(website);
        
        // Extract emails from linktree
        if (enriched.linktreeData) {
          enriched.linktreeData.emails?.forEach(email => enriched.emails.add(email));
          
          // Add social profiles from linktree
          enriched.socialProfiles.push(...(enriched.linktreeData.socialLinks || []));
          
          // Add websites from linktree
          enriched.websites.push(...(enriched.linktreeData.links || []));
        }
      }
    }
    
    // Enrich from social profiles
    for (const social of enriched.socialLinks || []) {
      if (this.visitedUrls.has(social.url)) continue;
      this.visitedUrls.add(social.url);
      
      const socialEmails = await this.scrapeSocialProfile(social.url);
      socialEmails.forEach(email => enriched.emails.add(email));
    }
    
    // Convert Set to Array and prioritize
    enriched.emails = emailExtractor.prioritizeEmails(Array.from(enriched.emails));
    enriched.websites = [...new Set(enriched.websites)];
    
    this.enrichedChannels.set(channelData.url, enriched);
    return enriched;
  }

  async scrapeWebsite(url) {
    const emails = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      // Try main page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      }).catch(() => {});
      
      // Extract emails from page
      const pageText = await page.evaluate(() => document.body.innerText);
      const pageEmails = emailExtractor.extractFromText(pageText);
      emails.push(...pageEmails);
      
      // Try contact page
      const contactLinks = await this.findContactLinks(page);
      for (const contactUrl of contactLinks.slice(0, 3)) {
        try {
          await page.goto(contactUrl, { waitUntil: 'networkidle', timeout: 10000 });
          const contactText = await page.evaluate(() => document.body.innerText);
          const contactEmails = emailExtractor.extractFromText(contactText);
          emails.push(...contactEmails);
        } catch (error) {
          // Skip failed contact pages
        }
      }
      
    } catch (error) {
      logger.debug(`Failed to scrape website ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return [...new Set(emails)];
  }

  async findContactLinks(page) {
    return await page.evaluate(() => {
      const contactPatterns = ['contact', 'about', 'imprint', 'impressum', 'support', 'help'];
      const links = [];
      
      document.querySelectorAll('a[href]').forEach(link => {
        const text = link.innerText.toLowerCase();
        const href = link.href.toLowerCase();
        
        if (contactPatterns.some(pattern => 
          text.includes(pattern) || href.includes(pattern)
        )) {
          links.push(link.href);
        }
      });
      
      return links;
    });
  }

  async scrapeLinktree(url) {
    const data = {
      links: [],
      socialLinks: [],
      emails: []
    };
    
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      
      // Extract all links
      const links = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a').forEach(link => {
          if (link.href && !link.href.includes(window.location.host)) {
            items.push({
              url: link.href,
              text: link.innerText.trim()
            });
          }
        });
        return items;
      });
      
      // Categorize links
      for (const link of links) {
        if (this.isSocialLink(link.url)) {
          data.socialLinks.push(link);
        } else {
          data.links.push(link.url);
        }
      }
      
      // Extract emails from page
      const pageText = await page.evaluate(() => document.body.innerText);
      data.emails = emailExtractor.extractFromText(pageText);
      
    } catch (error) {
      logger.debug(`Failed to scrape linktree ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return data;
  }

  async scrapeSocialProfile(url) {
    const emails = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      
      // Extract bio/description
      const bio = await page.evaluate(() => {
        // Try different selectors based on platform
        const selectors = [
          'meta[name="description"]',
          'meta[property="og:description"]',
          'div.bio',
          'span.bio',
          '.profile-description'
        ];
        
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            return el.content || el.innerText || '';
          }
        }
        return '';
      });
      
      const bioEmails = emailExtractor.extractFromText(bio);
      emails.push(...bioEmails);
      
    } catch (error) {
      logger.debug(`Failed to scrape social profile ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return emails;
  }

  isSocialLink(url) {
    const socialDomains = [
      'instagram.com',
      'twitter.com',
      'facebook.com',
      'linkedin.com',
      'tiktok.com',
      'snapchat.com',
      'discord.com',
      'twitch.tv',
      'pinterest.com',
      'reddit.com'
    ];
    
    return socialDomains.some(domain => url.includes(domain));
  }

  async batchEnrich(channels, concurrency = 3) {
    const results = [];
    const batches = [];
    
    for (let i = 0; i < channels.length; i += concurrency) {
      batches.push(channels.slice(i, i + concurrency));
    }
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(channel => this.enrichChannel(channel))
      );
      
      results.push(...batchResults);
      
      // Small delay between batches
      await this.delay(2000);
    }
    
    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const emailEnrichmentService = new EmailEnrichmentService();