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
import { defaultWorkflows } from './templates.js';
import userConfigService from '../services/userConfigService.js';

const MAX_REPROMPTS = 2;
const FAQ_STOP = new Set('a an the is are do does you your we our i to for of in on at and or can could what when where how my me it this that be have has with about any'.split(' '));

function words(text) {
  return (String(text).toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => !FAQ_STOP.has(w) && w.length > 2);
}

function phraseScore(text, phrases = []) {
  const padded = ` ${String(text).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ')} `;
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
  }

  // ── Context helpers ─────────────────────────────────────────────────────

  get isBusiness() { return this.user.accountType !== 'personal'; }
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

  /** Catalog lookup for the item + quantity collected so far. Sets computed vars for templates. */
  lookupCatalog() {
    const catalog = this.user.businessProfile?.catalog || [];
    const wanted = String(this.slots.item?.value || '').toLowerCase();
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
      this.computed = { itemName: this.slots.item?.display || 'that item', stock: 0, availability: `I couldn't find ${this.slots.item?.display || 'that'} in our catalog. I have noted it and the team will call you back with details.` };
      this.log('lookup', { found: false });
      return;
    }
    const { item } = best;
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
    let best = null;
    for (const f of this.flows) {
      if (f.trigger?.isDefault) continue;
      let s = phraseScore(text, f.trigger?.keywords);
      if (category && f.trigger?.categories?.includes(category)) s += 12;
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

  fill(text, nluSlots = {}, opening = false, nluUsed = false) {
    const filled = [];
    // Typed slots first, so an opening statement's free text can drop the
    // parts already captured elsewhere ("…install tomorrow morning" → timing)
    const slots = (this.active?.slots || []).slice().sort((a, b) => (a.type === 'text') - (b.type === 'text'));
    for (const slot of slots) {
      // Remembered/caller-ID values can be overridden by what the caller actually says
      if (this.slots[slot.key] && !['caller_id', 'memory'].includes(this.slots[slot.key].source)) continue;
      // When the model read this turn, it decides what answers the pending question;
      // offline lenient parsing would turn "yep that's right" into a name.
      const asked = this.asked === slot.key && !nluUsed;
      let hit = null;

      if (nluSlots[slot.key] != null && nluSlots[slot.key] !== '') {
        const raw = String(nluSlots[slot.key]);
        hit = extractSlot(slot, raw, true, this.now()) || { value: raw, display: raw };
      } else {
        hit = extractSlot(slot, text, asked, this.now());
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
    if (/\b(address|where are you|where is|located|location|directions|reach|get there)\b/.test(t) && p.address) parts.push(`We're at ${p.address}.${p.directions ? ` ${p.directions}` : ''}`);
    if (/\b(website|online)\b/.test(t) && p.website) parts.push(`Our website is ${p.website}.`);
    if (/\b(book online|booking link|book myself)\b/.test(t) && p.bookingUrl) parts.push(`You can book online at ${p.bookingUrl}.`);
    if (/\b(what (services|do you do|do you offer)|services do you)\b/.test(t) && p.services?.length) {
      parts.push(`We offer ${p.services.slice(0, 4).join(', ')}${p.services.length > 4 ? ', and more' : ''}.`);
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
          if (step.source === 'catalog') this.lookupCatalog();
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
          this.queueAction({ type: step.action, params: step.params || {} });
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

    // 1) Global: emergency always wins
    if (emergencyFlow && this.active?.id !== emergencyFlow.id && (escalation || nlu?.emergency || phraseScore(lower, emergencyFlow.trigger?.keywords) > 0)) {
      this.activate(emergencyFlow, 'escalation');
      // The sentence that triggered the switch describes the emergency itself
      this.fill(clean, nlu?.slots || {}, true, !!nlu?.used);
      return this.result(this.run(out));
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
        for (const k of recollect) delete this.slots[k];
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
      this.fill(clean, Object.fromEntries(Object.entries(nlu?.slots || {}).filter(([k]) => k !== pending)), false);
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
      actions: this.actions.map(a => ({ type: a.type, params: a.params, at: a.at })),
      events: this.events.slice(0, 80)
    };
  }
}

export default WorkflowSession;
