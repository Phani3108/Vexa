/**
 * Call Routes — /api/calls/*
 *
 * All routes require authentication. userId from the JWT scopes every query.
 */

import express from 'express';
import callHistoryService from '../services/callHistoryService.js';
import { authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';
import Caller from '../models/mongodb/Caller.js';
import Call from '../models/mongodb/Call.js';
import { sendSms } from '../workflows/outcomes.js';

const router = express.Router();
router.use(authenticate);

const FOLLOW_UP_STATUSES = ['none', 'new', 'in_progress', 'done'];

// GET /api/calls?limit&offset&category&q&followUp=open|new|in_progress|done&leads=1&includeTest=1
router.get('/', async (req, res) => {
  const { limit = 50, offset = 0, category, q, followUp, leads, includeTest } = req.query;
  const result = await callHistoryService.getAllCalls(req.userId, limit, offset, {
    category: category || undefined,
    q: q || undefined,
    followUp: followUp || undefined,
    leadsOnly: leads === '1' || leads === 'true',
    includeTest: includeTest === '1' || includeTest === 'true'
  });
  res.json(result);
});

// GET /api/calls/stats?days=7  — dashboard KPIs
router.get('/stats', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const stats = await callHistoryService.getStats(req.userId, days);
  if (!stats) return res.status(503).json({ error: 'Database unavailable' });
  res.json(stats);
});

// GET /api/calls/callers — known caller profiles (contacts learned by the AI)
router.get('/callers', async (req, res) => {
  const callers = await callHistoryService.listCallers(req.userId);
  res.json({ callers });
});

// GET /api/calls/caller/:phoneNumber — full context for a phone number
router.get('/caller/:phoneNumber', async (req, res) => {
  const context = await callHistoryService.getCallerContext(req.params.phoneNumber, req.userId);
  if (!context) return res.status(404).json({ error: 'No calls from this number' });
  res.json(context);
});

// PATCH /api/calls/caller/:phoneNumber — update caller profile (name, notes, tags)
router.patch('/caller/:phoneNumber', async (req, res) => {
  const result = await callHistoryService.updateCallerProfile(req.params.phoneNumber, req.userId, req.body || {});
  if (!result) return res.status(503).json({ error: 'Failed to update caller profile' });
  res.json({ caller: result });
});

// GET /api/calls/caller/:phoneNumber/profile — raw caller profile (notes, rules)
router.get('/caller/:phoneNumber/profile', async (req, res) => {
  const caller = await Caller.findOne({ userId: req.userId, phoneNumber: req.params.phoneNumber }).lean();
  res.json({ caller: caller || { phoneNumber: req.params.phoneNumber, callerName: 'Unknown', instructions: [], alwaysTransfer: false } });
});

function draftFor(call, user) {
  const s = call.workflowRun?.slots || {};
  const a = call.analysis || {};
  const name = (s.name && s.name !== '—' ? s.name : null) || a.callerName || a.lead?.name;
  const hi = name ? `Hi ${String(name).split(' ')[0]}` : 'Hi';
  const owner = (user.name && user.name !== 'User' ? user.name : '').split(' ')[0];
  const biz = (user.businessProfile?.businessName || '').replace(/[.\s]+$/, '');
  const me = user.accountType === 'personal' ? `it's ${owner || 'me'}` : `this is ${owner ? `${owner} from ` : ''}${biz || 'us'}`;
  const rawNeed = s.need || s.service || s.issue || s.reason || s.details || a.lead?.need || a.topic;
  // Mid-sentence: "about water heater replacement", not "about Water heater…"
  // Lower-case a leading capital ("Leak" → "leak") but keep acronyms ("AC servicing")
  const need = rawNeed && !/^[A-Z]{2}/.test(rawNeed) ? rawNeed.charAt(0).toLowerCase() + rawNeed.slice(1) : rawNeed;
  const when = s.timing || s.when || s.newTime || s.callbackTime || a.lead?.preferredTime;
  switch (call.workflowRun?.workflowId) {
    case 'lead_intake': return `${hi}, ${me}. Thanks for reaching out about ${need || 'your project'}. I'd love to get you a quote — are you free for a quick call ${when && when !== 'ASAP' ? when : 'today'}?`;
    case 'booking': return `${hi}, ${me}. Got your request for ${need || 'an appointment'}${when ? ` (${when})` : ''}. I'll confirm the exact time shortly!`;
    case 'reschedule': return `${hi}, ${me}. Got your message about your appointment — I'll confirm the change shortly.`;
    case 'existing_customer': return `${hi}, ${me}. Sorry about the trouble${need ? ` with ${need}` : ''}. I'm on it and will call you today.`;
    case 'emergency': return `${hi}, ${me}. I got your emergency call and I'm on my way / calling you right now.`;
    default: return `${hi}, ${me} — got your message${need ? ` about ${need}` : ''}. I'll call you back ${when && when !== '—' ? when : 'soon'}.`;
  }
}

// GET /api/calls/:id/reply-draft — one-tap text back to the caller
router.get('/:id/reply-draft', async (req, res) => {
  const call = await callHistoryService.getCallById(req.params.id, req.userId);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  const user = await userConfigService.getUser(req.userId);
  res.json({
    body: draftFor(call, user),
    to: call.analysis?.lead?.callbackNumber || call.phoneNumber,
    canSend: !!(process.env.TWILIO_ACCOUNT_SID && (user.twilioNumber || process.env.TWILIO_PHONE_NUMBER))
  });
});

// POST /api/calls/:id/sms { body } — send the reply from the business number
router.post('/:id/sms', async (req, res) => {
  const call = await callHistoryService.getCallById(req.params.id, req.userId);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  const body = String(req.body?.body || '').trim().slice(0, 640);
  if (!body) return res.status(400).json({ error: 'Message is empty' });
  const user = await userConfigService.getUser(req.userId);
  const result = call.isTest
    ? { status: 'simulated' }
    : await sendSms({ to: call.analysis?.lead?.callbackNumber || call.phoneNumber, from: user.twilioNumber || process.env.TWILIO_PHONE_NUMBER, body });
  if (result.status === 'sent' || result.status === 'simulated') {
    await Call.updateOne({ _id: call._id }, { $set: { 'followUp.status': 'in_progress', 'followUp.updatedAt': new Date(), 'followUp.note': `${call.followUp?.note ? `${call.followUp.note}\n` : ''}Texted: ${body}` } });
  }
  res.status(result.status === 'failed' ? 502 : 200).json(result);
});

// GET /api/calls/:id — full call detail with transcript
router.get('/:id', async (req, res) => {
  const call = await callHistoryService.getCallById(req.params.id, req.userId);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ call });
});

// PATCH /api/calls/:id/follow-up  { status, note }
router.patch('/:id/follow-up', async (req, res) => {
  const { status, note } = req.body || {};
  if (status && !FOLLOW_UP_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${FOLLOW_UP_STATUSES.join(', ')}` });
  }
  const call = await callHistoryService.updateFollowUp(req.params.id, req.userId, { status, note });
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ followUp: call.followUp });
});

// DELETE /api/calls/:id
router.delete('/:id', async (req, res) => {
  const ok = await callHistoryService.deleteCall(req.params.id, req.userId);
  if (!ok) return res.status(404).json({ error: 'Call not found' });
  res.json({ success: true });
});

export default router;
