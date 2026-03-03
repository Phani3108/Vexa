/**
 * API Service — single source for all backend calls.
 *
 * Backend base URL is configured here. In dev mode the backend identifies
 * the user by `phoneNumber` sent in the body or query string (no JWT needed).
 *
 * Every function mirrors a real backend endpoint — see backend/CURLS.md.
 */

import {
  UserConfig,
  CallCategory,
  VIPContact,
  Call,
  CallListItem,
  PaginatedCalls,
  CallerContext,
  CallerProfile,
  PriorityTime,
} from '../types/api';

// ─── Config ─────────────────────────────────────────────────────────────────

// Always use the deployed Render backend — Twilio and Socket.io events both come from here.
export const BASE_URL = 'YOUR_BACKEND_URL_HERE';

let _phoneNumber: string | null = null;

/** Call once after login / setup so every subsequent request includes identity */
export function setPhoneNumber(phone: string) {
  _phoneNumber = phone;
}

export function getPhoneNumber(): string | null {
  return _phoneNumber;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function get<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(queryParams);
  if (_phoneNumber) {
    params.set('phoneNumber', _phoneNumber);
  }
  const qs = params.toString();
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof body.error === 'string' ? body.error : body.error?.message || `GET ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

async function post<T>(path: string, body?: Record<string, any>): Promise<T> {
  const payload = { ...body };
  if (_phoneNumber && !payload.phoneNumber) {
    payload.phoneNumber = _phoneNumber;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || `POST ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

async function put<T>(path: string, body?: Record<string, any>): Promise<T> {
  const payload = { ...body };
  if (_phoneNumber && !payload.phoneNumber) {
    payload.phoneNumber = _phoneNumber;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || `PUT ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

async function patch<T>(path: string, body?: Record<string, any>): Promise<T> {
  const payload = { ...body };
  if (_phoneNumber && !payload.phoneNumber) {
    payload.phoneNumber = _phoneNumber;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || `PATCH ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

async function del<T>(path: string, body?: Record<string, any>): Promise<T> {
  const payload = { ...body };
  if (_phoneNumber && !payload.phoneNumber) {
    payload.phoneNumber = _phoneNumber;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || `DELETE ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

// ─── User Setup & Config ────────────────────────────────────────────────────

/** POST /api/users/setup — create / update user, seeds default categories */
export async function setupUser(data: {
  phoneNumber: string;
  name?: string;
  about?: string;
  aiSettings?: Partial<UserConfig['aiSettings']>;
  unknownCallerAction?: string;
  escalationKeywords?: string[];
  callCategories?: Partial<CallCategory>[];
}): Promise<{ message: string; userId: string; isNewUser: boolean; config: UserConfig }> {
  return post('/api/users/setup', data);
}

/** GET /api/users/config */
export async function getUserConfig(): Promise<{ config: UserConfig }> {
  return get('/api/users/config');
}

/** PUT /api/users/config — update fields (NOT categories) */
export async function updateUserConfig(data: {
  name?: string;
  about?: string;
  aiSettings?: Partial<UserConfig['aiSettings']>;
  unknownCallerAction?: string;
  escalationKeywords?: string[];
  deliveryAddress?: Partial<UserConfig['deliveryAddress']>;
}): Promise<{ config: UserConfig; message: string }> {
  return put('/api/users/config', data);
}

// ─── Call Categories ────────────────────────────────────────────────────────

/** GET /api/users/categories */
export async function getCategories(): Promise<{ categories: CallCategory[] }> {
  return get('/api/users/categories');
}

/** POST /api/users/categories — add a new category */
export async function addCategory(category: {
  id: string;
  label: string;
  keywords?: string[];
  action?: CallCategory['action'];
  instructions?: string;
  notify?: boolean;
  priority?: number;
}): Promise<{ categories: CallCategory[]; message: string }> {
  return post('/api/users/categories', category);
}

/** PUT /api/users/categories/:categoryId — edit a category */
export async function updateCategory(
  categoryId: string,
  data: Partial<CallCategory>,
): Promise<{ categories: CallCategory[]; message: string }> {
  return put(`/api/users/categories/${encodeURIComponent(categoryId)}`, data);
}

/** DELETE /api/users/categories/:categoryId */
export async function deleteCategory(
  categoryId: string,
): Promise<{ categories: CallCategory[]; message: string }> {
  return del(`/api/users/categories/${encodeURIComponent(categoryId)}`);
}

// ─── VIP Contacts ───────────────────────────────────────────────────────────

/** PUT /api/users/vip-contacts — replace full VIP list */
export async function updateVIPContacts(
  vipContacts: VIPContact[],
): Promise<{ vipContacts: VIPContact[] }> {
  return put('/api/users/vip-contacts', { vipContacts });
}

// ─── Device Token ───────────────────────────────────────────────────────────

/** POST /api/users/device-token */
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<{ message: string }> {
  return post('/api/users/device-token', { token, platform });
}

// ─── Call History ───────────────────────────────────────────────────────────

/** GET /api/calls — paginated call history */
export async function getCalls(
  limit = 50,
  offset = 0,
): Promise<PaginatedCalls> {
  return get('/api/calls', { limit: String(limit), offset: String(offset) });
}

/** GET /api/calls/:id — single call with full transcript */
export async function getCallById(callId: string): Promise<{ call: Call }> {
  return get(`/api/calls/${encodeURIComponent(callId)}`);
}

/** GET /api/calls/caller/:phoneNumber — caller context */
export async function getCallerContext(
  phoneNumber: string,
): Promise<CallerContext> {
  return get(`/api/calls/caller/${encodeURIComponent(phoneNumber)}`);
}

/** PATCH /api/calls/caller/:phoneNumber — update caller profile */
export async function updateCallerProfile(
  phoneNumber: string,
  data: Partial<CallerProfile>,
): Promise<{ caller: CallerProfile }> {
  return patch(`/api/calls/caller/${encodeURIComponent(phoneNumber)}`, data);
}

// ─── Priority Time / DND Mode ───────────────────────────────────────────────

/** GET /api/users/priority-time */
export async function getPriorityTime(): Promise<{ priorityTime: PriorityTime }> {
  return get('/api/users/priority-time');
}

/** PUT /api/users/priority-time */
export async function updatePriorityTime(data: Partial<PriorityTime>): Promise<{ priorityTime: PriorityTime; message: string }> {
  return put('/api/users/priority-time', data);
}

/** POST /api/users/priority-time/quick-toggle */
export async function quickTogglePriorityTime(): Promise<{ quickToggleActive: boolean; message: string }> {
  return post('/api/users/priority-time/quick-toggle', {});
}

/** POST /api/users/priority-time/add-slot */
export async function addTimeSlot(data: {
  startTime: string;
  endTime: string;
  label?: string;
}): Promise<{ timeSlots: any[]; message: string }> {
  return post('/api/users/priority-time/add-slot', data);
}

/** DELETE /api/users/priority-time/remove-slot/:index */
export async function removeTimeSlot(index: number): Promise<{ timeSlots: any[]; message: string }> {
  return del(`/api/users/priority-time/remove-slot/${index}`);
}


// ─── Voice ──────────────────────────────────────────────────────────────────

/** POST /voice/outbound-call — trigger an outbound AI call */
export async function makeOutboundCall(data: {
  to: string;
  callerName?: string;
  context?: string;
  greeting?: string;
}): Promise<{
  success: boolean;
  callSid: string;
  to: string;
  from: string;
  callerName: string;
  previousCalls: number;
  lastCategory: string | null;
}> {
  return post('/voice/outbound-call', data);
}

/** POST /voice/takeover — join an ongoing call */
export async function takeoverCall(
  callId: string,
  userPhoneNumber: string,
): Promise<{ success: boolean; message: string; conferenceName?: string }> {
  return post('/voice/takeover', { callId, userPhoneNumber });
}

/** POST /voice/end-call — force-end a call */
export async function endCall(
  callId: string,
): Promise<{ success: boolean }> {
  return post('/voice/end-call', { callId });
}

/** GET /voice/status — active call stats */
export async function getVoiceStatus(): Promise<{
  status: string;
  activeCalls?: number;
  [key: string]: any;
}> {
  return get('/voice/status');
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  status: string;
  message: string;
  voiceEnabled: boolean;
}> {
  return get('/health');
}

export function getBaseUrl() { return BASE_URL; }
