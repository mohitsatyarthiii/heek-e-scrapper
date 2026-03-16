import Queue from 'bull';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { ScraperController } from '../controllers/ScraperController.js';

export class QueueService {
  constructor() {
    this.queues = new Map();
    this.scraperController = new ScraperController();
    this.initializeQueues();
  }

  initializeQueues() {
    // Scraping queue
    const scrapingQueue = new Queue('scraping', config.redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
      },
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 2,
        lockDuration: 60000
      }
    });

    // Enrichment queue
    const enrichmentQueue = new Queue('enrichment', config.redisUrl, {
      defaultJobOptions: {
        attempts: 2,
        backoff: 5000,
        removeOnComplete: true
      }
    });

    // Export queue
    const exportQueue = new Queue('export', config.redisUrl);

    // Store queues
    this.queues.set('scraping', scrapingQueue);
    this.queues.set('enrichment', enrichmentQueue);
    this.queues.set('export', exportQueue);

    // Setup processors
    this.setupProcessors();
  }

  setupProcessors() {
    // Scraping queue processor
    const scrapingQueue = this.queues.get('scraping');
    scrapingQueue.process(5, async (job) => {
      logger.info(`Processing scraping job: ${job.id}`);
      
      try {
        await this.scraperController.processJob(job.data.jobId);
        return { success: true, jobId: job.data.jobId };
      } catch (error) {
        logger.error(`Scraping job ${job.id} failed:`, error);
        throw error;
      }
    });

    // Enrichment queue processor
    const enrichmentQueue = this.queues.get('enrichment');
    enrichmentQueue.process(3, async (job) => {
      logger.info(`Processing enrichment job: ${job.id}`);
      
      try {
        // Bulk enrich channels
        const { channelIds } = job.data;
        // Add enrichment logic here
        return { success: true, processed: channelIds.length };
      } catch (error) {
        logger.error(`Enrichment job ${job.id} failed:`, error);
        throw error;
      }
    });

    // Export queue processor
    const exportQueue = this.queues.get('export');
    exportQueue.process(1, async (job) => {
      logger.info(`Processing export job: ${job.id}`);
      
      try {
        const { format, filters } = job.data;
        // Add export logic here
        return { success: true, format };
      } catch (error) {
        logger.error(`Export job ${job.id} failed:`, error);
        throw error;
      }
    });

    // Event handlers
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    for (const [name, queue] of this.queues) {
      queue.on('completed', (job) => {
        logger.info(`Queue ${name}: Job ${job.id} completed`);
        
        // Emit via socket
        if (global.io) {
          global.io.emit('queue:completed', {
            queue: name,
            jobId: job.id,
            result: job.returnvalue
          });
        }
      });

      queue.on('failed', (job, error) => {
        logger.error(`Queue ${name}: Job ${job.id} failed:`, error);
        
        if (global.io) {
          global.io.emit('queue:failed', {
            queue: name,
            jobId: job.id,
            error: error.message
          });
        }
      });

      queue.on('progress', (job, progress) => {
        if (global.io) {
          global.io.emit('queue:progress', {
            queue: name,
            jobId: job.id,
            progress
          });
        }
      });

      queue.on('stalled', (job) => {
        logger.warn(`Queue ${name}: Job ${job.id} stalled`);
      });
    }
  }

  async addJob(queueName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(data, options);
    logger.info(`Added job ${job.id} to ${queueName} queue`);
    
    return job;
  }

  async getJob(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;
    
    const job = await queue.getJob(jobId);
    return job;
  }

  async getQueueStatus(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    };
  }

  async getAllQueuesStatus() {
    const status = {};
    
    for (const [name, queue] of this.queues) {
      status[name] = await this.getQueueStatus(name);
    }
    
    return status;
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }

  async emptyQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    await queue.empty();
    logger.info(`Queue ${queueName} emptied`);
  }

  async cleanQueue(queueName, grace = 5000) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    
    await queue.clean(grace);
    logger.info(`Queue ${queueName} cleaned`);
  }

  async closeAll() {
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue ${name} closed`);
    }
  }
}

export const queueService = new QueueService();