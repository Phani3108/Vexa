/**
 * Daily AI budget per account (launch phase L5a).
 *
 *   budgetFor(user)     the account's daily limit in USD (owner-set, capped by the server)
 *   allowed(user)       still under today's budget? (cached for 30 s)
 *   record(userId, …)   add a call's / request's cost to today's total; alerts at 80% and 100%
 *   metered(user, purpose, fn)  run fn under its own ledger: blocked when over budget, cost recorded
 *
 * Over budget, Vexa does not stop: every model call falls back to the offline
 * rules (flows, Indian-language rules, keyword analysis) until midnight UTC.
 * AI_KILL_SWITCH=true does the same for every account at once.
 */

import UsageDay from '../models/mongodb/UsageDay.js';
import { isMongoConnected } from '../config/mongodb.js';
import { newLedger, withLedger, summarize } from '../lib/usage.js';
import { notifyUser } from './pushNotificationService.js';

export const DEFAULT_DAILY_USD = Number(process.env.DAILY_AI_BUDGET_USD) || 5;
export const MAX_DAILY_USD = Number(process.env.MAX_DAILY_AI_BUDGET_USD) || 50;

const today = (d = new Date()) => d.toISOString().slice(0, 10);
const cache = new Map();   // userId → { at, cost }

export function budgetFor(user) {
  const own = Number(user?.limits?.dailyAiUsd);
  return Math.min(Number.isFinite(own) && own > 0 ? own : DEFAULT_DAILY_USD, MAX_DAILY_USD);
}

export async function spentToday(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 30000) return hit.cost;
  if (!isMongoConnected()) return 0;
  const row = await UsageDay.findOne({ userId, day: today() }).select('costUsd').lean();
  const cost = row?.costUsd || 0;
  cache.set(userId, { at: Date.now(), cost });
  return cost;
}

export async function allowed(user) {
  if (!user?.userId) return true;
  return (await spentToday(user.userId)) < budgetFor(user);
}

export async function record(userId, { costUsd = 0, requests = 0, conversation = false, purpose = null, user = null } = {}) {
  if (!userId || !isMongoConnected() || (!costUsd && !conversation)) return;
  const day = today();
  const inc = { costUsd: costUsd || 0, requests: requests || 0, conversations: conversation ? 1 : 0 };
  if (purpose && costUsd) inc[`byPurpose.${purpose}`] = costUsd;
  const row = await UsageDay.findOneAndUpdate({ userId, day }, { $inc: inc }, { upsert: true, new: true }).lean();
  cache.set(userId, { at: Date.now(), cost: row.costUsd });
  const budget = budgetFor(user || {});
  for (const [flag, share, text] of [['alerted100', 1, 'reached'], ['alerted80', 0.8, 'is at 80% of']]) {
    if (row.costUsd >= budget * share && !row[flag]) {
      const claimed = await UsageDay.updateOne({ userId, day, [flag]: false }, { $set: { [flag]: true, ...(flag === 'alerted100' ? { alerted80: true } : {}) } });
      if (claimed.modifiedCount) {
        notifyUser(userId, {
          title: flag === 'alerted100' ? 'Daily AI budget reached' : 'AI budget at 80%',
          body: flag === 'alerted100'
            ? `Today's AI spend reached $${budget.toFixed(2)}. Vexa keeps answering on its offline rules until midnight UTC. Raise the limit in Me → AI usage.`
            : `Today's AI spend ${text} your $${budget.toFixed(2)} limit.`,
          type: 'budget'
        }).catch(() => {});
      }
      break;
    }
  }
}

/** Run fn with its own ledger; over budget, model calls inside fall back offline. Cost is recorded. */
export async function metered(user, purpose, fn) {
  const ledger = newLedger();
  if (!(await allowed(user))) ledger.blocked = true;
  try {
    return await withLedger(ledger, purpose, fn);
  } finally {
    const s = summarize(ledger);
    if (s.costUsd) record(user.userId, { costUsd: s.costUsd, requests: s.requests, purpose, user }).catch(() => {});
  }
}

export async function usage(user, days = 7) {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = isMongoConnected() ? await UsageDay.find({ userId: user.userId, day: { $gte: since } }).sort({ day: -1 }).lean() : [];
  const t = rows.find(r => r.day === today());
  return {
    today: { day: today(), costUsd: round(t?.costUsd || 0), requests: t?.requests || 0, conversations: t?.conversations || 0, byPurpose: Object.fromEntries(Object.entries(t?.byPurpose || {}).map(([k, v]) => [k, round(v)])) },
    budgetUsd: budgetFor(user),
    maxBudgetUsd: MAX_DAILY_USD,
    overBudget: (t?.costUsd || 0) >= budgetFor(user),
    killSwitch: process.env.AI_KILL_SWITCH === 'true',
    days: rows.map(r => ({ day: r.day, costUsd: round(r.costUsd), requests: r.requests, conversations: r.conversations }))
  };
}

const round = n => Math.round(n * 10000) / 10000;

export default { budgetFor, spentToday, allowed, record, metered, usage, DEFAULT_DAILY_USD, MAX_DAILY_USD };
