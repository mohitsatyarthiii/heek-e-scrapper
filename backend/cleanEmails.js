import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// MongoDB connection
const mongoURI = "mongodb+srv://mohitsatyarthi11_db_user:fGH17FphUoWt0B3X@cluster0.jmyra5z.mongodb.net/?appName=Cluster0";

// Email validation patterns
const EMAIL_PATTERNS = {
  // Valid email regex - strict but covers most cases
  VALID_EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  
  // Common invalid patterns
  INVALID_PATTERNS: [
    /\.jpe?g$/i,           // .jpg, .jpeg
    /\.png$/i,             // .png
    /\.gif$/i,             // .gif
    /\.webp$/i,            // .webp
    /\.svg$/i,             // .svg
    /\.bmp$/i,             // .bmp
    /\.tiff?$/i,           // .tif, .tiff
    /\.pdf$/i,             // .pdf
    /\.docx?$/i,           // .doc, .docx
    /\.mp[34]$/i,          // .mp3, .mp4
    /\.avi$/i,             // .avi
    /\.mov$/i,             // .mov
    /\.zip$/i,             // .zip
    /\.rar$/i,             // .rar
    /\.tar$/i,             // .tar
    /\.gz$/i,              // .gz
    /whatsapp-image/i,     // whatsapp-image-*.jpeg
    /whatsapp-video/i,     // whatsapp-video-*.mp4
    /screenshot/i,         // screenshot-*.png
    /image[-_]/i,          // image-123.jpg
    /photo[-_]/i,          // photo-123.jpg
    /img[-_]/i,            // img-123.jpg
    /pic[-_]/i,            // pic-123.jpg
    /\.php$/i,             // .php files
    /\.html?$/i,           // .html, .htm
    /\.css$/i,             // .css files
    /\.js$/i,              // .js files
    /\.json$/i,            // .json files
    /\.xml$/i,             // .xml files
    /^[0-9]+$/,            // Only numbers
    /^[0-9-]+$/,           // Only numbers and hyphens
    /^[a-z0-9]{32}$/i,     // MD5 hash (32 chars)
    /^[a-z0-9]{40}$/i,     // SHA1 hash (40 chars)
    /^[a-z0-9]{64}$/i,     // SHA256 hash (64 chars)
    /\.{2,}/,              // Multiple dots
    /^[^@]*$/,             // No @ symbol
    /^@/,                  // Starts with @
    /@[^.]*$/,             // No dot after @
    /\s+/,                 // Contains whitespace
    /[^\x00-\x7F]/,        // Non-ASCII characters
  ],
  
  // Domain blacklist (fake/common test domains)
  DOMAIN_BLACKLIST: [
    'example.com',
    'test.com',
    'domain.com',
    'yourdomain.com',
    'email.com',
    'mail.com',
    'address.com',
    'website.com',
    'sample.com',
    'demo.com',
    'fake.com',
    'invalid.com',
    'noreply.com',
    'no-reply.com',
    'noemail.com',
    'temp.com',
    'temporary.com',
    'placeholder.com',
    'user.com',
  ],
  
  // Local part blacklist (common fake local parts)
  LOCAL_BLACKLIST: [
    'test',
    'testing',
    'demo',
    'sample',
    'example',
    'user',
    'admin',
    'webmaster',
    'noreply',
    'no-reply',
    'info',
    'contact',
    'support',
    'sales',
    'hello',
    'hi',
  ]
};

// Connect to MongoDB
mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  cleanEmails();
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Channel Schema (same as your main schema)
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true },
  title: String,
  emails: [{ type: String }],
  phoneNumbers: [{ type: String }],
  // ... other fields
}, { strict: false });

const Channel = mongoose.model('Channel', channelSchema);

// Email validation function
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  const trimmed = email.trim().toLowerCase();
  
  // Check length
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  
  // Check against invalid patterns
  for (const pattern of EMAIL_PATTERNS.INVALID_PATTERNS) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  
  // Check email format
  if (!EMAIL_PATTERNS.VALID_EMAIL.test(trimmed)) {
    return false;
  }
  
  // Split into local part and domain
  const [localPart, domain] = trimmed.split('@');
  
  // Check local part length
  if (localPart.length < 1 || localPart.length > 64) return false;
  
  // Check domain length
  if (domain.length < 3 || domain.length > 255) return false;
  
  // Check domain has at least one dot
  if (!domain.includes('.')) return false;
  
  // Check domain blacklist
  if (EMAIL_PATTERNS.DOMAIN_BLACKLIST.includes(domain)) {
    return false;
  }
  
  // Check local part blacklist
  if (EMAIL_PATTERNS.LOCAL_BLACKLIST.includes(localPart)) {
    return false;
  }
  
  // Check for consecutive dots
  if (localPart.includes('..') || domain.includes('..')) {
    return false;
  }
  
  // Check for valid TLD (at least 2 characters, only letters)
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) {
    return false;
  }
  
  return true;
}

