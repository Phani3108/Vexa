/**
 * Simple in-memory transcript store.
 *
 * Accumulates transcript lines for the active call so they survive
 * IncomingCallScreen unmounts (dismiss → re-open via widget).
 */

export type TranscriptLine = {
  id: string;
  speaker: 'ai' | 'caller';
  text: string;
  isStreaming: boolean;
};

let lines: TranscriptLine[] = [];
let currentCallId: string | null = null;

/** Start tracking a new call — clears previous transcripts */
export function startCall(callId: string) {
  if (currentCallId !== callId) {
    lines = [];
    currentCallId = callId;
  }
}

/** Add a completed transcript line */
export function addTranscript(speaker: 'ai' | 'caller', text: string) {
  const lineId = `complete-${Date.now()}-${Math.random()}`;
  // If the last line is a streaming AI line, replace it
  if (speaker === 'ai' && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.speaker === 'ai' && last.isStreaming) {
      lines[lines.length - 1] = { id: lineId, speaker: 'ai', text, isStreaming: false };
      return [...lines];
    }
  }
  lines.push({ id: lineId, speaker, text, isStreaming: false });
  return [...lines];
}

/** Update streaming (delta) text for AI */
export function updateDelta(fullText: string) {
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (last.speaker === 'ai' && last.isStreaming) {
      lines[lines.length - 1] = { ...last, text: fullText };
      return [...lines];
    }
  }
  // Start a new streaming line
  lines.push({ id: `stream-${Date.now()}`, speaker: 'ai', text: fullText, isStreaming: true });
  return [...lines];
}

/** Clear everything on call end */
export function endCall() {
  lines = [];
  currentCallId = null;
}

/** Get a snapshot of current transcripts */
export function getTranscripts(): TranscriptLine[] {
  return [...lines];
}

/** Get the active call ID */
export function getActiveCallId(): string | null {
  return currentCallId;
}
