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

// Parse PROXY_LIST - handle both JSON array and comma-separated formats
let PROXY_LIST = [];
if (process.env.PROXY_LIST) {
  try {
    // Try to parse as JSON array first
    const parsed = JSON.parse(process.env.PROXY_LIST);
    PROXY_LIST = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Fall back to comma-separated parsing
    PROXY_LIST = process.env.PROXY_LIST.split(",").map((proxy) => proxy.trim()).filter(Boolean);
  }
}

const HUNTER_API_KEY = process.env.HUNTER_API_KEY || null;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2"; // Changed to llama3.2 (more stable)
const DAILY_CHANNEL_TARGET = parseInt(process.env.DAILY_CHANNEL_TARGET || "10000", 10);
const MAX_REQUEST_CONCURRENCY = parseInt(process.env.MAX_REQUEST_CONCURRENCY || "6", 10);

// Log proxy configuration
if (PROXY_LIST.length > 0) {
  console.log(`✅ Proxy rotation ENABLED - ${PROXY_LIST.length} proxies loaded`);
  console.log(`   Sample proxies: ${PROXY_LIST.slice(0, 3).join(', ')}`);
} else {
  console.log(`⚠️ No proxies configured - requests will use direct connection`);
}

// Initialize Ollama client with better config
let ollama = null;
let ollamaAvailable = false;

async function initOllama() {
  try {
    // Log connection attempt
    console.log(`🔗 Attempting to connect to Ollama at ${OLLAMA_URL}...`);
    
    ollama = new Ollama({ host: OLLAMA_URL });
    
    // Test connection with timeout
    let models;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
      models = await Promise.race([
        ollama.list(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout - Ollama not responding')), 5000)
        )
      ]);
      clearTimeout(timeout);
    } catch (timeoutError) {
      throw new Error(`Connection failed: ${timeoutError.message}`);
    }
    
    console.log(`✅ Ollama connected successfully!`);
    console.log(`📦 Available models: ${models.models.map(m => m.name).join(', ')}`);
    
    // Check if our model exists
    const modelExists = models.models.some(m => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL));
    if (!modelExists) {
      console.log(`⚠️ Model '${OLLAMA_MODEL}' not found in Ollama.`);
      console.log(`📥 Pulling model: ${OLLAMA_MODEL} (this may take a few minutes)...`);
      try {
        await ollama.pull({ model: OLLAMA_MODEL, stream: false });
        console.log(`✅ Model ${OLLAMA_MODEL} pulled successfully!`);
      } catch (pullError) {
        console.log(`❌ Auto-pull failed: ${pullError.message}`);
        console.log(`\n📌 Please run manually in a terminal:\n   ollama pull ${OLLAMA_MODEL}\n`);
        throw new Error(`Model download failed: ${pullError.message}`);
      }
    }
    
    ollamaAvailable = true;
    console.log(`🚀 Ollama AI is ACTIVE using model: ${OLLAMA_MODEL}`);
  } catch (error) {
    console.log(`\n❌ OLLAMA CONNECTION FAILED\n`);
    console.log(`📍 Tried connecting to: ${OLLAMA_URL}`);
    console.log(`❌ Error: ${error.message}\n`);
    console.log(`💡 SOLUTIONS:\n`);
    console.log(`   1. Start Ollama server:\n      ollama serve\n`);
    console.log(`   2. Verify Ollama is running:\n      curl -i ${OLLAMA_URL}/api/tags\n`);
    console.log(`   3. Install Ollama (if not installed):\n      https://ollama.ai\n`);
    console.log(`📌 AI will use keyword-based fallback until Ollama is available\n`);
    
    ollamaAvailable = false;
  }
}

const HIGH_TICKET_KEYWORDS = [
  "coach",
  "consultant",
  "agency",
  "mentor",
  "business",
  "invest",
  "real estate",
  "crypto",
  "marketing",
  "sales",
  "fitness",
  "health",
  "finance",
  "wealth",
  "success",
  "growth",
  "strategy",
  "advisor",
];

function getRandomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function pickProxy() {
  if (!PROXY_LIST.length) return null;
  return PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
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
      auth: username
        ? {
            username,
            password: password || "",
          }
        : undefined,
    };
    if (DEBUG) {
      console.log(`🌐 Using proxy: ${host}:${port}`);
    }
  } else if (DEBUG) {
    console.log(`🌐 No proxy available, using direct connection`);
  }

  return axios(axiosConfig);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// AI Assessment function - improved with better fallback
async function aiAssessChannel({ title, subs, avgViews, description }, taskId = null, channelId = null) {
  // If Ollama not available, skip and use keyword filter
  if (!ollamaAvailable || !ollama) {
    const text = `${title} ${description || ""}`.toLowerCase();
    const businessSignal = HIGH_TICKET_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
    const decision = businessSignal ? "GOOD" : "BAD";
    
    await new Logger("ai").debug(
      `Fallback decision: ${decision} (Ollama unavailable)`,
      { title, subs, avgViews },
      taskId,
      channelId,
    );
    return decision;
  }

  const prompt = `Evaluate if this YouTube channel is GOOD for brand deals.

Channel: "${title}"
Subscribers: ${subs}
Avg views per video: ${avgViews}
Description: ${description?.substring(0, 200) || "No description"}

Is this channel suitable for paid collaborations? Answer only GOOD or BAD.`;

  try {
    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "system",
          content: "You evaluate YouTube channels for brand deals. Reply ONLY with GOOD or BAD."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      options: {
        temperature: 0.1,
        num_predict: 5
      },
      stream: false
    });

    const text = response.message?.content || "";
    const decision = String(text).trim().split(/\s+/)[0].toUpperCase();
    
    await new Logger("ai").debug(
      `AI decision: ${decision}`,
      { title, subs, avgViews, raw: text.substring(0, 50) },
      taskId,
      channelId,
    );

    return decision === "GOOD" ? "GOOD" : "BAD";
  } catch (error) {
    // If Ollama fails, mark as unavailable and use fallback
    console.log(`⚠️ Ollama error: ${error.message}`);
    ollamaAvailable = false;
    
    const text = `${title} ${description || ""}`.toLowerCase();
    const businessSignal = HIGH_TICKET_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
    const decision = businessSignal ? "GOOD" : "BAD";
    
    await new Logger("ai").warning(
      `AI failed, using fallback: ${decision}`,
      { error: error.message, title },
      taskId,
      channelId,
    );
    
    return decision;
  }
}

class DailyQuotaTracker {
  constructor() {
    this.dailyTarget = DAILY_CHANNEL_TARGET;
    this.resetTime = this.nextResetTime();
    this.channelsSaved = 0;
    this.apiCalls = 0;
    this.startResetTimer();
  }

  nextResetTime() {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next;
  }

