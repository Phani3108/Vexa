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

const SPEAKER_MAP = { assistant: 'ai', ai: 'ai', system: 'system', user: 'caller', caller: 'caller', user_owner: 'caller' };
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class CallHistoryService {
  isAvailable() {
    return isMongoConnected();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Context retrieval — used by PromptGenerator before each call
  // ─────────────────────────────────────────────────────────────────────────

  async getCallerContext(phoneNumber, userId, hintCategoryId = null) {
    if (!this.isAvailable() || !userId || !phoneNumber) return null;

    try {
      const base = { userId, isTest: { $ne: true } };
      const [caller, calls, totalCalls] = await Promise.all([
        Caller.findOne({ userId, phoneNumber }).lean(),
        Call.find({ ...base, phoneNumber }).sort({ createdAt: -1 }).limit(5).lean(),
        Call.countDocuments({ ...base, phoneNumber })
      ]);

      const categoryId = hintCategoryId || caller?.lastCategoryId || null;
      const categoryCalls = categoryId
        ? await Call.find({ ...base, 'analysis.categoryId': categoryId }).sort({ createdAt: -1 }).limit(5).lean()
        : [];

      return {
        phoneNumber,
        callerName: caller?.callerName || 'Unknown',
        organization: caller?.organization || null,
        relationship: caller?.relationship || null,
        lastCategoryId: caller?.lastCategoryId || null,
        lastCategoryLabel: caller?.lastCategoryLabel || null,
        contextSummary: caller?.contextSummary || null,
        tags: caller?.tags || [],
        notes: caller?.notes || null,
        instructions: caller?.instructions || [],
        alwaysTransfer: !!caller?.alwaysTransfer,
        spamCount: caller?.spamCount || 0,
        shortCalls: caller?.shortCalls || 0,
        totalCalls,
        lastCallAt: calls[0]?.createdAt || null,

        recentCalls: calls.map(c => ({
          callId: c.callId,
          date: c.createdAt,
          duration: c.duration,
          direction: c.direction,
          categoryId: c.analysis?.categoryId,
          categoryLabel: c.analysis?.categoryLabel,
          summary: c.analysis?.summary,
          actionTaken: c.analysis?.actionTaken
        })),

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
    const userId = callResult.userId;
    if (!userId) {
      console.error('❌ saveCall: missing userId — refusing to save an unowned call');
      return null;
    }

    try {
      const phoneNumber = callResult.from || callResult.phoneNumber || 'unknown';
      const lead = analysis?.lead || {};
      const needsFollowUp = !!(analysis?.actionRequired || lead.isLead) && !analysis?.isSpam;

      const call = await Call.create({
        callId: callResult.callId,
        userId,
        phoneNumber,
        direction: callResult.direction === 'outgoing' || callResult.direction === 'outbound' ? 'outgoing' : 'incoming',
        status: callResult.status || 'completed',
        duration: callResult.duration || 0,
        isTest: !!callResult.isTest,
        transcript: (callResult.transcripts || [])
          .filter(t => t.text && t.text.trim().length > 0)
          .map(t => ({
            speaker: SPEAKER_MAP[t.speaker] || 'caller',
            text: t.text.trim(),
            ...(t.lang ? { lang: t.lang } : {}),
            ...(t.textEn ? { textEn: String(t.textEn).trim() } : {}),
            timestamp: t.timestamp ? new Date(t.timestamp) : new Date()
          })),
        languages: callResult.languages || ['en'],
        ...(callResult.recording ? { recording: callResult.recording } : {}),
        analysis: analysis ? {
          categoryId: analysis.categoryId || analysis.intent || null,
          categoryLabel: analysis.categoryLabel || null,
          confidence: analysis.confidence || 0,
          summary: analysis.summary || '',
          sentiment: ['positive', 'neutral', 'negative'].includes(analysis.sentiment) ? analysis.sentiment : 'neutral',
          callerName: analysis.callerName || null,
          organization: analysis.organization || null,
          topic: analysis.topic || null,
          actionTaken: analysis.actionTaken || null,
          urgency: ['low', 'normal', 'high', 'critical'].includes(analysis.urgency) ? analysis.urgency : 'normal',
          actionRequired: !!analysis.actionRequired,
          actionItems: Array.isArray(analysis.actionItems) ? analysis.actionItems : [],
          isSpam: !!analysis.isSpam,
          ...(analysis.summaryLocal ? { summaryLocal: analysis.summaryLocal } : {}),
          lead: {
            isLead: !!lead.isLead,
            name: lead.name || analysis.callerName || null,
            callbackNumber: lead.callbackNumber || (phoneNumber !== 'unknown' ? phoneNumber : null),
            need: lead.need || null,
            preferredTime: lead.preferredTime || null,
            value: ['low', 'medium', 'high'].includes(lead.value) ? lead.value : null
          }
        } : {},
        followUp: { status: needsFollowUp ? 'new' : 'none', updatedAt: new Date() },
        takenOver: !!callResult.takenOver,
        ...(callResult.workflowRun ? { workflowRun: callResult.workflowRun } : {}),
        whispers: callResult.whispers || [],
        ...(callResult.aiUsage ? { aiUsage: callResult.aiUsage } : {}),
        startedAt: callResult.startTime ? new Date(callResult.startTime) : null,
        endedAt: callResult.endTime ? new Date(callResult.endTime) : new Date()
      });
      console.log(`💾 Saved call: ${phoneNumber} (${call.callId})`);

      // Test calls never pollute the caller memory used by the live agent
      if (!callResult.isTest && phoneNumber !== 'unknown') {
        await this._updateCallerProfile(userId, phoneNumber, analysis);
      }
      return call;
    } catch (err) {
      console.error('❌ saveCall:', err);
      return null;
    }
  }

  async _updateCallerProfile(userId, phoneNumber, analysis) {
    const existing = await Caller.findOne({ userId, phoneNumber }).lean();
    const $set = { lastCallAt: new Date() };

    // Don't overwrite a name the owner typed by hand with an AI guess
    if (analysis?.callerName && (!existing?.callerName || existing.callerName === 'Unknown' || !existing.nameLockedByUser)) {
      $set.callerName = analysis.callerName;
    }
    if (analysis?.organization) $set.organization = analysis.organization;
    if (analysis?.categoryId && analysis.categoryId !== 'no_conversation') {
      $set.lastCategoryId = analysis.categoryId;
      $set.lastCategoryLabel = analysis.categoryLabel || analysis.categoryId;
    }
    // Rolling narrative memory: newest summary first, older context trimmed
    if (analysis?.summary && analysis.categoryId !== 'no_conversation') {
      const previous = existing?.contextSummary ? ` Earlier: ${existing.contextSummary}` : '';
      $set.contextSummary = `${analysis.summary}${previous}`.slice(0, 600);
    }

    await Caller.findOneAndUpdate(
      { userId, phoneNumber },
      { $inc: { totalCalls: 1 }, $set },
      { upsert: true, new: true }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // History queries (used by /api/calls routes)
  // ─────────────────────────────────────────────────────────────────────────

  _toListItem(c) {
    return {
      callId: c.callId,
      from: c.phoneNumber,
      direction: c.direction,
      status: c.status,
      duration: c.duration,
      isTest: !!c.isTest,
      categoryId: c.analysis?.categoryId,
      categoryLabel: c.analysis?.categoryLabel,
      summary: c.analysis?.summary,
      callerName: c.analysis?.callerName,
      urgency: c.analysis?.urgency,
      sentiment: c.analysis?.sentiment,
      isSpam: !!c.analysis?.isSpam,
      lead: c.analysis?.lead?.isLead ? c.analysis.lead : null,
      followUp: c.followUp?.status || 'none',
      workflow: c.workflowRun?.workflowId ? {
        id: c.workflowRun.workflowId,
        name: c.workflowRun.workflowName,
        status: c.workflowRun.status,
        turns: c.workflowRun.turns,
        risk: c.workflowRun.risk?.score ?? null
      } : null,
      timestamp: c.createdAt
    };
  }

  /**
   * @param {object} filters { category, q, followUp, includeTest, leadsOnly }
   */
  async getAllCalls(userId, limit = 50, offset = 0, filters = {}) {
    if (!this.isAvailable() || !userId) return { calls: [], total: 0 };

    const filter = { userId };
    if (!filters.includeTest) filter.isTest = { $ne: true };
    if (filters.category) filter['analysis.categoryId'] = filters.category;
    if (filters.followUp) filter['followUp.status'] = filters.followUp === 'open' ? { $in: ['new', 'in_progress'] } : filters.followUp;
    if (filters.leadsOnly) filter['analysis.lead.isLead'] = true;
    if (filters.q) {
      const rx = new RegExp(escapeRegex(String(filters.q).slice(0, 100)), 'i');
      filter.$or = [{ phoneNumber: rx }, { 'analysis.summary': rx }, { 'analysis.callerName': rx }, { 'analysis.organization': rx }];
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    try {
      const [calls, total] = await Promise.all([
        Call.find(filter).sort({ createdAt: -1 }).skip(safeOffset).limit(safeLimit).lean(),
        Call.countDocuments(filter)
      ]);
      return { calls: calls.map(c => this._toListItem(c)), total };
    } catch (err) {
      console.error('❌ getAllCalls:', err);
      return { calls: [], total: 0 };
    }
  }

  async getCallById(callId, userId) {
    if (!this.isAvailable() || !userId) return null;
    return await Call.findOne({ callId, userId }).lean();
  }

  async updateFollowUp(callId, userId, { status, note }) {
    if (!this.isAvailable()) return null;
    const $set = { 'followUp.updatedAt': new Date() };
    if (status) $set['followUp.status'] = status;
    if (note !== undefined) $set['followUp.note'] = String(note).slice(0, 2000);
    return await Call.findOneAndUpdate({ callId, userId }, { $set }, { new: true, runValidators: true }).lean();
  }

  async deleteCall(callId, userId) {
    if (!this.isAvailable()) return false;
    const res = await Call.deleteOne({ callId, userId });
    return res.deletedCount > 0;
  }

  /**
   * Dashboard KPIs for the last `days` days (test calls excluded).
   */
  async getStats(userId, days = 7) {
    if (!this.isAvailable() || !userId) return null;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const match = { userId, isTest: { $ne: true }, createdAt: { $gte: since } };

    const [totals] = await Call.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          calls: { $sum: 1 },
          seconds: { $sum: '$duration' },
          leads: { $sum: { $cond: ['$analysis.lead.isLead', 1, 0] } },
          spam: { $sum: { $cond: ['$analysis.isSpam', 1, 0] } },
          urgent: { $sum: { $cond: [{ $in: ['$analysis.urgency', ['high', 'critical']] }, 1, 0] } },
          transferred: { $sum: { $cond: ['$takenOver', 1, 0] } }
        }
      }
    ]);

    const [byCategory, byDay, openFollowUps] = await Promise.all([
      Call.aggregate([
        { $match: match },
        { $group: { _id: { id: '$analysis.categoryId', label: '$analysis.categoryLabel' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      Call.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, leads: { $sum: { $cond: ['$analysis.lead.isLead', 1, 0] } } } },
        { $sort: { _id: 1 } }
      ]),
      Call.countDocuments({ userId, isTest: { $ne: true }, 'followUp.status': { $in: ['new', 'in_progress'] } })
    ]);

    const t = totals || { calls: 0, seconds: 0, leads: 0, spam: 0, urgent: 0, transferred: 0 };
    // Fill missing days so charts have a continuous axis
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const hit = byDay.find(x => x._id === d);
      series.push({ date: d, calls: hit?.count || 0, leads: hit?.leads || 0 });
    }

    return {
      rangeDays: days,
      calls: t.calls,
      leads: t.leads,
      spamBlocked: t.spam,
      urgent: t.urgent,
      transferred: t.transferred,
      openFollowUps,
      avgDurationSec: t.calls ? Math.round(t.seconds / t.calls) : 0,
      // Owner time saved: AI talk time + ~1 min context switch per call not taken
      minutesSaved: Math.round(t.seconds / 60 + t.calls),
      byCategory: byCategory.map(c => ({ categoryId: c._id.id || 'unknown', label: c._id.label || 'Uncategorized', count: c.count })),
      series
    };
  }

  async updateCallerProfile(phoneNumber, userId, updates) {
    if (!this.isAvailable() || !userId) return null;
    const allowed = Object.fromEntries(
      Object.entries(updates || {}).filter(([k]) => ['callerName', 'organization', 'relationship', 'notes', 'tags', 'alwaysTransfer', 'instructions'].includes(k))
    );
    if (allowed.callerName) allowed.nameLockedByUser = true;
    if ('alwaysTransfer' in allowed) allowed.alwaysTransfer = !!allowed.alwaysTransfer;
    if ('instructions' in allowed) {
      allowed.instructions = (Array.isArray(allowed.instructions) ? allowed.instructions : [])
        .filter(i => i && typeof i.text === 'string' && i.text.trim())
        .slice(0, 10)
        .map(i => ({ text: i.text.trim().slice(0, 300), once: i.once !== false, createdAt: i.createdAt ? new Date(i.createdAt) : new Date() }));
    }
    return await Caller.findOneAndUpdate(
      { userId, phoneNumber },
      { $set: allowed },
      { upsert: true, new: true }
    );
  }

  async listCallers(userId, limit = 100) {
    if (!this.isAvailable() || !userId) return [];
    return await Caller.find({ userId }).sort({ lastCallAt: -1 }).limit(limit).lean();
  }

  async getCallerHistory(phoneNumber, userId) {
    return this.getCallerContext(phoneNumber, userId);
  }

  async updateCallerName(phoneNumber, userId, callerName) {
    return this.updateCallerProfile(phoneNumber, userId, { callerName });
  }
}

export default new CallHistoryService();