// Clean a single email array
function cleanEmailArray(emails) {
  if (!emails || !Array.isArray(emails)) return [];
  
  // Remove duplicates, validate each email, filter out invalid ones
  const uniqueEmails = [...new Set(emails)];
  const validEmails = uniqueEmails.filter(email => isValidEmail(email));
  
  return validEmails;
}

// Main cleaning function
async function cleanEmails() {
  let totalChannels = 0;
  let channelsUpdated = 0;
  let totalEmailsRemoved = 0;
  let totalEmailsKept = 0;
  let invalidExamples = [];
  
  try {
    console.log('\n🔍 Starting email cleaning process...\n');
    
    // Find all channels with emails
    const channels = await Channel.find({ 
      $or: [
        { emails: { $exists: true, $ne: [] } },
        { emails: { $type: 'array', $ne: [] } }
      ]
    });
    
    totalChannels = channels.length;
    console.log(`📊 Found ${totalChannels} channels with email data\n`);
    
    for (const channel of channels) {
      const originalEmails = [...(channel.emails || [])];
      const cleanedEmails = cleanEmailArray(originalEmails);
      
      const removedCount = originalEmails.length - cleanedEmails.length;
      const keptCount = cleanedEmails.length;
      
      if (removedCount > 0) {
        // Track invalid examples for reporting
        const invalidEmails = originalEmails.filter(e => !isValidEmail(e));
        invalidExamples.push({
          channelId: channel.channelId,
          title: channel.title,
          invalidEmails: invalidEmails.slice(0, 5), // Show first 5 invalid emails
          totalInvalid: invalidEmails.length
        });
        
        // Update channel with cleaned emails
        channel.emails = cleanedEmails;
        channel.hasEmails = cleanedEmails.length > 0;
        channel.lastUpdated = new Date();
        
        await channel.save();
        
        channelsUpdated++;
        totalEmailsRemoved += removedCount;
        totalEmailsKept += keptCount;
        
        console.log(`✅ Updated: ${channel.title}`);
        console.log(`   Removed: ${removedCount} invalid emails`);
        console.log(`   Kept: ${keptCount} valid emails\n`);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total channels processed: ${totalChannels}`);
    console.log(`Channels updated: ${channelsUpdated}`);
    console.log(`Total emails removed: ${totalEmailsRemoved}`);
    console.log(`Total emails kept: ${totalEmailsKept}`);
    console.log(`Cleanup rate: ${((totalEmailsRemoved / (totalEmailsRemoved + totalEmailsKept)) * 100).toFixed(2)}%`);
    
    // Print invalid examples
    if (invalidExamples.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('⚠️  INVALID EMAIL EXAMPLES FOUND & REMOVED');
      console.log('='.repeat(60));
      
      invalidExamples.slice(0, 20).forEach((example, idx) => {
        console.log(`\n${idx + 1}. Channel: ${example.title}`);
        console.log(`   Channel ID: ${example.channelId}`);
        console.log(`   Total invalid emails: ${example.totalInvalid}`);
        console.log(`   Examples:`);
        example.invalidEmails.forEach(email => {
          console.log(`     - ${email}`);
        });
      });
    }
    
    // Print domain statistics
    const domainStats = await getDomainStatistics();
    if (domainStats.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('📧 TOP EMAIL DOMAINS (After Cleaning)');
      console.log('='.repeat(60));
      domainStats.slice(0, 10).forEach(stat => {
        console.log(`${stat.domain}: ${stat.count} emails`);
      });
    }
    
    console.log('\n✅ Email cleaning completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error during cleaning:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Get domain statistics after cleaning
async function getDomainStatistics() {
  const result = await Channel.aggregate([
    { $match: { emails: { $exists: true, $ne: [] } } },
    { $unwind: "$emails" },
    { 
      $group: {
        _id: { $arrayElemAt: [{ $split: ["$emails", "@"] }, 1] },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $project: { domain: "$_id", count: 1, _id: 0 } }
  ]);
  
  return result;
}

// Export functions for use in other scripts
export { isValidEmail, cleanEmailArray };