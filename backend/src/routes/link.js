/**
 * Vexa Link routes.
 *
 * Public (no sign-in) — /api/public/link/:slug
 *   GET    /                 business name, description, open now (nothing private)
 *   POST   /start            start a conversation        (10 per hour per visitor IP)
 *   POST   /:sid/message     { text } one visitor turn   (30 per minute per visitor IP)
 *   POST   /:sid/end         end it (saved as a call with channel 'link')
 *
 * Owner — /api/link
 *   GET    /                 { enabled, slug, dailyLimit, usedToday }
 *   PUT    /                 { enabled?, slug?, dailyLimit? }
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import link from '../services/linkService.js';

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' }); if (!e.status) console.error('link:', e.message); }
};

export const publicLinkRouter = express.Router({ mergeParams: true });
const starts = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many new conversations from this device. Try again later.' } });
const turns = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Slow down a little.' } });
publicLinkRouter.get('/', wrap(req => link.publicInfo(req.params.slug)));
publicLinkRouter.post('/start', starts, wrap(req => link.start(req.params.slug)));
publicLinkRouter.post('/:sid/message', turns, wrap(req => link.message(req.params.slug, req.params.sid, req.body?.text)));
publicLinkRouter.post('/:sid/end', turns, wrap(req => link.end(req.params.slug, req.params.sid)));

export const linkSettingsRouter = express.Router();
linkSettingsRouter.use(authenticate);
linkSettingsRouter.get('/', wrap(req => link.getSettings(req.userId)));
linkSettingsRouter.put('/', wrap(req => link.updateSettings(req.userId, req.body || {})));
