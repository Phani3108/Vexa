/**
 * Voice Routes — Twilio webhook handlers + outbound call API
 *
 * Endpoints:
 *   POST /voice/incoming-call     Twilio webhook: someone called your number
 *   POST /voice/call-status       Twilio webhook: call status updates
 *   POST /voice/outbound-twiml    TwiML for outbound calls (called by Twilio)
 *   POST /voice/outbound-call     API: initiate an outbound call with AI agent
 *   POST /voice/takeover          API: user joins ongoing call (Conference)
 *   POST /voice/end-call          API: force-end an ongoing call
 *   GET  /voice/status            Debug: active call stats
 */

import express from 'express';
import twilio from 'twilio';
import VoiceAgent from '../voice/VoiceAgent.js';
import PromptGenerator from '../voice/PromptGenerator.js';
import callHistoryService from '../services/callHistoryService.js';
import userConfigService from '../services/userConfigService.js';
import ConversationAnalyzer from '../voice/ConversationAnalyzer.js';
import pushService from '../services/pushNotificationService.js';

const router = express.Router();

let voiceAgent = null;
let conversationAnalyzer = null;
let socketIO = null;

// ─────────────────────────────────────────────────────────────────────────────
// Initialise
// ─────────────────────────────────────────────────────────────────────────────

export function initVoiceRoutes(config, io = null) {
  socketIO = io;
  voiceAgent = new VoiceAgent(config, io);
  conversationAnalyzer = new ConversationAnalyzer(config);

  // When a call ends: analyze + save
  voiceAgent.on('call:completed', async (result) => {
    console.log(`📞 Call completed: ${result.callId}`);
    try {
      // Load user categories for context-aware analysis
      const user = await userConfigService.getUser(result.userId);
      const categories = user?.callCategories || [];

      let analysis = null;
      if (result.transcripts?.length > 0) {
        console.log('🔍 Analyzing conversation...');
        analysis = await conversationAnalyzer.analyze(result.transcripts, { categories });
        console.log(`   Category: ${analysis.categoryId} (${analysis.confidence.toFixed(2)})`);
        console.log(`   Summary: ${analysis.summary}`);
      }

      await callHistoryService.saveCall(result, analysis);

      // Send push notification with call summary
      if (result.userId) {
        pushService.sendCallSummaryNotification(result.userId, {
          callId: result.callId,
          callerName: analysis?.callerName || result.callerName || 'Unknown',
          callerNumber: result.from || result.phoneNumber,
          summary: analysis?.summary || 'Call completed',
        }).catch(err => console.error('Push notification error:', err));
      }
    } catch (err) {
      console.error('❌ Error on call:completed:', err);
    }
  });

  // When AI decides a live transfer is needed
  voiceAgent.on('call:takeover-needed', async (data) => {
    console.log(`\n🔀 AI-triggered takeover: ${data.callSid}`);
    console.log(`   Bridging: ${data.userPhoneNumber}`);

    try {
      const twilioService = (await import('../services/twilioService.js')).default;

      const result = await twilioService.initiateCallTakeover(data.callSid, data.userPhoneNumber, {
        callerName:       data.callerName,
        callerNumber:     data.callerNumber,
        detectedCategory: data.detectedCategory,
        transcripts:      data.recentTranscripts,
        triggeredByAI:    true
      });

      if (result.success) {
        console.log(`✅ AI takeover bridge created: ${result.conferenceName}`);

        // Mark the call context as taken over
        const callCtx = voiceAgent.activeCalls.get(data.callSid);
        if (callCtx) {
          callCtx.isTakenOver = true;
          voiceAgent.emitSystemTranscript(callCtx, '✅ Owner is now connected to the call');
        }

        // Notify mobile app
        if (socketIO) {
          socketIO.to(`user:${data.userId}`).emit('call:takeover', {
            callId:       data.callSid,
            callerName:   data.callerName,
            callerNumber: data.callerNumber,
            reason:       'ai_transfer',
            conferenceName: result.conferenceName,
            timestamp:    new Date().toISOString()
          });
        }
      } else {
        console.error('❌ AI takeover failed:', result.error);
      }
    } catch (err) {
      console.error('❌ AI takeover error:', err);
    }
  });

  console.log('✅ Voice routes initialized');
  return voiceAgent;
}

