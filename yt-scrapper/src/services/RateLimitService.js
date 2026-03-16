import { logger } from '../utils/logger.js';

export class RateLimiter {
  constructor(requestsPerMinute = 60, burstSize = 10) {
    this.requestsPerMinute = requestsPerMinute;
    this.burstSize = burstSize;
    this.requests = [];
    this.lastCheck = Date.now();
    this.totalRequests = 0;
    this.totalWaits = 0;
  }

  /**
   * Wait if necessary before making a request
   */
  async waitIfNeeded() {
    const now = Date.now();
    const windowStart = now - 60000; // Last 60 seconds

    // Remove old requests outside the window
    this.requests = this.requests.filter(time => time > windowStart);

    // Check if we need to wait
    if (this.requests.length >= this.requestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = (oldestRequest + 60000) - now;
      
      if (waitTime > 0) {
        logger.debug(`Rate limit: waiting ${waitTime}ms (${this.requests.length}/${this.requestsPerMinute} requests)`);
        this.totalWaits++;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.requests.push(Date.now());
    this.totalRequests++;
  }

  /**
   * Get current stats
   */
  getStats() {
    const now = Date.now();
    const windowStart = now - 60000;
    const recentRequests = this.requests.filter(time => time > windowStart).length;

    return {
      totalRequests: this.totalRequests,
      totalWaits: this.totalWaits,
      recentRequests: recentRequests,
      limit: this.requestsPerMinute,
      available: Math.max(0, this.requestsPerMinute - recentRequests)
    };
  }
}

export class ConcurrencyManager {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.activeCount = 0;
    this.queue = [];
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Execute task with concurrency control
   */
  async runTask(task, options = {}) {
    const { 
      priority = 'normal', 
      timeout = 60000,
      retries = 1,
      onRetry = null
    } = options;

    return new Promise((resolve, reject) => {
      const taskData = {
        task,
        priority,
        timeout,
        retries,
        onRetry,
        resolve,
        reject,
        attempts: 0,
        startTime: Date.now()
      };

      // Add to queue based on priority
      if (priority === 'high') {
        this.queue.unshift(taskData);
      } else {
        this.queue.push(taskData);
      }

      this.stats.totalTasks++;
      this.processQueue();
    });
  }

  /**
   * Process queued tasks
   */
  async processQueue() {
    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const taskData = this.queue.shift();
      this.activeCount++;

      try {
        const result = await this.executeTaskWithTimeout(
          taskData.task,
          taskData.timeout,
          taskData.retries,
          taskData.onRetry
        );

        const executionTime = Date.now() - taskData.startTime;
        this.stats.averageExecutionTime = 
          (this.stats.averageExecutionTime * this.stats.completedTasks + executionTime) /
          (this.stats.completedTasks + 1);

        this.stats.completedTasks++;
        taskData.resolve(result);
      } catch (error) {
        this.stats.failedTasks++;
        taskData.reject(error);
      } finally {
        this.activeCount--;
        // Process next task
        if (this.queue.length > 0) {
          this.processQueue();
        }
      }
    }
  }

  /**
   * Execute task with timeout and retries
   */
  async executeTaskWithTimeout(task, timeout, retries, onRetry) {
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await Promise.race([
          task(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Task timeout')), timeout)
          )
        ]);
      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          const backoffMs = Math.pow(2, attempt) * 100; // Exponential backoff
          logger.debug(`Task failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${backoffMs}ms:`, error.message);
          
          if (onRetry) {
            await onRetry(attempt, error);
          }
          
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      availableSlots: Math.max(0, this.maxConcurrent - this.activeCount),
      stats: this.stats
    };
  }

  /**
   * Set max concurrent tasks
   */
  setMaxConcurrent(max) {
    this.maxConcurrent = max;
    this.processQueue();
  }
}

export class RequestLimiter {
  constructor() {
    this.limits = new Map(); // domain -> RateLimiter
    this.defaults = {
      google: { requestsPerMinute: 30 },
      youtube: { requestsPerMinute: 60 },
      instagram: { requestsPerMinute: 20 },
      linkedin: { requestsPerMinute: 30 },
      default: { requestsPerMinute: 40 }
    };
  }

  /**
   * Get rate limiter for domain
   */
  getLimiter(domain) {
    if (!this.limits.has(domain)) {
      const config = this.defaults[domain] || this.defaults.default;
      this.limits.set(domain, new RateLimiter(config.requestsPerMinute));
    }
    return this.limits.get(domain);
  }

  /**
   * Wait before making request to domain
   */
  async waitForDomain(domain) {
    const limiter = this.getLimiter(domain);
    await limiter.waitIfNeeded();
  }

  /**
   * Get stats for all domains
   */
  getAllStats() {
    const stats = {};
    for (const [domain, limiter] of this.limits) {
      stats[domain] = limiter.getStats();
    }
    return stats;
  }
}

// Singleton instances
export const rateLimiter = new RateLimiter(60);
export const concurrencyManager = new ConcurrencyManager(5);
export const requestLimiter = new RequestLimiter();
