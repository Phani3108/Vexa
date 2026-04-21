/**
 * Webhook Routes
 * Twilio sends real-time events to these endpoints.
 *
 * These are NOT called by the mobile app, only by Twilio / external services.
 * The voice agent already handles most Twilio events via /voice/call-status,
 * so these serve as supplementary endpoints for VAPI-style integrations
 * or future third-party webhook consumers.
 */

import express from 'express';
import callHistoryService from '../services/callHistoryService.js';
import pushService from '../services/pushNotificationService.js';
import logger from '../config/logger.js';

const router = express.Router();

// ── Call started ────────────────────────────────────────────────────────────

router.post('/call-started', async (req, res) => {
  try {
    const { callId, userId, callerPhoneNumber, timestamp } = req.body;

    logger.info(`🎬 Webhook: call started ${callId} from ${callerPhoneNumber}`);

    // Send live-call push notification
    if (userId) {
      pushService.sendLiveCallNotification(userId, {
        callId,
        callerNumber: callerPhoneNumber,
      }).catch(err => logger.error('Push error on call-started:', err));
    }

    res.json({ success: true, message: 'Call started event received' });
  } catch (error) {
    logger.error('Webhook call-started error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Call ended ──────────────────────────────────────────────────────────────

router.post('/call-ended', async (req, res) => {
  try {
    const { callId, userId, duration, endReason, timestamp } = req.body;

    logger.info(`🏁 Webhook: call ended ${callId} (${duration}s) - ${endReason}`);

    // Send summary push notification
    if (userId) {
      pushService.sendCallSummaryNotification(userId, {
        callId,
        callerName: req.body.callerName,
        callerNumber: req.body.callerPhoneNumber,
        summary: `Call ended after ${duration}s — ${endReason}`,
      }).catch(err => logger.error('Push error on call-ended:', err));
    }

    res.json({ success: true, message: 'Call ended event received' });
  } catch (error) {
    logger.error('Webhook call-ended error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Transcript update ───────────────────────────────────────────────────────

router.post('/transcript-update', async (req, res) => {
  try {
    const { callId, speaker, text, userId } = req.body;

    logger.debug(`💬 Webhook transcript [${callId}] ${speaker}: ${text}`);

    // Check for urgency keywords
    const urgentKeywords = ['emergency', 'urgent', 'asap', 'immediately', 'hospital', 'accident', 'fire'];
    const isUrgent = urgentKeywords.some(keyword =>
      text?.toLowerCase().includes(keyword)
    );

    if (isUrgent && userId) {
      logger.warn(`🚨 Urgent keyword in call ${callId}: "${text}"`);
      pushService.sendUrgentCallNotification(userId, {
        callId,
        callerNumber: req.body.callerPhoneNumber,
        reason: `Urgent keyword detected: "${text.slice(0, 100)}"`,
      }).catch(err => logger.error('Urgent push error:', err));
    }

    res.json({ success: true, urgentDetected: isUrgent });
  } catch (error) {
    logger.error('Webhook transcript error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Status update ───────────────────────────────────────────────────────────

router.post('/status-update', async (req, res) => {
  try {
    const { callId, status, timestamp } = req.body;
    logger.info(`📊 Webhook status: ${callId} → ${status}`);
    res.json({ success: true, message: 'Status update received' });
  } catch (error) {
    logger.error('Webhook status error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Verify ──────────────────────────────────────────────────────────────────

router.get('/verify', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Webhook endpoint verified',
    timestamp: new Date().toISOString()
  });
});

export default router;
