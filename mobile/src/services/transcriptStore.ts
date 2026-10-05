/**
 * In-memory store for the active call: caller info + live transcript.
 *
 * App.tsx is the ONLY writer (it owns the global socket listeners), so lines
 * are never double-counted. Screens read a snapshot and subscribe() for
 * updates. Survives IncomingCallScreen unmounts (dismiss → re-open via the
 * home-screen widget).
 *
 * Every mutation except startCall() takes the callId and is ignored if it
 * doesn't match the tracked call, so late events from a previous call can't
 * corrupt the current one.
 */

import { LiveSpeaker } from '../types/api';

export type TranscriptLine = {
  id: string;
  speaker: LiveSpeaker;
  text: string;
  isStreaming: boolean;
};

export type ActiveCallMeta = {
  callId: string;
  callerNumber: string;
  callerName?: string;
  isVIP?: boolean;
  inPriorityTime?: boolean;
};

export type CallSnapshot = {
  callId: string | null;
  meta: ActiveCallMeta | null;
  lines: TranscriptLine[];
  ended: boolean;
};

let snapshot: CallSnapshot = { callId: null, meta: null, lines: [], ended: false };
const listeners = new Set<(s: CallSnapshot) => void>();
let lineSeq = 0;

function nextId(prefix: string) {
  lineSeq += 1;
  return `${prefix}-${Date.now()}-${lineSeq}`;
}

function update(patch: Partial<CallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) {
    l(snapshot);
  }
}

function isCurrent(callId: string) {
  return snapshot.callId !== null && snapshot.callId === callId;
}

/** Start (or update meta for) a call. Clears lines only when the call changes. */
export function startCall(meta: ActiveCallMeta) {
  if (snapshot.callId !== meta.callId) {
    update({ callId: meta.callId, meta, lines: [], ended: false });
  } else {
    update({ meta: { ...snapshot.meta, ...meta } });
  }
}

export function setCallerName(callId: string, callerName: string) {
  if (!isCurrent(callId) || !snapshot.meta) {
    return;
  }
  update({ meta: { ...snapshot.meta, callerName } });
}

/** Add a completed transcript line. */
export function addTranscript(callId: string, speaker: LiveSpeaker, text: string) {
  if (!isCurrent(callId)) {
    return;
  }
  const lines = snapshot.lines;
  const last = lines.length > 0 ? lines[lines.length - 1] : null;
  const lastIsStreamingAI = !!last && last.speaker === 'ai' && last.isStreaming;

  if (speaker === 'ai' && lastIsStreamingAI) {
    // Finalise the streaming bubble with the completed text
    update({ lines: [...lines.slice(0, -1), { ...last!, text, isStreaming: false }] });
    return;
  }

  const line: TranscriptLine = { id: nextId('line'), speaker, text, isStreaming: false };
  if (lastIsStreamingAI) {
    // A caller line arrived while the AI is still streaming — keep visual
    // order matching the real conversation by inserting before the stream.
    update({ lines: [...lines.slice(0, -1), line, last!] });
    return;
  }
  update({ lines: [...lines, line] });
}

/** Update the streaming (delta) text for the AI. */
export function updateDelta(callId: string, fullText: string) {
  if (!isCurrent(callId)) {
    return;
  }
  const lines = snapshot.lines;
  const last = lines.length > 0 ? lines[lines.length - 1] : null;
  if (last && last.speaker === 'ai' && last.isStreaming) {
    update({ lines: [...lines.slice(0, -1), { ...last, text: fullText }] });
    return;
  }
  update({ lines: [...lines, { id: nextId('stream'), speaker: 'ai', text: fullText, isStreaming: true }] });
}

/** Drop a dangling streaming bubble (barge-in cancelled the response). */
export function clearStreaming(callId: string) {
  if (!isCurrent(callId)) {
    return;
  }
  const lines = snapshot.lines;
  if (lines.length > 0 && lines[lines.length - 1].isStreaming) {
    update({ lines: lines.slice(0, -1) });
  }
}

/** Mark the call as ended and finalise any streaming bubble. Lines are kept. */
export function markEnded(callId: string) {
  if (!isCurrent(callId)) {
    return;
  }
  let lines = snapshot.lines;
  const last = lines.length > 0 ? lines[lines.length - 1] : null;
  if (last?.isStreaming) {
    lines = last.text.trim()
      ? [...lines.slice(0, -1), { ...last, isStreaming: false }]
      : lines.slice(0, -1);
  }
  update({ lines, ended: true });
}

/** Forget the call entirely (only if it's still the tracked one). */
export function clearCall(callId: string) {
  if (!isCurrent(callId)) {
    return;
  }
  update({ callId: null, meta: null, lines: [], ended: false });
}

/** Reset everything (logout). */
export function reset() {
  update({ callId: null, meta: null, lines: [], ended: false });
}

export function getSnapshot(): CallSnapshot {
  return snapshot;
}

/** Get the active (not yet ended) call ID, if any. */
export function getActiveCallId(): string | null {
  return snapshot.ended ? null : snapshot.callId;
}

export function subscribe(listener: (s: CallSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
