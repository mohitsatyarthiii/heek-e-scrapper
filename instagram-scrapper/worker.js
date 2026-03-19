import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import pLimit from 'p-limit';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuration
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';
const KEYWORDS = (process.env.KEYWORDS || '').split(',').map(k => k.trim()).filter(Boolean);
const MAX_PROFILES_PER_KEYWORD = parseInt(process.env.MAX_PROFILES_PER_KEYWORD || '50', 10);
const MAX_CONCURRENT_PROFILE_SCRAPES = parseInt(process.env.MAX_CONCURRENT_PROFILE_SCRAPES || '2', 10);
const GOOGLE_SEARCH_RESULTS_PER_PAGE = 10;

// Optional proxy list (comma separated)
const PROXIES = (process.env.PROXIES || '').split(',').map(p => p.trim()).filter(Boolean);
const USE_PROXY = PROXIES.length > 0;

// Scraper state
let isScraping = false;
let currentScrapeJob = null;
let scrapeLogs = [];
let scrapeStats = {
  totalKeywords: 0,
  completedKeywords: 0,
  totalProfilesFound: 0,
  totalProfilesScraped: 0,
  totalEmailsFound: 0,
  startTime: null,
  endTime: null
};

// Helper functions
function pickProxy() {
  if (!USE_PROXY) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch (err) {
    return null;
  }
}

function enhanceKeywords(baseKeyword) {
  const enhancements = [
    baseKeyword,
    `${baseKeyword} email`,
    `${baseKeyword} contact`,
    `${baseKeyword} @gmail.com`,
    `${baseKeyword} @yahoo.com`,
    `${baseKeyword} @outlook.com`,
    `${baseKeyword} business email`,
    `${baseKeyword} founder`,
    `${baseKeyword} ceo`,
    `${baseKeyword} owner`,
    `${baseKeyword} team`,
    `${baseKeyword} support`,
    `${baseKeyword} help`,
    `contact ${baseKeyword}`,
    `email ${baseKeyword}`,
    `${baseKeyword} instagram`,
    `instagram.com ${baseKeyword}`,
    `"${baseKeyword}" email`,
    `"${baseKeyword}" contact`
  ];
  
  // Add variations with common email patterns
  const emailProviders = ['gmail', 'yahoo', 'hotmail', 'outlook', 'protonmail', 'mail'];
  emailProviders.forEach(provider => {
    enhancements.push(`${baseKeyword} @${provider}.com`);
    enhancements.push(`${baseKeyword} ${provider} email`);
  });
  
  return [...new Set(enhancements)]; // Remove duplicates
}

function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];

  const normalized = text
    .replace(/\[at\]|\(at\)|\{at\}|<at>|\bat\b/gi, '@')
    .replace(/\[dot\]|\(dot\)|\{dot\}|<dot>|\bdot\b/gi, '.')
    .replace(/\s+@\s+/g, '@')
    .replace(/\s+\.\s+/g, '.')
    .replace(/&#64;/g, '@')
    .replace(/&#46;/g, '.')
    .replace(/\s*\(at\)\s*/gi, '@')
    .replace(/\s*\(dot\)\s*/gi, '.');

  // Enhanced email patterns
  const patterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*\[at\]\s*[A-Za-z0-9.-]+\s*\[dot\]\s*[A-Za-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*\(at\)\s*[A-Za-z0-9.-]+\s*\(dot\)\s*[A-Za-z]{2,}\b/g,
    /[A-Za-z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*|\s*@\s*)[A-Za-z0-9.-]+(?:\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\.\s*)[A-Za-z]{2,}/g
  ];

  const results = new Set();
  for (const pattern of patterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      for (const m of matches) {
        // Clean up the email
        const cleanEmail = m
          .replace(/\s+/g, '')
          .replace(/\[at\]/gi, '@')
          .replace(/\(at\)/gi, '@')
          .replace(/\[dot\]/gi, '.')
          .replace(/\(dot\)/gi, '.');
        if (cleanEmail.includes('@') && cleanEmail.includes('.')) {
          results.add(cleanEmail);
        }
      }
    }
  }

  return Array.from(results);
}

