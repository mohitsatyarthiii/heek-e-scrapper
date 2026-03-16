# YouTube Email & Channel Scraper - Production Architecture

## 📋 Overview

This is a production-grade YouTube & Google email/channel scraper designed to extract **5-6k emails per day** and **10-15k channels per day** using advanced techniques:

- ✅ YouTube API Key Rotation (auto-failover when quota exceeded)
- ✅ Google Search with 40+ intelligent queries per keyword
- ✅ Automatic Captcha Bypass (Google & reCAPTCHA protection)
- ✅ Proxy Rotation with failure tracking & cooldown
- ✅ Email Deduplication (prevent duplicates across 10M+ emails)
- ✅ Rate Limiting (adaptive delays per domain)
- ✅ Concurrent Processing (5 browsers × 20 pages = 100 parallel requests)
- ✅ Browser Pool with auto-recovery
- ✅ Worker Thread Processing (multi-core utilization)
- ✅ Real-time Progress Tracking (WebSocket)
- ✅ Comprehensive Logging & Monitoring

---

## 🔧 System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│                    (React + Vite)                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    Express API
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ▼────▼──────┐  ▼─────▼─────┐  ▼──────▼──────┐
├─────────────┤ ├──────────────┤ ├────────────▼─┐
│ Scraper     │ │HybridDisc.  │ │Request Limit │
│ Controller  │ │ Service     │ │ Service      │
└─────────────┘ └──────────────┘ └──────────────┘
         │               │               │
    ┌────┴───────────────┼───────────────┴───┐
    │                    │                   │
▼───▼────┐   ▼───────────▼────┐   ▼─────────▼────┐
├────────┤   ├────────────────┤   ├──────────────┤
│Worker  │   │APIKey Manager  │   │Captcha Bypass│
│Pool    │   │(w/ rotation)   │   │Service       │
└────────┘   └────────────────┘   └──────────────┘
    │               │                   │
    ├───────────────┼───────────────────┤
    │               │                   │
▼───▼──────┐   ▼───▼────┐   ▼──────────▼───┐
├──────────┤   ├────────┤   ├──────────────┤
│Browser   │   │Proxy   │   │Email        │
│Pool      │   │Manager │   │Dedup Service│
└──────────┘   └────────┘   └──────────────┘
    │               │                   │
    └───────────────┼───────────────────┘
                    │
            ┌───────▼────────┐
            │  MongoDB       │
            │  (Channels DB) │
            └────────────────┘
```

---

## 🚀 Quick Start

### 1. Installation

```bash
cd yt-scrapper

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### 2. Configure `.env`

```env
# Server
PORT=3000
NODE_ENV=production

# Database
MONGO_URI=mongodb://localhost:27017/youtube-scraper
REDIS_URL=redis://localhost:6379

# YouTube API Keys (multiple for rotation)
GOOGLE_API_KEYS=key1,key2,key3,key4,key5

# SerpAPI Keys (for Google Search)
SERPAPI_KEYS=your-serpapi-key-1,your-serpapi-key-2

# Proxy List (comma-separated)
PROXY_LIST=http://proxy1:port,http://user:pass@proxy2:port,socks5://proxy3:port

# Scraping Configuration
MAX_BROWSERS=5
MAX_PAGES=20
REQUESTS_PER_MINUTE=60
MAX_RETRIES=3
TIMEOUT=30000
TARGET_EMAILS=6000
CHANNELS_PER_QUERY=50
MAX_CHANNELS_PER_KEYWORD=500

# Keyword Expansion
USE_AI_EXPANSION=false
MAX_KEYWORDS=20
```

### 3. Start Services

```bash
# Terminal 1: MongoDB
mongod

# Terminal 2: Redis
redis-server

# Terminal 3: Backend Server
npm start

# Terminal 4: Monitor logs
npm run logs
```

### 4. Test Scraper

```bash
curl -X POST http://localhost:3000/api/scraper/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "digital marketing",
    "country": "india",
    "targetEmails": 1000,
    "minSubscribers": 1000
  }'
```

---

## 📊 Workflow Explanation

### Complete Scraping Flow

