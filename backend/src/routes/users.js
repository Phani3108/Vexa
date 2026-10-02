/**
 * User Routes — /api/users/*
 *
 * userId = the user's phone number (E.164)
 *
 * userId resolved from req.user.userId (set by auth middleware).
 * Accounts are created by OTP verification (routes/auth.js), not here.
 */

import express from 'express';
import userConfigService from '../services/userConfigService.js';
import { industryList } from '../config/templates.js';
import { isValidE164 } from '../lib/phone.js';
import { seedDemoCalls } from '../services/demoData.js';
import { DEFAULT_CATEGORIES } from '../models/mongodb/UserConfig.js';

export const demoDataEnabled = () => process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_DATA === 'true';

const router = express.Router();

// Helper: resolve userId for any request
function resolveUserId(req) {
  return req.user?.userId || null;
}

// ── Config ───────────────────────────────────────────────────────────────────

// GET /api/users/config
router.get('/config', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const config = await userConfigService.getUser(userId);
    if (!config) return res.status(404).json({ error: 'User not found' });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user config' });
  }
});

// PUT /api/users/config  — update owner-editable fields only (see EDITABLE_FIELDS).
// Categories, VIPs, blocked numbers and priority time have dedicated endpoints.
router.put('/config', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const config = await userConfigService.updateEditable(userId, req.body || {});
    if (!config) return res.status(404).json({ error: 'User not found' });
    res.json({ config, message: 'Saved' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to save user config' });
  }
});

// ── Onboarding (SME) ────────────────────────────────────────────────────────

// GET /api/users/templates — industries available for onboarding
router.get('/templates', (req, res) => {
  res.json({ industries: industryList() });
});

// POST /api/users/onboarding  { industry, name?, businessProfile?, aiSettings? }
// Seeds categories/FAQs/hours from the industry template and marks onboarding done.
router.post('/onboarding', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { industry = 'other', businessProfile = {}, name, aiSettings, accountType, deliveryAddress } = req.body || {};

    // Personal mode: personal call rules + personal flows; no business template
    if (accountType === 'personal') {
      await userConfigService.updateUser(userId, {
        accountType: 'personal',
        callCategories: DEFAULT_CATEGORIES,
        workflows: null
      });
      const config = await userConfigService.updateEditable(userId, {
        ...(name ? { name } : {}),
        ...(aiSettings ? { aiSettings } : {}),
        ...(deliveryAddress ? { deliveryAddress } : {}),
        ...(businessProfile?.timezone ? { businessProfile: { timezone: businessProfile.timezone } } : {}),
        onboardingCompleted: true
      });
      return res.json({ config, message: 'Your AI assistant is ready' });
    }
    if (businessProfile.transferNumber && !isValidE164(businessProfile.transferNumber)) {
      return res.status(400).json({ error: 'Transfer number must be in E.164 format, e.g. +14155551234' });
    }

    const applied = await userConfigService.applyIndustryTemplate(userId, industry, businessProfile);
    if (!applied) return res.status(404).json({ error: 'User not found' });
    await userConfigService.updateUser(userId, { workflows: null });

    const config = await userConfigService.updateEditable(userId, {
      ...(name ? { name } : {}),
      ...(aiSettings ? { aiSettings } : {}),
      onboardingCompleted: true
    });
    res.json({ config, message: 'Your AI receptionist is ready' });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Onboarding failed' });
  }
});

// POST /api/users/mode { accountType } — switch Personal ⇄ Business from the home screen.
// Both profiles are kept; switching swaps the call rules and flows.
router.post('/mode', async (req, res) => {
  const userId = resolveUserId(req);
  const mode = req.body?.accountType;
  if (!['personal', 'business'].includes(mode)) return res.status(400).json({ error: 'accountType must be personal or business' });
  const user = await userConfigService.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (mode === 'business') {
    if (!user.businessProfile?.businessName) return res.status(409).json({ error: 'Set up your business first', needsOnboarding: true });
    await userConfigService.applyIndustryTemplate(userId, user.businessProfile.industry || 'other', {});
    await userConfigService.updateUser(userId, { accountType: 'business', workflows: null });
  } else {
    await userConfigService.updateUser(userId, { accountType: 'personal', callCategories: DEFAULT_CATEGORIES, workflows: null });
  }
  res.json({ config: await userConfigService.getUser(userId) });
});

// POST /api/users/demo-data — load sample calls so the dashboard can be explored (dev/demo only)
router.post('/demo-data', async (req, res) => {
  if (!demoDataEnabled()) return res.status(404).json({ error: 'Route not found' });
  const count = await seedDemoCalls(resolveUserId(req));
  res.json({ inserted: count });
});

