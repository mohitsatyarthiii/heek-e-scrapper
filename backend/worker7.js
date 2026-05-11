import express from "express";
import mongoose from "mongoose";
import { google } from "googleapis";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import axios from "axios";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";
import { Ollama } from "ollama";

dotenv.config();

// Debug mode
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

// Parse PROXY_LIST
let PROXY_LIST = [];
if (process.env.PROXY_LIST) {
  try {
    const parsed = JSON.parse(process.env.PROXY_LIST);
    PROXY_LIST = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    PROXY_LIST = process.env.PROXY_LIST.split(",").map((proxy) => proxy.trim()).filter(Boolean);
  }
}

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || null;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const DAILY_CHANNEL_TARGET = parseInt(process.env.DAILY_CHANNEL_TARGET || "10000", 10);
const MAX_REQUEST_CONCURRENCY = parseInt(process.env.MAX_REQUEST_CONCURRENCY || "6", 10);

// Log proxy configuration
if (PROXY_LIST.length > 0) {
  console.log(`✅ Proxy rotation ENABLED - ${PROXY_LIST.length} proxies loaded`);
} else {
  console.log(`⚠️ No proxies configured - requests will use direct connection`);
}

// ==================== ALLOWED WESTERN COUNTRIES ====================
const ALLOWED_REGION_CODES = ['US', 'GB', 'AU', 'ES', 'DE', 'FR'];
const ALLOWED_COUNTRY_NAMES = [
  'United States', 'United Kingdom', 'Australia', 'Spain', 'Germany', 'France',
  'USA', 'UK', 'us', 'gb', 'au', 'es', 'de', 'fr'
];

// ==================== BLOCKED COUNTRIES ====================
const BLOCKED_COUNTRIES = [
  'India', 'Indian', 'india', 'INDIA',
  'Pakistan', 'pakistan',
  'Bangladesh', 'bangladesh',
  'Sri Lanka', 'sri lanka',
  'Nepal', 'nepal',
  'Bhutan', 'bhutan',
  'Maldives', 'maldives',
  'China', 'chinese', 'china', 'CHINA',
  'Japan', 'japanese', 'japan', 'JAPAN',
  'South Korea', 'Korea', 'korean', 'korea', 'south korea',
  'Thailand', 'thailand',
  'Vietnam', 'vietnam',
  'Philippines', 'philippines',
  'Indonesia', 'indonesian', 'indonesia',
  'Malaysia', 'malaysian', 'malaysia',
  'Singapore', 'singaporean', 'singapore',
  'Mongolia', 'mongolian', 'mongolia',
  'Cambodia', 'cambodia',
  'Laos', 'laos',
  'Myanmar', 'myanmar',
  'Hong Kong', 'hong kong',
  'Taiwan', 'taiwanese', 'taiwan',
  'Iran', 'iran', 'Iraq', 'iraq',
  'Syria', 'syria', 'Afghanistan', 'afghanistan',
  'Uzbekistan', 'uzbekistan', 'Kazakhstan', 'kazakhstan'
];

// ==================== HIGH TICKET KEYWORDS ====================
const HIGH_TICKET_KEYWORDS = [
  'business', 'marketing', 'agency', 'consulting', 'coaching',
  'real estate', 'investing', 'finance', 'insurance', 'lawyer',
  'attorney', 'doctor', 'dentist', 'surgeon', 'software',
  'saas', 'startup', 'entrepreneur', 'founder', 'ceo',
  'executive', 'luxury', 'premium', 'enterprise', 'b2b'
];

// ==================== HELPER FUNCTIONS ====================
function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function pickProxy() {
  if (!PROXY_LIST.length) return null;
  return PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithProxy(options) {
  const proxy = pickProxy();
  const headers = {
    "User-Agent": getRandomUserAgent(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...options.headers,
  };
  
  const axiosConfig = {
    timeout: options.timeout || 12000,
    responseType: options.responseType || "json",
    validateStatus: (status) => status >= 200 && status < 400,
    ...options,
    headers,
  };

  if (proxy) {
    const [host, port, username, password] = proxy.split(":");
    axiosConfig.proxy = {
      host,
      port: parseInt(port, 10) || 80,
      protocol: "http",
      auth: username ? { username, password: password || "" } : undefined,
    };
  }

  try {
    return await axios(axiosConfig);
  } catch (error) {
    // Retry without proxy if proxy fails
    if (proxy) {
      console.log(`⚠️ Proxy failed, retrying without proxy`);
      const directConfig = { ...axiosConfig };
      delete directConfig.proxy;
      return axios(directConfig);
    }
    throw error;
  }
}

// ==================== OLLAMA AI SETUP ====================
let ollama = null;
let ollamaAvailable = false;

async function initOllama() {
  try {
    console.log(`🔗 Attempting to connect to Ollama at ${OLLAMA_URL}...`);
    ollama = new Ollama({ host: OLLAMA_URL });
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const models = await Promise.race([
      ollama.list(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      )
    ]);
    clearTimeout(timeout);
    
    console.log(`✅ Ollama connected! Available models: ${models.models.map(m => m.name).join(', ')}`);
    
    const modelExists = models.models.some(m => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL));
    if (!modelExists) {
      console.log(`⚠️ Model '${OLLAMA_MODEL}' not found. Pulling...`);
      try {
        await ollama.pull({ model: OLLAMA_MODEL, stream: false });
        console.log(`✅ Model ${OLLAMA_MODEL} pulled successfully!`);
      } catch (pullError) {
        console.log(`❌ Auto-pull failed: ${pullError.message}`);
        throw new Error(`Model download failed: ${pullError.message}`);
      }
    }
    
    ollamaAvailable = true;
    console.log(`🚀 Ollama AI is ACTIVE using model: ${OLLAMA_MODEL}`);
  } catch (error) {
    console.log(`\n❌ OLLAMA CONNECTION FAILED: ${error.message}`);
    console.log(`💡 Start Ollama: ollama serve`);
    ollamaAvailable = false;
  }
}

async function aiAssessChannel({ title, subs, avgViews, description }, taskId = null, channelId = null) {
  if (!ollamaAvailable || !ollama) {
    const text = `${title} ${description || ""}`.toLowerCase();
    const businessSignal = HIGH_TICKET_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
    return businessSignal ? "GOOD" : "BAD";
  }

  const prompt = `Evaluate if this YouTube channel is GOOD for brand deals.
Channel: "${title}"
Subscribers: ${subs}
Avg views: ${avgViews}
Description: ${description?.substring(0, 200) || "No description"}

Is this channel suitable for paid collaborations? Answer only GOOD or BAD.`;

  try {
    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: "You evaluate YouTube channels. Reply ONLY with GOOD or BAD." },
        { role: "user", content: prompt }
      ],
      options: { temperature: 0.1, num_predict: 5 },
      stream: false
    });

    const decision = String(response.message?.content || "").trim().split(/\s+/)[0].toUpperCase();
    return decision === "GOOD" ? "GOOD" : "BAD";
  } catch (error) {
    console.log(`⚠️ Ollama error: ${error.message}`);
    ollamaAvailable = false;
    const text = `${title} ${description || ""}`.toLowerCase();
    const businessSignal = HIGH_TICKET_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
    return businessSignal ? "GOOD" : "BAD";
  }
}

