import express from 'express';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { browserPool } from './lib/BrowserPool.js';
import scraperRoutes from './routes/ScraperRoutes.js';
import channelRoutes from './routes/ChannelRoutes.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Make io globally available for logs
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/scraper', scraperRoutes);
app.use('/api/channels', channelRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO connection
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('subscribe', (jobId) => {
    socket.join(`job:${jobId}`);
  });
  
  socket.on('unsubscribe', (jobId) => {
    socket.leave(`job:${jobId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    // Initialize browser pool
    await browserPool.initialize();
    logger.info('Browser pool initialized');

    // Start HTTP server
    httpServer.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  // Close browser pool
  await browserPool.closeAll();
  
  // Close database connection
  await mongoose.connection.close();
  
  // Close server
  httpServer.close(() => {
    logger.info('Server shut down');
    process.exit(0);
  });
}

startServer();