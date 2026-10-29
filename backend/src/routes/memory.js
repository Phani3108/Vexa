/**
 * Memory routes — /api/memory/*
 *
 *   GET    /?status=open|done|all   promises, quotes and facts from calls
 *   PATCH  /:id                     { status: open|done|dismissed }
 *   DELETE /:id                     forget it
 *   POST   /ask                     { question } answered only from your calls
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import memory from '../services/memoryService.js';

const router = express.Router();
router.use(authenticate);

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' }); }
};

router.get('/', wrap(async req => ({ memories: await memory.list(req.userId, { status: String(req.query.status || 'open') }) })));
router.patch('/:id', wrap(async req => ({ memory: await memory.update(req.userId, req.params.id, req.body || {}) })));
router.delete('/:id', wrap(async req => { await memory.remove(req.userId, req.params.id); return { ok: true }; }));
router.post('/ask', rateLimit({ windowMs: 60 * 1000, max: 20 }), wrap(req => memory.ask(req.userId, String(req.body?.question || '').slice(0, 300))));

export default router;
