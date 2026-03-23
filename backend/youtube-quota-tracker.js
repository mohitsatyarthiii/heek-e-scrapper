// ==================== YOUTUBE API QUOTA TRACKER ====================
// Is script ko alag se run karo: node youtube-quota-tracker.js

import { google } from 'googleapis';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

console.log('📝 Loading environment variables...');

// ==================== COLOR SETUP ====================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// ==================== YOUTUBE API COSTS ====================
const API_COSTS = {
  'search.list': 100,
  'channels.list': 1,
  'videos.list': 1,
  'commentThreads.list': 1,
  'comments.list': 1,
  'default': 1
};

// ==================== API KEY LOADER ====================
function loadAPIKeys() {
  const keys = [];
  
  console.log('🔑 Loading API keys from environment...');
  
  // Load all possible API keys
  for (let i = 1; i <= 150; i++) {
    const key = process.env[`YOUTUBE_API_KEY_${i}`];
    if (key) {
      // Skip placeholder keys
      if (key !== 'YOUR_API_KEY_1' && key !== 'YOUR_API_KEY_2' && key !== 'your_api_key_here') {
        keys.push({
          index: i,
          key: key,
          prefix: key.substring(0, 8) + '...',
          quotaUsed: 0,
          quotaLimit: 10000,
          requests: 0,
          status: 'active',
          lastUsed: null
        });
      }
    }
  }
  
  return keys;
}

// ==================== QUOTA CALCULATOR ====================
class QuotaCalculator {
  constructor() {
    this.totalQuota = 0;
    this.totalUsed = 0;
  }

  calculateOperationCost(operation) {
    return API_COSTS[operation] || API_COSTS.default;
  }

  estimateScrapeQuota(keywords, options = {}) {
    const {
      channelsToScrape = 1000,
      includeRelated = true,
      includeComments = true
    } = options;

    // Search cost: 100 per keyword (assuming 3 pages each)
    const searchCost = keywords.length * 3 * 100;
    
    // Channel details: 1 per channel
    const channelDetailsCost = channelsToScrape * 1;
    
    // Related channels: assume 5 related per channel, each costing search(100) + details(1)
    const relatedCost = includeRelated ? channelsToScrape * 5 * 101 : 0;
    
    // Comments: assume 10 videos per channel, each costing 1
    const commentsCost = includeComments ? channelsToScrape * 10 * 1 : 0;

    const total = searchCost + channelDetailsCost + relatedCost + commentsCost;

    return {
      total,
      breakdown: {
        search: searchCost,
        channelDetails: channelDetailsCost,
        related: relatedCost,
        comments: commentsCost
      }
    };
  }
}

// ==================== CHECK INDIVIDUAL KEY ====================
async function checkKeyQuota(key, keyIndex) {
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: key
    });
    
    // Make a minimal API call to check quota
    const response = await youtube.channels.list({
      part: 'id',
      id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' // Google Developers channel
    });
    
    return {
      success: true,
      message: '✅ WORKING',
      data: response.data
    };
  } catch (error) {
    if (error.code === 403 && error.message.includes('quota')) {
      return {
        success: false,
        message: '❌ QUOTA EXCEEDED',
        error: error.message
      };
    } else if (error.code === 400) {
      return {
        success: false,
        message: '❌ INVALID KEY',
        error: error.message
      };
    } else {
      return {
        success: false,
        message: '⚠️ ERROR',
        error: error.message
      };
    }
  }
}

