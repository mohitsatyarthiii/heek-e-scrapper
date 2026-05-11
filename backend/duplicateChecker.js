

// duplicateChecker.js
import mongoose from 'mongoose';
import readline from 'readline';
import chalk from 'chalk';

// Create readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Channel Schema (same as your schema but without unique constraint for duplicate checking)
const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, index: true },
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
  emails: [{ type: String }],
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
  leadScore: { type: Number, default: 0, index: true },
  leadCategory: { type: String, default: "NONE", index: true },
  niche: { type: String },
  isHighTicketNiche: { type: Boolean, default: false },
  aiDecision: { type: String, default: "UNKNOWN" },
  lastUpdated: { type: Date, default: Date.now },
  hasEmails: { type: Boolean, default: false, index: true },
  savedReason: { type: String, default: "emails" },
  sourceType: { type: String, default: "search" },
  discoveryDepth: { type: Number, default: 0 },
  scrapedBy: { type: String },
}, { timestamps: false, strict: false });

// Configuration - Add your MongoDB connection strings here
const SOURCE_DB_STRINGS = [
  "mongodb+srv://mohitsatyarthi11_db_user:kUqUCK2aKCs1m2rl@cluster0.usjplvg.mongodb.net/?appName=Cluster0",
  "mongodb+srv://mohitsatyarthi11_db_user:fGH17FphUoWt0B3X@cluster0.jmyra5z.mongodb.net/?appName=Cluster0",
  "mongodb+srv://mohitsatyarthi11_db_user:QRru60sn0yOznetN@cluster0.e8jcgej.mongodb.net/?appName=Cluster0",
  "mongodb+srv://mohitsatyarthi11_db_user:3oh44WDniMDQqwHD@cluster0.focmc3a.mongodb.net/?appName=Cluster0",
  // Add more connection strings as needed
];

const TARGET_DB_STRING = "mongodb+srv://mohitsatyarthi11_db_user:AkpNWt4TvLXDanKz@cluster0.hl25pfs.mongodb.net/?appName=Cluster0";

class DuplicateChannelChecker {
  constructor() {
    this.sourceConnections = [];
    this.targetConnection = null;
    this.allChannels = [];
    this.duplicates = [];
    this.cleanChannels = [];
  }

