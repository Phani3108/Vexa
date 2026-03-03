import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  // Extra bottom padding when floating bar is visible
  scrollContentWithFloating: {
    paddingBottom: 90,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  liveText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  callerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '400',
  },
  transcriptContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  messageContainer: {
    marginBottom: 20,
  },
  speakerLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 6,
    fontWeight: '400',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    maxWidth: '85%',
  },
  messageBubbleAI: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  messageBubbleCaller: {
    backgroundColor: '#E9E9EB',
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  // User (owner) who joined after takeover — right-aligned, green
  messageBubbleUser: {
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextAI: {
    color: '#FFFFFF',
  },
  messageTextCaller: {
    color: '#000000',
  },
  messageTextUser: {
    color: '#2E7D32',
  },
  // System messages (e.g. "You are joining the call...")
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  systemMessageText: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // ── Floating sticky bottom bar ─────────────────────────────────────────────
  floatingButtonBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24, // extra for home indicator
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    backgroundColor: '#F2F2F7',
  },
  floatingActionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  floatingTakeoverButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  floatingTakeoverButtonActive: {
    backgroundColor: '#007AFF',
  },
  floatingTakeoverText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // ── Legacy styles kept for any other consumers ─────────────────────────────
  suggestionsContainer: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  suggestionsButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  suggestionButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
  },
  actionsContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disconnectButton: {
    backgroundColor: '#FFE5E5',
  },
  actionButtonText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  disconnectText: {
    color: '#FF3B30',
  },
  takeoverButton: {
    flexDirection: 'row',
    backgroundColor: '#34C759',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  takeoverButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
