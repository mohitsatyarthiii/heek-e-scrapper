import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  // Job Info
  jobId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['scrape', 'enrich', 'export'], required: true },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'paused'],
    default: 'pending'
  },
  
  // Parameters
  params: {
    keyword: String,
    country: String,
    city: String,
    targetEmails: Number,
    minSubscribers: Number,
    maxChannels: Number
  },
  
  // Progress
  progress: {
    queries: { type: Number, default: 0 },
    channelsDiscovered: { type: Number, default: 0 },
    channelsScraped: { type: Number, default: 0 },
    emailsFound: { type: Number, default: 0 },
    uniqueEmails: { type: Number, default: 0 }
  },
  
  // Results
  results: {
    channels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
    emails: [String],
    stats: mongoose.Schema.Types.Mixed
  },
  
  // Steps
  steps: [{
    name: String,
    status: String,
    startedAt: Date,
    completedAt: Date,
    error: String,
    data: mongoose.Schema.Types.Mixed
  }],
  
  // Logs
  logs: [{
    level: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    data: mongoose.Schema.Types.Mixed
  }],
  
  // Timing
  startedAt: Date,
  completedAt: Date,
  estimatedCompletionAt: Date,
  
  // Error
  error: String,
  stack: String,
  
  // Metadata
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
jobSchema.index({ jobId: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ 'params.keyword': 1 });

// Update timestamps
jobSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for duration
jobSchema.virtual('duration').get(function() {
  if (this.completedAt && this.startedAt) {
    return this.completedAt - this.startedAt;
  }
  return null;
});

// Method to add log
jobSchema.methods.addLog = function(level, message, data = {}) {
  this.logs.push({ level, message, timestamp: new Date(), data });
  
  // Keep only last 100 logs
  if (this.logs.length > 100) {
    this.logs = this.logs.slice(-100);
  }
};

// Method to update progress
jobSchema.methods.updateProgress = function(updates) {
  Object.assign(this.progress, updates);
};

export const Job = mongoose.model('Job', jobSchema);