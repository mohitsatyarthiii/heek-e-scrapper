import express from 'express';
import { QueueController } from '../controllers/QueueController.js';

const router = express.Router();
const queueController = new QueueController();

// Queue management
router.get('/status', queueController.getQueueStatus.bind(queueController));
router.get('/status/:queueName', queueController.getQueueStatus.bind(queueController));
router.get('/metrics', queueController.getQueueMetrics.bind(queueController));

// Queue operations
router.post('/:queueName/pause', queueController.pauseQueue.bind(queueController));
router.post('/:queueName/resume', queueController.resumeQueue.bind(queueController));
router.post('/:queueName/empty', queueController.emptyQueue.bind(queueController));
router.post('/:queueName/clean', queueController.cleanQueue.bind(queueController));

// Job management
router.post('/:queueName/jobs', queueController.addJob.bind(queueController));
router.get('/:queueName/jobs/:jobId', queueController.getJob.bind(queueController));
router.delete('/:queueName/jobs/:jobId', queueController.removeJob.bind(queueController));
router.post('/:queueName/jobs/:jobId/retry', queueController.retryJob.bind(queueController));

export default router;