// ==================== DAILY QUOTA TRACKER ====================
class DailyQuotaTracker {
  constructor() {
    this.dailyTarget = DAILY_CHANNEL_TARGET;
    this.resetTime = this.getNextResetTime();
    this.channelsSaved = 0;
    this.apiCalls = 0;
    this.startResetTimer();
  }

  getNextResetTime() {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next;
  }

  sync() {
    if (Date.now() >= this.resetTime.getTime()) {
      this.channelsSaved = 0;
      this.apiCalls = 0;
      this.resetTime = this.getNextResetTime();
    }
  }

  recordApiCall(count = 1) {
    this.sync();
    this.apiCalls += count;
  }

  recordChannelSaved(count = 1) {
    this.sync();
    this.channelsSaved += count;
  }

  canSave(count = 1) {
    this.sync();
    return this.channelsSaved + count <= this.dailyTarget;
  }

  getStatus() {
    this.sync();
    return {
      dailyTarget: this.dailyTarget,
      channelsSaved: this.channelsSaved,
      apiCalls: this.apiCalls,
      resetAt: this.resetTime.toISOString(),
    };
  }

  startResetTimer() {
    setInterval(() => this.sync(), 60000);
  }
}

const dailyQuotaTracker = new DailyQuotaTracker();

// ==================== MONGODB CONNECTION ====================
const mongoURI = "";

mongoose
  .connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ==================== SCHEMAS ====================
const scraperInstanceSchema = new mongoose.Schema({
  instanceId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ["idle", "busy", "stopped", "error"], default: "idle" },
  currentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "Queue" },
  preferredKeyIndices: [{ type: Number }],
  totalKeysAssigned: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  channelsScraped: { type: Number, default: 0 },
  emailsFound: { type: Number, default: 0 },
  startedAt: { type: Date },
  lastActive: { type: Date, default: Date.now },
});

const ScraperInstance = mongoose.model("ScraperInstance", scraperInstanceSchema);

const queueSchema = new mongoose.Schema({
  task: { type: String, required: true },
  data: {
    keywords: [{ type: String }],
    count: { type: Number, default: 10000 },
    countryCode: { type: String, default: null },
    minSubscribers: { type: Number, default: 1000 },
    minEngagement: { type: Number, default: 0.05 },
    includeRelated: { type: Boolean, default: true },
    relatedDepth: { type: Number, default: 2 },
    enrichKeywords: { type: Boolean, default: true },
    saveOnlyWithEmails: { type: Boolean, default: true },
  },
  priority: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed", "cancelled", "assigned"],
    default: "pending",
    index: true,
  },
  assignedTo: { type: String },
  createdAt: { type: Date, default: Date.now },
  assignedAt: { type: Date },
  startedAt: { type: Date },
  processedAt: { type: Date },
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  stats: {
    channelsScraped: { type: Number, default: 0 },
    channelsSaved: { type: Number, default: 0 },
    channelsSkipped: { type: Number, default: 0 },
    emailsFound: { type: Number, default: 0 },
    phonesFound: { type: Number, default: 0 },
    relatedChannelsFound: { type: Number, default: 0 },
    avgQualityScore: { type: Number, default: 0 },
  },
});

queueSchema.index({ status: 1, priority: -1, createdAt: 1 });
const Queue = mongoose.model("Queue", queueSchema);

const logSchema = new mongoose.Schema({
  level: { type: String, enum: ["info", "success", "warning", "error", "debug"], required: true },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Queue" },
  scraperId: { type: String },
  channelId: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "system" },
});

const Log = mongoose.model("Log", logSchema);

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
  scrapedAt: { type: Date, default: Date.now },
  emails: [{ type: String }],
  phoneNumbers: [{ type: String }],
  socialLinks: [{ platform: String, url: String }],
  websiteUrl: { type: String },
  contactInfo: {
    hasEmail: { type: Boolean, default: false },
    hasPhone: { type: Boolean, default: false },
    hasSocial: { type: Boolean, default: false },
    hasWebsite: { type: Boolean, default: false },
  },
  engagement: {
    avgViewsPerVideo: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
  },
  qualityScore: { type: Number, default: 0 },
  leadScore: { type: Number, default: 0, index: true },
  leadCategory: { type: String, default: "NONE", index: true },
  niche: { type: String },
  isHighTicketNiche: { type: Boolean, default: false },
  aiDecision: { type: String, default: "UNKNOWN" },
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  savedReason: { type: String, default: "emails" },
  sourceType: { type: String, default: "search" },
  discoveryDepth: { type: Number, default: 0 },
  scrapedBy: { type: String },
});

const Channel = mongoose.model("Channel", channelSchema);

const emailRecordSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, index: true },
  channels: [{ type: String, ref: "Channel" }],
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

const EmailRecord = mongoose.model("EmailRecord", emailRecordSchema);

// ==================== LOGGER CLASS ====================
class Logger {
  constructor(source = "system") {
    this.source = source;
  }

