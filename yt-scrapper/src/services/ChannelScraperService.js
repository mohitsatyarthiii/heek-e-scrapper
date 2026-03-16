import { browserPool } from '../lib/BrowserPool.js';
import { emailExtractor } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class ChannelScraperService {
  constructor() {
    this.scrapedChannels = new Map();
    this.emailCache = new Map();
  }

  async scrapeChannel(channelUrl, options = {}) {
    if (this.scrapedChannels.has(channelUrl)) {
      return this.scrapedChannels.get(channelUrl);
    }
    
    logger.info(`Scraping channel: ${channelUrl}`);
    
    let pageData = null;
    const channelData = {
      url: channelUrl,
      emails: new Set(),
      socialLinks: [],
      websites: [],
      scrapedAt: new Date()
    };
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      // Navigate to channel
      await page.goto(channelUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Check if channel exists
      const channelExists = await page.evaluate(() => {
        return !document.querySelector('#page-error');
      });
      
      if (!channelExists) {
        logger.debug(`Channel not found: ${channelUrl}`);
        return null;
      }
      
      // Extract basic info
      const basicInfo = await this.extractBasicInfo(page);
      Object.assign(channelData, basicInfo);
      
      // Extract subscribers
      channelData.subscribers = await this.extractSubscribers(page);
      
      // Go to About page
      await this.navigateToAbout(page);
      
      // Extract about info
      const aboutInfo = await this.extractAboutInfo(page);
      Object.assign(channelData, aboutInfo);
      
      // Extract emails from all text
      const allText = [
        channelData.title,
        channelData.description,
        channelData.about,
        channelData.links?.join(' ')
      ].filter(Boolean).join(' ');
      
      const emails = emailExtractor.extractFromText(allText);
      emails.forEach(email => channelData.emails.add(email));
      
      // Extract social links
      channelData.socialLinks = await this.extractSocialLinks(page);
      
      // Extract websites
      channelData.websites = await this.extractWebsites(page);
      
    } catch (error) {
      logger.error(`Error scraping channel ${channelUrl}:`, error);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    // Convert Set to Array
    channelData.emails = Array.from(channelData.emails);
    
    this.scrapedChannels.set(channelUrl, channelData);
    return channelData;
  }

  async extractBasicInfo(page) {
    return await page.evaluate(() => {
      const titleEl = document.querySelector('#channel-title, #channel-name');
      const avatarEl = document.querySelector('#avatar, #img');
      
      return {
        title: titleEl ? titleEl.innerText.trim() : '',
        avatar: avatarEl ? avatarEl.src : null,
        handle: window.location.pathname.split('/').pop()
      };
    });
  }

  async extractSubscribers(page) {
    return await page.evaluate(() => {
      const subEl = document.querySelector('#subscriber-count, #subscribers');
      if (subEl) {
        const text = subEl.innerText;
        const match = text.match(/[\d,.]+[KMB]/i);
        return match ? match[0] : text;
      }
      return 'Unknown';
    });
  }

  async navigateToAbout(page) {
    try {
      const aboutLink = await page.$('a[title="About"]');
      if (aboutLink) {
        await aboutLink.click();
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
        return true;
      }
    } catch (error) {
      logger.debug('Failed to navigate to About page:', error.message);
    }
    return false;
  }

  async extractAboutInfo(page) {
    return await page.evaluate(() => {
      const info = {
        description: '',
        about: '',
        links: [],
        details: {}
      };
      
      // Description
      const descEl = document.querySelector('#description, #channel-description');
      if (descEl) {
        info.description = descEl.innerText.trim();
      }
      
      // About text
      const aboutEl = document.querySelector('#about-section, #channel-about');
      if (aboutEl) {
        info.about = aboutEl.innerText.trim();
      }
      
      // Links
      const linkEls = document.querySelectorAll('a[href*="http"]');
      linkEls.forEach(el => {
        const href = el.href;
        if (href && !href.includes('youtube.com')) {
          info.links.push(href);
        }
      });
      
      // Details (joined date, location, etc.)
      const detailEls = document.querySelectorAll('#details-container span');
      detailEls.forEach(el => {
        const text = el.innerText.trim();
        if (text.includes('Joined') || text.includes('location')) {
          info.details[text.split(' ')[0].toLowerCase()] = text;
        }
      });
      
      return info;
    });
  }

  async extractSocialLinks(page) {
    return await page.evaluate(() => {
      const social = [];
      const patterns = [
        'instagram.com',
        'twitter.com',
        'facebook.com',
        'linkedin.com',
        'tiktok.com',
        'snapchat.com',
        'discord.com',
        'twitch.tv'
      ];
      
      const links = document.querySelectorAll('a[href*="http"]');
      links.forEach(link => {
        const href = link.href;
        for (const pattern of patterns) {
          if (href.includes(pattern)) {
            social.push({
              platform: pattern.split('.')[0],
              url: href
            });
            break;
          }
        }
      });
      
      return social;
    });
  }

  async extractWebsites(page) {
    return await page.evaluate(() => {
      const websites = [];
      const links = document.querySelectorAll('a[href*="http"]');
      
      links.forEach(link => {
        const href = link.href;
        if (href && 
            !href.includes('youtube.com') && 
            !href.includes('google.com') &&
            !href.includes('facebook.com') &&
            !href.includes('instagram.com') &&
            !href.includes('twitter.com')) {
          websites.push(href);
        }
      });
      
      return [...new Set(websites)];
    });
  }

  async batchScrape(channels, concurrency = 5) {
    const results = [];
    const batches = [];
    
    for (let i = 0; i < channels.length; i += concurrency) {
      batches.push(channels.slice(i, i + concurrency));
    }
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(channel => this.scrapeChannel(channel.url || channel))
      );
      
      results.push(...batchResults.filter(r => r !== null));
      
      // Small delay between batches
      await this.delay(2000);
    }
    
    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const channelScraperService = new ChannelScraperService();