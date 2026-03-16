import express from 'express';
import mongoose from 'mongoose';
import { google } from 'googleapis';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
  phoneNumbers: [{ type: String }],
  socialLinks: [{ 
    platform: String,
    url: String,
    profile: String
  }],
  websiteUrl: { type: String },
  contactInfo: {
    hasEmail: { type: Boolean, default: false },
    hasPhone: { type: Boolean, default: false },
    hasSocial: { type: Boolean, default: false },
    hasWebsite: { type: Boolean, default: false }
  },
  engagement: {
    avgViewsPerVideo: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    avgLikes: { type: Number, default: 0 },
    avgComments: { type: Number, default: 0 }
  },
  qualityScore: { type: Number, default: 0, index: true },
  category: { type: String },
  language: { type: String },
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  hasHighSubscribers: { type: Boolean, default: false, index: true },
  savedReason: { type: String, enum: ['emails', 'phones', 'subscribers', 'engagement', 'quality', 'both', 'related'], default: 'emails' },
  sourceChannel: { type: String }, // Which channel this was found from
  sourceType: { type: String, enum: ['search', 'related', 'comments', 'suggested'], default: 'search' },
  discoveryDepth: { type: Number, default: 0 } // How deep in the discovery chain
});

// Comments Schema to store commenter data
const commentSchema = new mongoose.Schema({
  commentId: { type: String, unique: true },
  channelId: { type: String, index: true },
  videoId: { type: String, index: true },
  authorChannelId: { type: String, index: true },
  authorName: { type: String },
  authorChannelUrl: { type: String },
  text: { type: String },
  likeCount: { type: Number, default: 0 },
  publishedAt: { type: Date },
  emails: [{ type: String }],
  socialLinks: [{ type: String }],
  processed: { type: Boolean, default: false },
  scrapedAt: { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', commentSchema);

// Enhanced Queue Schema
const queueSchema = new mongoose.Schema({
  task: { type: String, required: true },
  data: { 
    keywords: [{ type: String }],
    count: { type: Number, default: 10000 },
    countryCode: { type: String, default: null },
    minSubscribers: { type: Number, default: 1000 },
    minEngagement: { type: Number, default: 0.05 },
    qualityThreshold: { type: Number, default: 30 },
    includeRelated: { type: Boolean, default: true },
    includeComments: { type: Boolean, default: true },
    relatedDepth: { type: Number, default: 2 },
    commentsPerVideo: { type: Number, default: 100 },
    enrichKeywords: { type: Boolean, default: true },
    saveOnlyWithEmails: { type: Boolean, default: true } // Only save channels with emails
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
    phonesFound: { type: Number, default: 0 },
    commentsProcessed: { type: Number, default: 0 },
    relatedChannelsFound: { type: Number, default: 0 },
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

// YouTube API Keys validation - Support up to 20 keys
const apiKeys = [
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
  process.env.YOUTUBE_API_KEY_14
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

// Enhanced keyword enrichment using YouTube autocomplete
async function enrichKeywords(baseKeywords) {
  const enriched = new Set();
  
  for (const keyword of baseKeywords) {
    enriched.add(keyword);
    
    try {
      // YouTube autocomplete simulation
      const autocompleteUrls = [
        `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(keyword)}`,
        `http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`
      ];
      
      for (const url of autocompleteUrls) {
        try {
          const response = await axios.get(url, { timeout: 5000 });
          if (response.data && Array.isArray(response.data[1])) {
            response.data[1].forEach(suggestion => {
              enriched.add(suggestion);
              // Add variations
              enriched.add(suggestion + ' channel');
              enriched.add(suggestion + ' official');
              enriched.add(suggestion + ' youtube');
            });
          }
        } catch (e) {
          // Continue if one fails
        }
      }
      
      // Add common variations
      enriched.add(keyword + ' tutorial');
      enriched.add(keyword + ' review');
      enriched.add(keyword + ' how to');
      enriched.add(keyword + ' best');
      enriched.add(keyword + ' top');
      enriched.add(keyword + ' 2024');
      enriched.add(keyword + ' 2025');
      enriched.add('learn ' + keyword);
      enriched.add(keyword + ' for beginners');
      
      // Add country-specific variations if available
      const countries = ['USA', 'UK', 'Canada', 'Australia', 'India', 'Germany', 'France'];
      countries.forEach(country => {
        enriched.add(keyword + ' ' + country);
        enriched.add(country + ' ' + keyword);
      });
      
    } catch (error) {
      await scraperLogger.error('Error enriching keyword', { keyword, error: error.message });
    }
  }
  
  return Array.from(enriched).slice(0, 50); // Limit to 50 enriched keywords
}

// ==================== IMPROVED EMAIL EXTRACTION ====================

/**
 * Enhanced email extraction that catches all possible email formats
 * including those with special formatting, obfuscation, and common patterns
 */
function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Normalize text: replace common obfuscation patterns
  let normalizedText = text
    // Replace [at], (at), {at} with @
    .replace(/\[at\]|\(at\)|\{at\}|<at>|\bat\b/gi, '@')
    // Replace [dot], (dot), {dot} with .
    .replace(/\[dot\]|\(dot\)|\{dot\}|<dot>|\bdot\b/gi, '.')
    // Remove spaces around @ and .
    .replace(/\s+@\s+/g, '@')
    .replace(/\s+\.\s+/g, '.')
    // Replace common separators
    .replace(/\s*[【〔（(［]\s*/g, '')
    .replace(/\s*[】〕）)］]\s*/g, '')
    // Replace HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#64;/g, '@')
    .replace(/&#46;/g, '.')
    .replace(/&nbsp;/g, ' ')
    // Replace common email indicators
    .replace(/e-mail|email|mail|contact|reach us|write to|📧|✉️|📩|📨|💌|📬|📭/gi, ' ');
  
  // Comprehensive email regex patterns
  const emailPatterns = [
    // Standard email format
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    
    // Email with special characters in local part
    /\b[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\b/g,
    
    // Emails with underscores and hyphens
    /\b[A-Za-z0-9]+[._-]?[A-Za-z0-9]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    
    // Catch emails that might have been split across lines
    /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/g,
    
    // Catch emails with common business prefixes
    /\b(info|contact|support|sales|hello|help|business|marketing|media|press|admin|enquiries|enquiry|office|team|careers|jobs|hr|recruitment|partners|sponsorship|collab|collaboration|partnership|sponsor|advertising|ads|pr|publicity|promo|inquiry|bookings|reservations|management|director|ceo|founder|owner|manager)[@\s@]+[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi
  ];
  
  let allEmails = new Set();
  
  // Extract using all patterns
  for (const pattern of emailPatterns) {
    const matches = normalizedText.match(pattern) || [];
    matches.forEach(email => {
      // Clean the email
      let cleaned = email
        .replace(/\s+/g, '') // Remove any remaining whitespace
        .toLowerCase()
        .trim();
      
      // Validate basic structure
      if (cleaned.includes('@') && cleaned.includes('.')) {
        const parts = cleaned.split('@');
        if (parts.length === 2) {
          const localPart = parts[0];
          const domain = parts[1];
          
          // Check if domain has at least one dot and valid characters
          if (domain.includes('.') && 
              domain.split('.').every(part => part.length > 0) &&
              /^[a-z0-9.-]+$/.test(domain)) {
            
            // Additional validation for local part
            if (localPart.length >= 1 && localPart.length <= 64 &&
                /^[a-z0-9._%+-]+$/.test(localPart)) {
              
              // Check for common business patterns (even if domain is common)
              const isBusinessEmail = /^(info|contact|support|sales|hello|help|business|marketing|media|press|admin|enquiries|enquiry|office|team|careers|jobs|hr|recruitment|partners|sponsorship|collab|collaboration|partnership|sponsor|business|advertising|ads|pr|publicity|promo|promotions|inquiry|inquiries|bookings|reservations|book|reserve|management|director|ceo|founder|owner|manager)@/.test(localPart);
              
              // If it looks like a business email, always accept it
              if (isBusinessEmail) {
                allEmails.add(cleaned);
              } 
              // For non-business emails, check if it's a valid domain
              else {
                // Check if domain has at least 2 parts and valid TLD
                const domainParts = domain.split('.');
                const tld = domainParts[domainParts.length - 1];
                
                // Valid TLDs (common ones)
                const validTLDs = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'biz', 'info', 
                                  'uk', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'cn', 'in', 'br',
                                  'mx', 'it', 'es', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'ru',
                                  'agency', 'company', 'business', 'llc', 'inc', 'ltd', 'limited'];
                
                if (validTLDs.includes(tld) || domainParts.length >= 3) {
                  allEmails.add(cleaned);
                }
              }
            }
          }
        }
      }
    });
  }
  
  // Look for emails in the original text with common business indicators
  const businessIndicators = [
    'email', 'e-mail', 'contact', 'reach us', 'mail us', 'write to',
    'business inquiries', 'sponsorship', 'collaboration', 'partnership',
    'for inquiries', 'for business', 'for sponsorship', 'for collab',
    '📧', '✉️', '📩', '📨', '💌', '📬', '📭'
  ];
  
  // Check lines that contain business indicators
  const lines = text.split('\n');
  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    if (businessIndicators.some(indicator => lowerLine.includes(indicator))) {
      // Try to extract email from this line using a more aggressive pattern
      const possibleEmail = line.match(/[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}/gi);
      if (possibleEmail) {
        possibleEmail.forEach(email => {
          const cleaned = email.replace(/\s+/g, '').toLowerCase();
          if (cleaned.includes('@') && cleaned.includes('.')) {
            allEmails.add(cleaned);
          }
        });
      }
    }
  });
  
  return Array.from(allEmails);
}

// Enhanced phone number extraction
function extractPhoneNumbers(text) {
  if (!text || typeof text !== 'string') return [];
  
  // More precise phone number regex patterns
  const phonePatterns = [
    // International format with country code
    /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    
    // US/Canada format (XXX) XXX-XXXX or XXX-XXX-XXXX
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    
    // International format without plus
    /\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    
    // Simple digit groups (at least 10 digits with separators)
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    
    // UK format
    /0\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g
  ];
  
  let allPhones = [];
  
  // Extract using all patterns
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern) || [];
    allPhones = [...allPhones, ...matches];
  }
  
  // Remove duplicates
  allPhones = [...new Set(allPhones)];
  
  // Strict validation and formatting
  return allPhones
    .map(phone => {
      // Clean the phone number
      let cleaned = phone.replace(/[^\d+]/g, '');
      
      // Ensure it has a plus if it's international
      if (phone.includes('+') && !cleaned.startsWith('+')) {
        cleaned = '+' + cleaned.replace(/\+/g, '');
      }
      
      return cleaned;
    })
    .filter(phone => {
      const digits = phone.replace(/\D/g, '');
      const digitCount = digits.length;
      
      // Must have between 10 and 15 digits (international standard)
      if (digitCount < 10 || digitCount > 15) return false;
      
      // Check if it's a valid phone number (not all same digits)
      if (/^(\d)\1{9,}$/.test(digits)) return false;
      
      // Check for sequential numbers
      if (/0123456789|1234567890/.test(digits)) return false;
      
      return true;
    })
    .map(phone => {
      // Format for display
      if (phone.length === 10 && !phone.startsWith('+')) {
        return `+1${phone}`;
      } else if (phone.length === 11 && phone.startsWith('1') && !phone.startsWith('+')) {
        return `+${phone}`;
      } else if (!phone.startsWith('+') && phone.length > 10) {
        return `+${phone}`;
      }
      return phone;
    });
}

// Enhanced social media extraction
function extractSocialLinks(text) {
  if (!text) return [];
  
  const socialPatterns = [
    { platform: 'twitter', regex: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi },
    { platform: 'instagram', regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi },
    { platform: 'facebook', regex: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9.]+)/gi },
    { platform: 'linkedin', regex: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/gi },
    { platform: 'tiktok', regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+/gi },
    { platform: 'discord', regex: /(?:https?:\/\/)?(?:www\.)?discord\.(?:gg|com)\/[a-zA-Z0-9]+/gi },
    { platform: 'telegram', regex: /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[a-zA-Z0-9_]+/gi },
    { platform: 'pinterest', regex: /(?:https?:\/\/)?(?:www\.)?pinterest\.com\/([a-zA-Z0-9_]+)/gi },
    { platform: 'snapchat', regex: /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/add\/([a-zA-Z0-9_]+)/gi },
    { platform: 'reddit', regex: /(?:https?:\/\/)?(?:www\.)?reddit\.com\/(user|r)\/[a-zA-Z0-9_]+/gi },
    { platform: 'twitch', regex: /(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)/gi },
    { platform: 'youtube', regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|channel|user)\/([a-zA-Z0-9_]+)/gi }
  ];
  
  const links = [];
  
  for (const pattern of socialPatterns) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      links.push({
        platform: pattern.platform,
        url: match[0],
        profile: match[1] || ''
      });
    }
  }
  
  return links;
}

