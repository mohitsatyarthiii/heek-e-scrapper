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
const mongoURI = process.env.MONGO_URI ;
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

// ==================== NEW: Logging Schema ====================
const logSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'success', 'warning', 'error', 'debug'], required: true },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Queue' },
  channelId: { type: String, ref: 'Channel' },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, default: 'system' } // 'scraper', 'api', 'worker', 'system'
});

const Log = mongoose.model('Log', logSchema);

// ==================== NEW: Logger Class ====================
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

    // Save to MongoDB
    try {
      await Log.create(logEntry);
    } catch (error) {
      console.error('Failed to save log to MongoDB:', error);
    }

    // Console output with colors
    const timestamp = new Date().toISOString();
    const coloredMessage = this.getColoredMessage(level, `[${timestamp}] [${this.source}] ${message}`);
    console.log(coloredMessage);

    // Emit via Socket.io if available
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
      info: '\x1b[36m', // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      debug: '\x1b[35m' // Magenta
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

// Make io available globally
global.io = io;

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected to real-time logs');
  
  // Send last 100 logs on connection
  Log.find().sort({ timestamp: -1 }).limit(100).then(logs => {
    socket.emit('initial_logs', logs.reverse());
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected from real-time logs');
  });
});

// MongoDB Schemas (existing ones remain same)
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  subscriberCount: { type: Number, default: 0 },
  videoCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  publishedAt: { type: Date },
  country: { type: String },
  customUrl: { type: String },
  thumbnailUrl: { type: String },
  keywords: [{ type: String }],
  scrapedAt: { type: Date, default: Date.now, index: true },
  emails: [{ type: String }],
  leads: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  hasHighSubscribers: { type: Boolean, default: false, index: true },
  savedReason: { type: String, enum: ['emails', 'subscribers', 'both'], default: 'emails' }
});

const queueSchema = new mongoose.Schema({
  task: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
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
    highSubscriberChannels: { type: Number, default: 0 }
  }
});

const Channel = mongoose.model('Channel', channelSchema);
const Queue = mongoose.model('Queue', queueSchema);

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

// Extract emails from text
function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex) || [];
  
  return emails.filter(email => {
    const blacklist = ['example.com', 'test.com', 'yourdomain.com', 'email.com', 'youtube.com', 'gmail.com'];
    const domain = email.split('@')[1];
    return !blacklist.includes(domain) && email.length > 5 && email.length < 50;
  });
}

// Check if channel should be saved
function shouldSaveChannel(emails, subscriberCount) {
  const hasEmails = emails.length > 0;
  const hasHighSubscribers = subscriberCount >= 50000;
  
  return {
    shouldSave: hasEmails || hasHighSubscribers,
    reason: hasEmails && hasHighSubscribers ? 'both' : hasEmails ? 'emails' : hasHighSubscribers ? 'subscribers' : 'none',
    hasEmails,
    hasHighSubscribers
  };
}

