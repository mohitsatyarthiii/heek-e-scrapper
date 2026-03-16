import { googleDiscoveryService } from './GoogleDiscoveryService.js';
import { youtubeDiscoveryService } from './YoutubeDiscoveryService.js';
import { keywordService } from './KeywordService.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class HybridDiscoveryService {
  constructor() {
    this.discoveredChannels = new Map();
    this.searchStats = {
      google: { total: 0, withEmails: 0 },
      youtube: { total: 0, withEmails: 0 },
      related: { total: 0, withEmails: 0 }
    };
  }

  async discoverChannels(keyword, options = {}) {
    const {
      country = 'india',
      minSubscribers = 0,
      maxChannels = config.limits.maxChannelsPerKeyword,
      prioritizeEmailContext = true
    } = options;

    logger.info(`🚀 Hybrid discovery started for: "${keyword}" in ${country}`);
    
    // Clear previous results
    this.discoveredChannels.clear();
    
    // Step 1: Expand keywords
    const expandedKeywords = await keywordService.expandKeywords(keyword, country);
    logger.info(`📊 Expanded to ${expandedKeywords.length} keywords`);

    // Step 2: Google Discovery (Email-first approach)
    logger.info('🔍 Phase 1: Google Discovery - Searching for emails...');
    await this.googleDiscoveryPhase(expandedKeywords, { country, minSubscribers });

    // Step 3: YouTube Discovery (Channel-first approach)
    if (this.discoveredChannels.size < maxChannels) {
      logger.info('🎬 Phase 2: YouTube Discovery - Finding related channels...');
      await this.youtubeDiscoveryPhase(expandedKeywords, { minSubscribers });
    }

    // Step 4: Related Channels Discovery
    if (this.discoveredChannels.size < maxChannels) {
      logger.info('🔄 Phase 3: Related Channels - Expanding network...');
      await this.relatedChannelsPhase({ minSubscribers });
    }

    // Step 5: Prioritize channels with email context
    const results = Array.from(this.discoveredChannels.values());
    
    if (prioritizeEmailContext) {
      results.sort((a, b) => {
        // Channels with emails first
        if (a.hasEmailContext && !b.hasEmailContext) return -1;
        if (!a.hasEmailContext && b.hasEmailContext) return 1;
        
        // Then by subscriber count
        return (b.subscriberCount || 0) - (a.subscriberCount || 0);
      });
    }

    logger.info(`✅ Hybrid discovery complete: Found ${results.length} unique channels`);
    logger.info(`   📧 Google: ${this.searchStats.google.total} (${this.searchStats.google.withEmails} with emails)`);
    logger.info(`   🎬 YouTube: ${this.searchStats.youtube.total} (${this.searchStats.youtube.withEmails} with emails)`);
    logger.info(`   🔄 Related: ${this.searchStats.related.total} (${this.searchStats.related.withEmails} with emails)`);

    return results;
  }

  async googleDiscoveryPhase(keywords, { country, minSubscribers }) {
    const batchSize = 5;
    let totalFound = 0;

    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      
      const promises = batch.map(async (keyword) => {
        try {
          const channels = await googleDiscoveryService.discoverChannels(keyword, { country });
          
          let emailContextCount = 0;
          for (const channel of channels) {
            // Check if channel has email in snippet (Google already found email context)
            const hasEmail = channel.snippet?.includes('@') || 
                            channel.title?.includes('email') ||
                            channel.description?.includes('@');
            
            if (!this.discoveredChannels.has(channel.url)) {
              this.discoveredChannels.set(channel.url, {
                ...channel,
                source: 'google',
                sourceKeyword: keyword,
                hasEmailContext: hasEmail,
                priority: hasEmail ? 'high' : 'medium',
                discoveredAt: new Date()
              });
              
              if (hasEmail) emailContextCount++;
            }
          }
          
          this.searchStats.google.total += channels.length;
          this.searchStats.google.withEmails += emailContextCount;
          
          return channels.length;
        } catch (error) {
          logger.error(`Google discovery error for "${keyword}":`, error);
          return 0;
        }
      });

      const results = await Promise.all(promises);
      totalFound += results.reduce((a, b) => a + b, 0);
      
      logger.debug(`Google batch ${i/batchSize + 1}: Found ${results.reduce((a, b) => a + b, 0)} channels`);
      
      // Small delay between batches
      await this.delay(2000);
    }

    return totalFound;
  }

  async youtubeDiscoveryPhase(keywords, { minSubscribers }) {
    const batchSize = 3;
    let totalFound = 0;

    // Focus on high-value keywords first
    const priorityKeywords = keywords.slice(0, 10);

    for (let i = 0; i < priorityKeywords.length; i += batchSize) {
      const batch = priorityKeywords.slice(i, i + batchSize);
      
      const promises = batch.map(async (keyword) => {
        try {
          const channels = await youtubeDiscoveryService.discoverChannels(keyword);
          
          let emailContextCount = 0;
          for (const channel of channels) {
            // For YouTube, we need to check if channel might have email
            const mightHaveEmail = channel.description?.includes('email') ||
                                  channel.description?.includes('@') ||
                                  channel.links?.length > 0;
            
            if (!this.discoveredChannels.has(channel.url)) {
              this.discoveredChannels.set(channel.url, {
                ...channel,
                source: 'youtube',
                sourceKeyword: keyword,
                hasEmailContext: mightHaveEmail,
                priority: mightHaveEmail ? 'medium' : 'low',
                discoveredAt: new Date()
              });
              
              if (mightHaveEmail) emailContextCount++;
            }
          }
          
          this.searchStats.youtube.total += channels.length;
          this.searchStats.youtube.withEmails += emailContextCount;
          
          return channels.length;
        } catch (error) {
          logger.error(`YouTube discovery error for "${keyword}":`, error);
          return 0;
        }
      });

      const results = await Promise.all(promises);
      totalFound += results.reduce((a, b) => a + b, 0);
      
      await this.delay(3000); // Longer delay for YouTube
    }

    return totalFound;
  }

  async relatedChannelsPhase({ minSubscribers }) {
    // Get top channels from Google results (they're more likely to have emails)
    const googleChannels = Array.from(this.discoveredChannels.values())
      .filter(c => c.source === 'google' && c.hasEmailContext)
      .slice(0, 5);

    let totalFound = 0;

    for (const channel of googleChannels) {
      try {
        // Extract channel ID from URL
        const channelId = this.extractChannelId(channel.url);
        if (!channelId) continue;

        const related = await youtubeDiscoveryService.getRelatedChannels(channel.url);
        
        let emailContextCount = 0;
        for (const relatedChannel of related) {
          if (!this.discoveredChannels.has(relatedChannel.url)) {
            // Related channels often have similar content
            this.discoveredChannels.set(relatedChannel.url, {
              ...relatedChannel,
              source: 'related',
              sourceChannel: channel.title,
              hasEmailContext: false, // Unknown, will check during scraping
              priority: 'low',
              discoveredAt: new Date()
            });
            
            emailContextCount++;
          }
        }
        
        this.searchStats.related.total += related.length;
        this.searchStats.related.withEmails += emailContextCount;
        totalFound += related.length;
        
      } catch (error) {
        logger.error(`Related channels error for ${channel.url}:`, error);
      }
      
      await this.delay(2000);
    }

    return totalFound;
  }

  extractChannelId(url) {
    if (!url) return null;
    
    if (url.includes('/channel/')) {
      return url.split('/channel/')[1].split(/[?#/]/)[0];
    }
    if (url.includes('/@')) {
      return url.split('/@')[1].split(/[?#/]/)[0];
    }
    return null;
  }

  async enrichWithEmailContext(channels) {
    // Quick check if channels might have emails without full scraping
    const enriched = [];
    
    for (const channel of channels) {
      let emailIndicators = 0;
      
      // Check title
      if (channel.title?.match(/email|contact|business|inquiries|collab/i)) {
        emailIndicators++;
      }
      
      // Check description snippet
      if (channel.snippet?.includes('@') || channel.snippet?.includes('email')) {
        emailIndicators += 2;
      }
      
      // Check links
      if (channel.links?.length > 0) {
        emailIndicators++;
      }
      
      enriched.push({
        ...channel,
        emailProbability: emailIndicators,
        needsScraping: emailIndicators > 0
      });
    }
    
    return enriched.sort((a, b) => b.emailProbability - a.emailProbability);
  }

  getStats() {
    return {
      total: this.discoveredChannels.size,
      bySource: {
        google: Array.from(this.discoveredChannels.values()).filter(c => c.source === 'google').length,
        youtube: Array.from(this.discoveredChannels.values()).filter(c => c.source === 'youtube').length,
        related: Array.from(this.discoveredChannels.values()).filter(c => c.source === 'related').length
      },
      withEmailContext: Array.from(this.discoveredChannels.values()).filter(c => c.hasEmailContext).length,
      searchStats: this.searchStats
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const hybridDiscoveryService = new HybridDiscoveryService();