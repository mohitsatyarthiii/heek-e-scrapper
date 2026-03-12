import express from 'express';
import mongoose from 'mongoose';
import { google } from 'googleapis';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

// Debug mode
const DEBUG = process.env.DEBUG === 'true' || true;

// MongoDB connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000
})
  .then(() => {
    console.log('✅ Connected to MongoDB');
    if (DEBUG) console.log('MongoDB URI:', mongoURI);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ==================== Enhanced Schemas ====================
const logSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'success', 'warning', 'error', 'debug'], required: true },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Queue' },
  channelId: { type: String, ref: 'Channel' },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, default: 'system' }
});

const Log = mongoose.model('Log', logSchema);

// Enhanced Channel Schema with more fields
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  subscriberCount: { type: Number, default: 0, index: true },
  videoCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  publishedAt: { type: Date },
  country: { type: String, index: true },
  customUrl: { type: String },
  thumbnailUrl: { type: String },
  keywords: [{ type: String }],
  scrapedAt: { type: Date, default: Date.now, index: true },
  emails: [{ type: String }],
  socialLinks: [{ 
    platform: String,
    url: String 
  }],
  websiteUrl: { type: String },
  contactInfo: {
    hasEmail: { type: Boolean, default: false },
    hasSocial: { type: Boolean, default: false },
    hasWebsite: { type: Boolean, default: false }
  },
  engagement: {
    avgViewsPerVideo: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 } // views/subscribers ratio
  },
  qualityScore: { type: Number, default: 0, index: true }, // 0-100 score based on various factors
  category: { type: String },
  language: { type: String },
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  hasHighSubscribers: { type: Boolean, default: false, index: true },
  savedReason: { type: String, enum: ['emails', 'subscribers', 'engagement', 'quality', 'both'], default: 'emails' }
});

// Enhanced Queue Schema with country filter
const queueSchema = new mongoose.Schema({
  task: { type: String, required: true },
  data: { 
    keywords: [{ type: String }],
    count: { type: Number, default: 1000 },
    countryCode: { type: String, default: null }, // New field for country filtering
    minSubscribers: { type: Number, default: 5000 }, // Minimum subscribers threshold
    minEngagement: { type: Number, default: 0.1 }, // Minimum engagement rate
    qualityThreshold: { type: Number, default: 50 } // Minimum quality score (0-100)
  },
  priority: { type: Number, default: 1 },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], 
    default: 'pending',
    index: true 
  },
  createdAt: { type: Date, default: Date.now, index: true },
  processedAt: { type: Date },
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  stats: {
    channelsScraped: { type: Number, default: 0 },
    channelsSaved: { type: Number, default: 0 },
    channelsSkipped: { type: Number, default: 0 },
    emailsFound: { type: Number, default: 0 },
    highSubscriberChannels: { type: Number, default: 0 },
    highEngagementChannels: { type: Number, default: 0 },
    channelsWithWebsite: { type: Number, default: 0 },
    avgQualityScore: { type: Number, default: 0 }
  }
});

const Channel = mongoose.model('Channel', channelSchema);
const Queue = mongoose.model('Queue', queueSchema);

// Logger Class
class Logger {
  constructor(source = 'system') {
    this.source = source;
  }

  async log(level, message, details = {}, taskId = null, channelId = null) {
    const logEntry = {
      level,
      message,
      details,
      taskId,
      channelId,
      source: this.source,
      timestamp: new Date()
    };

    try {
      await Log.create(logEntry);
    } catch (error) {
      console.error('Failed to save log to MongoDB:', error);
    }

    const timestamp = new Date().toISOString();
    const coloredMessage = this.getColoredMessage(level, `[${timestamp}] [${this.source}] ${message}`);
    console.log(coloredMessage);

    if (global.io) {
      global.io.emit('log', logEntry);
    }

    return logEntry;
  }

  info(message, details = {}, taskId = null, channelId = null) {
    return this.log('info', message, details, taskId, channelId);
  }

  success(message, details = {}, taskId = null, channelId = null) {
    return this.log('success', message, details, taskId, channelId);
  }

  warning(message, details = {}, taskId = null, channelId = null) {
    return this.log('warning', message, details, taskId, channelId);
  }

  error(message, details = {}, taskId = null, channelId = null) {
    return this.log('error', message, details, taskId, channelId);
  }

  debug(message, details = {}, taskId = null, channelId = null) {
    if (DEBUG) {
      return this.log('debug', message, details, taskId, channelId);
    }
  }

  getColoredMessage(level, message) {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[35m'
    };
    const reset = '\x1b[0m';
    return `${colors[level] || ''}${message}${reset}`;
  }
}

// Create HTTP server and Socket.io
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

global.io = io;

io.on('connection', (socket) => {
  console.log('✅ Client connected to real-time logs');
  
  Log.find().sort({ timestamp: -1 }).limit(100).then(logs => {
    socket.emit('initial_logs', logs.reverse());
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected from real-time logs');
  });
});

