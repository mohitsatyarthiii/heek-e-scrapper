// mongoToCsv.js
import mongoose from 'mongoose';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import os from 'os';
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Channel Schema - using strict false to handle different schemas
const channelSchema = new mongoose.Schema({
  channelId: { type: String },
  title: { type: String },
  customUrl: { type: String },
  subscriberCount: { type: Number },
  emails: [{ type: String }],
  description: { type: String },
  videoCount: { type: Number },
  viewCount: { type: Number },
  publishedAt: { type: Date },
  country: { type: String },
  thumbnailUrl: { type: String },
  websiteUrl: { type: String },
  socialLinks: [{ platform: String, url: String }],
  phoneNumbers: [{ type: String }],
  leadScore: { type: Number },
  qualityScore: { type: Number },
  niche: { type: String },
  leadCategory: { type: String },
  keywords: [{ type: String }],
  aiDecision: { type: String },
  isHighTicketNiche: { type: Boolean },
  scrapedAt: { type: Date },
  lastUpdated: { type: Date }
}, { 
  strict: false,
  collection: 'channels'
});

// Country and niche detection configuration
const COUNTRY_CONFIG = {
  // Target countries (we want to KEEP these)
  targetCountries: ['US', 'USA', 'United States', 'GB', 'UK', 'United Kingdom', 'ES', 'Spain', 'DE', 'Germany'],
  
  // Countries to EXCLUDE (Indian creators)
  excludeCountries: ['IN', 'India', 'IND'],
  
  // Keywords that indicate Indian origin
  indianKeywords: [
    'hindi', 'india', 'indian', 'bharat', 'desi', 
    'mumbai', 'delhi', 'bangalore', 'chennai', 'kolkata',
    'hyderabad', 'pune', 'ahmedabad', 'jaipur', 'lucknow',
    'tamil', 'telugu', 'malayalam', 'kannada', 'bengali',
    'marathi', 'gujarati', 'punjabi', 'bollywood'
  ],
  
  // Keywords that indicate target country origin
  targetCountryKeywords: [
    'usa', 'united states', 'america', 'american',
    'uk', 'united kingdom', 'british', 'england', 'london',
    'spain', 'spanish', 'españa', 'madrid', 'barcelona',
    'germany', 'german', 'deutschland', 'berlin', 'munich'
  ]
};

// AI/Tech niche detection configuration
const AI_TECH_CONFIG = {
  // Keywords that indicate AI/Tech niche
  aiTechKeywords: [
    'ai', 'artificial intelligence', 'machine learning', 'deep learning',
    'chatgpt', 'gpt', 'openai', 'llm', 'large language model',
    'tech', 'technology', 'coding', 'programming', 'developer',
    'software', 'automation', 'robot', 'robotics', 'data science',
    'python', 'javascript', 'react', 'node', 'blockchain',
    'web3', 'crypto', 'nft', 'metaverse', 'vr', 'ar',
    'cybersecurity', 'cloud', 'devops', 'api', 'startup',
    'saas', 'tech review', 'gadget', 'gadgets', 'tech news',
    'neural network', 'nlp', 'computer vision', 'tensorflow',
    'pytorch', 'hugging face', 'stable diffusion', 'midjourney',
    'prompt engineering', 'ai tools', 'ai art', 'generative ai',
    'tech tips', 'tech tutorial', 'coding tutorial', 'web development',
    'app development', 'mobile development', 'full stack'
  ],
  
  // Keywords that indicate non-tech/AI content
  nonTechKeywords: [
    'vlog', 'comedy', 'cooking', 'food', 'travel', 'fashion',
    'beauty', 'makeup', 'gaming', 'music', 'dance', 'sports',
    'entertainment', 'reaction', 'prank', 'challenge', 'gaming',
    'minecraft', 'fortnite', 'pubg', 'free fire', 'bgmi',
    'movie', 'film', 'song', 'singing', 'acting', 'drama',
    'news', 'political', 'religion', 'spiritual', 'motivation',
    'study', 'exam', 'education', 'cbse', 'neet', 'jee'
  ]
};

class MongoToCsvExporter {
  constructor() {
    this.connection = null;
    this.Channel = null;
    this.exportPath = '';
  }

