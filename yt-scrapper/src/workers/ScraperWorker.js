import { queueService } from '../services/QueueService.js';
import { logger } from '../utils/logger.js';

export class QueueController {
  async getQueueStatus(req, res) {
    try {
      const { queueName } = req.params;
      
      if (queueName) {
        const status = await queueService.getQueueStatus(queueName);
        if (!status) {
          return res.status(404).json({ 
            success: false, 
            error: `Queue ${queueName} not found` 
          });
        }
        res.json({ success: true, data: status });
      } else {
        const status = await queueService.getAllQueuesStatus();
        res.json({ success: true, data: status });
      }
    } catch (error) {
      logger.error('Failed to get queue status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async addJob(req, res) {
    try {
      const { queueName } = req.params;
      const jobData = req.body;
      
      const job = await queueService.addJob(queueName, jobData);
      
      res.json({
        success: true,
        jobId: job.id,
        message: `Job added to ${queueName} queue`
      });
    } catch (error) {
      logger.error('Failed to add job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getJob(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      const job = await queueService.getJob(queueName, jobId);
      
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }
      
      res.json({
        success: true,
        data: {
          id: job.id,
          data: job.data,
          progress: job.progress,
          status: await job.getState(),
          attempts: job.attemptsMade,
          timestamp: job.timestamp,
          result: job.returnvalue,
          error: job.failedReason
        }
      });
    } catch (error) {
      logger.error('Failed to get job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async pauseQueue(req, res) {
    try {
      const { queueName } = req.params;
      
      await queueService.pauseQueue(queueName);
      
      res.json({
        success: true,
        message: `Queue ${queueName} paused`
      });
    } catch (error) {
      logger.error('Failed to pause queue:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async resumeQueue(req, res) {
    try {
      const { queueName } = req.params;
      
      await queueService.resumeQueue(queueName);
      
      res.json({
        success: true,
        message: `Queue ${queueName} resumed`
      });
    } catch (error) {
      logger.error('Failed to resume queue:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async emptyQueue(req, res) {
    try {
      const { queueName } = req.params;
      
      await queueService.emptyQueue(queueName);
      
      res.json({
        success: true,
        message: `Queue ${queueName} emptied`
      });
    } catch (error) {
      logger.error('Failed to empty queue:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async cleanQueue(req, res) {
    try {
      const { queueName } = req.params;
      const { grace = 5000 } = req.query;
      
      await queueService.cleanQueue(queueName, parseInt(grace));
      
      res.json({
        success: true,
        message: `Queue ${queueName} cleaned`
      });
    } catch (error) {
      logger.error('Failed to clean queue:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async removeJob(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      const queue = queueService.queues.get(queueName);
      if (!queue) {
        return res.status(404).json({ 
          success: false, 
          error: `Queue ${queueName} not found` 
        });
      }
      
      const job = await queue.getJob(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }
      
      await job.remove();
      
      res.json({
        success: true,
        message: `Job ${jobId} removed from ${queueName} queue`
      });
    } catch (error) {
      logger.error('Failed to remove job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async retryJob(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      const queue = queueService.queues.get(queueName);
      if (!queue) {
        return res.status(404).json({ 
          success: false, 
          error: `Queue ${queueName} not found` 
        });
      }
      
      const job = await queue.getJob(jobId);
      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found' 
        });
      }
      
      await job.retry();
      
      res.json({
        success: true,
        message: `Job ${jobId} retry initiated`
      });
    } catch (error) {
      logger.error('Failed to retry job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getQueueMetrics(req, res) {
    try {
      const metrics = {};
      
      for (const [name, queue] of queueService.queues) {
        const jobs = await queue.getJobs(['completed', 'failed', 'delayed']);
        
        // Calculate average processing time
        const completedJobs = jobs.filter(j => j.finishedOn);
        const avgProcessingTime = completedJobs.length > 0
          ? completedJobs.reduce((sum, j) => sum + (j.finishedOn - j.timestamp), 0) / completedJobs.length
          : 0;
        
        metrics[name] = {
          status: await queueService.getQueueStatus(name),
          avgProcessingTime,
          totalJobs: jobs.length,
          successRate: jobs.filter(j => j.returnvalue?.success).length / jobs.length * 100 || 0
        };
      }
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Failed to get queue metrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}