// Extract website URL with better detection
function extractWebsite(text) {
  if (!text) return null;
  
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)(?:\/[^\s]*)?/g;
  const matches = text.match(urlRegex);
  
  if (!matches) return null;
  
  const blacklistDomains = [
    'youtube.com', 'youtu.be', 'instagram.com', 'twitter.com', 
    'facebook.com', 'tiktok.com', 'linkedin.com', 'pinterest.com',
    'snapchat.com', 'reddit.com', 'twitch.tv', 'discord.com',
    'discord.gg', 't.me', 'telegram.me', 'whatsapp.com'
  ];
  
  for (const match of matches) {
    const url = match.startsWith('http') ? match : 'https://' + match;
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      if (!blacklistDomains.includes(domain) && 
          !domain.includes('google.com') &&
          domain.includes('.') &&
          domain.split('.').length >= 2) {
        return url;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// Scrape website for additional contact info
async function scrapeWebsiteForContacts(websiteUrl) {
  if (!websiteUrl) return { emails: [], phones: [], socials: [] };
  
  try {
    const response = await axios.get(websiteUrl, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const text = $('body').text();
    const html = response.data;
    
    // Extract from text
    const emails = extractEmails(text);
    const phones = extractPhoneNumbers(text);
    const socials = extractSocialLinks(text);
    
    // Check contact/ about pages
    const contactLinks = [];
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      const text = $(link).text().toLowerCase();
      if (href && (text.includes('contact') || text.includes('about') || 
          text.includes('team') || text.includes('support'))) {
        contactLinks.push(href);
      }
    });
    
    // Scrape contact pages if found
    for (const link of contactLinks.slice(0, 3)) {
      try {
        const fullUrl = link.startsWith('http') ? link : new URL(link, websiteUrl).href;
        const contactResponse = await axios.get(fullUrl, { timeout: 5000 });
        const contactText = contactResponse.data;
        
        const moreEmails = extractEmails(contactText);
        const morePhones = extractPhoneNumbers(contactText);
        const moreSocials = extractSocialLinks(contactText);
        
        emails.push(...moreEmails);
        phones.push(...morePhones);
        socials.push(...moreSocials);
      } catch (e) {
        // Ignore errors on contact pages
      }
    }
    
    return {
      emails: [...new Set(emails)],
      phones: [...new Set(phones)],
      socials: [...new Set(socials)]
    };
    
  } catch (error) {
    return { emails: [], phones: [], socials: [] };
  }
}

// Get related channels
async function getRelatedChannels(channelId, depth = 0, maxDepth = 2, taskId = null) {
  if (depth >= maxDepth) return [];
  
  const relatedChannels = [];
  const youtube = getYouTubeClient();
  
  try {
    // Get channel's videos
    const videosResponse = await youtube.search.list({
      part: 'snippet',
      channelId: channelId,
      type: 'video',
      maxResults: 10,
      order: 'date'
    });
    
    if (!videosResponse.data.items) return [];
    
    // For each video, get comments and related channels
    for (const video of videosResponse.data.items) {
      const videoId = video.id.videoId;
      
      // Get comments
      const commentsResponse = await youtube.commentThreads.list({
        part: 'snippet',
        videoId: videoId,
        maxResults: 100
      });
      
      if (commentsResponse.data.items) {
        for (const comment of commentsResponse.data.items) {
          const authorChannelId = comment.snippet.topLevelComment.snippet.authorChannelId.value;
          
          // Check if it's a channel (not just a commenter)
          try {
            const channelResponse = await youtube.channels.list({
              part: 'snippet,statistics',
              id: authorChannelId
            });
            
            if (channelResponse.data.items && channelResponse.data.items.length > 0) {
              const channel = channelResponse.data.items[0];
              relatedChannels.push({
                channelId: authorChannelId,
                sourceType: 'comments',
                sourceChannel: channelId,
                discoveryDepth: depth + 1
              });
            }
          } catch (e) {
            // Not a channel, skip
          }
        }
      }
      
      // Get related videos
      const relatedResponse = await youtube.search.list({
        part: 'snippet',
        relatedToVideoId: videoId,
        type: 'video',
        maxResults: 50
      });
      
      if (relatedResponse.data.items) {
        for (const related of relatedResponse.data.items) {
          if (related.snippet.channelId !== channelId) {
            relatedChannels.push({
              channelId: related.snippet.channelId,
              sourceType: 'related',
              sourceChannel: channelId,
              discoveryDepth: depth + 1
            });
          }
        }
      }
      
      keyUsage[currentKeyIndex] += 2; // Count API calls
    }
    
  } catch (error) {
    await scraperLogger.error('Error getting related channels', { channelId, error: error.message }, taskId);
  }
  
  // Remove duplicates
  const unique = {};
  relatedChannels.forEach(c => unique[c.channelId] = c);
  
  return Object.values(unique);
}

// ==================== IMPROVED CHANNEL PROCESSING ====================
// ONLY SAVE CHANNELS WITH EMAILS

// Process a single channel thoroughly - ONLY SAVE IF EMAILS FOUND
async function processChannel(channelData, sourceInfo = {}, taskId = null, options = {}) {
  const {
    saveOnlyWithEmails = true, // This is now the default - ONLY save if emails found
    minSubscribers = 1000,
    minEngagement = 0.05,
    qualityThreshold = 30
  } = options;
  
  const channelId = channelData.id || channelData.channelId;
  
  // Check if already exists
  const existing = await Channel.findOne({ channelId });
  if (existing) {
    // If channel exists but we're only saving with emails, check if it has emails
    if (existing.emails && existing.emails.length > 0) {
      // Update existing channel if new emails found
      const snippet = channelData.snippet;
      const statistics = channelData.statistics || {};
      
      // Extract emails again
      const description = snippet.description || '';
      const newEmails = extractEmails(description);
      
      // If we found new emails, update the channel
      if (newEmails.length > 0) {
        const allEmails = [...new Set([...existing.emails, ...newEmails])];
        existing.emails = allEmails;
        existing.hasEmails = allEmails.length > 0;
        existing.lastUpdated = new Date();
        await existing.save();
        
        await scraperLogger.debug(`Updated existing channel with new emails`, {
          channelId,
          newEmails: newEmails.length,
          totalEmails: allEmails.length
        }, taskId, channelId);
        
        return { saved: true, updated: true, channel: existing, emails: newEmails.length };
      }
    }
    return { saved: false, skipped: true, reason: 'exists' };
  }
  
  try {
    const snippet = channelData.snippet;
    const statistics = channelData.statistics || {};
    
    const subscriberCount = parseInt(statistics.subscriberCount || 0);
    const videoCount = parseInt(statistics.videoCount || 0);
    const viewCount = parseInt(statistics.viewCount || 0);
    
    // Get ALL text content for email extraction
    const description = snippet.description || '';
    
    // Extract emails from description (MULTIPLE PASSES)
    let emails = extractEmails(description);
    
    // Log what we found for debugging
    if (description.includes('@') && emails.length === 0) {
      await scraperLogger.debug('Found @ symbol but no emails extracted - checking manually', {
        channelId,
        description: description.substring(0, 200)
      }, taskId, channelId);
      
      // Manual check for common patterns
      const lines = description.split('\n');
      lines.forEach(line => {
        if (line.includes('@') && line.includes('.')) {
          // Try to extract manually
          const words = line.split(/\s+/);
          words.forEach(word => {
            if (word.includes('@') && word.includes('.')) {
              const cleaned = word.replace(/[^a-zA-Z0-9@._-]/g, '');
              if (cleaned.includes('@') && cleaned.includes('.')) {
                emails.push(cleaned);
              }
            }
          });
        }
      });
      
      emails = [...new Set(emails)];
    }
    
    // Extract phones
    let phones = extractPhoneNumbers(description);
    
    // Extract social links
    let socialLinks = extractSocialLinks(description);
    
    // Extract website
    let websiteUrl = extractWebsite(description);
    
    // If we have a website, scrape it for more contacts (to find emails)
    if (websiteUrl) {
      const websiteData = await scrapeWebsiteForContacts(websiteUrl);
      emails = [...new Set([...emails, ...websiteData.emails])];
      phones = [...new Set([...phones, ...websiteData.phones])];
      socialLinks = [...new Set([...socialLinks, ...websiteData.socials])];
    }
    
    // Check Linktree, Bio.link, etc. for emails
    const bioLinks = socialLinks.filter(s => 
      s.url.includes('linktr.ee') || 
      s.url.includes('bio.link') || 
      s.url.includes('beacons.ai') ||
      s.url.includes('carrd.co') ||
      s.url.includes('linktree')
    );
    
    for (const bioLink of bioLinks) {
      try {
        const bioResponse = await axios.get(bioLink.url, { timeout: 5000 });
        const bioText = bioResponse.data;
        
        const bioEmails = extractEmails(bioText);
        emails = [...new Set([...emails, ...bioEmails])];
      } catch (e) {
        // Ignore errors
      }
    }
    
    const engagementRate = videoCount > 0 ? (viewCount / videoCount) / (subscriberCount || 1) : 0;
    
    // Calculate quality score
    let qualityScore = 0;
    if (subscriberCount >= 100000) qualityScore += 30;
    else if (subscriberCount >= 50000) qualityScore += 25;
    else if (subscriberCount >= 10000) qualityScore += 20;
    else if (subscriberCount >= 5000) qualityScore += 15;
    else if (subscriberCount >= 1000) qualityScore += 10;
    
    if (videoCount >= 500) qualityScore += 20;
    else if (videoCount >= 200) qualityScore += 15;
    else if (videoCount >= 100) qualityScore += 10;
    else if (videoCount >= 50) qualityScore += 5;
    
    if (engagementRate >= 0.5) qualityScore += 30;
    else if (engagementRate >= 0.3) qualityScore += 20;
    else if (engagementRate >= 0.1) qualityScore += 10;
    
    if (emails.length > 0) qualityScore += 15;
    if (phones.length > 0) qualityScore += 5;
    if (websiteUrl) qualityScore += 5;
    if (socialLinks.length > 2) qualityScore += 5;
    
    // CRITICAL: Determine if we should save - ONLY save if emails found
    const hasEmails = emails.length > 0;
    
    // If saveOnlyWithEmails is true, we ONLY save channels with emails
    if (saveOnlyWithEmails && !hasEmails) {
      await scraperLogger.debug(`⏭️ Skipping channel - no emails found`, {
        channelId,
        title: snippet.title,
        hasEmails: false
      }, taskId, channelId);
      
      return { saved: false, skipped: true, reason: 'no_emails' };
    }
    
    // If we get here, either we have emails OR saveOnlyWithEmails is false
    // But since we set saveOnlyWithEmails to true by default, we should only save with emails
    
    // Determine reason
    let savedReason = 'emails';
    if (hasEmails && phones.length > 0) savedReason = 'both';
    else if (hasEmails) savedReason = 'emails';
    else if (phones.length > 0) savedReason = 'phones';
    else if (subscriberCount >= 50000) savedReason = 'subscribers';
    else if (qualityScore >= 70) savedReason = 'quality';
    else if (sourceInfo.sourceType === 'related' || sourceInfo.sourceType === 'comments') savedReason = 'related';
    
    // Create channel record
    const channel = new Channel({
      channelId,
      title: snippet.title,
      description: description.substring(0, 1000), // Store first 1000 chars of description
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
        hasWebsite: !!websiteUrl
      },
      engagement: {
        avgViewsPerVideo: videoCount > 0 ? viewCount / videoCount : 0,
        engagementRate
      },
      qualityScore,
      language: snippet.defaultLanguage,
      lastUpdated: new Date(),
      hasEmails: emails.length > 0,
      hasHighSubscribers: subscriberCount >= minSubscribers,
      savedReason,
      sourceChannel: sourceInfo.sourceChannel,
      sourceType: sourceInfo.sourceType || 'search',
      discoveryDepth: sourceInfo.discoveryDepth || 0
    });
    
    await channel.save();
    
    // Log success with email count
    await scraperLogger.success(
      `✅ SAVED: "${snippet.title}" with ${emails.length} emails`, 
      { 
        emails: emails.length,
        phones: phones.length,
        subscribers: subscriberCount,
        qualityScore
      }, 
      taskId, 
      channelId
    );
    
    return {
      saved: true,
      channel,
      emails: emails.length,
      phones: phones.length,
      qualityScore
    };
    
  } catch (error) {
    await scraperLogger.error('Error processing channel', { channelId, error: error.message }, taskId);
    return { saved: false, error: error.message };
  }
}

