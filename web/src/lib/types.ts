export type CategoryAction = 'follow_instructions' | 'take_message' | 'connect_user' | 'end_call' | 'ask_purpose'
export type FollowUpStatus = 'none' | 'new' | 'in_progress' | 'done'

export interface CallCategory {
  id: string
  label: string
  keywords: string[]
  action: CategoryAction
  instructions: string
  notify: boolean
  priority: number
}

export interface BusinessHours {
  day: number
  open: string
  close: string
  closed: boolean
}

export interface Faq {
  question: string
  answer: string
}

export interface BusinessProfile {
  businessName: string
  industry: string
  description: string
  website: string
  email: string
  bookingUrl: string
  address: string
  services: string[]
  faqs: Faq[]
  hours: BusinessHours[]
  timezone: string
  afterHoursMessage: string
  afterHoursEmergencyTransfer?: boolean
  transferNumber: string
  currency?: string
  directions?: string
  catalog?: CatalogItem[]
}

export interface CatalogItem {
  name: string
  stock: number
  price: number
  unit?: string
  aliases?: string[]
}

export interface AiUsage {
  requests: number
  model: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  avgLatencyMs: number
  byPurpose: Record<string, { requests: number; inputTokens: number; outputTokens: number; costUsd: number }>
}

export interface Handoff {
  callId: string
  kind: 'vip' | 'transfer'
  title: string
  detail: string
  callerName: string | null
  callerNumber: string
  facts: string[]
  isTest: boolean
  at: string
}

export interface VipContact {
  name: string
  phoneNumber: string
  relationship?: string
  notes?: string
}

export interface UserConfig {
  userId: string
  phoneNumber: string
  twilioNumber?: string
  accountType: 'personal' | 'business'
  onboardingCompleted: boolean
  name: string
  about: string
  businessProfile: BusinessProfile
  aiSettings: { voice?: string; tone?: string; greeting?: string; language?: string }
  recording?: { enabled?: boolean; announce?: boolean; retentionDays?: number }
  callCategories: CallCategory[]
  vipContacts: VipContact[]
  blockedNumbers: string[]
  escalationKeywords: string[]
  shield?: { mode: string; until?: string | null }
  deliveryAddress?: { flat?: string; building?: string; street?: string; city?: string; pincode?: string; landmark?: string; societyNotes?: string; securityNotes?: string }
  unknownCallerAction: 'screen' | 'take_message' | 'inform_unavailable'
}

export interface Lead {
  isLead: boolean
  name?: string | null
  callbackNumber?: string | null
  need?: string | null
  preferredTime?: string | null
  value?: 'low' | 'medium' | 'high' | null
}

export interface CallListItem {
  callId: string
  from: string
  direction: 'incoming' | 'outgoing'
  status: string
  duration: number
  isTest: boolean
  categoryId?: string
  categoryLabel?: string
  summary?: string
  callerName?: string | null
  urgency?: 'low' | 'normal' | 'high' | 'critical'
  sentiment?: string
  isSpam: boolean
  lead: Lead | null
  followUp: FollowUpStatus
  workflow: { id: string; name: string; status: string; turns: number; risk: number | null } | null
  timestamp: string
}

export interface TranscriptLine {
  speaker: 'caller' | 'ai' | 'system' | 'user'
  text: string
  lang?: string
  textEn?: string
  timestamp?: string
}

export interface Recording {
  durationSec: number
  sizeBytes: number
  channels: number
  sampleRate: number
  startedAt?: string
  source?: 'media-stream' | 'upload'
}

export interface CallDetail {
  callId: string
  phoneNumber: string
  direction: string
  status: string
  duration: number
  isTest: boolean
  takenOver: boolean
  transcript: TranscriptLine[]
  analysis: {
    categoryId?: string
    categoryLabel?: string
    summary?: string
    sentiment?: string
    callerName?: string | null
    organization?: string | null
    actionTaken?: string | null
    urgency?: string
    actionItems?: string[]
    isSpam?: boolean
    lead?: Lead
    summaryLocal?: { lang: string; text: string }
  }
  languages?: string[]
  recording?: Recording
  startedAt?: string
  followUp: { status: FollowUpStatus; note?: string; updatedAt?: string }
  workflowRun?: WorkflowRun
  whispers?: { text: string; at: string }[]
  aiUsage?: AiUsage
  createdAt: string
}

