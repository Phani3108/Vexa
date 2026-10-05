/**
 * Socket.io service — manages the real-time connection to the backend.
 *
 * Auth: the access token is sent in the handshake (`io(url, { auth: { token } })`)
 * and the server joins the user's `user:<userId>` room automatically. When the
 * token is refreshed, call updateToken() to reconnect with the new one.
 *
 * Backend emits:
 *   call:started            — new call incoming
 *   call:transcript         — completed transcript line
 *   call:transcript:delta   — word-by-word AI streaming
 *   call:transcript:clear   — drop a dangling streaming bubble (barge-in)
 *   call:caller-name        — caller identified mid-call
 *   call:intent             — detected caller intent
 *   call:ended              — call completed with summary
 *   call:takeover           — user bridged into the call
 *
 * Listeners registered via on() persist across reconnects and logout/login;
 * the component that registers a listener is responsible for calling off().
 */

import { io, Socket } from 'socket.io-client';
import { getBaseUrl } from '../config';
import {
  SocketTranscriptEvent,
  SocketTranscriptDeltaEvent,
  SocketTranscriptClearEvent,
  SocketCallStartedEvent,
  SocketCallEndedEvent,
  SocketCallIntentEvent,
  SocketCallTakeoverEvent,
  SocketCallerNameEvent,
} from '../types/api';

type EventMap = {
  'call:started': SocketCallStartedEvent;
  'call:transcript': SocketTranscriptEvent;
  'call:transcript:delta': SocketTranscriptDeltaEvent;
  'call:transcript:clear': SocketTranscriptClearEvent;
  'call:caller-name': SocketCallerNameEvent;
  'call:intent': SocketCallIntentEvent;
  'call:ended': SocketCallEndedEvent;
  'call:takeover': SocketCallTakeoverEvent;
};

type Listener = { event: string; handler: (...args: any[]) => void };

class SocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private listeners: Listener[] = [];
  private onAnyHandlers: Array<(event: string, ...args: any[]) => void> = [];
  private authErrorHandler: (() => void) | null = null;

  /** Connect (or reconnect) with the given access token. */
  connect(token: string) {
    if (this.socket && this.token === token) {
      if (!this.socket.connected && !this.socket.active) {
        this.socket.connect();
      }
      return;
    }

    this.teardown();
    this.token = token;

    const url = getBaseUrl();
    console.log('[Socket] Connecting to:', url);

    const socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });
    this.socket = socket;

    socket.onAny((event: string, ...args: any[]) => {
      for (const handler of this.onAnyHandlers) {
        try {
          handler(event, ...args);
        } catch {
          // debugging hooks must never break event delivery
        }
      }
    });

    for (const { event, handler } of this.listeners) {
      socket.on(event, handler);
    }

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', reason => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', err => {
      console.warn('[Socket] Connection error:', err.message);
      // A middleware rejection (bad/expired token) stops auto-reconnect
      // (socket.active === false). Let the auth layer refresh the token.
      if (!socket.active && this.socket === socket) {
        this.authErrorHandler?.();
      }
    });
  }

  /** Reconnect with a refreshed token (no-op if not connected or unchanged). */
  updateToken(token: string) {
    if (!this.socket) {
      return;
    }
    if (token === this.token) {
      if (!this.socket.active) {
        this.socket.connect();
      }
      return;
    }
    this.token = token;
    this.socket.auth = { token };
    this.socket.disconnect().connect();
  }

  /** Retry the connection with the current token (e.g. after a failed refresh due to network). */
  reconnect() {
    if (this.socket && !this.socket.connected) {
      this.socket.connect();
    }
  }

  /** Disconnect on logout. Registered listeners are kept for the next session. */
  disconnect() {
    this.teardown();
    this.token = null;
  }

  /** Called when the server rejects the handshake — typically an expired token. */
  setAuthErrorHandler(handler: (() => void) | null) {
    this.authErrorHandler = handler;
  }

  /** Subscribe to a specific event */
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void) {
    const ev = event as string;
    if (this.listeners.some(l => l.event === ev && l.handler === handler)) {
      return;
    }
    this.listeners.push({ event: ev, handler });
    this.socket?.on(ev, handler);
  }

  /** Unsubscribe from a specific event (all handlers for it if none given) */
  off<K extends keyof EventMap>(event: K, handler?: (data: EventMap[K]) => void) {
    const ev = event as string;
    if (handler) {
      this.socket?.off(ev, handler);
      this.listeners = this.listeners.filter(l => !(l.event === ev && l.handler === handler));
    } else {
      for (const l of this.listeners) {
        if (l.event === ev) {
          this.socket?.off(ev, l.handler);
        }
      }
      this.listeners = this.listeners.filter(l => l.event !== ev);
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Register a catch-all listener for debugging */
  onAny(handler: (event: string, ...args: any[]) => void) {
    this.onAnyHandlers.push(handler);
  }

  offAny(handler: (event: string, ...args: any[]) => void) {
    this.onAnyHandlers = this.onAnyHandlers.filter(h => h !== handler);
  }

  get debugInfo(): { id: string | null; transport: string | null; connected: boolean } {
    return {
      id: this.socket?.id ?? null,
      transport: (this.socket as any)?.io?.engine?.transport?.name ?? null,
      connected: this.isConnected,
    };
  }

  private teardown() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.offAny();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