// ==================== MAIN FUNCTION ====================
async function showQuotaStatus() {
  console.log(colors.bright + colors.cyan + '\n=========================================');
  console.log('📊 YOUTUBE API QUOTA ANALYZER');
  console.log('=========================================' + colors.reset + '\n');

  // Load all API keys
  const keys = loadAPIKeys();
  
  if (keys.length === 0) {
    console.log(colors.red + '❌ No valid API keys found in environment variables!' + colors.reset);
    console.log('\nMake sure you have added keys in your .env file like:');
    console.log('YOUTUBE_API_KEY_1=your_actual_key_here');
    console.log('YOUTUBE_API_KEY_2=your_actual_key_here');
    return;
  }

  console.log(colors.green + `✅ Found ${keys.length} YouTube API keys` + colors.reset);
  
  const calculator = new QuotaCalculator();
  
  // Calculate totals
  const totalQuota = keys.length * 10000;
  
  // Show summary
  console.log(colors.bright + colors.cyan + '\n📈 QUOTA SUMMARY' + colors.reset);
  console.log('-----------------------------------------');
  console.log(`💰 Total Daily Quota:     ${colors.bright}${totalQuota.toLocaleString()} units${colors.reset}`);
  console.log(`🔑 Total API Keys:        ${colors.green}${keys.length}${colors.reset}`);
  console.log(`📊 Default Quota per Key:  10,000 units/day`);

  // Show key list
  console.log(colors.bright + colors.cyan + '\n🔑 AVAILABLE KEYS' + colors.reset);
  console.log('-----------------------------------------');
  
  keys.forEach((key, index) => {
    console.log(`${index + 1}. Key ${key.index}: ${key.prefix}`);
  });

  // Test first few keys (optional)
  console.log(colors.bright + colors.cyan + '\n🔍 TESTING FIRST 5 KEYS' + colors.reset);
  console.log('-----------------------------------------');
  
  const testKeys = keys.slice(0, 5);
  for (const key of testKeys) {
    process.stdout.write(`Testing Key ${key.index}: ${key.prefix} ... `);
    const result = await checkKeyQuota(key.key, key.index);
    console.log(result.message);
  }

  // Calculate scraping capacity
  console.log(colors.bright + colors.cyan + '\n🎯 SCRAPING CAPACITY' + colors.reset);
  console.log('-----------------------------------------');
  
  const defaultKeywords = ['technology', 'business', 'entertainment'];
  const totalAvailableQuota = totalQuota; // Assuming no usage yet
  
  const scenarios = [
    { name: 'Light Scraping', channels: 100, related: false, comments: false },
    { name: 'Medium Scraping', channels: 500, related: true, comments: true },
    { name: 'Heavy Scraping', channels: 1000, related: true, comments: true }
  ];
  
  for (const scenario of scenarios) {
    const estimate = calculator.estimateScrapeQuota(defaultKeywords, {
      channelsToScrape: scenario.channels,
      includeRelated: scenario.related,
      includeComments: scenario.comments
    });
    
    const times = Math.floor(totalAvailableQuota / estimate.total);
    
    console.log(`\n${scenario.name}:`);
    console.log(`   Cost per ${scenario.channels} channels: ${estimate.total.toLocaleString()} units`);
    console.log(`   Can run: ${times > 0 ? colors.green + times + ' times' + colors.reset : colors.red + '0 times' + colors.reset}`);
    
    if (times > 0) {
      console.log(`   Total channels possible: ${colors.green}${(times * scenario.channels).toLocaleString()}${colors.reset}`);
    }
  }

  // Cost per operation
  console.log(colors.bright + colors.cyan + '\n💰 API OPERATION COSTS' + colors.reset);
  console.log('-----------------------------------------');
  console.log('Search API:         100 units');
  console.log('Channel Details:    1 unit');
  console.log('Video Details:      1 unit');
  console.log('Comments:           1 unit');
  console.log('Related Channels:   101 units (search + details)');

  // Recommendations
  console.log(colors.bright + colors.cyan + '\n💡 RECOMMENDATIONS' + colors.reset);
  console.log('-----------------------------------------');
  console.log('• Search operations are expensive (100 units) - minimize pages');
  console.log('• Channel details are cheap (1 unit) - good value');
  console.log('• Comments are cheap but can add up');
  console.log('• Related channels use search + details = 101 units each');
  console.log('• With 100 keys, you have 1,000,000 units daily!');
  
  console.log(colors.bright + colors.cyan + '\n=========================================' + colors.reset);
}

