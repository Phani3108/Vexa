/**
 * TypeScript types matching the backend MongoDB models and API responses.
 * Backend is the source of truth.
 */

// ─── Call Category (from UserConfig.callCategories) ─────────────────────────

export interface CallCategory {
  id: string;                 // e.g. "delivery.food"
  label: string;              // e.g. "Food Delivery"
  keywords: string[];         // trigger words for AI detection
  action: 'follow_instructions' | 'take_message' | 'connect_user' | 'end_call' | 'ask_purpose';
  instructions: string;       // verbatim text injected into AI prompt
  notify: boolean;
  priority: number;           // 1 = highest, 10 = lowest
}

// ─── VIP Contact (from UserConfig.vipContacts) ──────────────────────────────

export interface VIPContact {
  name: string;
  phoneNumber: string;
  relationship?: string;
  notes?: string;
}

// ─── AI Settings ────────────────────────────────────────────────────────────

export interface AISettings {
  voice: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
  tone: string;
  language?: string;
  greeting?: string;
}

// ─── Delivery Address ───────────────────────────────────────────────────────

export interface DeliveryAddress {
  flat: string;
  building: string;
  landmark: string;
  street: string;
  city: string;
  pincode: string;
  societyNotes: string;
  securityNotes: string;
}

// ─── Priority Time / DND Mode ───────────────────────────────────────────────

export interface TimeSlot {
  startTime: string;      // Format: "HH:mm" (24-hour)
  endTime: string;        // Format: "HH:mm" (24-hour)
  label?: string;         // Optional label like "Morning Focus"
}

export interface RecurringSchedule {
  enabled: boolean;
  daysOfWeek: number[];   // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  excludeDates?: string[]; // ISO date strings (YYYY-MM-DD)
}

export interface EmergencyContact {
  name: string;
  phoneNumber: string;
  relationship?: string;
}

export interface PriorityTime {
  enabled: boolean;
  timeSlots: TimeSlot[];
  recurring: RecurringSchedule;
  timezone: string;       // e.g., "Asia/Kolkata"
  message: string;        // Custom message to tell callers
  emergencyContacts: EmergencyContact[];
  quickToggleActive: boolean;
}

// ─── User Config (from GET /api/users/config) ───────────────────────────────

export interface UserConfig {
  _id?: string;
  userId: string;
  name: string;
  about: string;
  phoneNumber?: string;
  twilioNumber?: string;
  deliveryAddress?: DeliveryAddress;
  aiSettings: AISettings;
  callCategories: CallCategory[];
  vipContacts: VIPContact[];
  blockedNumbers: string[];
  unknownCallerAction: 'screen' | 'take_message' | 'inform_unavailable';
  escalationKeywords: string[];
  priorityTime?: PriorityTime;
  deviceTokens?: { token: string; platform: 'ios' | 'android'; addedAt: string }[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Transcript Entry (from Call.transcript) ────────────────────────────────

export interface TranscriptEntry {
  speaker: 'caller' | 'ai';
  text: string;
  timestamp: string;
}

// ─── Call Analysis (from Call.analysis) ─────────────────────────────────────

export interface CallAnalysis {
  categoryId?: string;
  categoryLabel?: string;
  confidence: number;
  summary?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  callerName?: string;
  organization?: string;
  topic?: string;
  actionTaken?: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  actionRequired: boolean;
  actionItems: string[];
}

// ─── Call (from GET /api/calls) ─────────────────────────────────────────────

export interface Call {
  _id: string;
  callId: string;
  userId: string;
  phoneNumber: string;
  direction: 'incoming' | 'outgoing';
  status: 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'cancelled';
  duration: number;             // seconds
  transcript: TranscriptEntry[];
  analysis?: CallAnalysis;
  takenOver: boolean;
  takenOverAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Caller Profile (from GET /api/calls/caller/:phone) ────────────────────

export interface CallerProfile {
  phoneNumber: string;
  callerName: string;
  organization?: string;
  relationship?: string;
  lastCategoryId?: string;
  lastCategoryLabel?: string;
  totalCalls: number;
  lastCallAt?: string;
  contextSummary?: string;
  notes?: string;
  tags: string[];
}

// ─── Caller Context (response from GET /api/calls/caller/:phone) ────────────

export interface CallerContext {
  caller: CallerProfile;
  recentCalls: Call[];
  totalCalls: number;
  lastCategoryLabel?: string;
  callerName?: string;
}

// ─── Call List Item (flat shape from GET /api/calls) ────────────────────────

export interface CallListItem {
  callId: string;
  from: string;
  direction: 'incoming' | 'outgoing';
  status: 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'cancelled';
  duration: number;
  categoryId?: string;
  categoryLabel?: string;
  summary?: string;
  callerName?: string | null;
  timestamp: string;
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface PaginatedCalls {
  calls: CallListItem[];
  total: number;
}

export interface UserConfigResponse {
  config: UserConfig;
}

export interface CategoriesResponse {
  categories: CallCategory[];
  message?: string;
}

export interface CallDetailResponse {
  call: Call;
}

// ─── Socket.io Events (from backend) ────────────────────────────────────────

export interface SocketTranscriptEvent {
  callId: string;
  speaker: 'caller' | 'ai';
  text: string;
  timestamp: string;
}

export interface SocketTranscriptDeltaEvent {
  callId: string;
  speaker: 'ai';
  delta: string;
  fullText: string;
  timestamp: string;
}

export interface SocketCallStartedEvent {
  callId: string;
  from: string;
  to?: string;
  callerName?: string;
  timestamp: string;
  isVIP?: boolean;
}

export interface SocketCallEndedEvent {
  callId: string;
  duration: number;
  summary?: string;
  categoryId?: string;
  categoryLabel?: string;
}

export interface SocketCallIntentEvent {
  callId: string;
  categoryId: string;
  categoryLabel: string;
  confidence: number;
}

export interface SocketCallTakeoverEvent {
  callId: string;
  callerName?: string;
  callerNumber?: string;
  reason: string;
  conferenceName?: string;
  timestamp: string;
}