  async log(level, message, details = {}, taskId = null, channelId = null, scraperId = null) {
    try {
      const logEntry = {
        level,
        message,
        details,
        taskId,
        channelId,
        scraperId,
        source: this.source,
        timestamp: new Date(),
      };

      await Log.create(logEntry);
      
      if (global.io) {
        global.io.emit("log", logEntry);
      }

      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${this.source}] ${message}`);
      
      return logEntry;
    } catch (error) {
      console.error("Failed to save log:", error.message);
    }
  }

  info(message, details = {}, taskId = null, channelId = null, scraperId = null) {
    return this.log("info", message, details, taskId, channelId, scraperId);
  }

  success(message, details = {}, taskId = null, channelId = null, scraperId = null) {
    return this.log("success", message, details, taskId, channelId, scraperId);
  }

  warning(message, details = {}, taskId = null, channelId = null, scraperId = null) {
    return this.log("warning", message, details, taskId, channelId, scraperId);
  }

  error(message, details = {}, taskId = null, channelId = null, scraperId = null) {
    return this.log("error", message, details, taskId, channelId, scraperId);
  }

  debug(message, details = {}, taskId = null, channelId = null, scraperId = null) {
    if (DEBUG) {
      return this.log("debug", message, details, taskId, channelId, scraperId);
    }
  }
}

// ==================== GLOBAL KEY POOL ====================
class GlobalKeyPool {
  constructor() {
    this.allKeys = [];
    this.keyStatus = new Map();
    this.keyUsage = new Map();
    this.systemLogger = new Logger("key-pool");
  }

  initialize(apiKeys) {
    this.allKeys = apiKeys;
    apiKeys.forEach((key, index) => {
      this.keyStatus.set(index, {
        inUse: false,
        quotaExceeded: false,
        lastUsed: null,
        assignedTo: null,
        totalUsage: 0,
        failCount: 0,
      });
      this.keyUsage.set(index, 0);
    });
    this.systemLogger.success(`✅ Global Key Pool initialized with ${apiKeys.length} keys`);
    setInterval(() => this.checkAndResetQuota(), 60000);
  }

  getAvailableKey(scraperId, preferredIndices = []) {
    // Try preferred keys first
    for (const idx of preferredIndices) {
      const status = this.keyStatus.get(idx);
      if (status && !status.inUse && !status.quotaExceeded) {
        status.inUse = true;
        status.lastUsed = new Date();
        status.assignedTo = scraperId;
        return { key: this.allKeys[idx], index: idx };
      }
    }

    // Try any available key
    const availableKeys = [];
    for (let i = 0; i < this.allKeys.length; i++) {
      if (preferredIndices.includes(i)) continue;
      const status = this.keyStatus.get(i);
      if (status && !status.inUse && !status.quotaExceeded) {
        availableKeys.push({ index: i, failCount: status.failCount, lastUsed: status.lastUsed });
      }
    }

    availableKeys.sort((a, b) => {
      if (a.failCount !== b.failCount) return a.failCount - b.failCount;
      if (!a.lastUsed) return -1;
      if (!b.lastUsed) return 1;
      return a.lastUsed - b.lastUsed;
    });

    if (availableKeys.length > 0) {
      const bestKey = availableKeys[0];
      const status = this.keyStatus.get(bestKey.index);
      status.inUse = true;
      status.lastUsed = new Date();
      status.assignedTo = scraperId;
      return { key: this.allKeys[bestKey.index], index: bestKey.index };
    }

    return null;
  }

  releaseKey(index, scraperId, quotaExceeded = false, failed = false) {
    const status = this.keyStatus.get(index);
    if (status && status.assignedTo === scraperId) {
      status.inUse = false;
      status.assignedTo = null;
      if (quotaExceeded) {
        status.quotaExceeded = true;
        status.failCount = (status.failCount || 0) + 1;
        setTimeout(() => { status.quotaExceeded = false; }, 60000);
      }
      if (failed) {
        status.failCount = (status.failCount || 0) + 1;
      }
      const usage = this.keyUsage.get(index) || 0;
      this.keyUsage.set(index, usage + 1);
      status.totalUsage = usage + 1;
    }
  }

  checkAndResetQuota() {
    const now = Date.now();
    for (let i = 0; i < this.allKeys.length; i++) {
      const status = this.keyStatus.get(i);
      if (status.quotaExceeded && status.lastUsed && now - status.lastUsed.getTime() > 60000) {
        status.quotaExceeded = false;
      }
    }
  }

  getStats() {
    const stats = { total: this.allKeys.length, available: 0, inUse: 0, quotaExceeded: 0, usageDistribution: [] };
    for (let i = 0; i < this.allKeys.length; i++) {
      const status = this.keyStatus.get(i);
      if (!status.inUse && !status.quotaExceeded) stats.available++;
      if (status.inUse) stats.inUse++;
      if (status.quotaExceeded) stats.quotaExceeded++;
      stats.usageDistribution.push({
        keyIndex: i + 1,
        usage: this.keyUsage.get(i) || 0,
        failCount: status.failCount || 0,
        status: status.inUse ? "in-use" : status.quotaExceeded ? "quota-exceeded" : "available",
      });
    }
    return stats;
  }
}

// ==================== SCRAPER WORKER ====================
class ScraperWorker {
  constructor(instanceId, preferredKeyIndices, manager) {
    this.instanceId = instanceId;
    this.preferredKeyIndices = preferredKeyIndices;
    this.manager = manager;
    this.currentTask = null;
    this.status = "idle";
    this.lastActive = new Date();
    this.tasksCompleted = 0;
    this.channelsScraped = 0;
    this.emailsFound = 0;
    this.logger = new Logger(`scraper-${instanceId.substring(0, 8)}`);
    this.currentKeyIndex = null;
    this.currentKey = null;
    this.consecutiveFails = 0;
  }

  isAvailable() {
    return this.status === "idle";
  }

  async getKey() {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const keyInfo = this.manager.getKeyForScraper(this.instanceId, this.preferredKeyIndices);
      if (keyInfo) {
        this.currentKeyIndex = keyInfo.index;
        this.currentKey = keyInfo.key;
        return keyInfo.key;
      }
      if (attempt < maxAttempts) {
        await this.logger.warning(`⏳ No keys available, waiting (${attempt}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
    throw new Error("No API keys available after multiple attempts");
  }

  releaseKey(quotaExceeded = false, failed = false) {
    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(this.currentKeyIndex, this.instanceId, quotaExceeded, failed);
      this.currentKeyIndex = null;
      this.currentKey = null;
    }
  }

  async getYouTubeClient() {
    this.releaseKey(false, this.consecutiveFails > 3);
    const key = await this.getKey();
    return google.youtube({ version: "v3", auth: key });
  }

  async assignTask(task) {
    this.currentTask = task;
    this.status = "busy";
    this.lastActive = new Date();
    this.consecutiveFails = 0;

    console.log(`🚀 Scraper ${this.instanceId} assigned task ${task._id}`);

    await ScraperInstance.updateOne(
      { instanceId: this.instanceId },
      { status: "busy", currentTaskId: task._id, lastActive: new Date() }
    );

    this.processTask(task).catch((error) => {
      this.logger.error("Error processing task", { error: error.message });
    });
  }

  async processTask(task) {
    try {
      console.log(`🔥 Scraper ${this.instanceId} processing task ${task._id}`);

      // Validate keywords
      if (!task.data.keywords || task.data.keywords.length === 0) {
        throw new Error("❌ No keywords provided in task!");
      }

      await this.logger.info(
        `🚀 Starting task with keywords: ${task.data.keywords.join(', ')}`,
        { keywordCount: task.data.keywords.length },
        task._id
      );

      task.status = "processing";
      task.startedAt = new Date();
      await task.save();

      const stats = await this.scrapeChannels(task);

      this.releaseKey(false, false);
      await this.manager.handleTaskCompletion(task._id, this.instanceId, stats);

      this.tasksCompleted++;
      this.channelsScraped += stats.channelsSaved || 0;
      this.emailsFound += stats.emailsFound || 0;
      this.status = "idle";
      this.currentTask = null;

      await ScraperInstance.updateOne(
        { instanceId: this.instanceId },
        {
          status: "idle",
          currentTaskId: null,
          lastActive: new Date(),
          $inc: {
            tasksCompleted: 1,
            channelsScraped: stats.channelsSaved || 0,
            emailsFound: stats.emailsFound || 0,
          },
        }
      );
    } catch (error) {
      this.consecutiveFails++;
      this.releaseKey(false, true);
      await this.manager.handleTaskFailure(task._id, this.instanceId, error);
      this.status = "idle";
      this.currentTask = null;

      await ScraperInstance.updateOne(
        { instanceId: this.instanceId },
        { status: "idle", currentTaskId: null, lastActive: new Date() }
      );
    }
  }

