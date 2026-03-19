// ==================== DUPLICATE DETECTION SCRIPT ====================
// Is script ko alag se run karo: node find-duplicates.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection
const mongoURI = 'mongodb+srv://mohitsatyarthi11_db_user:QRru60sn0yOznetN@cluster0.e8jcgej.mongodb.net/?appName=Cluster0';

// Channel Schema
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true },
  title: { type: String },
  emails: [{ type: String }],
  phoneNumbers: [{ type: String }],
  hasEmails: { type: Boolean },
  contactInfo: {
    hasEmail: { type: Boolean },
    hasPhone: { type: Boolean }
  },
  subscriberCount: { type: Number },
  qualityScore: { type: Number },
  scrapedAt: { type: Date }
}, { strict: false });

const Channel = mongoose.model('Channel', channelSchema);

// ==================== DUPLICATE DETECTION FUNCTIONS ====================

async function findDuplicates() {
  console.log('=========================================');
  console.log('🔍 DUPLICATE DETECTION REPORT');
  console.log('=========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    // ===== 1. DUPLICATE CHANNELS (Same channelId) =====
    console.log('📺 DUPLICATE CHANNELS (by channelId):');
    console.log('-----------------------------------------');

    const duplicateChannels = await Channel.aggregate([
      { $group: {
        _id: '$channelId',
        count: { $sum: 1 },
        docs: { $push: '$$ROOT' }
      }},
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (duplicateChannels.length === 0) {
      console.log('✅ No duplicate channels found! (Good)');
    } else {
      console.log(`❌ Found ${duplicateChannels.length} channelIds with duplicates\n`);
      
      let totalDuplicateChannels = 0;
      for (const dup of duplicateChannels) {
        totalDuplicateChannels += dup.count - 1; // Ek original, baaki duplicate
        
        console.log(`\n📌 ChannelId: ${dup._id}`);
        console.log(`   Total copies: ${dup.count}`);
        
        // Show details of each duplicate
        dup.docs.forEach((doc, index) => {
          const isOriginal = index === 0;
          console.log(`   ${isOriginal ? '✅ ORIGINAL' : '🔄 DUPLICATE'} ${index + 1}:`);
          console.log(`      - ID: ${doc._id}`);
          console.log(`      - Title: ${doc.title || 'N/A'}`);
          console.log(`      - Emails: ${doc.emails?.length || 0}`);
          console.log(`      - Phones: ${doc.phoneNumbers?.length || 0}`);
          console.log(`      - Scraped: ${doc.scrapedAt ? new Date(doc.scrapedAt).toLocaleString() : 'N/A'}`);
        });
      }
      
      console.log(`\n📊 Summary: ${totalDuplicateChannels} duplicate channel entries found`);
    }

    // ===== 2. DUPLICATE EMAILS WITHIN SAME CHANNEL =====
    console.log('\n📧 DUPLICATE EMAILS WITHIN CHANNELS:');
    console.log('-----------------------------------------');

    const channelsWithDuplicateEmails = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $project: {
        channelId: 1,
        title: 1,
        emails: 1,
        uniqueEmails: { $setUnion: ['$emails', []] },
        emailCount: { $size: '$emails' }
      }},
      { $addFields: {
        duplicateCount: { 
          $subtract: ['$emailCount', { $size: '$uniqueEmails' }]
        }
      }},
      { $match: { duplicateCount: { $gt: 0 } } },
      { $sort: { duplicateCount: -1 } }
    ]);

    if (channelsWithDuplicateEmails.length === 0) {
      console.log('✅ No channels with duplicate emails found!');
    } else {
      console.log(`❌ Found ${channelsWithDuplicateEmails.length} channels with duplicate emails\n`);
      
      let totalDuplicateEmails = 0;
      channelsWithDuplicateEmails.forEach((channel, index) => {
        if (index < 20) { // Top 20 dikhao
          console.log(`\n📌 Channel: ${channel.title || channel.channelId}`);
          console.log(`   Total emails: ${channel.emailCount}`);
          console.log(`   Unique emails: ${channel.uniqueEmails.length}`);
          console.log(`   Duplicate emails count: ${channel.duplicateCount}`);
          
          // Find which emails are duplicate
          const emailCounts = {};
          channel.emails.forEach(email => {
            emailCounts[email] = (emailCounts[email] || 0) + 1;
          });
          
          const duplicates = Object.entries(emailCounts)
            .filter(([_, count]) => count > 1)
            .map(([email, count]) => ({ email, count }));
          
          if (duplicates.length > 0) {
            console.log(`   Duplicate emails:`);
            duplicates.slice(0, 5).forEach(d => {
              console.log(`      - "${d.email}" appears ${d.count} times`);
            });
            if (duplicates.length > 5) {
              console.log(`      ... and ${duplicates.length - 5} more`);
            }
          }
        }
        totalDuplicateEmails += channel.duplicateCount;
      });
      
      if (channelsWithDuplicateEmails.length > 20) {
        console.log(`\n... and ${channelsWithDuplicateEmails.length - 20} more channels with duplicates`);
      }
      
      console.log(`\n📊 Summary: ${totalDuplicateEmails} duplicate email entries across ${channelsWithDuplicateEmails.length} channels`);
    }

    // ===== 3. DUPLICATE PHONES WITHIN SAME CHANNEL =====
    console.log('\n📞 DUPLICATE PHONES WITHIN CHANNELS:');
    console.log('-----------------------------------------');

    const channelsWithDuplicatePhones = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $project: {
        channelId: 1,
        title: 1,
        phoneNumbers: 1,
        uniquePhones: { $setUnion: ['$phoneNumbers', []] },
        phoneCount: { $size: '$phoneNumbers' }
      }},
      { $addFields: {
        duplicateCount: { 
          $subtract: ['$phoneCount', { $size: '$uniquePhones' }]
        }
      }},
      { $match: { duplicateCount: { $gt: 0 } } },
      { $sort: { duplicateCount: -1 } }
    ]);

    if (channelsWithDuplicatePhones.length === 0) {
      console.log('✅ No channels with duplicate phones found!');
    } else {
      console.log(`❌ Found ${channelsWithDuplicatePhones.length} channels with duplicate phones\n`);
      
      let totalDuplicatePhones = 0;
      channelsWithDuplicatePhones.forEach((channel, index) => {
        if (index < 20) {
          console.log(`\n📌 Channel: ${channel.title || channel.channelId}`);
          console.log(`   Total phones: ${channel.phoneCount}`);
          console.log(`   Unique phones: ${channel.uniquePhones.length}`);
          console.log(`   Duplicate phones count: ${channel.duplicateCount}`);
        }
        totalDuplicatePhones += channel.duplicateCount;
      });
      
      if (channelsWithDuplicatePhones.length > 20) {
        console.log(`\n... and ${channelsWithDuplicatePhones.length - 20} more channels with duplicates`);
      }
      
      console.log(`\n📊 Summary: ${totalDuplicatePhones} duplicate phone entries across ${channelsWithDuplicatePhones.length} channels`);
    }

    // ===== 4. SAME EMAIL ACROSS MULTIPLE CHANNELS =====
    console.log('\n🔄 SAME EMAIL ACROSS MULTIPLE CHANNELS:');
    console.log('-----------------------------------------');

    const duplicateEmailsAcrossChannels = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $unwind: '$emails' },
      { $group: {
        _id: '$emails',
        count: { $sum: 1 },
        channels: { $push: { 
          channelId: '$channelId', 
          title: '$title',
          id: '$_id'
        }}
      }},
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (duplicateEmailsAcrossChannels.length === 0) {
      console.log('✅ No emails shared across multiple channels found!');
    } else {
      console.log(`❌ Found ${duplicateEmailsAcrossChannels.length} emails that appear in multiple channels\n`);
      
      let totalSharedEmails = 0;
      duplicateEmailsAcrossChannels.forEach((item, index) => {
        if (index < 20) {
          console.log(`\n📧 Email: "${item._id}"`);
          console.log(`   Appears in ${item.count} channels:`);
          item.channels.slice(0, 5).forEach((ch, idx) => {
            console.log(`      ${idx + 1}. ${ch.title || ch.channelId}`);
          });
          if (item.channels.length > 5) {
            console.log(`      ... and ${item.channels.length - 5} more`);
          }
        }
        totalSharedEmails += item.count;
      });
      
      if (duplicateEmailsAcrossChannels.length > 20) {
        console.log(`\n... and ${duplicateEmailsAcrossChannels.length - 20} more emails`);
      }
      
      console.log(`\n📊 Summary: ${totalSharedEmails} total occurrences of shared emails`);
    }

    // ===== 5. SAME PHONE ACROSS MULTIPLE CHANNELS =====
    console.log('\n🔄 SAME PHONE ACROSS MULTIPLE CHANNELS:');
    console.log('-----------------------------------------');

    const duplicatePhonesAcrossChannels = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $unwind: '$phoneNumbers' },
      { $group: {
        _id: '$phoneNumbers',
        count: { $sum: 1 },
        channels: { $push: { 
          channelId: '$channelId', 
          title: '$title',
          id: '$_id'
        }}
      }},
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (duplicatePhonesAcrossChannels.length === 0) {
      console.log('✅ No phones shared across multiple channels found!');
    } else {
      console.log(`❌ Found ${duplicatePhonesAcrossChannels.length} phones that appear in multiple channels\n`);
      
      let totalSharedPhones = 0;
      duplicatePhonesAcrossChannels.forEach((item, index) => {
        if (index < 20) {
          console.log(`\n📞 Phone: "${item._id}"`);
          console.log(`   Appears in ${item.count} channels`);
        }
        totalSharedPhones += item.count;
      });
      
      if (duplicatePhonesAcrossChannels.length > 20) {
        console.log(`\n... and ${duplicatePhonesAcrossChannels.length - 20} more phones`);
      }
      
      console.log(`\n📊 Summary: ${totalSharedPhones} total occurrences of shared phones`);
    }

    // ===== 6. CHANNELS WITH EXACT SAME DATA =====
    console.log('\n🔄 CHANNELS WITH EXACT SAME DATA:');
    console.log('-----------------------------------------');

    // Group by email+phone combination
    const exactDuplicateChannels = await Channel.aggregate([
      { $match: { 
        $or: [
          { emails: { $exists: true, $ne: [] } },
          { phoneNumbers: { $exists: true, $ne: [] } }
        ]
      }},
      { $group: {
        _id: {
          emailSet: { $setUnion: ['$emails', []] },
          phoneSet: { $setUnion: ['$phoneNumbers', []] }
        },
        count: { $sum: 1 },
        channels: { $push: { 
          channelId: '$channelId', 
          title: '$title',
          subscriberCount: '$subscriberCount',
          qualityScore: '$qualityScore',
          scrapedAt: '$scrapedAt'
        }}
      }},
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]);

    if (exactDuplicateChannels.length === 0) {
      console.log('✅ No channels with exact same contact data found!');
    } else {
      console.log(`❌ Found ${exactDuplicateChannels.length} groups of channels with identical contact data\n`);
      
      exactDuplicateChannels.forEach((group, index) => {
        if (index < 10) {
          console.log(`\n📌 Group ${index + 1} (${group.count} channels):`);
          console.log(`   Emails: ${group._id.emailSet.length} unique emails`);
          console.log(`   Phones: ${group._id.phoneSet.length} unique phones`);
          
          group.channels.forEach((ch, idx) => {
            console.log(`   ${idx + 1}. ${ch.title || ch.channelId}`);
            console.log(`      - Subscribers: ${ch.subscriberCount || 0}`);
            console.log(`      - Quality: ${ch.qualityScore || 0}`);
            console.log(`      - Scraped: ${ch.scrapedAt ? new Date(ch.scrapedAt).toLocaleDateString() : 'N/A'}`);
          });
        }
      });
      
      if (exactDuplicateChannels.length > 10) {
        console.log(`\n... and ${exactDuplicateChannels.length - 10} more groups`);
      }
    }

    // ===== 7. STATISTICS SUMMARY =====
    console.log('\n=========================================');
    console.log('📊 DUPLICATE STATISTICS SUMMARY');
    console.log('=========================================');

    const totalChannels = await Channel.countDocuments();
    
    console.log(`\n📺 Total Channels: ${totalChannels}`);
    console.log(`\n❌ DUPLICATE CHANNELS (by channelId):`);
    console.log(`   - Groups: ${duplicateChannels.length}`);
    console.log(`   - Total duplicate entries: ${duplicateChannels.reduce((acc, d) => acc + d.count - 1, 0)}`);

    console.log(`\n📧 DUPLICATE EMAILS WITHIN CHANNELS:`);
    console.log(`   - Channels affected: ${channelsWithDuplicateEmails.length}`);
    console.log(`   - Duplicate email entries: ${channelsWithDuplicateEmails.reduce((acc, d) => acc + d.duplicateCount, 0)}`);

    console.log(`\n📞 DUPLICATE PHONES WITHIN CHANNELS:`);
    console.log(`   - Channels affected: ${channelsWithDuplicatePhones.length}`);
    console.log(`   - Duplicate phone entries: ${channelsWithDuplicatePhones.reduce((acc, d) => acc + d.duplicateCount, 0)}`);

    console.log(`\n🔄 SHARED ACROSS CHANNELS:`);
    console.log(`   - Emails shared: ${duplicateEmailsAcrossChannels.length}`);
    console.log(`   - Phones shared: ${duplicatePhonesAcrossChannels.length}`);

    console.log(`\n🔄 EXACT DUPLICATE GROUPS:`);
    console.log(`   - Groups found: ${exactDuplicateChannels.length}`);
    console.log(`   - Total channels involved: ${exactDuplicateChannels.reduce((acc, g) => acc + g.count, 0)}`);

    console.log('\n=========================================');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// ==================== FIX DUPLICATES FUNCTION ====================

