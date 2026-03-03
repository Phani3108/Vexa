/**
 * Call Model
 * Represents a phone call that was screened by AI
 */

export class Call {
  constructor(data) {
    this.id = data.id;
    this.userId = data.userId;
    this.callerPhoneNumber = data.callerPhoneNumber;
    this.callerName = data.callerName || 'Unknown';
    this.callerType = data.callerType; // 'contact', 'unknown', 'spam'
    this.status = data.status; // 'screened', 'escalated', 'rejected', 'missed'
    this.duration = data.duration || 0; // in seconds
    this.recordingUrl = data.recordingUrl || null;
    this.transcriptUrl = data.transcriptUrl || null;
    this.summary = data.summary || null;
    this.sentiment = data.sentiment || null; // 'positive', 'neutral', 'negative', 'urgent'
    this.isUrgent = data.isUrgent || false;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      callerPhoneNumber: this.callerPhoneNumber,
      callerName: this.callerName,
      callerType: this.callerType,
      status: this.status,
      duration: this.duration,
      recordingUrl: this.recordingUrl,
      transcriptUrl: this.transcriptUrl,
      summary: this.summary,
      sentiment: this.sentiment,
      isUrgent: this.isUrgent,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Call Summary Model
 * Structured summary of what happened in the call
 */
export class CallSummary {
  constructor(data) {
    this.callId = data.callId;
    this.who = data.who; // Who called
    this.why = data.why; // Reason for calling
    this.actionNeeded = data.actionNeeded; // What user should do
    this.keyPoints = data.keyPoints || []; // Array of important points
    this.urgencyLevel = data.urgencyLevel; // 'low', 'medium', 'high', 'critical'
  }
}

export default { Call, CallSummary };
