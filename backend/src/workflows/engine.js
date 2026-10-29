/**
 * Workflow Engine — deterministic multi-turn call handling.
 *
 *   caller utterance ─▶ global intents (emergency / human / goodbye)
 *                    ─▶ route to a flow (first turn, or switch on emergency)
 *                    ─▶ fill ANY pending slot the utterance answers (multi-slot)
 *                    ─▶ answer side questions from business info, then resume
 *                    ─▶ run steps until the next question or the end
 *
 * The language model (when configured) is only used for understanding
 * (nlu.js) and for the voice itself. What to ask next, when to confirm,
 * transfer or hang up is decided here — predictable, testable, cheap.
 */

import { extractSlot, isQuestion, wantsHuman, isGoodbye } from './extractors.js';
import { defaultWorkflows, LOCAL_TRIGGERS } from './templates.js';
import { detectScam, SCAM_LABELS } from './scam.js';
import { guardrailsFor } from '../packs/index.js';
import userConfigService from '../services/userConfigService.js';
import { phonesMatch } from '../lib/phone.js';

const MAX_REPROMPTS = 2;
const FAQ_STOP = new Set('a an the is are do does you your we our i to for of in on at and or can could what when where how my me it this that be have has with about any'.split(' '));

function words(text) {
  return (String(text).toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => !FAQ_STOP.has(w) && w.length > 2);
}

function phraseScore(text, phrases = []) {
  const padded = ` ${String(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}' ]+/gu, ' ')} `;
  return phrases.reduce((s, p) => {
    const k = String(p || '').toLowerCase().trim();
    return k && padded.includes(` ${k} `) ? s + k.length : s;
  }, 0);
}

