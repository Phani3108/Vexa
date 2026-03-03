/**
 * CallHistoryService
 *
 * Stores and retrieves call history from MongoDB.
 * Key feature: getCallerContext() returns three levels of context:
 *   1. Previous calls from this exact number (caller history)
 *   2. Previous calls in the same category (e.g. all "delivery.food" calls)
 *   3. Known caller profile (name, org, tags)
 */

import Call from '../models/mongodb/Call.js';
import Caller from '../models/mongodb/Caller.js';
import { isMongoConnected } from '../config/mongodb.js';

class CallHistoryService {
  constructor() {
    console.log('✅ CallHistoryService initialized');
  }

  isAvailable() {
    return isMongoConnected();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context retrieval — used by PromptGenerator before each call
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build full context for a phone number before a call starts.
   * Returns caller profile + recent call history + category history.
   *
   * @param {string} phoneNumber
   * @param {string} [hintCategoryId] - Optional: if we already know the likely
   *   category (e.g. from Caller.lastCategoryId), pre-fetch category context.
   */
  async getCallerContext(phoneNumber, hintCategoryId = null) {
    if (!this.isAvailable()) return null;

    try {
      const [caller, calls] = await Promise.all([
        Caller.findOne({ phoneNumber }).lean(),
        Call.find({ phoneNumber })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      ]);

      const categoryId = hintCategoryId || caller?.lastCategoryId || null;

      // Fetch similar-category calls (across all numbers, for AI context richness)
      let categoryCalls = [];
      if (categoryId) {
        categoryCalls = await Call.find({ 'analysis.categoryId': categoryId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
      }

      return {
        phoneNumber,

        // Caller profile
        callerName: caller?.callerName || 'Unknown',
        organization: caller?.organization || null,
        relationship: caller?.relationship || null,
        lastCategoryId: caller?.lastCategoryId || null,
        lastCategoryLabel: caller?.lastCategoryLabel || null,
        contextSummary: caller?.contextSummary || null,
        tags: caller?.tags || [],
        notes: caller?.notes || null,
        totalCalls: calls.length,
        lastCallAt: calls[0]?.createdAt || null,

        // Recent calls from this number (up to 5, latest first)
        recentCalls: calls.slice(0, 5).map(c => ({
          callId: c.callId,
          date: c.createdAt,
          duration: c.duration,
          direction: c.direction,
          categoryId: c.analysis?.categoryId,
          categoryLabel: c.analysis?.categoryLabel,
          summary: c.analysis?.summary,
          actionTaken: c.analysis?.actionTaken
        })),

        // Category context: what has happened in similar calls before
        // Helps the AI know things like "Swiggy usually delivers at 7pm"
        categoryContext: categoryCalls.map(c => ({
          date: c.createdAt,
          number: c.phoneNumber,
          summary: c.analysis?.summary,
          actionTaken: c.analysis?.actionTaken
        }))
      };
    } catch (err) {
      console.error('❌ getCallerContext:', err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Save call result after completion
  // ─────────────────────────────────────────────────────────────────────────

  async saveCall(callResult, analysis = null) {
    if (!this.isAvailable()) {
      console.warn('⚠️ MongoDB not connected - call not saved');
      return null;
    }

    try {
      const phoneNumber = callResult.from || callResult.phoneNumber;

      const call = new Call({
        callId: callResult.callId,
        userId: callResult.userId || process.env.OWNER_PHONE_NUMBER || 'default',
        phoneNumber,
        direction: callResult.direction || 'incoming',
        status: callResult.status || 'completed',
        duration: callResult.duration || 0,
        transcript: (callResult.transcripts || [])
          .filter(t => t.text && t.text.trim().length > 0)  // drop empty/interrupted fragments
          .map(t => ({
            speaker: t.speaker === 'assistant' ? 'ai' : 'caller',
            text: t.text.trim(),
            timestamp: t.timestamp ? new Date(t.timestamp) : new Date()
          })),
        analysis: analysis ? {
          categoryId: analysis.categoryId || analysis.intent || null,
          categoryLabel: analysis.categoryLabel || null,
          confidence: analysis.confidence || 0,
          summary: analysis.summary || '',
          sentiment: analysis.sentiment || 'neutral',
          callerName: analysis.callerName || null,
          organization: analysis.organization || null,
          topic: analysis.topic || null,
          actionTaken: analysis.actionTaken || null,
          urgency: analysis.urgency || 'normal',
          actionRequired: analysis.actionRequired || false,
          actionItems: analysis.actionItems || []
        } : {},
        startedAt: callResult.startTime ? new Date(callResult.startTime) : null,
        endedAt: callResult.endTime ? new Date(callResult.endTime) : new Date()
      });

      await call.save();
      console.log(`💾 Saved call: ${phoneNumber} (${call.callId})`);

      // Update caller profile
      const callerUpdate = {
        $inc: { totalCalls: 1 },
        $set: { lastCallAt: new Date() }
      };

      if (analysis?.callerName) {
        callerUpdate.$set.callerName = analysis.callerName;
        console.log(`   📛 Caller name learned/updated: "${analysis.callerName}" for ${phoneNumber}`);
      }
      if (analysis?.organization) callerUpdate.$set.organization = analysis.organization;
      if (analysis?.categoryId) {
        callerUpdate.$set.lastCategoryId = analysis.categoryId;
        callerUpdate.$set.lastCategoryLabel = analysis.categoryLabel || analysis.categoryId;
      }

      await Caller.findOneAndUpdate({ phoneNumber }, callerUpdate, { upsert: true, new: true });

      return call;
    } catch (err) {
      console.error('❌ saveCall:', err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // General history queries (used by /api/calls routes)
  // ─────────────────────────────────────────────────────────────────────────

  async getAllCalls(limit = 50, offset = 0) {
    if (!this.isAvailable()) return { calls: [], total: 0 };

    try {
      const [calls, total] = await Promise.all([
        Call.find().sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
        Call.countDocuments()
      ]);

      return {
        calls: calls.map(c => ({
          callId: c.callId,
          from: c.phoneNumber,
          direction: c.direction,
          status: c.status,
          duration: c.duration,
          categoryId: c.analysis?.categoryId,
          categoryLabel: c.analysis?.categoryLabel,
          summary: c.analysis?.summary,
          callerName: c.analysis?.callerName,
          timestamp: c.createdAt
        })),
        total
      };
    } catch (err) {
      console.error('❌ getAllCalls:', err);
      return { calls: [], total: 0 };
    }
  }

  async getCallById(callId) {
    if (!this.isAvailable()) return null;
    try {
      return await Call.findOne({ callId }).lean();
    } catch (err) {
      console.error('❌ getCallById:', err);
      return null;
    }
  }

  async updateCallerProfile(phoneNumber, updates) {
    if (!this.isAvailable()) return null;
    try {
      return await Caller.findOneAndUpdate(
        { phoneNumber },
        { $set: { ...updates, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('❌ updateCallerProfile:', err);
      return null;
    }
  }

  // Legacy alias kept so nothing else breaks
  async getCallerHistory(phoneNumber) {
    return this.getCallerContext(phoneNumber);
  }

  async updateCallerName(phoneNumber, callerName) {
    return this.updateCallerProfile(phoneNumber, { callerName });
  }
}

export default new CallHistoryService();