  async enrichKeywords(baseKeywords) {
    const enriched = new Set();
    
    for (const keyword of baseKeywords) {
      enriched.add(keyword);
      
      try {
        const autocompleteUrls = [
          `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(keyword)}`,
          `http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`,
        ];

        for (const url of autocompleteUrls) {
          try {
            const response = await requestWithProxy({
              url,
              method: "get",
              responseType: "json",
              timeout: 7000,
            });
            if (response.data && Array.isArray(response.data[1])) {
              response.data[1].forEach((suggestion) => enriched.add(suggestion));
            }
          } catch (e) {
            // Silently continue
          }
        }

        enriched.add(keyword + " tutorial");
        enriched.add(keyword + " review");
        enriched.add(keyword + " how to");
        enriched.add("best " + keyword);
      } catch (error) {
        await this.logger.warning("Error enriching keyword", { keyword, error: error.message });
      }
    }

    return Array.from(enriched).slice(0, 50);
  }

  isCountryBlocked(countryName) {
    if (!countryName) return false;
    return BLOCKED_COUNTRIES.some(blocked => 
      countryName.toLowerCase().includes(blocked.toLowerCase()) || 
      blocked.toLowerCase().includes(countryName.toLowerCase())
    );
  }

  isAllowedCountry(countryName) {
    if (!countryName) return false;
    return ALLOWED_COUNTRY_NAMES.some(allowed => 
      countryName.toLowerCase().includes(allowed.toLowerCase()) || 
      allowed.toLowerCase().includes(countryName.toLowerCase())
    );
  }