  sync() {
    if (Date.now() >= this.resetTime.getTime()) {
      this.channelsSaved = 0;
      this.apiCalls = 0;
      this.resetTime = this.nextResetTime();
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
    setInterval(() => this.sync(), 60 * 1000);
  }
}

const dailyQuotaTracker = new DailyQuotaTracker();

// MongoDB connection
const mongoURI =
  "mongodb+srv://mohitsatyarthi11_db_user:3oh44WDniMDQqwHD@cluster0.focmc3a.mongodb.net/?appName=Cluster0";
mongoose
  .connect(mongoURI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    if (DEBUG) console.log("MongoDB URI:", mongoURI);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ==================== SCHEMAS ====================

// Scraper Instance Schema
const scraperInstanceSchema = new mongoose.Schema({
  instanceId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  status: {
    type: String,
    enum: ["idle", "busy", "stopped", "error"],
    default: "idle",
  },
  currentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "Queue" },
  preferredKeyIndices: [{ type: Number }],
  totalKeysAssigned: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  channelsScraped: { type: Number, default: 0 },
  emailsFound: { type: Number, default: 0 },
  startedAt: { type: Date },
  lastActive: { type: Date, default: Date.now },
});

scraperInstanceSchema.index({ status: 1, lastActive: -1 });
const ScraperInstance = mongoose.model(
  "ScraperInstance",
  scraperInstanceSchema,
);

// Queue Schema
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
    enum: [
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "assigned",
    ],
    default: "pending",
    index: true,
  },
  assignedTo: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
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
queueSchema.index({ assignedTo: 1, status: 1 });
const Queue = mongoose.model("Queue", queueSchema);

// Log Schema
const logSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ["info", "success", "warning", "error", "debug"],
    required: true,
  },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Queue" },
  scraperId: { type: String, ref: "ScraperInstance" },
  channelId: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, default: "system" },
});

logSchema.index({ timestamp: -1 });
logSchema.index({ scraperId: 1, taskId: 1 });
const Log = mongoose.model("Log", logSchema);

// Channel Schema
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
  socialLinks: [
    {
      platform: String,
      url: String,
    },
  ],
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

channelSchema.index({ emails: 1 });
channelSchema.index({ subscriberCount: -1, qualityScore: -1 });
channelSchema.index({ hasEmails: 1, discoveryDepth: 1 });
channelSchema.index({ sourceType: 1, hasEmails: 1 });

const Channel = mongoose.model("Channel", channelSchema);

const emailRecordSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, index: true },
  channels: [{ type: String, ref: "Channel" }],
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

const EmailRecord = mongoose.model("EmailRecord", emailRecordSchema);

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
    this.systemLogger.success(
      `✅ Global Key Pool initialized with ${apiKeys.length} keys`,
    );

    setInterval(() => this.checkAndResetQuota(), 60 * 1000);
  }

  getAvailableKey(scraperId, preferredIndices = []) {
    for (const idx of preferredIndices) {
      const status = this.keyStatus.get(idx);
      if (status && !status.inUse && !status.quotaExceeded) {
        status.inUse = true;
        status.lastUsed = new Date();
        status.assignedTo = scraperId;
        status.failCount = 0;
        return { key: this.allKeys[idx], index: idx };
      }
    }

    const availableKeys = [];
    for (let i = 0; i < this.allKeys.length; i++) {
      if (preferredIndices.includes(i)) continue;

      const status = this.keyStatus.get(i);
      if (status && !status.inUse && !status.quotaExceeded) {
        availableKeys.push({
          index: i,
          failCount: status.failCount,
          lastUsed: status.lastUsed,
        });
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

      this.systemLogger.debug(
        `🔑 Scraper ${scraperId} using fallback key ${bestKey.index + 1}`,
      );

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

        setTimeout(
          () => {
            status.quotaExceeded = false;
            this.systemLogger.info(
              `🔄 Key ${index + 1} quota reset after timeout`,
            );
          },
          60 * 1000,
        );
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
      if (status.quotaExceeded) {
        if (
          status.lastUsed &&
          now - status.lastUsed.getTime() > 60 * 1000
        ) {
          status.quotaExceeded = false;
          this.systemLogger.info(`🔄 Auto-reset quota for key ${i + 1}`);
        }
      }
    }
  }

  getStats() {
    const stats = {
      total: this.allKeys.length,
      available: 0,
      inUse: 0,
      quotaExceeded: 0,
      usageDistribution: [],
    };

    for (let i = 0; i < this.allKeys.length; i++) {
      const status = this.keyStatus.get(i);
      if (!status.inUse && !status.quotaExceeded) stats.available++;
      if (status.inUse) stats.inUse++;
      if (status.quotaExceeded) stats.quotaExceeded++;

      stats.usageDistribution.push({
        keyIndex: i + 1,
        usage: this.keyUsage.get(i) || 0,
        failCount: status.failCount || 0,
        status: status.inUse
          ? "in-use"
          : status.quotaExceeded
            ? "quota-exceeded"
            : "available",
      });
    }

    return stats;
  }
}

// ==================== LOGGER CLASS ====================

class Logger {
  constructor(source = "system") {
    this.source = source;
  }

