// Must be the first import: ESM evaluates imports before module code, so a
// later dotenv.config() would run AFTER modules had already read process.env.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { connectToMongoDB, disconnectMongoDB, isMongoConnected } from './config/mongodb.js';
import logger from './config/logger.js';
import { authenticate, verifyAccessToken } from './middleware/auth.js';
import { llmAvailable, llmLabel } from './lib/llm.js';
import { LANGUAGES } from './lib/language.js';
import authRoutes from './routes/auth.js';
import userRoutes, { demoDataEnabled } from './routes/users.js';
import callRoutes from './routes/calls.js';
import contextRoutes from './routes/context.js';
import simulatorRoutes from './routes/simulator.js';
import workflowRoutes from './routes/workflows.js';
import { assistantRouter, bookingsRouter } from './routes/assistant.js';
import { attachIO as attachSimulatorIO } from './services/simulatorService.js';
import { callMediaRouter, mediaRouter, enforceRecordingRetention } from './routes/media.js';
import voiceRoutes, { initVoiceRoutes, getVoiceAgent } from './routes/voice.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Behind Render/Fly/ngrok the client IP comes from X-Forwarded-For
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081'];

// ============================================
// Socket.io — real-time events for the dashboard and mobile app.
// Clients authenticate with their JWT; the server decides which room they join.
// (Previously any client could `join:user` any phone number and eavesdrop.)
// ============================================
const io = new SocketIOServer(server, {
  cors: { origin: isProd ? ALLOWED_ORIGINS : '*', methods: ['GET', 'POST'] }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
    || socket.handshake.headers?.authorization?.replace(/^Bearer /, '');
  try {
    socket.data.userId = verifyAccessToken(token);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const { userId } = socket.data;
  socket.join(`user:${userId}`);
  logger.debug(`📱 Client connected: ${socket.id} (user ${userId})`);

  // Legacy clients still emit this; room membership is already handled above.
  socket.on('join:user', () => {});

  socket.on('disconnect', () => logger.debug(`📱 Client disconnected: ${socket.id}`));
});

export { io };

// ============================================
// Middleware
// ============================================
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: isProd ? ALLOWED_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));
app.use('/voice/outbound-call', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many call requests, please try again later' },
}));

// ============================================
// Voice Agent Configuration
// OPENAI_ENDPOINT is optional: empty = api.openai.com, set = Azure OpenAI.
// ============================================
function loadVoiceConfig() {
  const requiredVars = ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    logger.warn(`⚠️  Live phone voice disabled — missing: ${missingVars.join(', ')} (app + test calls still work)`);
    return null;
  }
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT || '',
    OPENAI_DEPLOYMENT_NAME: process.env.OPENAI_DEPLOYMENT_NAME || 'gpt-realtime-mini',
    OPENAI_CHAT_DEPLOYMENT: process.env.OPENAI_CHAT_DEPLOYMENT || 'gpt-4.1-mini',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    WEBHOOK_URL: process.env.WEBHOOK_URL || `http://localhost:${PORT}`
  };
}

const voiceConfig = loadVoiceConfig();

app.get('/health', (req, res) => {
  const mongo = isMongoConnected();
  res.status(mongo ? 200 : 503).json({
    status: mongo ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    voiceEnabled: !!voiceConfig,
    aiEnabled: llmAvailable(),
    ai: llmLabel(),
    mongodb: mongo ? 'connected' : 'disconnected',
  });
});

// Public capability flags the dashboard uses to show setup state
app.get('/api/meta', (req, res) => {
  res.json({
    name: 'Vexa',
    voiceEnabled: !!voiceConfig,
    aiEnabled: llmAvailable(),
    aiProvider: llmLabel(),
    smsEnabled: isProd || process.env.OTP_FORCE_SMS === 'true',
    twilioNumber: process.env.TWILIO_PHONE_NUMBER || null,
    webhookUrl: process.env.WEBHOOK_URL || null,
    demoDataEnabled: demoDataEnabled(),
    languages: LANGUAGES,
    nluEnabled: llmAvailable() && process.env.NLU_DISABLED !== 'true',
  });
});

// ============================================
// Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/calls', callMediaRouter);
app.use('/api/calls', callRoutes);
app.use('/media', mediaRouter);
app.use('/api/context', contextRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/assistant', assistantRouter);
app.use('/api/bookings', bookingsRouter);
attachSimulatorIO(io);

if (voiceConfig) {
  initVoiceRoutes(voiceConfig, io);
}
// Mounted even when disabled so owner endpoints return a clean 503 instead of 404
app.use('/voice', voiceRoutes);

if (voiceConfig) {
  const wss = new WebSocketServer({ server, path: '/voice/media-stream' });
  wss.on('connection', (ws, req) => {
    const agent = getVoiceAgent();
    if (agent) agent.handleMediaStream(ws, req);
    else ws.close();
  });
}

// ============================================
// Web dashboard (built SPA) — served from the same origin in production
// ============================================
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(process.env.WEB_DIST || path.join(here, '../../web/dist'));
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|voice|health|socket\.io|media).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  logger.info(`🖥️  Serving web dashboard from ${webDist}`);
}

// 404 for API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler (Express 5 forwards async errors here)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.stack || err.message}`);
  res.status(status).json({
    error: status < 500 || !isProd ? err.message : 'Internal Server Error'
  });
});

// ============================================
// Start: connect the database first so early requests never hit a cold DB
// ============================================
async function start() {
  const connected = await connectToMongoDB();
  if (!connected && isProd) {
    logger.error('Database connection failed — exiting');
    process.exit(1);
  }

  if (isMongoConnected()) {
    enforceRecordingRetention().catch(err => logger.warn(`Retention check failed: ${err.message}`));
    setInterval(() => enforceRecordingRetention().catch(() => {}), 6 * 3600 * 1000).unref();
  }

  server.listen(PORT, () => {
    logger.info('='.repeat(56));
    logger.info(`🚀 Vexa API on http://localhost:${PORT}`);
    logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   Database    : ${isMongoConnected() ? 'connected' : 'NOT connected'}`);
    logger.info(`   AI (text)   : ${llmLabel()}`);
    logger.info(`   Voice agent : ${voiceConfig ? 'enabled' : 'disabled'}`);
    if (voiceConfig) logger.info(`   Twilio webhook: ${process.env.WEBHOOK_URL || '(set WEBHOOK_URL)'}/voice/incoming-call`);
    logger.info('='.repeat(56));
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  io.close();
  server.close();
  await disconnectMongoDB();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (process.env.NODE_ENV !== 'test') start();

export default app;
export { start, server };
