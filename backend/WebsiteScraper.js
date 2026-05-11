// complete-scraper.js
// Single file Feedspot YouTube Channel Scraper with MongoDB and YouTube API integration

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { google } from 'googleapis';
import pLimit from 'p-limit';

// Load environment variables
dotenv.config();
puppeteer.use(StealthPlugin());

// ==================== MongoDB Connection ====================
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb+srv://mohitsatyarthi11_db_user:PO3t2nJgGwl6VOmm@cluster0.uhokv0p.mongodb.net/?appName=Cluster0');
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// ==================== Mongoose Schemas ====================
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    feedspotUrl: { type: String, required: true },
    keywords: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastScrapedAt: { type: Date },
    totalChannelsFound: { type: Number, default: 0 }
});

const influencerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rank: { type: Number },
    bio: { type: String },
    twitterHandle: { type: String },
    twitterFollowers: { type: String },
    category: { type: String, required: true },
    categorySlug: { type: String, required: true },
    youtubeChannelUrl: { type: String },
    youtubeChannelId: { type: String },
    youtubeChannelTitle: { type: String },
    youtubeSubscriberCount: { type: Number },
    youtubeVideoCount: { type: Number },
    youtubeViewCount: { type: Number },
    youtubePublishedAt: { type: Date },
    youtubeDescription: { type: String },
    youtubeThumbnailUrl: { type: String },
    youtubeCountry: { type: String },
    email: { type: String },
    website: { type: String },
    socialLinks: {
        instagram: { type: String },
        facebook: { type: String },
        twitter: { type: String },
        linkedin: { type: String },
        tiktok: { type: String },
        other: [{ type: String }]
    },
    profileImage: { type: String },
    rawData: { type: mongoose.Schema.Types.Mixed },
    youtubeDataFetched: { type: Boolean, default: false },
    contactInfoExtracted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

influencerSchema.index({ name: 1, category: 1 }, { unique: true });

const scrapingJobSchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    status: { 
        type: String, 
        enum: ['pending', 'running', 'completed', 'failed', 'paused'],
        default: 'pending'
    },
    stage: {
        type: String,
        enum: ['feedspot', 'youtube', 'contacts', 'completed'],
        default: 'feedspot'
    },
    progress: {
        processed: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        successful: { type: Number, default: 0 },
        failed: { type: Number, default: 0 }
    },
    errorLog: [{
        error: String,
        timestamp: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed
    }],
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const Category = mongoose.model('Category', categorySchema);
const Influencer = mongoose.model('Influencer', influencerSchema);
const ScrapingJob = mongoose.model('ScrapingJob', scrapingJobSchema);

