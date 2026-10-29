/**
 * Your data — /api/account
 *
 *   GET    /export    download everything Vexa holds about you (JSON)
 *   DELETE /          { confirm: "DELETE" } erase the account and all its data (cannot be undone)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import account from '../services/accountService.js';

const router = express.Router();
router.use(authenticate);
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many requests. Try again later.' } }));

router.get('/export', async (req, res) => {
  try {
    const data = await account.exportAll(req.userId);
    res.setHeader('Content-Disposition', `attachment; filename="vexa-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Export failed' });
  }
});

router.delete('/', async (req, res) => {
  if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to erase your account' });
  try {
    res.json(await account.deleteAll(req.userId));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Delete failed' });
  }
});

export default router;
