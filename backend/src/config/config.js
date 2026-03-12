import dotenv from "dotenv";

dotenv.config();

/**
 * Helper to parse numbers safely
 */
function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Load YouTube API keys dynamically
 */
function loadYouTubeKeys() {
  const keys = [];

  for (const key in process.env) {
    if (key.startsWith("YOUTUBE_API_KEY")) {
      const val = process.env[key]?.trim();
      if (val) keys.push(val);
    }
  }

  return keys;
}

/**
 * Load proxy list
 */
function loadProxies() {
  if (!process.env.PROXIES) return [];

  return process.env.PROXIES
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || "development",

  port: parseNumber(process.env.PORT, 5000),

  mongoUri: process.env.MONGO_URI || "",

  workers: {
    maxWorkers: parseNumber(process.env.MAX_WORKERS, 5),
    maxBrowsers: parseNumber(process.env.MAX_BROWSERS, 3),
  },

  scraping: {
    defaultTarget: parseNumber(process.env.DEFAULT_TARGET, 100),
    minSubscribers: parseNumber(process.env.MIN_SUBSCRIBERS, 0),
  },

  youtube: {
    apiKeys: loadYouTubeKeys(),
  },

  proxies: loadProxies(),
};

/**
 * Basic config validation
 */
if (!config.mongoUri) {
  console.warn("⚠️  MONGO_URI is not defined in .env");
}

if (!config.youtube.apiKeys.length) {
  console.warn("⚠️  No YouTube API keys loaded");
}

export default config;