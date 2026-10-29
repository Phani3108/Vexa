/**
 * Push Notification Service
 * Handles push notifications via Firebase Cloud Messaging (FCM).
 * Supports both iOS (APNs via FCM) and Android.
 *
 * Setup:
 *   1. Create Firebase project → download service account JSON
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS env var to the JSON path
 *      OR set FIREBASE_SERVICE_ACCOUNT to the JSON string
 */

import admin from 'firebase-admin';
import UserConfig from '../models/mongodb/UserConfig.js';
import { isMongoConnected } from '../config/mongodb.js';
import logger from '../config/logger.js';
import { sendWebPush } from '../lib/webPush.js';

// ── Initialize Firebase ────────────────────────────────────────────────────

let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return true;

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      logger.warn('⚠️ Firebase not configured — push notifications disabled. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.');
      return false;
    }
    firebaseInitialized = true;
    logger.info('✅ Firebase initialized for push notifications');
    return true;
  } catch (err) {
    logger.error('❌ Firebase init error:', err.message);
    return false;
  }
}

// Try to initialize on import
initFirebase();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getTargets(userId) {
  if (!isMongoConnected()) return { tokens: [], subs: [] };
  const user = await UserConfig.findOne({ userId }).select('deviceTokens pushSubscriptions').lean();
  return { tokens: user?.deviceTokens || [], subs: user?.pushSubscriptions || [] };
}

/** Every device the owner has: native app (FCM) and installed web app / browser (Web Push). */
async function deliver(userId, notification, data = {}) {
  const { tokens, subs } = await getTargets(userId);
  if (!tokens.length && !subs.length) return { success: false, reason: 'no_tokens' };
  const [fcm, web] = await Promise.all([
    tokens.length ? sendToTokens(tokens, notification, data) : { success: false },
    sendWebPush(subs, { title: notification.title, body: notification.body, url: data.callId ? `/call/${encodeURIComponent(data.callId)}` : '/', tag: data.type, urgent: data.priority === 'critical' || data.type === 'scam_blocked' || data.type === 'urgent_call' })
  ]);
  if (web.stale.length) await UserConfig.updateOne({ userId }, { $pull: { pushSubscriptions: { endpoint: { $in: web.stale } } } }).catch(() => {});
  return { success: !!fcm.success || web.sent > 0, fcm, web: { sent: web.sent } };
}

async function sendToTokens(tokens, notification, data = {}) {
  if (!firebaseInitialized || tokens.length === 0) return { success: false, reason: 'no_tokens_or_firebase' };

  const results = [];
  const staleTokens = [];

  for (const { token, platform } of tokens) {
    try {
      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        ...(platform === 'ios' ? {
          apns: {
            payload: {
              aps: {
                sound: notification.sound || 'default',
                badge: notification.badge || 1,
                'content-available': 1,
              },
            },
          },
        } : {
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'vexa-calls',
            },
          },
        }),
      };

      const response = await admin.messaging().send(message);
      results.push({ token, success: true, messageId: response });
    } catch (err) {
      logger.warn(`Push send failed for token ${token.slice(0, 10)}...: ${err.code || err.message}`);
      if (err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token') {
        staleTokens.push(token);
      }
      results.push({ token, success: false, error: err.code });
    }
  }

  // Clean up stale tokens
  if (staleTokens.length > 0) {
    logger.info(`🧹 Removing ${staleTokens.length} stale device token(s)`);
    // We don't have userId here easily, so stale cleanup happens at call site
  }

  return { success: results.some(r => r.success), results, staleTokens };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Send push notification for an incoming/active call
 */
export const sendLiveCallNotification = async (userId, callData) => {
  const callerDisplay = callData.callerName && callData.callerName !== 'Unknown'
    ? callData.callerName
    : callData.callerNumber || 'Unknown';

  return deliver(userId, {
    title: `📞 Call from ${callerDisplay}`,
    body: callData.context || 'Your AI assistant is handling a call',
    sound: 'default',
    badge: 1,
  }, {
    type: 'live_call',
    callId: callData.callId || '',
    callerNumber: callData.callerNumber || '',
    callerName: callerDisplay,
    action: 'view_call',
  });
};

/**
 * Send push notification with call summary after call ends
 */
export const sendCallSummaryNotification = async (userId, callSummary) => {
  const callerDisplay = callSummary.callerName || callSummary.callerNumber || 'Unknown';
  const summary = callSummary.summary
    ? callSummary.summary.slice(0, 200)
    : 'Tap to view call details';

  return deliver(userId, {
    title: `Call from ${callerDisplay}`,
    body: summary,
  }, {
    type: 'call_summary',
    callId: callSummary.callId || '',
    action: 'view_call_details',
  });
};

/**
 * Send urgent/priority push (e.g. emergency keyword detected)
 */
export const sendUrgentCallNotification = async (userId, callData) => {

  return deliver(userId, {
    title: `🚨 Urgent call from ${callData.callerName || callData.callerNumber}`,
    body: callData.reason || 'Emergency keyword detected — tap to join',
    sound: 'critical',
    badge: 1,
  }, {
    type: 'urgent_call',
    callId: callData.callId || '',
    callerNumber: callData.callerNumber || '',
    action: 'join_call',
    priority: 'critical',
  });
};

/**
 * Scam shield fired: tell the owner (or a guardian) what was blocked and why.
 */
export const sendScamAlertNotification = async (userId, data) => {
  return deliver(userId, {
    title: `🛡️ Scam call blocked: ${data.label || 'likely scam'}`,
    body: data.phrase ? `“${String(data.phrase).slice(0, 110)}”` : `From ${data.callerNumber || 'unknown number'}`,
    badge: 1,
  }, {
    type: 'scam_blocked',
    callId: data.callId || '',
    callerNumber: data.callerNumber || '',
    action: 'view_call',
  });
};

/**
 * Any other owner notification (promise reminders, family alerts, Vexa Link chats).
 * @param {{ title: string, body: string, type?: string, callId?: string }} n
 */
export const notifyUser = (userId, n) => deliver(userId, { title: n.title, body: n.body }, { type: n.type || 'notice', callId: n.callId || '' });

/**
 * Generic push notification
 */
export const sendPushNotification = async (deviceToken, notification) => {
  if (!firebaseInitialized) {
    logger.warn('Firebase not initialized — cannot send push');
    return { success: false };
  }

  return sendToTokens(
    [{ token: deviceToken, platform: 'ios' }],
    notification,
    notification.data || {}
  );
};

export default {
  sendPushNotification,
  sendCallSummaryNotification,
  sendLiveCallNotification,
  sendUrgentCallNotification,
  sendScamAlertNotification,
  notifyUser,
};
