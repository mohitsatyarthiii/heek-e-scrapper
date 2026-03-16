import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/youtube-scraper',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // API Keys
  googleApiKeys: (process.env.GOOGLE_API_KEYS || '').split(',').filter(Boolean),
  serpApiKeys: (process.env.SERPAPI_KEYS || '').split(',').filter(Boolean),
  
  // Proxy Configuration
  proxies: (process.env.PROXY_LIST || '').split(',').filter(Boolean).map(p => ({
    url: p,
    failures: 0,
    lastUsed: null
  })),
  
  // Scraping Limits
  limits: {
    maxConcurrentBrowsers: parseInt(process.env.MAX_BROWSERS) || 5,
    maxConcurrentPages: parseInt(process.env.MAX_PAGES) || 20,
    requestsPerMinute: parseInt(process.env.REQUESTS_PER_MINUTE) || 60,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    timeout: parseInt(process.env.TIMEOUT) || 30000,
    
    // Daily targets
    targetEmailsPerDay: parseInt(process.env.TARGET_EMAILS) || 6000,
    channelsPerQuery: parseInt(process.env.CHANNELS_PER_QUERY) || 50,
    maxChannelsPerKeyword: parseInt(process.env.MAX_CHANNELS_PER_KEYWORD) || 500
  },
  
  // Keyword Expansion
  keywordExpansion: {
    useAI: process.env.USE_AI_EXPANSION === 'true',
    maxKeywords: parseInt(process.env.MAX_KEYWORDS) || 20,
    cities: [
      'mumbai', 'delhi', 'bangalore', 'hyderabad', 'ahmedabad',
      'chennai', 'kolkata', 'pune', 'jaipur', 'lucknow'
    ]
  },
  
  // Search Queries
  searchTemplates: [
    'site:youtube.com "@gmail.com" {keyword} {city}',
    'site:youtube.com "business inquiries" {keyword} {city}',
    'site:youtube.com "contact" {keyword} {city}',
    'site:youtube.com "collab" {keyword} {city}',
    '"{keyword}" "email" youtube.com {city}',
    '"{keyword}" "@gmail.com" youtube',
    'site:youtube.com/in "@gmail.com" {keyword}',
    'site:youtube.com/about "email" {keyword}'
  ],
  
  // Email Patterns
  emailPatterns: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /[a-zA-Z0-9._%+-]+\s*[àt]\s*[a-zA-Z0-9.-]+\s*dot\s*[a-zA-Z]{2,}/gi,
    /email:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /mail:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /contact:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  ]
};