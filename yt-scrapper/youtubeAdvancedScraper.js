import express from "express";
import axios from "axios";
import mongoose from "mongoose";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();


// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

// Load API keys from environment variables
const API_KEYS = Array.from({ length: 120 }, (_, i) => 
  process.env[`YOUTUBE_API_KEY_${i + 1}`]
).filter(Boolean); // Remove undefined/null keys

console.log(`✅ Loaded ${API_KEYS.length} API keys`);

if (API_KEYS.length === 0) {
  console.error("❌ No API keys found! Please set YOUTUBE_API_KEY_1, YOUTUBE_API_KEY_2, etc.");
  process.exit(1);
}

const MONGO_URI = "mongodb+srv://mohitsatyarthi11_db_user:st2OLe7VdRwk05pf@cluster0.x6o4oxc.mongodb.net/?appName=Cluster0";

// ================= API KEY MANAGER =================
class ApiKeyManager {
  constructor(keys) {
    this.keys = keys;
    this.keyStatus = new Map(); // Track quota status
    this.currentIndex = 0;
    this.failedKeys = new Set();
    this.quotaExhaustedKeys = new Set();
    
    // Initialize all keys as active
    keys.forEach(key => this.keyStatus.set(key, { 
      active: true, 
      failures: 0, 
      lastUsed: null,
      quotaExhausted: false 
    }));
  }

  getNextKey() {
    const startIndex = this.currentIndex;
    
    do {
      const key = this.keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      
      const status = this.keyStatus.get(key);
      if (status && status.active && !status.quotaExhausted) {
        return key;
      }
      
      // If we've looped through all keys, reset quota exhausted keys
      if (this.currentIndex === startIndex) {
        this.resetQuotaExhaustedKeys();
      }
    } while (true);
  }

  markKeySuccess(key) {
    const status = this.keyStatus.get(key);
    if (status) {
      status.failures = 0;
      status.lastUsed = new Date();
      status.active = true;
    }
  }

  markKeyFailure(key, errorMessage = '') {
    const status = this.keyStatus.get(key);
    if (status) {
      status.failures++;
      status.lastUsed = new Date();
      
      // Check if quota exceeded
      if (errorMessage.includes('quotaExceeded') || errorMessage.includes('quota')) {
        status.quotaExhausted = true;
        this.quotaExhaustedKeys.add(key);
        console.log(`⚠️ Quota exhausted for key: ${key.substring(0, 10)}...`);
      }
      
      // Deactivate key after 3 consecutive failures
      if (status.failures >= 3) {
        status.active = false;
        this.failedKeys.add(key);
        console.log(`❌ Deactivated key after 3 failures: ${key.substring(0, 10)}...`);
      }
    }
  }

  resetQuotaExhaustedKeys() {
    if (this.quotaExhaustedKeys.size > 0) {
      console.log(`🔄 Resetting ${this.quotaExhaustedKeys.size} quota-exhausted keys`);
      this.quotaExhaustedKeys.forEach(key => {
        const status = this.keyStatus.get(key);
        if (status) {
          status.quotaExhausted = false;
        }
      });
      this.quotaExhaustedKeys.clear();
    }
  }

  getActiveKeyCount() {
    return Array.from(this.keyStatus.values())
      .filter(s => s.active && !s.quotaExhausted).length;
  }

  getStats() {
    const total = this.keys.length;
    const active = this.getActiveKeyCount();
    const failed = this.failedKeys.size;
    const quotaExhausted = this.quotaExhaustedKeys.size;
    
    return { total, active, failed, quotaExhausted };
  }
}

const keyManager = new ApiKeyManager(API_KEYS);

// ================= INIT =================
const app = express();
app.use(express.json());

// Connect to MongoDB
try {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");
} catch (err) {
  console.error("❌ MongoDB connection error:", err.message);
}

// ================= DB =================
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true },
  title: String,
  description: String,
  customUrl: String,
  subscribers: Number,
  emails: [String],
  socialLinks: [String],
  websiteLinks: [String],
  scrapedFromWebsites: [String],
  lastScraped: Date,
  createdAt: { type: Date, default: Date.now }
});

// Add index for faster queries
channelSchema.index({ channelId: 1 });
channelSchema.index({ emails: 1 });

const Channel = mongoose.model("Channel", channelSchema);

