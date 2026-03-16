import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema({
  // Basic Info
  channelId: { type: String, unique: true, sparse: true },
  channelName: { type: String, required: true },
  channelUrl: { type: String, required: true, unique: true },
  handle: String,
  avatar: String,
  
  // Emails
  emails: [{
    email: { type: String, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'] },
    source: String,
    verified: { type: Boolean, default: false },
    discoveredAt: { type: Date, default: Date.now }
  }],
  
  // Stats
  subscribers: String,
  subscriberCount: Number,
  videoCount: Number,
  viewCount: Number,
  
  // Content
  description: String,
  about: String,
  keywords: [String],
  
  // Links
  links: [String],
  websites: [String],
  socialLinks: [{
    platform: String,
    url: String,
    discoveredAt: Date
  }],
  
  // Location
  country: String,
  city: String,
  timezone: String,
  
  // Discovery
  discoveredVia: {
    keyword: String,
    query: String,
    source: { type: String, enum: ['google', 'youtube', 'related', 'commenter'] },
    discoveredAt: { type: Date, default: Date.now }
  },
  
  // Enrichment
  enrichedAt: Date,
  enrichmentData: mongoose.Schema.Types.Mixed,
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'scraped', 'enriched', 'failed', 'duplicate'],
    default: 'pending'
  },
  lastScrapedAt: Date,
  lastEnrichedAt: Date,
  errorMessage: String,
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
channelSchema.index({ channelUrl: 1 });
channelSchema.index({ 'emails.email': 1 });
channelSchema.index({ status: 1 });
channelSchema.index({ 'discoveredVia.keyword': 1 });
channelSchema.index({ subscriberCount: -1 });
channelSchema.index({ createdAt: -1 });

// Update timestamps
channelSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Convert subscriber string to number
channelSchema.pre('save', function(next) {
  if (this.subscribers) {
    const match = this.subscribers.match(/^([\d,.]+)([KMB])?/i);
    if (match) {
      let num = parseFloat(match[1].replace(/,/g, ''));
      const suffix = match[2]?.toUpperCase();
      
      if (suffix === 'K') num *= 1000;
      if (suffix === 'M') num *= 1000000;
      if (suffix === 'B') num *= 1000000000;
      
      this.subscriberCount = num;
    }
  }
  next();
});

// Virtual for primary email
channelSchema.virtual('primaryEmail').get(function() {
  if (!this.emails || this.emails.length === 0) return null;
  
  // Return highest priority email
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return this.emails.sort((a, b) => 
    (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99)
  )[0];
});

export const Channel = mongoose.model('Channel', channelSchema);