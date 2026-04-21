/**
 * UserConfigService
 *
 * userId = the user's own phone number (E.164, e.g. "+919876543210")
 *
 * Flow:
 *   1. User opens app → POST /api/users/setup { phoneNumber, name, ... }
 *      → creates UserConfig with userId = phoneNumber, seeds default categories
 *   2. Incoming call hits Twilio → To = twilioNumber (our Twilio number)
 *      → look up UserConfig by twilioNumber to get the right user
 *   3. Multi-user: each user gets their own Twilio number assigned during setup
 */

import UserConfig, { DEFAULT_CATEGORIES } from '../models/mongodb/UserConfig.js';
import { isMongoConnected } from '../config/mongodb.js';

class UserConfigService {
  constructor() {
    console.log('✅ UserConfigService initialized');
  }

  isAvailable() {
    return isMongoConnected();
  }

  // ── Setup (called on first app login) ────────────────────────────────────
  //
  // Creates or updates the user config for a phone number.
  // Seeds DEFAULT_CATEGORIES first, then merges any custom categories passed in.
  // Safe to call again — will only update fields you pass, won't wipe categories.

  async setupUser(phoneNumber, data = {}) {
    if (!this.isAvailable()) throw new Error('MongoDB not connected');

    const userId = phoneNumber; // userId IS the phone number
    const existing = await UserConfig.findOne({ userId }).lean();
    const isNewUser = !existing;

    // Merge categories: start with defaults, override with any the user passed
    let categories = DEFAULT_CATEGORIES;
    if (data.callCategories && data.callCategories.length > 0) {
      // User passed custom categories — merge: their categories replace matching defaults
      const customMap = new Map(data.callCategories.map(c => [c.id, c]));
      categories = DEFAULT_CATEGORIES.map(d => customMap.has(d.id) ? { ...d, ...customMap.get(d.id) } : d);
      // Append any brand-new categories that aren't in defaults
      for (const [id, cat] of customMap) {
        if (!DEFAULT_CATEGORIES.find(d => d.id === id)) categories.push(cat);
      }
    } else if (existing?.callCategories?.length > 0) {
      // User already has categories — don't overwrite them
      categories = existing.callCategories;
    }

    const doc = {
      userId,
      phoneNumber,
      name:                (data.name && data.name.trim() !== '' && data.name !== 'User' ? data.name.trim() : null) || existing?.name || 'User',
      about:               data.about               || existing?.about || 'A professional who receives many calls.',
      twilioNumber:        data.twilioNumber         || existing?.twilioNumber || process.env.TWILIO_PHONE_NUMBER || '',
      aiSettings:          { ...(existing?.aiSettings || {}), ...(data.aiSettings || {}) },
      unknownCallerAction: data.unknownCallerAction  || existing?.unknownCallerAction || 'screen',
      escalationKeywords:  data.escalationKeywords   || existing?.escalationKeywords || ['emergency', 'urgent', 'hospital', 'accident', 'fire'],
      callCategories:      categories,
      vipContacts:         data.vipContacts          || existing?.vipContacts || [],
      blockedNumbers:      data.blockedNumbers        || existing?.blockedNumbers || [],
      // Delivery address — deep merge: keep existing fields, overlay any new ones
      deliveryAddress: {
        ...(existing?.deliveryAddress || {}),
        ...(data.deliveryAddress      || {})
      },
      // Preserve existing priorityTime; seed defaults for new users
      priorityTime: existing?.priorityTime
        ? existing.priorityTime
        : {
            enabled: false,
            timeSlots: [],
            recurring: { enabled: false, daysOfWeek: [1, 2, 3, 4, 5], excludeDates: [] },
            timezone: 'Asia/Kolkata',
            message: '{userName} is currently unavailable due to important work and cannot take calls. They will be available after {endTime}. Please leave your details and they will get back to you.',
            emergencyContacts: [],
            quickToggleActive: false
          },
      updatedAt:           new Date()
    };

    const user = await UserConfig.findOneAndUpdate(
      { userId },
      { $set: doc },
      { upsert: true, new: true }
    );

    console.log(`✅ User setup: ${userId} (${user.name}), ${user.callCategories.length} categories`);
    return { ...user.toObject(), isNewUser };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getUser(userId) {
    if (!userId) return null;
    if (!this.isAvailable()) return null;

    try {
      const user = await UserConfig.findOne({ userId }).lean();
      return user || null;
    } catch (err) {
      console.error('❌ getUser:', err);
      return null;
    }
  }

  // Look up by the Twilio "To" number — used on incoming call
  async getUserByTwilioNumber(twilioNumber) {
    if (!this.isAvailable()) return null;

    try {
      // 1. Try exact match in DB
      let user = await UserConfig.findOne({ twilioNumber }).lean();
      if (user) return user;

      // 2. Fallback: if only one user exists (single-user / dev mode), use that
      const count = await UserConfig.countDocuments();
      if (count === 1) {
        user = await UserConfig.findOne({}).lean();
        return user;
      }

      return null;
    } catch (err) {
      console.error('❌ getUserByTwilioNumber:', err);
      return null;
    }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  // Generic field update — never clobbers categories/vipContacts/deviceTokens
  // unless explicitly included in the updates object
  async updateUser(userId, updates) {
    if (!userId || !this.isAvailable()) return null;

    try {
      const safeUpdates = { ...updates, updatedAt: new Date() };
      // Never clobber these fields through a generic update — use dedicated methods
      if (!('callCategories' in updates)) delete safeUpdates.callCategories;
      if (!('vipContacts'    in updates)) delete safeUpdates.vipContacts;
      if (!('deviceTokens'   in updates)) delete safeUpdates.deviceTokens;

      // deliveryAddress: deep-merge with existing instead of replacing wholesale
      if ('deliveryAddress' in updates) {
        const existing = await UserConfig.findOne({ userId }).select('deliveryAddress').lean();
        safeUpdates.deliveryAddress = {
          ...(existing?.deliveryAddress || {}),
          ...updates.deliveryAddress
        };
      }

      const user = await UserConfig.findOneAndUpdate(
        { userId },
        { $set: safeUpdates },
        { new: true }
      );
      return user ? user.toObject() : null;
    } catch (err) {
      console.error('❌ updateUser:', err);
      return null;
    }
  }

  // ── Category helpers ─────────────────────────────────────────────────────

  async addCategory(userId, category) {
    if (!this.isAvailable()) return null;
    try {
      // Prevent duplicate ids
      const existing = await UserConfig.findOne({ userId, 'callCategories.id': category.id });
      if (existing) throw new Error(`Category '${category.id}' already exists. Use PUT to update.`);

      return await UserConfig.findOneAndUpdate(
        { userId },
        { $push: { callCategories: category } },
        { new: true }
      );
    } catch (err) {
      console.error('❌ addCategory:', err);
      throw err;
    }
  }

  async updateCategory(userId, categoryId, updates) {
    if (!this.isAvailable()) return null;
    try {
      const existing = await UserConfig.findOne({ userId, 'callCategories.id': categoryId });

      if (existing) {
        // Patch only supplied fields
        const setFields = {};
        for (const [key, val] of Object.entries(updates)) {
          if (key !== 'id') setFields[`callCategories.$[elem].${key}`] = val;
        }
        return await UserConfig.findOneAndUpdate(
          { userId },
          { $set: setFields },
          { arrayFilters: [{ 'elem.id': categoryId }], new: true }
        );
      } else {
        // Doesn't exist yet — create it from default definition + updates
        const defaultCat = DEFAULT_CATEGORIES.find(c => c.id === categoryId);
        const newCat = {
          ...(defaultCat || { label: categoryId, action: 'follow_instructions', keywords: [], notify: true, priority: 5 }),
          ...updates,
          id: categoryId
        };
        console.log(`📝 Created category '${categoryId}' for user ${userId}`);
        return await UserConfig.findOneAndUpdate(
          { userId },
          { $push: { callCategories: newCat } },
          { new: true, upsert: true }
        );
      }
    } catch (err) {
      console.error('❌ updateCategory:', err);
      return null;
    }
  }

  async removeCategory(userId, categoryId) {
    if (!this.isAvailable()) return null;
    try {
      return await UserConfig.findOneAndUpdate(
        { userId },
        { $pull: { callCategories: { id: categoryId } } },
        { new: true }
      );
    } catch (err) {
      console.error('❌ removeCategory:', err);
      return null;
    }
  }

  // ── Blocked Numbers ───────────────────────────────────────────────────────

  async addBlockedNumber(userId, phoneNumber) {
    if (!this.isAvailable()) return null;
    try {
      const user = await UserConfig.findOne({ userId }).select('blockedNumbers').lean();
      if (user?.blockedNumbers?.includes(phoneNumber)) {
        throw new Error('Number is already blocked');
      }
      return await UserConfig.findOneAndUpdate(
        { userId },
        { $addToSet: { blockedNumbers: phoneNumber } },
        { new: true }
      );
    } catch (err) {
      console.error('❌ addBlockedNumber:', err);
      throw err;
    }
  }

  async removeBlockedNumber(userId, phoneNumber) {
    if (!this.isAvailable()) return null;
    try {
      return await UserConfig.findOneAndUpdate(
        { userId },
        { $pull: { blockedNumbers: phoneNumber } },
        { new: true }
      );
    } catch (err) {
      console.error('❌ removeBlockedNumber:', err);
      return null;
    }
  }

  // ── Device tokens ─────────────────────────────────────────────────────────

  async addDeviceToken(userId, token, platform) {
    if (!this.isAvailable()) return null;
    try {
      // Remove any existing entry for this token first, then add atomically
      await UserConfig.updateOne({ userId }, { $pull: { deviceTokens: { token } } });
      return await UserConfig.findOneAndUpdate(
        { userId },
        { $addToSet: { deviceTokens: { token, platform, addedAt: new Date() } } },
        { new: true, upsert: true }
      );
    } catch (err) {
      console.error('❌ addDeviceToken:', err);
      return null;
    }
  }

  // ── Priority Time ────────────────────────────────────────────────────────

  /**
   * Check if user is in priority time mode (DND)
   * @param {Object} user - UserConfig document
   * @param {String} callerNumber - Caller's phone number (optional, for emergency bypass check)
   * @returns {Object} { inPriorityTime: boolean, endTime: string, startTime: string, message: string }
   */
  isInPriorityTime(user, callerNumber = null) {
    if (!user?.priorityTime?.enabled && !user?.priorityTime?.quickToggleActive) {
      return { inPriorityTime: false };
    }

    const { timezone, message, emergencyContacts, recurring, timeSlots, quickToggleActive } = user.priorityTime;
    
    try {
      // Check if caller is in emergency bypass list
      if (callerNumber && emergencyContacts?.length > 0) {
        const normalizedCaller = callerNumber.replace(/\D/g, ''); // Remove non-digits
        const isEmergencyContact = emergencyContacts.some(contact => {
          const normalizedContact = contact.phoneNumber.replace(/\D/g, '');
          return normalizedContact === normalizedCaller || 
                 normalizedCaller.endsWith(normalizedContact) ||
                 normalizedContact.endsWith(normalizedCaller);
        });
        
        if (isEmergencyContact) {
          console.log('🚨 Emergency contact bypass - allowing call through');
          return { inPriorityTime: false, bypassReason: 'emergency_contact' };
        }
      }
      
      // Get current time in user's timezone
      const now = new Date();
      const timeStr = now.toLocaleString('en-US', { 
        timeZone: timezone || 'Asia/Kolkata',
        hour12: false 
      });
      
      // Get current day of week (0 = Sunday, 6 = Saturday)
      const dateStr = now.toLocaleString('en-US', { 
        timeZone: timezone || 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const localDate = new Date(dateStr);
      const currentDay = localDate.getDay();
      const currentDateStr = localDate.toISOString().split('T')[0];
      
      // Check recurring schedule
      if (recurring?.enabled) {
        // Check if today is in the allowed days of week
        if (!recurring.daysOfWeek?.includes(currentDay)) {
          console.log(`📅 Not in recurring days - today is ${currentDay}, allowed: ${recurring.daysOfWeek}`);
          return { inPriorityTime: false };
        }
        
        // Check if today is in excluded dates
        if (recurring.excludeDates?.includes(currentDateStr)) {
          console.log(`📅 Date excluded from priority time: ${currentDateStr}`);
          return { inPriorityTime: false };
        }
      }
      
      // Extract HH:mm from the localized time string
      const timeParts = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (!timeParts) return { inPriorityTime: false };
      
      const currentHour = parseInt(timeParts[1]);
      const currentMinute = parseInt(timeParts[2]);
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      
      // Helper function to check if current time is in a slot
      const checkTimeSlot = (slot) => {
        const [startHour, startMinute] = slot.startTime.split(':').map(Number);
        const [endHour, endMinute] = slot.endTime.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;
        
        if (startTimeMinutes <= endTimeMinutes) {
          // Normal case: start < end (e.g., 09:00 to 17:00)
          return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
        } else {
          // Overnight case: start > end (e.g., 22:00 to 06:00)
          return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
        }
      };
      
      // Convert to 12-hour format
      const format12Hour = (time24) => {
        const [h, m] = time24.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
      };
      
      // Check all time slots
      if (timeSlots && timeSlots.length > 0) {
        for (const slot of timeSlots) {
          if (checkTimeSlot(slot)) {
            const endTime12 = format12Hour(slot.endTime);
            const userName = user.name ? user.name.split(' ')[0] : 'The user';
            
            // Replace placeholders in message
            const customMessage = message
              ?.replace('{endTime}', endTime12)
              .replace('{userName}', userName) || 
              `${userName} is currently unavailable due to important work and cannot take calls. They will be available after ${endTime12}. Please leave your details and they will get back to you.`;
            
            return {
              inPriorityTime: true,
              endTime: endTime12,
              startTime: slot.startTime,
              slotLabel: slot.label,
              message: customMessage
            };
          }
        }
      }
      
      // If quick toggle is active but no time slots match, still respect the toggle
      if (quickToggleActive) {
        const userName = user.name ? user.name.split(' ')[0] : 'The user';
        const customMessage = message
          ?.replace('{endTime}', 'later')
          .replace('{userName}', userName) || 
          `${userName} is currently unavailable and cannot take calls. Please leave your details and they will get back to you.`;
        
        return {
          inPriorityTime: true,
          endTime: null,
          startTime: null,
          message: customMessage,
          quickToggle: true
        };
      }
      
      return { inPriorityTime: false };
    } catch (err) {
      console.error('❌ isInPriorityTime error:', err);
      return { inPriorityTime: false };
    }
  }
}

export default new UserConfigService();
