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
  "mongodb+srv://mohitsatyarthi11_db_user:QRru60sn0yOznetN@cluster0.e8jcgej.mongodb.net/?appName=Cluster0";
mongoose
  .connect(mongoURI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
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
    minSubscribers: { type: Number, default: 100 },
    minEngagement: { type: Number, default: 0 },
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

// Channel Schema with unique constraint to prevent duplicates
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
  emails: [{ type: String, index: true }],
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
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  savedReason: { type: String, default: "emails" },
  sourceType: { type: String, default: "search" },
  discoveryDepth: { type: Number, default: 0 },
  scrapedBy: { type: String },
});

// Add compound index for faster duplicate checking
channelSchema.index({ channelId: 1 }, { unique: true });

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

    setInterval(() => this.checkAndResetQuota(), 60 * 60 * 1000);
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

  checkAndResetQuota() {
    const now = Date.now();
    for (let i = 0; i < this.allKeys.length; i++) {
      const status = this.keyStatus.get(i);
      if (status.quotaExceeded) {
        if (
          status.lastUsed &&
          now - status.lastUsed.getTime() > 60 * 60 * 1000
        ) {
          status.quotaExceeded = false;
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
    ].filter((key) => key && key !== "YOUR_API_KEY_1" && key !== "YOUR_API_KEY_2");

    if (this.apiKeys.length === 0) {
      this.systemLogger.error("❌ No valid YouTube API keys found");
      process.exit(1);
    }

    this.keyPool.initialize(this.apiKeys);
    this.systemLogger.success(`✅ Loaded ${this.apiKeys.length} YouTube API keys`);

    await this.createKeyGroups();
    await this.loadOrCreateScrapers();

    this.initialized = true;
    this.systemLogger.success(`🚀 Scraper Manager initialized with ${this.scrapers.size} scrapers`);

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
    } else {
      for (let i = 0; i < this.keyGroups.length; i++) {
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

    const scraperWorker = new ScraperWorker(
      instanceId,
      preferredKeyIndices,
      this,
    );
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

    if (!scraper) {
      return false;
    }

    task.status = "assigned";
    task.assignedTo = scraper.instanceId;
    task.assignedAt = new Date();
    await task.save();

    await scraper.assignTask(task);
    return true;
  }

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
    this.channelCache = new Map(); // Cache for quick duplicate check
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
        return keyInfo.key;
      }

      if (attempt < maxAttempts) {
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

  async processTask(task) {
    try {
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

  // IMPROVED EMAIL EXTRACTION - FIXED gmail.com issue
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

  // IMPROVED PHONE EXTRACTION
  extractPhoneNumbers(text) {
    if (!text || typeof text !== "string") return [];

    const patterns = [
      // International format: +1-234-567-8900
      /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
      
      // US format with country code: +1 (234) 567-8900
      /\+\d{1,3}\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      
      // Standard US format: (234) 567-8900 or 234-567-8900
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      
      // Simple digit pattern for 10-digit numbers
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      
      // WhatsApp pattern
      /whatsapp[:\s]*[+]?[\d\s()-]{10,20}/gi,
      
      // Phone with extension
      /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\s*(?:ext|x)\s*\d+/gi,
    ];

    let allPhones = [];

    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        // Clean phone number - keep only digits and plus
        let cleaned = match.replace(/[^\d+]/g, '');
        
        // Only keep if has at least 7 digits and starts with valid country code or digit
        if (cleaned.length >= 7 && cleaned.length <= 15) {
          allPhones.push(cleaned);
        }
      });
    }

    return [...new Set(allPhones)];
  }

  // IMPROVED SOCIAL LINKS EXTRACTION
  extractSocialLinks(text) {
    if (!text) return [];

    const patterns = [
      {
        platform: "twitter",
        regex: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/gi,
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
        regex: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+/gi,
      },
      {
        platform: "tiktok",
        regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+/gi,
      },
      {
        platform: "youtube",
        regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|channel|user)\/[a-zA-Z0-9_-]+/gi,
      },
      {
        platform: "discord",
        regex: /(?:https?:\/\/)?discord\.(?:com|gg)\/[a-zA-Z0-9_-]+/gi,
      },
      {
        platform: "telegram",
        regex: /(?:https?:\/\/)?t\.me\/[a-zA-Z0-9_]+/gi,
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

  // IMPROVED WEBSITE EXTRACTION
  extractWebsite(text) {
    if (!text) return null;

    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\/[^\s]*)?/g;
    const matches = text.match(urlRegex);

    if (!matches) return null;

    const blacklist = [
      "youtube.com", "youtu.be",
      "instagram.com", "instagr.am",
      "twitter.com", "x.com",
      "facebook.com", "fb.com",
      "tiktok.com",
      "linkedin.com",
      "discord.com", "discord.gg",
      "t.me", "telegram.org",
      "whatsapp.com",
      "gmail.com", "yahoo.com", "outlook.com", "hotmail.com"
    ];

    for (const match of matches) {
      const url = match.startsWith("http") ? match : "https://" + match;
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        
        // Skip blacklisted domains
        let isBlacklisted = false;
        for (const black of blacklist) {
          if (domain === black || domain.endsWith("." + black)) {
            isBlacklisted = true;
            break;
          }
        }
        
        if (!isBlacklisted && domain.includes(".")) {
          return url;
        }
      } catch {}
    }

    return null;
  }

  // IMPROVED WEBSITE SCRAPING
  async scrapeWebsiteForContacts(websiteUrl) {
    if (!websiteUrl) return { emails: [], phones: [] };

    try {
      const response = await axios.get(websiteUrl, {
        timeout: 8000,
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        maxRedirects: 5
      });

      const text = response.data;
      const emails = this.extractEmails(text);
      const phones = this.extractPhoneNumbers(text);
      
      // Also look in contact page if exists
      let contactEmails = [];
      try {
        const contactUrls = ['/contact', '/contact-us', '/about', '/about-us', '/contactus'];
        for (const contactPath of contactUrls) {
          try {
            const contactUrl = websiteUrl.replace(/\/$/, '') + contactPath;
            const contactResponse = await axios.get(contactUrl, {
              timeout: 5000,
              headers: { "User-Agent": "Mozilla/5.0" }
            });
            const contactEmailsFound = this.extractEmails(contactResponse.data);
            contactEmails.push(...contactEmailsFound);
          } catch (e) {}
        }
      } catch (e) {}
      
      const allEmails = [...new Set([...emails, ...contactEmails])];
      const allPhones = [...new Set([...phones])];
      
      return { emails: allEmails, phones: allPhones };
    } catch (error) {
      return { emails: [], phones: [] };
    }
  }

  // SKIP REDUCTION STRATEGY - Try harder to find emails before skipping
  async aggressiveEmailSearch(description, channelId, taskId) {
    let emails = [];
    
    // First, extract from description
    emails = this.extractEmails(description);
    
    // If no emails, try to find website and scrape it
    if (emails.length === 0) {
      const website = this.extractWebsite(description);
      if (website) {
        const scrapedData = await this.scrapeWebsiteForContacts(website);
        emails = scrapedData.emails;
        
        if (emails.length > 0) {
          await this.logger.debug(`Found ${emails.length} emails from website: ${website}`, {}, taskId, channelId);
        }
      }
    }
    
    // If still no emails, try to find social links and check their bios
    if (emails.length === 0) {
      const socialLinks = this.extractSocialLinks(description);
      
      for (const social of socialLinks) {
        if (social.platform === 'instagram' || social.platform === 'twitter') {
          try {
            // Try to fetch profile page and extract email
            const response = await axios.get(social.url, {
              timeout: 5000,
              headers: { "User-Agent": "Mozilla/5.0" }
            });
            const socialEmails = this.extractEmails(response.data);
            emails.push(...socialEmails);
            
            if (socialEmails.length > 0) {
              await this.logger.debug(`Found ${socialEmails.length} emails from ${social.platform}`, {}, taskId, channelId);
              break;
            }
          } catch (e) {}
        }
      }
    }
    
    return [...new Set(emails)];
  }

  async processChannel(channelData, sourceInfo = {}, taskId = null) {
    const channelId = channelData.id || channelData.channelId;
    
    // Quick duplicate check - prevents API waste
    const existing = await Channel.findOne({ channelId });
    if (existing && existing.emails && existing.emails.length > 0) {
      // Already have emails for this channel
      return { saved: false, skipped: true, reason: "exists_with_emails" };
    }
    
    if (existing && !existing.emails?.length) {
      // Channel exists but no emails - try to update with new emails
      const snippet = channelData.snippet;
      const description = snippet?.description || "";
      
      const newEmails = await this.aggressiveEmailSearch(description, channelId, taskId);
      
      if (newEmails.length > 0) {
        existing.emails = newEmails;
        existing.hasEmails = true;
        existing.lastUpdated = new Date();
        existing.scrapedBy = this.instanceId;
        await existing.save();
        
        await this.logger.success(`UPDATED: "${snippet?.title}" with ${newEmails.length} new emails`, {}, taskId, channelId);
        return { saved: true, updated: true, channel: existing, emails: newEmails.length };
      }
      return { saved: false, skipped: true, reason: "no_emails_after_update" };
    }
    
    try {
      const snippet = channelData.snippet;
      const statistics = channelData.statistics || {};
      
      const subscriberCount = parseInt(statistics.subscriberCount || 0);
      const videoCount = parseInt(statistics.videoCount || 0);
      const viewCount = parseInt(statistics.viewCount || 0);
      const description = snippet?.description || "";
      
      // AGGRESSIVE EMAIL SEARCH - Try everything before skipping
      let emails = await this.aggressiveEmailSearch(description, channelId, taskId);
      
      // If still no emails after aggressive search, SKIP
      if (emails.length === 0) {
        await this.logger.debug(`⏭️ SKIPPED - No emails found after aggressive search`, {
          channelId,
          title: snippet?.title,
          subscribers: subscriberCount
        }, taskId, channelId);
        
        return { saved: false, skipped: true, reason: "no_emails_after_aggressive_search" };
      }
      
      // Found emails! Continue with channel save
      let phones = this.extractPhoneNumbers(description);
      let socialLinks = this.extractSocialLinks(description);
      let websiteUrl = this.extractWebsite(description);
      
      // Calculate engagement metrics
      const avgViewsPerVideo = videoCount > 0 ? viewCount / videoCount : 0;
      const engagementRate = videoCount > 0 && subscriberCount > 0 
        ? (viewCount / videoCount) / subscriberCount 
        : 0;
      
      // Calculate quality score - prioritize channels with more emails
      let qualityScore = 0;
      if (subscriberCount >= 100000) qualityScore += 30;
      else if (subscriberCount >= 50000) qualityScore += 25;
      else if (subscriberCount >= 10000) qualityScore += 20;
      else if (subscriberCount >= 1000) qualityScore += 15;
      else if (subscriberCount >= 100) qualityScore += 5;
      
      if (videoCount >= 500) qualityScore += 20;
      else if (videoCount >= 200) qualityScore += 15;
      else if (videoCount >= 100) qualityScore += 10;
      else if (videoCount >= 20) qualityScore += 5;
      
      if (engagementRate >= 0.5) qualityScore += 30;
      else if (engagementRate >= 0.3) qualityScore += 20;
      else if (engagementRate >= 0.1) qualityScore += 10;
      else if (engagementRate >= 0.05) qualityScore += 5;
      
      // Bonus for each email found
      qualityScore += Math.min(emails.length * 5, 25);
      
      // Save channel
      const channel = new Channel({
        channelId,
        title: snippet?.title || "Unknown",
        description: description.substring(0, 2000),
        subscriberCount,
        videoCount,
        viewCount,
        publishedAt: snippet?.publishedAt ? new Date(snippet.publishedAt) : new Date(),
        country: snippet?.country,
        customUrl: snippet?.customUrl,
        thumbnailUrl: snippet?.thumbnails?.default?.url,
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
          avgViewsPerVideo,
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
      
      await this.logger.success(`✅ SAVED: "${snippet?.title}" with ${emails.length} emails | Subscribers: ${subscriberCount.toLocaleString()} | Score: ${qualityScore}`, {
        emails: emails,
        subscribers: subscriberCount,
        qualityScore
      }, taskId, channelId);
      
      return {
        saved: true,
        channel,
        emails: emails.length,
        phones: phones.length,
        qualityScore,
      };
    } catch (error) {
      await this.logger.error("Error processing channel", { channelId, error: error.message }, taskId);
      return { saved: false, error: error.message };
    }
  }

  async getRelatedChannels(youtube, channelId, depth = 0, maxDepth = 2, taskId = null) {
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

        try {
          const commentsResponse = await youtube.commentThreads.list({
            part: "snippet",
            videoId: videoId,
            maxResults: 30,
          });

          if (commentsResponse.data.items) {
            for (const comment of commentsResponse.data.items) {
              const authorChannelId = comment.snippet.topLevelComment.snippet.authorChannelId?.value;
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
      await this.logger.error("Error getting related channels", { channelId, error: error.message }, taskId);
    }

    const unique = {};
    relatedChannels.forEach((c) => (unique[c.channelId] = c));
    return Object.values(unique);
  }

  async enrichKeywords(baseKeywords) {
    const enriched = new Set();
    
    for (const keyword of baseKeywords) {
      enriched.add(keyword);
      
      // Add common variations
      enriched.add(keyword + " tutorial");
      enriched.add(keyword + " review");
      enriched.add(keyword + " guide");
      enriched.add(keyword + " how to");
      enriched.add("learn " + keyword);
      enriched.add("best " + keyword);
      enriched.add("top " + keyword);
      
      // Try Google autocomplete
      try {
        const autocompleteUrls = [
          `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(keyword)}`,
          `http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`,
        ];
        
        for (const url of autocompleteUrls) {
          try {
            const response = await axios.get(url, { timeout: 3000 });
            if (response.data && Array.isArray(response.data[1])) {
              response.data[1].forEach((suggestion) => {
                enriched.add(suggestion);
              });
            }
          } catch (e) {}
        }
      } catch (error) {}
    }
    
    return Array.from(enriched).slice(0, 50);
  }

  async scrapeChannels(task) {
    const options = task.data;
    const keywords = options.keywords;
    const maxResults = options.count || 10000;
    const taskId = task._id;
    
    const {
      countryCode = null,
      minSubscribers = 100,
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
      await this.logger.info("🔍 Enriching keywords...", { originalCount: keywords.length }, taskId);
      searchKeywords = await this.enrichKeywords(keywords);
      await this.logger.success("✅ Keywords enriched", { original: keywords.length, enriched: searchKeywords.length }, taskId);
    }
    
    const channelQueue = [];
    const processedChannels = new Set();
    
    await this.logger.info("🚀 Starting aggressive scrape - MINIMUM SKIPPING", {
      keywords: searchKeywords.length,
      maxResults,
      minSubscribers,
      includeRelated
    }, taskId);
    
    // Phase 1: Search for channels
    for (const keyword of searchKeywords) {
      if (savedChannels >= maxResults) break;
      
      let pageToken = null;
      let pageCount = 0;
      
      while (savedChannels < maxResults && pageCount < 8) {
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
          
          if (!searchResponse.data.items || searchResponse.data.items.length === 0) break;
          
          for (const item of searchResponse.data.items) {
            if (savedChannels >= maxResults) break;
            
            const channelId = item.snippet.channelId;
            
            if (processedChannels.has(channelId)) {
              skippedChannels++;
              continue;
            }
            
            processedChannels.add(channelId);
            totalChannels++;
            
            const channelResponse = await youtube.channels.list({
              part: "snippet,statistics",
              id: channelId,
            });
            
            const channelData = channelResponse.data.items?.[0];
            if (!channelData) {
              skippedChannels++;
              continue;
            }
            
            const stats = channelData.statistics || {};
            const subscriberCount = parseInt(stats.subscriberCount || 0);
            
            // Quick filter - if subscriber count too low and no emails likely, skip early to save API calls
            if (subscriberCount < minSubscribers) {
              skippedChannels++;
              continue;
            }
            
            const result = await this.processChannel(channelData, {
              keywords: [keyword],
              sourceType: "search",
              discoveryDepth: 0,
            }, taskId);
            
            if (result.saved) {
              savedChannels++;
              totalEmailsFound += result.emails || 0;
              totalPhonesFound += result.phones || 0;
              totalQualityScore += result.qualityScore || 0;
              
              if (includeRelated && subscriberCount >= minSubscribers) {
                channelQueue.push({
                  channelId,
                  depth: 0,
                  sourceType: "search",
                });
              }
            } else {
              skippedChannels++;
            }
            
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          
          pageToken = searchResponse.data.nextPageToken;
          if (!pageToken) break;
        } catch (error) {
          await this.logger.error(`Error searching "${keyword}"`, { error: error.message }, taskId);
          
          if (error.code === 403) {
            this.releaseKey(true, false);
          } else {
            this.releaseKey(false, true);
          }
          
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Phase 2: Related channels
    if (includeRelated && channelQueue.length > 0 && savedChannels < maxResults) {
      await this.logger.info("🔗 Discovering related channels", { queueSize: channelQueue.length }, taskId);
      
      let queueIndex = 0;
      while (queueIndex < channelQueue.length && savedChannels < maxResults) {
        const current = channelQueue[queueIndex++];
        
        if (current.depth >= relatedDepth) continue;
        
        try {
          const youtube = await this.getYouTubeClient();
          const related = await this.getRelatedChannels(youtube, current.channelId, current.depth, relatedDepth, taskId);
          relatedChannelsFound += related.length;
          
          for (const rel of related) {
            if (processedChannels.has(rel.channelId) || savedChannels >= maxResults) continue;
            
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
            
            const result = await this.processChannel(channelData, {
              sourceType: rel.sourceType,
              sourceChannel: rel.sourceChannel,
              discoveryDepth: rel.discoveryDepth,
            }, taskId);
            
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
            
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
        } catch (error) {
          await this.logger.error("Error discovering related channels", { error: error.message }, taskId);
          
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
      avgQualityScore: savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0,
      successRate: totalChannels > 0 ? ((savedChannels / totalChannels) * 100).toFixed(2) + "%" : "0%",
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

// ==================== EXPRESS SETUP ====================

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

global.io = io;

io.on("connection", (socket) => {
  console.log("✅ Client connected");
  
  Log.find().sort({ timestamp: -1 }).limit(100).then((logs) => {
    socket.emit("initial_logs", logs.reverse());
  });
});

const systemLogger = new Logger("system");
const apiLogger = new Logger("api");
const scraperManager = new ScraperManager();

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// API Routes
app.get("/api/countries", (req, res) => {
  res.json([
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "CA", name: "Canada" },
    { code: "AU", name: "Australia" },
    { code: "IN", name: "India" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
  ]);
});

app.post("/api/scrape", async (req, res) => {
  try {
    const {
      keywords,
      count = 10000,
      countryCode,
      minSubscribers = 100,
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
    await apiLogger.success(`✅ New task queued`, { taskId: task._id, keywords: keywords.length });
    
    res.json({ message: "Task queued successfully", taskId: task._id });
  } catch (error) {
    await apiLogger.error("Error creating task", { error: error.message });
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.get("/api/scrapers", async (req, res) => {
  try {
    const status = await scraperManager.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch scraper status" });
  }
});

app.get("/api/channels", async (req, res) => {
  try {
    const { page = 1, limit = 20, minSubscribers, minQuality, country, search, sortBy = "qualityScore", sortOrder = "desc" } = req.query;
    
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
    
    res.json({ channels, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

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
      saveRate: totalChannels > 0 ? ((channelsWithEmails / totalChannels) * 100).toFixed(2) + "%" : "0%",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

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

app.get("/api/export/channels", async (req, res) => {
  try {
    const channels = await Channel.find({ hasEmails: true }).limit(50000);
    
    const csv = [
      ["Title", "Channel ID", "Subscribers", "Videos", "Emails", "Website", "Quality Score", "Country", "Scraped At"].join(","),
      ...channels.map(c => [
        `"${(c.title || "").replace(/"/g, '""')}"`,
        c.channelId || "",
        c.subscriberCount || 0,
        c.videoCount || 0,
        `"${(c.emails || []).join("; ")}"`,
        c.websiteUrl || "",
        c.qualityScore || 0,
        c.country || "N/A",
        c.scrapedAt ? new Date(c.scrapedAt).toLocaleString() : "N/A",
      ].join(",")),
    ].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=channels-${new Date().toISOString().split("T")[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export channels" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    scrapers: scraperManager.scrapers.size,
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`🚀 Multi-Scraper System running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? "ON" : "OFF"}`);
  console.log(`📊 Features:`);
  console.log(`   - ✅ FIXED: Proper email extraction (gmail.com works now)`);
  console.log(`   - ✅ FIXED: Duplicate channel prevention`);
  console.log(`   - ✅ FIXED: Phone number extraction improved`);
  console.log(`   - ✅ AGGRESSIVE: Minimal skipping strategy`);
  console.log(`   - ✅ SMART: Website scraping for emails`);
  console.log(`   - ✅ SOCIAL: Social media bio scraping`);
  console.log(`   - ✅ QUALITY: Better scoring system`);
  
  await scraperManager.initialize();
  
  console.log(`\n✅ System ready! Maximum ${scraperManager.maxConcurrentScrapers} parallel scrapers`);
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