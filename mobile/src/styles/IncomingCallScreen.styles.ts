import { StyleSheet } from 'react-native';

const IncomingCallScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  // ── Top bar ────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusPillEnded: {
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
  },
  statusDotPulse: {
    position: 'absolute',
    left: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  statusDotSolid: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },

  // ── Caller card ────────────────────────────────────────────────────────
  callerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarVIP: {
    backgroundColor: '#FF9500',
  },
  callerInfo: {
    flex: 1,
  },
  callerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  callerNumber: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  vipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9500',
  },

  // ── Transcript header ─────────────────────────────────────────────────
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 8,
    gap: 6,
  },
  transcriptHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Transcript section ─────────────────────────────────────────────────
  transcriptSection: {
    flex: 1,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  waitingText: {
    color: '#C7C7CC',
    textAlign: 'center',
    fontSize: 15,
  },
  bubbleRow: {
    marginBottom: 10,
  },
  bubbleRowAI: {
    alignItems: 'flex-start',
    paddingRight: 50,
  },
  bubbleRowCaller: {
    alignItems: 'flex-end',
    paddingLeft: 50,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleAI: {
    backgroundColor: '#EFF6FF',
    borderTopLeftRadius: 4,
  },
  bubbleCaller: {
    backgroundColor: '#F0FDF4',
    borderTopRightRadius: 4,
  },
  bubbleSpeaker: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 3,
  },
  bubbleSpeakerCaller: {
    color: '#34C759',
  },
  bubbleText: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 21,
  },
  bubbleTextCaller: {
    color: '#1C1C1E',
  },
  bubbleTextStreaming: {
    color: '#3C3C43',
  },
  cursor: {
    color: '#007AFF',
    fontSize: 14,
  },

  // ── Bottom action ─────────────────────────────────────────────────────
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  endedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  viewDetailsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  viewDetailsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  doneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E5EA',
    paddingVertical: 14,
    borderRadius: 24,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3A3A3C',
  },
});

export default IncomingCallScreenStyles;
