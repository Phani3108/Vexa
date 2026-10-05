/**
 * Voice Routes — Twilio webhook handlers + outbound call API
 *
 * Twilio webhooks (signature-validated):
 *   POST /voice/incoming-call     someone called the business number
 *   POST /voice/call-status       call status updates
 *   POST /voice/outbound-twiml    TwiML for outbound calls
 *   POST /voice/takeover-status   status of the owner's leg during a takeover
 *
 * Owner API (JWT required):
 *   POST /voice/outbound-call     initiate an outbound call with the AI agent
 *   POST /voice/takeover          owner joins an ongoing call (Conference)
 *   POST /voice/end-call          force-end an ongoing call
 *   GET  /voice/status            the owner's active calls
 */

import express from 'express';
import twilio from 'twilio';
import VoiceAgent from '../voice/VoiceAgent.js';
import PromptGenerator from '../voice/PromptGenerator.js';
import callHistoryService from '../services/callHistoryService.js';
import userConfigService from '../services/userConfigService.js';
import twilioService from '../services/twilioService.js';
import ConversationAnalyzer from '../voice/ConversationAnalyzer.js';
import pushService from '../services/pushNotificationService.js';
import { authenticate } from '../middleware/auth.js';
import { findByPhone, isValidE164 } from '../lib/phone.js';
import { openCallSession, finalizeCallSession } from '../workflows/callSession.js';

const router = express.Router();

let voiceAgent = null;
let conversationAnalyzer = null;
let socketIO = null;

// ─────────────────────────────────────────────────────────────────────────────
// Twilio request signature validation
// Enabled in production (or TWILIO_VALIDATE_SIGNATURE=true). Without it anyone
// could POST fake calls into an account.
// ─────────────────────────────────────────────────────────────────────────────

function twilioWebhook(req, res, next) {
  const enabled = process.env.TWILIO_VALIDATE_SIGNATURE
    ? process.env.TWILIO_VALIDATE_SIGNATURE === 'true'
    : process.env.NODE_ENV === 'production';
  if (!enabled) return next();

  const signature = req.headers['x-twilio-signature'];
  const base = process.env.WEBHOOK_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base.replace(/\/+$/, '')}${req.originalUrl}`;
  if (signature && twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body || {})) {
    return next();
  }
  console.warn(`🚫 Rejected unsigned/invalid Twilio webhook: ${req.originalUrl}`);
  return res.status(403).send('Invalid Twilio signature');
}

function streamUrl(req) {
  const base = process.env.WEBHOOK_URL || `https://${req.get('host')}`;
  return `${base.replace(/^http/, 'ws').replace(/\/+$/, '')}/voice/media-stream`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialise
// ─────────────────────────────────────────────────────────────────────────────

