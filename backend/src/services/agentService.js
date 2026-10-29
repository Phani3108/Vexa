/**
 * Callable agent API: another AI (a customer's assistant, a booking app, a
 * marketplace agent) talks to this receptionist in structured requests instead
 * of a voice call.
 *
 *   GET  /api/agent/v1/:slug        manifest + MCP-style tool descriptions
 *   POST /api/agent/v1/:slug/call   { tool, arguments, agent: { name } }
 *
 * Tools only expose what the receptionist would say on a public phone line.
 * Bookings and orders are REQUESTS: they land in the owner's inbox and booking
 * queue for approval, like a call would. No customer records are ever read out
 * (agents have no verified number). Writes are capped per account per day.
 */

import Booking from '../models/mongodb/Booking.js';
import Call from '../models/mongodb/Call.js';
import UserConfig from '../models/mongodb/UserConfig.js';
import userConfigService from './userConfigService.js';
import callHistoryService from './callHistoryService.js';
import { notifyUser } from './pushNotificationService.js';
import { WorkflowSession } from '../workflows/engine.js';
import { structuredJson, llmAvailable } from '../lib/llm.js';
import { strictObject } from '../lib/claude.js';
import { upiLink, isUpiId } from '../lib/upi.js';
import { isValidE164 } from '../lib/phone.js';
import { validSlug } from './linkService.js';

const err = (status, message) => Object.assign(new Error(message), { status });
const str = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));

export const TOOLS = [
  {
    name: 'get_business_info',
    description: 'Name, description, address, directions, opening hours (and whether it is open now), services, FAQs and accepted languages.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'search_catalog',
    description: 'Look up items, services or tests with their price (or price range), unit and whether they are in stock. Empty query lists the catalog.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to look for, e.g. "LED bulb" or "thyroid test"' } }, additionalProperties: false }
  },
  {
    name: 'ask',
    description: 'Ask a free-form question; answered only from the business\'s own published information, or "unknown".',
    inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'], additionalProperties: false }
  },
  {
    name: 'request_booking',
    description: 'Request an appointment. It is NOT confirmed until the business approves it; the customer is then texted.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        preferred_time: { type: 'string', description: 'As the customer said it, e.g. "Saturday 5pm"' },
        customer_name: { type: 'string' },
        customer_phone: { type: 'string', description: 'E.164, e.g. +919876543210' },
        notes: { type: 'string' }
      },
      required: ['service', 'preferred_time', 'customer_name', 'customer_phone'],
      additionalProperties: false
    }
  },
  {
    name: 'place_order',
    description: 'Place an order for catalog items (pickup or delivery). Returns the exact total and, when the business takes UPI, a payment link. The business confirms by phone or text.',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'integer', minimum: 1 } }, required: ['name', 'qty'] } },
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        mode: { type: 'string', enum: ['pickup', 'delivery'] },
        address: { type: 'string', description: 'Required for delivery' },
        notes: { type: 'string' }
      },
      required: ['items', 'customer_name', 'customer_phone', 'mode'],
      additionalProperties: false
    }
  }
];

async function ownerBySlug(slug) {
  if (!validSlug(slug)) throw err(404, 'Unknown business');
  const user = await UserConfig.findOne({ 'link.slug': slug, 'agentApi.enabled': true }).lean();
  if (!user) throw err(404, 'This business does not accept agent requests');
  return userConfigService.getUser(user.userId);
}

const money = (user, n) => `${user.businessProfile?.currency === 'USD' ? '$' : '₹'}${Number(n).toLocaleString(user.businessProfile?.currency === 'USD' ? 'en-US' : 'en-IN')}`;
const tokens = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(w => w.length > 1);

function findItems(user, query) {
  const catalog = user.businessProfile?.catalog || [];
  const q = tokens(query);
  if (!q.length) return catalog.slice(0, 30);
  return catalog
    .map(i => ({ i, s: Math.max(...[i.name, ...(i.aliases || [])].map(n => { const t = tokens(n); return t.filter(w => q.includes(w)).length / t.length; })) }))
    .filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 10).map(x => x.i);
}

function itemView(user, i) {
  return {
    name: i.name,
    price: i.price ?? null,
    priceMax: i.priceMax ?? null,
    priceText: i.price != null ? (i.priceMax ? `${money(user, i.price)}–${money(user, i.priceMax)}` : money(user, i.price)) + (i.unit ? ` per ${i.unit}` : '') : null,
    inStock: i.stock === 0 ? false : i.stock == null ? null : true,
    note: i.note || null,
    category: i.category || null
  };
}

async function writesToday(userId) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  return Call.countDocuments({ userId, channel: 'agent', createdAt: { $gte: since } });
}