async function fixDuplicates() {
  console.log('=========================================');
  console.log('🛠️  FIXING DUPLICATES');
  console.log('=========================================\n');

  try {
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Fix duplicate channels (keep one, remove others)
    console.log('📺 Fixing duplicate channels...');
    
    const duplicateChannels = await Channel.aggregate([
      { $group: {
        _id: '$channelId',
        count: { $sum: 1 },
        docs: { $push: '$$ROOT' }
      }},
      { $match: { count: { $gt: 1 } } }
    ]);

    let fixedChannels = 0;
    for (const dup of duplicateChannels) {
      // Sort by quality score or scraped date to keep best one
      const sorted = dup.docs.sort((a, b) => {
        // Prefer higher quality score, then newer scraped date
        const scoreA = a.qualityScore || 0;
        const scoreB = b.qualityScore || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        
        const dateA = a.scrapedAt || new Date(0);
        const dateB = b.scrapedAt || new Date(0);
        return dateB - dateA;
      });

      // Keep the best one
      const keep = sorted[0];
      const remove = sorted.slice(1);

      // Combine emails and phones from all duplicates into the kept one
      const allEmails = new Set(keep.emails || []);
      const allPhones = new Set(keep.phoneNumbers || []);

      for (const doc of remove) {
        (doc.emails || []).forEach(e => allEmails.add(e));
        (doc.phoneNumbers || []).forEach(p => allPhones.add(p));
      }

      // Update kept channel
      keep.emails = Array.from(allEmails);
      keep.phoneNumbers = Array.from(allPhones);
      keep.hasEmails = keep.emails.length > 0;
      keep.contactInfo = {
        ...keep.contactInfo,
        hasEmail: keep.emails.length > 0,
        hasPhone: keep.phoneNumbers.length > 0
      };
      keep.lastUpdated = new Date();

      await Channel.findByIdAndUpdate(keep._id, keep);

      // Delete duplicates
      for (const doc of remove) {
        await Channel.findByIdAndDelete(doc._id);
        fixedChannels++;
      }
    }

    console.log(`✅ Fixed ${fixedChannels} duplicate channels`);

    // 2. Fix duplicate emails within channels
    console.log('\n📧 Fixing duplicate emails within channels...');
    
    const channelsWithDupEmails = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $project: {
        channelId: 1,
        emails: 1,
        uniqueEmails: { $setUnion: ['$emails', []] }
      }},
      { $match: { $expr: { $ne: [{ $size: '$emails' }, { $size: '$uniqueEmails' }] } } }
    ]);

    let fixedEmails = 0;
    for (const channel of channelsWithDupEmails) {
      await Channel.updateOne(
        { _id: channel._id },
        { 
          $set: { 
            emails: Array.from(new Set(channel.emails)),
            hasEmails: true,
            lastUpdated: new Date()
          }
        }
      );
      fixedEmails++;
    }

    console.log(`✅ Fixed ${fixedEmails} channels with duplicate emails`);

    // 3. Fix duplicate phones within channels
    console.log('\n📞 Fixing duplicate phones within channels...');
    
    const channelsWithDupPhones = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $project: {
        channelId: 1,
        phoneNumbers: 1,
        uniquePhones: { $setUnion: ['$phoneNumbers', []] }
      }},
      { $match: { $expr: { $ne: [{ $size: '$phoneNumbers' }, { $size: '$uniquePhones' }] } } }
    ]);

    let fixedPhones = 0;
    for (const channel of channelsWithDupPhones) {
      await Channel.updateOne(
        { _id: channel._id },
        { 
          $set: { 
            phoneNumbers: Array.from(new Set(channel.phoneNumbers)),
            contactInfo: { hasPhone: true },
            lastUpdated: new Date()
          }
        }
      );
      fixedPhones++;
    }

    console.log(`✅ Fixed ${fixedPhones} channels with duplicate phones`);

    console.log('\n🎉 Duplicate fixing completed!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// ==================== RUN THE SCRIPT ====================

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=========================================');
console.log('🔍 DUPLICATE DETECTION TOOL');
console.log('=========================================\n');
console.log('Options:');
console.log('1. Find duplicates (report only)');
console.log('2. Find and fix duplicates (remove duplicates)');
console.log('3. Exit\n');

rl.question('Choose option (1/2/3): ', async (answer) => {
  if (answer === '1') {
    await findDuplicates();
  } else if (answer === '2') {
    console.log('\n⚠️  WARNING: This will modify your database!');
    console.log('It will:');
    console.log('   - Remove duplicate channel entries');
    console.log('   - Combine emails from duplicates');
    console.log('   - Remove duplicate emails within channels');
    console.log('   - Remove duplicate phones within channels\n');
    
    rl.question('Are you sure? (yes/no): ', async (confirm) => {
      if (confirm.toLowerCase() === 'yes') {
        await fixDuplicates();
      } else {
        console.log('❌ Operation cancelled');
      }
      rl.close();
    });
  } else {
    console.log('👋 Goodbye!');
    rl.close();
  }
});