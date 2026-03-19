// ==================== DATABASE STATISTICS SCRIPT ====================
// Is script ko alag se run karo: node db-stats.js

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
  }
}, { strict: false }); // Strict false to handle any schema

const Channel = mongoose.model('Channel', channelSchema);

// ==================== STATISTICS FUNCTIONS ====================

async function getDatabaseStats() {
  console.log('=========================================');
  console.log('📊 DATABASE STATISTICS REPORT');
  console.log('=========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    // ===== BASIC COUNTS =====
    console.log('📈 BASIC COUNTS:');
    console.log('-----------------------------------------');
    
    const totalChannels = await Channel.countDocuments();
    console.log(`📺 Total Channels: ${totalChannels}`);

    // Channels with emails
    const channelsWithEmails = await Channel.countDocuments({ 
      $or: [
        { hasEmails: true },
        { emails: { $exists: true, $ne: [] } }
      ]
    });
    console.log(`📧 Channels with Emails: ${channelsWithEmails}`);

    // Channels with phone numbers
    const channelsWithPhones = await Channel.countDocuments({
      $or: [
        { 'contactInfo.hasPhone': true },
        { phoneNumbers: { $exists: true, $ne: [] } }
      ]
    });
    console.log(`📞 Channels with Phone Numbers: ${channelsWithPhones}`);

    // Channels with both
    const channelsWithBoth = await Channel.countDocuments({
      $and: [
        { $or: [{ hasEmails: true }, { emails: { $exists: true, $ne: [] } }] },
        { $or: [{ 'contactInfo.hasPhone': true }, { phoneNumbers: { $exists: true, $ne: [] } }] }
      ]
    });
    console.log(`🔄 Channels with Both (Email + Phone): ${channelsWithBoth}`);

    // Channels with neither
    const channelsWithNeither = await Channel.countDocuments({
      $and: [
        { $or: [{ hasEmails: false }, { emails: { $size: 0 } }, { emails: { $exists: false } }] },
        { $or: [{ 'contactInfo.hasPhone': false }, { phoneNumbers: { $size: 0 } }, { phoneNumbers: { $exists: false } }] }
      ]
    });
    console.log(`❌ Channels with Neither: ${channelsWithNeither}`);

    // ===== EMAIL STATISTICS =====
    console.log('\n📧 EMAIL STATISTICS:');
    console.log('-----------------------------------------');

    // Total unique emails count
    const emailStats = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $unwind: '$emails' },
      { $group: { _id: null, totalEmails: { $sum: 1 } } }
    ]);
    const totalEmails = emailStats[0]?.totalEmails || 0;
    console.log(`📨 Total Email Addresses: ${totalEmails}`);

    // Average emails per channel (with emails)
    const avgEmails = channelsWithEmails > 0 
      ? (totalEmails / channelsWithEmails).toFixed(2) 
      : 0;
    console.log(`📊 Average Emails per Channel (with emails): ${avgEmails}`);

    // Email distribution (kitne channels me kitni emails)
    console.log('\n📊 EMAIL DISTRIBUTION:');
    
    const emailDistribution = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $project: { emailCount: { $size: '$emails' } } },
      { $group: { 
        _id: '$emailCount', 
        count: { $sum: 1 },
        totalEmailsInGroup: { $sum: '$emailCount' }
      }},
      { $sort: { _id: 1 } }
    ]);

    let emailCumulative = 0;
    for (const item of emailDistribution) {
      emailCumulative += item.totalEmailsInGroup;
      console.log(`   ${item._id} email(s): ${item.count} channels (${item.totalEmailsInGroup} total emails, ${((item.count/channelsWithEmails)*100).toFixed(1)}% of channels)`);
    }

    // Top 10 channels by email count
    console.log('\n🏆 TOP 10 CHANNELS BY EMAIL COUNT:');
    
    const topEmailChannels = await Channel.find({ emails: { $exists: true, $ne: [] } })
      .sort({ $expr: { $size: '$emails' } } )
      .limit(10)
      .select('channelId title emails subscriberCount');

    topEmailChannels.forEach((channel, index) => {
      const emailCount = channel.emails?.length || 0;
      console.log(`   ${index + 1}. ${channel.title || channel.channelId} - ${emailCount} emails`);
      if (emailCount > 0) {
        console.log(`      📧 ${channel.emails.slice(0, 3).join(', ')}${emailCount > 3 ? '...' : ''}`);
      }
    });

    // ===== PHONE NUMBER STATISTICS =====
    console.log('\n📞 PHONE NUMBER STATISTICS:');
    console.log('-----------------------------------------');

    // Total unique phone numbers
    const phoneStats = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $unwind: '$phoneNumbers' },
      { $group: { _id: null, totalPhones: { $sum: 1 } } }
    ]);
    const totalPhones = phoneStats[0]?.totalPhones || 0;
    console.log(`📱 Total Phone Numbers: ${totalPhones}`);

    // Average phones per channel (with phones)
    const avgPhones = channelsWithPhones > 0 
      ? (totalPhones / channelsWithPhones).toFixed(2) 
      : 0;
    console.log(`📊 Average Phones per Channel (with phones): ${avgPhones}`);

    // Phone distribution
    console.log('\n📊 PHONE DISTRIBUTION:');
    
    const phoneDistribution = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $project: { phoneCount: { $size: '$phoneNumbers' } } },
      { $group: { 
        _id: '$phoneCount', 
        count: { $sum: 1 },
        totalPhonesInGroup: { $sum: '$phoneCount' }
      }},
      { $sort: { _id: 1 } }
    ]);

    let phoneCumulative = 0;
    for (const item of phoneDistribution) {
      phoneCumulative += item.totalPhonesInGroup;
      console.log(`   ${item._id} phone(s): ${item.count} channels (${item.totalPhonesInGroup} total phones, ${((item.count/channelsWithPhones)*100).toFixed(1)}% of channels)`);
    }

    // Top 10 channels by phone count
    console.log('\n🏆 TOP 10 CHANNELS BY PHONE COUNT:');
    
    const topPhoneChannels = await Channel.find({ phoneNumbers: { $exists: true, $ne: [] } })
      .sort({ $expr: { $size: '$phoneNumbers' } } )
      .limit(10)
      .select('channelId title phoneNumbers subscriberCount');

    topPhoneChannels.forEach((channel, index) => {
      const phoneCount = channel.phoneNumbers?.length || 0;
      console.log(`   ${index + 1}. ${channel.title || channel.channelId} - ${phoneCount} phones`);
    });

    // ===== COMBINATION STATISTICS =====
    console.log('\n🔄 COMBINATION STATISTICS:');
    console.log('-----------------------------------------');

    // Channels with 1+ emails and 1+ phones
    const emailsAndPhones = await Channel.countDocuments({
      $and: [
        { $expr: { $gt: [{ $size: { $ifNull: ['$emails', []] } }, 0] } },
        { $expr: { $gt: [{ $size: { $ifNull: ['$phoneNumbers', []] } }, 0] } }
      ]
    });
    console.log(`📧+📞 Both Email & Phone: ${emailsAndPhones}`);

    // Channels with only emails
    const onlyEmails = await Channel.countDocuments({
      $and: [
        { $expr: { $gt: [{ $size: { $ifNull: ['$emails', []] } }, 0] } },
        { $expr: { $eq: [{ $size: { $ifNull: ['$phoneNumbers', []] } }, 0] } }
      ]
    });
    console.log(`📧 Only Emails: ${onlyEmails}`);

    // Channels with only phones
    const onlyPhones = await Channel.countDocuments({
      $and: [
        { $expr: { $eq: [{ $size: { $ifNull: ['$emails', []] } }, 0] } },
        { $expr: { $gt: [{ $size: { $ifNull: ['$phoneNumbers', []] } }, 0] } }
      ]
    });
    console.log(`📞 Only Phones: ${onlyPhones}`);

    // ===== DOMAIN STATISTICS =====
    console.log('\n🌐 EMAIL DOMAIN STATISTICS:');
    console.log('-----------------------------------------');

    const domainStats = await Channel.aggregate([
      { $match: { emails: { $exists: true, $ne: [] } } },
      { $unwind: '$emails' },
      { $project: { 
        domain: { 
          $arrayElemAt: [
            { $split: ['$emails', '@'] }, 
            1
          ] 
        } 
      }},
      { $group: { _id: '$domain', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    console.log('Top 20 Email Domains:');
    domainStats.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item._id}: ${item.count} emails (${((item.count/totalEmails)*100).toFixed(1)}%)`);
    });

    // ===== CHANNELS WITH MOST CONTACT INFO =====
    console.log('\n🌟 CHANNELS WITH MOST CONTACT INFO:');
    console.log('-----------------------------------------');

    const mostContactInfo = await Channel.aggregate([
      { $match: { 
        $or: [
          { emails: { $exists: true, $ne: [] } },
          { phoneNumbers: { $exists: true, $ne: [] } }
        ]
      }},
      { $project: {
        title: 1,
        channelId: 1,
        emailCount: { $size: { $ifNull: ['$emails', []] } },
        phoneCount: { $size: { $ifNull: ['$phoneNumbers', []] } },
        totalContacts: {
          $add: [
            { $size: { $ifNull: ['$emails', []] } },
            { $size: { $ifNull: ['$phoneNumbers', []] } }
          ]
        }
      }},
      { $sort: { totalContacts: -1 } },
      { $limit: 10 }
    ]);

    mostContactInfo.forEach((channel, index) => {
      console.log(`   ${index + 1}. ${channel.title || channel.channelId}`);
      console.log(`      📧 ${channel.emailCount} emails, 📞 ${channel.phoneCount} phones = Total ${channel.totalContacts} contacts`);
    });

    // ===== SUMMARY =====
    console.log('\n=========================================');
    console.log('📋 SUMMARY REPORT');
    console.log('=========================================');
    console.log(`📺 Total Channels: ${totalChannels}`);
    console.log(`📧 Total Email Addresses: ${totalEmails}`);
    console.log(`📞 Total Phone Numbers: ${totalPhones}`);
    console.log(`📊 Email-to-Phone Ratio: ${(totalEmails / (totalPhones || 1)).toFixed(2)}:1`);
    console.log(`\n📈 Coverage:`);
    console.log(`   - Channels with Emails: ${((channelsWithEmails/totalChannels)*100).toFixed(1)}%`);
    console.log(`   - Channels with Phones: ${((channelsWithPhones/totalChannels)*100).toFixed(1)}%`);
    console.log(`   - Channels with Both: ${((channelsWithBoth/totalChannels)*100).toFixed(1)}%`);

    // ===== DETAILED BREAKDOWN =====
    console.log('\n📊 DETAILED BREAKDOWN:');
    console.log('-----------------------------------------');
    
    // Email count groups
    console.log('\n📧 EMAIL COUNT GROUPS:');
    const emailGroups = [
      { min: 1, max: 1, label: '1 email' },
      { min: 2, max: 3, label: '2-3 emails' },
      { min: 4, max: 5, label: '4-5 emails' },
      { min: 6, max: 10, label: '6-10 emails' },
      { min: 11, max: 20, label: '11-20 emails' },
      { min: 21, max: 999, label: '21+ emails' }
    ];

    for (const group of emailGroups) {
      const count = await Channel.countDocuments({
        $expr: {
          $and: [
            { $gte: [{ $size: { $ifNull: ['$emails', []] } }, group.min] },
            { $lte: [{ $size: { $ifNull: ['$emails', []] } }, group.max] }
          ]
        }
      });
      if (count > 0) {
        console.log(`   ${group.label}: ${count} channels`);
      }
    }

    // Phone count groups
    console.log('\n📞 PHONE COUNT GROUPS:');
    const phoneGroups = [
      { min: 1, max: 1, label: '1 phone' },
      { min: 2, max: 2, label: '2 phones' },
      { min: 3, max: 3, label: '3 phones' },
      { min: 4, max: 5, label: '4-5 phones' },
      { min: 6, max: 10, label: '6-10 phones' },
      { min: 11, max: 999, label: '11+ phones' }
    ];

    for (const group of phoneGroups) {
      const count = await Channel.countDocuments({
        $expr: {
          $and: [
            { $gte: [{ $size: { $ifNull: ['$phoneNumbers', []] } }, group.min] },
            { $lte: [{ $size: { $ifNull: ['$phoneNumbers', []] } }, group.max] }
          ]
        }
      });
      if (count > 0) {
        console.log(`   ${group.label}: ${count} channels`);
      }
    }

    console.log('\n=========================================');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// ==================== RUN THE SCRIPT ====================

console.log('=========================================');
console.log('📦 DATABASE STATISTICS ANALYZER');
console.log('=========================================\n');

getDatabaseStats().catch(console.error);