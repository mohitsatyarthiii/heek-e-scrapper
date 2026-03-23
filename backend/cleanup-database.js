// ==================== DATABASE CLEANUP SCRIPT ====================
// Is script ko alag se run karo: node cleanup-database.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection
const mongoURI = 'mongodb+srv://mohitsatyarthi11_db_user:fGH17FphUoWt0B3X@cluster0.jmyra5z.mongodb.net/?appName=Cluster0';

// Channel Schema (same as your schema)
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
  sourceChannel: { type: String },
  sourceType: { type: String, enum: ['search', 'related', 'comments', 'suggested'], default: 'search' },
  discoveryDepth: { type: Number, default: 0 }
});

const Channel = mongoose.model('Channel', channelSchema);

// ==================== EMAIL RECTIFICATION FUNCTIONS ====================

// Common email domain corrections
const domainCorrections = {
  'g.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'gmaiI.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaio.com': 'gmail.com',
  'gmak.com': 'gmail.com',
  'gmaol.com': 'gmail.com',
  
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yaho0.com': 'yahoo.com',
  'yah00.com': 'yahoo.com',
  
  'hotmaill.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  
  'outloo k.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  
  'aol.coom': 'aol.com',
  'aool.com': 'aol.com',
  
  'yandex.ru': 'yandex.ru', // Valid, no change
  'mail.ru': 'mail.ru', // Valid, no change
  'protonmail.com': 'protonmail.com', // Valid
  'proton.me': 'proton.me', // Valid
};

// Function to rectify email
function rectifyEmail(email) {
  if (!email || typeof email !== 'string') return email;
  
  let cleaned = email.toLowerCase().trim();
  
  // Remove any whitespace
  cleaned = cleaned.replace(/\s+/g, '');
  
  // Check if it's a valid email format
  if (!cleaned.includes('@') || !cleaned.includes('.')) {
    return null; // Invalid email
  }
  
  const [localPart, domain] = cleaned.split('@');
  
  // Check local part validity
  if (!localPart || localPart.length < 1 || localPart.length > 64) {
    return null;
  }
  
  // Check for multiple @ symbols
  if (cleaned.split('@').length !== 2) {
    return null;
  }
  
  // Rectify common domain mistakes
  let correctedDomain = domain;
  for (const [wrong, correct] of Object.entries(domainCorrections)) {
    if (domain === wrong || domain.includes(wrong)) {
      correctedDomain = correct;
      break;
    }
  }
  
  // Special case: @g.com -> @gmail.com
  if (domain === 'g.com' || domain === 'g.co' || domain === 'g.c' || domain === 'g.om') {
    correctedDomain = 'gmail.com';
  }
  
  // Check if domain has valid structure
  const domainParts = correctedDomain.split('.');
  if (domainParts.length < 2) {
    return null;
  }
  
  // Check TLD length (should be at least 2 characters)
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) {
    return null;
  }
  
  // Reconstruct email
  const rectifiedEmail = `${localPart}@${correctedDomain}`;
  
  // Final validation - must have @ and .
  if (!rectifiedEmail.includes('@') || !rectifiedEmail.includes('.')) {
    return null;
  }
  
  return rectifiedEmail;
}

// ==================== PHONE NUMBER VALIDATION ====================

// Function to validate phone number
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;
  
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Ensure + is only at the beginning
  if (cleaned.includes('+')) {
    const plusCount = (cleaned.match(/\+/g) || []).length;
    if (plusCount > 1) return null;
    if (!cleaned.startsWith('+')) return null;
  }
  
  // Extract digits
  const digits = cleaned.replace(/\D/g, '');
  
  // Check if it's a valid phone number
  // Must have between 10 and 15 digits (international standard)
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  
  // Check if all digits are the same (fake number)
  if (/^(\d)\1{9,}$/.test(digits)) {
    return null;
  }
  
  // Check for sequential numbers (fake)
  const sequential = [
    '0123456789', '1234567890', '0987654321', '9876543210',
    '1111111111', '2222222222', '3333333333', '4444444444',
    '5555555555', '6666666666', '7777777777', '8888888888',
    '9999999999', '0000000000'
  ];
  
  for (const seq of sequential) {
    if (digits.includes(seq)) {
      return null;
    }
  }
  
  // Format the phone number consistently
  if (cleaned.startsWith('+')) {
    return cleaned; // Keep as is with +
  } else if (digits.length === 10) {
    // US/Canada format
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.length > 10) {
    return `+${digits}`;
  }
  
  return cleaned;
}

// ==================== MAIN CLEANUP FUNCTION ====================