  extractEmails(text) {
    if (!text || typeof text !== "string") return [];

    let normalizedText = text
      .replace(/\[at\]|\(at\)|\{at\}|<at>|\bat\b/gi, "@")
      .replace(/\[dot\]|\(dot\)|\{dot\}|<dot>|\bdot\b/gi, ".")
      .replace(/\s+@\s+/g, "@")
      .replace(/\s+\.\s+/g, ".")
      .replace(/&#64;/g, "@")
      .replace(/&#46;/g, ".")
      .replace(/&commat;/g, "@")
      .replace(/&period;/g, ".")
      .replace(/ at /gi, "@")
      .replace(/ dot /gi, ".");

    const emailPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/g,
      /\b[A-Za-z0-9._%+-]+@gmail\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@yahoo\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@outlook\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@hotmail\.com\b/gi,
      /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/gi,
    ];

    let allEmails = new Set();

    for (const pattern of emailPatterns) {
      const matches = normalizedText.match(pattern) || [];
      matches.forEach((email) => {
        let cleaned = email
          .replace(/\s+/g, "")
          .replace(/^mailto:/i, "")
          .replace(/["()]/g, "")
          .toLowerCase()
          .trim();

        if (this.isValidEmail(cleaned)) {
          allEmails.add(cleaned);
        }
      });
    }

    return Array.from(allEmails);
  }

  isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    
    const invalidDomains = [
      'example.com', 'test.com', 'domain.com', 'yourdomain.com',
      'email.com', 'mail.com', 'address.com', 'website.com'
    ];
    
    const domain = email.split('@')[1];
    if (invalidDomains.includes(domain)) return false;
    if (!domain.includes('.')) return false;
    if (email.includes('..')) return false;
    
    return true;
  }

  extractPhoneNumbers(text) {
    if (!text || typeof text !== "string") return [];
    const patterns = [
      /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    ];
    let allPhones = [];
    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      allPhones = [...allPhones, ...matches];
    }
    return [...new Set(allPhones)];
  }

  extractSocialLinks(text) {
    if (!text) return [];
    const patterns = [
      { platform: "twitter", regex: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/gi },
      { platform: "instagram", regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi },
      { platform: "facebook", regex: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9.]+/gi },
      { platform: "linkedin", regex: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/gi },
      { platform: "tiktok", regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+/gi },
    ];
    const links = [];
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern.regex);
      for (const match of matches) {
        links.push({ platform: pattern.platform, url: match[0] });
      }
    }
    return links;
  }

  extractWebsite(text) {
    if (!text) return null;
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\/[^\s]*)?/g;
    const matches = text.match(urlRegex);
    if (!matches) return null;

    const blacklist = ["youtube.com", "instagram.com", "twitter.com", "facebook.com", "tiktok.com"];
    for (const match of matches) {
      const url = match.startsWith("http") ? match : "https://" + match;
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        if (!blacklist.includes(domain) && domain.includes(".")) {
          return url;
        }
      } catch {}
    }
    return null;
  }

  async scrapeWebsiteForContacts(websiteUrl) {
    if (!websiteUrl) return { emails: [], phones: [] };
    try {
      const response = await requestWithProxy({
        url: websiteUrl,
        method: "get",
        responseType: "text",
        timeout: 10000,
      });
      const text = response.data;
      return {
        emails: this.extractEmails(text),
        phones: this.extractPhoneNumbers(text),
      };
    } catch (error) {
      return { emails: [], phones: [] };
    }
  }

  async hunterLookup(domain) {
    if (!HUNTER_API_KEY || !domain) return [];
    try {
      const response = await requestWithProxy({
        url: `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=50`,
        method: "get",
      });
      const emails = response.data?.data?.emails || [];
      return emails
        .map((item) => item.value?.toLowerCase().trim())
        .filter((email) => email && this.isValidEmail(email));
    } catch (error) {
      return [];
    }
  }

  async saveEmailRecords(channelId, emails) {
    if (!emails || emails.length === 0) return;
    const operations = emails.map((email) => ({
      updateOne: {
        filter: { email },
        update: {
          $setOnInsert: { firstSeenAt: new Date() },
          $set: { lastSeenAt: new Date() },
          $addToSet: { channels: channelId },
        },
        upsert: true,
      },
    }));
    try {
      await EmailRecord.bulkWrite(operations, { ordered: false });
    } catch (error) {
      // Ignore bulk write errors
    }
  }

  async processChannel(channelData, sourceInfo = {}, taskId = null, minSubscribers = 1000) {
    try {
      const channelId = channelData.id;
      const snippet = channelData.snippet;
      
      if (!channelId || !snippet) {
        return { saved: false, skipped: true, reason: "invalid_data" };
      }

      const channelCountry = snippet.country || 'UNKNOWN';
      const channelTitle = snippet.title || 'Unknown';

      // Country filtering
      if (this.isCountryBlocked(channelCountry)) {
        return { saved: false, skipped: true, reason: "blocked_country" };
      }
      
      if (!this.isAllowedCountry(channelCountry)) {
        return { saved: false, skipped: true, reason: "not_western_country" };
      }

      // Check if channel already exists
      const existing = await Channel.findOne({ channelId }).lean();
      if (existing) {
        // Update emails if new ones found
        const description = snippet.description || "";
        const newEmails = this.extractEmails(description);
        if (newEmails.length > 0) {
          const allEmails = [...new Set([...(existing.emails || []), ...newEmails])];
          await Channel.updateOne(
            { channelId },
            { 
              $set: { 
                emails: allEmails, 
                hasEmails: true, 
                lastUpdated: new Date(),
                scrapedBy: this.instanceId 
              } 
            }
          );
          await this.saveEmailRecords(channelId, newEmails);
          
          console.log(`✅ Updated: "${channelTitle}" - ${newEmails.length} new emails`);
          return { saved: true, updated: true, emails: newEmails.length };
        }
        return { saved: false, skipped: true, reason: "exists" };
      }

      // Process new channel
      const statistics = channelData.statistics || {};
      const subscriberCount = parseInt(statistics.subscriberCount || 0);
      const videoCount = parseInt(statistics.videoCount || 0);
      const viewCount = parseInt(statistics.viewCount || 0);
      const avgViews = videoCount > 0 ? Math.round(viewCount / videoCount) : 0;

      const description = snippet.description || "";
      
      // Extract contact info
      let emails = this.extractEmails(description);
      let phones = this.extractPhoneNumbers(description);
      let socialLinks = this.extractSocialLinks(description);
      let websiteUrl = this.extractWebsite(description);

      // Scrape website for contacts
      if (websiteUrl) {
        try {
          const websiteData = await this.scrapeWebsiteForContacts(websiteUrl);
          emails = [...new Set([...emails, ...websiteData.emails])];
          phones = [...new Set([...phones, ...websiteData.phones])];
        } catch (e) {}
      }

      // Hunter.io lookup
      if (emails.length === 0 && websiteUrl) {
        try {
          const websiteDomain = new URL(websiteUrl).hostname.replace(/^www\./, "");
          const hunterEmails = await this.hunterLookup(websiteDomain);
          emails = [...new Set([...emails, ...hunterEmails])];
        } catch (e) {}
      }

      // REQUIRE EMAILS
      if (emails.length === 0) {
        return { saved: false, skipped: true, reason: "no_emails" };
      }

      // Calculate scores
      const engagementRate = videoCount > 0 ? viewCount / videoCount / (subscriberCount || 1) : 0;
      const lowercaseText = `${snippet.title} ${description}`.toLowerCase();
      const isHighTicketNiche = HIGH_TICKET_KEYWORDS.some((k) => lowercaseText.includes(k.toLowerCase()));

      let qualityScore = 10;
      if (subscriberCount > 100000) qualityScore += 40;
      else if (subscriberCount > 50000) qualityScore += 30;
      else if (subscriberCount > 10000) qualityScore += 20;
      else if (subscriberCount > 1000) qualityScore += 10;

      if (avgViews > 10000) qualityScore += 30;
      else if (avgViews > 5000) qualityScore += 20;
      else if (avgViews > 1000) qualityScore += 10;

      if (websiteUrl) qualityScore += 15;
      if (emails.length > 0) qualityScore += 15;
      if (phones.length > 0) qualityScore += 10;
      if (isHighTicketNiche) qualityScore += 20;

      const leadCategory = qualityScore >= 100 ? "PREMIUM" : 
                          qualityScore >= 70 ? "HIGH VALUE" : 
                          qualityScore >= 40 ? "GOOD LEAD" : "PROSPECT";

      // AI Assessment
      const aiDecision = await aiAssessChannel({
        title: snippet.title,
        subs: subscriberCount,
        avgViews,
        description,
      }, taskId, channelId);

      // SAVE CHANNEL TO DATABASE
      const channel = new Channel({
        channelId,
        title: snippet.title,
        description: description.substring(0, 500),
        subscriberCount,
        videoCount,
        viewCount,
        publishedAt: new Date(snippet.publishedAt),
        country: snippet.country,
        customUrl: snippet.customUrl,
        thumbnailUrl: snippet.thumbnails?.default?.url,
        keywords: sourceInfo.keywords || [],
        emails,
        phoneNumbers: phones,
        socialLinks,
        websiteUrl,
        contactInfo: {
          hasEmail: emails.length > 0,
          hasPhone: phones.length > 0,
          hasSocial: socialLinks.length > 0,
          hasWebsite: !!websiteUrl,
        },
        engagement: {
          avgViewsPerVideo: videoCount > 0 ? viewCount / videoCount : 0,
          engagementRate,
        },
        qualityScore,
        leadCategory,
        isHighTicketNiche,
        aiDecision,
        lastUpdated: new Date(),
        hasEmails: true,
        savedReason: "emails",
        sourceType: sourceInfo.sourceType || "search",
        discoveryDepth: sourceInfo.discoveryDepth || 0,
        scrapedBy: this.instanceId,
      });

      await channel.save();
      await this.saveEmailRecords(channelId, emails);
      dailyQuotaTracker.recordChannelSaved(1);

      console.log(`✅ SAVED: "${snippet.title}" - ${emails.length} emails, Score: ${qualityScore}`);
      
      return {
        saved: true,
        channel,
        emails: emails.length,
        phones: phones.length,
        qualityScore,
      };
    } catch (error) {
      console.error(`❌ Error processing channel ${channelData?.id}: ${error.message}`);
      return { saved: false, skipped: true, reason: "error", error: error.message };
    }
  }

  async scrapeChannels(task) {
    const options = task.data;
    const keywords = options.keywords;
    const maxResults = options.count || 500;
    const taskId = task._id;
    const minSubscribers = options.minSubscribers || 1000;
    const includeRelated = options.includeRelated !== false;
    const relatedDepth = options.relatedDepth || 2;
    const shouldEnrich = options.enrichKeywords !== false;

    let totalChannels = 0;
    let savedChannels = 0;
    let skippedChannels = 0;
    let totalEmailsFound = 0;
    let totalPhonesFound = 0;
    let relatedChannelsFound = 0;
    let totalQualityScore = 0;

    // Enrich keywords only from provided keywords
    let searchKeywords = [...keywords];
    if (shouldEnrich && searchKeywords.length > 0) {
      await this.logger.info("🔍 Enriching keywords...", { originalCount: keywords.length }, taskId);
      searchKeywords = await this.enrichKeywords(keywords);
      await this.logger.success("✅ Keywords enriched", {
        original: keywords.length,
        enriched: searchKeywords.length,
        sample: searchKeywords.slice(0, 5)
      }, taskId);
    }

    const processedChannels = new Set();
    const channelQueue = [];

    await this.logger.info("🎯 Starting scrape with keywords:", {
      keywords: searchKeywords.slice(0, 10),
      total: searchKeywords.length,
      target: maxResults,
      allowedCountries: ALLOWED_REGION_CODES.join(', ')
    }, taskId);

    // PHASE 1: Direct Channel Search
    await this.logger.info("📺 PHASE 1: Direct Channel Search", {}, taskId);

    for (const keyword of searchKeywords) {
      if (savedChannels >= maxResults) break;

      let pageToken = null;
      let pageCount = 0;

      while (savedChannels < maxResults && pageCount < 10) {
        try {
          const youtube = await this.getYouTubeClient();
          const currentRegionCode = ALLOWED_REGION_CODES[pageCount % ALLOWED_REGION_CODES.length];

          const searchParams = {
            part: "snippet",
            q: keyword,
            type: "channel",
            maxResults: 50,
            order: "relevance",
            pageToken: pageToken,
            regionCode: currentRegionCode,
          };

          dailyQuotaTracker.recordApiCall();
          const searchResponse = await youtube.search.list(searchParams);
          pageCount++;

          const items = searchResponse.data.items || [];
          console.log(`🔍 Search "${keyword}" page ${pageCount}: ${items.length} items`);

          if (items.length === 0) break;

          // Process channels in batches
          for (let i = 0; i < items.length; i += MAX_REQUEST_CONCURRENCY) {
            if (savedChannels >= maxResults) break;
            
            const batch = items.slice(i, i + MAX_REQUEST_CONCURRENCY);
            const batchPromises = batch.map(async (item) => {
              const channelId = item.snippet.channelId;
              
              if (processedChannels.has(channelId)) return null;
              processedChannels.add(channelId);
              totalChannels++;

              try {
                dailyQuotaTracker.recordApiCall();
                const channelResponse = await youtube.channels.list({
                  part: "snippet,statistics",
                  id: channelId,
                });

                const channelData = channelResponse.data.items?.[0];
                if (!channelData) return { skipped: true };

                const result = await this.processChannel(
                  channelData,
                  { keywords: [keyword], sourceType: "direct_channel_search", discoveryDepth: 0 },
                  taskId,
                  minSubscribers
                );

                return { channelId, result };
              } catch (error) {
                if (error.code === 403) {
                  this.releaseKey(true, false);
                }
                return { channelId, result: { saved: false, skipped: true, reason: "api_error" } };
              }
            });

            const batchResults = await Promise.all(batchPromises);

            for (const itemResult of batchResults) {
              if (!itemResult || !itemResult.result) continue;
              
              const { channelId, result } = itemResult;
              
              if (result.saved) {
                savedChannels++;
                totalEmailsFound += result.emails || 0;
                totalPhonesFound += result.phones || 0;
                totalQualityScore += result.qualityScore || 0;

                if (includeRelated) {
                  channelQueue.push({ channelId, depth: 0, sourceType: "search" });
                }
              } else if (result.skipped) {
                skippedChannels++;
              }
            }

            await delay(200); // Rate limiting between batches
          }

          pageToken = searchResponse.data.nextPageToken;
          if (!pageToken) break;

          await delay(500); // Rate limiting between pages
        } catch (error) {
          console.error(`❌ Search error for "${keyword}": ${error.message}`);
          if (error.code === 403) {
            this.releaseKey(true, false);
          } else {
            this.releaseKey(false, true);
          }
          await delay(2000);
          break;
        }
      }
    }

    // PHASE 2: Video Search for Channels (if needed)
    if (savedChannels < maxResults) {
      await this.logger.info("🎬 PHASE 2: Searching Videos for Channels", {
        current: savedChannels,
        target: maxResults
      }, taskId);

      for (const keyword of searchKeywords) {
        if (savedChannels >= maxResults) break;

        try {
          const youtube = await this.getYouTubeClient();
          let videoPageToken = null;
          let videoPageCount = 0;

          while (savedChannels < maxResults && videoPageCount < 3) {
            try {
              dailyQuotaTracker.recordApiCall();
              const videoResponse = await youtube.search.list({
                part: "snippet",
                q: keyword,
                type: "video",
                maxResults: 50,
                order: "relevance",
                pageToken: videoPageToken,
              });

              videoPageCount++;
              const videoItems = videoResponse.data.items || [];
              
              if (videoItems.length === 0) break;

              const channelIds = [...new Set(videoItems.map(v => v.snippet.channelId))];
              
              for (let i = 0; i < channelIds.length; i += MAX_REQUEST_CONCURRENCY) {
                if (savedChannels >= maxResults) break;
                
                const batch = channelIds.slice(i, i + MAX_REQUEST_CONCURRENCY);
                const batchPromises = batch.map(async (channelId) => {
                  if (processedChannels.has(channelId)) return null;
                  processedChannels.add(channelId);
                  totalChannels++;

                  try {
                    dailyQuotaTracker.recordApiCall();
                    const channelResponse = await youtube.channels.list({
                      part: "snippet,statistics",
                      id: channelId,
                    });

                    const channelData = channelResponse.data.items?.[0];
                    if (!channelData) return null;

                    const result = await this.processChannel(
                      channelData,
                      { keywords: [keyword], sourceType: "video_extraction", discoveryDepth: 0 },
                      taskId,
                      minSubscribers
                    );

                    if (result.saved) {
                      savedChannels++;
                      totalEmailsFound += result.emails || 0;
                      totalPhonesFound += result.phones || 0;
                      totalQualityScore += result.qualityScore || 0;
                    } else if (result.skipped) {
                      skippedChannels++;
                    }

                    return result;
                  } catch (err) {
                    return null;
                  }
                });

                await Promise.all(batchPromises);
                await delay(200);
              }

              videoPageToken = videoResponse.data.nextPageToken;
              if (!videoPageToken) break;
            } catch (error) {
              if (error.code === 403) {
                this.releaseKey(true, false);
              }
              await delay(2000);
              break;
            }
          }
        } catch (err) {
          console.error(`Phase 2 error for "${keyword}": ${err.message}`);
        }
      }
    }

    const stats = {
      channelsScraped: totalChannels,
      channelsSaved: savedChannels,
      channelsSkipped: skippedChannels,
      emailsFound: totalEmailsFound,
      phonesFound: totalPhonesFound,
      relatedChannelsFound,
      avgQualityScore: savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0,
    };

    await this.logger.success("🎉 Scrape completed!", stats, taskId);
    return stats;
  }

  async reset() {
    this.logger.warning("⚠️ Resetting scraper");
    this.currentTask = null;
    this.status = "idle";
    this.lastActive = new Date();
    this.consecutiveFails = 0;

    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(this.currentKeyIndex, this.instanceId, false, true);
      this.currentKeyIndex = null;
      this.currentKey = null;
    }

    await ScraperInstance.updateOne(
      { instanceId: this.instanceId },
      { status: "idle", currentTaskId: null, lastActive: new Date() }
    );
  }

  async stop() {
    this.logger.info("🛑 Stopping scraper");
    this.status = "stopped";

    if (this.currentTask) {
      await Queue.updateOne(
        { _id: this.currentTask._id },
        { status: "pending", assignedTo: null }
      );
      this.currentTask = null;
    }

    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(this.currentKeyIndex, this.instanceId, false, true);
    }
  }

  async start() {
    this.logger.info("▶️ Starting scraper");
    this.status = "idle";
  }

  getHealth() {
    return {
      instanceId: this.instanceId,
      status: this.status,
      currentTaskId: this.currentTask?._id,
      lastActive: this.lastActive,
      tasksCompleted: this.tasksCompleted,
      channelsScraped: this.channelsScraped,
      emailsFound: this.emailsFound,
    };
  }

  async completeTask(stats) {
    this.tasksCompleted++;
    this.channelsScraped += stats.channelsSaved || 0;
    this.emailsFound += stats.emailsFound || 0;
    this.lastActive = new Date();
    this.consecutiveFails = 0;
  }

  async failTask() {
    this.lastActive = new Date();
  }
}