```
1. USER SUBMITS KEYWORD
   └─> Frontend sends: { keyword, country, targetEmails }

2. BACKEND RECEIVES REQUEST
   └─> Creates Job record in MongoDB
   └─> Starts async processing

3. KEYWORD EXPANSION (KeywordService)
   ├─> YouTube Autocomplete: digital marketing → digital marketing agency, etc.
   ├─> Google Autocomplete: expand variations
   ├─> AI Expansion: (optional) generate related keywords
   └─> Result: 20-30 keywords ready for search

4. HYBRID DISCOVERY (HybridDiscoveryService)
   
   ├─ PHASE 1: GOOGLE DISCOVERY (Email-first)
   │  ├─> Generate 40+ queries focused on emails
   │  │    Examples:
   │  │    - site:youtube.com "@gmail.com" digital marketing
   │  │    - site:youtube.com "business inquiries" digital marketing
   │  │    - site:youtube.com/about "email" digital marketing
   │  │    - "digital marketing" "contact me" youtube
   │  │    - etc.
   │  │
   │  ├─> Try API methods in order:
   │  │   1️⃣ SerpAPI (most reliable) - with quota tracking
   │  │   2️⃣ Google API - with key rotation
   │  │   3️⃣ Browser scraping - with captcha bypass
   │  │
   │  └─> Result: 500-1000 channels with email context
   │
   ├─ PHASE 2: YOUTUBE DISCOVERY (Channel-first)
   │  ├─> Direct YouTube search via browser
   │  ├─> Extract channel pages with subscriber data
   │  ├─> Identify channels likely to have contact info
   │  └─> Result: 500-1000 channels
   │
   └─ PHASE 3: RELATED CHANNELS
      ├─> From each discovered channel
      ├─> Find related channels (YouTube recommendation sidebar)
      └─> Result: Additional 500-1000 channels

5. CHANNEL SCRAPING (Worker Pool)
   ├─> Distribute channels to worker threads
   ├─> Each worker:
   │   ├─> Get page from browser pool
   │   ├─> Navigate to channel
   │   ├─> Check for captcha & bypass if needed
   │   ├─> Extract from "About" page
   │   ├─> Extract emails using regex
   │   ├─> Extract websites & social links
   │   └─> Release page for reuse
   │
   └─> Result: 2000-3000 channels scraped with emails

6. EMAIL ENRICHMENT (EmailEnrichmentService)
   ├─> For channels with websites:
   │   ├─> Visit website homepage
   │   ├─> Extract all text
   │   ├─> Search for emails
   │   └─> Find /contact page
   │
   ├─> For Linktree/Beacons links:
   │   ├─> Scrape all linked resources
   │   ├─> Extract emails from links
   │   └─> Aggregate social profiles
   │
   └─> Result: Additional 2000-3000 emails found

7. EMAIL DEDUPLICATION (EmailDeduplicationService)
   ├─> In-memory index of all emails
   ├─> Check against MongoDB for existing emails
   ├─> Remove duplicates
   ├─> Merge duplicate channels
   └─> Result: 5000-6000 unique emails

8. DATABASE STORAGE
   ├─> Save channel data with emails
   ├─> Index by keyword, location, subscriber count
   ├─> Mark enrichment level
   └─> Ready for export/analysis

9. RESULTS TO FRONTEND
   └─> WebSocket real-time updates:
       ├─> Progress: X channels discovered
       ├─> Progress: Y emails found
       ├─> Status: Scraping in progress
       └─> Completion: Full dataset exported
```

---

## 🔑 API Key Rotation System

### How It Works

1. **Multiple API Keys**: Configure 3-5 YouTube API keys in `.env`
2. **Automatic Rotation**: 
   - Each request uses the next key in queue
   - If quota exceeded → automatically switch to next key
   - Tracks daily quota usage per key
3. **Failover**: 
   - Key blocked after 5 consecutive errors
   - Auto-unblock after 30-minute cooldown
   - Falls back to scraping if all keys blocked
4. **Monitoring**:
   ```bash
   GET /api/scraper/status
   # Response includes API key usage stats
   ```

### Example

```javascript
// Automatic rotation happens transparently
const googleKey = apiKeyManager.getNextGoogleKey();
// Returns: { key: "abc123...", index: 0, requestsToday: 45, quotaLimit: 10000 }

// On failure:
apiKeyManager.recordFailure('google', 0, error);
// Next call will return key index 1, then 2, etc.
```

