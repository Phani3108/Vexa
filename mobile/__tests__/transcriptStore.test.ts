import * as store from '../src/services/transcriptStore';

beforeEach(() => store.reset());

test('ignores events for other calls and inserts caller line before streaming AI', () => {
  store.startCall({ callId: 'A', callerNumber: '+911' });
  store.updateDelta('A', 'Hel');
  store.addTranscript('A', 'caller', 'Hi');
  store.addTranscript('B', 'caller', 'stray'); // different call → ignored
  store.addTranscript('A', 'ai', 'Hello there');

  const { lines } = store.getSnapshot();
  expect(lines.map(l => [l.speaker, l.text, l.isStreaming])).toEqual([
    ['caller', 'Hi', false],
    ['ai', 'Hello there', false],
  ]);
});

test('clearCall only clears the matching call (no race with a newer call)', () => {
  store.startCall({ callId: 'A', callerNumber: '+911' });
  store.markEnded('A');
  store.startCall({ callId: 'B', callerNumber: '+912' });
  store.clearCall('A'); // delayed cleanup for the old call
  expect(store.getSnapshot().callId).toBe('B');
  expect(store.getActiveCallId()).toBe('B');
});

test('markEnded drops an empty streaming bubble and notifies subscribers', () => {
  const seen: boolean[] = [];
  const unsub = store.subscribe(s => seen.push(s.ended));
  store.startCall({ callId: 'A', callerNumber: '+911' });
  store.updateDelta('A', '  ');
  store.markEnded('A');
  unsub();
  expect(store.getSnapshot().lines).toHaveLength(0);
  expect(seen[seen.length - 1]).toBe(true);
});
