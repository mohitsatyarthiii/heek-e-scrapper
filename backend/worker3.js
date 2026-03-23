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

dotenv.config();

// Debug mode
const DEBUG = process.env.DEBUG === "true" || true;

// MongoDB connection
const mongoURI =
  "mongodb+srv://mohitsatyarthi11_db_user:fGH17FphUoWt0B3X@cluster0.jmyra5z.mongodb.net/?appName=Cluster0";
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
  preferredKeyIndices: [{ type: Number }], // Preferred keys for this scraper
  totalKeysAssigned: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  channelsScraped: { type: Number, default: 0 },
  emailsFound: { type: Number, default: 0 },
  startedAt: { type: Date },
  lastActive: { type: Date, default: Date.now },
});

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
    saveOnlyWithEmails: { type: Boolean, default: true }, // Sirf emails wale save
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

const Log = mongoose.model("Log", logSchema);

// Channel Schema - Sirf emails wale save honge
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
  emails: [{ type: String }], // Sirf emails store honge
  phoneNumbers: [{ type: String }], // Optional store
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
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  savedReason: { type: String, default: "emails" },
  sourceType: { type: String, default: "search" },
  discoveryDepth: { type: Number, default: 0 },
  scrapedBy: { type: String },
});

const Channel = mongoose.model("Channel", channelSchema);

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

    // Start quota reset checker
    setInterval(() => this.checkAndResetQuota(), 60 * 60 * 1000); // Every hour
  }

  // Get best available key
  getAvailableKey(scraperId, preferredIndices = []) {
    // First try preferred keys
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

    // Then try any available key
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

    // Sort by least failures and oldest used
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

  // Release key back to pool
  releaseKey(index, scraperId, quotaExceeded = false, failed = false) {
    const status = this.keyStatus.get(index);
    if (status && status.assignedTo === scraperId) {
      status.inUse = false;
      status.assignedTo = null;

      if (quotaExceeded) {
        status.quotaExceeded = true;
        status.failCount = (status.failCount || 0) + 1;

        // Auto reset after 1 hour
        setTimeout(
          () => {
            status.quotaExceeded = false;
            this.systemLogger.info(
              `🔄 Key ${index + 1} quota reset after timeout`,
            );
          },
          60 * 60 * 1000,
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

  // Check and reset quota for keys
  checkAndResetQuota() {
    const now = Date.now();
    for (let i = 0; i < this.allKeys.length; i++) {
      const status = this.keyStatus.get(i);
      if (status.quotaExceeded) {
        // Reset if more than 1 hour has passed
        if (
          status.lastUsed &&
          now - status.lastUsed.getTime() > 60 * 60 * 1000
        ) {
          status.quotaExceeded = false;
          this.systemLogger.info(`🔄 Auto-reset quota for key ${i + 1}`);
        }
      }
    }
  }

  // Get key statistics
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

  info(
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
    return this.log("info", message, details, taskId, channelId, scraperId);
  }

  success(
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
    return this.log("success", message, details, taskId, channelId, scraperId);
  }

  warning(
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
    return this.log("warning", message, details, taskId, channelId, scraperId);
  }

  error(
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
    return this.log("error", message, details, taskId, channelId, scraperId);
  }

  debug(
    message,
    details = {},
    taskId = null,
    channelId = null,
    scraperId = null,
  ) {
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
    this.maxConcurrentScrapers = 15; // Max parallel scrapers
    this.systemLogger = new Logger("manager");
  }

  // Initialize with API keys
  async initialize() {
    // Load all API keys from environment (supporting up to 150 keys)
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

    // Initialize global key pool
    this.keyPool.initialize(this.apiKeys);

    this.systemLogger.success(
      `✅ Loaded ${this.apiKeys.length} YouTube API keys`,
    );

    // Create preferred key groups (5 keys per scraper ideally)
    await this.createKeyGroups();

    // Load existing scrapers or create default ones
    await this.loadOrCreateScrapers();

    this.initialized = true;
    this.systemLogger.success(
      `🚀 Scraper Manager initialized with ${this.scrapers.size} scrapers`,
    );

    // Start task assignment loop
    this.startAssignmentLoop();

    // Start health check loop
    this.startHealthCheckLoop();
  }

  // Create preferred key groups
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

  // Load existing scrapers or create default ones
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
      // Create scrapers based on key groups
      for (let i = 0; i < this.keyGroups.length; i++) {
        await this.createScraper(`Scraper-${i + 1}`, this.keyGroups[i]);
      }
      this.systemLogger.info(
        `🆕 Created ${this.keyGroups.length} new scrapers`,
      );
    }
  }

  // Create a new scraper instance
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
      `✅ Created new scraper: ${name} with ${preferredKeyIndices.length} preferred keys`,
    );

    return scraper;
  }

  // Get available key from global pool
  getKeyForScraper(scraperId, preferredIndices) {
    return this.keyPool.getAvailableKey(scraperId, preferredIndices);
  }

  // Release key back to pool
  releaseKey(index, scraperId, quotaExceeded = false, failed = false) {
    this.keyPool.releaseKey(index, scraperId, quotaExceeded, failed);
  }

  // Get available scraper
  getAvailableScraper() {
    for (const [instanceId, scraper] of this.scrapers) {
      if (scraper.isAvailable()) {
        return scraper;
      }
    }
    return null;
  }

  // Assign task to scraper
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

  // Start task assignment loop
  startAssignmentLoop() {
    setInterval(async () => {
      try {
        if (!this.initialized) return;

        const pendingTasks = await Queue.find({
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
        });
      }
    }, 3000); // Check every 3 seconds
  }

  // Start health check loop
  startHealthCheckLoop() {
    setInterval(async () => {
      try {
        for (const [instanceId, scraper] of this.scrapers) {
          const health = scraper.getHealth();

          if (health.status === "busy" && health.lastActive) {
            const inactiveTime =
              Date.now() - new Date(health.lastActive).getTime();

            if (inactiveTime > 10 * 60 * 1000) {
              // 10 minutes
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
        });
      }
    }, 30000);
  }

  // Handle task completion
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

  // Handle task failure
  async handleTaskFailure(taskId, scraperId, error) {
    const task = await Queue.findById(taskId);
    if (!task) return;

    task.status = "failed";
    task.error = error.message;
    task.retryCount = (task.retryCount || 0) + 1;

    if (task.retryCount < 3) {
      task.status = "pending";
      task.assignedTo = null;
      await this.systemLogger.info(
        `🔄 Task ${taskId} will be retried (attempt ${task.retryCount + 1})`,
      );
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

  // Get manager status
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
      tasks: {
        pending: await Queue.countDocuments({ status: "pending" }),
        assigned: await Queue.countDocuments({ status: "assigned" }),
        processing: await Queue.countDocuments({ status: "processing" }),
        completed: await Queue.countDocuments({ status: "completed" }),
        failed: await Queue.countDocuments({ status: "failed" }),
      },
    };
  }

  // Stop a scraper
  async stopScraper(instanceId) {
    const scraper = this.scrapers.get(instanceId);
    if (!scraper) return false;

    await scraper.stop();

    await ScraperInstance.updateOne({ instanceId }, { status: "stopped" });

    return true;
  }

  // Start a stopped scraper
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

    // Current key being used
    this.currentKeyIndex = null;
    this.currentKey = null;
    this.consecutiveFails = 0;
  }

  isAvailable() {
    return this.status === "idle";
  }

  async assignTask(task) {
    this.currentTask = task;
    this.status = "busy";
    this.lastActive = new Date();
    this.consecutiveFails = 0;

    await ScraperInstance.updateOne(
      { instanceId: this.instanceId },
      {
        status: "busy",
        currentTaskId: task._id,
        lastActive: new Date(),
      },
    );

    // Process task in background
    this.processTask(task).catch((error) => {
      this.logger.error("Error processing task", { error: error.message });
    });
  }

  // Get a key from global pool with retry
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

      // No keys available, wait and retry
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

  // Release current key
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

  // Get YouTube client with automatic key management
  async getYouTubeClient() {
    // Release previous key if any
    this.releaseKey(false, this.consecutiveFails > 3);

    // Get new key
    const key = await this.getKey();

    return google.youtube({
      version: "v3",
      auth: key,
    });
  }

  async processTask(task) {
    try {
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

      // Process the task
      const stats = await this.scrapeChannels(task);

      // Release key
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

      // Release key with failure flag
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

  // Main scraping function - SIRF EMAILS WALE CHANNELS SAVE HONGE
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

    // Enrich keywords if enabled
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
      "🚀 Starting scrape - SIRF EMAILS WALE CHANNELS SAVE HONGE",
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

    // Phase 1: Search for channels
    for (const keyword of searchKeywords) {
      if (savedChannels >= maxResults) break;

      let pageToken = null;
      let pageCount = 0;

      while (savedChannels < maxResults && pageCount < 10) {
        try {
          const youtube = await this.getYouTubeClient();

          const searchParams = {
            part: "snippet",
            q: keyword,
            type: "channel",
            maxResults: 50,
            order: "relevance",
            pageToken: pageToken,
          };

          if (countryCode) {
            searchParams.regionCode = countryCode;
          }

          const searchResponse = await youtube.search.list(searchParams);
          pageCount++;

          if (
            !searchResponse.data.items ||
            searchResponse.data.items.length === 0
          )
            break;

          for (const item of searchResponse.data.items) {
            if (savedChannels >= maxResults) break;

            const channelId = item.snippet.channelId;

            if (processedChannels.has(channelId)) {
              skippedChannels++;
              continue;
            }

            processedChannels.add(channelId);
            totalChannels++;

            // Get full channel details
            const channelResponse = await youtube.channels.list({
              part: "snippet,statistics",
              id: channelId,
            });

            const channelData = channelResponse.data.items?.[0];
            if (!channelData) {
              skippedChannels++;
              continue;
            }

            const result = await this.processChannel(
              channelData,
              {
                keywords: [keyword],
                sourceType: "search",
                discoveryDepth: 0,
              },
              taskId,
            );

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
            } else {
              skippedChannels++;
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          pageToken = searchResponse.data.nextPageToken;
          if (!pageToken) break;
        } catch (error) {
          await this.logger.error(
            `Error searching keyword "${keyword}"`,
            { error: error.message },
            taskId,
          );

          if (error.code === 403) {
            // Quota exceeded, release key with quota flag
            this.releaseKey(true, false);
          } else {
            // Other error, release with failure flag
            this.releaseKey(false, true);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // Phase 2: Discover related channels
    if (includeRelated && channelQueue.length > 0) {
      await this.logger.info(
        "🔗 Discovering related channels",
        {
          queueSize: channelQueue.length,
          maxDepth: relatedDepth,
        },
        taskId,
      );

      let queueIndex = 0;
      while (queueIndex < channelQueue.length && savedChannels < maxResults) {
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

          for (const rel of related) {
            if (
              processedChannels.has(rel.channelId) ||
              savedChannels >= maxResults
            )
              continue;

            processedChannels.add(rel.channelId);
            totalChannels++;

            const channelResponse = await youtube.channels.list({
              part: "snippet,statistics",
              id: rel.channelId,
            });

            const channelData = channelResponse.data.items?.[0];
            if (!channelData) {
              skippedChannels++;
              continue;
            }

            const result = await this.processChannel(
              channelData,
              {
                sourceType: rel.sourceType,
                sourceChannel: rel.sourceChannel,
                discoveryDepth: rel.discoveryDepth,
              },
              taskId,
            );

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

            await new Promise((resolve) => setTimeout(resolve, 50));
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

  // Enrich keywords
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
            const response = await axios.get(url, { timeout: 5000 });
            if (response.data && Array.isArray(response.data[1])) {
              response.data[1].forEach((suggestion) => {
                enriched.add(suggestion);
              });
            }
          } catch (e) {}
        }

        // Add common variations
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

  // Process single channel - SIRF EMAILS HOGE TO SAVE KAREGA
  async processChannel(channelData, sourceInfo = {}, taskId = null) {
    const channelId = channelData.id || channelData.channelId;

    // Check if already exists
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

      const description = snippet.description || "";

      // SIRF EMAILS EXTRACT KARO
      let emails = this.extractEmails(description);

      // Agar emails nahi mile to skip
      if (emails.length === 0) {
        await this.logger.debug(
          `⏭️ Skipping - no emails found`,
          {
            channelId,
            title: snippet.title,
          },
          taskId,
          channelId,
        );

        return { saved: false, skipped: true, reason: "no_emails" };
      }

      // Phones bhi nikaalo (optional)
      let phones = this.extractPhoneNumbers(description);
      let socialLinks = this.extractSocialLinks(description);
      let websiteUrl = this.extractWebsite(description);

      // Website se bhi emails dhundho
      if (websiteUrl) {
        const websiteData = await this.scrapeWebsiteForContacts(websiteUrl);
        emails = [...new Set([...emails, ...websiteData.emails])];
        phones = [...new Set([...phones, ...websiteData.phones])];
      }

      // Linktree waghera se bhi emails
      const bioLinks = socialLinks.filter(
        (s) => s.url.includes("linktr.ee") || s.url.includes("bio.link"),
      );

      for (const bioLink of bioLinks) {
        try {
          const bioResponse = await axios.get(bioLink.url, { timeout: 5000 });
          const bioEmails = this.extractEmails(bioResponse.data);
          emails = [...new Set([...emails, ...bioEmails])];
        } catch (e) {}
      }

      const engagementRate =
        videoCount > 0 ? viewCount / videoCount / (subscriberCount || 1) : 0;

      // Quality score calculate
      let qualityScore = 0;
      if (subscriberCount >= 100000) qualityScore += 30;
      else if (subscriberCount >= 50000) qualityScore += 25;
      else if (subscriberCount >= 10000) qualityScore += 20;
      else if (subscriberCount >= 1000) qualityScore += 10;

      if (videoCount >= 500) qualityScore += 20;
      else if (videoCount >= 200) qualityScore += 15;
      else if (videoCount >= 100) qualityScore += 10;

      if (engagementRate >= 0.5) qualityScore += 30;
      else if (engagementRate >= 0.3) qualityScore += 20;
      else if (engagementRate >= 0.1) qualityScore += 10;

      qualityScore += Math.min(emails.length * 5, 25); // Har email ke liye points

      // Channel save karo
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
          hasEmail: true,
          hasPhone: phones.length > 0,
          hasSocial: socialLinks.length > 0,
          hasWebsite: !!websiteUrl,
        },
        engagement: {
          avgViewsPerVideo: videoCount > 0 ? viewCount / videoCount : 0,
          engagementRate,
        },
        qualityScore,
        lastUpdated: new Date(),
        hasEmails: true,
        savedReason: "emails",
        sourceType: sourceInfo.sourceType || "search",
        discoveryDepth: sourceInfo.discoveryDepth || 0,
        scrapedBy: this.instanceId,
      });

      await channel.save();

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

  // Get related channels
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

        // Get commenters
        try {
          const commentsResponse = await youtube.commentThreads.list({
            part: "snippet",
            videoId: videoId,
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

        // Get related videos' channels
        try {
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

    // Remove duplicates
    const unique = {};
    relatedChannels.forEach((c) => (unique[c.channelId] = c));

    return Object.values(unique);
  }

  // Email extraction function
 extractEmails(text) {
    if (!text || typeof text !== "string") return [];

    // Normalize text - fix common obfuscations
    let normalizedText = text
      .replace(/\[at\]|\(at\)|\{at\}|<at>|\bat\b/gi, "@")
      .replace(/\[dot\]|\(dot\)|\{dot\}|<dot>|\bdot\b/gi, ".")
      .replace(/\s+@\s+/g, "@")
      .replace(/\s+\.\s+/g, ".")
      .replace(/&#64;/g, "@")
      .replace(/&#46;/g, ".")
      .replace(/&commat;/g, "@")
      .replace(/&period;/g, ".")
      .replace(/\[at\]/gi, "@")
      .replace(/\(at\)/gi, "@")
      .replace(/\[dot\]/gi, ".")
      .replace(/\(dot\)/gi, ".")
      .replace(/ at /gi, "@")
      .replace(/ dot /gi, ".")
      .replace(/e-mail|email|mail|contact|📧|✉️/gi, " ");

    // Improved email pattern - matches ALL valid email formats
    const emailPatterns = [
      // Standard email pattern
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      
      // Emails with spaces (common obfuscation)
      /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/g,
      
      // Common business emails
      /\b(info|contact|support|sales|hello|help|business|marketing|media|press|admin|enquiries|office|team|careers|jobs|hr|partners|sponsorship|collab|collaboration|partnership|sponsor|advertising|ads|pr|inquiry|bookings|management|director|ceo|founder|owner|manager|work|mail|email|contactus)[@\s@]+[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
      
      // Gmail specific pattern (fixed - now captures gmail.com properly)
      /\b[A-Za-z0-9._%+-]+@gmail\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@yahoo\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@outlook\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@hotmail\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@protonmail\.com\b/gi,
      /\b[A-Za-z0-9._%+-]+@icloud\.com\b/gi,
      
      // Pattern for emails in URLs (like mailto:)
      /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/gi,
      
      // Pattern for emails in quotes
      /"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})"/gi,
      
      // Pattern for emails in parentheses
      /\(([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\)/gi,
    ];

    let allEmails = new Set();

    for (const pattern of emailPatterns) {
      const matches = normalizedText.match(pattern) || [];
      matches.forEach((email) => {
        // Clean up the email
        let cleaned = email
          .replace(/\s+/g, "")
          .replace(/^mailto:/i, "")
          .replace(/["()]/g, "")
          .toLowerCase()
          .trim();

        // Validate email format
        if (this.isValidEmail(cleaned)) {
          allEmails.add(cleaned);
        }
      });
    }

    return Array.from(allEmails);
  }

  // Email validation function
  isValidEmail(email) {
    if (!email) return false;
    
    // Basic email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) return false;
    
    // Reject obviously fake emails
    const invalidDomains = [
      'example.com', 'test.com', 'domain.com', 'yourdomain.com',
      'email.com', 'mail.com', 'address.com', 'website.com'
    ];
    
    const domain = email.split('@')[1];
    if (invalidDomains.includes(domain)) return false;
    
    // Check domain has at least one dot
    if (!domain.includes('.')) return false;
    
    // Reject emails with consecutive dots
    if (email.includes('..')) return false;
    
    // Reject emails with invalid characters
    if (/[^a-zA-Z0-9._%+-@]/.test(email)) return false;
    
    return true;
  }
  // Phone extraction
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

  // Social links extraction
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

  // Website extraction
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

  // Scrape website for contacts
  async scrapeWebsiteForContacts(websiteUrl) {
    if (!websiteUrl) return { emails: [], phones: [] };

    try {
      const response = await axios.get(websiteUrl, {
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const text = response.data;
      const emails = this.extractEmails(text);
      const phones = this.extractPhoneNumbers(text);

      return { emails, phones };
    } catch (error) {
      return { emails: [], phones: [] };
    }
  }

  // Reset scraper
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

  // Stop scraper
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

  // Start scraper
  async start() {
    this.logger.info("▶️ Starting scraper");
    this.status = "idle";
  }

  // Get scraper health
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

  // Complete task
  async completeTask(stats) {
    this.tasksCompleted++;
    this.channelsScraped += stats.channelsSaved || 0;
    this.emailsFound += stats.emailsFound || 0;
    this.lastActive = new Date();
    this.consecutiveFails = 0;
  }

  // Fail task
  async failTask() {
    this.lastActive = new Date();
  }
}

// ==================== EXPRESS SETUP ====================

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://frolicking-beignet-8fedff.netlify.app",
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
    origin: "https://frolicking-beignet-8fedff.netlify.app",
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

// Start scrape task
app.post("/api/scrape", async (req, res) => {
  try {
    const {
      keywords,
      count = 10000,
      countryCode,
      minSubscribers = 1000,
      includeRelated = true,
      relatedDepth = 2,
      enrichKeywords = true,
    } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "Valid keywords array required" });
    }

    const task = new Queue({
      task: "scrape_channels",
      data: {
        keywords: keywords.slice(0, 20),
        count: Math.min(count, 50000),
        countryCode: countryCode || null,
        minSubscribers: parseInt(minSubscribers),
        includeRelated,
        relatedDepth: parseInt(relatedDepth),
        enrichKeywords,
        saveOnlyWithEmails: true, 
      },
    });

    await task.save();
    await apiLogger.success(`✅ New task queued`, {
      taskId: task._id,
      keywords: keywords.length,
    });

    res.json({
      message:
        "Task queued successfully",
      taskId: task._id,
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

// Get channels - SIRF EMAILS WALE
app.get("/api/channels", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
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
  });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`🚀 Multi-Scraper System running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? "ON" : "OFF"}`);
  console.log(`📊 Features:`);
  console.log(
    `   - Global Key Pool with ${(await scraperManager.apiKeys?.length) || "?"} keys`,
  );
  console.log(`   - Dynamic key allocation - koi bhi key kaam karegi`);
  console.log(`   - Multiple parallel scrapers`);
  console.log(`   - 🔴 SIRF EMAILS WALE CHANNELS SAVE HONGE`);
  console.log(`   - Auto key rotation on quota exceed`);
  console.log(`   - Smart task distribution`);

  await scraperManager.initialize();

  console.log(
    `\n✅ System ready! Maximum ${scraperManager.maxConcurrentScrapers} parallel scrapers`,
  );
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