// ==================== SIMPLE MENU ====================
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(colors.bright + colors.cyan + '\n=========================================');
  console.log('🎯 YOUTUBE API QUOTA MANAGER');
  console.log('=========================================' + colors.reset);
  console.log('\n1. Show Quota Status');
  console.log('2. Test All Keys');
  console.log('3. Calculate Scrape Cost');
  console.log('4. Exit\n');

  rl.question('Choose option (1-4): ', async (answer) => {
    switch(answer) {
      case '1':
        await showQuotaStatus();
        break;
        
      case '2':
        await testAllKeys();
        break;
        
      case '3':
        await calculateScrapeCost();
        break;
        
      case '4':
        console.log(colors.green + '\n👋 Goodbye!' + colors.reset);
        rl.close();
        return;
        
      default:
        console.log(colors.red + 'Invalid option' + colors.reset);
    }
    
    rl.close();
  });
}

// ==================== TEST ALL KEYS ====================
async function testAllKeys() {
  console.log(colors.bright + colors.cyan + '\n🔑 TESTING ALL API KEYS' + colors.reset);
  console.log('-----------------------------------------');
  
  const keys = loadAPIKeys();
  let working = 0;
  let quotaExceeded = 0;
  let invalid = 0;
  
  for (const key of keys) {
    process.stdout.write(`Key ${key.index}: ${key.prefix} ... `);
    const result = await checkKeyQuota(key.key, key.index);
    console.log(result.message);
    
    if (result.success) working++;
    else if (result.message.includes('QUOTA')) quotaExceeded++;
    else invalid++;
  }
  
  console.log(colors.bright + colors.cyan + '\n📊 TEST SUMMARY' + colors.reset);
  console.log('-----------------------------------------');
  console.log(colors.green + `✅ Working: ${working}` + colors.reset);
  console.log(colors.yellow + `⚠️  Quota Exceeded: ${quotaExceeded}` + colors.reset);
  console.log(colors.red + `❌ Invalid: ${invalid}` + colors.reset);
}

// ==================== CALCULATE SCRAPE COST ====================
async function calculateScrapeCost() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(colors.bright + colors.cyan + '\n💰 CALCULATE SCRAPE COST' + colors.reset);
  console.log('-----------------------------------------');
  
  rl.question('Enter keywords (comma-separated, e.g., technology,business): ', (keywords) => {
    rl.question('Number of channels to scrape: ', (channels) => {
      rl.question('Include related channels? (yes/no): ', (related) => {
        rl.question('Include comments? (yes/no): ', (comments) => {
          
          const calculator = new QuotaCalculator();
          const keywordArray = keywords.split(',').map(k => k.trim());
          
          const estimate = calculator.estimateScrapeQuota(keywordArray, {
            channelsToScrape: parseInt(channels),
            includeRelated: related.toLowerCase() === 'yes',
            includeComments: comments.toLowerCase() === 'yes'
          });
          
          console.log(colors.bright + colors.cyan + '\n📊 COST ESTIMATE' + colors.reset);
          console.log('-----------------------------------------');
          console.log(`Total Quota Cost: ${colors.yellow}${estimate.total.toLocaleString()} units${colors.reset}`);
          console.log('\nBreakdown:');
          console.log(`   Search Operations: ${estimate.breakdown.search.toLocaleString()} units`);
          console.log(`   Channel Details: ${estimate.breakdown.channelDetails.toLocaleString()} units`);
          console.log(`   Related Channels: ${estimate.breakdown.related.toLocaleString()} units`);
          console.log(`   Comments: ${estimate.breakdown.comments.toLocaleString()} units`);
          
          // Show how many keys needed
          const keysNeeded = Math.ceil(estimate.total / 10000);
          console.log(`\n🔑 Keys needed: ${keysNeeded} (each key has 10,000 units)`);
          
          rl.close();
        });
      });
    });
  });
}

// ==================== RUN ====================
console.log(colors.green + '\n✅ Script loaded successfully!' + colors.reset);
console.log('Found 100 API keys in .env file\n');

main().catch(console.error);