// Create logger instances
const systemLogger = new Logger('system');
const apiLogger = new Logger('api');
const scraperLogger = new Logger('scraper');
const workerLogger = new Logger('worker');

// YouTube API Keys validation
const apiKeys = [
  process.env.YOUTUBE_API_KEY_1,
  process.env.YOUTUBE_API_KEY_2,
  process.env.YOUTUBE_API_KEY_3,
  process.env.YOUTUBE_API_KEY_4,
  process.env.YOUTUBE_API_KEY_5,
  process.env.YOUTUBE_API_KEY_6
].filter(key => key && key !== 'YOUR_API_KEY_1' && key !== 'YOUR_API_KEY_2');

if (apiKeys.length === 0) {
  systemLogger.error('❌ No valid YouTube API keys found');
  process.exit(1);
}

systemLogger.success(`✅ Loaded ${apiKeys.length} YouTube API keys`);

let currentKeyIndex = 0;
let keyUsage = new Array(apiKeys.length).fill(0);
let keyQuotaExceeded = new Array(apiKeys.length).fill(false);
let isProcessing = false;

// Function to get YouTube API client with rotation
function getYouTubeClient() {
  const key = apiKeys[currentKeyIndex];
  if (!key) {
    rotateKey();
    return getYouTubeClient();
  }
  return google.youtube({
    version: 'v3',
    auth: key
  });
}

// Rotate to next key
function rotateKey() {
  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  
  if (currentKeyIndex === 0) {
    setTimeout(() => {
      keyQuotaExceeded.fill(false);
      scraperLogger.info('🔄 Reset all quota exceeded flags');
    }, 60 * 60 * 1000);
  }
  
  if (DEBUG) {
    scraperLogger.debug(`🔄 Rotated API key from ${oldIndex + 1} to ${currentKeyIndex + 1}`, { keyUsage });
  }
}

// Enhanced email extraction
function extractEmails(text) {
  if (!text) return [];
  
  // More comprehensive email regex
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex) || [];
  
  // Filter out common false positives and add domain validation
  return emails.filter(email => {
    const blacklist = [
      'example.com', 'test.com', 'yourdomain.com', 'email.com', 
      'youtube.com', 'gmail.com', 'yahoo.com', 'hotmail.com',
      'outlook.com', 'aol.com', 'protonmail.com', 'mail.com',
      'inbox.com', 'gmx.com', 'yandex.com'
    ];
    
    const domain = email.split('@')[1];
    const localPart = email.split('@')[0];
    
    // Check if it's a valid business/contact email
    const isValidDomain = !blacklist.includes(domain);
    const hasValidLength = email.length > 5 && email.length < 50;
    const hasValidLocalPart = localPart.length > 1 && !localPart.includes('noreply') && !localPart.includes('no-reply');
    
    return isValidDomain && hasValidLength && hasValidLocalPart;
  });
}

// Extract social media links
function extractSocialLinks(text) {
  if (!text) return [];
  
  const socialPatterns = [
    { platform: 'twitter', regex: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi },
    { platform: 'instagram', regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi },
    { platform: 'facebook', regex: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)/gi },
    { platform: 'linkedin', regex: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/gi },
    { platform: 'tiktok', regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+/gi },
    { platform: 'discord', regex: /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com)\/[a-zA-Z0-9]+/gi },
    { platform: 'telegram', regex: /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[a-zA-Z0-9_]+/gi }
  ];
  
  const links = [];
  
  for (const pattern of socialPatterns) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      links.push({
        platform: pattern.platform,
        url: match[0]
      });
    }
  }
  
  return links;
}