  async askQuestion(question) {
    return new Promise((resolve) => {
      rl.question(chalk.cyan(question), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async connectToDatabase() {
    console.log(chalk.blue('\n📡 MongoDB to CSV Exporter - AI/Tech Creators Only'));
    console.log(chalk.blue('='.repeat(60)));
    console.log(chalk.yellow('🌍 Target Countries: US, UK, Spain, Germany'));
    console.log(chalk.yellow('🤖 Niche: AI/Tech creators only'));
    console.log(chalk.yellow('🚫 Excluding: Indian creators\n'));

    const mongoUri = await this.askQuestion('\n📎 Please enter your MongoDB connection string:\n> ');

    if (!mongoUri || !mongoUri.startsWith('mongodb')) {
      console.log(chalk.red('\n❌ Invalid MongoDB connection string!'));
      return false;
    }

    try {
      console.log(chalk.yellow('\n🔄 Connecting to MongoDB...'));
      this.connection = await mongoose.createConnection(mongoUri).asPromise();
      this.Channel = this.connection.model('Channel', channelSchema);
      console.log(chalk.green('✅ Successfully connected to MongoDB!\n'));
      return true;
    } catch (error) {
      console.log(chalk.red(`\n❌ Failed to connect to MongoDB: ${error.message}`));
      return false;
    }
  }

  async getCollectionInfo() {
    try {
      const collections = await this.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      console.log(chalk.yellow('\n📊 Available collections:'));
      collectionNames.forEach((name, index) => {
        console.log(chalk.white(`   ${index + 1}. ${name}`));
      });

      const collectionChoice = await this.askQuestion(
        '\n📁 Enter collection name to export (or press Enter for "channels"):\n> '
      );

      const selectedCollection = collectionChoice || 'channels';

      if (!collectionNames.includes(selectedCollection)) {
        console.log(chalk.red(`\n❌ Collection "${selectedCollection}" not found!`));
        return null;
      }

      this.Channel = this.connection.model('Channel', channelSchema, selectedCollection);
      return selectedCollection;
    } catch (error) {
      console.log(chalk.red(`\n❌ Error getting collections: ${error.message}`));
      return null;
    }
  }

  async askExportPreferences() {
    console.log(chalk.yellow('\n📋 Export Preferences:'));
    
    const emailFilter = await this.askQuestion(
      '📧 Export only channels with emails? (yes/no) [default: yes]:\n> '
    );

    const minSubscribers = await this.askQuestion(
      '👥 Minimum subscriber count? (press Enter to skip):\n> '
    );

    const defaultFileName = `ai_tech_creators_${new Date().toISOString().split('T')[0]}`;
    const customFileName = await this.askQuestion(
      `📝 Enter filename (without extension) [default: ${defaultFileName}]:\n> `
    );

    const useDesktop = await this.askQuestion(
      '💾 Save to Desktop? (yes/no) [default: yes]:\n> '
    );

    return {
      emailOnly: emailFilter.toLowerCase() !== 'no',
      minSubscribers: minSubscribers ? parseInt(minSubscribers) : 0,
      fileName: customFileName || defaultFileName,
      saveToDesktop: useDesktop.toLowerCase() !== 'no'
    };
  }

  isIndianCreator(channel) {
    // Check country field
    if (channel.country) {
      const country = channel.country.toUpperCase().trim();
      if (COUNTRY_CONFIG.excludeCountries.includes(country)) {
        return true;
      }
    }

    // Check description for Indian keywords
    if (channel.description) {
      const desc = channel.description.toLowerCase();
      const hasIndianKeywords = COUNTRY_CONFIG.indianKeywords.some(keyword => 
        desc.includes(keyword)
      );
      
      if (hasIndianKeywords) {
        // Additional check to avoid false positives
        const indianKeywordCount = COUNTRY_CONFIG.indianKeywords.filter(keyword => 
          desc.includes(keyword)
        ).length;
        
        const targetKeywordCount = COUNTRY_CONFIG.targetCountryKeywords.filter(keyword => 
          desc.includes(keyword)
        ).length;
        
        // If more Indian keywords than target country keywords, mark as Indian
        if (indianKeywordCount > targetKeywordCount) {
          return true;
        }
      }
    }

    // Check title for Indian keywords
    if (channel.title) {
      const title = channel.title.toLowerCase();
      const hasIndianInTitle = COUNTRY_CONFIG.indianKeywords.some(keyword => 
        title.includes(keyword)
      );
      
      if (hasIndianInTitle) {
        return true;
      }
    }

    // Check keywords array
    if (channel.keywords && Array.isArray(channel.keywords)) {
      const keywords = channel.keywords.join(' ').toLowerCase();
      const hasIndianKeywords = COUNTRY_CONFIG.indianKeywords.some(keyword => 
        keywords.includes(keyword)
      );
      
      if (hasIndianKeywords) {
        return true;
      }
    }

    return false;
  }

  isTargetCountry(channel) {
    // Check country field
    if (channel.country) {
      const country = channel.country.toUpperCase().trim();
      if (COUNTRY_CONFIG.targetCountries.some(tc => 
        country === tc.toUpperCase() || country.includes(tc.toUpperCase())
      )) {
        return true;
      }
    }

    // Check description for target country keywords
    if (channel.description) {
      const desc = channel.description.toLowerCase();
      const hasTargetKeywords = COUNTRY_CONFIG.targetCountryKeywords.some(keyword => 
        desc.includes(keyword)
      );
      
      if (hasTargetKeywords) {
        return true;
      }
    }

    // Check title for target country keywords
    if (channel.title) {
      const title = channel.title.toLowerCase();
      const hasTargetInTitle = COUNTRY_CONFIG.targetCountryKeywords.some(keyword => 
        title.includes(keyword)
      );
      
      if (hasTargetInTitle) {
        return true;
      }
    }

    return false;
  }

  isAiTechCreator(channel) {
    let score = 0;
    const channelsToCheck = [
      channel.title || '',
      channel.description || '',
      channel.niche || '',
      ...(channel.keywords || [])
    ];

    const content = channelsToCheck.join(' ').toLowerCase();

    // Check for AI/Tech keywords
    AI_TECH_CONFIG.aiTechKeywords.forEach(keyword => {
      if (content.includes(keyword.toLowerCase())) {
        score += 10;
      }
    });

    // Check for non-tech keywords (negative scoring)
    AI_TECH_CONFIG.nonTechKeywords.forEach(keyword => {
      if (content.includes(keyword.toLowerCase())) {
        score -= 5;
      }
    });

    // Check specific fields
    if (channel.niche) {
      const niche = channel.niche.toLowerCase();
      if (['ai', 'tech', 'technology', 'software', 'programming', 'development'].some(t => 
        niche.includes(t)
      )) {
        score += 20;
      }
    }

    if (channel.leadCategory) {
      const category = channel.leadCategory.toLowerCase();
      if (['tech', 'ai', 'software', 'developer'].some(t => 
        category.includes(t)
      )) {
        score += 15;
      }
    }

    if (channel.aiDecision) {
      const decision = channel.aiDecision.toLowerCase();
      if (['tech', 'ai', 'developer'].some(t => 
        decision.includes(t)
      )) {
        score += 15;
      }
    }

    if (channel.isHighTicketNiche) {
      score += 10;
    }

    // Return true if score is positive
    return score > 0;
  }

  filterChannels(channels) {
    console.log(chalk.blue('\n🔍 Filtering channels...'));
    console.log(chalk.yellow('   Applying filters:'));
    console.log(chalk.yellow('   - Excluding Indian creators'));
    console.log(chalk.yellow('   - Only US, UK, Spain, Germany'));
    console.log(chalk.yellow('   - Only AI/Tech niche creators'));

    let filteredChannels = [];
    let indianExcluded = 0;
    let notTargetCountry = 0;
    let notAiTech = 0;

    channels.forEach(channel => {
      // Step 1: Check if Indian creator
      if (this.isIndianCreator(channel)) {
        indianExcluded++;
        return;
      }

      // Step 2: Check if from target country
      if (!this.isTargetCountry(channel)) {
        notTargetCountry++;
        return;
      }

      // Step 3: Check if AI/Tech creator
      if (!this.isAiTechCreator(channel)) {
        notAiTech++;
        return;
      }

      // Channel passed all filters
      filteredChannels.push(channel);
    });

    console.log(chalk.white(`\n   📊 Filter Results:`));
    console.log(chalk.red(`   🇮🇳 Indian creators excluded: ${indianExcluded}`));
    console.log(chalk.yellow(`   🌍 Non-target countries excluded: ${notTargetCountry}`));
    console.log(chalk.yellow(`   📚 Non-AI/Tech creators excluded: ${notAiTech}`));
    console.log(chalk.green(`   ✅ Channels matching criteria: ${filteredChannels.length}`));
    console.log(chalk.gray(`   📦 Total channels processed: ${channels.length}\n`));

    return filteredChannels;
  }

  async fetchChannels(preferences) {
    console.log(chalk.blue('\n🔍 Fetching channel data...'));
    
    const query = {};
    
    if (preferences.emailOnly) {
      query.emails = { $exists: true, $ne: [] };
    }
    
    if (preferences.minSubscribers > 0) {
      query.subscriberCount = { $gte: preferences.minSubscribers };
    }

    try {
      const totalCount = await this.Channel.countDocuments(query);
      console.log(chalk.white(`   Found ${totalCount} total channels in database`));

      if (totalCount === 0) {
        console.log(chalk.yellow('\n⚠️  No channels found matching your criteria!'));
        return [];
      }

      // Fetch all channels
      const channels = await this.Channel.find(query).lean();
      console.log(chalk.green(`   ✅ Fetched ${channels.length} channels for filtering\n`));
      
      // Apply country and niche filters
      const filteredChannels = this.filterChannels(channels);
      
      return filteredChannels;
    } catch (error) {
      console.log(chalk.red(`\n❌ Error fetching channels: ${error.message}`));
      return [];
    }
  }

  transformChannelData(channels) {
    console.log(chalk.blue('🔄 Transforming data for CSV...'));
    
    const transformedData = channels.map((channel, index) => {
      // Build channel link
      let channelLink = '';
      if (channel.customUrl) {
        const handle = channel.customUrl.replace('@', '');
        channelLink = `https://youtube.com/@${handle}`;
      } else if (channel.channelId) {
        channelLink = `https://youtube.com/channel/${channel.channelId}`;
      }

      // Get primary email
      const primaryEmail = channel.emails && channel.emails.length > 0 
        ? channel.emails[0] 
        : '';

      // Format subscriber count
      const subscribers = channel.subscriberCount || 0;

      return {
        srNo: index + 1,
        channelName: channel.title || 'Unknown',
        channelLink: channelLink,
        subscriberCount: subscribers,
        email: primaryEmail,
        country: channel.country || 'Unknown',
        niche: channel.niche || 'AI/Tech',
        channelId: channel.channelId || '',
        videoCount: channel.videoCount || 0,
        viewCount: channel.viewCount || 0,
        leadScore: channel.leadScore || 0,
        qualityScore: channel.qualityScore || 0,
        leadCategory: channel.leadCategory || '',
        isHighTicketNiche: channel.isHighTicketNiche ? 'Yes' : 'No',
        additionalEmails: channel.emails ? channel.emails.slice(1).join('; ') : '',
        websiteUrl: channel.websiteUrl || '',
        description: channel.description ? channel.description.substring(0, 200) : '',
        keywords: channel.keywords ? channel.keywords.join(', ') : ''
      };
    });

    // Sort by subscriber count (highest first)
    transformedData.sort((a, b) => b.subscriberCount - a.subscriberCount);

    // Re-assign serial numbers after sorting
    transformedData.forEach((item, index) => {
      item.srNo = index + 1;
    });

    console.log(chalk.green(`   ✅ Transformed ${transformedData.length} records\n`));
    return transformedData;
  }

  async exportToCsv(data, preferences) {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const exportDir = preferences.saveToDesktop ? desktopPath : process.cwd();
    
    const exportsFolder = path.join(exportDir, 'MongoDB_Exports');
    if (!fs.existsSync(exportsFolder)) {
      fs.mkdirSync(exportsFolder, { recursive: true });
    }

    const filePath = path.join(exportsFolder, `${preferences.fileName}.csv`);

    console.log(chalk.blue('\n💾 Creating CSV file...'));
    console.log(chalk.white(`   Location: ${filePath}`));

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'srNo', title: 'Sr. No.' },
        { id: 'channelName', title: 'Channel Name' },
        { id: 'channelLink', title: 'Channel Link' },
        { id: 'subscriberCount', title: 'Subscribers' },
        { id: 'email', title: 'Email' },
        { id: 'country', title: 'Country' },
        { id: 'niche', title: 'Niche' },
        { id: 'leadCategory', title: 'Lead Category' },
        { id: 'leadScore', title: 'Lead Score' },
        { id: 'qualityScore', title: 'Quality Score' },
        { id: 'isHighTicketNiche', title: 'High Ticket Niche' },
        { id: 'channelId', title: 'Channel ID' },
        { id: 'videoCount', title: 'Videos' },
        { id: 'viewCount', title: 'Total Views' },
        { id: 'additionalEmails', title: 'Additional Emails' },
        { id: 'websiteUrl', title: 'Website' },
        { id: 'keywords', title: 'Keywords' },
        { id: 'description', title: 'Description' }
      ]
    });

    try {
      await csvWriter.writeRecords(data);
      
      const stats = fs.statSync(filePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(chalk.green('\n✅ CSV file created successfully!'));
      console.log(chalk.green(`   📁 File: ${preferences.fileName}.csv`));
      console.log(chalk.green(`   📊 Records: ${data.length}`));
      console.log(chalk.green(`   💾 Size: ${fileSizeMB} MB`));
      console.log(chalk.green(`   📍 Location: ${filePath}`));
      
      this.exportPath = filePath;
      return true;
    } catch (error) {
      console.log(chalk.red(`\n❌ Error creating CSV: ${error.message}`));
      return false;
    }
  }

  async displaySummary(data) {
    console.log(chalk.yellow('\n📊 Export Summary:'));
    console.log(chalk.yellow('='.repeat(60)));
    
    const totalSubscribers = data.reduce((sum, item) => sum + item.subscriberCount, 0);
    const channelsWithEmail = data.filter(item => item.email).length;
    const avgSubscribers = Math.round(totalSubscribers / data.length);
    
    // Count by country
    const countryCount = {};
    data.forEach(item => {
      const country = item.country || 'Unknown';
      countryCount[country] = (countryCount[country] || 0) + 1;
    });

    // Count by niche
    const nicheCount = {};
    data.forEach(item => {
      const niche = item.niche || 'Uncategorized';
      nicheCount[niche] = (nicheCount[niche] || 0) + 1;
    });

    console.log(chalk.white(`   Total Channels Exported: ${data.length}`));
    console.log(chalk.white(`   Channels with Email: ${channelsWithEmail} (${((channelsWithEmail/data.length)*100).toFixed(1)}%)`));
    console.log(chalk.white(`   Total Subscribers: ${totalSubscribers.toLocaleString()}`));
    console.log(chalk.white(`   Average Subscribers: ${avgSubscribers.toLocaleString()}`));
    
    console.log(chalk.yellow('\n   📊 By Country:'));
    Object.entries(countryCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        console.log(chalk.white(`   ${country}: ${count} channels`));
      });

    console.log(chalk.yellow('\n   📊 By Niche:'));
    Object.entries(nicheCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([niche, count]) => {
        console.log(chalk.white(`   ${niche}: ${count} channels`));
      });
    
    // Top 5 channels
    const topChannels = data.slice(0, 5);
    if (topChannels.length > 0) {
      console.log(chalk.yellow('\n   🏆 Top 5 Channels:'));
      topChannels.forEach((channel) => {
        console.log(chalk.white(`   ${channel.srNo}. ${channel.channelName} - ${channel.subscriberCount.toLocaleString()} subs (${channel.country})`));
      });
    }
    
    console.log(chalk.yellow('\n' + '='.repeat(60)));
  }

