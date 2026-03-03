/**
 * Webhook Routes
 * VAPI sends real-time events to these endpoints
 * 
 * Note: These are NOT called by iOS app, only by VAPI platform
 */

import express from 'express';

const router = express.Router();

/**
 * POST /webhooks/vapi/call-started
 * VAPI webhook: Call has been initiated
 * 
 * Request body (from VAPI):
 * {
 *   "event": "call.started",
 *   "callId": "call-123",
 *   "userId": "user-123",
 *   "callerPhoneNumber": "+14155551234",
 *   "timestamp": "2026-02-11T10:30:00Z"
 * }
 */
router.post('/call-started', async (req, res) => {
  try {
    const { event, callId, userId, callerPhoneNumber, timestamp } = req.body;

    console.log(`🎬 Call started: ${callId} from ${callerPhoneNumber}`);

    // TODO (Week 3):
    // - Create call record in database with status 'in-progress'
    // - Send real-time notification to iOS app (optional)
    // - Start logging transcript chunks

    res.json({
      success: true,
      message: 'Call started event received'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/vapi/call-ended
 * VAPI webhook: Call has ended
 * 
 * Request body (from VAPI):
 * {
 *   "event": "call.ended",
 *   "callId": "call-123",
 *   "userId": "user-123",
 *   "duration": 45,
 *   "endReason": "completed" | "failed" | "no-answer",
 *   "timestamp": "2026-02-11T10:31:00Z"
 * }
 */
router.post('/call-ended', async (req, res) => {
  try {
    const { event, callId, userId, duration, endReason, timestamp } = req.body;

    console.log(`🏁 Call ended: ${callId} (${duration}s) - ${endReason}`);

    // TODO (Week 3):
    // - Update call record status to 'completed'
    // - Trigger final summary generation
    // - Send push notification to iOS with summary
    // - Update analytics

    res.json({
      success: true,
      message: 'Call ended event received'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/vapi/transcript-update
 * VAPI webhook: Real-time transcript chunk
 * 
 * Request body (from VAPI):
 * {
 *   "event": "transcript.updated",
 *   "callId": "call-123",
 *   "speaker": "ai" | "caller",
 *   "text": "Hello, this is John's assistant",
 *   "timestamp": "2026-02-11T10:30:15Z"
 * }
 */
router.post('/transcript-update', async (req, res) => {
  try {
    const { event, callId, speaker, text, timestamp } = req.body;

    console.log(`💬 Transcript [${callId}] ${speaker}: ${text}`);

    // TODO (Week 3):
    // - Append transcript chunk to database
    // - Analyze for urgency keywords in real-time
    // - If urgent detected, trigger escalation

    // Check for urgency keywords (simple example)
    const urgentKeywords = ['emergency', 'urgent', 'asap', 'immediately', 'hospital'];
    const isUrgent = urgentKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    if (isUrgent) {
      console.log(`🚨 Urgent keyword detected in call ${callId}: "${text}"`);
      // TODO: Trigger escalation endpoint
    }

    res.json({
      success: true,
      urgentDetected: isUrgent
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /webhooks/vapi/status-update
 * VAPI webhook: Call status changed
 * 
 * Request body (from VAPI):
 * {
 *   "event": "status.updated",
 *   "callId": "call-123",
 *   "status": "ringing" | "answered" | "in-progress" | "completed",
 *   "timestamp": "2026-02-11T10:30:00Z"
 * }
 */
router.post('/status-update', async (req, res) => {
  try {
    const { event, callId, status, timestamp } = req.body;

    console.log(`📊 Call status update: ${callId} -> ${status}`);

    // TODO (Week 3):
    // - Update call status in database
    // - Send real-time update to iOS app (WebSocket/push)

    res.json({
      success: true,
      message: 'Status update received'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /webhooks/vapi/verify
 * VAPI uses this to verify webhook endpoint is working
 */
router.get('/verify', (req, res) => {
  res.json({
    status: 'OK',
    message: 'VAPI webhook endpoint verified',
    timestamp: new Date().toISOString()
  });
});

export default router;
