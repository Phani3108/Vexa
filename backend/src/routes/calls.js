/**
 * Call Routes — /api/calls/*
 */

import express from 'express';
import callHistoryService from '../services/callHistoryService.js';

const router = express.Router();

// GET /api/calls  — paginated call history
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await callHistoryService.getAllCalls(parseInt(limit), parseInt(offset));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// GET /api/calls/:id  — full call detail with transcript
router.get('/:id', async (req, res) => {
  try {
    const call = await callHistoryService.getCallById(req.params.id);
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
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    const context = await callHistoryService.getCallerContext(phoneNumber);
    if (!context) return res.status(404).json({ error: 'No calls from this number' });
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch caller context' });
  }
});

// PATCH /api/calls/caller/:phoneNumber  — update caller profile
router.patch('/caller/:phoneNumber', async (req, res) => {
  try {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    const result = await callHistoryService.updateCallerProfile(phoneNumber, req.body);
    res.json({ caller: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update caller profile' });
  }
});

export default router;