export function initVoiceRoutes(config, io = null) {
  socketIO = io;
  voiceAgent = new VoiceAgent(config, io);
  conversationAnalyzer = new ConversationAnalyzer(config);

  // When a call ends: analyze + save + notify
  voiceAgent.on('call:completed', async (result) => {
    try {
      const user = await userConfigService.getUser(result.userId);
      // Flow-driven calls: the engine's run is the source of truth for leads, bookings, SMS
      if (result.context?.flowSession && user) {
        await finalizeCallSession({ session: result.context.flowSession, user, callResult: result, io: socketIO });
        return;
      }
      const analysis = await conversationAnalyzer.analyze(result.transcripts, {
        categories: user?.callCategories || [],
        accountType: user?.accountType
      });
      console.log(`📞 Call completed: ${result.callId} → ${analysis.categoryId} (${analysis.confidence.toFixed(2)})`);

      const saved = await callHistoryService.saveCall(result, analysis);

      if (socketIO && result.userId) {
        socketIO.to(`user:${result.userId}`).emit('call:analyzed', {
          callId: result.callId,
          summary: analysis.summary,
          categoryId: analysis.categoryId,
          categoryLabel: analysis.categoryLabel,
          isLead: !!analysis.lead?.isLead,
          followUp: saved?.followUp?.status || 'none'
        });
      }

      // Respect category notify flags, spam, and priority time
      const category = (user?.callCategories || []).find(c => c.id === analysis.categoryId);
      const quiet = result.context?.suppressNotification || analysis.isSpam || category?.notify === false;
      if (result.userId && !quiet) {
        pushService.sendCallSummaryNotification(result.userId, {
          callId: result.callId,
          callerName: analysis.callerName || result.context?.callerName || 'Unknown',
          callerNumber: result.from,
          summary: analysis.summary || 'Call completed',
        }).catch(err => console.error('Push notification error:', err.message));
      }
    } catch (err) {
      console.error('❌ Error on call:completed:', err);
    }
  });

  voiceAgent.on('call:urgent', (data) => {
    pushService.sendUrgentCallNotification(data.userId, data)
      .catch(err => console.error('Urgent push error:', err.message));
  });

  // When AI decides a live transfer is needed
  voiceAgent.on('call:takeover-needed', async (data) => {
    console.log(`🔀 AI-triggered takeover: ${data.callSid} → ${data.userPhoneNumber}`);
    const result = await twilioService.initiateCallTakeover(data.callSid, data.userPhoneNumber, {
      callerName:       data.callerName,
      callerNumber:     data.callerNumber,
      detectedCategory: data.detectedCategory,
      transcripts:      data.recentTranscripts,
      triggeredByAI:    true
    });

    const callCtx = voiceAgent.activeCalls.get(data.callSid);
    if (result.success) {
      if (callCtx) {
        callCtx.isTakenOver = true;
        voiceAgent.emitSystemTranscript(callCtx, '✅ Owner is now connected to the call');
      }
      socketIO?.to(`user:${data.userId}`).emit('call:takeover', {
        callId:       data.callSid,
        callerName:   data.callerName,
        callerNumber: data.callerNumber,
        reason:       'ai_transfer',
        conferenceName: result.conferenceName,
        timestamp:    new Date().toISOString()
      });
    } else {
      console.error('❌ AI takeover failed:', result.error);
      // Don't leave the caller in silence — the AI already said "transferring"
      if (callCtx) voiceAgent._hangupCall(callCtx);
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

export async function buildCallContext(phoneNumber, user, callInfo = {}) {
  if (!user) throw new Error('user is required for buildCallContext');
  const callerCtx = await callHistoryService.getCallerContext(phoneNumber, user.userId);

  const vipContact = findByPhone(user.vipContacts, phoneNumber);
  const isVIP = !!vipContact;

  const priorityTimeInfo = userConfigService.isInPriorityTime(user, phoneNumber);
  const businessHours = user.accountType === 'business' ? userConfigService.businessHoursStatus(user) : null;

  // During priority time the AI handles everything silently (no push / ringing)
  const suppressNotification = !!priorityTimeInfo?.inPriorityTime;

  const enrichedCallInfo = { ...callInfo, priorityTimeInfo, businessHours, isVIP, vipContact, suppressNotification, user };

  const systemPrompt = PromptGenerator.generateSystemPrompt(user, callerCtx, enrichedCallInfo);
  const initialGreeting = callInfo.isOutbound
    ? PromptGenerator.generateOutboundGreeting(user, callerCtx, callInfo.callerName)
    : PromptGenerator.generateInitialGreeting(user, callerCtx);

  return { user, callerCtx, systemPrompt, initialGreeting, priorityTimeInfo, businessHours, isVIP, vipContact, suppressNotification };
}

function ownedCall(req, res) {
  const callId = req.body?.callId;
  if (!callId) {
    res.status(400).json({ error: 'callId required' });
    return null;
  }
  const ctx = voiceAgent?.activeCalls.get(callId);
  if (!ctx || ctx.userId !== req.userId) {
    res.status(404).json({ error: 'Call not found or already ended' });
    return null;
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /voice/incoming-call
// ─────────────────────────────────────────────────────────────────────────────

router.post('/incoming-call', twilioWebhook, async (req, res) => {
  const { CallSid: callSid, From: from, To: to } = req.body;
  console.log(`\n📞 INCOMING CALL ${callSid}: ${from} → ${to}`);

  const twimlError = (message) => {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(message);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  };

  if (!voiceAgent) return twimlError('Sorry, this line is not available right now.');

  try {
    const user = await userConfigService.getUserByTwilioNumber(to);
    if (!user) {
      console.error(`❌ No account for Twilio number: ${to}`);
      return twimlError('Sorry, this number is not in service.');
    }

    // Blocked callers are rejected before we spend anything on context or AI
    if (userConfigService.isBlocked(user, from)) {
      console.log(`🚫 Blocked caller: ${from}`);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.reject({ reason: 'rejected' });
      return res.type('text/xml').send(twiml.toString());
    }

    const { callerCtx, systemPrompt, initialGreeting, priorityTimeInfo, isVIP, vipContact, suppressNotification } =
      await buildCallContext(from, user, { from, to });

    // Multi-turn flow engine (on unless the owner disabled it). It also scores spam risk before we answer.
    const flowSession = user.flowsDisabled ? null : await openCallSession({ user, callerNumber: from, io: socketIO, callId: callSid });
    if (flowSession && flowSession.shield === 'aggressive' && flowSession.risk.score >= 80) {
      console.log(`🛡️  Rejected high-risk caller ${from} (risk ${flowSession.risk.score}: ${flowSession.risk.reasons.join('; ')})`);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.reject({ reason: 'rejected' });
      return res.type('text/xml').send(twiml.toString());
    }

    voiceAgent.handleIncomingCall(callSid, from, to, systemPrompt, flowSession?.greeting?.say || initialGreeting, {
      flowSession,
      userId: user.userId,
      user,
      callerCtx,
      callerName: (callerCtx?.callerName !== 'Unknown' && callerCtx?.callerName) || vipContact?.name || 'Unknown',
      priorityTimeInfo,
      isVIP,
      vipContact,
      suppressNotification
    });

    if (!suppressNotification && userConfigService.effectiveShield(user) !== 'silent') {
      pushService.sendLiveCallNotification(user.userId, {
        callId: callSid,
        callerName: vipContact?.name || callerCtx?.callerName || 'Unknown',
        callerNumber: from,
        context: callerCtx?.lastCategoryLabel ? `Likely: ${callerCtx.lastCategoryLabel}` : 'New caller',
      }).catch(err => console.error('Push notification error:', err.message));
    }

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.connect().stream({ url: streamUrl(req) });
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('❌ incoming-call error:', err);
    twimlError('Sorry, something went wrong. Please try again later.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Twilio status callbacks
// ─────────────────────────────────────────────────────────────────────────────

router.post('/call-status', twilioWebhook, (req, res) => {
  const { CallSid, CallStatus, CallDuration, ErrorCode, ErrorMessage } = req.body;
  console.log(`📊 Call status ${CallSid}: ${CallStatus} (${CallDuration || 0}s)${ErrorCode ? ` [${ErrorCode}] ${ErrorMessage}` : ''}`);
  voiceAgent?.handleCallStatus(CallSid, CallStatus, parseInt(CallDuration) || 0);
  res.sendStatus(200);
});

router.post('/takeover-status', twilioWebhook, (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`📊 Takeover leg ${CallSid}: ${CallStatus}`);
  res.sendStatus(200);
});

router.post('/outbound-twiml', twilioWebhook, (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.connect().stream({ url: streamUrl(req) });
  res.type('text/xml').send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// Owner API (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', authenticate, (req, res) => {
  if (!voiceAgent) return res.json({ status: 'not_initialized', calls: [] });
  const stats = voiceAgent.getActiveCallStats();
  const calls = stats.calls.filter(c => voiceAgent.activeCalls.get(c.callSid)?.userId === req.userId);
  res.json({ status: 'ready', totalActiveCalls: calls.length, calls });
});

router.post('/outbound-call', authenticate, async (req, res) => {
  const { to, callerName, context: additionalContext, greeting: customGreeting } = req.body;

  if (!isValidE164(to)) {
    return res.status(400).json({ error: 'Invalid phone number. Use E.164 format: +14155551234' });
  }
  if (!voiceAgent) return res.status(503).json({ error: 'Voice agent not configured' });

  try {
    const user = await userConfigService.getUser(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const from = user.twilioNumber || process.env.TWILIO_PHONE_NUMBER;

    const { callerCtx, systemPrompt, initialGreeting } = await buildCallContext(to, user, {
      from, to, isOutbound: true, callerName, additionalContext
    });

    if (callerName) await callHistoryService.updateCallerName(to, user.userId, callerName);

    const greeting = (typeof customGreeting === 'string' && customGreeting.slice(0, 300)) || initialGreeting;
    const webhookUrl = process.env.WEBHOOK_URL || `https://${req.get('host')}`;

    const call = await voiceAgent.twilioClient.calls.create({
      to,
      from,
      url: `${webhookUrl}/voice/outbound-twiml`,
      statusCallback: `${webhookUrl}/voice/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });

    voiceAgent.handleIncomingCall(call.sid, to, from, systemPrompt, greeting, {
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
      from,
      callerName: callerName || callerCtx?.callerName || 'Unknown',
      previousCalls: callerCtx?.totalCalls || 0,
      lastCategory: callerCtx?.lastCategoryLabel || null
    });
  } catch (err) {
    console.error('❌ outbound-call error:', err);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

router.post('/takeover', authenticate, async (req, res) => {
  if (!voiceAgent) return res.status(503).json({ error: 'Voice agent not configured' });
  const callContext = ownedCall(req, res);
  if (!callContext) return;

  const user = callContext.context?.user;
  const userPhoneNumber = (isValidE164(req.body.userPhoneNumber) && req.body.userPhoneNumber)
    || user?.businessProfile?.transferNumber
    || req.userId;

  try {
    callContext.isTakenOver = true;
    voiceAgent.emitSystemTranscript(callContext, '📲 You are joining the call now...');

    const result = await twilioService.initiateCallTakeover(callContext.callSid, userPhoneNumber, {
      callerName: callContext.context?.callerName || 'Unknown',
      callerNumber: callContext.from,
      detectedCategory: callContext.context?.detectedCategory,
      transcripts: callContext.transcripts?.slice(-6) || [],
      triggeredByAI: false
    });

    if (!result.success) {
      callContext.isTakenOver = false;
      return res.status(502).json({ error: 'Takeover failed', details: result.error });
    }

    voiceAgent.emitSystemTranscript(callContext, '✅ You are now connected to the call');
    socketIO?.to(`user:${callContext.userId}`).emit('call:takeover', {
      callId: callContext.callSid,
      callerName: callContext.context?.callerName || 'Unknown',
      callerNumber: callContext.from,
      reason: 'manual',
      conferenceName: result.conferenceName,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: 'Connecting you to the call...', conferenceName: result.conferenceName });
  } catch (err) {
    console.error('❌ takeover error:', err);
    res.status(500).json({ error: 'Takeover failed' });
  }
});

// POST /voice/whisper { callId, text? , action?: transfer|end|ask_email } — steer a live call
router.post('/whisper', authenticate, async (req, res) => {
  if (!voiceAgent) return res.status(503).json({ error: 'Voice agent not configured' });
  const callContext = ownedCall(req, res);
  if (!callContext) return;
  const { text, action } = req.body || {};
  if (!text && !['transfer', 'end', 'ask_email'].includes(action)) return res.status(400).json({ error: 'text or a valid action is required' });
  const result = await voiceAgent.whisper(callContext.callSid, { text: text ? String(text).slice(0, 300) : undefined, action });
  if (!result) return res.status(409).json({ error: 'This call can’t be steered (it is ending or not flow-driven)' });
  res.json({ success: true, say: result.say });
});

router.post('/end-call', authenticate, async (req, res) => {
  if (!voiceAgent) return res.status(503).json({ error: 'Voice agent not configured' });
  const callContext = ownedCall(req, res);
  if (!callContext) return;

  const result = await twilioService.endCall(callContext.callSid);
  result.success ? res.json({ success: true }) : res.status(502).json({ error: result.error });
});

export default router;
