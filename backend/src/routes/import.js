/**
 * Import — /api/import
 *
 *   POST /   { kind: catalog|records|listings, csv? | url? (Google Sheets), mode: replace|append, dryRun? }
 *            → { imported, total, errors: [{ row, message }], columns, preview }
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { importData } from '../services/importService.js';

const router = express.Router();
router.use(authenticate);

router.post('/', rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Too many imports. Wait a minute.' } }), async (req, res) => {
  try {
    const { kind, csv, url, mode, dryRun } = req.body || {};
    res.json(await importData(req.userId, { kind, csv, url, mode: mode === 'append' ? 'append' : 'replace', dryRun: !!dryRun }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Import failed' });
    if (!e.status) console.error('import:', e.message);
  }
});

export default router;
