import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const transports = [
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp(),
      customFormat
    )
  }),
  new DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '14d',
    format: combine(timestamp(), json())
  }),
  new DailyRotateFile({
    filename: 'logs/scraper-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: combine(timestamp(), json())
  })
];

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  transports,
  // Store logs for frontend streaming
  exceptionHandlers: transports,
  rejectionHandlers: transports
});

// Add history tracking for log aggregation
logger.history = {
  maxSize: 1000,
  logs: []
};

const originalLog = logger.log.bind(logger);
logger.log = function(level, message, ...args) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: args[0] || {}
    };
    
    // Safely add to history
    if (this.history && Array.isArray(this.history.logs)) {
      this.history.logs.unshift(entry);
      if (this.history.logs.length > this.history.maxSize) {
        this.history.logs.pop();
      }
    }
    
    // Emit via socket if available (only from main thread)
    if (typeof global !== 'undefined' && global.io) {
      try {
        global.io.emit('log', entry);
      } catch (e) {
        // Silent fail for worker threads
      }
    }
  } catch (e) {
    // Silent fail to prevent logging errors from breaking things
  }
  
  return originalLog(level, message, ...args);
};

// Helper methods
export const logScraper = (type, data) => {
  logger.info(`Scraper:${type}`, { ...data, timestamp: new Date().toISOString() });
};

export const logError = (type, error, context = {}) => {
  logger.error(`Error:${type}`, {
    error: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString()
  });
};