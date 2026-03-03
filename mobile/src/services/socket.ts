/**
 * Socket.io service — manages the real-time connection to the backend.
 *
 * Backend emits these events to `user:<userId>` rooms:
 *   call:started      — new call incoming
 *   call:transcript   — live transcript line
 *   call:intent       — detected caller intent / category
 *   call:ended        — call completed with summary
 *   call:takeover     — user joins call (conference bridge)
 *   call:takeover-initiated — takeover acknowledgement
 *   call:disconnecting      — call disconnect acknowledgement
 *
 * The mobile app should:
 *   1. connect()
 *   2. joinUserRoom(userId)
 *   3. Subscribe to events with on()
 */

import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api';
import {
  SocketTranscriptEvent,
  SocketTranscriptDeltaEvent,
  SocketCallStartedEvent,
  SocketCallEndedEvent,
  SocketCallIntentEvent,
  SocketCallTakeoverEvent,
} from '../types/api';

type EventMap = {
  'call:started': SocketCallStartedEvent;
  'call:transcript': SocketTranscriptEvent;
  'call:transcript:delta': SocketTranscriptDeltaEvent;
  'call:transcript:clear': { callId: string; timestamp: string };
  'call:intent': SocketCallIntentEvent;
  'call:ended': SocketCallEndedEvent;
  'call:takeover': SocketCallTakeoverEvent;
  'call:takeover-initiated': { callId: string; status: string; message: string };
  'call:disconnecting': { callId: string };
  'call:caller-name': { callId: string; callerName: string; timestamp: string };
};

class SocketService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  // pendingListeners: registered before the socket was ever created.
  private pendingListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  // activeListeners: persisted across socket recreations so they survive
  // destroy-and-reconnect (e.g. user retries login after a cold-start error).
  private activeListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  private _onAnyHandlers: Array<(event: string, ...args: any[]) => void> = [];

  /** Connect to the backend Socket.io server */
  connect() {
    // If already connected, just ensure we're in the room
    if (this.socket?.connected) {
      console.log('[Socket] Already connected:', this.socket.id);
      if (this.userId) {
        this.joinUserRoom(this.userId);
      }
      return;
    }

    // If socket exists but disconnected, destroy it fully before recreating
    if (this.socket) {
      console.log('[Socket] Destroying stale socket before reconnect');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    console.log('[Socket] Attempting connection to:', BASE_URL);

    this.socket = io(BASE_URL, {
      // Use polling only — the polling→websocket upgrade fails silently
      // in React Native / Hermes, causing events to never arrive.
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000,
      // Disable upgrade to websocket (stays on polling)
      upgrade: false,
    });

    // Catch-all: log every event the raw socket receives
    this.socket.onAny((event: string, ...args: any[]) => {
      console.log(`[Socket] 📨 RAW EVENT: ${event}`, JSON.stringify(args).slice(0, 200));
      for (const handler of this._onAnyHandlers) {
        try { handler(event, ...args); } catch (e) { /* ignore */ }
      }
    });

    // Re-attach all previously active listeners (survives socket destroy+recreate)
    for (const { event, handler } of this.activeListeners) {
      this.socket.on(event, handler);
    }
    if (this.activeListeners.length > 0) {
      console.log(`[Socket] Re-attached ${this.activeListeners.length} active listener(s)`);
    }

    // Replay any listeners that were registered before connect() was ever called
    for (const { event, handler } of this.pendingListeners) {
      // Only add if not already in activeListeners
      const alreadyActive = this.activeListeners.some(l => l.event === event && l.handler === handler);
      if (!alreadyActive) {
        this.socket.on(event, handler);
        this.activeListeners.push({ event, handler });
        console.log(`[Socket] Attached pending listener for "${event}"`);
      }
    }
    this.pendingListeners = [];

    this.socket.on('connect', () => {
      console.log('[Socket] ✅ Connected:', this.socket?.id,
        'Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      // Re-join user room on reconnect
      if (this.userId) {
        this.joinUserRoom(this.userId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });
  }

  /** Disconnect from the server */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.userId = null;
    // On explicit logout, wipe all listener state so a fresh login starts clean
    this.activeListeners = [];
    this.pendingListeners = [];
  }

  /** Join the user's personal room so we receive their call events */
  joinUserRoom(userId: string) {
    this.userId = userId;
    this.socket?.emit('join:user', userId);
    console.log('[Socket] Joined room for user:', userId);
  }

  /** Request call takeover via Socket.io */
  requestTakeover(callId: string, userId: string) {
    this.socket?.emit('call:takeover', { callId, userId });
  }

  /** Request call disconnect via Socket.io */
  requestDisconnect(callId: string, userId: string) {
    this.socket?.emit('call:disconnect', { callId, userId });
  }

  /** Subscribe to a specific event */
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void) {
    const ev = event as string;
    // Always persist in activeListeners so it survives socket destroy+recreate
    if (!this.activeListeners.some(l => l.event === ev && l.handler === handler)) {
      this.activeListeners.push({ event: ev, handler });
    }
    if (this.socket) {
      this.socket.on(ev, handler);
    } else {
      // Socket not connected yet — queue for replay on connect()
      if (!this.pendingListeners.some(l => l.event === ev && l.handler === handler)) {
        this.pendingListeners.push({ event: ev, handler });
        console.log(`[Socket] Queued listener for "${ev}" (socket not yet connected)`);
      }
    }
  }

  /** Unsubscribe from a specific event */
  off<K extends keyof EventMap>(event: K, handler?: (data: EventMap[K]) => void) {
    const ev = event as string;
    if (this.socket) {
      if (handler) {
        this.socket.off(ev, handler);
      } else {
        this.socket.off(ev);
      }
    }
    // Remove from both queues so it doesn't get re-attached on reconnect
    if (handler) {
      this.activeListeners = this.activeListeners.filter(
        (p) => !(p.event === ev && p.handler === handler),
      );
      this.pendingListeners = this.pendingListeners.filter(
        (p) => !(p.event === ev && p.handler === handler),
      );
    } else {
      this.activeListeners = this.activeListeners.filter((p) => p.event !== ev);
      this.pendingListeners = this.pendingListeners.filter((p) => p.event !== ev);
    }
  }

  /** Check if currently connected */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Register a catch-all listener for debugging */
  onAny(handler: (event: string, ...args: any[]) => void) {
    this._onAnyHandlers.push(handler);
  }

  /** Remove a catch-all listener */
  offAny(handler: (event: string, ...args: any[]) => void) {
    this._onAnyHandlers = this._onAnyHandlers.filter(h => h !== handler);
  }

  /** Debug info about the current socket state */
  get debugInfo(): { id: string | null; transport: string | null; userId: string | null } {
    return {
      id: this.socket?.id ?? null,
      transport: (this.socket as any)?.io?.engine?.transport?.name ?? null,
      userId: this.userId,
    };
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
