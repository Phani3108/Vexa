/**
 * Web Push (VAPID): notifications to the installed app or any browser, with no
 * Firebase or Apple account. Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY;
 * in development a key pair is generated once and kept in backend/.data/vapid.json
 * (git-ignored). Production without keys: Web Push is off.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import logger from '../config/logger.js';

let keys = null;

function loadKeys() {
  if (keys !== null) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data/vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
      logger.info('🔑 Generated development Web Push keys in backend/.data/vapid.json');
    }
  } else {
    keys = false;
    if (process.env.NODE_ENV === 'production') logger.warn('⚠️ Web Push disabled — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)');
  }
  if (keys) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@vexa.app', keys.publicKey, keys.privateKey);
  return keys;
}

export const webPushEnabled = () => !!loadKeys();
export const vapidPublicKey = () => (loadKeys() ? keys.publicKey : null);

export function isSubscription(sub) {
  return !!sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000
    && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
}

/**
 * @returns {Promise<{ sent: number, stale: string[] }>} stale = endpoints the push service says are gone
 */
export async function sendWebPush(subscriptions, payload) {
  if (!webPushEnabled() || !subscriptions?.length) return { sent: 0, stale: [] };
  const body = JSON.stringify(payload);
  let sent = 0;
  const stale = [];
  await Promise.all(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 3600, urgency: payload.urgent ? 'high' : 'normal' });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) stale.push(sub.endpoint);
      else logger.warn(`Web Push failed: ${err.statusCode || err.message}`);
    }
  }));
  return { sent, stale };
}
