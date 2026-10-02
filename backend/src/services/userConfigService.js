/**
 * UserConfigService
 *
 * userId = the account owner's phone number (E.164, e.g. "+14155551234")
 *
 * Flow:
 *   1. Owner verifies their phone via OTP → setupUser() creates the UserConfig
 *   2. Onboarding (dashboard) sets business profile + industry template
 *   3. Incoming call hits Twilio → To = twilioNumber → getUserByTwilioNumber()
 */

import UserConfig, { DEFAULT_CATEGORIES } from '../models/mongodb/UserConfig.js';
import { isMongoConnected } from '../config/mongodb.js';
import { buildIndustryTemplate } from '../config/templates.js';
import { phonesMatch, findByPhone } from '../lib/phone.js';

const DEFAULT_PRIORITY_MESSAGE = '{userName} is currently unavailable due to important work and cannot take calls. They will be available after {endTime}. Please leave your details and they will get back to you.';

// Fields the owner may change through the generic PUT /api/users/config.
// Everything else (userId, phoneNumber, twilioNumber, deviceTokens, ...) is server-controlled.
export const EDITABLE_FIELDS = [
  'name', 'about', 'accountType', 'businessProfile', 'aiSettings',
  'deliveryAddress', 'unknownCallerAction', 'escalationKeywords', 'onboardingCompleted', 'recording'
];
const VALID_LANGUAGES = ['en', 'hi', 'te', 'ta', 'ml', 'mr', 'gu', 'es'];

const VALID_VOICES = ['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'];

function pick(obj, keys) {
  return Object.fromEntries(keys.filter(k => obj && k in obj).map(k => [k, obj[k]]));
}

class UserConfigService {
  isAvailable() {
    return isMongoConnected();
  }

  // ── Setup (called on first verified login) ───────────────────────────────

  async setupUser(phoneNumber, data = {}) {
    if (!this.isAvailable()) throw new Error('Database not connected');

    const userId = phoneNumber;
    const existing = await UserConfig.findOne({ userId }).lean();
    if (existing) {
      return { ...existing, isNewUser: false };
    }

    const accountType = data.accountType === 'personal' ? 'personal' : 'business';
    const template = accountType === 'business' ? buildIndustryTemplate(data.industry) : null;

    const doc = {
      userId,
      phoneNumber,
      accountType,
      name: (typeof data.name === 'string' && data.name.trim()) || 'User',
      about: data.about || (accountType === 'business' ? '' : 'A professional who receives many calls.'),
      // In dev / single-number setups the shared Twilio number is assigned to the first account only.
      twilioNumber: await this._defaultTwilioNumber(),
      callCategories: template ? template.callCategories : DEFAULT_CATEGORIES,
      businessProfile: template ? { ...template.businessProfile, timezone: data.timezone || 'America/New_York' } : {},
      priorityTime: {
        enabled: false,
        timeSlots: [],
        recurring: { enabled: false, daysOfWeek: [1, 2, 3, 4, 5], excludeDates: [] },
        timezone: data.timezone || 'America/New_York',
        message: DEFAULT_PRIORITY_MESSAGE,
        emergencyContacts: [],
        quickToggleActive: false
      }
    };

    const user = await UserConfig.create(doc);
    console.log(`✅ New account: ${userId} (${accountType}), ${user.callCategories.length} categories`);
    return { ...user.toObject(), isNewUser: true };
  }

  async _defaultTwilioNumber() {
    const shared = process.env.TWILIO_PHONE_NUMBER;
    if (!shared) return undefined;
    const taken = await UserConfig.exists({ twilioNumber: shared });
    return taken ? undefined : shared;
  }