/** Turns "Hi, how much is a water heater install?" into "water heater install". */
export function tidyStatement(text) {
  let t = String(text).trim();
  t = t.replace(/^(hi|hello|hey|good (morning|afternoon|evening)|yes|yeah|so|um+|uh+|okay|ok)[,.!\s]+/i, '');
  t = t.replace(/^((oh|oh no|oh god|wait|no wait|actually|sorry|listen|look)[,.!\s]+)+/i, '');
  t = t.replace(/^([Tt]his is|[Ii]'?m|[Mm]y name is|[Ii]t'?s)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?[,.\s]+/, '');
  t = t.replace(/^(hi|hello|hey|yes|so|okay|ok)[,.!\s]+/i, '');
  t = t.replace(/^(i'?m calling (about|because|to|regarding)|calling (about|regarding)|i was wondering if( you)?|i'?d like( to)?( get)?|i would like( to)?( get)?|i want( to)?( get)?|i need( to)?( get)?|i'?m looking for|looking for|can i get|could i get|can you|could you)\s+/i, '');
  t = t.replace(/^(how much (is|are|does|do|would|for)( it)?( cost)?( to)?( get)?|what('?s| is) the (price|cost) (of|for)|do you (do|offer|handle|have)|i need a quote (for|on)|a quote (for|on)|quote (for|on))\s+/i, '');
  t = t.replace(/^((can|could|may) (i|we) )?(please )?(book|schedule|make|get|set up)\s+(me\s+)?(in\s+)?(for\s+)?(an?\s+)?(appointment|booking|reservation)?\s*(for\s+)?/i, '');
  t = t.replace(/^(an?\s+)?(appointment|booking|reservation)\s+(for\s+)?/i, '');
  t = t.replace(/[?!.\s]+$/, '');
  return t.length >= 3 ? t : String(text).trim().replace(/[?!.\s]+$/, '');
}

export class WorkflowSession {
  /**
   * @param {object} opts
   *   user, callerCtx, callerNumber, vipContact, priorityTimeInfo, businessHours,
   *   risk ({score, level}), onAction (fn for immediate side effects), now
   */
  constructor(opts) {
    this.user = opts.user || {};
    this.callerCtx = opts.callerCtx || null;
    this.callerNumber = opts.callerNumber || null;
    this.vipContact = opts.vipContact || null;
    this.priorityTimeInfo = opts.priorityTimeInfo || { inPriorityTime: false };
    this.businessHours = opts.businessHours || null;
    this.risk = opts.risk || { score: 0, level: 'low' };
    this.onAction = opts.onAction || null;
    this.now = opts.now || (() => new Date());

    const flows = (this.user.workflows?.length ? this.user.workflows : defaultWorkflows(this.user.accountType)).filter(w => w.enabled !== false);
    this.flows = flows.slice().sort((a, b) => (a.priority || 5) - (b.priority || 5));

    this.active = null;
    this.pointer = 0;
    this.slots = {};
    this.asked = null;          // slot key, or `confirm:<stepId>`
    this.attempts = {};
    this.events = [];
    this.actions = [];
    this.turns = 0;
    this.questionsAsked = 0;
    this.slotsSkipped = 0;      // slots filled before we had to ask
    this.ended = false;
    this.transferred = false;
    this.startedAt = Date.now();
    this.goodbyeNudged = false;
    this.guardrails = guardrailsFor(this.user);   // pack refusal rules (e.g. no medical advice)
    this.scam = null;                              // { type, label, phrases } once the scam shield fires
  }

  // ── Context helpers ─────────────────────────────────────────────────────

  get isBusiness() { return this.user.accountType !== 'personal'; }
  /** Country code for spoken 10-digit numbers: the owner's own number decides (+91 India by default). */
  get country() {
    const own = String(this.user.phoneNumber || this.user.businessProfile?.phone || '');
    const known = ['+1', '+44', '+61', '+65', '+971', '+91'].find(c => own.startsWith(c));
    return known || process.env.DEFAULT_COUNTRY_CODE || '+91';
  }
  get ownerFirst() { return (this.user.name && this.user.name !== 'User' ? this.user.name : 'the owner').split(' ')[0]; }
  get biz() { return this.user.businessProfile?.businessName || this.user.name || 'us'; }
  get knownCallerName() {
    const n = this.vipContact?.name || this.callerCtx?.callerName;
    return n && n !== 'Unknown' ? n : null;
  }

  cond(name) {
    switch (name) {
      case 'business_open': return this.businessHours ? !!this.businessHours.open : true;
      case 'is_vip': return !!this.vipContact;
      case 'focus_mode': return !!this.priorityTimeInfo?.inPriorityTime;
      case 'has_booking_url': return !!this.user.businessProfile?.bookingUrl;
      case 'item_in_stock': return (this.computed?.stock || 0) > 0;
      case 'order_has_items': return this.orderLines().length > 0;
      case 'record_found': return !!this.computed?.recordFound;
      case 'has_matches': return (this.computed?.matchCount || 0) > 0;
      case 'has_upi': return !!this.user.businessProfile?.upiId;
      case 'transfer_allowed': {
        if (this.callerCtx?.alwaysTransfer) return true;
        if (this.active?.id === 'emergency' || this.active?.id === 'p_emergency') {
          // Businesses choose whether after-hours emergencies ring the on-call phone (default: yes)
          if (this.isBusiness && !this.cond('business_open') && this.user.businessProfile?.afterHoursEmergencyTransfer === false) return false;
          return true;
        }
        if (this.priorityTimeInfo?.inPriorityTime) return false;
        return this.isBusiness ? this.cond('business_open') : true;
      }
      default: return false;
    }
  }

  evalWhen(when) {
    if (!when) return true;
    if (when.all) return when.all.every(w => this.evalWhen(w));
    if (when.any) return when.any.some(w => this.evalWhen(w));
    if (when.cond) return this.cond(when.cond);
    if (when.slot) {
      const v = this.slots[when.slot]?.value;
      if ('is' in when) return v === when.is;
      if ('in' in when) return (when.in || []).includes(v);
      if ('filled' in when) return when.filled ? v != null : v == null;
    }
    return false;
  }

  vars() {
    const p = this.user.businessProfile || {};
    const v = {
      biz: this.biz,
      owner: this.user.name || 'the owner',
      ownerFirst: this.ownerFirst,
      nextOpen: this.businessHours?.nextOpen || 'soon',
      bookingUrl: p.bookingUrl || '',
      address: p.address || this.formatHomeAddress() || '',
      emailHint: p.email ? ` to ${p.email}` : '',
      deliveryNote: this.deliveryNote(),
      homeAddress: this.formatHomeAddress(),
      directions: this.directionsFallback(),
      securityLine: this.securityLine(),
      availableAt: this.availableAt(),
      counterRate: this.counterRate(),
      name: this.knownCallerName || 'there',
      ...this.orderVars(),
      ...(this.computed || {})
    };
    for (const [k, s] of Object.entries(this.slots)) if (s.display && s.value != null) v[k] = s.display;
    v.firstName = String(v.name || 'there').split(' ')[0];
    return v;
  }

  render(text) {
    const v = this.vars();
    const out = String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] ?? '').toString()).replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  deliveryNote() {
    const company = String(this.slots.company?.value || '').toLowerCase();
    const food = /doordash|uber ?eats|grubhub|swiggy|zomato|postmates|food|restaurant|pizza/.test(company);
    const grocery = /instacart|blinkit|zepto|bigbasket|instamart|gopuff|grocer/.test(company);
    const wanted = food ? 'delivery.food' : grocery ? 'delivery.grocery' : 'delivery.package';
    const cats = this.user.callCategories || [];
    const cat = cats.find(c => c.id === wanted) || cats.find(c => c.id === 'delivery.package');
    const addr = this.formatHomeAddress();
    const a = this.user.deliveryAddress || {};
    // Owner instructions are written for the assistant ("Ask them to…"); speak only the caller-facing first sentence
    const first = (cat?.instructions || '').split(/(?<=\.)\s+/)[0];
    const parts = [first ? first.replace(/^(ask|tell) them to /i, 'Please ').replace(/^please (\w)/i, (m, c) => `Please ${c.toLowerCase()}`) : 'Please leave it at the front door.'];
    if (addr) parts.push(`The address is ${addr}.`);
    if (a.societyNotes) parts.push(a.societyNotes);
    if (a.securityNotes) parts.push(a.securityNotes);
    return parts.join(' ');
  }

  /** Full home address incl. building and city, e.g. "Jasmine 77, Serene County, Telecom Nagar, Gachibowli, Hyderabad". */
  formatHomeAddress() {
    const a = this.user.deliveryAddress || {};
    return [a.flat, a.building, a.street, a.city, a.pincode].filter(Boolean).join(', ');
  }

  /** Template directions (used when the model is unavailable). Only owner-provided facts. */
  directionsFallback() {
    const a = this.user.deliveryAddress || {};
    const parts = [];
    if (a.landmark) parts.push(`Use ${a.landmark} as your landmark.`);
    if (a.societyNotes) parts.push(a.societyNotes);
    parts.push(`The address is ${this.formatHomeAddress() || 'on the order'}.`);
    return parts.join(' ');
  }

  securityLine() {
    const a = this.user.deliveryAddress || {};
    return a.securityNotes ? `Before you go in: ${a.securityNotes.charAt(0).toLowerCase()}${a.securityNotes.slice(1)}` : '';
  }

  /** "after 7:00 PM today" / "after 7:00 PM tomorrow" / "later today" */
  availableAt() {
    const until = this.user.shield?.until || this.priorityTimeInfo?.until;
    if (until) {
      const tz = this.user.businessProfile?.timezone || this.user.priorityTime?.timezone || 'UTC';
      const d = new Date(until);
      const fmt = (x, o) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(x);
      const day = fmt(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
      const today = fmt(this.now(), { year: 'numeric', month: '2-digit', day: '2-digit' });
      const time = fmt(d, { hour: 'numeric', minute: '2-digit' });
      return `after ${time} ${day === today ? 'today' : 'tomorrow'}`;
    }
    if (this.priorityTimeInfo?.endTime) return `after ${this.priorityTimeInfo.endTime}`;
    return 'later today';
  }

  /** Negotiation target: ~2 points (or 15%) below the offered rate, to the nearest 0.25. */
  counterRate() {
    const r = Number(this.slots.rate?.value);
    if (!r || isNaN(r)) return '';
    const target = Math.min(r - 2, r * 0.85);
    return String(Math.max(Math.round(target * 4) / 4, 1));
  }

  money(n) {
    const cur = this.user.businessProfile?.currency || 'USD';
    try {
      const digits = Number.isInteger(n) ? 0 : 2;
      return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    } catch {
      return `${n} ${cur}`;
    }
  }

  /** Catalog items named in the text, by name or alias. */
  mentionedItems(text) {
    const said = ` ${String(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]+/gu, ' ').replace(/(\p{L}{3,})(es|s)(?= )/gu, '$1')} `;
    const plain = (p) => ` ${String(p).toLowerCase().replace(/(\p{L}{3,})(es|s)$/u, '$1')} `;
    return (this.user.businessProfile?.catalog || []).filter(item => [item.name, ...(item.aliases || [])].some(p => p && said.includes(plain(p))));
  }

  /** Does the caller name something in the catalog ("bulb", "pankha")? */
  mentionsCatalogItem(text) {
    // Aliases ("bulb", "pankha") or the full item name; single generic words like "water" don't count
    const said = ` ${String(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]+/gu, ' ').replace(/(\p{L}{3,})(es|s)(?= )/gu, '$1')} `;
    const plain = (p) => ` ${String(p).toLowerCase().replace(/(\p{L}{3,})(es|s)$/u, '$1')} `;
    return (this.user.businessProfile?.catalog || []).some(item =>
      [item.name, ...(item.aliases || [])].some(p => p && said.includes(plain(p))));
  }

  /** Catalog lookup for the item + quantity collected so far. Sets computed vars for templates. */
  lookupCatalog(step = {}) {
    const catalog = this.user.businessProfile?.catalog || [];
    const of = step.of || 'item';
    const wanted = String(this.slots[of]?.value || '').toLowerCase();
    const qty = Math.max(1, Math.round(Number(this.slots.quantity?.value) || 1));
    const tokens = (wanted.match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !['the', 'a', 'an', 'of', 'for', 'some', 'any'].includes(w));
    // Score = how much of the catalog item's name the caller mentioned ("LED bulbs" → "9W LED bulb")
    let best = null;
    const norm = w => w.replace(/(es|s)$/, '');
    for (const item of catalog) {
      const nameTokens = (`${item.name} ${(item.aliases || []).join(' ')}`.toLowerCase().match(/[a-z0-9]+/g) || []);
      const wordTokens = nameTokens.filter(t => /[a-z]{2,}/.test(t));
      const said = new Set(tokens.map(norm));
      const hits = wordTokens.filter(t => said.has(norm(t)) || tokens.some(q => q.length > 3 && t.startsWith(q))).length;
      const numericHit = nameTokens.some(t => /\d/.test(t) && tokens.includes(t));
      const score = (hits + (numericHit ? 1 : 0)) / Math.max(wordTokens.length, 1);
      if (hits > 0 && (!best || score > best.score)) best = { item, score };
    }
    if (!best || best.score < 0.5) {
      // Names the caller used in a longer sentence ("AC se paani tapak raha hai, gas refill chahiye")
      const named = this.mentionedItems(wanted)[0];
      if (named) best = { item: named, score: 1 };
    }
    if (!best || best.score < 0.5) {
      this.computed = step.mode === 'info'
        ? { itemName: this.slots[of]?.display || 'that', found: false, availability: 'I don\'t have a price for that on my list — the team will confirm it when they call you.' }
        : { itemName: this.slots[of]?.display || 'that item', stock: 0, availability: `I couldn't find ${this.slots[of]?.display || 'that'} in our catalog. I have noted it and the team will call you back with details.` };
      this.log('lookup', { found: false });
      return;
    }
    const { item } = best;
    if (step.mode === 'info') {
      // Price (or usual range) + the business's own note, spoken as-is
      const price = Number(item.price) || 0;
      const priceLine = !price ? '' : item.priceMax && item.priceMax > price
        ? `${item.name} is usually ${this.money(price)} to ${this.money(Number(item.priceMax))}; the final price is confirmed after checking.`
        : `${item.name} is ${this.money(price)}${item.unit ? ` per ${item.unit}` : ''}.`;
      this.computed = { itemName: item.name, found: true, unitPrice: price ? this.money(price) : '', availability: [priceLine, item.note].filter(Boolean).join(' ') };
      this.log('lookup', { found: true, item: item.name, mode: 'info' });
      return;
    }
    const stock = Number(item.stock) || 0;
    const price = Number(item.price) || 0;
    const unit = item.unit ? ` per ${item.unit}` : ' each';
    const reservable = Math.min(qty, stock);
    const total = this.money(price * reservable);
    let availability;
    if (stock >= qty) availability = `Yes, the ${item.name} is in stock — we have ${stock}, at ${this.money(price)}${unit}. For ${qty}, that comes to ${total} in total.`;
    else if (stock > 0) availability = `We only have ${stock} ${item.name} in stock right now, at ${this.money(price)}${unit} — that is ${total} for all ${stock}. The team can arrange the remaining ${qty - stock}.`;
    else availability = `Sorry, ${item.name} is out of stock right now. It is usually ${this.money(price)}${unit}. I have noted your request and the team will call you as soon as it is back.`;
    this.computed = { itemName: item.name, stock, unitPrice: this.money(price), total, reservedQty: String(reservable), availability };
    this.log('lookup', { found: true, item: item.name, stock, qty, price });
  }

  /** Priced lines of the cart in any `order` slot: [{ name, qty, price, stock, unavailable }]. */
  orderLines() {
    const slot = (this.active?.slots || []).find(sl => sl.type === 'order');
    const lines = slot ? this.slots[slot.key]?.value : null;
    if (!Array.isArray(lines)) return [];
    const catalog = this.user.businessProfile?.catalog || [];
    return lines.map(l => {
      const item = catalog.find(c => c.name === l.name) || {};
      const stock = item.stock == null ? Infinity : Number(item.stock);
      return { name: l.name, qty: l.qty, price: Number(item.price) || 0, stock, unavailable: stock <= 0 };
    });
  }

  orderVars() {
    const lines = this.orderLines();
    if (!lines.length) return {};
    const ok = lines.filter(l => !l.unavailable).map(l => ({ ...l, qty: Math.min(l.qty, l.stock) }));
    const total = ok.reduce((sum, l) => sum + l.qty * l.price, 0);
    const short = lines.filter(l => !l.unavailable && l.qty > l.stock);
    const gone = lines.filter(l => l.unavailable);
    const notes = [
      ...short.map(l => `we only have ${l.stock} ${l.name}`),
      ...gone.map(l => `${l.name} is not available right now`)
    ];
    return {
      orderSummary: ok.map(l => `${l.qty} ${l.name}`).join(', '),
      orderTotal: this.money(total),
      orderTotalValue: String(total),
      orderCount: String(ok.reduce((n, l) => n + l.qty, 0)),
      orderNote: notes.length ? `Just so you know, ${notes.join(' and ')}.` : ''
    };
  }

  /** ₹78 lakh / ₹1.2 crore for big amounts, else normal currency. */
  moneyShort(n) {
    const cur = this.user.businessProfile?.currency || 'INR';
    if (cur === 'INR' && n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} crore`;
    if (cur === 'INR' && n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} lakh`;
    return this.money(n);
  }

  /**
   * Status of an order / report / job from the owner's records. Shared only with the phone
   * number on the record, or when the caller also gives the matching name.
   */
  lookupRecord(step) {
    const rows = this.user.businessProfile?.records || [];
    const wanted = String(this.slots[step.by]?.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let row = wanted ? rows.find(r => String(r.id || '').toLowerCase().replace(/[^a-z0-9]/g, '') === wanted) : null;
    if (!row && this.callerNumber) row = rows.find(r => r.phone && phonesMatch(r.phone, this.callerNumber));
    if (!row) {
      this.computed = { ...this.computed, recordFound: false, recordLine: `I couldn't find that ${step.label || 'reference'}. I have noted it and the team will call you back.` };
      this.log('lookup', { source: 'records', found: false });
      return;
    }
    const byPhone = row.phone && this.callerNumber && phonesMatch(row.phone, this.callerNumber);
    const byName = row.name && this.slots.name?.value && String(row.name).split(' ')[0].toLowerCase() === String(this.slots.name.value).split(' ')[0].toLowerCase();
    if (!byPhone && !byName) {
      this.computed = { ...this.computed, recordFound: false, recordLine: `I found that ${step.label || 'reference'}, but I can only share its status with the phone number on it. The team will call that number with an update.` };
      this.log('lookup', { source: 'records', found: true, verified: false });
      return;
    }
    const line = row.statusLine || `${step.label ? `${step.label.charAt(0).toUpperCase()}${step.label.slice(1)}` : 'Reference'} ${row.id} is ${row.status}${row.eta ? `, expected ${row.eta}` : ''}.`;
    this.computed = { ...this.computed, recordFound: true, recordLine: line, recordStatus: row.status || '', recordEta: row.eta || '' };
    this.log('lookup', { source: 'records', found: true, id: row.id });
  }

  /** Listings that fit what the caller wants (budget, bedrooms, area…), cheapest first, top 2. */
  lookupListings(step) {
    const rows = this.user.businessProfile?.listings || [];
    const m = step.match || {};
    const budget = Number(this.slots[m.budget]?.value) || null;
    const beds = Number(this.slots[m.bhk]?.value) || null;
    const area = String(this.slots[m.area]?.value || '').toLowerCase().replace(/^(anywhere|any|any area|no preference)$/, '');
    const areaWords = area.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
    const fits = rows.filter(r =>
      (!budget || Number(r.price) <= budget * 1.1) &&
      (!beds || Number(r.bhk) === beds) &&
      (!areaWords.length || areaWords.some(w => String(r.area || '').toLowerCase().includes(w)))
    ).sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 2);
    const describe = r => `${r.title} in ${r.area}, ${this.moneyShort(Number(r.price))}`;
    this.computed = {
      ...this.computed,
      matchCount: fits.length,
      matchesLine: fits.length === 0 ? 'I don\'t have a listing that fits that right now, but I have noted what you are looking for and the team will call you with new options.'
        : fits.length === 1 ? `I have one option: ${describe(fits[0])}.`
        : `I have two options: ${describe(fits[0])}; and ${describe(fits[1])}.`,
      matchIds: fits.map(r => r.id).join(', ')
    };
    this.log('lookup', { source: 'listings', found: fits.length, ids: fits.map(r => r.id) });
  }

  /** Action params may use {{vars}} (e.g. the order total for a payment link). */
  renderParams(params = {}) {
    const v = this.vars();
    return Object.fromEntries(Object.entries(params).map(([k, val]) => [k, typeof val === 'string' ? val.replace(/\{\{(\w+)\}\}/g, (_, x) => (v[x] ?? '').toString()) : val]));
  }

  /** A pack refusal rule this utterance hits (model label first, then the rule's keywords). */
  refusalFor(text, nlu) {
    const rules = this.guardrails?.refuse || [];
    if (!rules.length) return null;
    if (nlu?.restricted) return rules.find(r => r.id === nlu.restricted) || null;
    if (nlu?.used) return null;   // the model read this turn and saw nothing restricted
    return rules.find(r => phraseScore(text, r.keywords) > 0) || null;
  }

  /** Scam shield: model label first, then the multilingual script detector. */
  scamFor(text, nlu) {
    if (this.vipContact || this.callerCtx?.alwaysTransfer) return null;   // family and trusted callers are never screened as scams
    if (nlu?.scam && SCAM_LABELS[nlu.scam]) return { type: nlu.scam, label: SCAM_LABELS[nlu.scam] };
    return detectScam(text);
  }

  log(type, detail = {}) {
    this.events.push({ at: Date.now() - this.startedAt, type, workflow: this.active?.id || null, ...detail });
  }

  // ── Routing ─────────────────────────────────────────────────────────────

  categoryFor(text) {
    let best = null;
    for (const cat of this.user.callCategories || []) {
      const s = phraseScore(text, cat.keywords);
      if (s > 0 && (!best || s > best.s)) best = { id: cat.id, s };
    }
    return best?.id || null;
  }

  route(text, hintId = null) {
    if (hintId) {
      const hinted = this.flows.find(f => f.id === hintId);
      if (hinted) return hinted;
    }
    const category = this.categoryFor(text);
    const catalogHit = this.mentionsCatalogItem(text);
    let best = null;
    for (const f of this.flows) {
      if (f.trigger?.isDefault) continue;
      let s = phraseScore(text, [...(f.trigger?.keywords || []), ...(LOCAL_TRIGGERS[f.id] || [])]);
      if (category && f.trigger?.categories?.includes(category)) s += 12;
      // Naming something we sell ("LED bulb hai kya?") is a product question in any language
      if (catalogHit && (f.steps?.some(st => st.type === 'lookup' && st.source === 'catalog') || f.slots?.some(sl => sl.type === 'order'))) s += 8;
      if (s > 0 && f.pack) s += 6;   // an installed pack's flow beats the generic built-in it specialises
      if (s > 0 && (!best || s > best.s || (s === best.s && (f.priority || 5) < (best.f.priority || 5)))) best = { f, s };
    }
    return best?.f || this.flows.find(f => f.trigger?.isDefault) || this.flows[this.flows.length - 1];
  }

  activate(flow, reason) {
    const prev = this.active;
    this.active = flow;
    this.pointer = 0;
    this.asked = null;
    this.attempts = {};
    // Carry compatible facts across flows (name, callback number...)
    const carried = {};
    for (const slot of flow.slots || []) {
      if (this.slots[slot.key]) carried[slot.key] = this.slots[slot.key];
    }
    this.slots = carried;
    this.prefill();
    this.log('flow', { id: flow.id, name: flow.name, reason, from: prev?.id || null });
  }

  prefill() {
    for (const slot of this.active?.slots || []) {
      if (this.slots[slot.key]) continue;
      if (slot.prefill === 'caller_name' && this.knownCallerName) {
        this.slots[slot.key] = { value: this.knownCallerName, display: this.knownCallerName, source: 'memory' };
        this.slotsSkipped++;
      } else if (slot.prefill === 'caller_number' && this.callerNumber && /^\+?\d{10,15}$/.test(this.callerNumber)) {
        this.slots[slot.key] = { value: this.callerNumber, display: this.callerNumber, source: 'caller_id' };
        this.slotsSkipped++;
      }
    }
  }

  // ── Slot filling ────────────────────────────────────────────────────────

  fill(text, nluSlots = {}, opening = false, nluUsed = false, skipTypes = []) {
    const filled = [];
    // Typed slots first, so an opening statement's free text can drop the
    // parts already captured elsewhere ("…install tomorrow morning" → timing)
    const slots = (this.active?.slots || []).slice().sort((a, b) => (a.type === 'text') - (b.type === 'text'));
    for (const slot of slots) {
      if (skipTypes.includes(slot.type)) continue;
      // A cart keeps growing: "aur do lassi" adds, "make it 3 rotis" changes that line
      if (slot.type === 'order' && this.slots[slot.key]?.value) {
        const raw = nluSlots[slot.key] != null && nluSlots[slot.key] !== '' ? String(nluSlots[slot.key]) : text;
        const more = extractSlot(slot, raw, true, this.now(), this.extractCtx());
        if (more?.value?.length) {
          const merged = new Map(this.slots[slot.key].value.map(l => [l.name, l]));
          for (const l of more.value) merged.set(l.name, l);
          const value = [...merged.values()];
          this.slots[slot.key] = { value, display: value.map(l => `${l.qty} × ${l.name}`).join(', '), source: 'answer' };
          filled.push(slot.key);
        }
        continue;
      }
      // Remembered/caller-ID values can be overridden by what the caller actually says
      if (this.slots[slot.key] && !['caller_id', 'memory'].includes(this.slots[slot.key].source)) continue;
      // When the model read this turn, it decides what answers the pending question;
      // offline lenient parsing would turn "yep that's right" into a name.
      const asked = this.asked === slot.key && !nluUsed;
      let hit = null;

      if (nluSlots[slot.key] != null && nluSlots[slot.key] !== '') {
        const raw = String(nluSlots[slot.key]);
        hit = extractSlot(slot, raw, true, this.now(), this.extractCtx()) || { value: raw, display: raw };
      } else {
        hit = extractSlot(slot, text, asked, this.now(), this.extractCtx());
        // Opening statement answers the flow's first free-text question ("I need a quote for…")
        if (!hit && opening && slot === this.firstTextSlot() && words(text).length >= 2) {
          let tidy = tidyStatement(text);
          for (const k of filled) {
            const shown = String(this.slots[k]?.display || '');
            if (shown.length > 2) tidy = tidy.replace(new RegExp(`[,\\s]*\\b(on |at |for |by )?${shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
          }
          tidy = tidy.replace(/[,\s]+$/, '').trim();
          if (tidy.length >= 3) hit = { value: tidy, display: tidy };
        }
      }
      if (hit && !(hit.declined && slot.required !== false && !asked)) {
        if (hit.declined && slot.required === false) hit = { value: null, display: '—', declined: true };
        else if (hit.declined) continue;
        this.slots[slot.key] = { ...hit, source: nluSlots[slot.key] != null ? 'ai' : asked ? 'answer' : 'inferred' };
        if (!asked) this.slotsSkipped++;
        filled.push(slot.key);
      }
    }
    if (filled.length) this.log('slots', { filled, values: Object.fromEntries(filled.map(k => [k, this.slots[k].display])) });
    return filled;
  }

  extractCtx() {
    return { country: this.country, catalog: this.user.businessProfile?.catalog || [] };
  }

  /** First free-text question in step order — what an opening statement usually answers. */
  firstTextSlot() {
    // The first question of the flow, or any free-text question marked `opening: true`
    let first = true;
    for (const step of this.active?.steps || []) {
      if (step.type !== 'collect') continue;
      const slot = (this.active?.slots || []).find(s => s.key === step.slot);
      if (slot?.type === 'text' && slot.opening !== false && (first || slot.opening === true)) return slot;
      first = false;
    }
    return null;
  }

  slotDef(key) {
    return (this.active?.slots || []).find(s => s.key === key);
  }

  // ── Side questions ──────────────────────────────────────────────────────

  answerQuestion(text) {
    const p = this.user.businessProfile || {};
    const t = text.toLowerCase();
    const parts = [];

    if (/\b(hours|open|opening|close|closing|closed)\b/.test(t) && p.hours?.length) {
      const st = userConfigService.businessHoursStatus(this.user, this.now());
      parts.push(st.open
        ? `We're open right now${st.todayHours ? ` until ${userConfigService.format12Hour(st.todayHours.close)}` : ''}.`
        : `We're closed at the moment${st.nextOpen ? ` — we open again ${st.nextOpen}` : ''}.`);
    }
    if (/\b(address|where are you|where is (it|this|your|the (shop|store|clinic|office|place|restaurant|salon|centre|center|academy))|located|location|directions|how (do|can) i reach|get there)\b/.test(t) && p.address) parts.push(`We're at ${p.address}.${p.directions ? ` ${p.directions}` : ''}`);
    if (/\b(website|online)\b/.test(t) && p.website) parts.push(`Our website is ${p.website}.`);
    if (/\b(book online|booking link|book myself)\b/.test(t) && p.bookingUrl) parts.push(`You can book online at ${p.bookingUrl}.`);
    if (/\b(what (services|do you do|do you offer)|services do you)\b/.test(t) && p.services?.length) {
      parts.push(`We offer ${p.services.slice(0, 4).join(', ')}${p.services.length > 4 ? ', and more' : ''}.`);
    }

    // Items the caller names: their note ("12-hour fast needed") and their price — unless the
    // active flow looks the item up itself and will say both
    const looksUp = (this.active?.steps || []).some(st => st.type === 'lookup' && st.source === 'catalog');
    const asksPrice = /\b(price|cost|how much|charges?|fees?|rate|kitna|kitne|kimat|keemat|dhara|vilai|evvalavu)\b/i.test(text);
    const asksStock = /\b(do you have|have you got|in stock|available|availability|hai kya|milega|milta|dorukuthundi|undha|irukka|kidaikkuma)\b/i.test(text);
    for (const item of looksUp ? [] : this.mentionedItems(text).slice(0, 2)) {
      if (item.stock === 0) parts.push(`Sorry, ${item.name} is out of stock right now.`);
      else if (asksStock) parts.push(`Yes, we have ${item.name}${item.stock ? ` in stock` : ''}.`);
      if (item.note) parts.push(`${item.name}: ${item.note}`);
      if (asksPrice && item.price) parts.push(`${item.name} is ${item.priceMax ? `${this.money(item.price)} to ${this.money(item.priceMax)}` : this.money(item.price)}.`);
    }

    const msg = words(text);
    let best = null;
    let bestScore = 0;
    for (const faq of p.faqs || []) {
      const q = words(faq.question);
      const overlap = q.filter(w => msg.includes(w)).length;
      const score = q.length ? overlap / q.length : 0;
      if (overlap >= 1 && score > bestScore) { best = faq; bestScore = score; }
    }
    if (best && bestScore >= 0.34) parts.push(best.answer);
    return parts.length ? parts.join(' ') : null;
  }

  // ── Step runner ─────────────────────────────────────────────────────────

  stepIndex(id) {
    return (this.active?.steps || []).findIndex(s => s.id === id);
  }

  /** Executes steps until input is needed. Returns spoken lines + flags. */
  run(out) {
    const steps = this.active?.steps || [];
    let guard = 0;
    while (this.pointer < steps.length && guard++ < 50) {
      const step = steps[this.pointer];
      switch (step.type) {
        case 'collect': {
          const slot = this.slotDef(step.slot);
          const have = this.slots[step.slot];
          if (!slot || (have && (have.value != null || have.declined))) { this.pointer++; break; }
          if (step.when && !this.evalWhen(step.when)) { this.pointer++; break; }
          const tries = this.attempts[step.slot] || 0;
          if (tries > MAX_REPROMPTS) {
            if (slot.required === false) { this.slots[step.slot] = { value: null, display: '—', declined: true }; this.pointer++; break; }
            // Give up gracefully: capture what we have
            this.log('fallback', { slot: step.slot });
            out.say.push(`No problem — I'll pass on what I have and ${this.isBusiness ? 'the team' : this.ownerFirst} will follow up.`);
            this.queueAction({ type: 'create_lead', params: { kind: 'partial' } });
            return this.finish(out, 'end', "I'm disconnecting the call now.");
          }
          out.say.push(this.render(tries > 0 && slot.reprompt ? slot.reprompt : slot.prompt));
          this.asked = step.slot;
          this.attempts[step.slot] = tries + 1;
          this.questionsAsked++;
          out.asked = step.slot;
          return out;
        }
        case 'confirm': {
          const key = `confirm:${step.id}`;
          if (this.slots[key]?.value === true) { this.pointer++; break; }
          out.say.push(this.render(step.text));
          this.asked = key;
          this.questionsAsked++;
          out.asked = key;
          return out;
        }
        case 'say': {
          const line = this.render(step.text);
          if (line) out.say.push(line);
          // Generative step: callSession may replace the template line with a grounded model answer
          if (step.generate && line) out.generate = { kind: step.generate, index: out.say.length - 1, fallback: line };
          this.pointer++;
          break;
        }
        case 'lookup':
          if (step.source === 'catalog') this.lookupCatalog(step);
          else if (step.source === 'records') this.lookupRecord(step);
          else if (step.source === 'listings') this.lookupListings(step);
          this.pointer++;
          break;
        case 'branch': {
          const target = this.evalWhen(step.when) ? step.then : step.else;
          this.log('branch', { step: step.id, to: target });
          const idx = target ? this.stepIndex(target) : -1;
          this.pointer = idx >= 0 ? idx : this.pointer + 1;
          break;
        }
        case 'goto': {
          const idx = this.stepIndex(step.to);
          this.pointer = idx >= 0 ? idx : this.pointer + 1;
          break;
        }
        case 'action':
          this.queueAction({ type: step.action, params: this.renderParams(step.params || {}) });
          this.pointer++;
          break;
        case 'transfer':
          return this.finish(out, 'transfer', step.text);
        case 'end':
          return this.finish(out, 'end', step.text);
        default:
          this.pointer++;
      }
    }
    // Ran off the end of the flow without an explicit end step
    return this.finish(out, 'end', `Thanks for calling. I'm disconnecting the call now.`);
  }

  finish(out, kind, text) {
    if (text) out.say.push(this.render(text));
    this.ended = true;
    this.asked = null;
    if (kind === 'transfer') {
      this.transferred = true;
      out.transfer = true;
    }
    out.end = true;
    this.log(kind, {});
    return out;
  }

  queueAction(action) {
    const entry = {
      ...action,
      workflow: this.active?.id,
      slots: Object.fromEntries(Object.entries(this.slots).filter(([k]) => !k.startsWith('confirm:')).map(([k, s]) => [k, s.display])),
      at: Date.now() - this.startedAt
    };
    this.actions.push(entry);
    this.log('action', { action: action.type });
    try { this.onAction?.(entry, this); } catch (err) { console.error('Workflow onAction error:', err.message); }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Opening line + anything the owner asked to pass on to this caller. */
  greeting(baseGreeting) {
    const say = [baseGreeting];
    const out = { say: [], end: false, transfer: false };
    const notes = (this.callerCtx?.instructions || []).filter(i => i?.text);
    if (notes.length) {
      say.push(`${this.ownerFirst} asked me to pass on a message: ${notes.map(n => n.text.replace(/[.\s]+$/, '')).join('. ')}.`);
      this.log('note_delivered', { count: notes.length });
      this.deliveredNotes = notes;
    }
    if (this.callerCtx?.alwaysTransfer && !this.priorityTimeInfo?.inPriorityTime) {
      say.push(`${this.ownerFirst} asked me to put you straight through. Transferring you now.`);
      out.transfer = true;
      out.end = true;
      this.transferred = true;
      this.ended = true;
      this.log('transfer', { reason: 'always_transfer' });
    } else if (this.vipContact && this.flows.find(f => f.trigger?.cond === 'is_vip')) {
      this.activate(this.flows.find(f => f.trigger?.cond === 'is_vip'), 'vip');
    }
    return { ...out, say: say.join(' ') };
  }

  /**
   * Handle one caller utterance.
   * @param {string} text
   * @param {object} [nlu]  optional model understanding { intent, slots, answer, wantsHuman, goodbye }
   */
  turn(text, nlu = null) {
    const clean = String(text || '').trim();
    const out = { say: [], end: false, transfer: false, asked: null };
    if (this.ended) return this.result(out);
    if (!clean) {
      out.say.push('Sorry, I didn\'t catch that. Could you say it again?');
      return this.result(out);
    }
    this.turns++;
    this.log('caller', { text: clean.slice(0, 200) });

    const opening = this.turns === 1;
    const lower = clean.toLowerCase();
    const escalation = (this.user.escalationKeywords || []).some(k => k && phraseScore(lower, [k]) > 0);
    const emergencyFlow = this.flows.find(f => f.id === 'emergency' || f.id === 'p_emergency');

    // 0) Scam shield: fraud scripts end the call before anything else (fake police often claim emergencies)
    const scamFlow = this.flows.find(f => f.id === 'scam' || f.id === 'p_scam');
    const scam = scamFlow && this.active?.id !== scamFlow.id ? this.scamFor(clean, nlu) : null;
    if (scam) {
      this.scam = { ...scam, phrases: [clean.slice(0, 240)] };
      this.computed = { ...this.computed, scamLabel: scam.label };
      this.log('scam', { type: scam.type, phrase: clean.slice(0, 160) });
      this.activate(scamFlow, 'scam');
      return this.result(this.run(out));
    }

    // 1) Global: emergency always wins
    if (emergencyFlow && this.active?.id !== emergencyFlow.id && (escalation || nlu?.emergency || phraseScore(lower, emergencyFlow.trigger?.keywords) > 0)) {
      this.activate(emergencyFlow, 'escalation');
      // The sentence that triggered the switch describes the emergency itself
      this.fill(clean, nlu?.slots || {}, true, !!nlu?.used);
      return this.result(this.run(out));
    }

    // 2a) An opening that is only a restricted question ("is the paneer tikka nut free?") is refused
    //     without starting a flow, so nothing in it is mistaken for an order or a booking
    if (!this.active) {
      const opener = this.refusalFor(clean, nlu);
      if (opener && !nlu?.intent) {
        out.say.push(this.render(opener.say), 'Is there anything else I can help you with?');
        this.log('refused', { rule: opener.id, text: clean.slice(0, 160) });
        return this.result(out);
      }
    }

    // 2) Route the first utterance
    if (!this.active) {
      let flow = this.route(clean, nlu?.intent);
      // Aggressive shield: unrecognised calls from high-risk numbers get the spam flow
      const spamFlow = this.flows.find(f => f.id === 'sales_shutdown' || f.id === 'p_spam');
      if (spamFlow && flow.trigger?.isDefault && this.user.shield?.mode === 'aggressive' && this.risk.score >= 60) {
        flow = spamFlow;
      }
      this.activate(flow, nlu?.intent ? 'ai' : 'keywords');
    }

    // 2b) Pack guardrail: politely refuse what this business must not do (e.g. medical advice), then carry on
    const refusal = this.refusalFor(clean, nlu);
    if (refusal) {
      out.say.push(this.render(refusal.say));
      this.log('refused', { rule: refusal.id, text: clean.slice(0, 160) });
      const pending = this.asked;
      if (pending && !pending.startsWith('confirm:')) {
        this.asked = null;
        this.fill(clean, Object.fromEntries(Object.entries(nlu?.slots || {}).filter(([k]) => k !== pending)), false, !!nlu?.used);
        this.asked = pending;
        this.attempts[pending] = Math.max(0, (this.attempts[pending] || 1) - 1);
      } else if (!pending) {
        this.fill(clean, nlu?.slots || {}, false, !!nlu?.used);
      }
      if (pending?.startsWith('confirm:')) { this.asked = null; }
      return this.result(this.run(out));
    }

    // 3) Answer to a pending confirmation
    if (this.asked?.startsWith('confirm:')) {
      const yn = nlu?.confirmation === 'yes' ? { value: true } : nlu?.confirmation === 'no' ? { value: false } : extractSlot({ type: 'yesno' }, clean, true);
      const step = this.active.steps[this.pointer];
      if (yn?.value === true) {
        this.slots[this.asked] = { value: true, display: 'Yes' };
        this.log('confirmed', {});
      } else if (yn?.value === false || (nlu?.slots && Object.keys(nlu.slots).length)) {
        // Correction. "No, Thursday not tomorrow" fixes just the timing and re-confirms;
        // a bare "no" re-asks the correctable facts in order.
        const recollect = step?.recollect || [];
        const saved = Object.fromEntries(recollect.map(k => [k, this.slots[k]]));
        // A cart is corrected by adding/changing lines, never by starting over
        for (const k of recollect) if (this.slotDef(k)?.type !== 'order') delete this.slots[k];
        this.asked = null;
        const filled = this.fill(clean, nlu?.slots || {}).filter(k => recollect.includes(k));
        this.log('correction', { refilled: filled });
        if (filled.length) {
          for (const k of recollect) if (!this.slots[k] && saved[k]) this.slots[k] = saved[k];
          out.say.push('Thanks for the correction.');
        } else {
          const first = this.active.steps.findIndex(s => s.type === 'collect' && recollect.includes(s.slot));
          if (first >= 0) this.pointer = first;
          out.say.push('Sorry about that, let me fix it.');
        }
      } else {
        // Side question while confirming: answer it, then re-ask the confirmation
        const side = nlu?.answer || (isQuestion(clean) ? this.answerQuestion(clean) : null);
        if (side) {
          out.say.push(side);
          this.log('answered', { question: clean.slice(0, 120) });
          this.asked = null;
          return this.result(this.run(out));
        }
        out.say.push('Sorry — is that correct, yes or no?');
        return this.result(out);
      }
      return this.result(this.run(out));
    }

    // 4) Side question? Answer from business info, then continue the flow
    const answer = nlu?.answer || (isQuestion(clean) ? this.answerQuestion(clean) : null);
    if (answer) {
      out.say.push(answer);
      this.log('answered', { question: clean.slice(0, 120) });
      // A side question is never the answer to the pending question — only
      // high-confidence facts inside it (a name, a number) are kept.
      const pending = this.asked;
      this.asked = null;
      // A question about an item ("how much is the biryani?") is not an order for it
      this.fill(clean, Object.fromEntries(Object.entries(nlu?.slots || {}).filter(([k]) => k !== pending)), opening && !pending, false, ['order']);
      this.asked = pending;
      if (this.asked) this.attempts[this.asked] = Math.max(0, (this.attempts[this.asked] || 1) - 1);
      return this.result(this.run(out));
    }

    // 5) Wants a human (the VIP flow already handles "busy / put through" itself)
    if ((nlu?.wantsHuman || wantsHuman(clean)) && this.active?.trigger?.cond !== 'is_vip') {
      if (this.cond('transfer_allowed') && (this.vipContact || this.callerCtx?.alwaysTransfer || !this.isBusiness || this.user.businessProfile?.transferNumber)) {
        return this.result(this.finish(out, 'transfer', 'Sure, let me connect you. Transferring you now.'));
      }
      out.say.push(this.isBusiness
        ? 'Everyone is with customers right now, but I will make sure the right person calls you back.'
        : `${this.ownerFirst} can't pick up right now, but I'll make sure they get your message.`);
    }

    // 6) Goodbye
    if (nlu?.goodbye || isGoodbye(clean)) {
      const missing = (this.active?.slots || []).filter(s => s.required !== false && !this.slots[s.key]);
      if (missing.length && !this.goodbyeNudged && missing.some(s => s.type === 'name')) {
        this.goodbyeNudged = true;
        this.asked = 'name';
        out.say.push('Before you go — could I get your name so we can follow up?');
        return this.result(out);
      }
      if (Object.keys(this.slots).length) this.queueAction({ type: 'create_lead', params: { kind: 'partial' } });
      return this.result(this.finish(out, 'end', this.isBusiness ? 'Thanks for calling {{biz}}, have a great day! I\'m disconnecting the call now.' : 'Thanks for calling. I\'m disconnecting the call now.'));
    }

    // 7) Fill slots (multi-slot) and advance
    this.fill(clean, nlu?.slots || {}, opening && !nlu?.used, !!nlu?.used);
    if (this.turns >= (this.active?.maxTurns || 10)) {
      this.log('max_turns', {});
      this.queueAction({ type: 'create_lead', params: { kind: 'partial' } });
      return this.result(this.finish(out, 'end', 'I have everything I need for now — the team will follow up. I\'m disconnecting the call now.'));
    }
    return this.result(this.run(out));
  }

  result(out) {
    return {
      generate: out.generate || null,
      parts: out.say.filter(Boolean),
      say: out.say.filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim(),
      end: !!out.end,
      transfer: !!out.transfer,
      asked: out.asked || this.asked || null,
      workflow: this.active ? { id: this.active.id, name: this.active.name } : null,
      slots: this.publicSlots(),
      progress: this.progress()
    };
  }

  publicSlots() {
    const out = {};
    const defs = new Map((this.active?.slots || []).map(s => [s.key, s]));
    for (const [key, val] of Object.entries(this.slots)) {
      if (key.startsWith('confirm:') || val?.display == null) continue;
      const def = defs.get(key);
      out[key] = { label: def?.label || key.charAt(0).toUpperCase() + key.slice(1), value: val.display, source: val.source };
    }
    return out;
  }

  progress() {
    const req = (this.active?.slots || []).filter(s => s.required !== false);
    if (!req.length) return this.ended ? 1 : 0;
    const done = req.filter(s => this.slots[s.key]).length;
    return Math.round((done / req.length) * 100) / 100;
  }

  /** Persistable summary of what happened — stored on the Call. */
  record() {
    const status = this.transferred ? 'transferred' : this.ended ? 'completed' : 'abandoned';
    return {
      workflowId: this.active?.id || null,
      workflowName: this.active?.name || null,
      status,
      slots: Object.fromEntries(Object.entries(this.publicSlots()).map(([k, v]) => [k, v.value])),
      slotLabels: Object.fromEntries(Object.entries(this.publicSlots()).map(([k, v]) => [k, v.label])),
      turns: this.turns,
      questionsAsked: this.questionsAsked,
      slotsSkipped: this.slotsSkipped,
      durationMs: Date.now() - this.startedAt,
      risk: this.risk,
      scam: this.scam,
      actions: this.actions.map(a => ({ type: a.type, params: a.params, at: a.at })),
      events: this.events.slice(0, 80)
    };
  }
}

export default WorkflowSession;