// Extract website URL
function extractWebsite(text) {
  if (!text) return null;
  
  // Look for common website patterns
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\/[^\s]*)?/g;
  const matches = text.match(urlRegex);
  
  if (!matches) return null;
  
  // Filter out social media and video platforms
  const blacklistDomains = ['youtube.com', 'youtu.be', 'instagram.com', 'twitter.com', 'facebook.com', 'tiktok.com', 'linkedin.com'];
  
  for (const match of matches) {
    const url = match.startsWith('http') ? match : 'https://' + match;
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      if (!blacklistDomains.includes(domain) && !domain.includes('google.com')) {
        return url;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// Calculate engagement rate
function calculateEngagementRate(subscribers, views, videoCount) {
  if (!subscribers || !views || !videoCount) return 0;
  const avgViewsPerVideo = views / videoCount;
  return avgViewsPerVideo / subscribers; // Views per subscriber ratio
}

// Calculate quality score (0-100)
function calculateQualityScore(subscribers, videoCount, viewCount, hasEmails, hasSocial, hasWebsite, engagementRate) {
  let score = 0;
  
  // Subscriber score (max 30 points)
  if (subscribers >= 100000) score += 30;
  else if (subscribers >= 50000) score += 25;
  else if (subscribers >= 25000) score += 20;
  else if (subscribers >= 10000) score += 15;
  else if (subscribers >= 5000) score += 10;
  else if (subscribers >= 1000) score += 5;
  
  // Video count score (max 20 points)
  if (videoCount >= 500) score += 20;
  else if (videoCount >= 200) score += 15;
  else if (videoCount >= 100) score += 10;
  else if (videoCount >= 50) score += 5;
  
  // Engagement score (max 30 points)
  if (engagementRate >= 0.5) score += 30; // High engagement
  else if (engagementRate >= 0.3) score += 20;
  else if (engagementRate >= 0.1) score += 10;
  else if (engagementRate >= 0.05) score += 5;
  
  // Contact info score (max 20 points)
  if (hasEmails) score += 10;
  if (hasWebsite) score += 5;
  if (hasSocial) score += 5;
  
  return Math.min(score, 100);
}

// Enhanced channel filtering
function shouldSaveChannel(emails, subscriberCount, engagementRate, qualityScore, minSubscribers = 5000, minEngagement = 0.1, qualityThreshold = 50) {
  const hasEmails = emails.length > 0;
  const hasGoodSubscribers = subscriberCount >= minSubscribers;
  const hasGoodEngagement = engagementRate >= minEngagement;
  const hasGoodQuality = qualityScore >= qualityThreshold;
  
  // Priority order: Emails > Quality > Subscribers > Engagement
  const shouldSave = hasEmails || hasGoodQuality || hasGoodSubscribers || hasGoodEngagement;
  
  let reason = 'none';
  if (hasEmails && hasGoodQuality) reason = 'both';
  else if (hasEmails) reason = 'emails';
  else if (hasGoodQuality) reason = 'quality';
  else if (hasGoodSubscribers) reason = 'subscribers';
  else if (hasGoodEngagement) reason = 'engagement';
  
  return {
    shouldSave,
    reason,
    hasEmails,
    hasGoodSubscribers,
    hasGoodEngagement,
    hasGoodQuality
  };
}

// Enhanced scraping logic with country filtering
async function scrapeChannels(keywords, maxResults = 5000, taskId = null, countryCode = null, minSubscribers = 5000, minEngagement = 0.1, qualityThreshold = 50) {
  let totalChannels = 0;
  let savedChannels = 0;
  let skippedChannels = 0;
  let totalEmailsFound = 0;
  let highSubscriberChannels = 0;
  let highEngagementChannels = 0;
  let channelsWithWebsite = 0;
  let totalQualityScore = 0;
  let failedAttempts = 0;
  const maxFailedAttempts = 5;
  const maxPerKeyword = Math.ceil(maxResults / keywords.length);

  await scraperLogger.info(`🚀 Starting enhanced scrape`, { 
    keywords: keywords.length, 
    maxResults, 
    countryCode,
    minSubscribers,
    minEngagement,
    qualityThreshold 
  }, taskId);

  for (const keyword of keywords) {
    if (savedChannels >= maxResults) break;
    if (failedAttempts >= maxFailedAttempts) {
      await scraperLogger.warning('⚠️ Too many failed attempts, stopping scrape', { failedAttempts }, taskId);
      break;
    }

    let pageToken = null;
    let keywordCount = 0;
    let keywordFailedAttempts = 0;

    while (keywordCount < maxPerKeyword && savedChannels < maxResults) {
      try {
        if (keyQuotaExceeded.every(exceeded => exceeded)) {
          await scraperLogger.warning('⚠️ All API keys quota exceeded. Waiting 1 hour...', null, taskId);
          await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
          keyQuotaExceeded.fill(false);
        }

        if (keyQuotaExceeded[currentKeyIndex]) {
          rotateKey();
          continue;
        }

        const youtube = getYouTubeClient();
        
        // Build search params with country filter if provided
        const searchParams = {
          part: 'snippet',
          q: keyword,
          type: 'channel',
          maxResults: 50,
          order: 'relevance',
          pageToken: pageToken
        };

        // Add region code if specified (country filter)
        if (countryCode) {
          searchParams.regionCode = countryCode;
          // Also add relevance language based on country
          const languageMap = {
            'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en',
            'IN': 'hi', 'FR': 'fr', 'DE': 'de', 'ES': 'es',
            'IT': 'it', 'JP': 'ja', 'KR': 'ko', 'BR': 'pt',
            'MX': 'es', 'RU': 'ru', 'CN': 'zh', 'TW': 'zh'
          };
          if (languageMap[countryCode]) {
            searchParams.relevanceLanguage = languageMap[countryCode];
          }
        }

        if (DEBUG) {
          await scraperLogger.debug(`🔍 Searching for channels`, { keyword, countryCode, pageToken }, taskId);
        }

        const searchResponse = await youtube.search.list(searchParams);
        keyUsage[currentKeyIndex]++;
        
        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
          await scraperLogger.info(`No channels found for keyword: ${keyword}`, { countryCode }, taskId);
          break;
        }

        await scraperLogger.debug(`Found ${searchResponse.data.items.length} channels on page`, null, taskId);

        for (const item of searchResponse.data.items) {
          if (savedChannels >= maxResults) break;

          const channelId = item.snippet.channelId;
          totalChannels++;

          const existingChannel = await Channel.findOne({ channelId });
          if (existingChannel) {
            if (DEBUG) await scraperLogger.debug(`Channel ${channelId} already exists, skipping`, null, taskId, channelId);
            skippedChannels++;
            continue;
          }

          try {
            // Get detailed channel info
            const channelResponse = await youtube.channels.list({
              part: 'snippet,statistics',
              id: channelId
            });

            keyUsage[currentKeyIndex]++;

            const channelData = channelResponse.data.items?.[0];
            if (!channelData) {
              await scraperLogger.debug(`No channel data for ID: ${channelId}`, null, taskId, channelId);
              skippedChannels++;
              continue;
            }

            const subscriberCount = parseInt(channelData.statistics?.subscriberCount || 0);
            const videoCount = parseInt(channelData.statistics?.videoCount || 0);
            const viewCount = parseInt(channelData.statistics?.viewCount || 0);
            
            // Skip channels with too few subscribers (unless they have emails)
            if (subscriberCount < 1000 && !channelData.snippet.description?.includes('@')) {
              skippedChannels++;
              continue;
            }
            
            const emails = extractEmails(channelData.snippet.description);
            const socialLinks = extractSocialLinks(channelData.snippet.description);
            const websiteUrl = extractWebsite(channelData.snippet.description);
            
            const engagementRate = calculateEngagementRate(subscriberCount, viewCount, videoCount);
            const qualityScore = calculateQualityScore(
              subscriberCount, 
              videoCount, 
              viewCount, 
              emails.length > 0,
              socialLinks.length > 0,
              !!websiteUrl,
              engagementRate
            );
            
            // Check if channel meets criteria
            const { shouldSave, reason, hasEmails, hasGoodSubscribers, hasGoodEngagement, hasGoodQuality } = 
              shouldSaveChannel(emails, subscriberCount, engagementRate, qualityScore, minSubscribers, minEngagement, qualityThreshold);
            
            if (hasEmails) totalEmailsFound += emails.length;
            if (hasGoodSubscribers) highSubscriberChannels++;
            if (hasGoodEngagement) highEngagementChannels++;
            if (websiteUrl) channelsWithWebsite++;
            totalQualityScore += qualityScore;

            if (shouldSave) {
              const channel = new Channel({
                channelId,
                title: channelData.snippet.title,
                description: channelData.snippet.description,
                subscriberCount,
                videoCount,
                viewCount,
                publishedAt: new Date(channelData.snippet.publishedAt),
                country: channelData.snippet.country || countryCode,
                customUrl: channelData.snippet.customUrl,
                thumbnailUrl: channelData.snippet.thumbnails?.default?.url,
                keywords: [keyword],
                emails,
                socialLinks,
                websiteUrl,
                contactInfo: {
                  hasEmail: emails.length > 0,
                  hasSocial: socialLinks.length > 0,
                  hasWebsite: !!websiteUrl
                },
                engagement: {
                  avgViewsPerVideo: viewCount / (videoCount || 1),
                  engagementRate
                },
                qualityScore,
                category: keyword,
                language: channelData.snippet.defaultLanguage,
                lastUpdated: new Date(),
                hasEmails: emails.length > 0,
                hasHighSubscribers: subscriberCount >= minSubscribers,
                savedReason: reason
              });

              await channel.save();
              savedChannels++;
              
              await scraperLogger.success(
                `✅ Saved: "${channel.title}"`, 
                { 
                  reason, 
                  emailsCount: emails.length,
                  subscribers: subscriberCount,
                  qualityScore,
                  engagementRate: engagementRate.toFixed(2),
                  channelId 
                }, 
                taskId, 
                channelId
              );
            } else {
              skippedChannels++;
              if (DEBUG) {
                await scraperLogger.debug(
                  `⏭️ Skipped: "${channelData.snippet.title}"`, 
                  { 
                    subscribers: subscriberCount,
                    qualityScore,
                    reason: 'Does not meet criteria'
                  }, 
                  taskId, 
                  channelId
                );
              }
            }

            keywordCount++;

            // Update task stats
            if (taskId) {
              await Queue.findByIdAndUpdate(taskId, {
                $set: {
                  'stats.channelsScraped': totalChannels,
                  'stats.channelsSaved': savedChannels,
                  'stats.channelsSkipped': skippedChannels,
                  'stats.emailsFound': totalEmailsFound,
                  'stats.highSubscriberChannels': highSubscriberChannels,
                  'stats.highEngagementChannels': highEngagementChannels,
                  'stats.channelsWithWebsite': channelsWithWebsite,
                  'stats.avgQualityScore': savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0
                }
              });
            }

            if (savedChannels >= maxResults) break;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            await scraperLogger.error(`Error processing channel`, { channelId, error: error.message }, taskId, channelId);
            skippedChannels++;
          }
        }

        pageToken = searchResponse.data.nextPageToken;
        if (!pageToken) break;

        failedAttempts = 0;
        keywordFailedAttempts = 0;
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        await scraperLogger.error(`Error scraping for keyword "${keyword}"`, { error: error.message }, taskId);
        
        if (error.code === 403) {
          await scraperLogger.warning(`Quota exceeded for key ${currentKeyIndex + 1}`, null, taskId);
          keyQuotaExceeded[currentKeyIndex] = true;
          rotateKey();
          failedAttempts++;
          keywordFailedAttempts++;
        } else if (error.code === 429) {
          await scraperLogger.warning('Rate limited, waiting 1 minute...', null, taskId);
          await new Promise(resolve => setTimeout(resolve, 60000));
          rotateKey();
          failedAttempts++;
          keywordFailedAttempts++;
        } else {
          rotateKey();
          failedAttempts++;
          keywordFailedAttempts++;
        }

        const waitTime = Math.min(1000 * Math.pow(2, keywordFailedAttempts), 60000);
        await scraperLogger.debug(`Waiting ${waitTime}ms before retry...`, null, taskId);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  const stats = {
    totalProcessed: totalChannels,
    saved: savedChannels,
    skipped: skippedChannels,
    emailsFound: totalEmailsFound,
    highSubscriberChannels,
    highEngagementChannels,
    channelsWithWebsite,
    avgQualityScore: savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0,
    saveRate: totalChannels > 0 ? ((savedChannels / totalChannels) * 100).toFixed(2) + '%' : '0%'
  };

  await scraperLogger.success('🎉 Scrape completed!', stats, taskId);
  
  return stats;
}

// Process queue with enhanced data
async function processQueue() {
  if (isProcessing) {
    await workerLogger.debug('Queue processing already in progress, skipping...');
    return;
  }

  isProcessing = true;

  try {
    const pendingTasks = await Queue.find({ status: 'pending' })
      .sort({ priority: -1, createdAt: 1 })
      .limit(5);

    if (pendingTasks.length === 0) {
      await workerLogger.debug('No pending tasks in queue');
      isProcessing = false;
      return;
    }

    await workerLogger.info(`📋 Processing ${pendingTasks.length} tasks from queue`);

    for (const task of pendingTasks) {
      await workerLogger.info(`🔧 Processing task: ${task._id}`, { taskType: task.task }, task._id);
      task.status = 'processing';
      await task.save();

      try {
        if (task.task === 'scrape_channels') {
          const keywords = task.data.keywords || ['technology', 'business', 'entertainment'];
          const count = parseInt(task.data.count) || 1000;
          const countryCode = task.data.countryCode || null;
          const minSubscribers = parseInt(task.data.minSubscribers) || 5000;
          const minEngagement = parseFloat(task.data.minEngagement) || 0.1;
          const qualityThreshold = parseInt(task.data.qualityThreshold) || 50;
          
          await workerLogger.info(`📊 Task ${task._id}: Starting enhanced scrape`, { 
            keywords: keywords.length, 
            count,
            countryCode,
            minSubscribers,
            minEngagement,
            qualityThreshold
          }, task._id);
          
          const stats = await scrapeChannels(
            keywords, 
            count, 
            task._id, 
            countryCode, 
            minSubscribers, 
            minEngagement, 
            qualityThreshold
          );
          
          task.status = 'completed';
          task.processedAt = new Date();
          task.stats = stats;
          await task.save();
          
          await workerLogger.success(`✅ Task ${task._id} completed`, stats, task._id);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        await workerLogger.error(`❌ Task ${task._id} failed`, { error: error.message }, task._id);
        
        task.status = 'failed';
        task.error = error.message;
        task.retryCount = (task.retryCount || 0) + 1;
        
        if (task.retryCount < 3) {
          task.status = 'pending';
          await workerLogger.info(`🔄 Will retry task ${task._id}`, { attempt: task.retryCount + 1 }, task._id);
        }
        
        await task.save();
      }
    }
  } catch (error) {
    await workerLogger.error('Queue processing error', { error: error.message });
  } finally {
    isProcessing = false;
  }
}

// Express middleware
app.use(express.json());
app.use(cors({
  origin:'http://localhost:5173',
  credentials: true
}));

// Logging middleware
app.use(async (req, res, next) => {
  await apiLogger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ==================== Enhanced Routes ====================

// Get list of supported countries
app.get('/api/countries', async (req, res) => {
  const countries = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'IN', name: 'India' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'RU', name: 'Russia' },
    { code: 'CN', name: 'China' },
    { code: 'TW', name: 'Taiwan' },
    { code: 'HK', name: 'Hong Kong' },
    { code: 'SG', name: 'Singapore' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'PH', name: 'Philippines' },
    { code: 'TH', name: 'Thailand' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'BD', name: 'Bangladesh' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'EG', name: 'Egypt' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'IL', name: 'Israel' },
    { code: 'TR', name: 'Turkey' },
    { code: 'AR', name: 'Argentina' },
    { code: 'CL', name: 'Chile' },
    { code: 'CO', name: 'Colombia' },
    { code: 'PE', name: 'Peru' },
    { code: 'VE', name: 'Venezuela' }
  ];
  res.json(countries);
});

// Enhanced scrape endpoint with country filter
app.post('/api/scrape', async (req, res) => {
  try {
    const { 
      keywords, 
      count, 
      countryCode,
      minSubscribers,
      minEngagement,
      qualityThreshold 
    } = req.body;
    
    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'Keywords must be an array' });
    }

    if (keywords.length === 0) {
      return res.status(400).json({ error: 'Keywords array cannot be empty' });
    }

    const task = new Queue({
      task: 'scrape_channels',
      data: { 
        keywords: keywords.slice(0, 10),
        count: Math.min(count || 1000, 10000),
        countryCode: countryCode || null,
        minSubscribers: parseInt(minSubscribers) || 5000,
        minEngagement: parseFloat(minEngagement) || 0.1,
        qualityThreshold: parseInt(qualityThreshold) || 50
      },
      stats: {
        channelsScraped: 0,
        channelsSaved: 0,
        channelsSkipped: 0,
        emailsFound: 0,
        highSubscriberChannels: 0,
        highEngagementChannels: 0,
        channelsWithWebsite: 0,
        avgQualityScore: 0
      }
    });
    
    await task.save();
    await apiLogger.success(`✅ New enhanced scrape task queued`, { 
      taskId: task._id, 
      keywords, 
      count,
      countryCode,
      minSubscribers,
      minEngagement,
      qualityThreshold
    }, task._id);
    
    processQueue().catch(console.error);
    
    res.json({ 
      message: 'Enhanced scraping task queued successfully', 
      taskId: task._id,
      estimatedChannels: task.data.count,
      filters: {
        country: countryCode || 'Worldwide',
        minSubscribers: minSubscribers || 5000,
        minEngagement: minEngagement || 0.1,
        qualityThreshold: qualityThreshold || 50
      }
    });
  } catch (error) {
    await apiLogger.error('Error creating scrape task', { error: error.message });
    res.status(500).json({ error: 'Failed to create scrape task' });
  }
});

// Enhanced channels endpoint with more filters
app.get('/api/channels', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      minSubscribers, 
      maxSubscribers,
      minQuality,
      minEngagement,
      hasEmails, 
      hasHighSubscribers,
      hasWebsite,
      hasSocial,
      country,
      keyword,
      sortBy = 'qualityScore',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    // Subscriber range
    if (minSubscribers || maxSubscribers) {
      query.subscriberCount = {};
      if (minSubscribers) query.subscriberCount.$gte = parseInt(minSubscribers);
      if (maxSubscribers) query.subscriberCount.$lte = parseInt(maxSubscribers);
    }
    
    // Quality score
    if (minQuality) {
      query.qualityScore = { $gte: parseInt(minQuality) };
    }
    
    // Engagement rate
    if (minEngagement) {
      query['engagement.engagementRate'] = { $gte: parseFloat(minEngagement) };
    }
    
    // Boolean filters
    if (hasEmails === 'true') query.hasEmails = true;
    if (hasHighSubscribers === 'true') query.hasHighSubscribers = true;
    if (hasWebsite === 'true') query['contactInfo.hasWebsite'] = true;
    if (hasSocial === 'true') query['contactInfo.hasSocial'] = true;
    
    // Country filter
    if (country) query.country = country;
    
    // Keyword filter (search in keywords array)
    if (keyword) query.keywords = keyword;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const channels = await Channel.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Channel.countDocuments(query);

    // Get enhanced stats
    const stats = {
      totalWithEmails: await Channel.countDocuments({ hasEmails: true }),
      totalWithHighSubscribers: await Channel.countDocuments({ hasHighSubscribers: true }),
      totalWithBoth: await Channel.countDocuments({ hasEmails: true, hasHighSubscribers: true }),
      totalWithWebsite: await Channel.countDocuments({ 'contactInfo.hasWebsite': true }),
      totalWithSocial: await Channel.countDocuments({ 'contactInfo.hasSocial': true }),
      avgQualityScore: await Channel.aggregate([
        { $group: { _id: null, avg: { $avg: '$qualityScore' } } }
      ]).then(result => result[0]?.avg || 0)
    };

    res.json({ 
      channels, 
      total, 
      page: parseInt(page), 
      pages: Math.ceil(total / limit),
      stats
    });
  } catch (error) {
    await apiLogger.error('Error fetching channels', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Enhanced stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const totalChannels = await Channel.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayChannels = await Channel.countDocuments({ scrapedAt: { $gte: today } });
    const channelsWithEmails = await Channel.countDocuments({ hasEmails: true });
    const channelsWithHighSubs = await Channel.countDocuments({ hasHighSubscribers: true });
    const channelsWithBoth = await Channel.countDocuments({ hasEmails: true, hasHighSubscribers: true });
    const channelsWithWebsite = await Channel.countDocuments({ 'contactInfo.hasWebsite': true });
    const channelsWithSocial = await Channel.countDocuments({ 'contactInfo.hasSocial': true });
    
    // Email stats
    const emailStats = await Channel.aggregate([
      { $unwind: '$emails' },
      { $group: { _id: null, totalEmails: { $sum: 1 } } }
    ]);
    const totalEmails = emailStats[0]?.totalEmails || 0;
    
    // Quality stats
    const qualityStats = await Channel.aggregate([
      {
        $group: {
          _id: null,
          avgQuality: { $avg: '$qualityScore' },
          maxQuality: { $max: '$qualityScore' },
          minQuality: { $min: '$qualityScore' }
        }
      }
    ]);
    
    // Engagement stats
    const engagementStats = await Channel.aggregate([
      {
        $group: {
          _id: null,
          avgEngagement: { $avg: '$engagement.engagementRate' }
        }
      }
    ]);
    
    // Country distribution
    const countryDistribution = await Channel.aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Queue stats
    const queueStats = {
      pending: await Queue.countDocuments({ status: 'pending' }),
      processing: await Queue.countDocuments({ status: 'processing' }),
      completed: await Queue.countDocuments({ status: 'completed' }),
      failed: await Queue.countDocuments({ status: 'failed' }),
      cancelled: await Queue.countDocuments({ status: 'cancelled' })
    };

    // Log stats for last 24 hours
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    
    const logStats = await Log.aggregate([
      { $match: { timestamp: { $gte: last24h } } },
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]);

    res.json({ 
      totalChannels,
      todayChannels,
      channelsWithEmails,
      channelsWithHighSubs,
      channelsWithBoth,
      channelsWithWebsite,
      channelsWithSocial,
      totalEmails,
      queueStats,
      logStats: logStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      qualityStats: qualityStats[0] || { avgQuality: 0, maxQuality: 0, minQuality: 0 },
      avgEngagement: engagementStats[0]?.avgEngagement || 0,
      countryDistribution,
      saveRate: totalChannels > 0 ? ((channelsWithEmails + channelsWithHighSubs) / totalChannels * 100).toFixed(2) + '%' : '0%'
    });
  } catch (error) {
    await apiLogger.error('Error fetching stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get channel by ID with full details
app.get('/api/channels/:channelId', async (req, res) => {
  try {
    const channel = await Channel.findOne({ channelId: req.params.channelId });
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  } catch (error) {
    await apiLogger.error('Error fetching channel', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch channel' });
  }
});

// Export channels as CSV with enhanced data
app.get('/api/export/channels', async (req, res) => {
  try {
    const channels = await Channel.find().limit(10000);
    
    const csv = [
      ['Title', 'Channel ID', 'Subscribers', 'Videos', 'Views', 'Emails', 'Social Links', 'Website', 'Quality Score', 'Engagement Rate', 'Country', 'Has Emails', 'Has 50k+ Subs', 'Saved Reason', 'Keywords', 'Published At', 'Scraped At'].join(','),
      ...channels.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        c.channelId || '',
        c.subscriberCount || 0,
        c.videoCount || 0,
        c.viewCount || 0,
        `"${(c.emails || []).join('; ')}"`,
        `"${(c.socialLinks || []).map(s => s.url).join('; ')}"`,
        c.websiteUrl || '',
        c.qualityScore || 0,
        (c.engagement?.engagementRate || 0).toFixed(2),
        c.country || 'N/A',
        c.hasEmails || false,
        c.hasHighSubscribers || false,
        c.savedReason || 'emails',
        `"${(c.keywords || []).join('; ')}"`,
        c.publishedAt ? new Date(c.publishedAt).toLocaleDateString() : 'N/A',
        c.scrapedAt ? new Date(c.scrapedAt).toLocaleString() : 'N/A'
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=channels-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    await apiLogger.error('Error exporting channels', { error: error.message });
    res.status(500).json({ error: 'Failed to export channels' });
  }
});

// Get queue status
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await Queue.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    const stats = {
      pending: await Queue.countDocuments({ status: 'pending' }),
      processing: await Queue.countDocuments({ status: 'processing' }),
      completed: await Queue.countDocuments({ status: 'completed' }),
      failed: await Queue.countDocuments({ status: 'failed' }),
      cancelled: await Queue.countDocuments({ status: 'cancelled' })
    };
    
    res.json({ queue, stats });
  } catch (error) {
    await apiLogger.error('Error fetching queue', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// Get task details with logs
app.get('/api/task/:taskId', async (req, res) => {
  try {
    const task = await Queue.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const logs = await Log.find({ taskId: req.params.taskId })
      .sort({ timestamp: -1 })
      .limit(50);
    
    res.json({ task, logs });
  } catch (error) {
    await apiLogger.error('Error fetching task', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Cancel pending task
app.delete('/api/task/:taskId', async (req, res) => {
  try {
    const task = await Queue.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.status === 'pending') {
      task.status = 'cancelled';
      await task.save();
      await apiLogger.info(`Task cancelled`, { taskId: task._id });
      res.json({ message: 'Task cancelled successfully' });
    } else {
      res.status(400).json({ error: 'Can only cancel pending tasks' });
    }
  } catch (error) {
    await apiLogger.error('Error cancelling task', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

// Manual queue processing trigger
app.post('/api/process-queue', async (req, res) => {
  try {
    processQueue().catch(console.error);
    res.json({ message: 'Queue processing triggered' });
  } catch (error) {
    await apiLogger.error('Error triggering queue', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger queue processing' });
  }
});

// Log routes
app.get('/api/logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      level, 
      source,
      taskId,
      startDate,
      endDate 
    } = req.query;

    const query = {};
    
    if (level) query.level = level;
    if (source) query.source = source;
    if (taskId) query.taskId = taskId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('taskId', 'task status');

    const total = await Log.countDocuments(query);

    const stats = await Log.aggregate([
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]);

    res.json({
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      stats: stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    });
  } catch (error) {
    await apiLogger.error('Error fetching logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.get('/api/logs/recent', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await Log.find()
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('taskId', 'task status');
    
    res.json(logs.reverse());
  } catch (error) {
    await apiLogger.error('Error fetching recent logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    const { olderThan } = req.query;
    
    if (olderThan) {
      const date = new Date();
      date.setDate(date.getDate() - parseInt(olderThan));
      await Log.deleteMany({ timestamp: { $lt: date } });
      await apiLogger.info(`Deleted logs older than ${olderThan} days`);
    } else {
      await Log.deleteMany({});
      await apiLogger.info('Deleted all logs');
    }
    
    res.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    await apiLogger.error('Error clearing logs', { error: error.message });
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    apiKeys: apiKeys.length,
    queueProcessing: isProcessing,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Daily scrape function with enhanced settings
async function runDailyScrape() {
  await systemLogger.info('Starting daily enhanced scrape');
  const keywords = ['technology', 'business', 'entertainment', 'gaming', 'education', 'music', 'sports', 'news', 'health', 'finance'];
  
  const task = new Queue({
    task: 'scrape_channels',
    data: { 
      keywords, 
      count: 5000,
      countryCode: null, // Worldwide
      minSubscribers: 5000,
      minEngagement: 0.1,
      qualityThreshold: 50
    },
    priority: 2
  });
  
  await task.save();
  await systemLogger.info(`Daily enhanced scrape task queued`, { taskId: task._id });
  
  processQueue().catch(console.error);
}

// Worker startup
async function startWorker() {
  await systemLogger.info('👷 Enhanced worker started');
  
  try {
    setInterval(() => {
      processQueue().catch(error => {
        workerLogger.error('Queue processing error', { error: error.message });
      });
    }, 30000);

    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timeToMidnight = midnight - now;
    
    setTimeout(() => {
      runDailyScrape().catch(console.error);
      setInterval(runDailyScrape, 24 * 60 * 60 * 1000);
    }, timeToMidnight);

    await systemLogger.info(`⏰ Next daily scrape scheduled in ${Math.round(timeToMidnight / 1000 / 60)} minutes`);

  } catch (error) {
    await systemLogger.error('Worker error', { error: error.message });
    setTimeout(startWorker, 10000);
  }
}

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Enhanced YouTube Scraper running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log(`📊 Enhanced API endpoints:`);
  console.log(`   POST /api/scrape - Start enhanced scrape with country filter`);
  console.log(`   GET /api/countries - Get supported countries`);
  console.log(`   GET /api/channels - Get channels with enhanced filters`);
  console.log(`   GET /api/channels/:channelId - Get channel details`);
  console.log(`   GET /api/export/channels - Export channels as CSV`);
  console.log(`   GET /api/queue - Get queue status`);
  console.log(`   GET /api/stats - Get enhanced statistics`);
  console.log(`   GET /api/logs - Get logs with filters`);
  console.log(`   GET /api/task/:taskId - Get task status with logs`);
  console.log(`   DELETE /api/task/:taskId - Cancel pending task`);
  console.log(`   POST /api/process-queue - Manually trigger queue`);
  console.log(`   GET /api/health - Health check`);
  console.log(`\n📡 WebSocket: Real-time logs on ws://localhost:${PORT}`);
  
  startWorker();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Performing graceful shutdown...');
  await systemLogger.info('Server shutting down');
  await mongoose.connection.close();
  io.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Performing graceful shutdown...');
  await systemLogger.info('Server shutting down');
  await mongoose.connection.close();
  io.close();
  server.close();
  process.exit(0);
});