---

## 🚫 Captcha Bypass System

### Techniques Used

1. **Detection First**
   - Checks for reCAPTCHA v2, v3, hCaptcha, image captchas
   - Returns bypass method needed

2. **Automatic Methods**
   - **reCAPTCHA v2**: Attempts checkbox click & token injection
   - **reCAPTCHA v3**: Invisible, waits for automatic completion
   - **hCaptcha**: Frame interaction & button clicks
   - **Image Captcha**: Attempts OCR (requires external service)

3. **Fallback Strategies**
   - Mimic human behavior (mouse movements, delays, scrolling)
   - Wait for 3 minutes for manual solving (if display shows)
   - Rotate proxy to get different IP address
   - Retry with different browser profile

###Usage

```javascript
const captchas = await captchaBypassService.checkForCaptcha(page);
if (captchas.length > 0) {
  const bypassed = await captchaBypassService.bypassCaptcha(page, 60);
  if (bypassed) {
    // Continue scraping
  } else {
    // Log and skip this channel
  }
}
```

---

## 🌐 Proxy Management

### Proxy Configuration

```env
PROXY_LIST=http://proxy1.com:8080,http://user:pass@proxy2.com:3128,socks5://proxy3.com:1080
```

### Automatic Features

1. **Rotation Strategy**
   - Round-robin through proxy list
   - Track failures per proxy
   - Skip failed proxies for 5 minutes
   - Auto-recover after cooldown

2. **Statistics**
   - Success/failure rates
   - Average response time per proxy
   - Consecutive errors tracked
   - Automatic proxy health check

3. **Integration**
   - BrowserPool automatically uses proxies
   - ProxyManager handles failover
   - Each browser gets different proxy for diversity

---

## 📈 Scaling to 5-6k Emails/Day

### Configuration Tuning

```env
# For maximum throughput:
MAX_BROWSERS=10          # More browser instances
MAX_PAGES=50             # More concurrent pages
REQUESTS_PER_MINUTE=120  # Higher rate limit
MAX_KEYWORDS=50          # More keywords to search
```

### Workflow Optimization

1. **Parallel Processing**
   - 5-10 browsers × 20-50 pages = 100-500 concurrent requests
   - Worker threads handle CPU-intensive tasks

2. **Adaptive Rate Limiting**
   - Aggressive at start of search
   - Slower at end to avoid detection
   - Domain-specific limits (Google, YouTube, Instagram, etc.)

3. **Smart Querying**
   - Only run highest-value keyword queries
   - Skip duplicate results
   - Prioritize channels with email indicators

4. **Email Enrichment**
   - Parallel website scraping
   - Skip already-processed websites
   - Cache results to prevent re-scraping

### Expected Results

```
Per Day (12-hour operation):
├─ Keywords Searched: 50-100
├─ Google Queries: 2000-4000
├─ Channels Discovered: 15,000-20,000
├─ Channels Scraped: 10,000-15,000
├─ Emails Found: 5,000-6,000
└─ Unique Channels: 10,000-15,000
```

---

## 📱 Database Schema

### Channel Collection

```javascript
{
  channelId: String,
  channelName: String,
  channelUrl: String (unique),
  avatar: String,
  
  // Emails with priority
  emails: [{
    email: String,
    priority: 'high' | 'medium' | 'low',
    source: 'scraped' | 'enriched' | 'merged',
    verified: Boolean,
    discoveredAt: Date
  }],
  
  // Stats
  subscribers: String,
  subscriberCount: Number,
  videoCount: Number,
  viewCount: Number,
  
  // Location for targeting
  country: String,
  city: String,
  timezone: String,
  
  // How it was found
  discoveredVia: {
    keyword: String,
    query: String,
    source: 'google' | 'youtube' | 'related' | 'commenter'
  },
  
  // Status tracking
  status: 'pending' | 'scraped' | 'enriched' | 'failed',
  lastScrapedAt: Date,
  lastEnrichedAt: Date,
  
  // Enrichment metadata
  websites: [String],
  socialLinks: [{
    platform: String,
    url: String
  }],
  enrichmentData: Object,
  
  timestamps: Date
}
```

### Job Collection

