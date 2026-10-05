/**
 * Spam risk score (0–100), computed before the AI answers.
 * Personal signals beat global reputation: what THIS owner's line has seen
 * from the number is weighted most.
 */

import { digits, findByPhone } from '../lib/phone.js';

const TOLL_FREE = /^1(800|833|844|855|866|877|888)/;

function countryCode(e164) {
  const d = digits(e164);
  if (d.length === 11 && d.startsWith('1')) return '1';
  if (d.length === 12 && d.startsWith('91')) return '91';
  if (d.length === 12 && d.startsWith('44')) return '44';
  return d.slice(0, Math.max(1, d.length - 10));
}

export function scoreRisk({ callerNumber, callerCtx, user }) {
  const reasons = [];
  let score = 10;
  const d = digits(callerNumber);

  if (findByPhone(user?.vipContacts, callerNumber) || findByPhone(user?.priorityTime?.emergencyContacts, callerNumber)) {
    return { score: 0, level: 'trusted', reasons: ['In your VIP / emergency contacts'] };
  }
  if (d.length < 7) {
    score += 45;
    reasons.push('No caller ID');
  }

  const spam = callerCtx?.spamCount || 0;
  if (spam > 0) {
    score += Math.min(70, spam * 35);
    reasons.push(`Flagged as spam ${spam}× before`);
  }

  const ownerCC = countryCode(user?.phoneNumber || '');
  if (d.length >= 10 && ownerCC === '1' && TOLL_FREE.test(d)) {
    score += 20;
    reasons.push('Toll-free number (common for telemarketing)');
  }
  if (d.length >= 10 && ownerCC && countryCode(callerNumber) !== ownerCC) {
    score += 20;
    reasons.push('International number');
  }

  const recent = (callerCtx?.recentCalls || []).filter(c => Date.now() - new Date(c.date).getTime() < 24 * 3600 * 1000);
  if (recent.length >= 3) {
    score += 20;
    reasons.push(`${recent.length} calls in the last 24h`);
  }
  if ((callerCtx?.shortCalls || 0) >= 2) {
    score += 15;
    reasons.push('Repeated very short calls');
  }

  // Neighbor spoofing: unknown number sharing the owner's area code + exchange
  const owner = digits(user?.phoneNumber || '');
  if (d.length >= 10 && owner.length >= 10 && !callerCtx?.totalCalls && d.slice(-10, -4) === owner.slice(-10, -4)) {
    score += 15;
    reasons.push('Looks like neighbor spoofing (same area code and prefix as you)');
  }

  const goodHistory = (callerCtx?.totalCalls || 0) > 0 && spam === 0;
  if (goodHistory) {
    score -= 25;
    reasons.push(`Known caller (${callerCtx.totalCalls} past call${callerCtx.totalCalls === 1 ? '' : 's'})`);
  }
  if (callerCtx?.callerName && callerCtx.callerName !== 'Unknown' && spam === 0) score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, level, reasons };
}

export default scoreRisk;
