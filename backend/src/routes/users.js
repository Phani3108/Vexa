/**
 * User Routes — /api/users/*
 *
 * userId = the user's phone number (E.164)
 *
 * userId resolved from req.user.userId (set by auth middleware).
 */

import express from 'express';
import userConfigService from '../services/userConfigService.js';

const router = express.Router();

// Helper: resolve userId for any request
function resolveUserId(req) {
  return req.user?.userId || null;
}

// ── Setup (called once on first app login) ────────────────────────────────────
//
// Creates the user config, seeds default categories.
// Pass callCategories[] to override specific defaults.
// Safe to call again — acts as upsert.

// POST /api/users/setup
router.post('/setup', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'phoneNumber must be E.164 format: +919876543210' });
    }

    const config = await userConfigService.setupUser(phoneNumber, req.body);
    res.status(201).json({
      message: 'User setup complete',
      userId: config.userId,
      isNewUser: config.isNewUser,
      config
    });
  } catch (err) {
    console.error('❌ /setup error:', err);
    res.status(500).json({ error: err.message || 'Failed to setup user' });
  }
});

// ── Config ───────────────────────────────────────────────────────────────────

// GET /api/users/config
router.get('/config', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const config = await userConfigService.getUser(userId);
    if (!config) return res.status(404).json({ error: 'User not found. Call POST /api/users/setup first.' });
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user config' });
  }
});

// PUT /api/users/config  — update specific fields (not categories — use /categories endpoints)
router.put('/config', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const config = await userConfigService.updateUser(userId, req.body);
    if (!config) return res.status(404).json({ error: 'User not found. Call POST /api/users/setup first.' });
    res.json({ config, message: 'Saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save user config' });
  }
});

// ── Call Categories ─────────────────────────────────────────────────────────

// GET /api/users/categories
router.get('/categories', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const { id, label, keywords, action, instructions, notify, priority } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id and label are required' });

    const user = await userConfigService.addCategory(userId, {
      id, label,
      keywords:     keywords     || [],
      action:       action       || 'follow_instructions',
      instructions: instructions || '',
      notify:       notify       !== false,
      priority:     priority     || 5
    });
    res.json({ categories: user.callCategories, message: 'Category added' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add category' });
  }
});

// PUT /api/users/categories/:categoryId  — edit a category (or create if not yet present)
router.put('/categories/:categoryId', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const { vipContacts } = req.body;
    const user = await userConfigService.updateUser(userId, { vipContacts });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber to block is required' });

    const user = await userConfigService.addBlockedNumber(userId, phoneNumber);
    res.json({ blockedNumbers: user?.blockedNumbers || [], message: 'Number blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to block number' });
  }
});

// DELETE /api/users/blocked-numbers/:phoneNumber  — unblock a number
router.delete('/blocked-numbers/:phoneNumber', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    const { token, platform } = req.body;
    if (!token || !platform) return res.status(400).json({ error: 'token and platform required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    
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
    const currentPriorityTime = user.priorityTime || {};
    
    const updatedUser = await userConfigService.updateUser(userId, {
      priorityTime: {
        enabled: enabled !== undefined ? enabled : currentPriorityTime.enabled || false,
        timeSlots: timeSlots || currentPriorityTime.timeSlots || [],
        recurring: recurring || currentPriorityTime.recurring || { enabled: false, daysOfWeek: [1, 2, 3, 4, 5], excludeDates: [] },
        timezone: timezone || currentPriorityTime.timezone || 'Asia/Kolkata',
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    
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
    if (!userId) return res.status(400).json({ error: 'phoneNumber required' });
    
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

