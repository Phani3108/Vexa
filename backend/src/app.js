import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { connectToMongoDB, isMongoConnected } from './config/mongodb.js';
import logger from './config/logger.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectToMongoDB();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// ============================================
// Socket.io for Real-time Mobile App Communication
// ============================================
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:8081'];

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
    methods: ['GET', 'POST']
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`📱 Mobile app connected: ${socket.id}`);
  let userRoom = null;
  
  // User joins their personal room for call events
  socket.on('join:user', (userId) => {
    // Leave previous room if any
    if (userRoom) socket.leave(userRoom);
    userRoom = `user:${userId}`;
    socket.join(userRoom);
    logger.info(`   User ${userId} joined their room`);
  });
  
  // Handle call takeover request from mobile app
  socket.on('call:takeover', async (data) => {
    const { callId, userId } = data;
    logger.info(`📞 Takeover requested for call ${callId} by user ${userId}`);
    
    io.to(`user:${userId}`).emit('call:takeover-initiated', {
      callId,
      status: 'connecting',
      message: 'Connecting you to the call...'
    });
  });
  
  // Handle call disconnect request
  socket.on('call:disconnect', async (data) => {
    const { callId, userId } = data;
    logger.info(`📞 Disconnect requested for call ${callId}`);
    
    io.to(`user:${userId}`).emit('call:disconnecting', { callId });
  });
  
  socket.on('disconnect', () => {
    logger.info(`📱 Mobile app disconnected: ${socket.id}`);
    // Room cleanup is automatic when socket disconnects
  });
});

// Export io instance for use in other modules
export { io };

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Security headers
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? ALLOWED_ORIGINS : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', apiLimiter);

// Stricter rate limit for voice/outbound (prevents Twilio abuse)
const voiceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Too many call requests, please try again later' },
});
app.use('/voice/outbound-call', voiceLimiter);

// ============================================
// Voice Agent Configuration
// ============================================
function loadVoiceConfig() {
  const requiredVars = [
    'OPENAI_API_KEY',
    'OPENAI_ENDPOINT',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER'
  ];

  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(`⚠️ Voice Agent disabled - missing: ${missingVars.join(', ')}`);
    return null;
  }

  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT,
    OPENAI_DEPLOYMENT_NAME: process.env.OPENAI_DEPLOYMENT_NAME || 'gpt-realtime-mini',
    OPENAI_CHAT_DEPLOYMENT: process.env.OPENAI_CHAT_DEPLOYMENT || 'gpt-4.1-mini',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    WEBHOOK_URL: process.env.WEBHOOK_URL || `http://localhost:${PORT}`
  };
}

const voiceConfig = loadVoiceConfig();
let voiceAgent = null;

// Basic health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'AI Caller Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    voiceEnabled: !!voiceConfig,
    mongodb: isMongoConnected() ? 'connected' : 'disconnected',
  });
});

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'AI Caller API v1.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      users: '/api/users/*',
      calls: '/api/calls/*',
      context: '/api/context/*',
      voice: '/voice/*'
    },
    voiceEnabled: !!voiceConfig
  });
});

// Import route modules
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import callRoutes from './routes/calls.js';
import contextRoutes from './routes/context.js';
import voiceRoutes, { initVoiceRoutes, getVoiceAgent } from './routes/voice.js';
import { authenticate } from './middleware/auth.js';

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users/setup', userRoutes);           // no auth — user doesn't exist yet
app.use('/api/users', authenticate, userRoutes);   // everything else requires identity
app.use('/api/calls', callRoutes);                 // auth handled inside router
app.use('/api/context', contextRoutes);            // auth handled inside router

// Initialize voice routes if config is available
if (voiceConfig) {
  voiceAgent = initVoiceRoutes(voiceConfig, io);  // Pass Socket.io instance
  app.use('/voice', voiceRoutes);
  console.log('✅ Voice agent routes mounted at /voice');
}

// ============================================
// WebSocket Server for Voice Media Streams
// ============================================
if (voiceConfig) {
  const wss = new WebSocketServer({ server, path: '/voice/media-stream' });
  
  wss.on('connection', (ws, req) => {
    console.log('🔌 New WebSocket connection for voice media stream');
    
    const agent = getVoiceAgent();
    if (agent) {
      agent.handleMediaStream(ws, req);
    } else {
      console.error('❌ Voice agent not available');
      ws.close();
    }
  });
  
  console.log('✅ WebSocket server ready at /voice/media-stream');
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : (err.message || 'Internal Server Error'),
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

// Start server (use 'server' for WebSocket support)
server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 AI Caller Backend API`);
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎤 Voice Agent: ${voiceConfig ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`📱 Socket.io: ✅ Enabled (real-time mobile app events)`);
  console.log('='.repeat(60));
  console.log('\n🌐 HTTP Endpoints:');
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   API:     http://localhost:${PORT}/api`);
  
  console.log('\n📱 Socket.io Events:');
  console.log('   call:started     - New call incoming');
  console.log('   call:transcript  - Live transcript updates');
  console.log('   call:intent      - Detected caller intent');
  console.log('   call:ended       - Call completed with summary');
  console.log('   call:takeover    - User joins call (Conference)');
  
  if (voiceConfig) {
    console.log('\n📞 Voice Endpoints (Twilio Webhooks):');
    console.log(`   Incoming: POST /voice/incoming-call`);
    console.log(`   Status:   POST /voice/call-status`);
    console.log(`   Stream:   WSS  /voice/media-stream`);
    console.log('\n⚙️  Configure Twilio webhooks to your ngrok URL:');
    console.log(`   ${process.env.WEBHOOK_URL || 'Set WEBHOOK_URL in .env'}/voice/incoming-call`);
  }
  
  console.log('\n📚 API Endpoints:');
  console.log('   GET  /api/calls         - List all calls');
  console.log('   GET  /api/calls/:id     - Get call details');
  console.log('='.repeat(60));
  console.log('\n✅ Server ready!\n');
});

export default app;
