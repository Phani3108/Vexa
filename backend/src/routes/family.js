/**
 * Family guardian routes — /api/family/*
 *
 *   GET    /                          my guardians, my dependants, my pending invite
 *   POST   /invite                    { share } dependant creates a 6-digit code (24 h)
 *   POST   /accept                    { code } guardian links      (10 tries per 15 min)
 *   PATCH  /:linkId                   { share } dependant changes what is shared
 *   DELETE /:linkId                   either side ends the link
 *   GET    /dependants/:userId/calls  guardian's view (what was shared only)
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import family from '../services/familyService.js';

const router = express.Router();
router.use(authenticate);
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' }); if (!e.status) console.error('family:', e.message); }
};

router.get('/', wrap(req => family.overview(req.userId)));
router.post('/invite', wrap(req => family.invite(req.userId, req.body?.share)));
router.post('/accept', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many tries. Wait a few minutes.' } }), wrap(req => family.accept(req.userId, req.body?.code)));
router.patch('/:linkId', wrap(req => family.updateShare(req.userId, req.params.linkId, req.body?.share)));
router.delete('/:linkId', wrap(req => family.remove(req.userId, req.params.linkId)));
router.get('/dependants/:userId/calls', wrap(req => family.calls(req.userId, req.params.userId)));

export default router;
