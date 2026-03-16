import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WorkerPool {
  constructor(workerScript, numWorkers = cpus().length - 1) {
    this.workerScript = workerScript;
    this.numWorkers = Math.max(1, numWorkers);
    this.workers = [];
    this.taskQueue = [];
    this.availableWorkers = [];
    this.taskResults = new Map();
    this.taskCallbacks = new Map();
  }

  initialize() {
    logger.info(`Initializing worker pool with ${this.numWorkers} workers`);
    
    for (let i = 0; i < this.numWorkers; i++) {
      this.createWorker(i);
    }
  }

  createWorker(workerId) {
    const workerPath = join(__dirname, '..', 'workers', this.workerScript);
    
    const worker = new Worker(workerPath, {
      workerData: { workerId }
    });

    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    worker.on('error', (error) => {
      logger.error(`Worker ${workerId} error:`, error);
      this.restartWorker(workerId);
    });

    worker.on('exit', (code) => {
      logger.info(`Worker ${workerId} exited with code ${code}`);
      this.restartWorker(workerId);
    });

    this.workers[workerId] = {
      id: workerId,
      worker,
      busy: false,
      currentTask: null
    };

    this.availableWorkers.push(workerId);
  }

  handleWorkerMessage(workerId, message) {
    const { type, taskId, data, error } = message;

    switch (type) {
      case 'result':
        this.handleTaskResult(workerId, taskId, data);
        break;
      case 'error':
        this.handleTaskError(workerId, taskId, error);
        break;
      case 'progress':
        this.handleTaskProgress(workerId, taskId, data);
        break;
      case 'ready':
        this.markWorkerAvailable(workerId);
        break;
      default:
        logger.debug(`Unknown message type from worker ${workerId}:`, type);
    }
  }

  handleTaskResult(workerId, taskId, result) {
    const callback = this.taskCallbacks.get(taskId);
    if (callback) {
      callback.resolve(result);
      this.taskCallbacks.delete(taskId);
    }
    
    this.taskResults.set(taskId, result);
    this.markWorkerAvailable(workerId);
    
    // Process next task
    this.processNextTask();
  }

  handleTaskError(workerId, taskId, error) {
    const callback = this.taskCallbacks.get(taskId);
    if (callback) {
      callback.reject(new Error(error));
      this.taskCallbacks.delete(taskId);
    }
    
    logger.error(`Task ${taskId} failed on worker ${workerId}:`, error);
    this.markWorkerAvailable(workerId);
    
    // Process next task
    this.processNextTask();
  }

  handleTaskProgress(workerId, taskId, progress) {
    const callback = this.taskCallbacks.get(taskId);
    if (callback && callback.onProgress) {
      callback.onProgress(progress);
    }
    
    // Emit progress via socket
    if (global.io) {
      global.io.emit('worker:progress', {
        workerId,
        taskId,
        progress
      });
    }
  }

  markWorkerAvailable(workerId) {
    if (this.workers[workerId]) {
      this.workers[workerId].busy = false;
      this.workers[workerId].currentTask = null;
      
      if (!this.availableWorkers.includes(workerId)) {
        this.availableWorkers.push(workerId);
      }
    }
  }

  markWorkerBusy(workerId, taskId) {
    if (this.workers[workerId]) {
      this.workers[workerId].busy = true;
      this.workers[workerId].currentTask = taskId;
      
      const index = this.availableWorkers.indexOf(workerId);
      if (index !== -1) {
        this.availableWorkers.splice(index, 1);
      }
    }
  }

  async runTask(taskData, options = {}) {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();
      
      this.taskCallbacks.set(taskId, {
        resolve,
        reject,
        onProgress: options.onProgress
      });

      this.taskQueue.push({
        id: taskId,
        data: taskData,
        options
      });

      this.processNextTask();
    });
  }

  processNextTask() {
    if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    const workerId = this.availableWorkers.shift();
    
    this.markWorkerBusy(workerId, task.id);
    
    const worker = this.workers[workerId].worker;
    worker.postMessage({
      type: 'task',
      taskId: task.id,
      data: task.data,
      options: task.options
    });

    logger.debug(`Task ${task.id} assigned to worker ${workerId}`);
  }

  restartWorker(workerId) {
    logger.info(`Restarting worker ${workerId}`);
    
    // Remove from available workers
    const index = this.availableWorkers.indexOf(workerId);
    if (index !== -1) {
      this.availableWorkers.splice(index, 1);
    }
    
    // Recreate worker
    this.createWorker(workerId);
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async broadcast(message) {
    const promises = this.workers.map(worker => {
      return new Promise((resolve) => {
        worker.worker.once('message', resolve);
        worker.worker.postMessage({ type: 'broadcast', data: message });
        
        // Timeout after 5 seconds
        setTimeout(() => resolve(null), 5000);
      });
    });
    
    return Promise.all(promises);
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      workers: this.workers.map(w => ({
        id: w.id,
        busy: w.busy,
        currentTask: w.currentTask
      }))
    };
  }

  async terminate() {
    logger.info('Terminating worker pool');
    
    for (const worker of this.workers) {
      await worker.worker.terminate();
    }
    
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.taskCallbacks.clear();
  }
}