export interface Stats {
  rangeDays: number
  calls: number
  leads: number
  spamBlocked: number
  urgent: number
  transferred: number
  openFollowUps: number
  avgDurationSec: number
  minutesSaved: number
  byCategory: { categoryId: string; label: string; count: number }[]
  series: { date: string; calls: number; leads: number }[]
}

export interface Meta {
  voiceEnabled: boolean
  aiEnabled: boolean
  smsEnabled: boolean
  twilioNumber: string | null
  webhookUrl: string | null
  demoDataEnabled: boolean
  nluEnabled?: boolean
}

export interface CallerProfile {
  phoneNumber: string
  callerName: string
  organization?: string
  lastCategoryLabel?: string
  totalCalls: number
  lastCallAt?: string
  contextSummary?: string
  notes?: string
  tags?: string[]
  instructions?: { text: string; once: boolean; createdAt?: string }[]
  alwaysTransfer?: boolean
  spamCount?: number
}

// ── Flows ─────────────────────────────────────────────────
export type SlotType = 'text' | 'name' | 'phone' | 'email' | 'datetime' | 'yesno' | 'number' | 'choice' | 'company' | 'address'
export type StepType = 'collect' | 'confirm' | 'say' | 'branch' | 'action' | 'transfer' | 'end' | 'goto'

export interface FlowSlot {
  key: string
  label: string
  type: SlotType
  prompt: string
  reprompt?: string
  required?: boolean
  prefill?: 'caller_name' | 'caller_number'
  options?: { value: string; label?: string; synonyms?: string[] }[]
}

export interface FlowCondition {
  cond?: string
  slot?: string
  is?: unknown
  all?: FlowCondition[]
  any?: FlowCondition[]
}

export interface FlowStep {
  id: string
  type: StepType
  slot?: string
  text?: string
  recollect?: string[]
  when?: FlowCondition
  then?: string
  else?: string
  to?: string
  action?: string
  params?: Record<string, unknown>
}

export interface Workflow {
  id: string
  name: string
  description?: string
  icon?: string
  priority: number
  enabled: boolean
  builtIn?: boolean
  mode?: string
  maxTurns?: number
  trigger: { keywords?: string[]; categories?: string[]; isDefault?: boolean; cond?: string }
  slots: FlowSlot[]
  steps: FlowStep[]
}

export interface FlowStats {
  runs: number
  tests: number
  completed: number
  transferred: number
  avgTurns: number
  avgQuestions: number
  questionsSkipped: number
}

export interface Risk { score: number; level: string; reasons: string[] }

export interface WorkflowRun {
  workflowId?: string
  workflowName?: string
  status?: 'completed' | 'transferred' | 'abandoned'
  slots?: Record<string, string>
  slotLabels?: Record<string, string>
  turns?: number
  questionsAsked?: number
  slotsSkipped?: number
  durationMs?: number
  risk?: Risk
  actions?: { type: string; params?: Record<string, unknown>; result?: { status: string; detail?: string; body?: string } }[]
}

export interface Booking {
  _id: string
  callId?: string
  kind: 'new' | 'reschedule' | 'cancel'
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled'
  customerName?: string
  phoneNumber?: string
  service?: string
  requestedTime?: string
  confirmedTime?: string
  createdAt: string
}

export interface Brief {
  headline: string
  text: string
  stats: { calls: number; leads: number; spam: number; urgent: number; minutesSaved: number; questionsSkipped: number; bookingRequests: number }
  needsYou: { callId: string; name: string | null; from: string; summary?: string; at: string }[]
  shield: 'standard' | 'focus' | 'aggressive' | 'silent'
  shieldUntil: string | null
}

export interface TurnResult {
  reply: string
  replyEn?: string
  language?: string
  heard?: { language: string; translation: string | null } | null
  ended: boolean
  transferred: boolean
  asked: string | null
  workflow: { id: string; name: string } | null
  slots: Record<string, { label: string; value: string; source?: string }>
  progress: number
  mode: 'ai' | 'offline'
  latencyMs?: number
  aiAssisted?: boolean
  callId?: string
  pending?: boolean
  call?: { callId: string; analysis: CallDetail['analysis']; workflowRun?: WorkflowRun }
}
