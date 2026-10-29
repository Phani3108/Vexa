/**
 * Web Push routes — /api/push/*
 *
 *   GET    /key          the server's public VAPID key (null when Web Push is off)
 *   POST   /subscribe    { subscription } register this browser / installed app
 *   DELETE /subscribe    { endpoint } unregister it
 *   POST   /test         send a test notification to every device
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import UserConfig from '../models/mongodb/UserConfig.js';
import { vapidPublicKey, isSubscription } from '../lib/webPush.js';
import { notifyUser } from '../services/pushNotificationService.js';

const router = express.Router();
router.use(authenticate);

const MAX_DEVICES = 10;

router.get('/key', (req, res) => res.json({ publicKey: vapidPublicKey() }));

router.post('/subscribe', async (req, res) => {
  const sub = req.body?.subscription;
  if (!isSubscription(sub)) return res.status(400).json({ error: 'A valid push subscription is required' });
  await UserConfig.updateOne({ userId: req.userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
  await UserConfig.updateOne({ userId: req.userId }, {
    $push: { pushSubscriptions: { $each: [{ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, addedAt: new Date() }], $slice: -MAX_DEVICES } }
  });
  res.json({ ok: true });
});

router.delete('/subscribe', async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  await UserConfig.updateOne({ userId: req.userId }, { $pull: { pushSubscriptions: { endpoint } } });
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const r = await notifyUser(req.userId, { title: 'Vexa notifications are on', body: 'You will hear about urgent calls, scams and reminders here.', type: 'test' });
  res.json({ sent: r.success });
});

export default router;