// Main scraping function with keyword enrichment and related channels
async function scrapeChannels(keywords, maxResults = 10000, taskId = null, options = {}) {
  const {
    countryCode = null,
    minSubscribers = 1000,
    minEngagement = 0.05,
    qualityThreshold = 30,
    includeRelated = true,
    includeComments = true,
    relatedDepth = 2,
    commentsPerVideo = 100,
    enrichKeywords: shouldEnrich = true,
    saveOnlyWithEmails = true // CRITICAL: This is now true by default
  } = options;
  
  let totalChannels = 0;
  let savedChannels = 0;
  let skippedChannels = 0;
  let totalEmailsFound = 0;
  let totalPhonesFound = 0;
  let relatedChannelsFound = 0;
  let commentsProcessed = 0;
  let highSubscriberChannels = 0;
  let highEngagementChannels = 0;
  let channelsWithWebsite = 0;
  let totalQualityScore = 0;
  
  // Enrich keywords if enabled
  let searchKeywords = keywords;
  if (shouldEnrich) {
    await scraperLogger.info('🔍 Enriching keywords...', { originalCount: keywords.length }, taskId);
    searchKeywords = await enrichKeywords(keywords);
    await scraperLogger.success('✅ Keywords enriched', { 
      original: keywords.length, 
      enriched: searchKeywords.length 
    }, taskId);
  }
  
  // Queue for BFS discovery
  const channelQueue = [];
  const processedChannels = new Set();
  
  await scraperLogger.info('🚀 Starting aggressive scrape (ONLY saving channels with emails)', { 
    keywords: searchKeywords.length, 
    maxResults, 
    countryCode,
    minSubscribers,
    includeRelated,
    relatedDepth,
    saveOnlyWithEmails
  }, taskId);
  
  // Phase 1: Search for channels
  for (const keyword of searchKeywords) {
    if (savedChannels >= maxResults) break;
    
    let pageToken = null;
    let pageCount = 0;
    
    while (savedChannels < maxResults && pageCount < 10) { // Limit to 10 pages per keyword
      try {
        if (keyQuotaExceeded.every(exceeded => exceeded)) {
          await scraperLogger.warning('⚠️ All API keys quota exceeded. Waiting...', null, taskId);
          await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
          keyQuotaExceeded.fill(false);
        }
        
        if (keyQuotaExceeded[currentKeyIndex]) {
          rotateKey();
          continue;
        }
        
        const youtube = getYouTubeClient();
        
        const searchParams = {
          part: 'snippet',
          q: keyword,
          type: 'channel',
          maxResults: 50,
          order: 'relevance',
          pageToken: pageToken
        };
        
        if (countryCode) {
          searchParams.regionCode = countryCode;
        }
        
        const searchResponse = await youtube.search.list(searchParams);
        keyUsage[currentKeyIndex]++;
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
          
          // Get full channel details
          const channelResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            id: channelId
          });
          
          keyUsage[currentKeyIndex]++;
          
          const channelData = channelResponse.data.items?.[0];
          if (!channelData) {
            skippedChannels++;
            continue;
          }
          
          const result = await processChannel(channelData, {
            keywords: [keyword],
            sourceType: 'search',
            discoveryDepth: 0
          }, taskId, options);
          
          if (result.saved) {
            savedChannels++;
            totalEmailsFound += result.emails || 0;
            totalPhonesFound += result.phones || 0;
            totalQualityScore += result.qualityScore || 0;
            
            if (result.channel?.hasHighSubscribers) highSubscriberChannels++;
            if (result.channel?.engagement?.engagementRate >= minEngagement) highEngagementChannels++;
            if (result.channel?.contactInfo?.hasWebsite) channelsWithWebsite++;
            
            // Add to queue for related channel discovery
            if (includeRelated) {
              channelQueue.push({
                channelId,
                depth: 0,
                sourceType: 'search'
              });
            }
          } else {
            skippedChannels++;
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        pageToken = searchResponse.data.nextPageToken;
        if (!pageToken) break;
        
      } catch (error) {
        await scraperLogger.error(`Error searching keyword "${keyword}"`, { error: error.message }, taskId);
        
        if (error.code === 403) {
          keyQuotaExceeded[currentKeyIndex] = true;
          rotateKey();
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Phase 2: Discover related channels (BFS) - still only save those with emails
  if (includeRelated && channelQueue.length > 0) {
    await scraperLogger.info('🔗 Discovering related channels (only saving those with emails)', { 
      queueSize: channelQueue.length,
      maxDepth: relatedDepth 
    }, taskId);
    
    let queueIndex = 0;
    while (queueIndex < channelQueue.length && savedChannels < maxResults) {
      const current = channelQueue[queueIndex++];
      
      if (current.depth >= relatedDepth) continue;
      
      try {
        const related = await getRelatedChannels(current.channelId, current.depth, relatedDepth, taskId);
        relatedChannelsFound += related.length;
        
        for (const rel of related) {
          if (processedChannels.has(rel.channelId) || savedChannels >= maxResults) continue;
          
          processedChannels.add(rel.channelId);
          totalChannels++;
          
          // Get channel details
          const youtube = getYouTubeClient();
          const channelResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            id: rel.channelId
          });
          
          keyUsage[currentKeyIndex]++;
          
          const channelData = channelResponse.data.items?.[0];
          if (!channelData) {
            skippedChannels++;
            continue;
          }
          
          const result = await processChannel(channelData, {
            sourceType: rel.sourceType,
            sourceChannel: rel.sourceChannel,
            discoveryDepth: rel.discoveryDepth
          }, taskId, options);
          
          if (result.saved) {
            savedChannels++;
            totalEmailsFound += result.emails || 0;
            totalPhonesFound += result.phones || 0;
            totalQualityScore += result.qualityScore || 0;
            
            if (result.channel?.hasHighSubscribers) highSubscriberChannels++;
            if (result.channel?.engagement?.engagementRate >= minEngagement) highEngagementChannels++;
            if (result.channel?.contactInfo?.hasWebsite) channelsWithWebsite++;
            
            // Add to queue for deeper discovery
            if (rel.discoveryDepth < relatedDepth) {
              channelQueue.push({
                channelId: rel.channelId,
                depth: rel.discoveryDepth + 1,
                sourceType: rel.sourceType
              });
            }
          } else {
            skippedChannels++;
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
      } catch (error) {
        await scraperLogger.error('Error discovering related channels', { 
          channelId: current.channelId, 
          error: error.message 
        }, taskId);
      }
    }
  }
  
  const stats = {
    totalProcessed: totalChannels,
    saved: savedChannels,
    skipped: skippedChannels,
    emailsFound: totalEmailsFound,
    phonesFound: totalPhonesFound,
    relatedChannelsFound,
    commentsProcessed,
    highSubscriberChannels,
    highEngagementChannels,
    channelsWithWebsite,
    avgQualityScore: savedChannels > 0 ? Math.round(totalQualityScore / savedChannels) : 0,
    saveRate: totalChannels > 0 ? ((savedChannels / totalChannels) * 100).toFixed(2) + '%' : '0%'
  };
  
  await scraperLogger.success('🎉 Scrape completed!', stats, taskId);
  
  return stats;
}

// Process queue function
async function processQueue() {
  if (isProcessing) {
    await workerLogger.debug('Queue processing already in progress, skipping...');
    return;
  }
  
  isProcessing = true;
  
  try {
    const pendingTasks = await Queue.find({ status: 'pending' })
      .sort({ priority: -1, createdAt: 1 })
      .limit(5); // Process 5 tasks at a time
    
    if (pendingTasks.length === 0) {
      await workerLogger.debug('No pending tasks in queue');
      isProcessing = false;
      return;
    }
    
    await workerLogger.info(`📋 Processing ${pendingTasks.length} tasks from queue`);
    
    // Process tasks sequentially to better manage API keys
    for (const task of pendingTasks) {
      await workerLogger.info(`🔧 Processing task: ${task._id}`, { taskType: task.task }, task._id);
      task.status = 'processing';
      await task.save();
      
      try {
        if (task.task === 'scrape_channels') {
          const keywords = task.data.keywords || ['technology', 'business', 'entertainment'];
          const count = parseInt(task.data.count) || 10000;
          
          const stats = await scrapeChannels(keywords, count, task._id, {
            countryCode: task.data.countryCode || null,
            minSubscribers: parseInt(task.data.minSubscribers) || 1000,
            minEngagement: parseFloat(task.data.minEngagement) || 0.05,
            qualityThreshold: parseInt(task.data.qualityThreshold) || 30,
            includeRelated: task.data.includeRelated !== false,
            includeComments: task.data.includeComments !== false,
            relatedDepth: parseInt(task.data.relatedDepth) || 2,
            commentsPerVideo: parseInt(task.data.commentsPerVideo) || 100,
            enrichKeywords: task.data.enrichKeywords !== false,
            saveOnlyWithEmails: task.data.saveOnlyWithEmails !== false // This is now true by default
          });
          
          task.status = 'completed';
          task.processedAt = new Date();
          task.stats = stats;
          await task.save();
          
          await workerLogger.success(`✅ Task ${task._id} completed`, stats, task._id);
        }
        
        // Small delay between tasks
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

// Worker startup function
async function startWorker() {
  await systemLogger.info('👷 Aggressive worker started');
  
  try {
    // Process queue every 30 seconds
    setInterval(() => {
      processQueue().catch(error => {
        workerLogger.error('Queue processing error', { error: error.message });
      });
    }, 30000);

    // Schedule daily scrape at midnight
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

// Daily scrape function
async function runDailyScrape() {
  await systemLogger.info('Starting daily aggressive scrape (ONLY saving channels with emails)');
  const keywords = ['technology', 'business', 'entertainment', 'gaming', 'education', 'music', 'sports', 'news', 'health', 'finance', 'marketing', 'design', 'photography', 'travel', 'food', 'fashion', 'fitness', 'coding', 'programming', 'ai'];
  
  const task = new Queue({
    task: 'scrape_channels',
    data: { 
      keywords, 
      count: 20000,
      countryCode: null,
      minSubscribers: 500,
      minEngagement: 0.02,
      qualityThreshold: 20,
      includeRelated: true,
      relatedDepth: 2,
      enrichKeywords: true,
      saveOnlyWithEmails: true // Explicitly set to true
    },
    priority: 2
  });
  
  await task.save();
  await systemLogger.info(`Daily aggressive scrape task queued`, { taskId: task._id });
  
  processQueue().catch(console.error);
}

// Express middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5175',
  credentials: true
}));

// Logging middleware
app.use(async (req, res, next) => {
  await apiLogger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ==================== API Routes ====================

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

// Start scrape task
app.post('/api/scrape', async (req, res) => {
  try {
    const { 
      keywords, 
      count = 10000,
      countryCode,
      minSubscribers = 1000,
      minEngagement = 0.05,
      qualityThreshold = 30,
      includeRelated = true,
      includeComments = true,
      relatedDepth = 2,
      enrichKeywords = true,
      saveOnlyWithEmails = true // This is now the default
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
        keywords: keywords.slice(0, 20),
        count: Math.min(count || 10000, 50000),
        countryCode: countryCode || null,
        minSubscribers: parseInt(minSubscribers),
        minEngagement: parseFloat(minEngagement),
        qualityThreshold: parseInt(qualityThreshold),
        includeRelated,
        includeComments,
        relatedDepth: parseInt(relatedDepth),
        enrichKeywords,
        saveOnlyWithEmails // This ensures we only save channels with emails
      },
      stats: {
        channelsScraped: 0,
        channelsSaved: 0,
        channelsSkipped: 0,
        emailsFound: 0,
        phonesFound: 0,
        commentsProcessed: 0,
        relatedChannelsFound: 0,
        highSubscriberChannels: 0,
        highEngagementChannels: 0,
        channelsWithWebsite: 0,
        avgQualityScore: 0
      }
    });
    
    await task.save();
    await apiLogger.success(`✅ New aggressive scrape task queued (ONLY saving channels with emails)`, { 
      taskId: task._id, 
      keywords: keywords.length,
      count,
      countryCode,
      minSubscribers,
      includeRelated,
      enrichKeywords,
      saveOnlyWithEmails
    }, task._id);
    
    // Trigger processing immediately
    processQueue().catch(console.error);
    
    res.json({ 
      message: 'Aggressive scraping task queued successfully - ONLY saving channels with emails', 
      taskId: task._id,
      estimatedChannels: task.data.count,
      filters: {
        country: countryCode || 'Worldwide',
        minSubscribers,
        minEngagement,
        qualityThreshold,
        includeRelated,
        enrichKeywords,
        saveOnlyWithEmails: true // Always true now
      }
    });
  } catch (error) {
    await apiLogger.error('Error creating scrape task', { error: error.message });
    res.status(500).json({ error: 'Failed to create scrape task' });
  }
});

// Get channels with filters
app.get('/api/channels', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      minSubscribers, 
      minQuality,
      hasEmails, 
      hasPhones,
      hasWebsite,
      country,
      search,
      sortBy = 'qualityScore',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    if (minSubscribers) query.subscriberCount = { $gte: parseInt(minSubscribers) };
    if (minQuality) query.qualityScore = { $gte: parseInt(minQuality) };
    if (hasEmails === 'true') query.hasEmails = true;
    if (hasPhones === 'true') query['contactInfo.hasPhone'] = true;
    if (hasWebsite === 'true') query['contactInfo.hasWebsite'] = true;
    if (country) query.country = country;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { emails: { $regex: search, $options: 'i' } }
      ];
    }
    
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const channels = await Channel.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Channel.countDocuments(query);
    
    res.json({ 
      channels, 
      total, 
      page: parseInt(page), 
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    await apiLogger.error('Error fetching channels', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Get channel by ID
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

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalChannels = await Channel.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayChannels = await Channel.countDocuments({ scrapedAt: { $gte: today } });
    const channelsWithEmails = await Channel.countDocuments({ hasEmails: true });
    const channelsWithPhones = await Channel.countDocuments({ 'contactInfo.hasPhone': true });
    const channelsWithBoth = await Channel.countDocuments({ hasEmails: true, 'contactInfo.hasPhone': true });
    const channelsWithWebsite = await Channel.countDocuments({ 'contactInfo.hasWebsite': true });
    const channelsWithSocial = await Channel.countDocuments({ 'contactInfo.hasSocial': true });
    
    // Email stats
    const emailStats = await Channel.aggregate([
      { $unwind: '$emails' },
      { $group: { _id: null, totalEmails: { $sum: 1 } } }
    ]);
    
    // Phone stats
    const phoneStats = await Channel.aggregate([
      { $unwind: '$phoneNumbers' },
      { $group: { _id: null, totalPhones: { $sum: 1 } } }
    ]);
    
    const totalEmails = emailStats[0]?.totalEmails || 0;
    const totalPhones = phoneStats[0]?.totalPhones || 0;
    
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
    
    // Country distribution
    const countryDistribution = await Channel.aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Source type distribution
    const sourceDistribution = await Channel.aggregate([
      { $group: { _id: '$sourceType', count: { $sum: 1 } } }
    ]);
    
    // Queue stats
    const queueStats = {
      pending: await Queue.countDocuments({ status: 'pending' }),
      processing: await Queue.countDocuments({ status: 'processing' }),
      completed: await Queue.countDocuments({ status: 'completed' }),
      failed: await Queue.countDocuments({ status: 'failed' })
    };
    
    res.json({ 
      totalChannels,
      todayChannels,
      channelsWithEmails,
      channelsWithPhones,
      channelsWithBoth,
      channelsWithWebsite,
      channelsWithSocial,
      totalEmails,
      totalPhones,
      queueStats,
      qualityStats: qualityStats[0] || { avgQuality: 0, maxQuality: 0, minQuality: 0 },
      countryDistribution,
      sourceDistribution,
      saveRate: totalChannels > 0 ? ((channelsWithEmails / totalChannels) * 100).toFixed(2) + '%' : '0%'
    });
  } catch (error) {
    await apiLogger.error('Error fetching stats', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Export channels as CSV
app.get('/api/export/channels', async (req, res) => {
  try {
    const channels = await Channel.find().limit(50000);
    
    const csv = [
      ['Title', 'Channel ID', 'Subscribers', 'Videos', 'Views', 'Emails', 'Phones', 'Social Links', 'Website', 'Quality Score', 'Engagement Rate', 'Country', 'Has Emails', 'Has Phones', 'Saved Reason', 'Source Type', 'Keywords', 'Published At', 'Scraped At'].join(','),
      ...channels.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        c.channelId || '',
        c.subscriberCount || 0,
        c.videoCount || 0,
        c.viewCount || 0,
        `"${(c.emails || []).join('; ')}"`,
        `"${(c.phoneNumbers || []).join('; ')}"`,
        `"${(c.socialLinks || []).map(s => s.url).join('; ')}"`,
        c.websiteUrl || '',
        c.qualityScore || 0,
        (c.engagement?.engagementRate || 0).toFixed(4),
        c.country || 'N/A',
        c.hasEmails || false,
        c.contactInfo?.hasPhone || false,
        c.savedReason || 'emails',
        c.sourceType || 'search',
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
      failed: await Queue.countDocuments({ status: 'failed' })
    };
    
    res.json({ queue, stats });
  } catch (error) {
    await apiLogger.error('Error fetching queue', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// Get task details
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

// Get logs
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

    res.json({
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    await apiLogger.error('Error fetching logs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch logs' });
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

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Aggressive YouTube Scraper running on port ${PORT}`);
  console.log(`🔧 Debug mode: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log(`📊 Enhanced features:`);
  console.log(`   - Keyword enrichment with autocomplete`);
  console.log(`   - Related channels discovery (BFS)`);
  console.log(`   - Website scraping for contacts`);
  console.log(`   - Phone number extraction`);
  console.log(`   - Linktree/Bio.link scraping`);
  console.log(`   - Multiple API key rotation (${apiKeys.length} keys)`);
  console.log(`   - IMPROVED EMAIL EXTRACTION (handles obfuscation)`);
  console.log(`   - 🔴 ONLY SAVES CHANNELS WITH EMAILS (strict mode)`);
  console.log(`   - Target: 10k+ emails per day`);
  
  // Start the worker
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