/** Saved like a call, so it shows in the owner's inbox with the agent's name. */
async function saveAsCall(user, agentName, { summary, label, lead, lines }) {
  const callId = `agent_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return callHistoryService.saveCall({
    callId, userId: user.userId, from: null, channel: 'agent', direction: 'incoming', status: 'completed', duration: 0,
    startTime: new Date(), endTime: new Date(), isTest: false,
    transcripts: lines.map(text => ({ speaker: 'user', text, lang: 'en', textEn: text }))
  }, { categoryId: 'agent.request', categoryLabel: label, summary, sentiment: 'neutral', callerName: lead.name, organization: agentName, actionRequired: true, actionItems: [summary], lead: { isLead: true, ...lead } });
}

export async function manifest(slug) {
  const user = await ownerBySlug(slug);
  const p = user.businessProfile || {};
  return {
    schema: 'vexa.agent/v1',
    name: p.businessName || user.name,
    description: p.description || '',
    endpoint: `/api/agent/v1/${slug}/call`,
    policy: 'Bookings and orders are requests until the business confirms them. Do not send OTPs, card or bank details.',
    tools: TOOLS
  };
}

export async function call(slug, { tool, arguments: args = {}, agent = {} } = {}) {
  const user = await ownerBySlug(slug);
  const p = user.businessProfile || {};
  const agentName = str(agent?.name, 60) || 'An AI agent';
  args = args && typeof args === 'object' ? args : {};

  switch (tool) {
    case 'get_business_info': {
      const st = p.hours?.length ? userConfigService.businessHoursStatus(user) : null;
      return {
        name: p.businessName || user.name, description: p.description || '', address: p.address || null, directions: p.directions || null,
        openNow: st ? st.open : null, nextOpen: st && !st.open ? st.nextOpen || null : null,
        hours: (p.hours || []).map(h => ({ day: h.day, open: h.open, close: h.close, closed: !!h.closed })),
        services: p.services || [], faqs: (p.faqs || []).map(f => ({ question: f.question, answer: f.answer })),
        currency: p.currency || 'INR', languages: ['en', 'hi', 'te', 'ta', 'ml', 'mr', 'gu', 'es'],
        payments: isUpiId(p.upiId) ? ['upi', 'cash'] : ['cash']
      };
    }

    case 'search_catalog':
      return { items: findItems(user, str(args.query, 100)).map(i => itemView(user, i)) };

    case 'ask': {
      const question = str(args.question, 300);
      if (!question) throw err(400, 'question is required');
      const s = new WorkflowSession({ user, callerNumber: null, businessHours: userConfigService.businessHoursStatus(user) });
      const local = s.answerQuestion(question.endsWith('?') ? question : `${question}?`);
      if (local) return { answer: local, source: 'business info' };
      if (!llmAvailable()) return { answer: 'unknown', source: null };
      const r = await structuredJson({
        effort: 'low', purposeModel: 'fast', maxTokens: 600, timeoutMs: 12000,
        schema: strictObject({ answer: { type: 'string' }, known: { type: 'boolean' } }),
        system: 'Answer a question about a business using ONLY its published information below. If the information does not answer it, set known=false and answer "unknown". Never invent prices, times or policies.',
        user: JSON.stringify({ question, business: { name: p.businessName, description: p.description, address: p.address, services: p.services, faqs: p.faqs, catalog: (p.catalog || []).map(i => itemView(user, i)) } })
      }).catch(() => ({ answer: 'unknown', known: false }));
      return { answer: r.known ? r.answer : 'unknown', source: r.known ? 'business info' : null };
    }

    case 'request_booking': {
      const name = str(args.customer_name, 80), phone = str(args.customer_phone, 20), service = str(args.service, 120), when = str(args.preferred_time, 80);
      if (!name || !service || !when) throw err(400, 'service, preferred_time and customer_name are required');
      if (!isValidE164(phone)) throw err(400, 'customer_phone must be E.164, e.g. +919876543210');
      if (await writesToday(user.userId) >= (user.agentApi?.dailyLimit || 100)) throw err(429, 'Daily limit for agent requests reached. Please call instead.');
      const saved = await saveAsCall(user, agentName, {
        label: 'Booking request (AI agent)',
        summary: `${agentName} asked to book ${service} for ${name}, ${when}.`,
        lead: { name, callbackNumber: phone, need: service, preferredTime: when, value: null },
        lines: [`[${agentName}] request_booking: ${service} · ${when} · ${name} ${phone}${args.notes ? ` · ${str(args.notes, 200)}` : ''}`]
      });
      const booking = await Booking.create({ userId: user.userId, callId: saved?.callId, kind: 'new', customerName: name, phoneNumber: phone, service, requestedTime: when, note: `Via ${agentName}${args.notes ? `: ${str(args.notes, 200)}` : ''}` });
      notifyUser(user.userId, { title: `Booking request from ${agentName}`, body: `${name}: ${service}, ${when}`, type: 'agent_booking', callId: saved?.callId }).catch(() => {});
      return { status: 'requested', bookingId: String(booking._id), message: `${p.businessName || 'The business'} will confirm by text to ${phone}.` };
    }

    case 'place_order': {
      const name = str(args.customer_name, 80), phone = str(args.customer_phone, 20), mode = args.mode === 'delivery' ? 'delivery' : 'pickup', address = str(args.address, 200);
      if (!name) throw err(400, 'customer_name is required');
      if (!isValidE164(phone)) throw err(400, 'customer_phone must be E.164, e.g. +919876543210');
      if (mode === 'delivery' && !address) throw err(400, 'address is required for delivery');
      const wanted = Array.isArray(args.items) ? args.items.slice(0, 30) : [];
      if (!wanted.length) throw err(400, 'items is required');
      const lines = [], unknown = [], unavailable = [];
      for (const w of wanted) {
        const qty = Math.max(1, Math.min(999, Math.round(Number(w?.qty) || 1)));
        const item = findItems(user, str(w?.name, 80))[0];
        if (!item || item.price == null) unknown.push(str(w?.name, 80));
        else if (item.stock === 0) unavailable.push(item.name);
        else lines.push({ name: item.name, qty, unitPrice: item.price, lineTotal: item.price * qty });
      }
      if (unknown.length || unavailable.length) {
        return { status: 'needs_changes', unknown, unavailable, message: [unknown.length && `Not on the menu or catalog: ${unknown.join(', ')}.`, unavailable.length && `Out of stock: ${unavailable.join(', ')}.`].filter(Boolean).join(' ') };
      }
      if (await writesToday(user.userId) >= (user.agentApi?.dailyLimit || 100)) throw err(429, 'Daily limit for agent requests reached. Please call instead.');
      const total = lines.reduce((s, l) => s + l.lineTotal, 0);
      const summary = lines.map(l => `${l.qty} × ${l.name}`).join(', ');
      const saved = await saveAsCall(user, agentName, {
        label: 'Order (AI agent)',
        summary: `${agentName} placed an order for ${name}: ${summary} — ${money(user, total)}, ${mode}${mode === 'delivery' ? ` to ${address}` : ''}.`,
        lead: { name, callbackNumber: phone, need: `Order: ${summary} (${money(user, total)})`, preferredTime: mode, value: total >= 2000 ? 'high' : 'medium' },
        lines: [`[${agentName}] place_order: ${summary} · ${money(user, total)} · ${mode}${address ? ` · ${address}` : ''} · ${name} ${phone}${args.notes ? ` · ${str(args.notes, 200)}` : ''}`]
      });
      notifyUser(user.userId, { title: `Order from ${agentName}`, body: `${name}: ${summary} — ${money(user, total)}`, type: 'agent_order', callId: saved?.callId }).catch(() => {});
      const limit = Number(p.payLinkAutoLimit ?? 5000);
      const pay = isUpiId(p.upiId) && total <= limit ? upiLink({ pa: p.upiId, pn: p.upiName || p.businessName || 'Shop', am: total, tn: `Order from ${p.businessName || 'us'}`.slice(0, 80) }) : null;
      return { status: 'placed', orderId: saved?.callId || null, lines, total, totalText: money(user, total), currency: p.currency || 'INR', paymentLink: pay, message: `${p.businessName || 'The business'} will confirm by phone or text.` };
    }

    default:
      throw err(400, `Unknown tool. Available: ${TOOLS.map(t => t.name).join(', ')}`);
  }
}

// ── Owner settings ───────────────────────────────────────────────────────────

export async function getSettings(userId) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw err(404, 'User not found');
  return { enabled: !!user.agentApi?.enabled, slug: user.link?.slug || null, dailyLimit: user.agentApi?.dailyLimit || 100, usedToday: await writesToday(userId), tools: TOOLS.map(t => ({ name: t.name, description: t.description })) };
}

export async function updateSettings(userId, { enabled, dailyLimit }) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw err(404, 'User not found');
  const $set = {};
  if (enabled !== undefined) {
    $set['agentApi.enabled'] = !!enabled;
    if (enabled) $set['agentApi.enabledAt'] = new Date();
    // The agent endpoint shares the Vexa Link name; create one (without turning the link page on) if needed
    if (enabled && !user.link?.slug) {
      const { suggestSlug } = await import('./linkService.js');
      let s = suggestSlug(user.businessProfile?.businessName || user.name);
      if (await UserConfig.exists({ 'link.slug': s })) s = `${s.slice(0, 33)}-${Math.floor(Math.random() * 900 + 100)}`;
      $set['link.slug'] = s;
    }
  }
  if (dailyLimit !== undefined) {
    const n = Math.round(Number(dailyLimit));
    if (!(n >= 1 && n <= 2000)) throw err(400, 'Daily limit must be between 1 and 2000');
    $set['agentApi.dailyLimit'] = n;
  }
  if (Object.keys($set).length) await UserConfig.updateOne({ userId }, { $set });
  return getSettings(userId);
}

export default { manifest, call, getSettings, updateSettings, TOOLS };
