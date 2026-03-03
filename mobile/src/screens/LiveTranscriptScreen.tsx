import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styles from '../styles/LiveTranscriptScreen.styles';
import socketService from '../services/socket';
import * as api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { SocketTranscriptEvent, SocketTranscriptDeltaEvent, SocketCallStartedEvent, SocketCallEndedEvent } from '../types/api';

type SpeakerType = 'ai' | 'caller' | 'user' | 'system';

type TranscriptLine = {
  speaker: SpeakerType;
  label: string;
  text: string;
  isStreaming?: boolean;
};

const SPEAKER_LABELS: Record<SpeakerType, string> = {
  ai: 'AI Assistant',
  caller: 'Caller',
  user: 'You',
  system: 'System',
};

const LiveTranscriptScreen = () => {
  const { colors, isDark } = useTheme();
  const { phoneNumber: userPhone } = useAuth();
  const [isCallActive, setIsCallActive] = useState(false);
  const [callerPhone, setCallerPhone] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Waiting for incoming call...');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [takingOver, setTakingOver] = useState(false);
  const [isTakenOver, setIsTakenOver] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // ─── Mock data preserved as comments ─────────────────────────────────────
  /*
  const [transcript] = useState<TranscriptLine[]>([
    { speaker: 'ai', label: 'AI Assistant', text: "Hello, this is Yash's AI assistant..." },
    { speaker: 'caller', label: 'Caller', text: "Hi, I'm at the main gate..." },
    { speaker: 'ai', label: 'AI Assistant', text: "I'll check with Yash. One moment..." },
    { speaker: 'system', label: 'System', text: '📲 You are joining the call now...' },
    { speaker: 'user', label: 'You', text: 'Hello, yes I can hear you.' },
  ]);
  */
  // ─────────────────────────────────────────────────────────────────────────

  /** Register socket listeners for live call events */
  useEffect(() => {
    const onCallStarted = (data: SocketCallStartedEvent) => {
      setIsCallActive(true);
      setIsTakenOver(false);
      setCallerPhone(data.from);
      setCallerName(data.callerName && data.callerName !== 'Unknown' ? data.callerName : null);
      setCallSid(data.callId);
      setStatusText('Call screening in progress...');
      setTranscript([]);
    };

    const onTranscript = (data: SocketTranscriptEvent & { speaker: SpeakerType }) => {
      const speaker: SpeakerType = (data.speaker as SpeakerType) || 'caller';
      const isAI = speaker === 'ai';
      setTranscript(prev => {
        // If last line is a streaming AI bubble, finalize it with this complete text
        if (isAI && prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.speaker === 'ai' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { speaker: 'ai', label: SPEAKER_LABELS.ai, text: data.text, isStreaming: false },
            ];
          }
        }
        return [
          ...prev,
          { speaker, label: SPEAKER_LABELS[speaker] ?? speaker, text: data.text, isStreaming: false },
        ];
      });
    };

    // Word-by-word streaming (AI only)
    const onDelta = (data: SocketTranscriptDeltaEvent) => {
      setTranscript(prev => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.speaker === 'ai' && last.isStreaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: data.fullText },
            ];
          }
        }
        return [
          ...prev,
          { speaker: 'ai', label: SPEAKER_LABELS.ai, text: data.fullText, isStreaming: true },
        ];
      });
    };

    const onCallerName = (data: any) => {
      if (data.callerName) {
        setCallerName(data.callerName);
      }
    };

    const onCallEnded = (_data: SocketCallEndedEvent) => {
      setIsCallActive(false);
      setStatusText('Call ended');
    };

    const onTakeover = (data: any) => {
      setIsTakenOver(true);
      if (data.reason === 'ai_transfer') {
        setStatusText('AI transferred the call — you are now connected');
      } else {
        setStatusText('You are now connected to the call');
      }
    };

    socketService.on('call:started', onCallStarted);
    socketService.on('call:transcript', onTranscript as any);
    socketService.on('call:transcript:delta', onDelta);
    socketService.on('call:caller-name', onCallerName);
    socketService.on('call:ended', onCallEnded);
    socketService.on('call:takeover', onTakeover);
    socketService.on('call:takeover-initiated', onTakeover);

    return () => {
      socketService.off('call:started', onCallStarted);
      socketService.off('call:transcript', onTranscript as any);
      socketService.off('call:transcript:delta', onDelta);
      socketService.off('call:caller-name', onCallerName);
      socketService.off('call:ended', onCallEnded);
      socketService.off('call:takeover', onTakeover);
      socketService.off('call:takeover-initiated', onTakeover);
    };
  }, []);

  /** Auto-scroll transcript */
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  /** Take over the live call — bridges the user's own phone into the conference */
  const handleTakeover = useCallback(async () => {
    if (!callSid) { return; }
    if (!userPhone) {
      Alert.alert('Error', 'Your phone number is not set. Please log in again.');
      return;
    }
    setTakingOver(true);
    try {
      await api.takeoverCall(callSid, userPhone);
      setIsTakenOver(true);
      setStatusText('Connecting you in — your phone will ring shortly...');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to take over call');
    } finally {
      setTakingOver(false);
    }
  }, [callSid, userPhone]);

  /** End / disconnect the live call */
  const handleDisconnect = useCallback(async () => {
    if (!callSid) { return; }
    setDisconnecting(true);
    try {
      await api.endCall(callSid);
      setIsCallActive(false);
      setStatusText('Call disconnected');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to end call');
    } finally {
      setDisconnecting(false);
    }
  }, [callSid]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Scrollable content */}
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={isCallActive ? styles.scrollContentWithFloating : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface }]}>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, !isCallActive && { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.liveText, { color: colors.textPrimary }]}>{isCallActive ? 'LIVE MONITORING' : 'IDLE'}</Text>
          </View>
          <Text style={[styles.callerName, { color: colors.textPrimary }]}>
            {callerName || callerPhone || 'No active call'}
          </Text>
          {callerName && callerPhone && (
            <Text style={{ color: colors.textTertiary, fontSize: 12, textAlign: 'center' }}>{callerPhone}</Text>
          )}
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>{statusText}</Text>
        </View>

        {/* Transcript */}
        <View style={[styles.transcriptContainer, { backgroundColor: colors.surface }]}>
          {transcript.map((line, idx) => {
            const isAI = line.speaker === 'ai';
            const isSystem = line.speaker === 'system';
            const isUser = line.speaker === 'user';

            if (isSystem) {
              return (
                <View key={idx} style={styles.systemMessageContainer}>
                  <Text style={[styles.systemMessageText, { color: colors.textTertiary }]}>{line.text}</Text>
                </View>
              );
            }

            return (
              <View key={idx} style={styles.messageContainer}>
                <Text style={[
                  styles.speakerLabel,
                  { color: isUser ? colors.accent : colors.textTertiary },
                ]}>
                  {line.label}
                </Text>
                <View
                  style={[
                    styles.messageBubble,
                    isAI
                      ? [styles.messageBubbleAI, { backgroundColor: isDark ? '#1A2744' : undefined }]
                      : isUser
                        ? [styles.messageBubbleUser, { backgroundColor: isDark ? '#1A3A1A' : '#E8F5E9' }]
                        : [styles.messageBubbleCaller, { backgroundColor: isDark ? '#2C2C2E' : undefined }],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isAI
                        ? styles.messageTextAI
                        : isUser
                          ? [styles.messageTextUser, { color: isDark ? '#A5D6A7' : '#2E7D32' }]
                          : [styles.messageTextCaller, { color: colors.textPrimary }],
                    ]}
                  >
                    {line.text}
                    {line.isStreaming && <Text style={{ color: colors.accent }}>▊</Text>}
                  </Text>
                </View>
              </View>
            );
          })}
          {transcript.length === 0 && isCallActive && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>
              Waiting for conversation...
            </Text>
          )}
          {!isCallActive && transcript.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 40 }}>
              No active call. Transcript will appear here when a call comes in.
            </Text>
          )}
        </View>

        {/* Bottom padding so content clears the floating button */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Floating sticky bottom buttons — shown when call is active ── */}
      {isCallActive && (
        <View style={[styles.floatingButtonBar, { backgroundColor: colors.surface }]}>
          {/* Disconnect */}
          <TouchableOpacity
            style={[styles.floatingActionButton, styles.disconnectButton]}
            onPress={handleDisconnect}
            disabled={disconnecting}
          >
            <Icon name="phone-hangup" size={20} color="#FF3B30" />
            <Text style={[styles.floatingActionText, styles.disconnectText]}>
              {disconnecting ? 'Ending...' : 'Disconnect'}
            </Text>
          </TouchableOpacity>

          {/* Takeover */}
          <TouchableOpacity
            style={[
              styles.floatingTakeoverButton,
              isTakenOver && styles.floatingTakeoverButtonActive,
              takingOver && { opacity: 0.6 },
            ]}
            onPress={isTakenOver ? undefined : handleTakeover}
            disabled={takingOver || isTakenOver}
            activeOpacity={isTakenOver ? 1 : 0.7}
          >
            <Icon name={isTakenOver ? 'phone-in-talk' : 'phone'} size={22} color="#fff" />
            <Text style={styles.floatingTakeoverText}>
              {takingOver ? 'CONNECTING...' : isTakenOver ? 'IN CALL' : 'TAKE OVER'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default LiveTranscriptScreen;