// ================= UTIL =================
function extractEmails(text) {
  if (!text) return [];
  const regex = /[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  return [...new Set(text.match(regex) || [])].filter(email => {
    // Filter out common false positives
    const invalidPatterns = [
      'example.com', 'test.com', 'domain.com', 'email.com',
      '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.webp'
    ];
    return !invalidPatterns.some(pattern => email.toLowerCase().includes(pattern));
  });
}

function extractUrls(text) {
  if (!text) return [];
  const regex = /(https?:\/\/[^\s)]+)/g;
  return [...new Set(text.match(regex) || [])];
}

function isSocialMedia(url) {
  const socialDomains = [
    'instagram.com', 'twitter.com', 'x.com', 'facebook.com', 'fb.com',
    'tiktok.com', 'linkedin.com', 'discord.gg', 'discord.com',
    'reddit.com', 'twitch.tv', 'snapchat.com', 'telegram.org',
    't.me', 'whatsapp.com', 'patreon.com', 'pinterest.com',
    'medium.com', 'substack.com', 'onlyfans.com'
  ];
  return socialDomains.some(domain => url.toLowerCase().includes(domain));
}

// ================= EXTRACT HANDLE FROM URL =================
function extractHandleFromUrl(url) {
  const match = url.match(/@([^/?]+)/);
  if (match) return match[1];
  
  const channelMatch = url.match(/channel\/([^/?]+)/);
  if (channelMatch) return channelMatch[1];
  
  const cMatch = url.match(/\/c\/([^/?]+)/);
  if (cMatch) return cMatch[1];
  
  return null;
}