// ==================== SCRAPER MANAGER ====================
class ScraperManager {
  constructor() {
    this.scrapers = new Map();
    this.keyPool = new GlobalKeyPool();
    this.apiKeys = [];
    this.keyGroups = [];
    this.initialized = false;
    this.maxConcurrentScrapers = 15;
    this.systemLogger = new Logger("manager");
  }

  async initialize() {
    // Load API keys from environment
    this.apiKeys = [];
    for (let i = 1; i <= 150; i++) {
      const key = process.env[`YOUTUBE_API_KEY_${i}`];
      if (key && key !== `YOUR_API_KEY_${i}`) {
        this.apiKeys.push(key);
      }
    }

    if (this.apiKeys.length === 0) {
      this.systemLogger.error("❌ No valid YouTube API keys found");
      process.exit(1);
    }

    this.keyPool.initialize(this.apiKeys);
    this.systemLogger.success(`✅ Loaded ${this.apiKeys.length} YouTube API keys`);

    this.maxConcurrentScrapers = Math.min(this.maxConcurrentScrapers, this.apiKeys.length);

    await this.createKeyGroups();
    await this.loadOrCreateScrapers();

    this.initialized = true;
    this.systemLogger.success(`🚀 Scraper Manager initialized with ${this.scrapers.size} scrapers`);

    this.startAssignmentLoop();
    this.startHealthCheckLoop();
  }