  /**
   * Apply an industry template (onboarding). Replaces categories and merges
   * template services/FAQs/hours into the business profile without discarding
   * anything the owner already typed.
   */
  async applyIndustryTemplate(userId, industry, profile = {}) {
    if (!this.isAvailable()) return null;
    const template = buildIndustryTemplate(industry);
    const existing = await UserConfig.findOne({ userId }).lean();
    if (!existing) return null;

    const current = existing.businessProfile || {};
    const businessProfile = {
      ...template.businessProfile,
      ...current,
      ...profile,
      industry: template.businessProfile.industry,
      services: profile.services?.length ? profile.services : (current.services?.length ? current.services : template.businessProfile.services),
      faqs: profile.faqs?.length ? profile.faqs : (current.faqs?.length ? current.faqs : template.businessProfile.faqs),
      hours: profile.hours?.length ? profile.hours : (current.hours?.length ? current.hours : template.businessProfile.hours)
    };

    const user = await UserConfig.findOneAndUpdate(
      { userId },
      { $set: { businessProfile, callCategories: template.callCategories, accountType: 'business' } },
      { new: true, runValidators: true }
    );
    return user?.toObject() || null;
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getUser(userId) {
    if (!userId || !this.isAvailable()) return null;
    try {
      return await UserConfig.findOne({ userId }).lean();
    } catch (err) {
      console.error('❌ getUser:', err);
      return null;
    }
  }

  // Look up by the Twilio "To" number — used on incoming call
  async getUserByTwilioNumber(twilioNumber) {
    if (!this.isAvailable() || !twilioNumber) return null;
    try {
      const user = await UserConfig.findOne({ twilioNumber }).lean();
      if (user) return user;

      // Dev convenience only: a single account owns whatever number is calling in.
      if (process.env.NODE_ENV !== 'production' && (await UserConfig.countDocuments()) === 1) {
        return await UserConfig.findOne({}).lean();
      }
      return null;
    } catch (err) {
      console.error('❌ getUserByTwilioNumber:', err);
      return null;
    }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Whitelisted update for owner-editable fields. Nested objects
   * (businessProfile, aiSettings, deliveryAddress) are merged, not replaced.
   */
  async updateEditable(userId, updates = {}) {
    if (!userId || !this.isAvailable()) return null;
    const clean = pick(updates, EDITABLE_FIELDS);
    if (clean.accountType && !['personal', 'business'].includes(clean.accountType)) delete clean.accountType;
    if (clean.aiSettings?.language && !VALID_LANGUAGES.includes(clean.aiSettings.language)) {
      throw Object.assign(new Error(`language must be one of: ${VALID_LANGUAGES.join(', ')}`), { status: 400 });
    }
    if (clean.recording) clean.recording = { ...(clean.recording.enabled !== undefined ? { enabled: !!clean.recording.enabled } : {}), ...(clean.recording.announce !== undefined ? { announce: !!clean.recording.announce } : {}), ...(clean.recording.retentionDays ? { retentionDays: Math.min(Math.max(Number(clean.recording.retentionDays) || 90, 1), 3650) } : {}) };
    if (clean.aiSettings?.voice && !VALID_VOICES.includes(clean.aiSettings.voice)) {
      throw Object.assign(new Error(`voice must be one of: ${VALID_VOICES.join(', ')}`), { status: 400 });
    }

    const $set = {};
    for (const [key, value] of Object.entries(clean)) {
      if (['businessProfile', 'aiSettings', 'deliveryAddress', 'recording'].includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [sub, subVal] of Object.entries(value)) $set[`${key}.${sub}`] = subVal;
      } else {
        $set[key] = value;
      }
    }
    if (Object.keys($set).length === 0) return this.getUser(userId);

    const user = await UserConfig.findOneAndUpdate({ userId }, { $set }, { new: true, runValidators: true });
    return user ? user.toObject() : null;
  }

  /** Internal update — callers are responsible for passing only safe fields. */
  async updateUser(userId, updates) {
    if (!userId || !this.isAvailable()) return null;
    try {
      const user = await UserConfig.findOneAndUpdate({ userId }, { $set: updates }, { new: true, runValidators: true });
      return user ? user.toObject() : null;
    } catch (err) {
      console.error('❌ updateUser:', err);
      return null;
    }
  }

  // ── Category helpers ─────────────────────────────────────────────────────

  async addCategory(userId, category) {
    if (!this.isAvailable()) return null;
    const existing = await UserConfig.findOne({ userId, 'callCategories.id': category.id });
    if (existing) throw Object.assign(new Error(`Category '${category.id}' already exists. Use PUT to update.`), { status: 409 });

    return await UserConfig.findOneAndUpdate(
      { userId },
      { $push: { callCategories: category } },
      { new: true, runValidators: true }
    );
  }

  async updateCategory(userId, categoryId, updates) {
    if (!this.isAvailable()) return null;
    const allowed = pick(updates, ['label', 'keywords', 'action', 'instructions', 'notify', 'priority']);
    const existing = await UserConfig.findOne({ userId, 'callCategories.id': categoryId });

    if (existing) {
      const setFields = {};
      for (const [key, val] of Object.entries(allowed)) setFields[`callCategories.$[elem].${key}`] = val;
      if (Object.keys(setFields).length === 0) return existing;
      return await UserConfig.findOneAndUpdate(
        { userId },
        { $set: setFields },
        { arrayFilters: [{ 'elem.id': categoryId }], new: true, runValidators: true }
      );
    }

    const defaultCat = DEFAULT_CATEGORIES.find(c => c.id === categoryId);
    const newCat = {
      ...(defaultCat || { label: categoryId, action: 'follow_instructions', keywords: [], notify: true, priority: 5 }),
      ...allowed,
      id: categoryId
    };
    // No upsert: never create an account as a side effect of editing a category
    return await UserConfig.findOneAndUpdate(
      { userId },
      { $push: { callCategories: newCat } },
      { new: true, runValidators: true }
    );
  }

  async removeCategory(userId, categoryId) {
    if (!this.isAvailable()) return null;
    return await UserConfig.findOneAndUpdate(
      { userId },
      { $pull: { callCategories: { id: categoryId } } },
      { new: true }
    );
  }

  // ── Blocked Numbers ───────────────────────────────────────────────────────

  isBlocked(user, phoneNumber) {
    return !!findByPhone(user?.blockedNumbers, phoneNumber);
  }

  async addBlockedNumber(userId, phoneNumber) {
    if (!this.isAvailable()) return null;
    const user = await UserConfig.findOne({ userId }).select('blockedNumbers').lean();
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    if (this.isBlocked(user, phoneNumber)) {
      throw Object.assign(new Error('Number is already blocked'), { status: 409 });
    }
    return await UserConfig.findOneAndUpdate(
      { userId },
      { $addToSet: { blockedNumbers: phoneNumber } },
      { new: true }
    );
  }

  async removeBlockedNumber(userId, phoneNumber) {
    if (!this.isAvailable()) return null;
    const user = await UserConfig.findOne({ userId }).select('blockedNumbers').lean();
    const remaining = (user?.blockedNumbers || []).filter(n => !phonesMatch(n, phoneNumber) && n !== phoneNumber);
    return await UserConfig.findOneAndUpdate(
      { userId },
      { $set: { blockedNumbers: remaining } },
      { new: true }
    );
  }

  // ── Device tokens ─────────────────────────────────────────────────────────

  async addDeviceToken(userId, token, platform) {
    if (!this.isAvailable()) return null;
    await UserConfig.updateOne({ userId }, { $pull: { deviceTokens: { token } } });
    return await UserConfig.findOneAndUpdate(
      { userId },
      { $push: { deviceTokens: { token, platform, addedAt: new Date() } } },
      { new: true }
    );
  }

  // ── Time helpers ─────────────────────────────────────────────────────────

  /** Current weekday (0-6), "YYYY-MM-DD" and minutes-since-midnight in a timezone. */
  localNow(timezone, now = new Date()) {
    let parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
      }).formatToParts(now);
    } catch {
      return this.localNow('UTC', now);
    }
    const get = type => parts.find(p => p.type === type)?.value;
    const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: weekdays[get('weekday')],
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: Number(get('hour')) * 60 + Number(get('minute'))
    };
  }

  format12Hour(time24) {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  _toMinutes(hhmm) {
    const [h, m] = (hhmm || '0:0').split(':').map(Number);
    return h * 60 + m;
  }

  _inSlot(minutes, start, end) {
    const s = this._toMinutes(start);
    const e = this._toMinutes(end);
    return s <= e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
  }

  /**
   * Is the business open right now? Returns { open, todayHours, nextOpen }.
   * If no hours are configured, the business is treated as always open.
   */
  businessHoursStatus(user, now = new Date()) {
    const hours = user?.businessProfile?.hours || [];
    if (hours.length === 0) return { configured: false, open: true };
    const tz = user.businessProfile?.timezone || user.priorityTime?.timezone || 'UTC';
    const local = this.localNow(tz, now);
    const today = hours.find(h => h.day === local.day);
    const open = !!today && !today.closed && this._inSlot(local.minutes, today.open, today.close);

    let nextOpen = null;
    if (!open) {
      for (let i = 0; i < 7; i++) {
        const day = (local.day + i) % 7;
        const h = hours.find(x => x.day === day);
        if (!h || h.closed) continue;
        if (i === 0 && local.minutes >= this._toMinutes(h.open)) continue;
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
        nextOpen = `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : dayName} at ${this.format12Hour(h.open)}`;
        break;
      }
    }
    return { configured: true, open, todayHours: today, nextOpen };
  }

  /**
   * Check if user is in priority time mode (DND).
   * Emergency contacts always bypass. The manual quick toggle wins over the schedule.
   */
  /** Shield mode with auto-expiry ("Focus until 5pm"). */
  effectiveShield(user, now = new Date()) {
    const sh = user?.shield;
    if (!sh?.mode || sh.mode === 'standard') return 'standard';
    if (sh.until && new Date(sh.until) <= now) return 'standard';
    return sh.mode;
  }

  isInPriorityTime(user, callerNumber = null, now = new Date()) {
    if (this.effectiveShield(user, now) === 'focus') {
      if (callerNumber && findByPhone(user?.priorityTime?.emergencyContacts, callerNumber)) {
        return { inPriorityTime: false, bypassReason: 'emergency_contact' };
      }
      const until = user.shield.until ? new Date(user.shield.until) : null;
      const userName = user.name ? user.name.split(' ')[0] : 'The user';
      const endTime = until ? until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: user.businessProfile?.timezone || user.priorityTime?.timezone || 'UTC' }) : null;
      return { inPriorityTime: true, endTime, until: until ? until.toISOString() : null, message: `${userName} is focusing right now${endTime ? ` until ${endTime}` : ''} and can't take calls.`, shield: 'focus' };
    }
    const pt = user?.priorityTime;
    if (!pt?.enabled && !pt?.quickToggleActive) return { inPriorityTime: false };

    const { timezone, message, emergencyContacts, recurring, timeSlots, quickToggleActive } = pt;
    const userName = user.name ? user.name.split(' ')[0] : 'The user';
    const render = endTime => (message || DEFAULT_PRIORITY_MESSAGE)
      .replaceAll('{endTime}', endTime)
      .replaceAll('{userName}', userName);

    try {
      if (callerNumber && findByPhone(emergencyContacts, callerNumber)) {
        return { inPriorityTime: false, bypassReason: 'emergency_contact' };
      }

      if (quickToggleActive) {
        return { inPriorityTime: true, endTime: null, startTime: null, message: render('later'), quickToggle: true };
      }

      const local = this.localNow(timezone, now);
      if (recurring?.enabled) {
        if (!recurring.daysOfWeek?.includes(local.day)) return { inPriorityTime: false };
        if (recurring.excludeDates?.includes(local.date)) return { inPriorityTime: false };
      }

      for (const slot of timeSlots || []) {
        if (this._inSlot(local.minutes, slot.startTime, slot.endTime)) {
          const endTime12 = this.format12Hour(slot.endTime);
          return {
            inPriorityTime: true,
            endTime: endTime12,
            startTime: slot.startTime,
            slotLabel: slot.label,
            message: render(endTime12)
          };
        }
      }
      return { inPriorityTime: false };
    } catch (err) {
      console.error('❌ isInPriorityTime error:', err);
      return { inPriorityTime: false };
    }
  }
}

export default new UserConfigService();