// Enhanced scraping logic with logging
async function scrapeChannels(keywords, maxResults = 5000, taskId = null) {
  let totalChannels = 0;
  let savedChannels = 0;
  let skippedChannels = 0;
  let totalEmailsFound = 0;
  let highSubscriberChannels = 0;
  let failedAttempts = 0;
  const maxFailedAttempts = 5;
  const maxPerKeyword = Math.ceil(maxResults / keywords.length);

  await scraperLogger.info(`🚀 Starting scrape for ${keywords.length} keywords`, { keywords, maxResults }, taskId);

  for (const keyword of keywords) {
    if (totalChannels >= maxResults) break;
    if (failedAttempts >= maxFailedAttempts) {
      await scraperLogger.warning('⚠️ Too many failed attempts, stopping scrape', { failedAttempts }, taskId);
      break;
    }

    let pageToken = null;
    let keywordCount = 0;
    let keywordFailedAttempts = 0;

    while (keywordCount < maxPerKeyword && totalChannels < maxResults) {
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
        
        if (DEBUG) {
          await scraperLogger.debug(`🔍 Searching for channels with keyword: ${keyword}`, { pageToken }, taskId);
        }

        const searchResponse = await youtube.search.list({
          part: 'snippet',
          q: keyword,
          type: 'channel',
          maxResults: 50,
          order: 'relevance',
          pageToken: pageToken
        });

        keyUsage[currentKeyIndex]++;
        
        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
          await scraperLogger.info(`No channels found for keyword: ${keyword}`, null, taskId);
          break;
        }

        await scraperLogger.debug(`Found ${searchResponse.data.items.length} channels on page`, null, taskId);

        for (const item of searchResponse.data.items) {
          if (totalChannels >= maxResults) break;

          const channelId = item.snippet.channelId;
          totalChannels++;

          const existingChannel = await Channel.findOne({ channelId });
          if (existingChannel) {
            if (DEBUG) await scraperLogger.debug(`Channel ${channelId} already exists, skipping`, null, taskId, channelId);
            skippedChannels++;
            continue;
          }

          try {
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
            const emails = extractEmails(channelData.snippet.description);
            
            const { shouldSave, reason, hasEmails, hasHighSubscribers } = shouldSaveChannel(emails, subscriberCount);
            
            if (hasEmails) totalEmailsFound += emails.length;
            if (hasHighSubscribers) highSubscriberChannels++;

            if (shouldSave) {
              const channel = new Channel({
                channelId,
                title: channelData.snippet.title,
                description: channelData.snippet.description,
                subscriberCount,
                videoCount: parseInt(channelData.statistics?.videoCount || 0),
                viewCount: parseInt(channelData.statistics?.viewCount || 0),
                publishedAt: new Date(channelData.snippet.publishedAt),
                country: channelData.snippet.country,
                customUrl: channelData.snippet.customUrl,
                thumbnailUrl: channelData.snippet.thumbnails?.default?.url,
                keywords: [keyword],
                emails,
                lastUpdated: new Date(),
                hasEmails,
                hasHighSubscribers,
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
                  { subscribers: subscriberCount }, 
                  taskId, 
                  channelId
                );
              }
            }

            keywordCount++;

            if (taskId) {
              await Queue.findByIdAndUpdate(taskId, {
                $set: {
                  'stats.channelsScraped': totalChannels,
                  'stats.channelsSaved': savedChannels,
                  'stats.channelsSkipped': skippedChannels,
                  'stats.emailsFound': totalEmailsFound,
                  'stats.highSubscriberChannels': highSubscriberChannels
                }
              });
            }

            if (savedChannels >= maxResults) break;
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
    highSubscriberChannels: highSubscriberChannels,
    saveRate: ((savedChannels / totalChannels) * 100).toFixed(2) + '%'
  };

  await scraperLogger.success('🎉 Scrape completed!', stats, taskId);
  
  return stats;
}

// Process queue
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
          
          await workerLogger.info(`📊 Task ${task._id}: Starting scrape`, { keywords: keywords.length, count }, task._id);
          
          const stats = await scrapeChannels(keywords, count, task._id);
          
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
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Logging middleware
app.use(async (req, res, next) => {
  await apiLogger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ==================== NEW: Log Routes ====================
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

    // Get log statistics
    const stats = await Log.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 }
        }
      }
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

// Existing routes with logging
app.post('/api/scrape', async (req, res) => {
  try {
    const { keywords, count } = req.body;
    
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
        count: Math.min(count || 1000, 10000)
      },
      stats: {
        channelsScraped: 0,
        channelsSaved: 0,
        channelsSkipped: 0,
        emailsFound: 0,
        highSubscriberChannels: 0
      }
    });
    
    await task.save();
    await apiLogger.success(`✅ New scrape task queued`, { taskId: task._id, keywords, count }, task._id);
    
    processQueue().catch(console.error);
    
    res.json({ 
      message: 'Scraping task queued successfully', 
      taskId: task._id,
      estimatedChannels: task.data.count
    });
  } catch (error) {
    await apiLogger.error('Error creating scrape task', { error: error.message });
    res.status(500).json({ error: 'Failed to create scrape task' });
  }
});

