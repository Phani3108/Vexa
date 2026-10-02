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

// ─── Business Profile (SME receptionist mode) ───────────────────────────────

export interface BusinessHours {
  day: number;            // 0 = Sunday … 6 = Saturday
  open: string;           // "HH:mm"
  close: string;          // "HH:mm"
  closed: boolean;
}

export interface BusinessFAQ {
  question: string;
  answer: string;
}

export interface BusinessProfile {
  businessName: string;
  industry: string;
  description: string;
  website: string;
  email: string;
  bookingUrl: string;
  address: string;
  services: string[];
  faqs: BusinessFAQ[];
  hours: BusinessHours[];
  afterHoursMessage: string;
  transferNumber: string;
}

export type AccountType = 'personal' | 'business';

// ─── User Config (from GET /api/users/config) ───────────────────────────────

export interface UserConfig {
  _id?: string;
  userId: string;
  name: string;
  about: string;
  phoneNumber?: string;
  twilioNumber?: string;
  accountType?: AccountType;
  onboardingCompleted?: boolean;
  businessProfile?: BusinessProfile;
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

/**
 * Fields accepted by PUT /api/users/config (server-side whitelist).
 * Everything else has a dedicated endpoint.
 */
export interface UpdatableUserConfig {
  name?: string;
  about?: string;
  businessProfile?: Partial<BusinessProfile>;
  aiSettings?: Partial<AISettings>;
  deliveryAddress?: Partial<DeliveryAddress>;
  unknownCallerAction?: UserConfig['unknownCallerAction'];
  escalationKeywords?: string[];
  accountType?: AccountType;
}

// ─── Auth (OTP) ─────────────────────────────────────────────────────────────

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  phoneNumber: string;
  name?: string;
  isNewUser?: boolean;
}

/** POST /api/auth/otp/request */
export interface OtpRequestResponse {
  sent: boolean;
  /** Only present when the backend runs in dev mode — may be used to prefill the code. */
  devCode?: string;
}

/** POST /api/auth/otp/verify */
export interface OtpVerifyResponse extends AuthTokens {
  user: AuthUser;
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

/** 'user' = the owner speaking after takeover, 'system' = status notes. */
export type LiveSpeaker = 'caller' | 'ai' | 'user' | 'system';

export interface SocketTranscriptEvent {
  callId: string;
  speaker: LiveSpeaker;
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
  inPriorityTime?: boolean;   // true when user is in priority/DND mode
  suppressNotification?: boolean; // true = AI handles silently, no ringing/notification
}

export interface SocketTranscriptClearEvent {
  callId: string;
  timestamp: string;
}

export interface SocketCallerNameEvent {
  callId: string;
  callerName: string;
  timestamp: string;
}

export interface SocketCallEndedEvent {
  callId: string;
  from?: string;
  duration: number;
  status?: string;
  transcriptCount?: number;
  summary?: string;
  timestamp?: string;
}

export interface SocketCallIntentEvent {
  callId: string;
  intent: string;
  confidence: number;
  timestamp: string;
}

export interface SocketCallTakeoverEvent {
  callId: string;
  callerName?: string;
  callerNumber?: string;
  reason: string;
  conferenceName?: string;
  timestamp: string;
}
