/**
 * Call Routes — /api/calls/*
 *
 * All routes require authentication. userId from req.user scopes all queries.
 */

import express from 'express';
import callHistoryService from '../services/callHistoryService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All call routes require authentication
router.use(authenticate);

// Helper: resolve userId from auth
function userId(req) {
  return req.user?.userId || null;
}

// GET /api/calls  — paginated call history (scoped to authenticated user)
router.get('/', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const { limit = 50, offset = 0 } = req.query;
    const result = await callHistoryService.getAllCalls(uid, parseInt(limit), parseInt(offset));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// GET /api/calls/:id  — full call detail with transcript
router.get('/:id', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const call = await callHistoryService.getCallById(req.params.id, uid);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json({ call });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// GET /api/calls/caller/:phoneNumber  — full context for a phone number
// (used to preview what the AI will know before a call)
router.get('/caller/:phoneNumber', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    const context = await callHistoryService.getCallerContext(phoneNumber, uid);
    if (!context) return res.status(404).json({ error: 'No calls from this number' });
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch caller context' });
  }
});

// PATCH /api/calls/caller/:phoneNumber  — update caller profile
router.patch('/caller/:phoneNumber', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    const result = await callHistoryService.updateCallerProfile(phoneNumber, uid, req.body);
    res.json({ caller: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update caller profile' });
  }
});

export default router;
