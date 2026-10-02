/**
 * Workflow Routes — /api/workflows/*
 *
 *   GET    /                list flows + per-flow performance (last 30 days)
 *   POST   /                create a custom flow (or duplicate one)
 *   PUT    /:id             replace a flow (validated)
 *   PATCH  /:id             { enabled } quick toggle
 *   DELETE /:id             delete a custom flow (built-ins are disabled instead)
 *   POST   /reset           restore the default flows for the account mode
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import userConfigService from '../services/userConfigService.js';
import Call from '../models/mongodb/Call.js';
import { defaultWorkflows } from '../workflows/templates.js';
import { validateWorkflow, sanitizeWorkflow } from '../workflows/validate.js';

const router = express.Router();
router.use(authenticate);

async function loadFlows(userId) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  return { user, flows: user.workflows?.length ? user.workflows : defaultWorkflows(user.accountType) };
}

async function saveFlows(userId, flows) {
  const user = await userConfigService.updateUser(userId, { workflows: flows });
  return user.workflows;
}

router.get('/', async (req, res) => {
  const { flows } = await loadFlows(req.userId);
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await Call.aggregate([
    { $match: { userId: req.userId, createdAt: { $gte: since }, 'workflowRun.workflowId': { $exists: true } } },
    {
      $group: {
        _id: '$workflowRun.workflowId',
        runs: { $sum: 1 },
        tests: { $sum: { $cond: ['$isTest', 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$workflowRun.status', 'completed'] }, 1, 0] } },
        transferred: { $sum: { $cond: [{ $eq: ['$workflowRun.status', 'transferred'] }, 1, 0] } },
        avgTurns: { $avg: '$workflowRun.turns' },
        avgQuestions: { $avg: '$workflowRun.questionsAsked' },
        skipped: { $sum: '$workflowRun.slotsSkipped' }
      }
    }
  ]);
  const stats = Object.fromEntries(rows.map(r => [r._id, {
    runs: r.runs, tests: r.tests, completed: r.completed, transferred: r.transferred,
    avgTurns: Math.round((r.avgTurns || 0) * 10) / 10,
    avgQuestions: Math.round((r.avgQuestions || 0) * 10) / 10,
    questionsSkipped: r.skipped
  }]));
  res.json({ workflows: flows, stats });
});

router.post('/', async (req, res) => {
  const { flows } = await loadFlows(req.userId);
  const base = req.body?.duplicateOf ? flows.find(f => f.id === req.body.duplicateOf) : null;
  const draft = base
    ? { ...structuredClone(base), id: `${base.id}_copy_${Date.now().toString(36)}`, name: `${base.name} (copy)`, builtIn: false }
    : {
        id: `custom_${Date.now().toString(36)}`,
        name: req.body?.name || 'New flow',
        description: req.body?.description || '',
        priority: 4,
        trigger: { keywords: req.body?.keywords || [] },
        slots: [
          { key: 'name', label: 'Name', type: 'name', prompt: 'Could I get your name?', prefill: 'caller_name' },
          { key: 'details', label: 'Details', type: 'text', prompt: 'What can I help you with?' }
        ],
        steps: [
          { id: 's1', type: 'collect', slot: 'details' },
          { id: 's2', type: 'collect', slot: 'name' },
          { id: 's3', type: 'action', action: 'create_lead', params: { kind: 'message' } },
          { id: 's4', type: 'end', text: 'Thanks {{name}}, I have passed that on. I\'m disconnecting the call now.' }
        ]
      };
  const errors = validateWorkflow(draft);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const saved = await saveFlows(req.userId, [...flows, sanitizeWorkflow({ ...draft, builtIn: false })]);
  res.status(201).json({ workflow: saved.find(f => f.id === draft.id), workflows: saved });
});

router.put('/:id', async (req, res) => {
  const { flows } = await loadFlows(req.userId);
  const idx = flows.findIndex(f => f.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Flow not found' });
  const next = { ...req.body, id: req.params.id, builtIn: flows[idx].builtIn };
  const errors = validateWorkflow(next);
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  flows[idx] = sanitizeWorkflow(next);
  const saved = await saveFlows(req.userId, flows);
  res.json({ workflow: saved[idx] });
});

router.patch('/:id', async (req, res) => {
  const { flows } = await loadFlows(req.userId);
  const flow = flows.find(f => f.id === req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  if (typeof req.body?.enabled === 'boolean') flow.enabled = req.body.enabled;
  if (flow.trigger?.isDefault && flow.enabled === false) return res.status(400).json({ error: 'The fallback flow can’t be turned off — every call needs somewhere to go.' });
  const saved = await saveFlows(req.userId, flows);
  res.json({ workflow: saved.find(f => f.id === req.params.id) });
});

router.delete('/:id', async (req, res) => {
  const { flows } = await loadFlows(req.userId);
  const flow = flows.find(f => f.id === req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  if (flow.builtIn) return res.status(400).json({ error: 'Built-in flows can be turned off but not deleted' });
  const saved = await saveFlows(req.userId, flows.filter(f => f.id !== req.params.id));
  res.json({ workflows: saved });
});

router.post('/reset', async (req, res) => {
  const { user } = await loadFlows(req.userId);
  const saved = await saveFlows(req.userId, defaultWorkflows(user.accountType));
  res.json({ workflows: saved });
});

export default router;