  async createKeyGroups() {
    const keysPerScraper = Math.min(5, Math.ceil(this.apiKeys.length / this.maxConcurrentScrapers));
    for (let i = 0; i < this.apiKeys.length; i += keysPerScraper) {
      const group = Array.from(
        { length: Math.min(keysPerScraper, this.apiKeys.length - i) },
        (_, index) => i + index
      );
      this.keyGroups.push(group);
    }
  }

  async loadOrCreateScrapers() {
    const existingScrapers = await ScraperInstance.find();

    if (existingScrapers.length > 0) {
      for (const scraper of existingScrapers) {
        const scraperObj = new ScraperWorker(scraper.instanceId, scraper.preferredKeyIndices || [], this);
        this.scrapers.set(scraper.instanceId, scraperObj);
        if (scraper.status === "busy") {
          scraper.status = "idle";
          scraper.currentTaskId = null;
          await scraper.save();
        }
      }
    } else {
      const numScrapers = Math.min(this.keyGroups.length, this.maxConcurrentScrapers);
      for (let i = 0; i < numScrapers; i++) {
        await this.createScraper(`Scraper-${i + 1}`, this.keyGroups[i]);
      }
    }
  }

  async createScraper(name, preferredKeyIndices) {
    const instanceId = uuidv4();
    const scraper = new ScraperInstance({
      instanceId,
      name,
      status: "idle",
      preferredKeyIndices,
      totalKeysAssigned: preferredKeyIndices.length,
      startedAt: new Date(),
      lastActive: new Date(),
    });
    await scraper.save();

    const scraperWorker = new ScraperWorker(instanceId, preferredKeyIndices, this);
    this.scrapers.set(instanceId, scraperWorker);
    return scraper;
  }

  getKeyForScraper(scraperId, preferredIndices) {
    return this.keyPool.getAvailableKey(scraperId, preferredIndices);
  }

  releaseKey(index, scraperId, quotaExceeded = false, failed = false) {
    this.keyPool.releaseKey(index, scraperId, quotaExceeded, failed);
  }

  getAvailableScraper() {
    for (const [instanceId, scraper] of this.scrapers) {
      if (scraper.isAvailable()) {
        return scraper;
      }
    }
    return null;
  }

  async assignTask(task) {
    const scraper = this.getAvailableScraper();
    if (!scraper) return false;

    task.status = "assigned";
    task.assignedTo = scraper.instanceId;
    task.assignedAt = new Date();
    await task.save();

    await scraper.assignTask(task);
    await this.systemLogger.info(`📌 Task ${task._id} assigned to scraper ${scraper.instanceId}`);
    return true;
  }

  startAssignmentLoop() {
    setInterval(async () => {
      try {
        if (!this.initialized) return;
        if (!dailyQuotaTracker.canSave(1)) return;

        const pendingTasks = await Queue.find({
          status: "pending",
          $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
        })
          .sort({ priority: -1, createdAt: 1 })
          .limit(20);

        for (const task of pendingTasks) {
          const assigned = await this.assignTask(task);
          if (!assigned) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error("[TASK ASSIGNMENT ERROR]", error);
      }
    }, 3000);
  }

  startHealthCheckLoop() {
    setInterval(async () => {
      try {
        for (const [instanceId, scraper] of this.scrapers) {
          const health = scraper.getHealth();
          if (health.status === "busy" && health.lastActive) {
            const inactiveTime = Date.now() - new Date(health.lastActive).getTime();
            if (inactiveTime > 10 * 60 * 1000) {
              await this.systemLogger.warning(`⚠️ Scraper ${instanceId} appears stuck, resetting`);
              await scraper.reset();
            }
          }
          await ScraperInstance.updateOne(
            { instanceId },
            { lastActive: new Date() }
          );
        }
      } catch (error) {
        console.error("[HEALTH CHECK ERROR]", error);
      }
    }, 30000);
  }

  async handleTaskCompletion(taskId, scraperId, stats) {
    const task = await Queue.findById(taskId);
    if (!task) return;

    task.status = "completed";
    task.processedAt = new Date();
    task.stats = stats;
    await task.save();

    const scraper = this.scrapers.get(scraperId);
    if (scraper) {
      await scraper.completeTask(stats);
    }

    await this.systemLogger.success(`✅ Task ${taskId} completed by scraper ${scraperId}`, stats);
  }

  async handleTaskFailure(taskId, scraperId, error) {
    const task = await Queue.findById(taskId);
    if (!task) return;

    task.status = "failed";
    task.error = error.message;
    task.retryCount = (task.retryCount || 0) + 1;

    if (task.retryCount < 3) {
      task.status = "pending";
      task.assignedTo = null;
    }

    await task.save();

    const scraper = this.scrapers.get(scraperId);
    if (scraper) {
      await scraper.failTask();
    }

    await this.systemLogger.error(`❌ Task ${taskId} failed on scraper ${scraperId}`, { error: error.message });
  }

  async getStatus() {
    const scrapers = [];
    for (const [instanceId, scraper] of this.scrapers) {
      scrapers.push(scraper.getHealth());
    }

    const keyStats = this.keyPool.getStats();

    return {
      totalScrapers: this.scrapers.size,
      activeScrapers: scrapers.filter((s) => s.status === "busy").length,
      idleScrapers: scrapers.filter((s) => s.status === "idle").length,
      scrapers,
      keyPool: keyStats,
      dailyQuota: dailyQuotaTracker.getStatus(),
      tasks: {
        pending: await Queue.countDocuments({ status: "pending" }),
        assigned: await Queue.countDocuments({ status: "assigned" }),
        processing: await Queue.countDocuments({ status: "processing" }),
        completed: await Queue.countDocuments({ status: "completed" }),
        failed: await Queue.countDocuments({ status: "failed" }),
      },
    };
  }

  async stopScraper(instanceId) {
    const scraper = this.scrapers.get(instanceId);
    if (!scraper) return false;
    await scraper.stop();
    await ScraperInstance.updateOne({ instanceId }, { status: "stopped" });
    return true;
  }

  async startScraper(instanceId) {
    const scraper = this.scrapers.get(instanceId);
    if (!scraper) return false;
    await scraper.start();
    await ScraperInstance.updateOne({ instanceId }, { status: "idle" });
    return true;
  }
}

// ==================== EXPRESS SETUP ====================
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://frolicking-beignet-8fedff.netlify.app"],
    credentials: true,
  },
});

