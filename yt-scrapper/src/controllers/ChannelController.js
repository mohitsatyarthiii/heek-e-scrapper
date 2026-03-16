import { Channel } from '../models/Channel.js';

export class ChannelController {
  async getChannels(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        status, 
        hasEmail,
        minSubscribers,
        keyword,
        sort = '-createdAt'
      } = req.query;
      
      const query = {};
      
      if (status) query.status = status;
      if (hasEmail === 'true') query['emails.0'] = { $exists: true };
      if (minSubscribers) query.subscriberCount = { $gte: parseInt(minSubscribers) };
      if (keyword) query.keywords = keyword;
      
      const channels = await Channel.find(query)
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));
      
      const total = await Channel.countDocuments(query);
      
      res.json({
        success: true,
        data: channels,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getChannel(req, res) {
    try {
      const { id } = req.params;
      const channel = await Channel.findById(id);
      
      if (!channel) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }
      
      res.json({ success: true, data: channel });
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateChannel(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const channel = await Channel.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: new Date() },
        { new: true }
      );
      
      if (!channel) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }
      
      res.json({ success: true, data: channel });
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteChannel(req, res) {
    try {
      const { id } = req.params;
      const channel = await Channel.findByIdAndDelete(id);
      
      if (!channel) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }
      
      res.json({ success: true, message: 'Channel deleted' });
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async exportChannels(req, res) {
    try {
      const { format = 'json', ...filters } = req.query;
      
      const query = {};
      if (filters.hasEmail === 'true') query['emails.0'] = { $exists: true };
      if (filters.status) query.status = filters.status;
      
      const channels = await Channel.find(query)
        .select('-__v')
        .lean();
      
      if (format === 'csv') {
        // Convert to CSV
        const headers = ['channelName', 'emails', 'subscribers', 'country', 'channelUrl'];
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        for (const channel of channels) {
          const row = headers.map(header => {
            if (header === 'emails') {
              return `"${channel.emails?.map(e => e.email).join(';') || ''}"`;
            }
            return `"${channel[header] || ''}"`;
          });
          csvRows.push(row.join(','));
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=channels.csv');
        res.send(csvRows.join('\n'));
      } else {
        res.json({ success: true, data: channels });
      }
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getStats(req, res) {
    try {
      const stats = await Channel.aggregate([
        {
          $group: {
            _id: null,
            totalChannels: { $sum: 1 },
            channelsWithEmail: { 
              $sum: { $cond: [{ $gt: [{ $size: '$emails' }, 0] }, 1, 0] }
            },
            totalEmails: { $sum: { $size: '$emails' } },
            avgSubscribers: { $avg: '$subscriberCount' },
            byStatus: {
              $push: '$status'
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalChannels: 1,
            channelsWithEmail: 1,
            totalEmails: 1,
            avgSubscribers: { $round: ['$avgSubscribers', 0] },
            successRate: {
              $round: [
                { $multiply: [{ $divide: ['$channelsWithEmail', '$totalChannels'] }, 100] },
                2
              ]
            }
          }
        }
      ]);
      
      // Get status breakdown
      const statusBreakdown = await Channel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      res.json({
        success: true,
        data: stats[0] || { totalChannels: 0 },
        statusBreakdown
      });
      
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}