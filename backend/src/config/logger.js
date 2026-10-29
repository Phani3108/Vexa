/**
 * Logger — structured logging via Winston.
 * Replaces bare console.log throughout the app.
 */

import winston from 'winston';
import { redact } from '../lib/redact.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// API keys and tokens never reach a log transport
const scrub = winston.format((info) => {
  if (typeof info.message === 'string') info.message = redact(info.message);
  if (typeof info.stack === 'string') info.stack = redact(info.stack);
  return info;
});

const devFormat = combine(
  errors({ stack: true }),
  scrub(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${ts} ${level}: ${stack || message}`;
  })
);

const prodFormat = combine(
  errors({ stack: true }),
  scrub(),
  timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
});

// In production, also write to a file
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10_000_000, maxFiles: 5 })
  );
  logger.add(
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10_000_000, maxFiles: 5 })
  );
}

export default logger;
