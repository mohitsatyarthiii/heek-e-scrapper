import { Channel } from '../models/Channel.js';
import { logger } from '../utils/logger.js';

export class EmailDeduplicationService {
  constructor() {
    this.emailIndex = new Map(); // email -> Set of channel URLs
    this.channelIndex = new Map(); // channel URL -> Set of emails
    this.initialized = false;
  }

  /**
   * Initialize indexes from database
   */
  async initialize() {
    try {
      logger.info('Initializing email deduplication indexes...');
      
      const channels = await Channel.find({ 
        'emails': { $exists: true, $ne: [] }
      }).select('channelUrl emails');

      for (const channel of channels) {
        for (const emailObj of channel.emails) {
          const email = emailObj.email?.toLowerCase();
          if (email) {
            // Add to email index
            if (!this.emailIndex.has(email)) {
              this.emailIndex.set(email, new Set());
            }
            this.emailIndex.get(email).add(channel.channelUrl);

            // Add to channel index
            if (!this.channelIndex.has(channel.channelUrl)) {
              this.channelIndex.set(channel.channelUrl, new Set());
            }
            this.channelIndex.get(channel.channelUrl).add(email);
          }
        }
      }

      this.initialized = true;
      logger.info(`Email deduplication initialized with ${this.emailIndex.size} unique emails from ${channels.length} channels`);
    } catch (error) {
      logger.error('Failed to initialize email deduplication:', error);
    }
  }

  /**
   * Check if email already exists
   */
  async isEmailDuplicate(email) {
    if (!email) return false;
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check memory index
    if (this.emailIndex.has(normalizedEmail)) {
      return true;
    }

    // Fallback to database check
    try {
      const exists = await Channel.findOne({
        'emails.email': new RegExp(`^${normalizedEmail}$`, 'i')
      });
      return !!exists;
    } catch (error) {
      logger.debug('Error checking email duplicate:', error.message);
      return false;
    }
  }

  /**
   * Get all emails for a channel
   */
  getChannelEmails(channelUrl) {
    if (this.channelIndex.has(channelUrl)) {
      return Array.from(this.channelIndex.get(channelUrl));
    }
    return [];
  }

  /**
   * Get all channels with a specific email
   */
  getEmailChannels(email) {
    const normalizedEmail = email.toLowerCase().trim();
    if (this.emailIndex.has(normalizedEmail)) {
      return Array.from(this.emailIndex.get(normalizedEmail));
    }
    return [];
  }

  /**
   * Filter duplicates from email list
   */
  async filterDuplicateEmails(emails) {
    const unique = [];
    const seen = new Set();

    for (const email of emails) {
      if (!email) continue;
      
      const normalizedEmail = email.toLowerCase().trim();
      
      if (!seen.has(normalizedEmail) && !this.emailIndex.has(normalizedEmail)) {
        unique.push(email);
        seen.add(normalizedEmail);
      }
    }

    return unique;
  }

  /**
   * Register new emails
   */
  registerEmails(channelUrl, emails) {
    if (!channelUrl || !Array.isArray(emails)) return;

    if (!this.channelIndex.has(channelUrl)) {
      this.channelIndex.set(channelUrl, new Set());
    }

    for (const emailObj of emails) {
      const email = emailObj.email?.toLowerCase().trim() || emailObj.toLowerCase?.() || emailObj;
      
      if (!email) continue;

      // Add to email index
      if (!this.emailIndex.has(email)) {
        this.emailIndex.set(email, new Set());
      }
      this.emailIndex.get(email).add(channelUrl);

      // Add to channel index
      this.channelIndex.get(channelUrl).add(email);
    }

    logger.debug(`Registered ${emails.length} emails for channel ${channelUrl}`);
  }

  /**
   * Merge duplicate channels
   */
  async mergeDuplicateChannels(sourceUrl, targetUrl) {
    try {
      // Get emails from source channel
      const sourceEmails = this.getChannelEmails(sourceUrl);

      // Register emails to target
      this.registerEmails(targetUrl, sourceEmails);

      // Update in database
      const targetChannel = await Channel.findOne({ channelUrl: targetUrl });
      if (targetChannel) {
        const targetEmails = new Set(targetChannel.emails.map(e => e.email.toLowerCase()));
        
        for (const email of sourceEmails) {
          if (!targetEmails.has(email)) {
            targetChannel.emails.push({
              email,
              priority: 'medium',
              source: 'merged',
              verified: false
            });
            targetEmails.add(email);
          }
        }

        targetChannel.status = 'enriched';
        await targetChannel.save();
      }

      // Update source channel status
      await Channel.updateOne(
        { channelUrl: sourceUrl },
        { status: 'duplicate', linkedChannel: targetUrl }
      );

      // Clean up memory index
      if (this.channelIndex.has(sourceUrl)) {
        this.channelIndex.delete(sourceUrl);
      }

      logger.info(`Merged duplicate channel ${sourceUrl} into ${targetUrl}`);
    } catch (error) {
      logger.error('Error merging duplicate channels:', error);
    }
  }

  /**
   * Find potential duplicates
   */
  async findPotentialDuplicates(email) {
    try {
      const channels = this.getEmailChannels(email);
      
      if (channels.length > 1) {
        return await Channel.find({
          channelUrl: { $in: channels }
        }).select('channelUrl channelName emails');
      }

      return [];
    } catch (error) {
      logger.debug('Error finding potential duplicates:', error.message);
      return [];
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats() {
    let totalEmails = 0;
    let channelsWithEmails = 0;
    let avgEmailsPerChannel = 0;

    for (const emails of this.channelIndex.values()) {
      channelsWithEmails++;
      totalEmails += emails.size;
    }

    avgEmailsPerChannel = channelsWithEmails > 0 ? (totalEmails / channelsWithEmails).toFixed(2) : 0;

    return {
      totalUniqueEmails: this.emailIndex.size,
      totalChannels: this.channelIndex.size,
      channelsWithEmails,
      totalEmailInstances: totalEmails,
      averageEmailsPerChannel: parseFloat(avgEmailsPerChannel),
      initialized: this.initialized
    };
  }

  /**
   * Clear and reinitialize
   */
  async reset() {
    logger.info('Resetting email deduplication indexes...');
    this.emailIndex.clear();
    this.channelIndex.clear();
    this.initialized = false;
    await this.initialize();
  }
}

// Singleton instance
export const emailDeduplicationService = new EmailDeduplicationService();
