/**
 * AI usage and the daily budget — /api/usage
 *
 *   GET  /          today's spend (by purpose), the budget, the last 7 days
 *   PUT  /budget    { dailyAiUsd } between $0.10 and the server maximum (MAX_DAILY_AI_BUDGET_USD)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';
import quota from '../services/quotaService.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const user = await userConfigService.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(await quota.usage(user));
});

router.put('/budget', async (req, res) => {
  const n = Math.round(Number(req.body?.dailyAiUsd) * 100) / 100;
  if (!(n >= 0.1 && n <= quota.MAX_DAILY_USD)) return res.status(400).json({ error: `Choose between $0.10 and $${quota.MAX_DAILY_USD} per day` });
  const user = await userConfigService.updateUser(req.userId, { 'limits.dailyAiUsd': n });
  if (!user) return res.status(500).json({ error: 'Could not save' });
  res.json(await quota.usage(user));
});

export default router;