// ================= API CALL WITH RETRY =================
async function makeApiCall(url, params, maxRetries = 5) {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const key = keyManager.getNextKey();
    
    try {
      const res = await axios.get(url, {
        params: { ...params, key },
        timeout: 10000
      });
      
      keyManager.markKeySuccess(key);
      return res;
      
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      
      // Check for specific error types
      if (err.response?.status === 403 && errorMsg.includes('quotaExceeded')) {
        keyManager.markKeyFailure(key, 'quotaExceeded');
        console.log(`⚠️ Quota exceeded, switching key... (Attempt ${attempt + 1}/${maxRetries})`);
        continue; // Try next key
      } else if (err.response?.status === 400) {
        keyManager.markKeyFailure(key, errorMsg);
        throw err; // Bad request - don't retry
      } else if (err.response?.status === 403 || err.response?.status === 429) {
        keyManager.markKeyFailure(key, errorMsg);
        console.log(`🔄 Rate limited, retrying... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      } else {
        keyManager.markKeyFailure(key, errorMsg);
        lastError = err;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// ================= GET CHANNEL DATA =================
async function getChannelData(handle) {
  try {
    const isChannelId = handle.startsWith('UC') && handle.length === 24;
    
    const params = {
      part: "snippet,statistics,brandingSettings",
      ...(isChannelId ? { id: handle } : { forHandle: handle })
    };
    
    const res = await makeApiCall(
      "https://www.googleapis.com/youtube/v3/channels",
      params
    );

    if (res.data.items && res.data.items.length > 0) {
      return res.data.items[0];
    }
    return null;
  } catch (err) {
    console.error(`❌ Failed to get channel data: ${err.message}`);
    return null;
  }
}

// ================= SCRAPE WEBSITE FOR EMAILS =================
async function scrapeWebsiteForEmails(url) {
  try {
    // Clean URL
    const cleanUrl = url.replace(/[)]+$/, ''); // Remove trailing parentheses
    
    const res = await axios.get(cleanUrl, { 
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    const $ = cheerio.load(res.data);
    
    // Remove script and style content
    $('script, style, noscript').remove();
    
    // Get text from body
    const bodyText = $("body").text();
    let emails = extractEmails(bodyText);
    
    // Also check mailto links
    $('a[href^="mailto:"]').each((i, el) => {
      const mailto = $(el).attr('href');
      if (mailto) {
        const email = mailto.replace('mailto:', '').split('?')[0];
        if (email && email.includes('@')) {
          emails.push(email);
        }
      }
    });
    
    // Check common contact pages
    const contactPaths = ['/contact', '/contact-us', '/about', '/about-us', '/support', '/hello', '/team'];
    let additionalEmails = [];
    
    for (const path of contactPaths.slice(0, 3)) { // Limit to 3 contact pages
      try {
        const contactUrl = new URL(path, cleanUrl).href;
        const contactRes = await axios.get(contactUrl, { 
          timeout: 7000,
          maxRedirects: 3,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $contact = cheerio.load(contactRes.data);
        $contact('script, style, noscript').remove();
        const contactText = $contact("body").text();
        additionalEmails.push(...extractEmails(contactText));
      } catch {
        // Skip failed contact page fetches
      }
    }
    
    return [...new Set([...emails, ...additionalEmails])];
  } catch (err) {
    // Don't log timeouts as errors
    if (err.code !== 'ECONNABORTED' && err.code !== 'ETIMEDOUT') {
      console.error(`❌ Failed to scrape ${url}: ${err.message}`);
    }
    return [];
  }
}

// ================= MAIN SCRAPE FUNCTION =================
async function scrapeChannel(url) {
  try {
    console.log(`\n🔍 Processing: ${url}`);
    
    const handle = extractHandleFromUrl(url);
    if (!handle) {
      console.log(`❌ Could not extract handle from URL: ${url}`);
      return { url, status: "failed", error: "Could not extract handle" };
    }
    
    // Get channel data from YouTube API
    const channelData = await getChannelData(handle);
    
    if (!channelData) {
      console.log(`❌ Channel not found: ${handle}`);
      return { url, status: "failed", error: "Channel not found" };
    }
    
    const snippet = channelData.snippet;
    const stats = channelData.statistics;
    const brandingSettings = channelData.brandingSettings || {};
    const description = snippet.description || '';
    
    // Extract emails from description
    const emailsFromDesc = extractEmails(description);
    
    // Also check branding settings for business email
    if (brandingSettings.channel?.description) {
      emailsFromDesc.push(...extractEmails(brandingSettings.channel.description));
    }
    
    console.log(`📧 Emails in description: ${emailsFromDesc.length}`);
    
    // Extract URLs from description
    const allUrls = extractUrls(description);
    
    // Separate social links and website links
    const socialLinks = allUrls.filter(url => isSocialMedia(url));
    const websiteLinks = allUrls.filter(url => !isSocialMedia(url));
    
    console.log(`🌐 Social links: ${socialLinks.length}`);
    console.log(`🔗 Website links: ${websiteLinks.length}`);
    
    // Scrape websites for additional emails (limit to 3 websites to save time)
    let allScrapedEmails = [];
    const websitesToScrape = websiteLinks
      .filter(url => !url.includes('youtube.com') && !url.includes('youtu.be'))
      .slice(0, 3);
    
    for (const websiteUrl of websitesToScrape) {
      console.log(`🌍 Scraping website: ${websiteUrl}`);
      const scrapedEmails = await scrapeWebsiteForEmails(websiteUrl);
      allScrapedEmails.push(...scrapedEmails);
      console.log(`📧 Found ${scrapedEmails.length} emails on website`);
      
      // Delay between website scrapes
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Combine all emails
    const allEmails = [...new Set([...emailsFromDesc, ...allScrapedEmails])];
    
    console.log(`📧 Total unique emails found: ${allEmails.length}`);
    console.log(`✅ Successfully scraped: ${snippet.title}`);
    
    // Save to database
    const channelDoc = {
      channelId: channelData.id,
      title: snippet.title,
      description: description,
      customUrl: snippet.customUrl || '',
      subscribers: parseInt(stats.subscriberCount) || 0,
      emails: allEmails,
      socialLinks: socialLinks,
      websiteLinks: websiteLinks,
      scrapedFromWebsites: allScrapedEmails,
      lastScraped: new Date()
    };
    
    // Upsert to avoid duplicates
    await Channel.findOneAndUpdate(
      { channelId: channelData.id },
      channelDoc,
      { upsert: true, new: true }
    );
    
    return {
      url,
      channelId: channelData.id,
      title: snippet.title,
      status: "success",
      emailsFound: allEmails.length,
      emails: allEmails,
      subscribers: parseInt(stats.subscriberCount) || 0
    };
    
  } catch (err) {
    console.error(`❌ Error scraping ${url}:`, err.message);
    return {
      url,
      status: "error",
      error: err.message
    };
  }
}

// ================= BATCH PROCESSOR =================
async function processBatch(channels, batchSize = 5) {
  const results = [];
  
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(channels.length / batchSize);
    
    console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} channels)`);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(url => scrapeChannel(url))
    );
    
    // Extract results
    const processedResults = batchResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          url: batch[index],
          status: "error",
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
    
    results.push(...processedResults);
    
    // Show progress
    const successCount = results.filter(r => r.status === "success").length;
    console.log(`📊 Progress: ${results.length}/${channels.length} | Success: ${successCount}`);
    console.log(`🔑 Active API keys: ${keyManager.getActiveKeyCount()}/${API_KEYS.length}`);
    
    // Delay between batches to avoid rate limits
    if (i + batchSize < channels.length) {
      console.log(`⏳ Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return results;
}

// ================= API ROUTE =================
app.post("/scrape", async (req, res) => {
  const { channels } = req.body;

  if (!channels || !Array.isArray(channels)) {
    return res.status(400).json({
      error: "channels must be an array"
    });
  }

  if (channels.length === 0) {
    return res.status(400).json({
      error: "channels array is empty"
    });
  }

  console.log(`\n🚀 Starting scrape of ${channels.length} channels...`);
  console.log(`🔑 Active API keys: ${keyManager.getActiveKeyCount()}/${API_KEYS.length}`);
  console.log(`⚡ Batch size: 5 channels per batch\n`);
  
  try {
    const results = await processBatch(channels, 5);

    const successful = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status !== "success").length;
    const totalEmails = results
      .filter(r => r.emails)
      .reduce((sum, r) => sum + r.emails.length, 0);
    
    console.log(`\n✨ Scraping complete!`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📧 Total emails found: ${totalEmails}`);
    
    res.json({
      total: channels.length,
      successful,
      failed,
      totalEmailsFound: totalEmails,
      apiKeyStats: keyManager.getStats(),
      results: results.map(r => ({
        url: r.url,
        status: r.status,
        title: r.title,
        emailsFound: r.emailsFound || 0,
        error: r.error
      }))
    });
  } catch (err) {
    console.error(`❌ Batch processing error:`, err.message);
    res.status(500).json({
      error: "Batch processing failed",
      message: err.message
    });
  }
});

