/**
 * Context API Routes — /api/context/*
 *
 * Endpoints for managing call context and user profile:
 * - Log outgoing calls (calls YOU made)
 * - Update user profile (your info, preferences)
 * - Get full context for a phone number
 *
 * All routes require authentication. userId is derived from req.user.
 */

import express from 'express';
import callHistoryService from '../services/callHistoryService.js';
import userConfigService from '../services/userConfigService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All context routes require authentication
router.use(authenticate);

// Helper: resolve userId from auth
function userId(req) {
  return req.user?.userId || null;
}

/**
 * POST /api/context/outgoing-call
 * 
 * Log an outgoing call you made (for context in future incoming calls)
 * 
 * Body:
 * {
 *   "phoneNumber": "+14155551234",
 *   "callerName": "John from Olive Garden",  // optional
 *   "summary": "Called to confirm reservation for Saturday 7pm",
 *   "outcome": "confirmed",  // optional: confirmed, voicemail, no_answer, etc.
 *   "notes": "They said to arrive 10 mins early",  // optional
 *   "timestamp": "2026-02-13T10:30:00Z"  // optional, defaults to now
 * }
 */
router.post('/outgoing-call', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const { phoneNumber, callerName, summary, outcome, notes, timestamp } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }
    
    if (!summary) {
      return res.status(400).json({ error: 'summary is required - briefly describe the call' });
    }
    
    // Build outgoing call record
    const callResult = {
      callId: `outgoing_${Date.now()}`,
      from: phoneNumber,
      to: process.env.TWILIO_PHONE_NUMBER || 'your-number',
      direction: 'outgoing',
      userId: uid,
      startTime: timestamp || new Date().toISOString(),
      duration: 0, // Unknown for manual logs
      status: 'completed',
      transcripts: [] // No transcript for manual logs
    };
    
    // Build analysis from provided info
    const analysis = {
      intent: outcome || 'outgoing_call',
      summary: summary,
      sentiment: 'neutral',
      callerName: callerName || null,
      notes: notes || null,
      manuallyLogged: true
    };
    
    // Save to call history
    const history = await callHistoryService.saveCall(callResult, analysis);
    
    // Update caller name if provided
    if (callerName && history) {
      await callHistoryService.updateCallerName(phoneNumber, uid, callerName);
    }
    
    res.json({
      success: true,
      message: 'Outgoing call logged successfully',
      callId: callResult.callId,
      phoneNumber,
      totalCallsWithNumber: history?.totalCalls || 1
    });
    
  } catch (error) {
    console.error('❌ Error logging outgoing call:', error);
    res.status(500).json({ error: 'Failed to log outgoing call' });
  }
});

/**
 * GET /api/context/caller/:phoneNumber
 * 
 * Get full context for a phone number (all incoming + outgoing calls)
 */
router.get('/caller/:phoneNumber', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const { phoneNumber } = req.params;
    
    // Decode URL-encoded phone number
    const decodedNumber = decodeURIComponent(phoneNumber);
    
    const history = await callHistoryService.getCallerHistory(decodedNumber, uid);
    
    if (!history) {
      return res.json({
        phoneNumber: decodedNumber,
        callerName: 'Unknown',
        totalCalls: 0,
        calls: [],
        message: 'No call history found for this number'
      });
    }
    
    res.json(history);
    
  } catch (error) {
    console.error('❌ Error getting caller context:', error);
    res.status(500).json({ error: 'Failed to get caller context' });
  }
});

/**
 * PUT /api/context/caller/:phoneNumber
 * 
 * Update caller information (name, notes, tags)
 * 
 * Body:
 * {
 *   "callerName": "John Smith",
 *   "organization": "Olive Garden",
 *   "relationship": "restaurant",  // friend, family, work, vendor, etc.
 *   "notes": "Usually calls about reservations",
 *   "tags": ["restaurant", "reservations"]
 * }
 */
router.put('/caller/:phoneNumber', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const { phoneNumber } = req.params;
    const { callerName, organization, relationship, notes, tags } = req.body;
    
    const decodedNumber = decodeURIComponent(phoneNumber);

    const updates = {};
    if (callerName) updates.callerName = callerName;
    if (organization) updates.organization = organization;
    if (relationship) updates.relationship = relationship;
    if (notes) updates.notes = notes;
    if (tags) updates.tags = tags;

    const result = await callHistoryService.updateCallerProfile(decodedNumber, uid, updates);
    
    res.json({
      success: true,
      message: 'Caller info updated',
      phoneNumber: decodedNumber,
      callerName: result?.callerName || callerName
    });
    
  } catch (error) {
    console.error('❌ Error updating caller info:', error);
    res.status(500).json({ error: 'Failed to update caller info' });
  }
});

/**
 * GET /api/context/user-profile
 * 
 * Get your user profile (what the AI knows about you)
 */
router.get('/user-profile', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const profile = await userConfigService.getUserConfig(uid);
    
    res.json(profile || {
      userId: uid,
      name: 'Not configured',
      message: 'Update your profile so the AI knows how to represent you'
    });
    
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

/**
 * PUT /api/context/user-profile
 * 
 * Update your user profile
 * 
 * Body:
 * {
 *   "name": "John Doe",
 *   "about": "Software engineer at TechCorp. Working on AI projects.",
 *   "greeting": "Hi there! This is John's assistant speaking.",
 *   "preferences": {
 *     "tone": "professional",  // professional, friendly, casual
 *     "verbosity": "concise",  // concise, detailed
 *     "escalateKeywords": ["urgent", "emergency", "ASAP"]
 *   },
 *   "availability": {
 *     "timezone": "America/New_York",
 *     "workHours": "9am-6pm",
 *     "currentStatus": "in_meeting"  // available, busy, in_meeting, do_not_disturb
 *   }
 * }
 */
router.put('/user-profile', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const profile = req.body;
    
    // Validate required fields
    if (!profile.name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    // Save
    await userConfigService.saveUserConfig(uid, profile);
    
    res.json({
      success: true,
      message: 'User profile updated',
      profile: {
        userId: uid,
        name: profile.name,
        greeting: profile.greeting
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * GET /api/context/summary
 * 
 * Get a summary of all context available
 */
router.get('/summary', async (req, res) => {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    
    const [userProfile, allCallsResult] = await Promise.all([
      userConfigService.getUserConfig(uid),
      callHistoryService.getAllCalls(uid)
    ]);
    
    const allCalls = allCallsResult.calls || [];
    
    // Count unique callers
    const uniqueCallers = new Set(allCalls.map(c => c.from)).size;
    
    // Recent calls
    const recentCalls = allCalls
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5)
      .map(c => ({
        phoneNumber: c.from,
        callerName: c.callerName || 'Unknown',
        summary: c.analysis?.summary || 'No summary',
        timestamp: c.timestamp,
        direction: c.direction || 'incoming'
      }));
    
    res.json({
      user: {
        name: userProfile?.name || 'Not configured',
        configured: !!userProfile?.name
      },
      calls: {
        total: allCalls.length,
        uniqueCallers,
        incoming: allCalls.filter(c => c.direction !== 'outgoing').length,
        outgoing: allCalls.filter(c => c.direction === 'outgoing').length
      },
      recentCalls,
      message: 'This is the context available to your AI assistant'
    });
    
  } catch (error) {
    console.error('❌ Error getting context summary:', error);
    res.status(500).json({ error: 'Failed to get context summary' });
  }
});

export default router;
