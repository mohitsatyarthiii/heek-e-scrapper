import { browserPool } from '../lib/BrowserPool.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class YoutubeDiscoveryService {
  constructor() {
    this.discoveredChannels = new Map();
    this.relatedCache = new Map();
  }

  async discoverChannels(keyword, options = {}) {
    const channels = new Map();
    
    logger.info(`YouTube discovery for "${keyword}"`);
    
    try {
      // Method 1: Direct search
      const searchResults = await this.searchYouTube(keyword);
      for (const channel of searchResults) {
        if (!channels.has(channel.url)) {
          channels.set(channel.url, channel);
        }
      }
      
      // Method 2: Related channels from each discovered channel
      const initialChannels = Array.from(channels.values());
      for (const channel of initialChannels.slice(0, 10)) {
        const related = await this.getRelatedChannels(channel.url);
        for (const relatedChannel of related) {
          if (!channels.has(relatedChannel.url)) {
            channels.set(relatedChannel.url, relatedChannel);
          }
          
          // Stop if we have enough
          if (channels.size >= config.limits.maxChannelsPerKeyword) {
            break;
          }
        }
      }
      
      // Method 3: Channel from video comments (if needed)
      if (channels.size < 100) {
        const commenters = await this.getTopCommenters(keyword);
        for (const commenter of commenters) {
          if (!channels.has(commenter.url)) {
            channels.set(commenter.url, commenter);
          }
        }
      }
      
    } catch (error) {
      logger.error('YouTube discovery error:', error);
    }
    
    logger.info(`YouTube discovery found ${channels.size} channels for "${keyword}"`);
    return Array.from(channels.values());
  }

  async searchYouTube(keyword) {
    const channels = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      // Search YouTube
      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Wait for results
      await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });
      
      // Scroll to load more
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        await this.delay(2000);
      }
      
      // Extract channels
      const channelData = await page.evaluate(() => {
        const channels = [];
        const items = document.querySelectorAll('ytd-channel-renderer');
        
        items.forEach((item) => {
          const titleEl = item.querySelector('#channel-title');
          const linkEl = item.querySelector('#main-link');
          const subEl = item.querySelector('#subscriber-count');
          const thumbnailEl = item.querySelector('#img');
          
          if (titleEl && linkEl) {
            channels.push({
              title: titleEl.innerText.trim(),
              url: 'https://youtube.com' + linkEl.getAttribute('href'),
              subscribers: subEl ? subEl.innerText.trim() : 'Unknown',
              thumbnail: thumbnailEl ? thumbnailEl.src : null,
              type: 'channel'
            });
          }
        });
        
        return channels;
      });
      
      channels.push(...channelData);
      
    } catch (error) {
      logger.debug(`YouTube search failed for "${keyword}":`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return channels;
  }

  async getRelatedChannels(channelUrl) {
    if (this.relatedCache.has(channelUrl)) {
      return this.relatedCache.get(channelUrl);
    }
    
    const related = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      await page.goto(channelUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Click on channels tab
      const channelsTab = await page.$('a[title="Channels"]');
      if (channelsTab) {
        await channelsTab.click();
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        
        // Scroll to load more
        for (let i = 0; i < 2; i++) {
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
          });
          await this.delay(1000);
        }
        
        // Extract featured channels
        const featured = await page.evaluate(() => {
          const channels = [];
          const items = document.querySelectorAll('ytd-channel-renderer');
          
          items.forEach((item) => {
            const titleEl = item.querySelector('#channel-title');
            const linkEl = item.querySelector('#main-link');
            
            if (titleEl && linkEl) {
              channels.push({
                title: titleEl.innerText.trim(),
                url: 'https://youtube.com' + linkEl.getAttribute('href'),
                source: 'related'
              });
            }
          });
          
          return channels;
        });
        
        related.push(...featured);
      }
      
      this.relatedCache.set(channelUrl, related);
      
    } catch (error) {
      logger.debug(`Failed to get related channels for ${channelUrl}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return related;
  }

  async getTopCommenters(keyword) {
    const commenters = [];
    let pageData = null;
    
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;
      
      // Search for top videos
      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAISAhAB`, {
        waitUntil: 'networkidle'
      });
      
      // Get first video
      const videoLink = await page.$('a#video-title');
      if (videoLink) {
        await videoLink.click();
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        
        // Scroll to comments
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        
        await this.delay(3000);
        
        // Extract commenters
        const commenterData = await page.evaluate(() => {
          const commenters = [];
          const comments = document.querySelectorAll('ytd-comment-thread-renderer');
          
          comments.forEach((comment) => {
            const authorEl = comment.querySelector('#author-text');
            const linkEl = comment.querySelector('#author-text');
            
            if (authorEl && linkEl) {
              commenters.push({
                title: authorEl.innerText.trim(),
                url: 'https://youtube.com' + linkEl.getAttribute('href'),
                source: 'commenter'
              });
            }
          });
          
          return commenters;
        });
        
        commenters.push(...commenterData);
      }
      
    } catch (error) {
      logger.debug(`Failed to get commenters for "${keyword}":`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }
    
    return commenters;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const youtubeDiscoveryService = new YoutubeDiscoveryService();