// ── Call Categories ─────────────────────────────────────────────────────────

// GET /api/users/categories
router.get('/categories', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ categories: user.callCategories || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/users/categories  — add a brand-new category
router.post('/categories', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { id, label, keywords, action, instructions, notify, priority } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id and label are required' });

    if (!/^[a-z0-9_.-]{2,60}$/i.test(id)) return res.status(400).json({ error: 'id may only contain letters, numbers, dot, dash and underscore' });

    const user = await userConfigService.addCategory(userId, {
      id, label,
      keywords:     Array.isArray(keywords) ? keywords : [],
      action:       action       || 'follow_instructions',
      instructions: instructions || '',
      notify:       notify       !== false,
      priority:     priority     || 5
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ categories: user.callCategories, message: 'Category added' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to add category' });
  }
});

// PUT /api/users/categories/:categoryId  — edit a category (or create if not yet present)
router.put('/categories/:categoryId', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { categoryId } = req.params;
    const user = await userConfigService.updateCategory(userId, categoryId, req.body);
    res.json({ categories: user?.callCategories, message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/users/categories/:categoryId
router.delete('/categories/:categoryId', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { categoryId } = req.params;
    const user = await userConfigService.removeCategory(userId, categoryId);
    res.json({ categories: user?.callCategories, message: 'Category removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove category' });
  }
});

// ── VIP Contacts ────────────────────────────────────────────────────────────

// GET /api/users/vip-contacts
router.get('/vip-contacts', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ vipContacts: user.vipContacts || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch VIP contacts' });
  }
});

// PUT /api/users/vip-contacts
router.put('/vip-contacts', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { vipContacts } = req.body;
    if (!Array.isArray(vipContacts)) return res.status(400).json({ error: 'vipContacts must be an array' });
    const clean = vipContacts
      .filter(v => v && typeof v.phoneNumber === 'string' && v.phoneNumber.trim())
      .map(v => ({ name: v.name || '', phoneNumber: v.phoneNumber.trim(), relationship: v.relationship || '', notes: v.notes || '' }));
    const user = await userConfigService.updateUser(userId, { vipContacts: clean });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ vipContacts: user?.vipContacts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update VIP contacts' });
  }
});

// ── Blocked Numbers ─────────────────────────────────────────────────────────

// GET /api/users/blocked-numbers
router.get('/blocked-numbers', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ blockedNumbers: user.blockedNumbers || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch blocked numbers' });
  }
});

// POST /api/users/blocked-numbers  — add a number to the block list
router.post('/blocked-numbers', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber to block is required' });

    const user = await userConfigService.addBlockedNumber(userId, phoneNumber.trim());
    res.json({ blockedNumbers: user?.blockedNumbers || [], message: 'Number blocked' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Failed to block number' });
  }
});

// DELETE /api/users/blocked-numbers/:phoneNumber  — unblock a number
router.delete('/blocked-numbers/:phoneNumber', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const phoneNumber = decodeURIComponent(req.params.phoneNumber);
    const user = await userConfigService.removeBlockedNumber(userId, phoneNumber);
    res.json({ blockedNumbers: user?.blockedNumbers || [], message: 'Number unblocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock number' });
  }
});

// ── Device Tokens ───────────────────────────────────────────────────────────

