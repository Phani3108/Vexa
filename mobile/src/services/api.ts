/**
 * API Service — single source for all backend calls.
 *
 * Auth: every /api/* route (plus /voice/takeover, /voice/end-call and
 * /voice/outbound-call) requires `Authorization: Bearer <token>`. The token
 * pair comes from the OTP flow (POST /api/auth/otp/verify) and is refreshed
 * transparently on a 401 via POST /api/auth/refresh.
 *
 * The backend URL lives in src/config.ts.
 */

import { getBaseUrl, setBaseUrl } from '../config';
import {
  UserConfig,
  CallCategory,
  VIPContact,
  Call,
  PaginatedCalls,
  CallerContext,
  CallerProfile,
  PriorityTime,
  TimeSlot,
  AuthTokens,
  OtpRequestResponse,
  OtpVerifyResponse,
  UpdatableUserConfig,
} from '../types/api';

export { getBaseUrl, setBaseUrl };

// ─── Errors ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ─── Token management ───────────────────────────────────────────────────────

let _tokens: AuthTokens | null = null;
let _refreshPromise: Promise<AuthTokens> | null = null;

type TokensListener = (tokens: AuthTokens) => void;
type AuthFailureListener = () => void;

let _onTokensRefreshed: TokensListener | null = null;
let _onAuthFailure: AuthFailureListener | null = null;

/** Set (or clear with null) the tokens attached to every request. */
export function setAuthTokens(tokens: AuthTokens | null) {
  _tokens = tokens;
}

export function getAuthTokens(): AuthTokens | null {
  return _tokens;
}

/** Called after a successful silent refresh so the app can persist the new pair and reconnect the socket. */
export function setTokensRefreshedListener(fn: TokensListener | null) {
  _onTokensRefreshed = fn;
}

/** Called when the session can't be recovered (refresh token rejected) — the app should log out. */
export function setAuthFailureListener(fn: AuthFailureListener | null) {
  _onAuthFailure = fn;
}

/**
 * Exchange the refresh token for a new token pair. Concurrent callers share a
 * single in-flight request. Throws ApiError(401) if the refresh token is invalid.
 */