// ==================== Feedspot Scraper Class ====================
class FeedspotScraper {
    constructor() {
        this.browser = null;
    }

    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });
        }
        return this.browser;
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }

    extractYouTubeUrl(text) {
        const patterns = [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)?[a-zA-Z0-9_-]+/gi,
            /(?:https?:\/\/)?(?:www\.)?youtu\.be\/[a-zA-Z0-9_-]+/gi,
            /youtube\.com\/[^?\s]+/gi
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[0];
        }
        return null;
    }

    extractEmail(text) {
        const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const match = text.match(emailPattern);
        return match ? match[0] : null;
    }

    extractTwitterHandle(text) {
        const twitterPattern = /@([a-zA-Z0-9_]+)/g;
        const match = text.match(twitterPattern);
        return match ? match[0] : null;
    }

    async scrapeCategory(url, category, categorySlug) {
        console.log(`🔍 Scraping Feedspot: ${url}`);
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('body', { timeout: 10000 });
            await this.autoScroll(page);
            
            const content = await page.content();
            const $ = cheerio.load(content);
            
            const influencers = [];
            const pageText = $('body').text();
            
            // Extract all influencer blocks
            const influencerBlocks = pageText.split(/\d+\.\s+/);
            
            for (let i = 1; i < influencerBlocks.length && i <= 100; i++) {
                const block = influencerBlocks[i];
                if (!block || block.length < 10) continue;
                
                const lines = block.split('\n').filter(l => l.trim());
                const name = lines[0]?.trim() || `Influencer ${i}`;
                
                // Extract data from block
                const blockText = block.substring(0, 2000);
                const youtubeUrl = this.extractYouTubeUrl(blockText);
                const email = this.extractEmail(blockText);
                const twitterHandle = this.extractTwitterHandle(blockText);
                
                // Extract website
                const websiteMatch = blockText.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi);
                const website = websiteMatch ? websiteMatch[0] : null;
                
                // Extract followers count
                const followersMatch = blockText.match(/(\d+(?:\.\d+)?[KM]?)\s*Followers?/i);
                const followers = followersMatch ? followersMatch[1] : null;
                
                const influencer = {
                    name: name.replace(/[@#].*$/, '').trim(),
                    rank: i,
                    bio: blockText.substring(0, 500).trim(),
                    twitterHandle,
                    twitterFollowers: followers,
                    category,
                    categorySlug,
                    youtubeChannelUrl: youtubeUrl,
                    email,
                    website,
                    rawData: { fullText: blockText.substring(0, 2000) }
                };
                
                influencers.push(influencer);
            }
            
            // If no influencers found, try link-based extraction
            if (influencers.length === 0) {
                console.log('📌 Using fallback extraction...');
                
                $('a[href*="youtube.com"], a[href*="youtu.be"]').each((idx, elem) => {
                    const youtubeUrl = $(elem).attr('href');
                    const parentText = $(elem).closest('div, article, li').text();
                    const nameMatch = parentText.match(/^[A-Z][a-z]+ [A-Z][a-z]+/);
                    
                    if (youtubeUrl && nameMatch) {
                        influencers.push({
                            name: nameMatch[0],
                            rank: idx + 1,
                            category,
                            categorySlug,
                            youtubeChannelUrl: youtubeUrl,
                            bio: parentText.substring(0, 500).trim(),
                            rawData: { parentText: parentText.substring(0, 1000) }
                        });
                    }
                });
            }
            
            // Save to database
            const savedInfluencers = [];
            for (const inf of influencers) {
                try {
                    const saved = await Influencer.findOneAndUpdate(
                        { name: inf.name, category: inf.category },
                        { ...inf, updatedAt: new Date() },
                        { upsert: true, new: true }
                    );
                    savedInfluencers.push(saved);
                    console.log(`  ✅ Saved: ${inf.name} ${inf.youtubeChannelUrl ? '📺' : ''} ${inf.email ? '📧' : ''}`);
                } catch (error) {
                    console.error(`  ❌ Error saving ${inf.name}:`, error.message);
                }
            }
            
            console.log(`✨ Saved ${savedInfluencers.length} influencers from Feedspot`);
            return savedInfluencers;
            
        } catch (error) {
            console.error('❌ Feedspot scraping error:', error);
            throw error;
        }
    }

    async searchByKeyword(keyword, category) {
        const searchUrl = `https://x.feedspot.com/search?q=${encodeURIComponent(keyword)}`;
        return this.scrapeCategory(searchUrl, category, category.toLowerCase().replace(/\s+/g, '-'));
    }
}

// ==================== YouTube Service Class ====================
class YouTubeService {
    constructor(apiKeys) {
        this.apiKeys = apiKeys.filter(Boolean);
        this.currentKeyIndex = 0;
        this.youtube = google.youtube('v3');
        this.limiter = pLimit(5);
    }

