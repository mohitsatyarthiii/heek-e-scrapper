import { parentPort, workerData } from 'worker_threads';
import { logger } from '../utils/logger.js';
import { browserPool } from '../lib/BrowserPool.js';
import { captchaBypassService } from '../services/CaptchaBypassService.js';
import { channelScraperService } from '../services/ChannelScraperService.js';
import { emailEnrichmentService } from '../services/EmailEnrichmentService.js';
import { emailDeduplicationService } from '../services/EmailDeduplicationService.js';
import { rateLimiter } from '../services/RateLimitService.js';
import { Channel } from '../models/Channel.js';

const workerId = workerData?.workerId || 0;

logger.info(`Worker ${workerId} started`);

/**
 * Handle incoming tasks from main thread
 */
parentPort.on('message', async (task) => {
  try {
    const result = await handleTask(task);
    parentPort.postMessage({
      success: true,
      taskId: task.id,
      type: task.type,
      data: result
    });
  } catch (error) {
    logger.error(`Worker ${workerId} error:`, error);
    parentPort.postMessage({
      success: false,
      taskId: task.id,
      type: task.type,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Route tasks to appropriate handler
 */
async function handleTask(task) {
  const { type, payload } = task;

  switch (type) {
    case 'scrape-channel':
      return await scrapeChannelTask(payload);
    
    case 'enrich-channel':
      return await enrichChannelTask(payload);
    
    case 'extract-emails':
      return await extractEmailsTask(payload);
    
    case 'deduplicate-emails':
      return await deduplicateEmailsTask(payload);
    
    case 'health-check':
      return await healthCheckTask();
    
    default:
      throw new Error(`Unknown task type: ${type}`);
  }
}

/**
 * Scrape a single channel
 */
async function scrapeChannelTask(payload) {
  const {
    channelUrl,
    keyword,
    depth = 1,
    maxEmails = 50
  } = payload;

  logger.info(`Worker ${workerId}: Scraping channel ${channelUrl}`);

  try {
    // Rate limiting
    await rateLimiter.waitIfNeeded();

    // Check if already scraped
    const existing = await Channel.findOne({
      channelUrl,
      status: { $ne: 'pending' }
    });

    if (existing && existing.status === 'scraped') {
      return {
        channelUrl,
        status: 'cached',
        emails: existing.emails || [],
        data: existing
      };
    }

    // Get page
    let pageData = null;
    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;

      // Navigate
      await page.goto(channelUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Check for captcha
      const hasCaptcha = await captchaBypassService.checkForCaptcha(page);
      if (hasCaptcha.length > 0) {
        logger.warn(`Captcha detected on ${channelUrl}: ${hasCaptcha.join(', ')}`);
        const bypassed = await captchaBypassService.bypassCaptcha(page, 60);
        if (!bypassed) {
          return {
            channelUrl,
            status: 'captcha-blocked',
            error: 'Failed to bypass captcha'
          };
        }
      }

      // Scrape channel
      const channelData = await channelScraperService.scrapeChannel(channelUrl, {
        depth,
        maxEmails
      });

      if (!channelData) {
        return {
          channelUrl,
          status: 'failed',
          error: 'Channel not found or inaccessible'
        };
      }

      // Deduplicate emails
      channelData.emails = await emailDeduplicationService.filterDuplicateEmails(
        channelData.emails
      );

      // Register with deduplication service
      emailDeduplicationService.registerEmails(channelUrl, channelData.emails);

      // Save to database
      let channel = await Channel.findOne({ channelUrl });

      if (!channel) {
        channel = new Channel({
          channelUrl,
          channelName: channelData.title,
          avatar: channelData.avatar,
          handle: channelData.handle,
          subscribers: channelData.subscribers,
          emails: channelData.emails.map(email => ({
            email,
            priority: 'medium',
            source: 'scraped',
            verified: false
          })),
          discoveredVia: {
            keyword,
            source: 'scraper'
          },
          status: 'scraped',
          lastScrapedAt: new Date()
        });
      } else {
        // Merge emails
        const existingEmails = new Set(channel.emails.map(e => e.email));
        for (const email of channelData.emails) {
          if (!existingEmails.has(email)) {
            channel.emails.push({
              email,
              priority: 'medium',
              source: 'scraped',
              verified: false
            });
          }
        }
        channel.status = 'scraped';
        channel.lastScrapedAt = new Date();
      }

      await channel.save();

      return {
        channelUrl,
        status: 'success',
        emails: channelData.emails,
        emailCount: channelData.emails.length,
        data: {
          title: channelData.title,
          subscribers: channelData.subscribers,
          websites: channelData.websites
        }
      };

    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }

  } catch (error) {
    logger.error(`Worker ${workerId}: Scrape error for ${channelUrl}:`, error);
    return {
      channelUrl,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Enrich a channel with additional data
 */
async function enrichChannelTask(payload) {
  const { channelUrl, includeWebsites = true } = payload;

  logger.info(`Worker ${workerId}: Enriching channel ${channelUrl}`);

  try {
    const channel = await Channel.findOne({ channelUrl });

    if (!channel) {
      return {
        channelUrl,
        status: 'not-found'
      };
    }

    // Enrich using email enrichment service
    const enriched = await emailEnrichmentService.enrichChannel(channel);

    // Update in database
    channel.emails = enriched.emails.map(email => ({
      email: email.email || email,
      priority: email.priority || 'medium',
      source: email.source || 'enriched',
      verified: email.verified || false
    }));

    channel.websites = enriched.websites;
    channel.socialLinks = enriched.socialProfiles;
    channel.status = 'enriched';
    channel.lastEnrichedAt = new Date();
    channel.enrichmentData = {
      linktreeData: enriched.linktreeData,
      enrichedAt: new Date()
    };

    await channel.save();

    return {
      channelUrl,
      status: 'success',
      emailCount: channel.emails.length,
      websiteCount: channel.websites.length,
      enrichmentLevel: 'full'
    };

  } catch (error) {
    logger.error(`Worker ${workerId}: Enrichment error for ${channelUrl}:`, error);
    return {
      channelUrl,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Extract and validate emails
 */
async function extractEmailsTask(payload) {
  const { text, keywords = [] } = payload;

  try {
    // Regex for email extraction
    const emailRegex = /([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const rawEmails = text.match(emailRegex) || [];

    // Deduplicate and filter
    const emails = [...new Set(rawEmails)].filter(email => {
      // Filter out automated emails
      const localPart = email.split('@')[0];
      if (localPart.includes('noreply') || localPart.includes('donotreply')) {
        return false;
      }
      return true;
    });

    // Prioritize emails
    const prioritized = prioritizeEmails(emails, keywords);

    return {
      status: 'success',
      emails: prioritized,
      count: prioritized.length
    };

  } catch (error) {
    logger.error(`Worker ${workerId}: Email extraction error:`, error);
    return {
      status: 'error',
      error: error.message,
      emails: []
    };
  }
}

/**
 * Deduplicate and merge emails
 */
async function deduplicateEmailsTask(payload) {
  const { emails, channelUrl } = payload;

  try {
    // Filter duplicates
    const unique = await emailDeduplicationService.filterDuplicateEmails(emails);

    // Register with deduplication service
    if (channelUrl) {
      emailDeduplicationService.registerEmails(channelUrl, unique);
    }

    return {
      status: 'success',
      originalCount: emails.length,
      deduplicatedCount: unique.length,
      duplicatesRemoved: emails.length - unique.length,
      emails: unique
    };

  } catch (error) {
    logger.error(`Worker ${workerId}: Deduplication error:`, error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Health check
 */
async function healthCheckTask() {
  try {
    const browserPoolHealth = await browserPool.healthCheck();

    return {
      workerId,
      status: 'healthy',
      timestamp: new Date(),
      browserPool: browserPoolHealth,
      memory: process.memoryUsage()
    };

  } catch (error) {
    logger.error(`Worker ${workerId}: Health check error:`, error);
    return {
      workerId,
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Prioritize emails based on keywords and domain reputation
 */
function prioritizeEmails(emails, keywords = []) {
  const businessDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];
  const priorityKeywords = ['contact', 'info', 'business', 'hello', 'support', 'team'];

  return emails
    .map(email => {
      let priority = 'low';
      const [localPart, domain] = email.split('@');

      // High priority
      if (keywords.some(kw => localPart.toLowerCase().includes(kw))) {
        priority = 'high';
      } else if (priorityKeywords.some(pw => localPart.toLowerCase().includes(pw))) {
        priority = 'high';
      } else if (!businessDomains.includes(domain)) {
        priority = 'medium';
      } else {
        priority = 'low';
      }

      return { email, priority };
    })
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

logger.info(`Worker ${workerId} ready`);