app.get('/api/channels', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      minSubscribers, 
      hasEmails, 
      hasHighSubscribers,
      keyword,
      sortBy = 'scrapedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    if (minSubscribers) query.subscriberCount = { $gte: parseInt(minSubscribers) };
    if (hasEmails === 'true') query.hasEmails = true;
    if (hasHighSubscribers === 'true') query.hasHighSubscribers = true;
    if (keyword) query.keywords = keyword;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const channels = await Channel.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Channel.countDocuments(query);

    const stats = {
      totalWithEmails: await Channel.countDocuments({ hasEmails: true }),
      totalWithHighSubscribers: await Channel.countDocuments({ hasHighSubscribers: true }),
      totalBoth: await Channel.countDocuments({ hasEmails: true, hasHighSubscribers: true })
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

app.get('/api/stats', async (req, res) => {
  try {
    const totalChannels = await Channel.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayChannels = await Channel.countDocuments({ scrapedAt: { $gte: today } });
    const channelsWithEmails = await Channel.countDocuments({ hasEmails: true });
    const channelsWithHighSubs = await Channel.countDocuments({ hasHighSubscribers: true });
    const channelsWithBoth = await Channel.countDocuments({ hasEmails: true, hasHighSubscribers: true });
    
    const emailStats = await Channel.aggregate([
      { $unwind: '$emails' },
      { $group: { _id: null, totalEmails: { $sum: 1 } } }
    ]);
    
    const totalEmails = emailStats[0]?.totalEmails || 0;
    
    const queueStats = {
      pending: await Queue.countDocuments({ status: 'pending' }),
      processing: await Queue.countDocuments({ status: 'processing' }),
      completed: await Queue.countDocuments({ status: 'completed' }),
      failed: await Queue.countDocuments({ status: 'failed' }),
      cancelled: await Queue.countDocuments({ status: 'cancelled' })
    };

    // Get log stats for last 24 hours
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
      totalEmails,
      queueStats,
      logStats: logStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      saveRate: totalChannels > 0 ? ((channelsWithEmails + channelsWithHighSubs) / totalChannels * 100).toFixed(2) + '%' : '0%'
    });
  } catch (error) {
    await apiLogger.error('Error fetching stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/task/:taskId', async (req, res) => {
  try {
    const task = await Queue.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get logs for this task
    const logs = await Log.find({ taskId: req.params.taskId })
      .sort({ timestamp: -1 })
      .limit(50);
    
    res.json({ task, logs });
  } catch (error) {
    await apiLogger.error('Error fetching task', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

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

app.post('/api/process-queue', async (req, res) => {
  try {
    processQueue().catch(console.error);
    res.json({ message: 'Queue processing triggered' });
  } catch (error) {
    await apiLogger.error('Error triggering queue', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger queue processing' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    apiKeys: apiKeys.length,
    queueProcessing: isProcessing,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Daily scrape function
async function runDailyScrape() {
  await systemLogger.info('Starting daily scrape');
  const keywords = ['technology', 'business', 'entertainment', 'gaming', 'education', 'music', 'sports', 'news', 'health', 'finance'];
  
  const task = new Queue({
    task: 'scrape_channels',
    data: { 
      keywords, 
      count: 5000 
    },
    priority: 2
  });
  
  await task.save();
  await systemLogger.info(`Daily scrape task queued`, { taskId: task._id });
  
  processQueue().catch(console.error);
}

// Worker startup
async function startWorker() {
  await systemLogger.info('👷 Worker started');
  
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
const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log(`📊 API endpoints:`);
  console.log(`   POST /api/scrape - Start a new scrape task`);
  console.log(`   GET /api/channels - Get channels with filters`);
  console.log(`   GET /api/queue - Get queue status`);
  console.log(`   GET /api/stats - Get detailed statistics`);
  console.log(`   GET /api/logs - Get logs with filters`);
  console.log(`   GET /api/logs/recent - Get recent logs`);
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