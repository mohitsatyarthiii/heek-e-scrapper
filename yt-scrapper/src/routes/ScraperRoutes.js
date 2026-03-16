import express from 'express';
import { ScraperController } from '../controllers/ScraperController.js';

const router = express.Router();
const scraperController = new ScraperController();

// Job management
router.post('/jobs', scraperController.startJob.bind(scraperController));
router.get('/jobs/:jobId', scraperController.getJobStatus.bind(scraperController));
router.post('/jobs/:jobId/pause', scraperController.pauseJob.bind(scraperController));
router.post('/jobs/:jobId/resume', scraperController.resumeJob.bind(scraperController));
router.get('/jobs/:jobId/logs', scraperController.getJobLogs.bind(scraperController));

export default router;