// ================= GET STATS ROUTE =================
app.get("/stats", async (req, res) => {
  try {
    const totalChannels = await Channel.countDocuments();
    const channelsWithEmails = await Channel.countDocuments({ 
      emails: { $exists: true, $not: { $size: 0 } } 
    });
    
    const allChannels = await Channel.find({ emails: { $exists: true, $not: { $size: 0 } } });
    const totalEmails = allChannels.reduce((sum, ch) => sum + ch.emails.length, 0);
    
    res.json({
      databaseStats: {
        totalChannels,
        channelsWithEmails,
        totalEmails,
        percentageWithEmails: ((channelsWithEmails / totalChannels) * 100).toFixed(2) + '%'
      },
      apiKeyStats: keyManager.getStats()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= GET EMAILS ROUTE =================
app.get("/emails", async (req, res) => {
  try {
    const channels = await Channel.find({ 
      emails: { $exists: true, $not: { $size: 0 } } 
    }).select('title emails subscribers -_id');
    
    const allEmails = channels.reduce((acc, ch) => {
      ch.emails.forEach(email => {
        if (!acc[email]) {
          acc[email] = [];
        }
        acc[email].push({
          title: ch.title,
          subscribers: ch.subscribers
        });
      });
      return acc;
    }, {});
    
    res.json({
      totalUniqueEmails: Object.keys(allEmails).length,
      emails: allEmails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= RESET API KEYS ROUTE =================
app.post("/reset-keys", (req, res) => {
  keyManager.resetQuotaExhaustedKeys();
  keyManager.failedKeys.clear();
  
  // Reset all keys to active
  API_KEYS.forEach(key => {
    keyManager.keyStatus.set(key, { 
      active: true, 
      failures: 0, 
      lastUsed: null,
      quotaExhausted: false 
    });
  });
  
  res.json({
    message: "All API keys reset",
    stats: keyManager.getStats()
  });
});

// ================= HEALTH CHECK =================
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    apiKeys: keyManager.getStats()
  });
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 POST /scrape - Scrape channels for emails`);
  console.log(`📊 GET /stats - View scraping statistics`);
  console.log(`📧 GET /emails - Get all found emails`);
  console.log(`🔄 POST /reset-keys - Reset all API keys`);
  console.log(`❤️ GET /health - Health check\n`);
});