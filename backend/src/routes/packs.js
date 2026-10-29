/**
 * Business pack routes — /api/packs/*
 *
 *   GET    /                list the packs and which one this account installed
 *   GET    /:id             one pack: flows, guardrails and its sample business
 *   POST   /:id/install     { sampleData } install the pack's flows (and optionally its sample business)
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';
import { listPacks, getPack, packUpdate } from '../packs/index.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const user = await userConfigService.getUser(req.userId);
  res.json({ packs: listPacks(), installed: user?.packs || [] });
});

router.get('/:id', (req, res) => {
  const pack = getPack(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  res.json({
    id: pack.id, name: pack.name, industry: pack.industry, icon: pack.icon, description: pack.description,
    flows: pack.flows.map(f => ({ id: f.id, name: f.name, description: f.description })),
    guardrails: pack.guardrails?.refuse || [],
    sample: pack.sample
  });
});

router.post('/:id/install', async (req, res) => {
  const pack = getPack(req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  const user = await userConfigService.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const updated = await userConfigService.updateUser(req.userId, packUpdate(user, pack, { sampleData: !!req.body?.sampleData }));
  if (!updated) return res.status(500).json({ error: 'Could not install the pack' });
  res.json({ installed: updated.packs, workflows: updated.workflows, businessProfile: updated.businessProfile });
});

export default router;
