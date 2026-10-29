/**
 * Callable agent API.
 *
 * Public, for other AI agents — /api/agent/v1/:slug
 *   GET    /        manifest: business name, policy and MCP-style tool descriptions
 *   POST   /call    { tool, arguments, agent: { name } }   (60 per minute per IP)
 *
 * Owner — /api/agent-settings
 *   GET / PUT { enabled?, dailyLimit? }
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import agent from '../services/agentService.js';

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' }); if (!e.status) console.error('agent:', e.message); }
};

export const agentPublicRouter = express.Router({ mergeParams: true });
agentPublicRouter.get('/', wrap(req => agent.manifest(req.params.slug)));
agentPublicRouter.post('/call', rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Rate limit: 60 requests per minute' } }), wrap(req => agent.call(req.params.slug, req.body || {})));

export const agentSettingsRouter = express.Router();
agentSettingsRouter.use(authenticate);
agentSettingsRouter.get('/', wrap(req => agent.getSettings(req.userId)));
agentSettingsRouter.put('/', wrap(req => agent.updateSettings(req.userId, req.body || {})));