  async connectToSourceDatabases() {
    console.log(chalk.blue('\n📡 Connecting to source databases...\n'));
    
    for (let i = 0; i < SOURCE_DB_STRINGS.length; i++) {
      try {
        const connection = await mongoose.createConnection(SOURCE_DB_STRINGS[i]).asPromise();
        this.sourceConnections.push({
          connection,
          name: `Source DB ${i + 1}`,
          Channel: connection.model(`Channel_${i}`, channelSchema, 'channels')
        });
        console.log(chalk.green(`✅ Connected to Source DB ${i + 1}`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to connect to Source DB ${i + 1}: ${error.message}`));
      }
    }
  }

  async connectToTargetDatabase() {
    console.log(chalk.blue('\n📡 Connecting to target database...'));
    
    try {
      this.targetConnection = await mongoose.createConnection(TARGET_DB_STRING).asPromise();
      this.TargetChannel = this.targetConnection.model('Channel', channelSchema, 'channels');
      console.log(chalk.green('✅ Connected to target database\n'));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to connect to target database: ${error.message}`));
      throw error;
    }
  }

  async fetchAllChannels() {
    console.log(chalk.blue('\n📊 Fetching channels from all source databases...\n'));
    let totalCount = 0;

    for (const source of this.sourceConnections) {
      try {
        const channels = await source.Channel.find({}).lean();
        console.log(chalk.cyan(`   ${source.name}: Found ${channels.length} channels`));
        this.allChannels.push(...channels);
        totalCount += channels.length;
      } catch (error) {
        console.log(chalk.red(`   Error fetching from ${source.name}: ${error.message}`));
      }
    }

    console.log(chalk.green(`\n📦 Total channels fetched: ${totalCount}\n`));
    return totalCount;
  }

  findDuplicates() {
    console.log(chalk.blue('🔍 Checking for duplicate channels...\n'));
    
    const channelMap = new Map();
    const duplicates = [];
    const uniqueChannels = [];

    for (const channel of this.allChannels) {
      // Create a normalized key for comparison (title + handle/customUrl)
      const title = (channel.title || '').toLowerCase().trim();
      const handle = (channel.customUrl || '').toLowerCase().trim().replace('@', '');
      const key = `${title}_${handle}`;

      if (channelMap.has(key)) {
        // This is a duplicate
        const existingChannel = channelMap.get(key);
        
        // Keep the channel with more data (prefer the one with emails, higher scores, etc.)
        const betterChannel = this.selectBetterChannel(existingChannel.channel, channel);
        
        duplicates.push({
          key,
          channel1: existingChannel.channel,
          channel2: channel,
          kept: betterChannel
        });
        
        // Update the map with the better channel
        channelMap.set(key, {
          channel: betterChannel,
          count: existingChannel.count + 1
        });
      } else {
        channelMap.set(key, {
          channel,
          count: 1
        });
      }
    }

    // Get all unique channels (keeping the best version of each)
    for (const [key, value] of channelMap) {
      uniqueChannels.push(value.channel);
    }

    this.duplicates = duplicates;
    this.cleanChannels = uniqueChannels;

    console.log(chalk.yellow(`⚠️  Found ${duplicates.length} duplicate groups`));
    console.log(chalk.green(`✅ Unique channels: ${uniqueChannels.length}`));
    console.log(chalk.white(`📊 Total channels checked: ${this.allChannels.length}\n`));

    return { duplicates, uniqueChannels };
  }

  selectBetterChannel(channel1, channel2) {
    // Score each channel based on data completeness
    const scoreChannel = (channel) => {
      let score = 0;
      
      // Prefer channels with emails
      if (channel.emails && channel.emails.length > 0) score += 10;
      if (channel.phoneNumbers && channel.phoneNumbers.length > 0) score += 5;
      if (channel.socialLinks && channel.socialLinks.length > 0) score += 3;
      if (channel.websiteUrl) score += 3;
      if (channel.leadScore > 0) score += channel.leadScore / 10;
      if (channel.qualityScore > 0) score += channel.qualityScore / 10;
      if (channel.description && channel.description.length > 50) score += 2;
      if (channel.keywords && channel.keywords.length > 0) score += 1;
      
      return score;
    };

    const score1 = scoreChannel(channel1);
    const score2 = scoreChannel(channel2);

    return score1 >= score2 ? channel1 : channel2;
  }

  displayDuplicates() {
    if (this.duplicates.length === 0) {
      console.log(chalk.green('🎉 No duplicates found!'));
      return;
    }

    console.log(chalk.yellow('\n🔍 DUPLICATE CHANNELS FOUND:'));
    console.log(chalk.yellow('=' .repeat(80)));
    
    this.duplicates.forEach((dup, index) => {
      console.log(chalk.cyan(`\n📋 Duplicate Group #${index + 1}:`));
      console.log(chalk.white(`   Key: ${dup.key}`));
      console.log(chalk.gray(`   Channel 1 - ID: ${dup.channel1.channelId}, Title: ${dup.channel1.title}, Handle: ${dup.channel1.customUrl || 'N/A'}`));
      console.log(chalk.gray(`   Channel 2 - ID: ${dup.channel2.channelId}, Title: ${dup.channel2.title}, Handle: ${dup.channel2.customUrl || 'N/A'}`));
      console.log(chalk.green(`   ✅ Kept: ${dup.kept.title} (ID: ${dup.kept.channelId})`));
      
      // Show what data was preserved
      if (dup.kept.emails?.length) {
        console.log(chalk.blue(`   📧 Emails: ${dup.kept.emails.join(', ')}`));
      }
      if (dup.kept.leadScore) {
        console.log(chalk.blue(`   ⭐ Lead Score: ${dup.kept.leadScore}`));
      }
    });

    console.log(chalk.yellow('\n' + '='.repeat(80)));
    console.log(chalk.white(`\n📊 Summary:`));
    console.log(chalk.yellow(`   Total duplicates found: ${this.duplicates.length}`));
    console.log(chalk.green(`   Clean channels remaining: ${this.cleanChannels.length}`));
    console.log(chalk.gray(`   Total channels originally: ${this.allChannels.length}\n`));
  }

  async seedCleanData() {
    console.log(chalk.blue('\n🚀 Starting to seed clean data to target database...'));
    
    try {
      // Clear existing data in target database
      console.log(chalk.yellow('   Clearing existing data in target database...'));
      await this.TargetChannel.deleteMany({});
      
      // Insert unique channels in batches
      const BATCH_SIZE = 100;
      let inserted = 0;
      
      for (let i = 0; i < this.cleanChannels.length; i += BATCH_SIZE) {
        const batch = this.cleanChannels.slice(i, i + BATCH_SIZE);
        
        // Remove _id to let MongoDB generate new ones
        const cleanBatch = batch.map(channel => {
          const { _id, __v, ...cleanChannel } = channel;
          return cleanChannel;
        });
        
        await this.TargetChannel.insertMany(cleanBatch, { ordered: false });
        inserted += cleanBatch.length;
        
        const progress = ((inserted / this.cleanChannels.length) * 100).toFixed(1);
        console.log(chalk.cyan(`   Progress: ${progress}% (${inserted}/${this.cleanChannels.length})`));
      }
      
      console.log(chalk.green(`\n✅ Successfully seeded ${inserted} unique channels to target database!`));
      
      // Create indexes for better performance
      console.log(chalk.blue('\n📈 Creating indexes...'));
      await this.TargetChannel.createIndexes();
      console.log(chalk.green('✅ Indexes created successfully!\n'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Error seeding data: ${error.message}`));
      throw error;
    }
  }

  async closeConnections() {
    console.log(chalk.blue('\n🔌 Closing database connections...'));
    
    // Close source connections
    for (const source of this.sourceConnections) {
      await source.connection.close();
    }
    
    // Close target connection
    if (this.targetConnection) {
      await this.targetConnection.close();
    }
    
    console.log(chalk.green('✅ All connections closed\n'));
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      rl.question(chalk.white(question), (answer) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  }
}

// Main execution function
async function main() {
  const checker = new DuplicateChannelChecker();
  
  console.log(chalk.magenta('\n🔧 MongoDB Duplicate Channel Checker & Cleaner'));
  console.log(chalk.magenta('='.repeat(60)));
  
  try {
    // Connect to all databases
    await checker.connectToSourceDatabases();
    await checker.connectToTargetDatabase();
    
    if (checker.sourceConnections.length === 0) {
      console.log(chalk.red('❌ No source databases connected. Exiting...'));
      process.exit(1);
    }
    
    // Fetch all channels
    const totalChannels = await checker.fetchAllChannels();
    
    if (totalChannels === 0) {
      console.log(chalk.yellow('⚠️  No channels found in source databases.'));
      process.exit(0);
    }
    
    // Find duplicates
    checker.findDuplicates();
    
    // Display duplicates
    checker.displayDuplicates();
    
    if (checker.duplicates.length > 0) {
      // Ask user what to do
      const action = await checker.askQuestion(
        '\n🤔 What would you like to do?\n' +
        '1. View duplicates only (V)\n' +
        '2. Save clean data (remove duplicates) to target database (S)\n' +
        '3. Cancel and exit (C)\n' +
        'Your choice: '
      );
      
      if (action === 's' || action === 'save' || action === '2') {
        console.log(chalk.yellow('\n⚠️  IMPORTANT: This will only save/CREATE clean data in the target database.'));
        console.log(chalk.yellow('    NO data will be deleted from the source databases.\n'));
        
        const confirm = await checker.askQuestion(
          'Are you sure you want to proceed with seeding clean data? (yes/no): '
        );
        
        if (confirm === 'yes' || confirm === 'y') {
          await checker.seedCleanData();
          console.log(chalk.green('\n🎉 Process completed successfully!'));
          console.log(chalk.green('   Clean data has been seeded to the target database.'));
          console.log(chalk.green('   Original data in source databases remains untouched.\n'));
        } else {
          console.log(chalk.yellow('\n❌ Operation cancelled by user.\n'));
        }
      } else if (action === 'c' || action === 'cancel' || action === '3') {
        console.log(chalk.yellow('\n❌ Operation cancelled. Exiting...\n'));
      } else {
        console.log(chalk.cyan('\n📋 Duplicates viewed. No changes made to any database.\n'));
      }
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
    console.log(chalk.red(error.stack));
  } finally {
    await checker.closeConnections();
    rl.close();
    console.log(chalk.magenta('\n👋 Thank you for using Duplicate Channel Checker!\n'));
  }
}

// Run the script
console.log(chalk.yellow('⚠️  Make sure to update the MongoDB connection strings in the script before running!'));
console.log(chalk.yellow('   - SOURCE_DB_STRINGS: Your 4-5 source databases'));
console.log(chalk.yellow('   - TARGET_DB_STRING: The new database where clean data will be stored\n'));

// Check if user wants to proceed
rl.question(chalk.white('Press Enter to continue or Ctrl+C to exit...'), async () => {
  await main();
  process.exit(0);
});