  async log(
    level,
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
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

    try {
      await Log.create(logEntry);
    } catch (error) {
      console.error("Failed to save log to MongoDB:", error);
    }

    const timestamp = new Date().toISOString();
    const coloredMessage = this.getColoredMessage(
      level,
      `[${timestamp}] [${this.source}] ${message}`,
    );
    console.log(coloredMessage);

    if (global.io) {
      global.io.emit("log", logEntry);
    }

    return logEntry;
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

  getColoredMessage(level, message) {
    const colors = {
      info: "\x1b[36m",
      success: "\x1b[32m",
      warning: "\x1b[33m",
      error: "\x1b[31m",
      debug: "\x1b[35m",
    };
    const reset = "\x1b[0m";
    return `${colors[level] || ""}${message}${reset}`;
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
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY_1,
      process.env.YOUTUBE_API_KEY_2,
      process.env.YOUTUBE_API_KEY_3,
      process.env.YOUTUBE_API_KEY_4,
      process.env.YOUTUBE_API_KEY_5,
      process.env.YOUTUBE_API_KEY_6,
      process.env.YOUTUBE_API_KEY_7,
      process.env.YOUTUBE_API_KEY_8,
      process.env.YOUTUBE_API_KEY_9,
      process.env.YOUTUBE_API_KEY_10,
      process.env.YOUTUBE_API_KEY_11,
      process.env.YOUTUBE_API_KEY_12,
      process.env.YOUTUBE_API_KEY_13,
      process.env.YOUTUBE_API_KEY_14,
      process.env.YOUTUBE_API_KEY_15,
      process.env.YOUTUBE_API_KEY_16,
      process.env.YOUTUBE_API_KEY_17,
      process.env.YOUTUBE_API_KEY_18,
      process.env.YOUTUBE_API_KEY_19,
      process.env.YOUTUBE_API_KEY_20,
      process.env.YOUTUBE_API_KEY_21,
      process.env.YOUTUBE_API_KEY_22,
      process.env.YOUTUBE_API_KEY_23,
      process.env.YOUTUBE_API_KEY_24,
      process.env.YOUTUBE_API_KEY_25,
      process.env.YOUTUBE_API_KEY_26,
      process.env.YOUTUBE_API_KEY_27,
      process.env.YOUTUBE_API_KEY_28,
      process.env.YOUTUBE_API_KEY_29,
      process.env.YOUTUBE_API_KEY_30,
      process.env.YOUTUBE_API_KEY_31,
      process.env.YOUTUBE_API_KEY_32,
      process.env.YOUTUBE_API_KEY_33,
      process.env.YOUTUBE_API_KEY_34,
      process.env.YOUTUBE_API_KEY_35,
      process.env.YOUTUBE_API_KEY_36,
      process.env.YOUTUBE_API_KEY_37,
      process.env.YOUTUBE_API_KEY_38,
      process.env.YOUTUBE_API_KEY_39,
      process.env.YOUTUBE_API_KEY_40,
      process.env.YOUTUBE_API_KEY_41,
      process.env.YOUTUBE_API_KEY_42,
      process.env.YOUTUBE_API_KEY_43,
      process.env.YOUTUBE_API_KEY_44,
      process.env.YOUTUBE_API_KEY_45,
      process.env.YOUTUBE_API_KEY_46,
      process.env.YOUTUBE_API_KEY_47,
      process.env.YOUTUBE_API_KEY_48,
      process.env.YOUTUBE_API_KEY_49,
      process.env.YOUTUBE_API_KEY_50,
      process.env.YOUTUBE_API_KEY_51,
      process.env.YOUTUBE_API_KEY_52,
      process.env.YOUTUBE_API_KEY_53,
      process.env.YOUTUBE_API_KEY_54,
      process.env.YOUTUBE_API_KEY_55,
      process.env.YOUTUBE_API_KEY_56,
      process.env.YOUTUBE_API_KEY_57,
      process.env.YOUTUBE_API_KEY_58,
      process.env.YOUTUBE_API_KEY_59,
      process.env.YOUTUBE_API_KEY_60,
      process.env.YOUTUBE_API_KEY_61,
      process.env.YOUTUBE_API_KEY_62,
      process.env.YOUTUBE_API_KEY_63,
      process.env.YOUTUBE_API_KEY_64,
      process.env.YOUTUBE_API_KEY_65,
      process.env.YOUTUBE_API_KEY_66,
      process.env.YOUTUBE_API_KEY_67,
      process.env.YOUTUBE_API_KEY_68,
      process.env.YOUTUBE_API_KEY_69,
      process.env.YOUTUBE_API_KEY_70,
      process.env.YOUTUBE_API_KEY_71,
      process.env.YOUTUBE_API_KEY_72,
      process.env.YOUTUBE_API_KEY_73,
      process.env.YOUTUBE_API_KEY_74,
      process.env.YOUTUBE_API_KEY_75,
      process.env.YOUTUBE_API_KEY_76,
      process.env.YOUTUBE_API_KEY_77,
      process.env.YOUTUBE_API_KEY_78,
      process.env.YOUTUBE_API_KEY_79,
      process.env.YOUTUBE_API_KEY_80,
      process.env.YOUTUBE_API_KEY_81,
      process.env.YOUTUBE_API_KEY_82,
      process.env.YOUTUBE_API_KEY_83,
      process.env.YOUTUBE_API_KEY_84,
      process.env.YOUTUBE_API_KEY_85,
      process.env.YOUTUBE_API_KEY_86,
      process.env.YOUTUBE_API_KEY_87,
      process.env.YOUTUBE_API_KEY_88,
      process.env.YOUTUBE_API_KEY_89,
      process.env.YOUTUBE_API_KEY_90,
      process.env.YOUTUBE_API_KEY_91,
      process.env.YOUTUBE_API_KEY_92,
      process.env.YOUTUBE_API_KEY_93,
      process.env.YOUTUBE_API_KEY_94,
      process.env.YOUTUBE_API_KEY_95,
      process.env.YOUTUBE_API_KEY_96,
      process.env.YOUTUBE_API_KEY_97,
      process.env.YOUTUBE_API_KEY_98,
      process.env.YOUTUBE_API_KEY_99,
      process.env.YOUTUBE_API_KEY_100,
      process.env.YOUTUBE_API_KEY_101,
      process.env.YOUTUBE_API_KEY_102,
      process.env.YOUTUBE_API_KEY_103,
      process.env.YOUTUBE_API_KEY_104,
      process.env.YOUTUBE_API_KEY_105,
      process.env.YOUTUBE_API_KEY_106,
      process.env.YOUTUBE_API_KEY_107,
      process.env.YOUTUBE_API_KEY_108,
      process.env.YOUTUBE_API_KEY_109,
      process.env.YOUTUBE_API_KEY_110,
      process.env.YOUTUBE_API_KEY_111,
      process.env.YOUTUBE_API_KEY_112,
      process.env.YOUTUBE_API_KEY_113,
      process.env.YOUTUBE_API_KEY_114,
      process.env.YOUTUBE_API_KEY_115,
      process.env.YOUTUBE_API_KEY_116,
      process.env.YOUTUBE_API_KEY_117,
      process.env.YOUTUBE_API_KEY_118,
      process.env.YOUTUBE_API_KEY_119,
      process.env.YOUTUBE_API_KEY_120,
      process.env.YOUTUBE_API_KEY_121,
      process.env.YOUTUBE_API_KEY_122,
      process.env.YOUTUBE_API_KEY_123,
      process.env.YOUTUBE_API_KEY_124,
      process.env.YOUTUBE_API_KEY_125,
      process.env.YOUTUBE_API_KEY_126,
      process.env.YOUTUBE_API_KEY_127,
      process.env.YOUTUBE_API_KEY_128,
      process.env.YOUTUBE_API_KEY_129,
      process.env.YOUTUBE_API_KEY_130,
      process.env.YOUTUBE_API_KEY_131,
      process.env.YOUTUBE_API_KEY_132,
      process.env.YOUTUBE_API_KEY_133,
      process.env.YOUTUBE_API_KEY_134,
      process.env.YOUTUBE_API_KEY_135,
      process.env.YOUTUBE_API_KEY_136,
      process.env.YOUTUBE_API_KEY_137,
      process.env.YOUTUBE_API_KEY_138,
      process.env.YOUTUBE_API_KEY_139,
      process.env.YOUTUBE_API_KEY_140,
      process.env.YOUTUBE_API_KEY_141,
      process.env.YOUTUBE_API_KEY_142,
      process.env.YOUTUBE_API_KEY_143,
      process.env.YOUTUBE_API_KEY_144,
      process.env.YOUTUBE_API_KEY_145,
      process.env.YOUTUBE_API_KEY_146,
      process.env.YOUTUBE_API_KEY_147,
      process.env.YOUTUBE_API_KEY_148,
      process.env.YOUTUBE_API_KEY_149,
      process.env.YOUTUBE_API_KEY_150,
    ].filter(
      (key) => key && key !== "YOUR_API_KEY_1" && key !== "YOUR_API_KEY_2",
    );

    if (this.apiKeys.length === 0) {
      this.systemLogger.error("❌ No valid YouTube API keys found");
      process.exit(1);
    }

    this.keyPool.initialize(this.apiKeys);

    this.systemLogger.success(
      `✅ Loaded ${this.apiKeys.length} YouTube API keys`,
    );

    this.maxConcurrentScrapers = Math.min(
      this.maxConcurrentScrapers,
      this.apiKeys.length || this.maxConcurrentScrapers,
    );

    await this.createKeyGroups();
    await this.loadOrCreateScrapers();

    this.initialized = true;
    this.systemLogger.success(
      `🚀 Scraper Manager initialized with ${this.scrapers.size} scrapers`,
    );

    this.startAssignmentLoop();
    this.startHealthCheckLoop();
  }

  async createKeyGroups() {
    const keysPerScraper = Math.min(
      5,
      Math.ceil(this.apiKeys.length / this.maxConcurrentScrapers),
    );

    for (let i = 0; i < this.apiKeys.length; i += keysPerScraper) {
      const group = Array.from(
        { length: Math.min(keysPerScraper, this.apiKeys.length - i) },
        (_, index) => i + index,
      );
      this.keyGroups.push(group);
    }

    this.systemLogger.debug(
      `Created ${this.keyGroups.length} preferred key groups`,
    );
  }