```javascript
{
  jobId: String (unique),
  type: 'scrape' | 'enrich' | 'export',
  status: 'pending' | 'running' | 'completed' | 'failed',
  
  params: {
    keyword: String,
    country: String,
    targetEmails: Number,
    minSubscribers: Number
  },
  
  progress: {
    queries: Number,
    channelsDiscovered: Number,
    channelsScraped: Number,
    emailsFound: Number,
    uniqueEmails: Number
  },
  
  results: {
    channels: [ObjectId],
    emails: [String],
    stats: {
      totalTime: Number,
      avgEmailsPerChannel: Number,
      scraperEfficiency: Number
    }
  },
  
  logs: [{
    level: 'info' | 'warn' | 'error',
    message: String,
    timestamp: Date,
    data: Object
  }],
  
  timestamps: Date
}
```

---

## 🎯 API Endpoints

### Scraper Endpoints

```
POST /api/scraper/jobs
├─ Body: { keyword, country, targetEmails, minSubscribers }
└─ Response: { jobId, message }

GET /api/scraper/jobs/:jobId
└─ Response: { status, progress, results, logs }

POST /api/scraper/jobs/:jobId/pause
└─ Pause running job

POST /api/scraper/jobs/:jobId/resume
└─ Resume paused job

GET /api/scraper/jobs/:jobId/logs
└─ Get job logs with filtering

GET /api/scraper/status
└─ System status including API key usage
```

### Channel Endpoints

```
GET /api/channels?keyword=...&status=...
└─ Query channels by keyword or status

GET /api/channels/:channelId
└─ Get specific channel details

GET /api/channels/emails
└─ Export all unique emails

POST /api/channels/export
└─ Export to CSV/JSON
```

---

## 📊 Monitoring & Logs

### Real-time Dashboard

```bash
# Access monitoring dashboard
http://localhost:3000/dashboard

# Shows:
├─ Running jobs count
├─ Emails found (real-time)
├─ API key status
├─ Proxy status
├─ Browser pool health
├─ Rate limit status
└─ Error logs
```

### Health Check

```bash
curl http://localhost:3000/health
# Response: { status: "ok", uptime: 3600, browserPool: {...} }
```

---

## 🔐 Best Practices

### To Avoid Getting Blocked

1. **Use Proxies**
   - Rotate proxy for each request
   - Use high-quality proxies (low latency)
   - Test proxy health regularly

2. **Respect Rate Limits**
   - Follow domain-specific delays
   - Use adaptive rate limiting
   - Back off when rate limited (HTTP 429)

3. **Mimic Human Behavior**
   - Random delays between actions
   - Mouse movements & scrolling
   - Accept cookies
   - Random User-Agents

4. **Captcha Handling**
   - Detect captcha early
   - Attempt bypass before timeout
   - Switch IP if captcha persistent
   - Skip channel if captcha fails

5. **API Key Management**
   - Rotate keys automatically
   - Monitor quota usage
   - Have backup keys ready
   - Use multiple key types (SerpAPI + Google)

---

## 🐛 Troubleshooting

### Issue: "All API keys quota exceeded"

**Solution:**
```bash
# Add more API keys to .env
GOOGLE_API_KEYS=key1,key2,key3,key4,key5

# Or switch to SerpAPI with higher quota
SERPAPI_KEYS=key1,key2,key3
```

### Issue: "Too many captchas"

**Solution:**
```bash
# Add more proxies
PROXY_LIST=proxy1,proxy2,proxy3,proxy4,proxy5

# Or reduce request rate
MAX_BROWSERS=3
MAX_PAGES=10
REQUESTS_PER_MINUTE=30
```

### Issue: "Duplicate emails"

**Solution:**
```bash
# Reset email deduplication cache
POST /api/admin/dedup/reset

# This reinitializes the in-memory index from database
```

### Issue: "Browser crashes"

**Solution:**
```bash
# Increase timeout and retry count
TIMEOUT=60000
MAX_RETRIES=5

# Or reduce browsers if running low on memory
MAX_BROWSERS=3
```

---

## 📞 Support

For issues, questions, or contributions:
- Check logs: `logs/` directory
- Monitor dashboard: `http://localhost:3000/dashboard`
- API status: `GET /api/scraper/status`

---

## 📄 License

This project is for educational and authorized use only.

Always respect website Terms of Service and local laws.