// POST /api/users/device-token
router.post('/device-token', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { token, platform } = req.body;
    if (!token || !['ios', 'android'].includes(platform)) return res.status(400).json({ error: 'token and platform (ios|android) required' });
    await userConfigService.addDeviceToken(userId, token, platform);
    res.json({ message: 'Device token registered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

// ── Priority Time / DND Mode ────────────────────────────────────────────────

// GET /api/users/priority-time
router.get('/priority-time', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ priorityTime: user.priorityTime || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch priority time settings' });
  }
});

// PUT /api/users/priority-time
router.put('/priority-time', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    
    const { enabled, timeSlots, recurring, timezone, message, emergencyContacts, quickToggleActive } = req.body;
    
    // Validate time format (HH:mm) for all time slots
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (timeSlots && Array.isArray(timeSlots)) {
      for (const slot of timeSlots) {
        if (slot.startTime && !timeRegex.test(slot.startTime)) {
          return res.status(400).json({ error: `Invalid startTime in slot: ${slot.startTime}. Must be in HH:mm format (24-hour)` });
        }
        if (slot.endTime && !timeRegex.test(slot.endTime)) {
          return res.status(400).json({ error: `Invalid endTime in slot: ${slot.endTime}. Must be in HH:mm format (24-hour)` });
        }
      }
    }
    
    // Validate days of week (0-6)
    if (recurring?.daysOfWeek && Array.isArray(recurring.daysOfWeek)) {
      const invalidDays = recurring.daysOfWeek.filter(day => day < 0 || day > 6);
      if (invalidDays.length > 0) {
        return res.status(400).json({ error: 'daysOfWeek must contain values between 0 (Sunday) and 6 (Saturday)' });
      }
    }
    
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const currentPriorityTime = user.priorityTime || {};
    
    const updatedUser = await userConfigService.updateUser(userId, {
      priorityTime: {
        enabled: enabled !== undefined ? enabled : currentPriorityTime.enabled || false,
        timeSlots: timeSlots || currentPriorityTime.timeSlots || [],
        recurring: recurring || currentPriorityTime.recurring || { enabled: false, daysOfWeek: [1, 2, 3, 4, 5], excludeDates: [] },
        timezone: timezone || currentPriorityTime.timezone || 'America/New_York',
        message: message !== undefined ? message : (currentPriorityTime.message || '{userName} is currently unavailable due to important work and cannot take calls. They will be available after {endTime}. Please leave your details and they will get back to you.'),
        emergencyContacts: emergencyContacts !== undefined ? emergencyContacts : (currentPriorityTime.emergencyContacts || []),
        quickToggleActive: quickToggleActive !== undefined ? quickToggleActive : (currentPriorityTime.quickToggleActive || false)
      }
    });
    
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json({ priorityTime: updatedUser.priorityTime, message: 'Priority time settings saved' });
  } catch (err) {
    console.error('Priority time update error:', err);
    res.status(500).json({ error: 'Failed to save priority time settings' });
  }
});

// POST /api/users/priority-time/quick-toggle
// Quick toggle priority time on/off without changing settings
router.post('/priority-time/quick-toggle', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const currentState = user.priorityTime?.quickToggleActive || false;
    const newState = !currentState;
    
    const updatedUser = await userConfigService.updateUser(userId, {
      'priorityTime.quickToggleActive': newState
    });
    
    res.json({ 
      quickToggleActive: newState,
      message: `Priority time ${newState ? 'activated' : 'deactivated'}` 
    });
  } catch (err) {
    console.error('Quick toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle priority time' });
  }
});

// POST /api/users/priority-time/add-slot
// Add a new time slot
router.post('/priority-time/add-slot', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    
    const { startTime, endTime, label } = req.body;
    
    // Validate time format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!startTime || !timeRegex.test(startTime)) {
      return res.status(400).json({ error: 'startTime is required and must be in HH:mm format (24-hour)' });
    }
    if (!endTime || !timeRegex.test(endTime)) {
      return res.status(400).json({ error: 'endTime is required and must be in HH:mm format (24-hour)' });
    }
    
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const currentSlots = user.priorityTime?.timeSlots || [];
    const newSlot = { startTime, endTime, label: label || '' };
    
    const updatedUser = await userConfigService.updateUser(userId, {
      'priorityTime.timeSlots': [...currentSlots, newSlot]
    });

    if (!updatedUser) return res.status(500).json({ error: 'Failed to update time slots' });
    res.json({ 
      timeSlots: updatedUser.priorityTime.timeSlots,
      message: 'Time slot added' 
    });
  } catch (err) {
    console.error('Add slot error:', err);
    res.status(500).json({ error: 'Failed to add time slot' });
  }
});

// DELETE /api/users/priority-time/remove-slot/:index
// Remove a time slot by index
router.delete('/priority-time/remove-slot/:index', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    
    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({ error: 'Invalid slot index' });
    }
    
    const user = await userConfigService.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const currentSlots = user.priorityTime?.timeSlots || [];
    if (index >= currentSlots.length) {
      return res.status(400).json({ error: 'Slot index out of range' });
    }
    
    const updatedSlots = currentSlots.filter((_, i) => i !== index);
    
    const updatedUser = await userConfigService.updateUser(userId, {
      'priorityTime.timeSlots': updatedSlots
    });
    
    res.json({ 
      timeSlots: updatedUser.priorityTime.timeSlots,
      message: 'Time slot removed' 
    });
  } catch (err) {
    console.error('Remove slot error:', err);
    res.status(500).json({ error: 'Failed to remove time slot' });
  }
});

export default router;

