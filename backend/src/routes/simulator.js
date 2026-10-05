/**
 * Simulator Routes — /api/simulator/*  ("Test your receptionist")
 *
 *   POST /api/simulator/start           { callerNumber? } → { sessionId, greeting, mode }
 *   POST /api/simulator/:id/message     { text }          → { reply, ended, transferred, detectedCategory, call? }
 *   POST /api/simulator/:id/end                           → { call }
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import simulator from '../services/simulatorService.js';
import { isValidE164 } from '../lib/phone.js';

const router = express.Router();
router.use(authenticate);
router.use(rateLimit({ windowMs: 60 * 1000, max: 40, message: { error: 'Slow down a little — too many test messages.' } }));

router.post('/start', async (req, res) => {
  const callerNumber = isValidE164(req.body?.callerNumber) ? req.body.callerNumber : undefined;
  const flowId = typeof req.body?.flowId === 'string' ? req.body.flowId : undefined;
  res.json(await simulator.startSession(req.userId, { callerNumber, flowId }));
});

router.post('/:id/message', async (req, res) => {
  res.json(await simulator.sendMessage(req.userId, req.params.id, req.body?.text));
});

// Owner steers the call: { text } relays a message, { action: 'transfer'|'end'|'ask_email' }
router.post('/:id/whisper', async (req, res) => {
  const { text, action } = req.body || {};
  if (!text && !['transfer', 'end', 'ask_email'].includes(action)) return res.status(400).json({ error: 'text or a valid action is required' });
  res.json(await simulator.whisper(req.userId, req.params.id, { text: text ? String(text).slice(0, 300) : undefined, action }));
});

router.post('/:id/end', async (req, res) => {
  res.json(await simulator.endSession(req.userId, req.params.id));
});

export default router;
