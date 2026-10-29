/**
 * Interpreter routes.
 *
 * Owner — /api/interpreter
 *   POST   /                    { lang, guestLang? } open a room
 *   GET    /:room?after=n       new messages
 *   POST   /:room/say           { text }
 *   PUT    /:room/lang          { lang }
 *   DELETE /:room               close it
 *
 * Guest (no sign-in) — /api/public/interpreter/:room
 *   POST   /join                { lang }
 *   GET    /?after=n
 *   POST   /say                 { text }      (20 per minute per IP)
 *   PUT    /lang                { lang }
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import interp from '../services/interpreterService.js';

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' }); if (!e.status) console.error('interpreter:', e.message); }
};
const speakLimit = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'Slow down a little.' } });

export const interpreterRouter = express.Router();
interpreterRouter.use(authenticate);
interpreterRouter.post('/', wrap(req => interp.create(req.userId, req.body?.lang, req.body?.guestLang)));
interpreterRouter.get('/:room', wrap(req => interp.poll(req.params.room, 'owner', req.query.after, req.userId)));
interpreterRouter.post('/:room/say', speakLimit, wrap(req => interp.say(req.params.room, 'owner', req.body?.text, req.userId)));
interpreterRouter.put('/:room/lang', wrap(req => interp.setLang(req.params.room, 'owner', req.body?.lang, req.userId)));
interpreterRouter.delete('/:room', wrap(req => interp.close(req.params.room, req.userId)));

export const publicInterpreterRouter = express.Router({ mergeParams: true });
publicInterpreterRouter.post('/join', wrap(req => interp.join(req.params.room, req.body?.lang)));
publicInterpreterRouter.get('/', wrap(req => interp.poll(req.params.room, 'guest', req.query.after)));
publicInterpreterRouter.post('/say', speakLimit, wrap(req => interp.say(req.params.room, 'guest', req.body?.text)));
publicInterpreterRouter.put('/lang', wrap(req => interp.setLang(req.params.room, 'guest', req.body?.lang)));
