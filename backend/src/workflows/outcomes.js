/**
 * Turns a finished workflow run into real-world outcomes.
 *
 *   create_lead   → lead fields on the call + inbox follow-up
 *   book_request  → Booking document (owner approves with one tap)
 *   send_sms      → text to the caller (Twilio), or recorded as skipped
 *   notify_owner  → push + live event (urgent ones fire during the call)
 *   tag_spam      → spam flag on call and caller
 *   pay_link      → UPI payment link texted to the caller (amount = the read-back total);
 *                   above the owner's auto-limit it waits for the owner to approve
 *
 * Every action gets a status so the app can show exactly what happened.
 */

import twilio from 'twilio';
import Booking from '../models/mongodb/Booking.js';
import pushService from '../services/pushNotificationService.js';
import { upiLink, isUpiId } from '../lib/upi.js';

function smsClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  return TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
}

export function renderTemplate(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '').toString()).replace(/\s{2,}/g, ' ').trim();
}

export async function sendSms({ to, from, body }) {
  const client = smsClient();
  if (!client || !from) return { status: 'skipped', detail: 'SMS not configured — add Twilio credentials to send texts' };
  if (!/^\+\d{10,15}$/.test(to || '')) return { status: 'skipped', detail: 'No valid mobile number for the caller' };
  try {
    const msg = await client.messages.create({ to, from, body: body.slice(0, 640) });
    return { status: 'sent', detail: msg.sid };
  } catch (err) {
    return { status: 'failed', detail: err.message };
  }
}

/** Lead fields derived from the slots the flow collected (authoritative over AI guesses). */
export function leadFromRun(run, callerNumber) {
  const s = run.slots || {};
  const need = s.need || s.service || s.issue || s.problem || s.reason || s.details || s.role || null;
  const when = s.timing || s.when || s.newTime || s.callbackTime || null;
  const kinds = run.actions.filter(a => a.type === 'create_lead' || a.type === 'book_request').map(a => a.params?.kind).filter(Boolean);
  const isLead = run.actions.some(a => a.type === 'create_lead' || a.type === 'book_request');
  return {
    isLead,
    name: s.name && s.name !== '—' ? s.name : null,
    callbackNumber: (s.callback && /^\+\d{10,15}$/.test(s.callback) ? s.callback : null) || callerNumber || null,
    need,
    preferredTime: when,
    value: kinds.includes('emergency') ? 'high' : kinds.includes('quote') ? 'medium' : null
  };
}

/**
 * Apply deferred actions after the call is saved.
 * @returns {Promise<Array>} action results, stored back on the call
 */
export async function applyOutcomes({ run, call, user, io }) {
  const results = [];
  const vars = {
    ...Object.fromEntries(Object.entries(run.slots || {}).filter(([, v]) => v != null && v !== '—')),
    biz: user.businessProfile?.businessName || user.name || 'us',
    owner: user.name || '',
    bookingUrl: user.businessProfile?.bookingUrl || ''
  };
  const callerNumber = call.phoneNumber;
  const from = user.twilioNumber || process.env.TWILIO_PHONE_NUMBER;
  // Who can be texted: the number the caller gave, else the caller ID (web / agent visitors have none)
  const isPhone = n => /^\+\d{10,15}$/.test(String(n || ''));
  const textTo = isPhone(run.slots?.callback) ? run.slots.callback : isPhone(callerNumber) ? callerNumber : null;

  for (const action of run.actions || []) {
    let result = { status: 'done' };
    try {
      switch (action.type) {
        case 'create_lead':
          result = { status: 'done', detail: 'Added to your inbox' };
          break;
        case 'book_request': {
          const s = run.slots || {};
          const kind = ['reschedule', 'cancel'].includes(action.params?.kind) ? action.params.kind : 'new';
          const booking = await Booking.create({
            userId: user.userId,
            callId: call.callId,
            kind,
            customerName: s.name || null,
            phoneNumber: textTo || callerNumber,
            service: action.params?.service || s.service || s.need || (kind !== 'new' ? `${kind === 'cancel' ? 'Cancel' : 'Move'} appointment (${s.current || 'unknown'})` : null),
            requestedTime: s.when || s.newTime || s.current || null,
            requestedAt: action.slotsIso || null
          });
          result = { status: 'done', detail: 'Booking request created', bookingId: String(booking._id) };
          io?.to(`user:${user.userId}`).emit('booking:requested', { bookingId: String(booking._id), customerName: booking.customerName, requestedTime: booking.requestedTime });
          break;
        }
        case 'send_sms': {
          if (call.isTest) {
            result = { status: 'simulated', detail: renderTemplate(action.params?.template, vars) };
          } else if (!textTo) {
            result = { status: 'skipped', detail: 'No phone number to text' };
          } else {
            result = await sendSms({ to: textTo, from, body: renderTemplate(action.params?.template, vars) });
            result.body = renderTemplate(action.params?.template, vars);
          }
          break;
        }
        case 'notify_owner':
          if (action.params?.urgent) {
            result = { status: 'done', detail: 'Urgent alert sent during the call' };
          } else if (!action.params?.quiet && !call.isTest && user.shield?.mode !== 'silent') {
            await pushService.sendCallSummaryNotification(user.userId, {
              callId: call.callId,
              callerName: vars.name || 'Caller',
              callerNumber,
              summary: [vars.need || vars.reason || vars.issue, vars.timing || vars.when].filter(Boolean).join(' · ') || 'New message'
            }).catch(() => {});
            result = { status: 'done', detail: 'Notification sent' };
          } else {
            result = { status: 'skipped', detail: call.isTest ? 'Test call' : 'Quiet / silent mode' };
          }
          break;
        case 'tag_spam':
          result = { status: 'done', detail: 'Marked as spam' };
          break;
        case 'pay_link': {
          const p = user.businessProfile || {};
          const amount = Math.round(Number(action.params?.amount) * 100) / 100;
          const limit = Number(p.payLinkAutoLimit ?? 5000);
          if (!isUpiId(p.upiId)) { result = { status: 'skipped', detail: 'Add your UPI ID in Business info to send payment links' }; break; }
          if (!(amount > 0)) { result = { status: 'skipped', detail: 'No amount to collect' }; break; }
          const link = upiLink({ pa: p.upiId, pn: p.upiName || vars.biz, am: amount, tn: renderTemplate(action.params?.note || 'Payment to {{biz}}', vars) });
          const body = `${vars.biz}: pay ₹${amount.toLocaleString('en-IN')} with any UPI app: ${link}`;
          if (amount > limit) {
            result = { status: 'needs_approval', detail: `₹${amount.toLocaleString('en-IN')} is above your ₹${limit.toLocaleString('en-IN')} auto-send limit — approve it in the app`, link, amount, body };
          } else if (call.isTest) {
            result = { status: 'simulated', detail: body, link, amount };
          } else if (!textTo) {
            result = { status: 'done', detail: call.channel === 'link' ? 'Shown on the Vexa Link page' : 'No phone number to text', link, amount };
          } else {
            result = { ...(await sendSms({ to: textTo, from, body })), body, link, amount };
          }
          break;
        }
        default:
          result = { status: 'skipped', detail: `Unknown action ${action.type}` };
      }
    } catch (err) {
      result = { status: 'failed', detail: err.message };
    }
    results.push({ ...action, result });
  }
  return results;
}