  async loadOrCreateScrapers() {
    const existingScrapers = await ScraperInstance.find();

    if (existingScrapers.length > 0) {
      for (const scraper of existingScrapers) {
        const scraperObj = new ScraperWorker(
          scraper.instanceId,
          scraper.preferredKeyIndices || [],
          this,
        );
        this.scrapers.set(scraper.instanceId, scraperObj);

        if (scraper.status === "busy") {
          scraper.status = "idle";
          scraper.currentTaskId = null;
          await scraper.save();
        }
      }
      this.systemLogger.info(
        `📋 Loaded ${existingScrapers.length} existing scrapers`,
      );
    } else {
      const numScrapers = Math.min(this.keyGroups.length, this.maxConcurrentScrapers);
      for (let i = 0; i < numScrapers; i++) {
        await this.createScraper(`Scraper-${i + 1}`, this.keyGroups[i]);
      }
      this.systemLogger.info(
        `🆕 Created ${numScrapers} new scrapers`,
      );
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

    const scraperWorker = new ScraperWorker(
      instanceId,
      preferredKeyIndices,
      this,
    );
    this.scrapers.set(instanceId, scraperWorker);

    await this.systemLogger.success(
      `✅ Created new scraper: ${name}`,
    );

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

    if (!scraper) {
      return false;
    }

    task.status = "assigned";
    task.assignedTo = scraper.instanceId;
    task.assignedAt = new Date();
    await task.save();

    await scraper.assignTask(task);

    await this.systemLogger.info(
      `📌 Task ${task._id} assigned to scraper ${scraper.instanceId}`,
    );

    return true;
  }

  startAssignmentLoop() {
    setInterval(async () => {
      let pendingTasks = [];
      try {
        if (!this.initialized) return;
        if (!dailyQuotaTracker.canSave(1)) {
          return;
        }

        pendingTasks = await Queue.find({
          status: "pending",
          $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }],
        })
          .sort({ priority: -1, createdAt: 1 })
          .limit(20);

        if (pendingTasks.length === 0) return;

        for (const task of pendingTasks) {
          const assigned = await this.assignTask(task);
          if (!assigned) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        await this.systemLogger.error("Error in task assignment loop", {
          error: error.message,
          stack: error.stack,
          taskCount: pendingTasks?.length || 0,
        });
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
            const inactiveTime =
              Date.now() - new Date(health.lastActive).getTime();

            if (inactiveTime > 10 * 60 * 1000) {
              await this.systemLogger.warning(
                `⚠️ Scraper ${instanceId} appears stuck, resetting`,
              );
              await scraper.reset();
            }
          }

          await ScraperInstance.updateOne(
            { instanceId },
            { lastActive: new Date() },
          );
        }
      } catch (error) {
        await this.systemLogger.error("Error in health check loop", {
          error: error.message,
          stack: error.stack,
          scraperCount: this.scrapers?.size || 0,
        });
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

    await this.systemLogger.success(
      `✅ Task ${taskId} completed by scraper ${scraperId}`,
      stats,
    );
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

    await this.systemLogger.error(
      `❌ Task ${taskId} failed on scraper ${scraperId}`,
      { error: error.message },
    );
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

  async batchProcess(items, handler, concurrency = MAX_REQUEST_CONCURRENCY) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (item, index) => {
          try {
            return await handler(item, i + index);
          } catch (error) {
            await this.logger.debug(
              "Batch item failed",
              { error: error.message },
              this.currentTask?._id,
            );
            return null;
          }
        }),
      );
      results.push(...chunkResults);
    }
    return results;
  }

  async requestPage(options) {
    try {
      return await requestWithProxy(options);
    } catch (error) {
      await this.logger.warning(
        "Proxy request failed, retrying without proxy",
        { error: error.message, url: options.url },
        this.currentTask?._id,
      );
      return axios({
        ...options,
        headers: {
          ...options.headers,
          "User-Agent": getRandomUserAgent(),
        },
        timeout: options.timeout || 12000,
      });
    }
  }

  async hunterLookup(domain) {
    if (!HUNTER_API_KEY || !domain) return [];

    try {
      const response = await this.requestPage({
        url: `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
          domain,
        )}&api_key=${HUNTER_API_KEY}&limit=50`,
        method: "get",
      });

      const emails = response.data?.data?.emails || [];
      return emails
        .map((item) => item.value?.toLowerCase().trim())
        .filter((email) => email && this.isValidEmail(email));
    } catch (error) {
      await this.logger.debug(
        "Hunter lookup failed",
        { domain, error: error.message },
        this.currentTask?._id,
      );
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
      await this.logger.debug(
        "EmailRecord bulkWrite issue",
        { error: error.message },
        this.currentTask?._id,
      );
    }
  }

  async assignTask(task) {
    this.currentTask = task;
    this.status = "busy";
    this.lastActive = new Date();
    this.consecutiveFails = 0;

    console.log(`🚀 Scraper ${this.instanceId} assigned task ${task._id}`);

    await ScraperInstance.updateOne(
      { instanceId: this.instanceId },
      {
        status: "busy",
        currentTaskId: task._id,
        lastActive: new Date(),
      },
    );

    this.processTask(task).catch((error) => {
      this.logger.error("Error processing task", { error: error.message });
    });
  }

  async getKey() {
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const keyInfo = this.manager.getKeyForScraper(
        this.instanceId,
        this.preferredKeyIndices,
      );

      if (keyInfo) {
        this.currentKeyIndex = keyInfo.index;
        this.currentKey = keyInfo.key;

        await this.logger.debug(
          `🔑 Got key ${keyInfo.index + 1}`,
          {
            keyIndex: keyInfo.index + 1,
            attempt,
          },
          this.currentTask?._id,
        );

        return keyInfo.key;
      }

      if (attempt < maxAttempts) {
        await this.logger.warning(
          `⏳ No keys available, waiting (${attempt}/${maxAttempts})`,
          {},
          this.currentTask?._id,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }

    throw new Error("No API keys available after multiple attempts");
  }

  releaseKey(quotaExceeded = false, failed = false) {
    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(
        this.currentKeyIndex,
        this.instanceId,
        quotaExceeded,
        failed,
      );

      if (quotaExceeded) {
        this.logger.warning(
          `⚠️ Key ${this.currentKeyIndex + 1} quota exceeded`,
        );
      }

      this.currentKeyIndex = null;
      this.currentKey = null;
    }
  }

  async getYouTubeClient() {
    this.releaseKey(false, this.consecutiveFails > 3);
    const key = await this.getKey();

    return google.youtube({
      version: "v3",
      auth: key,
    });
  }

  // ==================== INTELLIGENT SCRAPING ====================

  async expandKeywordsWithOllama(baseKeyword) {
    if (!ollamaAvailable || !ollama) {
      // Fallback: simple variations
      return [
        baseKeyword,
        `${baseKeyword} tutorial`,
        `${baseKeyword} guide`,
        `how to ${baseKeyword}`,
        `${baseKeyword} tips`,
      ];
    }

    const prompt = `Generate 50 unique, specific, long-tail search keywords related to: "${baseKeyword}"
    
Make them realistic YouTube search queries. Include:
- Tutorial variations  
- Review/opinion variations
- How-to variations
- Tool/software specific
- Niche variations
- Creator-focused searches
- Educational variations

Return ONLY the keywords, one per line. No numbering, no explanation.`;

    try {
      const response = await ollama.generate({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      });

      const keywords = response.response
        .split('\n')
        .map(k => k.trim())
        .filter(k => k.length > 3 && k.length < 100)
        .slice(0, 50);

      await this.logger.info('🧠 Keyword expansion', { 
        base: baseKeyword, 
        expanded: keywords.length 
      });

      return keywords.length > 0 ? keywords : [baseKeyword];
    } catch (error) {
      await this.logger.warning('Keyword expansion failed', { error: error.message });
      return [baseKeyword];
    }
  }

  async searchVideosByKeyword(youtube, keyword, maxResults = 50) {
    try {
      const response = await youtube.search.list({
        part: 'snippet',
        q: keyword,
        type: 'video',
        maxResults: Math.min(maxResults, 50),
        order: 'viewCount',
        regionCode: 'US',
        relevanceLanguage: 'en',
      });

      return response.data.items || [];
    } catch (error) {
      await this.logger.debug('Video search failed', { keyword, error: error.message });
      return [];
    }
  }

  async extractChannelsFromVideos(youtube, videoItems) {
    const channels = new Map();

    for (const video of videoItems) {
      const channelId = video.snippet.channelId;
      if (!channels.has(channelId)) {
        channels.set(channelId, {
          id: channelId,
          title: video.snippet.channelTitle,
          videoCount: 0,
        });
      }
      channels.get(channelId).videoCount++;
    }

    // Fetch full channel details
    const channelIds = Array.from(channels.keys());
    const detailedChannels = [];

    for (let i = 0; i < channelIds.length; i += 50) {
      try {
        const batch = channelIds.slice(i, i + 50);
        const response = await youtube.channels.list({
          part: 'snippet,statistics',
          id: batch.join(','),
        });

        detailedChannels.push(...(response.data.items || []));
      } catch (error) {
        await this.logger.debug('Channel details fetch failed', { error: error.message });
      }
    }

    return detailedChannels;
  }

  async findRelatedChannels(youtube, videoId) {
    try {
      const response = await youtube.search.list({
        part: 'snippet',
        relatedToVideoId: videoId,
        type: 'video',
        maxResults: 20,
      });

      return response.data.items || [];
    } catch (error) {
      return [];
    }
  }

  async processTask(task) {
    try {
      console.log(`🔥 Scraper ${this.instanceId} starting to process task ${task._id}`);

      await this.logger.info(
        `🚀 Starting task: ${task._id}`,
        {
          keywords: task.data.keywords,
          count: task.data.count,
        },
        task._id,
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
        },
      );
    } catch (error) {
      this.consecutiveFails++;
      this.releaseKey(false, true);

      await this.manager.handleTaskFailure(task._id, this.instanceId, error);

      this.status = "idle";
      this.currentTask = null;

      await ScraperInstance.updateOne(
        { instanceId: this.instanceId },
        {
          status: "idle",
          currentTaskId: null,
          lastActive: new Date(),
        },
      );
    }
  }

  async scrapeChannels(task) {
    const options = task.data;
    const keywords = options.keywords;
    const maxResults = options.count || 500;
    const taskId = task._id;

    const {
      countryCode = null,
      minSubscribers = 50000,
      includeRelated = true,
      relatedDepth = 2,
      enrichKeywords: shouldEnrich = true,
    } = options;

    let totalChannels = 0;
    let savedChannels = 0;
    let skippedChannels = 0;
    let totalEmailsFound = 0;
    let totalPhonesFound = 0;
    let relatedChannelsFound = 0;
    let totalQualityScore = 0;

    let searchKeywords = keywords;
    if (shouldEnrich) {
      await this.logger.info(
        "🔍 Enriching keywords...",
        { originalCount: keywords.length },
        taskId,
      );
      searchKeywords = await this.enrichKeywords(keywords);
      await this.logger.success(
        "✅ Keywords enriched",
        {
          original: keywords.length,
          enriched: searchKeywords.length,
        },
        taskId,
      );
    }

    const channelQueue = [];
    const processedChannels = new Set();

    await this.logger.info(
      "🚀 Starting scrape",
      {
        keywords: searchKeywords.length,
        maxResults,
        countryCode,
        minSubscribers,
        includeRelated,
        relatedDepth,
      },
      taskId,
    );

    // Phase 1: Direct Channel Search (PRIMARY METHOD)
    await this.logger.info(
      "📺 PHASE 1: Direct Channel Search",
      { keywords: searchKeywords.length, target: maxResults },
      taskId,
    );

    for (const keyword of searchKeywords) {
      if (savedChannels >= maxResults) break;

      let pageToken = null;
      let pageCount = 0;

      while (savedChannels < maxResults && pageCount < 15) {
        try {
          const youtube = await this.getYouTubeClient();

          const searchParams = {
            part: "snippet",
            q: keyword,
            type: "channel",
            maxResults: 50,
            order: "videoCount",
            pageToken: pageToken,
          };

          if (countryCode) {
            searchParams.regionCode = countryCode;
          }

          dailyQuotaTracker.recordApiCall();
          const searchResponse = await youtube.search.list(searchParams);
          pageCount++;

          console.log(`🔍 Search for "${keyword}" page ${pageCount}: ${searchResponse.data.items?.length || 0} items`);

          if (
            !searchResponse.data.items ||
            searchResponse.data.items.length === 0
          )
            break;

          const channelItems = searchResponse.data.items || [];
          const batchResults = await this.batchProcess(
            channelItems,
            async (item) => {
              if (savedChannels >= maxResults) return null;

              const channelId = item.snippet.channelId;
              if (processedChannels.has(channelId)) return null;
              processedChannels.add(channelId);
              totalChannels++;

              dailyQuotaTracker.recordApiCall();
              const channelResponse = await youtube.channels.list({
                part: "snippet,statistics",
                id: channelId,
              });

              const channelData = channelResponse.data.items?.[0];
              if (!channelData) return { skipped: true };

              const result = await this.processChannel(
                channelData,
                {
                  keywords: [keyword],
                  sourceType: "direct_channel_search",
                  discoveryDepth: 0,
                },
                taskId,
                minSubscribers,
              );

              return { channelId, result };
            },
            Math.min(MAX_REQUEST_CONCURRENCY, channelItems.length),
          );

          for (const itemResult of batchResults) {
            if (!itemResult || !itemResult.result) continue;

            const { channelId, result } = itemResult;
            if (result.saved) {
              savedChannels++;
              totalEmailsFound += result.emails || 0;
              totalPhonesFound += result.phones || 0;
              totalQualityScore += result.qualityScore || 0;

              if (
                includeRelated &&
                result.channel?.subscriberCount >= minSubscribers
              ) {
                channelQueue.push({
                  channelId,
                  depth: 0,
                  sourceType: "search",
                });
              }
            } else if (result && result.skipped) {
              skippedChannels++;
            }
          }

          pageToken = searchResponse.data.nextPageToken;
          if (!pageToken) break;
        } catch (error) {
          console.log(`❌ Search error for "${keyword}": ${error.message}`);
          await this.logger.error(
            `Error searching keyword "${keyword}"`,
            { error: error.message },
            taskId,
          );

          if (error.code === 403) {
            this.releaseKey(true, false);
          } else {
            this.releaseKey(false, true);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // Phase 2: Video Search → Channel Extraction (FALLBACK if Phase 1 insufficient)
    if (savedChannels < maxResults) {
      await this.logger.info(
        "🎬 PHASE 2: Searching Videos for Channels",
        { current: savedChannels, target: maxResults },
        taskId,
      );

      for (const keyword of searchKeywords) {
        if (savedChannels >= maxResults) break;

        try {
          const youtube = await this.getYouTubeClient();
          let videoPageToken = null;
          let videoPageCount = 0;

          while (savedChannels < maxResults && videoPageCount < 5) {
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

              const channelIds = new Set();
              videoItems.forEach((video) => {
                channelIds.add(video.snippet.channelId);
              });

              const batchResults = await this.batchProcess(
                Array.from(channelIds),
                async (channelId) => {
                  if (savedChannels >= maxResults) return null;
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
                      {
                        keywords: [keyword],
                        sourceType: "video_extraction",
                        discoveryDepth: 0,
                      },
                      taskId,
                      minSubscribers,
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
                },
                MAX_REQUEST_CONCURRENCY,
              );

              videoPageToken = videoResponse.data.nextPageToken;
              if (!videoPageToken) break;
            } catch (error) {
              await this.logger.debug(
                `Video search error for "${keyword}"`,
                { error: error.message },
                taskId,
              );
              if (error.code === 403) {
                this.releaseKey(true, false);
              }
              await delay(2000);
              break;
            }
          }
        } catch (err) {
          await this.logger.debug(
            "Phase 2 error",
            { keyword, error: err.message },
            taskId,
          );
        }
      }
    }

    // Phase 3: Discover related channels (FALLBACK if still insufficient)
    if (includeRelated && channelQueue.length > 0 && savedChannels < maxResults) {
      await this.logger.info(
        "🔗 PHASE 3: Related Channels Discovery",
        { current: savedChannels, target: maxResults, queueSize: channelQueue.length },
        taskId,
      );
      await this.logger.info(
        "🔗 Discovering related channels",
        {
          queueSize: channelQueue.length,
          maxDepth: relatedDepth,
        },
        taskId,
      );

      let queueIndex = 0;
      let relatedAttempts = 0;
      const maxRelatedAttempts = Math.min(channelQueue.length, 50);

      while (queueIndex < channelQueue.length && savedChannels < maxResults && relatedAttempts < maxRelatedAttempts) {
        const current = channelQueue[queueIndex++];

        if (current.depth >= relatedDepth) continue;

        try {
          const youtube = await this.getYouTubeClient();
          const related = await this.getRelatedChannels(
            youtube,
            current.channelId,
            current.depth,
            relatedDepth,
            taskId,
          );
          relatedChannelsFound += related.length;

          const batchResults = await this.batchProcess(
            related,
            async (rel) => {
              if (
                processedChannels.has(rel.channelId) ||
                savedChannels >= maxResults
              )
                return null;

              processedChannels.add(rel.channelId);
              totalChannels++;

              dailyQuotaTracker.recordApiCall();
              const channelResponse = await youtube.channels.list({
                part: "snippet,statistics",
                id: rel.channelId,
              });

              const channelData = channelResponse.data.items?.[0];
              if (!channelData) return { skipped: true };

              const result = await this.processChannel(
                channelData,
                {
                  sourceType: rel.sourceType,
                  sourceChannel: rel.sourceChannel,
                  discoveryDepth: rel.discoveryDepth,
                },
                taskId,
                minSubscribers,
              );

              return { rel, result };
            },
            Math.min(MAX_REQUEST_CONCURRENCY, related.length),
          );

          for (const batchResult of batchResults) {
            if (!batchResult || !batchResult.result) continue;
            const { rel, result } = batchResult;

            if (result.saved) {
              savedChannels++;
              totalEmailsFound += result.emails || 0;
              totalPhonesFound += result.phones || 0;
              totalQualityScore += result.qualityScore || 0;

              if (rel.discoveryDepth < relatedDepth) {
                channelQueue.push({
                  channelId: rel.channelId,
                  depth: rel.discoveryDepth + 1,
                  sourceType: rel.sourceType,
                });
              }
            } else {
              skippedChannels++;
            }
          }
        } catch (error) {
          await this.logger.error(
            "Error discovering related channels",
            {
              channelId: current.channelId,
              error: error.message,
            },
            taskId,
          );

          if (error.code === 403) {
            this.releaseKey(true, false);
          }
        }
      }
    }

    // Phase 4: Aggressive Fallback - Retry with broader search if still insufficient
    if (savedChannels < maxResults && searchKeywords.length > 0) {
      const shortfall = maxResults - savedChannels;
      await this.logger.warning(
        `⚠️ PHASE 4: Shortfall detected - need ${shortfall} more channels`,
        { current: savedChannels, target: maxResults },
        taskId,
      );

      // Retry phase 1 with lower order/count requirements
      try {
        for (const keyword of searchKeywords.reverse()) {
          if (savedChannels >= maxResults) break;

          const youtube = await this.getYouTubeClient();
          let pageToken = null;

          for (let attempt = 0; attempt < 2 && savedChannels < maxResults; attempt++) {
            try {
              dailyQuotaTracker.recordApiCall();
              const retryResponse = await youtube.search.list({
                part: "snippet",
                q: keyword,
                type: "channel",
                maxResults: 50,
                // Try different sort orders
                order: attempt === 0 ? "relevance" : "viewCount",
                pageToken: attempt === 0 ? null : pageToken,
              });

              const retryItems = retryResponse.data.items || [];
              if (retryItems.length === 0) continue;

              const batchResults = await this.batchProcess(
                retryItems,
                async (item) => {
                  if (savedChannels >= maxResults) return null;

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
                    if (!channelData) return null;

                    const result = await this.processChannel(
                      channelData,
                      {
                        keywords: [keyword],
                        sourceType: "fallback_search",
                        discoveryDepth: 0,
                      },
                      taskId,
                      minSubscribers,
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
                },
                MAX_REQUEST_CONCURRENCY,
              );

              pageToken = retryResponse.data.nextPageToken;
              if (!pageToken) break;
            } catch (error) {
              if (error.code === 403) {
                this.releaseKey(true, false);
              }
              await delay(2000);
            }
          }
        }
      } catch (error) {
        await this.logger.debug(
          "Phase 4 fallback encountered error",
          { error: error.message },
          taskId,
        );
      }

      if (savedChannels >= maxResults) {
        await this.logger.success(
          `✅ PHASE 4: Reached target count (${savedChannels}/${maxResults})`,
          { shortfall: maxResults - savedChannels },
          taskId,
        );
      } else if (savedChannels > 0) {
        await this.logger.warning(
          `⚠️ Could not reach full target count: ${savedChannels}/${maxResults}`,
          { deficit: maxResults - savedChannels },
          taskId,
        );
      }
    }

    const stats = {
      channelsScraped: totalChannels,
      channelsSaved: savedChannels,
      channelsSkipped: skippedChannels,
      emailsFound: totalEmailsFound,
      phonesFound: totalPhonesFound,
      relatedChannelsFound,
      avgQualityScore:
        savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0,
    };

    await this.logger.success("🎉 Scrape completed!", stats, taskId);

    return stats;
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
            const response = await this.requestPage({
              url,
              method: "get",
              responseType: "json",
              timeout: 7000,
            });
            if (response.data && Array.isArray(response.data[1])) {
              response.data[1].forEach((suggestion) => {
                enriched.add(suggestion);
              });
            }
          } catch (e) {}
        }

        enriched.add(keyword + " tutorial");
        enriched.add(keyword + " review");
        enriched.add(keyword + " how to");
        enriched.add("learn " + keyword);
      } catch (error) {
        await this.logger.error("Error enriching keyword", {
          keyword,
          error: error.message,
        });
      }
    }

    return Array.from(enriched).slice(0, 50);
  }

  async processChannel(channelData, sourceInfo = {}, taskId = null, minSubscribers = 1000) {
    const channelId = channelData.id || channelData.channelId;

    const existing = await Channel.findOne({ channelId });
    if (existing) {
      if (existing.emails && existing.emails.length > 0) {
        const snippet = channelData.snippet;
        const description = snippet.description || "";
        const newEmails = this.extractEmails(description);

        if (newEmails.length > 0) {
          const allEmails = [...new Set([...existing.emails, ...newEmails])];
          existing.emails = allEmails;
          existing.hasEmails = true;
          existing.lastUpdated = new Date();
          existing.scrapedBy = this.instanceId;
          await existing.save();
          await this.saveEmailRecords(channelId, newEmails);

          await this.logger.debug(
            `Updated existing channel with new emails`,
            {
              channelId,
              newEmails: newEmails.length,
              totalEmails: allEmails.length,
            },
            taskId,
            channelId,
          );

          return {
            saved: true,
            updated: true,
            channel: existing,
            emails: newEmails.length,
          };
        }
      }
      return { saved: false, skipped: true, reason: "exists" };
    }

    try {
      const snippet = channelData.snippet;
      const statistics = channelData.statistics || {};

      const subscriberCount = parseInt(statistics.subscriberCount || 0);
      const videoCount = parseInt(statistics.videoCount || 0);
      const viewCount = parseInt(statistics.viewCount || 0);
      const avgViews = videoCount > 0 ? Math.round(viewCount / videoCount) : 0;

      const description = snippet.description || "";
      const lowercaseText = `${snippet.title} ${description}`.toLowerCase();
      const isHighTicketNiche = HIGH_TICKET_KEYWORDS.some((k) =>
        lowercaseText.includes(k.toLowerCase()),
      );

      // STRICT SUBSCRIBER COUNT REQUIREMENT
      if (subscriberCount < minSubscribers) {
        await this.logger.debug(
          `❌ Insufficient subscribers: ${subscriberCount} < ${minSubscribers}`,
          {
            channelId,
            title: snippet.title,
            subscribers: subscriberCount,
            required: minSubscribers,
          },
          taskId,
          channelId,
        );
        return { saved: false, skipped: true, reason: "insufficient_subscribers" };
      }

      // Minimal hard filter - allow most channels
      if (videoCount < 10) {
        // Skip only if no videos at all
        return { saved: false, skipped: true, reason: "no_videos" };
      }

      let emails = this.extractEmails(description);
      let phones = this.extractPhoneNumbers(description);
      let socialLinks = this.extractSocialLinks(description);
      let websiteUrl = this.extractWebsite(description);

      if (websiteUrl) {
        const websiteData = await this.scrapeWebsiteForContacts(websiteUrl);
        emails = [...new Set([...emails, ...websiteData.emails])];
        phones = [...new Set([...phones, ...websiteData.phones])];
      }

      const bioLinks = socialLinks.filter(
        (s) => s.url.includes("linktr.ee") || s.url.includes("bio.link"),
      );

      for (const bioLink of bioLinks) {
        try {
          const bioResponse = await this.requestPage({
            url: bioLink.url,
            method: "get",
            responseType: "text",
            timeout: 10000,
          });
          const bioEmails = this.extractEmails(bioResponse.data);
          emails = [...new Set([...emails, ...bioEmails])];
        } catch (e) {}
      }

      if (emails.length === 0 && websiteUrl) {
        try {
          const websiteDomain = new URL(websiteUrl).hostname.replace(/^www\./, "");
          const hunterEmails = await this.hunterLookup(websiteDomain);
          emails = [...new Set([...emails, ...hunterEmails])];
          if (hunterEmails.length > 0) {
            await this.logger.success(
              "🔍 Hunter found email addresses",
              { websiteUrl, hunterEmails: hunterEmails.length },
              taskId,
              channelId,
            );
          }
        } catch (error) {
          await this.logger.debug(
            "Hunter lookup failed",
            { websiteUrl, error: error.message },
            taskId,
            channelId,
          );
        }
      }

      const hasWebsite = !!websiteUrl;
      const hasContact = emails.length > 0 || hasWebsite || phones.length > 0;
      const aiDecision = await aiAssessChannel(
        {
          title: snippet.title,
          subs: subscriberCount,
          avgViews,
          description,
        },
        taskId,
        channelId,
      );

      // Log AI decision but don't reject
      await this.logger.debug(
        `AI: ${aiDecision}`,
        { channelId, title: snippet.title },
        taskId,
        channelId,
      );

      // REQUIRE EMAILS - must have valid email addresses
      if (emails.length === 0) {
        await this.logger.debug(
          "❌ No emails found",
          { channelId, title: snippet.title, website: hasWebsite },
          taskId,
          channelId,
        );
        return { saved: false, skipped: true, reason: "no_emails" };
      }

      const engagementRate =
        videoCount > 0 ? viewCount / videoCount / (subscriberCount || 1) : 0;

      let qualityScore = 10;
      if (subscriberCount > 100000) qualityScore += 40;
      else if (subscriberCount > 50000) qualityScore += 30;
      else if (subscriberCount > 10000) qualityScore += 20;
      else if (subscriberCount > 1000) qualityScore += 10;

      if (avgViews > 10000) qualityScore += 30;
      else if (avgViews > 5000) qualityScore += 20;
      else if (avgViews > 1000) qualityScore += 10;

      if (hasWebsite) qualityScore += 15;
      if (emails.length > 0) qualityScore += 15;
      if (phones.length > 0) qualityScore += 10;
      if (isHighTicketNiche) qualityScore += 20;

      const leadCategory =
        qualityScore >= 100 ? "PREMIUM" :
        qualityScore >= 70 ? "HIGH VALUE" :
        qualityScore >= 40 ? "GOOD LEAD" :
        "PROSPECT";

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
          emailCount: emails.length,
          hasPhone: phones.length > 0,
          phoneCount: phones.length,
          hasSocial: socialLinks.length > 0,
          socialCount: socialLinks.length,
          hasWebsite: !!websiteUrl,
        },
        engagement: {
          avgViewsPerVideo: videoCount > 0 ? viewCount / videoCount : 0,
          engagementRate,
        },
        qualityScore,
        leadCategory,
        isHighTicketNiche,
        moneyScore: qualityScore,
        lastUpdated: new Date(),
        hasEmails: emails.length > 0,
        savedReason: emails.length > 0 ? "emails" : websiteUrl ? "website" : "contact",
        sourceType: sourceInfo.sourceType || "search",
        discoveryDepth: sourceInfo.discoveryDepth || 0,
        scrapedBy: this.instanceId,
      });

      await channel.save();
      await this.saveEmailRecords(channelId, emails);
      dailyQuotaTracker.recordChannelSaved(1);

      await this.logger.success(
        `✅ SAVED: "${snippet.title}" with ${emails.length} emails`,
        {
          emails: emails.length,
          subscribers: subscriberCount,
          qualityScore,
        },
        taskId,
        channelId,
      );

      return {
        saved: true,
        channel,
        emails: emails.length,
        phones: phones.length,
        qualityScore,
      };
    } catch (error) {
      await this.logger.error(
        "Error processing channel",
        { channelId, error: error.message },
        taskId,
      );
      return { saved: false, error: error.message };
    }
  }

  async getRelatedChannels(
    youtube,
    channelId,
    depth = 0,
    maxDepth = 2,
    taskId = null,
  ) {
    if (depth >= maxDepth) return [];

    const relatedChannels = [];

    try {
      dailyQuotaTracker.recordApiCall();
      const videosResponse = await youtube.search.list({
        part: "snippet",
        channelId: channelId,
        type: "video",
        maxResults: 5,
        order: "date",
      });

      if (!videosResponse.data.items) return [];

      for (const video of videosResponse.data.items) {
        const videoId = video.id.videoId;

        try {
          dailyQuotaTracker.recordApiCall();
          const commentsResponse = await youtube.commentThreads.list({
            part: "snippet",
            videoId,
            maxResults: 50,
          });

          if (commentsResponse.data.items) {
            for (const comment of commentsResponse.data.items) {
              const authorChannelId =
                comment.snippet.topLevelComment.snippet.authorChannelId?.value;
              if (authorChannelId && authorChannelId !== channelId) {
                relatedChannels.push({
                  channelId: authorChannelId,
                  sourceType: "comments",
                  sourceChannel: channelId,
                  discoveryDepth: depth + 1,
                });
              }
            }
          }
        } catch (e) {}

        try {
          dailyQuotaTracker.recordApiCall();
          const relatedResponse = await youtube.search.list({
            part: "snippet",
            relatedToVideoId: videoId,
            type: "video",
            maxResults: 20,
          });

          if (relatedResponse.data.items) {
            for (const related of relatedResponse.data.items) {
              if (related.snippet.channelId !== channelId) {
                relatedChannels.push({
                  channelId: related.snippet.channelId,
                  sourceType: "related",
                  sourceChannel: channelId,
                  discoveryDepth: depth + 1,
                });
              }
            }
          }
        } catch (e) {}
      }
    } catch (error) {
      await this.logger.error(
        "Error getting related channels",
        { channelId, error: error.message },
        taskId,
      );
    }

    const unique = {};
    relatedChannels.forEach((c) => (unique[c.channelId] = c));

    return Object.values(unique);
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
      {
        platform: "twitter",
        regex:
          /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/gi,
      },
      {
        platform: "instagram",
        regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi,
      },
      {
        platform: "facebook",
        regex: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9.]+/gi,
      },
      {
        platform: "linkedin",
        regex:
          /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/gi,
      },
      {
        platform: "tiktok",
        regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+/gi,
      },
    ];

    const links = [];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern.regex);
      for (const match of matches) {
        links.push({
          platform: pattern.platform,
          url: match[0],
        });
      }
    }

    return links;
  }

  extractWebsite(text) {
    if (!text) return null;

    const urlRegex =
      /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\/[^\s]*)?/g;
    const matches = text.match(urlRegex);

    if (!matches) return null;

    const blacklist = [
      "youtube.com",
      "instagram.com",
      "twitter.com",
      "facebook.com",
      "tiktok.com",
    ];

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
      const response = await this.requestPage({
        url: websiteUrl,
        method: "get",
        responseType: "text",
        timeout: 10000,
      });

      const text = response.data;
      const emails = this.extractEmails(text);
      const phones = this.extractPhoneNumbers(text);

      return { emails, phones };
    } catch (error) {
      return { emails: [], phones: [] };
    }
  }

  async reset() {
    this.logger.warning("⚠️ Resetting scraper");

    this.currentTask = null;
    this.status = "idle";
    this.lastActive = new Date();
    this.consecutiveFails = 0;

    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(
        this.currentKeyIndex,
        this.instanceId,
        false,
        true,
      );
      this.currentKeyIndex = null;
      this.currentKey = null;
    }

    await ScraperInstance.updateOne(
      { instanceId: this.instanceId },
      {
        status: "idle",
        currentTaskId: null,
        lastActive: new Date(),
      },
    );
  }

  async stop() {
    this.logger.info("🛑 Stopping scraper");
    this.status = "stopped";

    if (this.currentTask) {
      await Queue.updateOne(
        { _id: this.currentTask._id },
        {
          status: "pending",
          assignedTo: null,
        },
      );
      this.currentTask = null;
    }

    if (this.currentKeyIndex !== null) {
      this.manager.releaseKey(
        this.currentKeyIndex,
        this.instanceId,
        false,
        true,
      );
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
app.use(
  cors({
    origin: ["http://localhost:5173", "https://frolicking-beignet-8fedff.netlify.app"],
    credentials: true,
  }),
);

// ==================== API ROUTES ====================

// Countries list
app.get("/api/countries", (req, res) => {
  const countries = [
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "IN", name: "India" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
  ];
  res.json(countries);
});

// Start scrape task - NOW ACCEPTS KEYWORDS FROM FRONTEND
app.post("/api/scrape", async (req, res) => {
  try {
    const {
      keywords, // ← Frontend se keywords aayenge
      count = 10000,
      countryCode,
      minSubscribers = 20000,
      includeRelated = true,
      relatedDepth = 2,
      enrichKeywords = true,
    } = req.body;

    // Default keywords agar frontend se nahi aaye
    const defaultKeywords = [
      "business coach",
      "marketing agency",
      "real estate investing",
      "fitness coach online",
      "financial advisor",
      "startup founder",
      "sales consultant",
      "personal branding expert",
    ];

    const keywordsToUse = (keywords && keywords.length > 0) ? keywords : defaultKeywords;

    const task = new Queue({
      task: "scrape_channels",
      data: {
        keywords: keywordsToUse, // ← Frontend ke keywords use honge
        count: Math.min(count, 50000),
        countryCode: countryCode || null,
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
      keywords: keywordsToUse.length,
      keywordList: keywordsToUse.slice(0, 5),
    });

    res.json({
      message: "Task queued successfully",
      taskId: task._id,
      keywords: keywordsToUse,
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

    if (minSubscribers)
      query.subscriberCount = { $gte: parseInt(minSubscribers) };
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

    const todayChannels = await Channel.countDocuments({
      scrapedAt: { $gte: today },
    });
    const channelsWithEmails = await Channel.countDocuments({
      hasEmails: true,
    });

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
      saveRate:
        totalChannels > 0
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
      [
        "Title",
        "Channel ID",
        "Subscribers",
        "Videos",
        "Emails",
        "Website",
        "Quality Score",
        "Country",
        "Scraped At",
      ].join(","),
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
        ].join(","),
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=channels-${new Date().toISOString().split("T")[0]}.csv`,
    );
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
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    ollama: ollamaAvailable ? "connected" : "disconnected",
  });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`🚀 Multi-Scraper System running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? "ON" : "OFF"}`);
  
  // Initialize Ollama first
  await initOllama();
  
  console.log(`📊 Features:`);
  console.log(`   - Keywords from frontend request`);
  console.log(`   - Global Key Pool with 150 keys`);
  console.log(`   - Multiple parallel scrapers`);
  console.log(`   - Ollama AI: ${ollamaAvailable ? "✅ Connected" : "❌ Fallback mode"}`);
  console.log(`   - Auto key rotation on quota exceed`);

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