    getNextApiKey() {
        if (this.apiKeys.length === 0) return null;
        const key = this.apiKeys[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return key;
    }

    extractChannelId(url) {
        if (!url) return null;
        
        const patterns = [
            /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
            /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
            /youtube\.com\/@([a-zA-Z0-9_-]+)/,
            /youtube\.com\/user\/([a-zA-Z0-9_-]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async getChannelInfo(channelIdentifier) {
        try {
            const apiKey = this.getNextApiKey();
            if (!apiKey) throw new Error('No YouTube API keys available');
            
            let params = {
                key: apiKey,
                part: 'snippet,statistics,contentDetails,status,brandingSettings'
            };
            
            if (channelIdentifier.startsWith('UC')) {
                params.id = channelIdentifier;
            } else {
                params.forHandle = channelIdentifier.replace('@', '');
            }
            
            const response = await this.youtube.channels.list(params);
            
            if (response.data.items && response.data.items.length > 0) {
                const channel = response.data.items[0];
                return {
                    channelId: channel.id,
                    channelTitle: channel.snippet.title,
                    description: channel.snippet.description,
                    publishedAt: channel.snippet.publishedAt,
                    thumbnailUrl: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
                    country: channel.snippet.country,
                    subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
                    videoCount: parseInt(channel.statistics.videoCount) || 0,
                    viewCount: parseInt(channel.statistics.viewCount) || 0,
                    customUrl: channel.snippet.customUrl
                };
            }
            return null;
        } catch (error) {
            if (error.response?.status === 403) {
                console.log('⚠️ API key quota exceeded, trying next key...');
                return this.getChannelInfo(channelIdentifier);
            }
            console.error('❌ YouTube API error:', error.message);
            return null;
        }
    }

    async extractContactInfo(channelId) {
        try {
            const aboutUrl = `https://www.youtube.com/channel/${channelId}/about`;
            const response = await axios.get(aboutUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            const $ = cheerio.load(response.data);
            const contactInfo = {
                email: null,
                website: null,
                socialLinks: {
                    instagram: null,
                    facebook: null,
                    twitter: null,
                    linkedin: null,
                    tiktok: null,
                    other: []
                }
            };
            
            const pageText = $('body').text();
            
            // Extract email
            const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            const emails = pageText.match(emailPattern) || [];
            const filteredEmails = emails.filter(email => 
                !email.includes('youtube.com') && 
                !email.includes('google.com') &&
                !email.includes('example.com')
            );
            if (filteredEmails.length > 0) {
                contactInfo.email = filteredEmails[0];
            }
            
            // Extract social links
            const socialPatterns = {
                instagram: /instagram\.com\/[a-zA-Z0-9_.]+/i,
                facebook: /facebook\.com\/[a-zA-Z0-9.]+/i,
                twitter: /(?:twitter|x)\.com\/[a-zA-Z0-9_]+/i,
                linkedin: /linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+/i,
                tiktok: /tiktok\.com\/@[a-zA-Z0-9_.]+/i
            };
            
            for (const [platform, pattern] of Object.entries(socialPatterns)) {
                const match = pageText.match(pattern);
                if (match) {
                    contactInfo.socialLinks[platform] = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
                }
            }
            
            // Extract website
            const websitePattern = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s"']*)?/gi;
            const websites = pageText.match(websitePattern) || [];
            const filteredWebsites = websites.filter(w => 
                !w.includes('youtube.com') &&
                !w.includes('google.com') &&
                !w.includes('twitter.com') &&
                !w.includes('facebook.com') &&
                !w.includes('instagram.com')
            );
            if (filteredWebsites.length > 0) {
                contactInfo.website = filteredWebsites[0];
            }
            
            return contactInfo;
        } catch (error) {
            console.error('❌ Contact extraction error:', error.message);
            return null;
        }
    }

    async processInfluencer(influencer) {
        if (!influencer.youtubeChannelUrl) {
            return influencer;
        }
        
        console.log(`📺 Processing: ${influencer.name}`);
        
        try {
            const channelIdentifier = this.extractChannelId(influencer.youtubeChannelUrl);
            if (!channelIdentifier) {
                console.log(`  ⚠️ Could not extract channel ID`);
                return influencer;
            }
            
            const channelInfo = await this.getChannelInfo(channelIdentifier);
            
            if (channelInfo) {
                influencer.youtubeChannelId = channelInfo.channelId;
                influencer.youtubeChannelTitle = channelInfo.channelTitle;
                influencer.youtubeSubscriberCount = channelInfo.subscriberCount;
                influencer.youtubeVideoCount = channelInfo.videoCount;
                influencer.youtubeViewCount = channelInfo.viewCount;
                influencer.youtubePublishedAt = channelInfo.publishedAt;
                influencer.youtubeDescription = channelInfo.description;
                influencer.youtubeThumbnailUrl = channelInfo.thumbnailUrl;
                influencer.youtubeCountry = channelInfo.country;
                
                console.log(`  📊 Subs: ${channelInfo.subscriberCount?.toLocaleString() || 0}`);
                
                const contactInfo = await this.extractContactInfo(channelInfo.channelId);
                if (contactInfo) {
                    influencer.email = contactInfo.email || influencer.email;
                    influencer.website = contactInfo.website || influencer.website;
                    influencer.socialLinks = { ...influencer.socialLinks, ...contactInfo.socialLinks };
                    influencer.contactInfoExtracted = true;
                    
                    if (contactInfo.email) console.log(`  📧 Email found!`);
                }
            }
            
            influencer.youtubeDataFetched = true;
            influencer.updatedAt = new Date();
            return influencer;
            
        } catch (error) {
            console.error(`  ❌ Error:`, error.message);
            influencer.youtubeDataFetched = false;
            return influencer;
        }
    }

    async processBatch(influencers, onProgress = null) {
        const results = [];
        let processed = 0;
        
        const promises = influencers.map(inf => 
            this.limiter(async () => {
                const result = await this.processInfluencer(inf);
                processed++;
                if (onProgress) {
                    onProgress({ processed, total: influencers.length, current: inf.name });
                }
                return result;
            })
        );
        
        return Promise.all(promises);
    }
}

// ==================== Initialize Services ====================
const feedspotScraper = new FeedspotScraper();
const youtubeService = new YouTubeService([
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3
]);

// ==================== Background Scraping Function ====================
async function scrapeInBackground(jobId, category, stage) {
    try {
        const job = await ScrapingJob.findById(jobId);
        
        if (stage === 'feedspot' || stage === 'full') {
            console.log(`\n📋 Stage 1: Scraping Feedspot for ${category.name}`);
            job.stage = 'feedspot';
            await job.save();
            
            const influencers = await feedspotScraper.scrapeCategory(
                category.feedspotUrl,
                category.name,
                category.slug
            );
            
            job.progress.processed = influencers.length;
            job.progress.total = influencers.length;
            job.progress.successful = influencers.length;
            
            await Category.findByIdAndUpdate(category._id, {
                lastScrapedAt: new Date(),
                totalChannelsFound: influencers.filter(i => i.youtubeChannelUrl).length
            });
            
            if (stage === 'feedspot') {
                job.status = 'completed';
                job.stage = 'completed';
                job.completedAt = new Date();
                await job.save();
                await feedspotScraper.closeBrowser();
                console.log(`✅ Feedspot scraping completed!`);
                return;
            }
        }
        
        if (stage === 'youtube' || stage === 'full') {
            console.log(`\n📋 Stage 2: Scraping YouTube channels`);
            job.stage = 'youtube';
            await job.save();
            
            const influencers = await Influencer.find({
                categorySlug: category.slug,
                youtubeChannelUrl: { $ne: null }
            });
            
            console.log(`Found ${influencers.length} influencers with YouTube channels`);
            job.progress.total = influencers.length;
            job.progress.processed = 0;
            await job.save();
            
            const results = await youtubeService.processBatch(
                influencers,
                async (progress) => {
                    job.progress.processed = progress.processed;
                    if (progress.processed % 5 === 0) {
                        await job.save();
                    }
                }
            );
            
            for (const inf of results) {
                await inf.save();
            }
            
            job.progress.successful = results.filter(i => i.youtubeDataFetched).length;
            job.progress.failed = results.filter(i => !i.youtubeDataFetched).length;
        }
        
        job.status = 'completed';
        job.stage = 'completed';
        job.completedAt = new Date();
        await job.save();
        
        await feedspotScraper.closeBrowser();
        console.log(`\n🎉 Scraping job completed!`);
        console.log(`📊 Total channels processed: ${job.progress.processed}`);
        console.log(`📧 Emails found: ${await Influencer.countDocuments({ categorySlug: category.slug, email: { $ne: null } })}`);
        
    } catch (error) {
        console.error('❌ Background scraping error:', error);
        
        const job = await ScrapingJob.findById(jobId);
        if (job) {
            job.status = 'failed';
            job.errorLog.push({
                error: error.message,
                timestamp: new Date(),
                details: error.stack
            });
            await job.save();
        }
        
        await feedspotScraper.closeBrowser();
    }
}

// ==================== Express Server Setup ====================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== API Routes ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Add category
app.post('/api/categories', async (req, res) => {
    try {
        const { name, feedspotUrl, keywords } = req.body;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const category = new Category({ name, slug, feedspotUrl, keywords: keywords || [] });
        await category.save();
        
        res.json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update category
app.put('/api/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const update = req.body;
        
        if (update.name) {
            update.slug = update.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        
        const category = await Category.findByIdAndUpdate(id, update, { new: true });
        res.json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete category
app.delete('/api/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Category.findByIdAndDelete(id);
        await Influencer.deleteMany({ categoryId: id });
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start scraping
app.post('/api/scrape/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { stage = 'full', keywords } = req.body;
        
        let category = await Category.findById(categoryId);
        
        // If keywords provided, search instead of using saved URL
        if (keywords && keywords.length > 0) {
            const searchResults = [];
            for (const keyword of keywords) {
                console.log(`🔍 Searching for keyword: ${keyword}`);
                const results = await feedspotScraper.searchByKeyword(keyword, category.name);
                searchResults.push(...results);
            }
            
            await Category.findByIdAndUpdate(categoryId, {
                lastScrapedAt: new Date(),
                totalChannelsFound: searchResults.filter(i => i.youtubeChannelUrl).length,
                keywords: keywords
            });
            
            return res.json({
                success: true,
                message: `Search completed, found ${searchResults.length} influencers`,
                count: searchResults.length
            });
        }
        
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        
        const job = new ScrapingJob({
            categoryId: category._id,
            status: 'running',
            stage: stage === 'full' ? 'feedspot' : stage,
            startedAt: new Date()
        });
        
        await job.save();
        
        // Start async scraping
        scrapeInBackground(job._id, category, stage);
        
        res.json({
            success: true,
            message: 'Scraping started',
            jobId: job._id
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get job status
app.get('/api/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await ScrapingJob.findById(jobId).populate('categoryId', 'name slug');
        
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        
        res.json({ success: true, data: job });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all jobs
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await ScrapingJob.find()
            .populate('categoryId', 'name slug')
            .sort({ createdAt: -1 })
            .limit(50);
        
        res.json({ success: true, data: jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get influencers with filters
app.get('/api/influencers', async (req, res) => {
    try {
        const { 
            category, 
            hasYoutube, 
            hasEmail, 
            limit = 100, 
            skip = 0,
            minSubscribers,
            sort = 'rank'
        } = req.query;
        
        const query = {};
        
        if (category) query.categorySlug = category;
        if (hasYoutube === 'true') query.youtubeChannelUrl = { $ne: null };
        if (hasEmail === 'true') query.email = { $ne: null };
        if (minSubscribers) query.youtubeSubscriberCount = { $gte: parseInt(minSubscribers) };
        
        const sortOptions = {
            rank: { rank: 1 },
            subscribers: { youtubeSubscriberCount: -1 },
            recent: { updatedAt: -1 }
        };
        
        const influencers = await Influencer.find(query)
            .sort(sortOptions[sort] || sortOptions.rank)
            .limit(parseInt(limit))
            .skip(parseInt(skip));
        
        const total = await Influencer.countDocuments(query);
        
        res.json({
            success: true,
            data: influencers,
            pagination: { total, limit: parseInt(limit), skip: parseInt(skip) }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single influencer
app.get('/api/influencers/:id', async (req, res) => {
    try {
        const influencer = await Influencer.findById(req.params.id);
        if (!influencer) {
            return res.status(404).json({ success: false, error: 'Influencer not found' });
        }
        res.json({ success: true, data: influencer });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update influencer
app.put('/api/influencers/:id', async (req, res) => {
    try {
        const influencer = await Influencer.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        res.json({ success: true, data: influencer });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export contacts
app.get('/api/export', async (req, res) => {
    try {
        const { category, format = 'json', minSubscribers } = req.query;
        
        const query = {
            $or: [
                { email: { $ne: null } },
                { 'socialLinks.instagram': { $ne: null } },
                { website: { $ne: null } }
            ]
        };
        
        if (category) query.categorySlug = category;
        if (minSubscribers) query.youtubeSubscriberCount = { $gte: parseInt(minSubscribers) };
        
        const influencers = await Influencer.find(query)
            .select('name rank category youtubeChannelTitle email website socialLinks youtubeSubscriberCount youtubeChannelUrl')
            .sort({ youtubeSubscriberCount: -1 });
        
        if (format === 'csv') {
            let csv = 'Name,Rank,Category,YouTube Channel,Channel URL,Email,Website,Instagram,Twitter,LinkedIn,Subscribers\n';
            
            influencers.forEach(inf => {
                csv += `"${inf.name || ''}",`;
                csv += `${inf.rank || ''},`;
                csv += `"${inf.category || ''}",`;
                csv += `"${inf.youtubeChannelTitle || ''}",`;
                csv += `"${inf.youtubeChannelUrl || ''}",`;
                csv += `${inf.email || ''},`;
                csv += `${inf.website || ''},`;
                csv += `${inf.socialLinks?.instagram || ''},`;
                csv += `${inf.socialLinks?.twitter || ''},`;
                csv += `${inf.socialLinks?.linkedin || ''},`;
                csv += `${inf.youtubeSubscriberCount || ''}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=influencers-${Date.now()}.csv`);
            return res.send(csv);
        }
        
        res.json({
            success: true,
            data: influencers,
            total: influencers.length,
            summary: {
                withEmail: influencers.filter(i => i.email).length,
                withWebsite: influencers.filter(i => i.website).length,
                withInstagram: influencers.filter(i => i.socialLinks?.instagram).length
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search by keyword
app.post('/api/search', async (req, res) => {
    try {
        const { keyword, category } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ success: false, error: 'Keyword is required' });
        }
        
        console.log(`🔍 Searching for: ${keyword}`);
        const influencers = await feedspotScraper.searchByKeyword(
            keyword, 
            category || 'Custom Search'
        );
        
        res.json({
            success: true,
            data: influencers,
            count: influencers.length
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const totalInfluencers = await Influencer.countDocuments();
        const withYouTube = await Influencer.countDocuments({ youtubeChannelUrl: { $ne: null } });
        const withEmail = await Influencer.countDocuments({ email: { $ne: null } });
        const withWebsite = await Influencer.countDocuments({ website: { $ne: null } });
        
        const topChannels = await Influencer.find({ youtubeSubscriberCount: { $ne: null } })
            .sort({ youtubeSubscriberCount: -1 })
            .limit(10)
            .select('name youtubeChannelTitle youtubeSubscriberCount category');
        
        const categoryStats = await Influencer.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 }, withYouTube: { $sum: { $cond: [{ $ne: ['$youtubeChannelUrl', null] }, 1, 0] } } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            data: {
                totals: { totalInfluencers, withYouTube, withEmail, withWebsite },
                topChannels,
                categoryStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Process specific influencer's YouTube data
app.post('/api/influencers/:id/process-youtube', async (req, res) => {
    try {
        const influencer = await Influencer.findById(req.params.id);
        if (!influencer) {
            return res.status(404).json({ success: false, error: 'Influencer not found' });
        }
        
        const processed = await youtubeService.processInfluencer(influencer);
        await processed.save();
        
        res.json({ success: true, data: processed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk process YouTube for all pending influencers
app.post('/api/process-all-youtube', async (req, res) => {
    try {
        const { category } = req.body;
        
        const query = {
            youtubeChannelUrl: { $ne: null },
            youtubeDataFetched: false
        };
        
        if (category) query.categorySlug = category;
        
        const influencers = await Influencer.find(query).limit(100);
        
        console.log(`📺 Processing ${influencers.length} YouTube channels...`);
        
        const job = new ScrapingJob({
            status: 'running',
            stage: 'youtube',
            startedAt: new Date(),
            progress: { total: influencers.length, processed: 0 }
        });
        await job.save();
        
        // Process in background
        (async () => {
            try {
                const results = await youtubeService.processBatch(
                    influencers,
                    async (progress) => {
                        job.progress.processed = progress.processed;
                        await job.save();
                    }
                );
                
                for (const inf of results) {
                    await inf.save();
                }
                
                job.status = 'completed';
                job.completedAt = new Date();
                job.progress.successful = results.filter(i => i.youtubeDataFetched).length;
                await job.save();
                
                console.log(`✅ Bulk YouTube processing completed`);
            } catch (error) {
                job.status = 'failed';
                job.errorLog.push({ error: error.message });
                await job.save();
            }
        })();
        
        res.json({
            success: true,
            message: `Started processing ${influencers.length} channels`,
            jobId: job._id
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== Server Initialization ====================
const predefinedCategories = [
    {
        name: 'AI Influencers',
        feedspotUrl: 'https://x.feedspot.com/artificial_intelligence_twitter_influencers/',
        keywords: ['artificial intelligence', 'AI', 'machine learning']
    },
    {
        name: 'Tech Influencers',
        feedspotUrl: 'https://x.feedspot.com/technology_twitter_influencers/',
        keywords: ['technology', 'tech', 'startup']
    },
    {
        name: 'Business Influencers',
        feedspotUrl: 'https://x.feedspot.com/business_twitter_influencers/',
        keywords: ['business', 'entrepreneur', 'startup']
    }
];

async function initializeCategories() {
    for (const cat of predefinedCategories) {
        const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await Category.findOneAndUpdate(
            { slug },
            { ...cat, slug },
            { upsert: true }
        );
    }
    console.log('✅ Default categories initialized');
}

// Start server
const startServer = async () => {
    try {
        await connectDB();
        await initializeCategories();
        
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║     🚀 Feedspot YouTube Scraper Server Running             ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT}                                            ║
║  🔗 Health: http://localhost:${PORT}/health                  ║
║  📋 API Docs available at startup                          ║
╠════════════════════════════════════════════════════════════╣
║  API Endpoints:                                            ║
║  GET  /api/categories         - List all categories        ║
║  POST /api/categories         - Add new category           ║
║  POST /api/scrape/:id         - Start scraping             ║
║  GET  /api/jobs/:id           - Get job status             ║
║  GET  /api/influencers        - List influencers           ║
║  GET  /api/export             - Export contacts            ║
║  POST /api/search             - Search by keyword          ║
║  GET  /api/stats              - Get statistics             ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Server startup error:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await feedspotScraper.closeBrowser();
    await mongoose.connection.close();
    process.exit(0);
});

// Start the server
startServer();

export { app, Category, Influencer, ScrapingJob, feedspotScraper, youtubeService };