async function cleanupDatabase() {
  console.log('🚀 Starting database cleanup...');
  console.log('📧 Emails: Will be rectified (NOT deleted)');
  console.log('📞 Phones: Invalid ones will be deleted\n');
  
  let totalProcessed = 0;
  let emailsRectified = 0;
  let phonesDeleted = 0;
  let channelsUpdated = 0;
  
  try {
    // Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get total channels
    const totalChannels = await Channel.countDocuments();
    console.log(`📊 Total channels in database: ${totalChannels}\n`);
    
    // Process in batches to avoid memory issues
    const batchSize = 100;
    const cursor = Channel.find().cursor();
    
    let batch = [];
    let batchCount = 0;
    
    for await (const channel of cursor) {
      batch.push(channel);
      
      if (batch.length >= batchSize) {
        await processBatch(batch);
        batchCount += batch.length;
        console.log(`✅ Processed ${batchCount}/${totalChannels} channels...`);
        batch = [];
      }
    }
    
    // Process remaining
    if (batch.length > 0) {
      await processBatch(batch);
      console.log(`✅ Processed ${totalChannels}/${totalChannels} channels`);
    }
    
    console.log('\n🎉 Cleanup completed!');
    console.log(`📊 Final Statistics:`);
    console.log(`   - Total channels processed: ${totalProcessed}`);
    console.log(`   - Emails rectified: ${emailsRectified}`);
    console.log(`   - Invalid phones deleted: ${phonesDeleted}`);
    console.log(`   - Channels updated: ${channelsUpdated}`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
  
  // Helper function to process batch
  async function processBatch(channels) {
    for (const channel of channels) {
      totalProcessed++;
      
      let needsUpdate = false;
      const originalEmails = [...(channel.emails || [])];
      const originalPhones = [...(channel.phoneNumbers || [])];
      
      // ===== RECTIFY EMAILS (NO DELETION) =====
      const rectifiedEmails = [];
      
      for (const email of (channel.emails || [])) {
        const rectified = rectifyEmail(email);
        if (rectified) {
          // If email changed, add to rectified count
          if (rectified !== email) {
            emailsRectified++;
            console.log(`   ✏️ Rectified email: ${email} -> ${rectified}`);
          }
          rectifiedEmails.push(rectified);
        } else {
          // Invalid email format - but we still keep it? 
          // As per requirement: "emails delete nhi krni hai"
          // So we keep invalid ones too
          rectifiedEmails.push(email);
          console.log(`   ⚠️ Keeping invalid email (as per policy): ${email}`);
        }
      }
      
      // Remove duplicates from emails
      const uniqueEmails = [...new Set(rectifiedEmails)];
      
      if (JSON.stringify(originalEmails) !== JSON.stringify(uniqueEmails)) {
        channel.emails = uniqueEmails;
        needsUpdate = true;
      }
      
      // ===== VALIDATE PHONE NUMBERS (DELETE INVALID) =====
      const validPhones = [];
      
      for (const phone of (channel.phoneNumbers || [])) {
        const validated = validatePhoneNumber(phone);
        if (validated) {
          validPhones.push(validated);
        } else {
          phonesDeleted++;
          console.log(`   🗑️ Deleting invalid phone: ${phone}`);
        }
      }
      
      // Remove duplicates from phones
      const uniquePhones = [...new Set(validPhones)];
      
      if (JSON.stringify(originalPhones) !== JSON.stringify(uniquePhones)) {
        channel.phoneNumbers = uniquePhones;
        needsUpdate = true;
      }
      
      // ===== UPDATE CONTACT INFO FIELDS =====
      const newContactInfo = {
        hasEmail: uniqueEmails.length > 0,
        hasPhone: uniquePhones.length > 0,
        hasSocial: (channel.socialLinks || []).length > 0,
        hasWebsite: !!channel.websiteUrl
      };
      
      if (JSON.stringify(channel.contactInfo) !== JSON.stringify(newContactInfo)) {
        channel.contactInfo = newContactInfo;
        needsUpdate = true;
      }
      
      // ===== UPDATE HAS_EMAILS FIELD =====
      if (channel.hasEmails !== (uniqueEmails.length > 0)) {
        channel.hasEmails = uniqueEmails.length > 0;
        needsUpdate = true;
      }
      
      // ===== UPDATE LASTUPDATED =====
      if (needsUpdate) {
        channel.lastUpdated = new Date();
        await channel.save();
        channelsUpdated++;
        
        // Log summary for this channel
        if (uniqueEmails.length > 0) {
          console.log(`   📧 Channel ${channel.channelId} now has ${uniqueEmails.length} emails`);
        }
      }
    }
  }
}

// ==================== RUN SPECIFIC FIXES ====================

// Function to specifically fix @g.com to @gmail.com
async function fixGmailDomain() {
  console.log('🔍 Specifically fixing @g.com to @gmail.com...');
  
  try {
    await mongoose.connect(mongoURI);
    
    // Find all channels with emails containing g.com
    const channels = await Channel.find({
      emails: { $regex: '@g\\.com$', $options: 'i' }
    });
    
    console.log(`Found ${channels.length} channels with @g.com emails`);
    
    let fixed = 0;
    
    for (const channel of channels) {
      const originalEmails = [...channel.emails];
      const newEmails = [];
      let changed = false;
      
      for (const email of channel.emails) {
        if (email.endsWith('@g.com') || email.includes('@g.com')) {
          const newEmail = email.replace('@g.com', '@gmail.com');
          newEmails.push(newEmail);
          changed = true;
          console.log(`   Fixing: ${email} -> ${newEmail}`);
          fixed++;
        } else {
          newEmails.push(email);
        }
      }
      
      if (changed) {
        channel.emails = newEmails;
        channel.lastUpdated = new Date();
        await channel.save();
      }
    }
    
    console.log(`✅ Fixed ${fixed} email addresses`);
    
  } catch (error) {
    console.error('Error fixing g.com:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// ==================== VALID DOMAINS LIST ====================

const validDomains = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'protonmail.com', 'proton.me', 'mail.com', 'yandex.ru', 'mail.ru',
  'icloud.com', 'me.com', 'mac.com', 'zoho.com', 'rediffmail.com',
  'live.com', 'msn.com', 'comcast.net', 'verizon.net', 'att.net',
  'btinternet.com', 'ntlworld.com', 'sky.com', 'talktalk.net',
  't-online.de', 'web.de', 'gmx.de', 'freenet.de', 'libero.it',
  'tin.it', 'alice.it', 'virgilio.it', 'telefonica.net', 'terra.com.br',
  'uol.com.br', 'bol.com.br', 'ig.com.br', 'globo.com', 'r7.com'
];

// Function to check if email domain is valid
function isValidDomain(domain) {
  return validDomains.some(valid => 
    domain === valid || domain.endsWith(`.${valid}`) || validDomains.includes(domain)
  );
}

// ==================== RUN THE SCRIPT ====================

console.log('=================================');
console.log('📦 DATABASE CLEANUP SCRIPT');
console.log('=================================\n');

// Ask user what to do
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Options:');
console.log('1. Full database cleanup (rectify emails, validate phones)');
console.log('2. Only fix @g.com to @gmail.com');
console.log('3. Preview only (don\'t save changes)\n');

rl.question('Choose option (1/2/3): ', async (answer) => {
  if (answer === '1') {
    await cleanupDatabase();
  } else if (answer === '2') {
    await fixGmailDomain();
  } else if (answer === '3') {
    await previewCleanup();
  } else {
    console.log('Invalid option');
  }
  rl.close();
});

// Preview function (dry run)
async function previewCleanup() {
  console.log('🔍 PREVIEW MODE - No changes will be saved\n');
  
  try {
    await mongoose.connect(mongoURI);
    
    const totalChannels = await Channel.countDocuments();
    console.log(`📊 Total channels: ${totalChannels}\n`);
    
    // Sample 10 channels for preview
    const sample = await Channel.aggregate([{ $sample: { size: 10 } }]);
    
    let emailIssues = 0;
    let phoneIssues = 0;
    
    for (const channel of sample) {
      console.log(`\n📺 Channel: ${channel.title || channel.channelId}`);
      
      // Check emails
      if (channel.emails && channel.emails.length > 0) {
        console.log(`   Current emails: ${channel.emails.length}`);
        for (const email of channel.emails) {
          const rectified = rectifyEmail(email);
          if (rectified && rectified !== email) {
            console.log(`     ⚠️ Would fix: ${email} -> ${rectified}`);
            emailIssues++;
          } else if (!rectified) {
            console.log(`     ⚠️ Invalid email (would keep): ${email}`);
            emailIssues++;
          }
        }
      }
      
      // Check phones
      if (channel.phoneNumbers && channel.phoneNumbers.length > 0) {
        console.log(`   Current phones: ${channel.phoneNumbers.length}`);
        for (const phone of channel.phoneNumbers) {
          const validated = validatePhoneNumber(phone);
          if (!validated) {
            console.log(`     🗑️ Would delete invalid phone: ${phone}`);
            phoneIssues++;
          }
        }
      }
    }
    
    console.log(`\n📊 Preview Summary:`);
    console.log(`   - Email issues found: ${emailIssues}`);
    console.log(`   - Invalid phones found: ${phoneIssues}`);
    console.log(`\nRun option 1 to apply fixes`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}