export function getVoiceAgent() {
  return voiceAgent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: build prompt + context for a phone number
// ─────────────────────────────────────────────────────────────────────────────

async function buildCallContext(phoneNumber, userId, callInfo = {}) {
  if (!userId) throw new Error('userId is required for buildCallContext');
  const [user, callerCtx] = await Promise.all([
    userConfigService.getUser(userId),
    callHistoryService.getCallerContext(phoneNumber, userId)
  ]);

  // Detect if caller is a VIP contact (normalised phone comparison)
  const normalizedCaller = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
  const isVIP = (user?.vipContacts || []).some(v => {
    const normalizedVIP = v.phoneNumber.replace(/\D/g, '');
    return normalizedVIP === normalizedCaller ||
      normalizedCaller.endsWith(normalizedVIP) ||
      normalizedVIP.endsWith(normalizedCaller);
  });
  const vipContact = isVIP
    ? (user?.vipContacts || []).find(v => {
        const normalizedVIP = v.phoneNumber.replace(/\D/g, '');
        return normalizedVIP === normalizedCaller ||
          normalizedCaller.endsWith(normalizedVIP) ||
          normalizedVIP.endsWith(normalizedCaller);
      })
    : null;

  // Check if user is in priority time (pass caller number for emergency bypass check)
  const priorityTimeInfo = userConfigService.isInPriorityTime(user, phoneNumber);

  // ── DND + VIP logic ──────────────────────────────────────────────────────
  // During Priority Time:
  //   - ALL calls (including VIP) are handled by AI — no push notification
  //   - VIP callers are screened with a warmer, priority message
  //   - Only Emergency contacts bypass (handled in isInPriorityTime)
  //
  // Outside Priority Time:
  //   - Non-VIP calls → AI screens → push notification sent
  //   - VIP calls → AI screens with warm message → push notification sent
  //
  // suppressNotification = true when in priority time (AI silently handles)
  const suppressNotification = !!priorityTimeInfo?.inPriorityTime;

  // Add priority time, VIP info, and user info to callInfo for prompt generation
  const enrichedCallInfo = {
    ...callInfo,
    priorityTimeInfo,
    isVIP,
    vipContact,
    suppressNotification,
    user
  };

  const systemPrompt = PromptGenerator.generateSystemPrompt(user, callerCtx, enrichedCallInfo);
  const initialGreeting = callInfo.isOutbound
    ? PromptGenerator.generateOutboundGreeting(user, callerCtx, callInfo.callerName)
    : PromptGenerator.generateInitialGreeting(user, callerCtx);

  return { user, callerCtx, systemPrompt, initialGreeting, priorityTimeInfo, isVIP, vipContact, suppressNotification };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/incoming-call
// Twilio calls this when someone dials the Twilio number.
// We identify the user by the "To" number (dedicated number mode).
// ─────────────────────────────────────────────────────────────────────────────

router.post('/incoming-call', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('📞 INCOMING CALL');
  console.log('='.repeat(60));

  const { CallSid: callSid, From: from, To: to } = req.body;
  console.log(`   From: ${from} → To: ${to} (${callSid})`);

  if (!voiceAgent) {
    return res.status(500).send('Voice agent not ready');
  }

  try {
    // Identify the user by their Twilio number (the "To" field)
    const user = await userConfigService.getUserByTwilioNumber(to);
    if (!user) {
      console.error(`❌ No user found for Twilio number: ${to}`);
      return res.status(500).send('No user configured for this number');
    }

    const { callerCtx, systemPrompt, initialGreeting, priorityTimeInfo, isVIP, vipContact, suppressNotification } = await buildCallContext(from, user.userId, { from, to });

    // Check if caller is blocked
    if (user.blockedNumbers?.includes(from)) {
      console.log(`🚫 Blocked caller: ${from} → rejecting call`);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.reject({ reason: 'rejected' });
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    console.log(`👤 User: ${user.name} (${user.userId})`);
    console.log(`📚 Caller context: ${callerCtx?.totalCalls || 0} previous calls`);
    if (callerCtx?.lastCategoryLabel) {
      console.log(`   Last category: ${callerCtx.lastCategoryLabel}`);
    }
    if (isVIP) {
      console.log(`⭐ VIP caller detected: ${vipContact?.name} (${vipContact?.relationship || 'VIP'})`);
    }
    if (priorityTimeInfo?.inPriorityTime) {
      console.log(`⏰ User unavailable (priority time): ${priorityTimeInfo.startTime} - ${priorityTimeInfo.endTime}`);
      console.log(`   AI will handle call silently — no push notification`);
      if (isVIP) {
        console.log(`   VIP caller during priority time — AI screens with warm VIP message`);
      }
    }

    voiceAgent.handleIncomingCall(callSid, from, to, systemPrompt, initialGreeting, {
      userId: user.userId,
      user,
      callerCtx,
      callerName: callerCtx?.callerName || vipContact?.name || 'Unknown',
      priorityTimeInfo,
      isVIP,
      vipContact,
      suppressNotification  // mobile app uses this to skip ringing/notification
    });

    // Send push notification for incoming call
    pushService.sendLiveCallNotification(user.userId, {
      callId: callSid,
      callerName: callerCtx?.callerName || 'Unknown',
      callerNumber: from,
      context: callerCtx?.lastCategoryLabel
        ? `Likely: ${callerCtx.lastCategoryLabel}`
        : 'New caller',
    }).catch(err => console.error('Push notification error:', err));

    const twiml = voiceAgent.generateIncomingCallTwiML(req);
    res.type('text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('❌ incoming-call error:', err);
    res.status(500).send('Error handling call');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/call-status
// ─────────────────────────────────────────────────────────────────────────────

router.post('/call-status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To, Direction, ErrorCode, ErrorMessage } = req.body;

  console.log('\n' + '─'.repeat(50));
  console.log(`📊 CALL STATUS UPDATE`);
  console.log(`   SID      : ${CallSid}`);
  console.log(`   Status   : ${CallStatus}`);
  console.log(`   Duration : ${CallDuration || 0}s`);
  console.log(`   From     : ${From}`);
  console.log(`   To       : ${To}`);
  console.log(`   Direction: ${Direction || 'inbound'}`);
  if (ErrorCode)   console.log(`   ⚠️  Error  : [${ErrorCode}] ${ErrorMessage}`);

  if (voiceAgent) {
    const ctx = voiceAgent.activeCalls?.get(CallSid);
    if (ctx) {
      console.log(`   Context  : found ✅ (${ctx.transcripts?.length || 0} transcript lines so far)`);
    } else {
      console.log(`   Context  : ❌ NOT FOUND — call may have already been cleaned up or never registered`);
    }
    voiceAgent.handleCallStatus(CallSid, CallStatus, parseInt(CallDuration) || 0);
  } else {
    console.log(`   ⚠️  voiceAgent is null — voice routes not initialized!`);
  }
  console.log('─'.repeat(50));

  res.sendStatus(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /voice/status
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  if (!voiceAgent) return res.json({ status: 'not_initialized' });
  res.json({ status: 'ready', ...voiceAgent.getActiveCallStats() });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/outbound-call
//
// Initiate an outbound AI call for testing / real use.
//
// Body:
//   to          (required) E.164 phone number to call
//   callerName  (optional) Override name for the recipient
//   context     (optional) Extra context for the AI ("calling about X")
//   greeting    (optional) Override the opening line
//   userId      (optional) Which user config to use (default: "default")
// ─────────────────────────────────────────────────────────────────────────────

router.post('/outbound-call', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('📤 OUTBOUND CALL REQUEST');
  console.log('='.repeat(60));

  const { to, callerName, context: additionalContext, greeting: customGreeting } = req.body;
  const userId = req.user?.userId || req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId is required (authenticate or pass userId in body)' });

  if (!to) return res.status(400).json({ error: 'Missing required field: to' });
  if (!/^\+[1-9]\d{1,14}$/.test(to)) {
    return res.status(400).json({ error: 'Invalid phone number. Use E.164 format: +1234567890' });
  }
  if (!voiceAgent) return res.status(500).json({ error: 'Voice agent not ready' });

  try {
    const { user, callerCtx, systemPrompt, initialGreeting } = await buildCallContext(to, userId, {
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      isOutbound: true,
      callerName,
      additionalContext
    });

    // Store the provided caller name
    if (callerName) {
      await callHistoryService.updateCallerName(to, userId, callerName);
    }

    const greeting = customGreeting || initialGreeting;

    console.log(`👤 User: ${user.name}`);
    console.log(`📞 Calling: ${to} (${callerName || callerCtx?.callerName || 'Unknown'})`);
    console.log(`📚 Previous calls: ${callerCtx?.totalCalls || 0}`);
    console.log(`👋 Greeting: "${greeting}"`);

    const webhookUrl = process.env.WEBHOOK_URL || `https://${req.get('host')}`;

    const call = await voiceAgent.twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${webhookUrl}/voice/outbound-twiml`,
      statusCallback: `${webhookUrl}/voice/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });

    console.log(`✅ Outbound call initiated: ${call.sid}`);

    // Register context so that when Twilio opens the media-stream, we have it ready
    voiceAgent.handleIncomingCall(call.sid, to, process.env.TWILIO_PHONE_NUMBER, systemPrompt, greeting, {
      userId: user.userId,
      user,
      callerCtx,
      callerName: callerName || callerCtx?.callerName || 'Unknown',
      isOutbound: true
    });

    res.json({
      success: true,
      callSid: call.sid,
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      callerName: callerName || callerCtx?.callerName || 'Unknown',
      previousCalls: callerCtx?.totalCalls || 0,
      lastCategory: callerCtx?.lastCategoryLabel || null
    });
  } catch (err) {
    console.error('❌ outbound-call error:', err);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/outbound-twiml
// TwiML for outbound calls — Twilio fetches this when the call connects
// ─────────────────────────────────────────────────────────────────────────────

router.post('/outbound-twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  connect.stream({ url: `wss://${req.get('host')}/voice/media-stream` });
  res.type('text/xml');
  res.send(response.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/takeover
// User wants to join an ongoing call via Conference Bridge
// ─────────────────────────────────────────────────────────────────────────────

router.post('/takeover', async (req, res) => {
  const { callId, userPhoneNumber } = req.body;

  console.log(`📞 TAKEOVER: ${callId} → ${userPhoneNumber}`);

  if (!callId || !userPhoneNumber) {
    return res.status(400).json({ error: 'callId and userPhoneNumber required' });
  }
  if (!voiceAgent) return res.status(500).json({ error: 'Voice agent not available' });

  try {
    const twilioService = (await import('../services/twilioService.js')).default;
    const callContext = voiceAgent.activeCalls.get(callId);

    if (!callContext) {
      return res.status(404).json({ error: 'Call not found or already ended' });
    }

    // Mark the call as taken over so transcript logic is aware
    callContext.isTakenOver = true;

    // Emit a system message into the live transcript immediately
    voiceAgent.emitSystemTranscript(callContext, '📲 You are joining the call now...');

    const result = await twilioService.initiateCallTakeover(callId, userPhoneNumber, {
      callerName: callContext.context?.callerName || 'Unknown',
      callerNumber: callContext.from,
      transcripts: callContext.transcripts?.slice(-6) || [],
      triggeredByAI: false
    });

    if (result.success) {
      // Emit the connected system message and the socket takeover event
      voiceAgent.emitSystemTranscript(callContext, '✅ You are now connected to the call');

      if (socketIO) {
        socketIO.to(`user:${callContext.userId}`).emit('call:takeover', {
          callId,
          callerName: callContext.context?.callerName || 'Unknown',
          callerNumber: callContext.from,
          reason: 'manual',
          conferenceName: result.conferenceName,
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        message: 'Connecting you to the call...',
        conferenceName: result.conferenceName
      });
    } else {
      res.status(500).json({ error: 'Takeover failed', details: result.error });
    }
  } catch (err) {
    console.error('❌ takeover error:', err);
    res.status(500).json({ error: 'Takeover failed', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/end-call
// ─────────────────────────────────────────────────────────────────────────────

router.post('/end-call', async (req, res) => {
  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId required' });

  try {
    const twilioService = (await import('../services/twilioService.js')).default;
    const result = await twilioService.endCall(callId);
    result.success
      ? res.json({ success: true })
      : res.status(500).json({ error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