global.io = io;

io.on("connection", (socket) => {
  console.log("✅ Client connected");
  Log.find()
    .sort({ timestamp: -1 })
    .limit(100)
    .then((logs) => {
      socket.emit("initial_logs", logs.reverse());
    });
});

const systemLogger = new Logger("system");
const apiLogger = new Logger("api");
const scraperManager = new ScraperManager();

app.use(express.json());
app.use(cors({
  origin: ["http://localhost:5173", "https://frolicking-beignet-8fedff.netlify.app"],
  credentials: true,
}));

// ==================== API ROUTES ====================

// Start scrape task - ONLY USES KEYWORDS FROM FRONTEND
app.post("/api/scrape", async (req, res) => {
  try {
    const {
      keywords,
      count = 1000,
      minSubscribers = 2000,
      includeRelated = true,
      relatedDepth = 1,
      enrichKeywords = true,
    } = req.body;

    // VALIDATE: Keywords are required
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        error: "Keywords are required. Please provide at least one keyword.",
        example: { keywords: ["fitness trainer", "marketing expert"] }
      });
    }

    // Clean and validate keywords
    const cleanedKeywords = keywords
      .filter(k => k && typeof k === 'string' && k.trim().length > 0)
      .map(k => k.trim())
      .slice(0, 20);

    if (cleanedKeywords.length === 0) {
      return res.status(400).json({
        error: "No valid keywords found after cleaning"
      });
    }

    const task = new Queue({
      task: "scrape_channels",
      data: {
        keywords: cleanedKeywords,
        count: Math.min(count, 50000),
        minSubscribers: parseInt(minSubscribers),
        includeRelated,
        relatedDepth: parseInt(relatedDepth),
        enrichKeywords,
        saveOnlyWithEmails: false,
      },
    });

    await task.save();

    await apiLogger.success(`✅ New task queued`, {
      taskId: task._id,
      keywordCount: cleanedKeywords.length,
      keywords: cleanedKeywords,
    });

    res.json({
      success: true,
      message: "Task queued successfully",
      taskId: task._id,
      keywords: cleanedKeywords,
      count: Math.min(count, 50000)
    });
  } catch (error) {
    await apiLogger.error("Error creating task", { error: error.message });
    res.status(500).json({ error: "Failed to create task" });
  }
});

// Get scraper status
app.get("/api/scrapers", async (req, res) => {
  try {
    const status = await scraperManager.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch scraper status" });
  }
});

// Get channels
app.get("/api/channels", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 2000000,
      minSubscribers,
      minQuality,
      country,
      search,
      sortBy = "qualityScore",
      sortOrder = "desc",
    } = req.query;

    const query = { hasEmails: true };

    if (minSubscribers) query.subscriberCount = { $gte: parseInt(minSubscribers) };
    if (minQuality) query.qualityScore = { $gte: parseInt(minQuality) };
    if (country) query.country = country;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { emails: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const channels = await Channel.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Channel.countDocuments(query);

    res.json({
      channels,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

// Get stats
app.get("/api/stats", async (req, res) => {
  try {
    const totalChannels = await Channel.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayChannels = await Channel.countDocuments({ scrapedAt: { $gte: today } });
    const channelsWithEmails = await Channel.countDocuments({ hasEmails: true });

    const emailStats = await Channel.aggregate([
      { $unwind: "$emails" },
      { $group: { _id: null, totalEmails: { $sum: 1 } } },
    ]);

    const totalEmails = emailStats[0]?.totalEmails || 0;
    const scraperStatus = await scraperManager.getStatus();

    res.json({
      totalChannels,
      todayChannels,
      channelsWithEmails,
      totalEmails,
      scrapers: scraperStatus,
      ollamaStatus: ollamaAvailable ? "connected" : "disconnected",
      saveRate: totalChannels > 0
        ? ((channelsWithEmails / totalChannels) * 100).toFixed(2) + "%"
        : "0%",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Get queue status
app.get("/api/queue", async (req, res) => {
  try {
    const queue = await Queue.find().sort({ createdAt: -1 }).limit(50);
    const stats = {
      pending: await Queue.countDocuments({ status: "pending" }),
      assigned: await Queue.countDocuments({ status: "assigned" }),
      processing: await Queue.countDocuments({ status: "processing" }),
      completed: await Queue.countDocuments({ status: "completed" }),
      failed: await Queue.countDocuments({ status: "failed" }),
    };
    res.json({ queue, stats });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

// Export channels CSV
app.get("/api/export/channels", async (req, res) => {
  try {
    const channels = await Channel.find({ hasEmails: true }).limit(50000);
    const csv = [
      ["Title", "Channel ID", "Subscribers", "Videos", "Emails", "Website", "Quality Score", "Country", "Scraped At"].join(","),
      ...channels.map((c) =>
        [
          `"${(c.title || "").replace(/"/g, '""')}"`,
          c.channelId || "",
          c.subscriberCount || 0,
          c.videoCount || 0,
          `"${(c.emails || []).join("; ")}"`,
          c.websiteUrl || "",
          c.qualityScore || 0,
          c.country || "N/A",
          c.scrapedAt ? new Date(c.scrapedAt).toLocaleString() : "N/A",
        ].join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=channels-${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export channels" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    scrapers: scraperManager.scrapers.size,
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    ollama: ollamaAvailable ? "connected" : "disconnected",
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`🚀 Multi-Scraper System running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? "ON" : "OFF"}`);
  
  await initOllama();
  
  console.log(`📊 Features:`);
  console.log(`   - Keywords ONLY from frontend request`);
  console.log(`   - Global Key Pool with ${process.env.YOUTUBE_API_KEY_1 ? '150' : '0'} keys`);
  console.log(`   - Multiple parallel scrapers`);
  console.log(`   - Ollama AI: ${ollamaAvailable ? "✅ Connected" : "❌ Fallback mode"}`);

  await scraperManager.initialize();
  console.log(`\n✅ System ready!`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await systemLogger.info("Server shutting down");

  for (const [instanceId, scraper] of scraperManager.scrapers) {
    await scraper.stop();
  }

  await mongoose.connection.close();
  io.close();
  server.close();
  process.exit(0);
});