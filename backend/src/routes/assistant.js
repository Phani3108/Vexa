/**
 * Assistant & bookings — /api/assistant/*, /api/bookings/*
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { dailyBrief, runCommand } from '../services/assistantService.js';
import userConfigService from '../services/userConfigService.js';
import Booking from '../models/mongodb/Booking.js';
import { sendSms } from '../workflows/outcomes.js';
import { newLedger, withLedger, summarize } from '../lib/usage.js';

export const assistantRouter = express.Router();
assistantRouter.use(authenticate);

assistantRouter.get('/brief', async (req, res) => {
  res.json(await dailyBrief(req.userId));
});

assistantRouter.post('/command', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Say something for Vexa to do' });
  const ledger = newLedger();
  const result = await withLedger(ledger, 'ask vexa', () => runCommand(req.userId, text));
  res.json({ ...result, aiUsage: summarize(ledger) });
});

// PUT /api/assistant/shield { mode, minutes? }
assistantRouter.put('/shield', async (req, res) => {
  const { mode, minutes } = req.body || {};
  if (!['standard', 'focus', 'aggressive', 'silent'].includes(mode)) return res.status(400).json({ error: 'mode must be standard, focus, aggressive or silent' });
  const until = minutes ? new Date(Date.now() + Math.min(Number(minutes), 7 * 24 * 60) * 60000) : null;
  const user = await userConfigService.updateUser(req.userId, { shield: { mode, until } });
  res.json({ shield: user.shield });
});

export const bookingsRouter = express.Router();
bookingsRouter.use(authenticate);

bookingsRouter.get('/', async (req, res) => {
  const filter = { userId: req.userId };
  if (req.query.status) filter.status = req.query.status;
  const bookings = await Booking.find(filter).sort({ status: 1, createdAt: -1 }).limit(100).lean();
  res.json({ bookings });
});

// PATCH /api/bookings/:id { status: confirmed|declined, confirmedTime?, note?, notify? }
bookingsRouter.patch('/:id', async (req, res) => {
  const { status, confirmedTime, note, notify = true } = req.body || {};
  if (!['confirmed', 'declined', 'cancelled', 'requested'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const booking = await Booking.findOne({ _id: req.params.id, userId: req.userId }).catch(() => null);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  booking.status = status;
  if (confirmedTime) booking.confirmedTime = String(confirmedTime).slice(0, 80);
  if (note !== undefined) booking.note = String(note).slice(0, 500);
  await booking.save();

  let sms = null;
  if (notify && ['confirmed', 'declined'].includes(status) && booking.phoneNumber) {
    const user = await userConfigService.getUser(req.userId);
    const biz = user.businessProfile?.businessName || user.name;
    const when = booking.confirmedTime || booking.requestedTime || '';
    const first = (booking.customerName || 'there').split(' ')[0];
    const body = status === 'confirmed'
      ? `Hi ${first}, your ${booking.service || 'appointment'}${when ? ` on ${when}` : ''} with ${biz} is confirmed. Reply or call if anything changes.`
      : `Hi ${first}, ${biz} here — unfortunately we can't do ${when || 'that time'}. We'll call you to find another slot.`;
    sms = booking.callId?.startsWith('test_') ? { status: 'simulated', body } : { ...(await sendSms({ to: booking.phoneNumber, from: user.twilioNumber || process.env.TWILIO_PHONE_NUMBER, body })), body };
  }
  res.json({ booking, sms });
});