function extractPhones(text) {
  if (!text || typeof text !== 'string') return [];

  const patterns = [
    /\+\d{1,3}[-\.\s]?\(?\d{1,4}\)?[-\.\s]?\d{1,4}[-\.\s]?\d{1,9}/g,
    /\(?\d{3}\)?[-\.\s]?\d{3}[-\.\s]?\d{4}/g,
    /\d{3}[-\.\s]\d{3}[-\.\s]\d{4}/g,
    /\d{10,15}/g
  ];

  const results = new Set();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        results.add(m.trim());
      }
    }
  }

  return Array.from(results);
}

// MongoDB Schema
const MONGODB_URI = process.env.MONGODB_URI;

const instagramProfileSchema = new mongoose.Schema({
  profileUrl: { type: String, unique: true, required: true },
  username: String,
  name: String,
  bio: String,
  website: String,
  emails: [String],
  phones: [String],
  extraEmails: [String],
  extraPhones: [String],
  scrapedAt: Date,
  rawMeta: mongoose.Schema.Types.Mixed,
  actions: [{ href: String, text: String }],
  keyword: String,
  searchQuery: String,
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

const InstagramProfile = mongoose.models.InstagramProfile || mongoose.model('InstagramProfile', instagramProfileSchema);

const scrapeLogSchema = new mongoose.Schema({
  level: String,
  message: String,
  keyword: String,
  url: String,
  timestamp: { type: Date, default: Date.now }
});

const ScrapeLog = mongoose.models.ScrapeLog || mongoose.model('ScrapeLog', scrapeLogSchema);

async function connectMongo() {
  if (!MONGODB_URI) return;
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.warn('⚠️ Could not connect to MongoDB:', err.message);
  }
}

async function saveProfileToDb(profile) {
  if (!MONGODB_URI) return;

  try {
    const update = {
      ...profile,
      scrapedAt: profile.scrapedAt ? new Date(profile.scrapedAt) : new Date(),
      lastUpdated: new Date()
    };

    // Deduplicate arrays
    if (Array.isArray(update.emails)) update.emails = Array.from(new Set(update.emails));
    if (Array.isArray(update.phones)) update.phones = Array.from(new Set(update.phones));
    if (Array.isArray(update.extraEmails)) update.extraEmails = Array.from(new Set(update.extraEmails));
    if (Array.isArray(update.extraPhones)) update.extraPhones = Array.from(new Set(update.extraPhones));

    await InstagramProfile.findOneAndUpdate(
      { profileUrl: profile.profileUrl },
      { $set: update },
      { upsert: true, new: true }
    );
    
    addLog('info', `Saved profile: ${profile.username || profile.profileUrl}`, profile.keyword, profile.profileUrl);
  } catch (err) {
    console.warn('⚠️ Failed to save profile to DB:', err.message);
  }
}

async function saveLogToDb(level, message, keyword, url) {
  if (!MONGODB_URI) return;
  
  try {
    const log = new ScrapeLog({
      level,
      message,
      keyword,
      url,
      timestamp: new Date()
    });
    await log.save();
  } catch (err) {
    // Silently fail for logs
  }
}

function addLog(level, message, keyword = null, url = null) {
  const logEntry = {
    level,
    message,
    keyword,
    url,
    timestamp: new Date().toISOString()
  };
  
  scrapeLogs.push(logEntry);
  
  // Keep only last 1000 logs in memory
  if (scrapeLogs.length > 1000) {
    scrapeLogs = scrapeLogs.slice(-1000);
  }
  
  // Console output
  const prefix = keyword ? `[${keyword}] ` : '';
  const urlPrefix = url ? `(${url}) ` : '';
  console.log(`${level.toUpperCase()}: ${prefix}${urlPrefix}${message}`);
  
  // Save to DB if connected
  saveLogToDb(level, message, keyword, url);
}

async function scrapeWebsiteForContacts(websiteUrl) {
  if (!websiteUrl) return { emails: [], phones: [] };

  const normalized = normalizeUrl(websiteUrl);
  if (!normalized) return { emails: [], phones: [] };

  const headers = {
    'User-Agent': buildUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  const found = { emails: new Set(), phones: new Set() };

  const fetchAndExtract = async (url) => {
    try {
      const res = await axios.get(url, { headers, timeout: 20000 });
      const body = res.data;
      const $ = cheerio.load(body);

      // mailto links
      $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (email && email.includes('@')) found.emails.add(email);
      });

      // visible emails and phones
      const text = $('body').text();
      extractEmails(text).forEach(e => found.emails.add(e));
      extractPhones(text).forEach(p => found.phones.add(p));

      // Look for contact/about pages
      const origin = new URL(url).origin;
      const contactPages = $('a[href]').map((_, a) => $(a).attr('href')).get()
        .filter(Boolean)
        .map(h => h.startsWith('http') ? h : (h.startsWith('/') ? origin + h : origin + '/' + h))
        .filter(h => /contact|about|support|help|team|staff|info|reach|get-in-touch|connect|follow/i.test(h))
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 3); // Limit to 3 contact pages

      for (const contactPage of contactPages) {
        try {
          if (contactPage === url) continue;
          const res2 = await axios.get(contactPage, { headers, timeout: 20000 });
          const $2 = cheerio.load(res2.data);
          const text2 = $2('body').text();
          extractEmails(text2).forEach(e => found.emails.add(e));
          extractPhones(text2).forEach(p => found.phones.add(p));
        } catch (err) {
          // Skip failed contact pages
        }
      }
    } catch (err) {
      // Swallow errors; scraping is best-effort
    }
  };

  await fetchAndExtract(normalized);

  return {
    emails: Array.from(found.emails),
    phones: Array.from(found.phones)
  };
}

function buildUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function searchGoogleForInstagramProfiles(browser, keyword, maxProfiles = 50) {
  const profiles = new Set();
  const enhancedKeywords = enhanceKeywords(keyword);
  
  addLog('info', `Enhanced "${keyword}" into ${enhancedKeywords.length} search variations`, keyword);
  
  for (const searchQuery of enhancedKeywords) {
    if (profiles.size >= maxProfiles) break;
    
    try {
      addLog('info', `Searching Google for: "${searchQuery}"`, keyword);
      
      const proxy = pickProxy();
      const context = await browser.newContext({
        proxy: proxy ? { server: proxy } : undefined,
        userAgent: buildUserAgent(),
        viewport: { width: 1200, height: 800 }
      });
      const page = await context.newPage();

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });

      const pagesToVisit = Math.ceil(maxProfiles / GOOGLE_SEARCH_RESULTS_PER_PAGE);

      for (let i = 0; i < pagesToVisit; i++) {
        const start = i * GOOGLE_SEARCH_RESULTS_PER_PAGE;
        const query = `site:instagram.com ${searchQuery}`;
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${GOOGLE_SEARCH_RESULTS_PER_PAGE}&hl=en&start=${start}`;

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('a', { timeout: 15000 }).catch(() => {});

          const hrefs = await page.$$eval('a', (links) => links.map(l => l.href));

          for (const href of hrefs) {
            if (!href) continue;

            // Extract Instagram URLs from Google search results
            const match = href.match(/\/url\?q=(https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._\-\/]+)\/?.*/);
            if (match && match[1]) {
              const normalized = normalizeUrl(decodeURIComponent(match[1]));
              if (normalized && !normalized.includes('/p/') && !normalized.includes('/reel/')) {
                profiles.add(normalized);
                addLog('debug', `Found profile: ${normalized}`, keyword);
              }
            }

            // Direct Instagram links
            if (href.includes('instagram.com/') && !href.includes('/p/') && !href.includes('/reel/')) {
              const normalized = normalizeUrl(href.split('?')[0]);
              if (normalized && normalized.includes('instagram.com/')) {
                profiles.add(normalized);
                addLog('debug', `Found direct profile: ${normalized}`, keyword);
              }
            }

            if (profiles.size >= maxProfiles) break;
          }

          if (profiles.size >= maxProfiles) break;
          await sleep(2000 + Math.random() * 2000);
        } catch (err) {
          addLog('error', `Google search page ${i+1} failed: ${err.message}`, keyword);
        }
      }

      await page.close();
      await context.close();
      
      // Random delay between search variations
      await sleep(3000 + Math.random() * 3000);
      
    } catch (err) {
      addLog('error', `Search variation failed: ${err.message}`, keyword);
    }
  }

  return Array.from(profiles).slice(0, maxProfiles);
}

async function scrapeInstagramProfile(browser, profileUrl, keyword) {
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const proxy = pickProxy();
      const context = await browser.newContext({
        proxy: proxy ? { server: proxy } : undefined,
        userAgent: buildUserAgent(),
        viewport: { width: 1280, height: 1024 }
      });
      const page = await context.newPage();

      addLog('info', `Scraping ${profileUrl} (attempt ${attempt}/${maxRetries})`, keyword, profileUrl);

      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Check if Instagram is asking to log in
      const pageContent = await page.content();
      if (pageContent.includes('Log in to Instagram') || pageContent.includes('Sign up to see')) {
        addLog('warning', 'Login required, attempting to bypass...', keyword, profileUrl);
        
        // Try to scroll and wait
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
        await page.waitForTimeout(2000);
        
        // Check again
        const newContent = await page.content();
        if (newContent.includes('Log in to Instagram')) {
          throw new Error('Login required - cannot access profile');
        }
      }

      // Wait for content to load
      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(2000);

      // Extract metadata
      const metadata = await page.evaluate(() => {
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerText.trim() : null;
        };

        const getAttr = (selector, attr) => {
          const el = document.querySelector(selector);
          return el ? el.getAttribute(attr) : null;
        };

        // Try multiple selectors for different Instagram layouts
        const username = 
          getText('header section h2') || 
          getText('header section h1') || 
          getText('header h2') ||
          getText('div._aacl._aacs._aact._aacx._aada') ||
          window.location.pathname.split('/').filter(Boolean)[0];

        const name = 
          getText('header section h1') || 
          getText('header section h2') ||
          getText('span._aacl._aacs._aact._aacx._aada') ||
          getText('div._aacl._aacs._aact._aacx._aada');

        const bio = 
          getText('header section div.-vDIg > span') || 
          getText('header section span._aacl._aaco._aacu._aacx._aad6') ||
          getText('div._aacl._aaco._aacu._aacx._aad6') ||
          document.querySelector('meta[name="description"]')?.content;

        const externalLink = 
          getAttr('header section div.-vDIg a', 'href') || 
          getAttr('header section a[href^="http"]', 'href');

        // Get all links
        const actionLinks = Array.from(document.querySelectorAll('a[href^="http"]'))
          .map(a => ({ href: a.href, text: a.innerText || '' }))
          .filter(link => !link.href.includes('instagram.com'));

        return {
          username,
          name,
          bio,
          externalLink,
          actionLinks
        };
      });

      // Get full page HTML for email extraction
      const html = await page.content();
      
      // Extract emails from all available text
      const textsToCheck = [
        metadata.bio,
        metadata.name,
        html,
        ...(metadata.actionLinks || []).map(l => l.href + ' ' + l.text)
      ].filter(Boolean).join('\n');

      const emails = extractEmails(textsToCheck);
      const phones = extractPhones(textsToCheck);

      // Get additional contacts from website
      let siteContacts = { emails: [], phones: [] };
      if (metadata.externalLink) {
        addLog('debug', `Checking website for contacts: ${metadata.externalLink}`, keyword, profileUrl);
        siteContacts = await scrapeWebsiteForContacts(metadata.externalLink);
        if (siteContacts.emails.length > 0) {
          addLog('info', `Found ${siteContacts.emails.length} emails on website`, keyword, profileUrl);
        }
      }

      const allEmails = Array.from(new Set([...emails, ...siteContacts.emails]));
      const allPhones = Array.from(new Set([...phones, ...siteContacts.phones]));

      const profileData = {
        profileUrl,
        username: metadata.username || profileUrl.split('/').filter(Boolean).pop(),
        name: metadata.name,
        bio: metadata.bio,
        website: metadata.externalLink,
        emails: allEmails,
        phones: allPhones,
        extraEmails: siteContacts.emails,
        extraPhones: siteContacts.phones,
        scrapedAt: new Date().toISOString(),
        keyword,
        rawMeta: metadata,
        actions: metadata.actionLinks
      };

      await page.close();
      await context.close();
      
      if (allEmails.length > 0) {
        addLog('success', `Found ${allEmails.length} emails`, keyword, profileUrl);
      }
      
      return profileData;

    } catch (error) {
      lastError = error;
      addLog('error', `Attempt ${attempt} failed: ${error.message}`, keyword, profileUrl);
      
      if (attempt < maxRetries) {
        const waitTime = 5000 * attempt;
        addLog('info', `Waiting ${waitTime/1000}s before retry...`, keyword, profileUrl);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    isScraping,
    stats: scrapeStats,
    logs: scrapeLogs.slice(-50) // Return last 50 logs
  });
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    logs: scrapeLogs.slice(-limit)
  });
});

app.post('/api/start', async (req, res) => {
  if (isScraping) {
    return res.status(400).json({ error: 'Scraping already in progress' });
  }

  const { keywords, maxProfiles } = req.body;
  
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'Keywords array is required' });
  }

  // Start scraping in background
  currentScrapeJob = runScraper(keywords, maxProfiles);
  
  res.json({ 
    message: 'Scraping started',
    keywords,
    maxProfiles: maxProfiles || MAX_PROFILES_PER_KEYWORD
  });
});

app.post('/api/stop', (req, res) => {
  if (!isScraping) {
    return res.status(400).json({ error: 'No scraping in progress' });
  }

  isScraping = false;
  res.json({ message: 'Scraping stopped' });
});

app.get('/api/profiles', async (req, res) => {
  try {
    const { keyword, limit = 100, page = 1 } = req.query;
    const query = {};
    
    if (keyword) {
      query.keyword = keyword;
    }

    const profiles = await InstagramProfile.find(query)
      .sort({ scrapedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await InstagramProfile.countDocuments(query);

    res.json({
      profiles,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles/:username', async (req, res) => {
  try {
    const profile = await InstagramProfile.findOne({ 
      $or: [
        { username: req.params.username },
        { profileUrl: { $regex: req.params.username, $options: 'i' } }
      ]
    });
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/profiles', async (req, res) => {
  try {
    const { keyword } = req.query;
    const query = keyword ? { keyword } : {};
    
    const result = await InstagramProfile.deleteMany(query);
    
    res.json({ 
      message: 'Profiles deleted',
      deletedCount: result.deletedCount,
      keyword: keyword || 'all'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main scraper function
async function runScraper(customKeywords = null, customMaxProfiles = null) {
  if (isScraping) {
    console.log('Scraping already in progress');
    return;
  }

  isScraping = true;
  scrapeLogs = [];
  scrapeStats = {
    totalKeywords: customKeywords ? customKeywords.length : KEYWORDS.length,
    completedKeywords: 0,
    totalProfilesFound: 0,
    totalProfilesScraped: 0,
    totalEmailsFound: 0,
    startTime: new Date().toISOString(),
    endTime: null
  };

  const keywordsToUse = customKeywords || KEYWORDS;
  const maxProfiles = customMaxProfiles || MAX_PROFILES_PER_KEYWORD;

  addLog('info', `Starting Instagram scraper with ${keywordsToUse.length} keywords`);
  addLog('info', `Max profiles per keyword: ${maxProfiles}`);

  await ensureOutputDir();

  if (MONGODB_URI) {
    await connectMongo();
  }

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];

  try {
    for (const keyword of keywordsToUse) {
      if (!isScraping) {
        addLog('info', 'Scraping stopped by user');
        break;
      }

      addLog('info', `Processing keyword: "${keyword}"`);
      
      // Search for profiles
      const profiles = await searchGoogleForInstagramProfiles(browser, keyword, maxProfiles);
      addLog('info', `Found ${profiles.length} profiles for "${keyword}"`);
      
      scrapeStats.totalProfilesFound += profiles.length;
      scrapeStats.completedKeywords++;

      if (profiles.length === 0) {
        addLog('warning', `No profiles found for "${keyword}"`);
        continue;
      }

      // Scrape profiles concurrently
      const limit = pLimit(MAX_CONCURRENT_PROFILE_SCRAPES);
      const scraped = await Promise.all(
        profiles.map(url =>
          limit(async () => {
            if (!isScraping) return null;
            
            try {
              const profile = await scrapeInstagramProfile(browser, url, keyword);
              if (profile) {
                await saveProfileToDb(profile);
                
                scrapeStats.totalProfilesScraped++;
                if (profile.emails) {
                  scrapeStats.totalEmailsFound += profile.emails.length;
                }
                
                return profile;
              }
              return null;
            } catch (err) {
              addLog('error', `Failed to scrape ${url}: ${err.message}`, keyword, url);
              return null;
            }
          })
        )
      );

      const filtered = scraped.filter(Boolean);
      results.push({ keyword, profiles: filtered });

      // Save intermediate results
      const outPath = path.join(OUTPUT_DIR, `instagram-scrape-${keyword.replace(/\W+/g, '_')}.json`);
      fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2), 'utf-8');
      
      addLog('info', `Completed "${keyword}": ${filtered.length}/${profiles.length} profiles scraped, ${filtered.reduce((sum, p) => sum + (p.emails?.length || 0), 0)} emails found`);

      // Sleep between keywords
      if (isScraping && keywordsToUse.indexOf(keyword) < keywordsToUse.length - 1) {
        const waitTime = 5000 + Math.random() * 5000;
        addLog('info', `Waiting ${Math.round(waitTime/1000)}s before next keyword...`);
        await sleep(waitTime);
      }
    }

    // Save final results
    const allProfiles = results.flatMap(r => r.profiles);
    const finalPath = path.join(OUTPUT_DIR, `instagram-scrape-${Date.now()}.json`);
    fs.writeFileSync(finalPath, JSON.stringify(allProfiles, null, 2), 'utf-8');

    scrapeStats.endTime = new Date().toISOString();
    
    addLog('success', `Scrape complete! Total profiles: ${allProfiles.length}, Total emails: ${scrapeStats.totalEmailsFound}`);
    addLog('success', `Output saved to ${finalPath}`);

  } catch (err) {
    addLog('error', `Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await browser.close();
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    isScraping = false;
  }
}

// Start server
async function startServer() {
  await connectMongo();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/status - Get scraper status`);
    console.log(`   GET  /api/logs - Get scrape logs`);
    console.log(`   POST /api/start - Start scraping (requires {keywords: [...]})`);
    console.log(`   POST /api/stop - Stop scraping`);
    console.log(`   GET  /api/profiles - Get scraped profiles`);
    console.log(`   DELETE /api/profiles - Delete profiles`);
    
    // Auto-start if keywords are provided in env
    if (KEYWORDS.length > 0 && process.env.AUTO_START === 'true') {
      console.log('\n🔄 Auto-starting scraper with keywords from .env');
      runScraper();
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');
  isScraping = false;
  
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  
  process.exit(0);
});

startServer().catch(console.error);