// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Channel Schema
const channelSchema = new mongoose.Schema({
  channelId: { type: String, required: true },
  title: { type: String, required: true },
  emails: [{ type: String }],
  subscriberCount: { type: Number, default: 0 },
  // Other fields exist but we only fetch what we need
}, { 
  collection: 'channels',
  strict: false // Allow flexibility for different schemas
});

// Add index for better sorting performance
channelSchema.index({ subscriberCount: -1 });
channelSchema.index({ subscriberCount: 1 });

// Connect to MongoDB (the target database with clean data)
const MONGODB_URI = "mongodb+srv://mohitsatyarthi11_db_user:AkpNWt4TvLXDanKz@cluster0.hl25pfs.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const Channel = mongoose.model('Channel', channelSchema);

// API Routes

// GET /api/channels - Get channels with pagination, sorting, and search
app.get('/api/channels', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sortOrder = req.query.sort || 'desc'; // 'asc' or 'desc'
    const search = req.query.search || '';
    const hasEmail = req.query.hasEmail || 'all'; // 'yes', 'no', 'all'
    
    const skip = (page - 1) * limit;
    
    // Build query filters
    let query = {};
    
    // Search by channel name
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    // Filter by email presence
    if (hasEmail === 'yes') {
      query.emails = { $exists: true, $ne: [] };
    } else if (hasEmail === 'no') {
      query.$or = [
        { emails: { $exists: false } },
        { emails: { $size: 0 } }
      ];
    }
    
    // Determine sort direction
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    
    // Fetch channels with selected fields only
    const [channels, totalCount] = await Promise.all([
      Channel.find(query)
        .select('title emails subscriberCount channelId')
        .sort({ subscriberCount: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      Channel.countDocuments(query)
    ]);
    
    // Transform data for frontend
    const transformedChannels = channels.map(channel => ({
      id: channel._id,
      channelId: channel.channelId,
      channelName: channel.title || 'Unknown',
      emails: channel.emails || [],
      primaryEmail: channel.emails && channel.emails.length > 0 ? channel.emails[0] : 'No email',
      emailCount: channel.emails ? channel.emails.length : 0,
      subscriberCount: channel.subscriberCount || 0
    }));
    
    res.json({
      success: true,
      data: {
        channels: transformedChannels,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalChannels: totalCount,
          limit: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      message: error.message
    });
  }
});

// GET /api/stats - Get basic statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [totalChannels, channelsWithEmail, avgSubscribers] = await Promise.all([
      Channel.countDocuments(),
      Channel.countDocuments({ emails: { $exists: true, $ne: [] } }),
      Channel.aggregate([
        { $group: { _id: null, avg: { $avg: '$subscriberCount' } } }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        totalChannels,
        channelsWithEmail,
        channelsWithoutEmail: totalChannels - channelsWithEmail,
        emailPercentage: ((channelsWithEmail / totalChannels) * 100).toFixed(1),
        averageSubscribers: avgSubscribers[0] ? Math.round(avgSubscribers[0].avg) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API endpoint: http://localhost:${PORT}/api/channels`);
});