  async closeConnection() {
    if (this.connection) {
      await this.connection.close();
      console.log(chalk.blue('\n🔌 MongoDB connection closed'));
    }
  }
}

async function main() {
  const exporter = new MongoToCsvExporter();
  
  try {
    const connected = await exporter.connectToDatabase();
    if (!connected) {
      process.exit(1);
    }

    const collection = await exporter.getCollectionInfo();
    if (!collection) {
      await exporter.closeConnection();
      process.exit(1);
    }

    const preferences = await exporter.askExportPreferences();

    const channels = await exporter.fetchChannels(preferences);
    
    if (channels.length === 0) {
      console.log(chalk.yellow('\n⚠️  No AI/Tech creators found from target countries!'));
      await exporter.closeConnection();
      process.exit(0);
    }

    const transformedData = exporter.transformChannelData(channels);

    const exported = await exporter.exportToCsv(transformedData, preferences);

    if (exported) {
      await exporter.displaySummary(transformedData);
      
      const openFile = await exporter.askQuestion(
        '\n📂 Would you like to open the file location? (yes/no): '
      );
      
      if (openFile.toLowerCase() === 'yes') {
        const { exec } = await import('child_process');
        const folderPath = path.dirname(exporter.exportPath);
        
        if (process.platform === 'win32') {
          exec(`explorer "${folderPath}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${folderPath}"`);
        } else {
          exec(`xdg-open "${folderPath}"`);
        }
        console.log(chalk.green('📂 File location opened!'));
      }

      console.log(chalk.green('\n🎉 Export completed successfully!\n'));
    }

  } catch (error) {
    console.log(chalk.red(`\n❌ Unexpected error: ${error.message}`));
    console.log(chalk.red(error.stack));
  } finally {
    await exporter.closeConnection();
    rl.close();
    console.log(chalk.blue('\n👋 Thank you for using AI/Tech Creator Exporter!\n'));
    process.exit(0);
  }
}

console.log(chalk.magenta('\n🚀 AI/Tech Creator CSV Exporter'));
console.log(chalk.gray('This tool extracts AI/Tech creators from US, UK, Spain, Germany only'));
console.log(chalk.gray('Indian creators are automatically excluded\n'));

main();