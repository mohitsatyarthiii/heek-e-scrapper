import { Job } from '../models/Job.js';
import { Channel } from '../models/Channel.js';
import { hybridDiscoveryService } from '../services/HybridDiscoveryService.js';
import { channelScraperService } from '../services/ChannelScraperService.js';
import { emailEnrichmentService } from '../services/EmailEnrichmentService.js';
import { WorkerPool } from '../lib/WorkerPool.js';
import { logger } from '../utils/logger.js';
import { nanoid } from 'nanoid';

export class ScraperController {
  constructor() {
    this.workerPool = new WorkerPool('scraper.worker.js', 3);
    this.workerPool.initialize();
  }

  async startJob(req, res) {
    try {
      const { 
        keyword, 
        country = 'india', 
        targetEmails = 1000, 
        minSubscribers = 0,
        priority = 'medium'
      } = req.body;
      
      const job = new Job({
        jobId: nanoid(),
        type: 'scrape',
        params: { keyword, country, targetEmails, minSubscribers, priority },
        status: 'pending'
      });
      
      await job.save();
      
      // Start job asynchronously
      this.processJob(job.jobId).catch(error => {
        logger.error(`Job ${job.jobId} failed:`, error);
      });
      
      res.json({
        success: true,
        jobId: job.jobId,
        message: 'Scraping job started'
      });
      
    } catch (error) {
      logger.error('Failed to start job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async processJob(jobId) {
    const job = await Job.findOne({ jobId });
    if (!job) return;
    
    try {
      job.status = 'running';
      job.startedAt = new Date();
      await job.save();

      // Step 1: Hybrid Discovery (Google + YouTube)
      await this.updateJobStep(job, 'hybrid_discovery', 'running');
      
      const channels = await hybridDiscoveryService.discoverChannels(
        job.params.keyword, 
        {
          country: job.params.country,
          minSubscribers: job.params.minSubscribers
        }
      );
      
      job.progress.channelsDiscovered = channels.length;
      job.addLog('info', `Hybrid discovery found ${channels.length} channels`);
      
      await this.updateJobStep(job, 'hybrid_discovery', 'completed', { 
        channelsFound: channels.length 
      });

      // Step 2: Prioritize channels with email context
      const priorityChannels = channels.filter(c => c.hasEmailContext);
      const regularChannels = channels.filter(c => !c.hasEmailContext);
      
      const orderedChannels = [...priorityChannels, ...regularChannels].slice(0, 200);

      // Step 3: Scrape channels using worker pool
      await this.updateJobStep(job, 'channel_scraping', 'running');
      
      const scrapedChannels = [];
      const batchSize = 5;
      
      for (let i = 0; i < orderedChannels.length; i += batchSize) {
        const batch = orderedChannels.slice(i, i + batchSize);
        
        const promises = batch.map(async (channel) => {
          try {
            // Use worker for scraping
            const result = await this.workerPool.runTask({
              type: 'scrape-channel',
              url: channel.url,
              depth: channel.hasEmailContext ? 2 : 1
            }, {
              onProgress: (progress) => {
                job.addLog('debug', `Scraping ${channel.url}: ${progress.step}`);
              }
            });

            if (result && result.exists) {
              // Save to database
              const channelDoc = new Channel({
                channelId: result.channelId,
                channelName: result.title,
                channelUrl: result.url,
                handle: result.handle,
                subscribers: result.subscribers,
                description: result.description,
                about: result.about,
                emails: result.emails?.map(e => ({ 
                  email: e, 
                  source: 'channel',
                  priority: channel.hasEmailContext ? 'high' : 'medium'
                })) || [],
                links: result.links,
                websites: result.links?.filter(l => !l.includes('youtube.com')),
                socialLinks: result.socialLinks,
                discoveredVia: { 
                  keyword: job.params.keyword, 
                  source: channel.source,
                  query: channel.sourceQuery
                },
                hasEmailContext: channel.hasEmailContext,
                status: 'scraped',
                lastScrapedAt: new Date()
              });
              
              await channelDoc.save();
              
              job.progress.channelsScraped++;
              job.progress.emailsFound += result.emails?.length || 0;
              job.results.channels.push(channelDoc._id);
              
              return channelDoc;
            }
          } catch (error) {
            job.addLog('error', `Failed to scrape ${channel.url}: ${error.message}`);
          }
          return null;
        });

        const batchResults = await Promise.all(promises);
        scrapedChannels.push(...batchResults.filter(r => r !== null));
        
        await job.save();
        
        // Check if we have enough emails
        if (job.progress.emailsFound >= job.params.targetEmails) {
          job.addLog('info', `Target emails reached: ${job.progress.emailsFound}`);
          break;
        }
        
        // Delay between batches
        await this.delay(2000);
      }

      // Step 4: Email Enrichment for channels without emails
      if (job.progress.emailsFound < job.params.targetEmails) {
        await this.updateJobStep(job, 'email_enrichment', 'running');
        
        const channelsToEnrich = await Channel.find({
          _id: { $in: job.results.channels },
          emails: { $size: 0 },
          websites: { $ne: [] }
        }).limit(50);

        for (const channel of channelsToEnrich) {
          try {
            for (const website of channel.websites.slice(0, 3)) {
              const result = await this.workerPool.runTask({
                type: 'scrape-website',
                url: website,
                depth: 2
              });

              if (result.emails?.length > 0) {
                channel.emails.push(...result.emails.map(e => ({
                  email: e,
                  source: 'website',
                  priority: 'medium'
                })));
                
                job.progress.emailsFound += result.emails.length;
              }
            }
            
            channel.enrichedAt = new Date();
            channel.status = 'enriched';
            await channel.save();
            
          } catch (error) {
            job.addLog('error', `Enrichment failed for ${channel.channelName}: ${error.message}`);
          }
        }
      }

      // Calculate unique emails
      const uniqueEmails = await Channel.aggregate([
        { $unwind: '$emails' },
        { $group: { _id: '$emails.email' } },
        { $count: 'total' }
      ]);
      
      job.progress.uniqueEmails = uniqueEmails[0]?.total || 0;

      // Complete job
      job.status = 'completed';
      job.completedAt = new Date();
      job.results.stats = {
        totalChannels: job.progress.channelsScraped,
        totalEmails: job.progress.uniqueEmails,
        averageEmailsPerChannel: (job.progress.emailsFound / job.progress.channelsScraped).toFixed(2),
        discoveryStats: hybridDiscoveryService.getStats(),
        duration: job.completedAt - job.startedAt
      };
      
      job.addLog('info', `✅ Job completed! Found ${job.progress.uniqueEmails} unique emails from ${job.progress.channelsScraped} channels`);
      await job.save();

    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.stack = error.stack;
      job.completedAt = new Date();
      job.addLog('error', `Job failed: ${error.message}`);
      await job.save();
      
      logger.error(`Job ${jobId} failed:`, error);
    }
  }

  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const job = await Job.findOne({ jobId })
        .populate('results.channels', 'channelName emails subscribers status hasEmailContext');
      
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      
      // Add discovery stats
      const jobData = job.toObject();
      jobData.discoveryStats = hybridDiscoveryService.getStats();
      
      res.json({ success: true, job: jobData });
      
    } catch (error) {
      logger.error('Failed to get job status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getJobLogs(req, res) {
    try {
      const { jobId } = req.params;
      const { limit = 100 } = req.query;
      
      const job = await Job.findOne({ jobId });
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      
      const logs = job.logs.slice(-parseInt(limit));
      
      res.json({ success: true, logs });
      
    } catch (error) {
      logger.error('Failed to get logs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async pauseJob(req, res) {
    try {
      const { jobId } = req.params;
      const job = await Job.findOne({ jobId });
      
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      
      job.status = 'paused';
      await job.save();
      
      res.json({ success: true, message: 'Job paused' });
      
    } catch (error) {
      logger.error('Failed to pause job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async resumeJob(req, res) {
    try {
      const { jobId } = req.params;
      const job = await Job.findOne({ jobId });
      
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      
      job.status = 'running';
      await job.save();
      
      // Resume processing
      this.processJob(jobId).catch(error => {
        logger.error(`Job ${jobId} failed:`, error);
      });
      
      res.json({ success: true, message: 'Job resumed' });
      
    } catch (error) {
      logger.error('Failed to resume job:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateJobStep(job, stepName, status, data = {}) {
    const stepIndex = job.steps.findIndex(s => s.name === stepName);
    
    if (stepIndex === -1) {
      job.steps.push({
        name: stepName,
        status,
        startedAt: status === 'running' ? new Date() : undefined,
        completedAt: status === 'completed' ? new Date() : undefined,
        data
      });
    } else {
      job.steps[stepIndex].status = status;
      if (status === 'running') job.steps[stepIndex].startedAt = new Date();
      if (status === 'completed') job.steps[stepIndex].completedAt = new Date();
      job.steps[stepIndex].data = data;
    }
    
    await job.save();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}