export function refreshSession(): Promise<AuthTokens> {
  if (_refreshPromise) {
    return _refreshPromise;
  }
  const current = _tokens;
  if (!current?.refreshToken) {
    return Promise.reject(new ApiError('Not authenticated', 401));
  }
  _refreshPromise = (async () => {
    try {
      const res = await request<{ token: string; refreshToken?: string }>(
        'POST',
        '/api/auth/refresh',
        { body: { refreshToken: current.refreshToken }, auth: false },
      );
      const next: AuthTokens = {
        token: res.token,
        // Server rotates the refresh token; fall back to the old one if it didn't.
        refreshToken: res.refreshToken || current.refreshToken,
      };
      // Only apply if the user didn't log out / log in again meanwhile.
      if (_tokens === current) {
        _tokens = next;
        _onTokensRefreshed?.(next);
      }
      return next;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (_tokens === current) {
          _tokens = null;
          _onAuthFailure?.();
        }
      }
      throw err;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

// ─── Core request helper ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  query?: Record<string, string>;
  body?: Record<string, any>;
  /** Attach the bearer token + refresh on 401 (default true). */
  auth?: boolean;
  timeoutMs?: number;
}

async function request<T>(
  method: Method,
  path: string,
  { query, body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const qs = query ? new URLSearchParams(query).toString() : '';
  const url = `${getBaseUrl()}${path}${qs ? `?${qs}` : ''}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const tokenUsed = auth ? _tokens?.token : undefined;
  if (tokenUsed) {
    headers.Authorization = `Bearer ${tokenUsed}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new ApiError(`${method} ${path} timed out`, 0);
    }
    throw new ApiError(err?.message || 'Network request failed', 0);
  }

  try {
    if (res.status === 401 && auth && !isRetry && _tokens?.refreshToken) {
      // Token expired — refresh once (unless someone already did) and retry.
      if (_tokens.token === tokenUsed) {
        await refreshSession();
      }
      return request<T>(method, path, { query, body, auth, timeoutMs }, true);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({} as any));
      const msg =
        typeof data?.error === 'string'
          ? data.error
          : data?.error?.message || data?.message || `${method} ${path} failed (${res.status})`;
      throw new ApiError(msg, res.status);
    }

    if (res.status === 204) {
      return {} as T;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auth (OTP) ─────────────────────────────────────────────────────────────

/** POST /api/auth/otp/request — send a one-time code to the phone. */
export async function requestOtp(phoneNumber: string): Promise<OtpRequestResponse> {
  return request('POST', '/api/auth/otp/request', { body: { phoneNumber }, auth: false });
}

/** POST /api/auth/otp/verify — exchange the code for a session. */
export async function verifyOtp(
  phoneNumber: string,
  code: string,
  name?: string,
): Promise<OtpVerifyResponse> {
  const body: Record<string, string> = { phoneNumber, code };
  if (name) {
    body.name = name;
  }
  return request('POST', '/api/auth/otp/verify', { body, auth: false });
}

// ─── User Config ────────────────────────────────────────────────────────────

/** GET /api/users/config */
export async function getUserConfig(): Promise<{ config: UserConfig }> {
  return request('GET', '/api/users/config');
}

const UPDATABLE_CONFIG_KEYS: (keyof UpdatableUserConfig)[] = [
  'name',
  'about',
  'businessProfile',
  'aiSettings',
  'deliveryAddress',
  'unknownCallerAction',
  'escalationKeywords',
  'accountType',
];

/**
 * PUT /api/users/config — only the whitelisted fields are accepted by the
 * server. VIP contacts, blocked numbers, priority time and categories have
 * their own endpoints below.
 */
export async function updateUserConfig(
  data: UpdatableUserConfig,
): Promise<{ config: UserConfig; message: string }> {
  const payload: Record<string, any> = {};
  for (const key of UPDATABLE_CONFIG_KEYS) {
    if (data[key] !== undefined) {
      payload[key] = data[key];
    }
  }
  return request('PUT', '/api/users/config', { body: payload });
}

// ─── Call Categories ────────────────────────────────────────────────────────

/** GET /api/users/categories */
export async function getCategories(): Promise<{ categories: CallCategory[] }> {
  return request('GET', '/api/users/categories');
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
  return request('POST', '/api/users/categories', { body: category });
}

/** PUT /api/users/categories/:categoryId — edit a category */
export async function updateCategory(
  categoryId: string,
  data: Partial<CallCategory>,
): Promise<{ categories: CallCategory[]; message: string }> {
  return request('PUT', `/api/users/categories/${encodeURIComponent(categoryId)}`, { body: data });
}

/** DELETE /api/users/categories/:categoryId */
export async function deleteCategory(
  categoryId: string,
): Promise<{ categories: CallCategory[]; message: string }> {
  return request('DELETE', `/api/users/categories/${encodeURIComponent(categoryId)}`);
}

// ─── VIP Contacts ───────────────────────────────────────────────────────────

/** GET /api/users/vip-contacts — fetch current VIP list */
export async function getVIPContacts(): Promise<{ vipContacts: VIPContact[] }> {
  return request('GET', '/api/users/vip-contacts');
}

/** PUT /api/users/vip-contacts — replace full VIP list */
export async function updateVIPContacts(
  vipContacts: VIPContact[],
): Promise<{ vipContacts: VIPContact[] }> {
  return request('PUT', '/api/users/vip-contacts', { body: { vipContacts } });
}

// ─── Blocked Numbers ────────────────────────────────────────────────────────

/** GET /api/users/blocked-numbers */
export async function getBlockedNumbers(): Promise<{ blockedNumbers: string[] }> {
  return request('GET', '/api/users/blocked-numbers');
}

/** POST /api/users/blocked-numbers — body.phoneNumber is the number to block (not identity) */
export async function addBlockedNumber(
  phoneNumber: string,
): Promise<{ blockedNumbers: string[]; message: string }> {
  return request('POST', '/api/users/blocked-numbers', { body: { phoneNumber } });
}

/** DELETE /api/users/blocked-numbers/:phoneNumber */
export async function removeBlockedNumber(
  phoneNumber: string,
): Promise<{ blockedNumbers: string[]; message: string }> {
  return request('DELETE', `/api/users/blocked-numbers/${encodeURIComponent(phoneNumber)}`);
}

// ─── Device Token ───────────────────────────────────────────────────────────

/** POST /api/users/device-token */
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<{ message: string }> {
  return request('POST', '/api/users/device-token', { body: { token, platform } });
}

// ─── Call History ───────────────────────────────────────────────────────────

/** GET /api/calls — paginated call history → { calls, total } */
export async function getCalls(limit = 50, offset = 0): Promise<PaginatedCalls> {
  return request('GET', '/api/calls', { query: { limit: String(limit), offset: String(offset) } });
}

/** GET /api/calls/:id — single call with full transcript */
export async function getCallById(callId: string): Promise<{ call: Call }> {
  return request('GET', `/api/calls/${encodeURIComponent(callId)}`);
}

/** GET /api/calls/caller/:phoneNumber — caller context */
export async function getCallerContext(phoneNumber: string): Promise<CallerContext> {
  return request('GET', `/api/calls/caller/${encodeURIComponent(phoneNumber)}`);
}

/** PATCH /api/calls/caller/:phoneNumber — update caller profile */
export async function updateCallerProfile(
  phoneNumber: string,
  data: Partial<CallerProfile>,
): Promise<{ caller: CallerProfile }> {
  return request('PATCH', `/api/calls/caller/${encodeURIComponent(phoneNumber)}`, { body: data });
}

// ─── Priority Time / DND Mode ───────────────────────────────────────────────

/** GET /api/users/priority-time */
export async function getPriorityTime(): Promise<{ priorityTime: Partial<PriorityTime> }> {
  return request('GET', '/api/users/priority-time');
}

/** PUT /api/users/priority-time */
export async function updatePriorityTime(
  data: Partial<PriorityTime>,
): Promise<{ priorityTime: PriorityTime; message: string }> {
  return request('PUT', '/api/users/priority-time', { body: data });
}

/** POST /api/users/priority-time/quick-toggle */
export async function quickTogglePriorityTime(): Promise<{ quickToggleActive: boolean; message: string }> {
  return request('POST', '/api/users/priority-time/quick-toggle', { body: {} });
}

/** POST /api/users/priority-time/add-slot */
export async function addTimeSlot(data: TimeSlot): Promise<{ timeSlots: TimeSlot[]; message: string }> {
  return request('POST', '/api/users/priority-time/add-slot', { body: data });
}

/** DELETE /api/users/priority-time/remove-slot/:index */
export async function removeTimeSlot(index: number): Promise<{ timeSlots: TimeSlot[]; message: string }> {
  return request('DELETE', `/api/users/priority-time/remove-slot/${index}`);
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
  return request('POST', '/voice/outbound-call', { body: data });
}

/**
 * POST /voice/takeover — bridge the user into an ongoing call.
 * The server rings the authenticated user's phone; pass `userPhoneNumber`
 * only to override which number gets dialled.
 */
export async function takeoverCall(
  callId: string,
  userPhoneNumber?: string,
): Promise<{ success: boolean; message: string; conferenceName?: string }> {
  const body: Record<string, string> = { callId };
  if (userPhoneNumber) {
    body.userPhoneNumber = userPhoneNumber;
  }
  return request('POST', '/voice/takeover', { body });
}

/** POST /voice/end-call — force-end a call */
export async function endCall(callId: string): Promise<{ success: boolean }> {
  return request('POST', '/voice/end-call', { body: { callId } });
}

/** GET /voice/status — active call stats */
export async function getVoiceStatus(): Promise<{
  status: string;
  activeCalls?: number;
  [key: string]: any;
}> {
  return request('GET', '/voice/status');
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  status: string;
  message: string;
  voiceEnabled: boolean;
}> {
  return request('GET', '/health', { auth: false });
}
