/**
 * IncomingCallScreen — shown automatically when a call:started event fires.
 *
 * Displays caller info and live word-by-word transcripts.
 * Dismiss hides the screen but the call-in-progress banner in App.tsx
 * lets the user return at any time.
 *
 * Transcripts stream in real-time:
 *   - call:transcript       → completed utterance (caller or AI)
 *   - call:transcript:delta → word-by-word streaming as AI speaks
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styles from '../styles/IncomingCallScreen.styles';
import { useTheme } from '../contexts/ThemeContext';
import socketService from '../services/socket';
import * as transcriptStore from '../services/transcriptStore';
import {
  SocketCallEndedEvent,
  SocketTranscriptEvent,
  SocketTranscriptDeltaEvent,
} from '../types/api';

interface RouteParams {
  callId: string;
  callerNumber: string;
  callerName?: string;
  isVIP?: boolean;
}

type TranscriptLine = {
  id: string;
  speaker: 'ai' | 'caller';
  text: string;
  isStreaming: boolean;
};

const IncomingCallScreen = ({ route, navigation }: any) => {
  const { callId, callerNumber, callerName, isVIP } = (route.params || {}) as RouteParams;
  const { colors, isDark } = useTheme();

  // Initialize from the shared store so transcripts survive dismiss/re-open
  const [transcript, setTranscript] = useState<TranscriptLine[]>(() => transcriptStore.getTranscripts());
  const [callEnded, setCallEnded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Pulse animation for the live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (callEnded) return;
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [callEnded, pulseAnim, pulseOpacity]);

  // Socket listeners for transcripts
  useEffect(() => {
    const onTranscript = (data: SocketTranscriptEvent) => {
      if (data.callId !== callId) return;
      const speaker: 'ai' | 'caller' = data.speaker === 'ai' ? 'ai' : 'caller';
      const isAI = speaker === 'ai';
      // Sync to store so dismiss→reopen preserves history
      transcriptStore.addTranscript(speaker, data.text);
      setTranscript(prev => {
        const last = prev.length > 0 ? prev[prev.length - 1] : null;
        const lastIsStreamingAI = last?.speaker === 'ai' && last?.isStreaming;

        if (isAI && lastIsStreamingAI) {
          // Finalise the streaming AI bubble with the completed text
          return [
            ...prev.slice(0, -1),
            { id: last!.id, speaker: 'ai', text: data.text, isStreaming: false },
          ];
        }

        if (!isAI && lastIsStreamingAI) {
          // Caller line arrived while AI is still streaming.
          // Insert the caller line BEFORE the streaming AI bubble so the
          // visual order matches the real conversation order.
          return [
            ...prev.slice(0, -1),
            {
              id: `complete-${Date.now()}-${Math.random()}`,
              speaker,
              text: data.text,
              isStreaming: false,
            },
            last!,
          ];
        }

        return [
          ...prev,
          {
            id: `complete-${Date.now()}-${Math.random()}`,
            speaker,
            text: data.text,
            isStreaming: false,
          },
        ];
      });
    };

    const onDelta = (data: SocketTranscriptDeltaEvent) => {
      if (data.callId !== callId) return;
      // Sync to store so dismiss→reopen shows latest delta
      transcriptStore.updateDelta(data.fullText);
      setTranscript(prev => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.speaker === 'ai' && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, text: data.fullText }];
          }
        }
        return [
          ...prev,
          {
            id: `stream-${Date.now()}`,
            speaker: 'ai' as const,
            text: data.fullText,
            isStreaming: true,
          },
        ];
      });
    };

    const onEnded = (_data: SocketCallEndedEvent) => {
      // Finalize any still-streaming AI bubble so it doesn't stay as a ghost
      setTranscript(prev => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.isStreaming) {
            if (!last.text.trim()) return prev.slice(0, -1);
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
        }
        return prev;
      });
      setCallEnded(true);
    };

    // Drop dangling streaming bubble when barge-in cancels a response
    const onTranscriptClear = (data: any) => {
      if (data.callId !== callId) return;
      setTranscript(prev => {
        if (prev.length > 0 && prev[prev.length - 1].isStreaming) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    };

    socketService.on('call:transcript', onTranscript);
    socketService.on('call:transcript:delta', onDelta);
    socketService.on('call:transcript:clear', onTranscriptClear);
    socketService.on('call:ended', onEnded);

    return () => {
      socketService.off('call:transcript', onTranscript);
      socketService.off('call:transcript:delta', onDelta);
      socketService.off('call:transcript:clear', onTranscriptClear);
      socketService.off('call:ended', onEnded);
    };
  }, [callId]);

  // Auto-scroll on new transcript
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [transcript]);

  // ── Auto-dismiss timer (5s after call ends, resets on interaction) ────
  const DISMISS_SECONDS = 5;
  const [countdown, setCountdown] = useState(DISMISS_SECONDS);
  const countdownRef = useRef(DISMISS_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startDismissTimer = useCallback(() => {
    clearTimer();
    countdownRef.current = DISMISS_SECONDS;
    setCountdown(DISMISS_SECONDS);
    intervalRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        // small delay so user sees 100% fill before dismiss
        setTimeout(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.replace('Main');
          }
        }, 200);
      }
    }, 1000);
  }, [clearTimer, navigation]);

  const resetDismissTimer = useCallback(() => {
    if (!callEnded) return;
    startDismissTimer();
  }, [callEnded, startDismissTimer]);

  // Start the timer when call ends
  useEffect(() => {
    if (!callEnded) return;
    startDismissTimer();
    return () => { clearTimer(); };
  }, [callEnded, startDismissTimer, clearTimer]);

  const handleDismiss = () => {
    clearTimer();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  const handleViewDetails = () => {
    clearTimer();
    if (navigation.canGoBack()) navigation.goBack();
    setTimeout(() => {
      navigation.navigate('CallDetail', { callId });
    }, 100);
  };

  // Any scroll / touch resets the auto-dismiss timer
  const handleUserInteraction = () => {
    resetDismissTimer();
  };

  const displayName = callerName || callerNumber || 'Unknown Caller';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} onTouchStart={callEnded ? handleUserInteraction : undefined}>
      {/* Top bar — close button + status */}
      <View style={styles.topBar}>
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={handleDismiss}>
          <Icon name="chevron-down" size={24} color={colors.textTertiary} />
        </TouchableOpacity>
        <View style={[styles.statusPill, callEnded && styles.statusPillEnded]}>
          {!callEnded && (
            <Animated.View
              style={[
                styles.statusDotPulse,
                { transform: [{ scale: pulseAnim }], opacity: pulseOpacity },
              ]}
            />
          )}
          <View style={[styles.statusDotSolid, callEnded && { backgroundColor: '#8E8E93' }]} />
          <Text style={[styles.statusLabel, callEnded && { color: '#8E8E93' }]}>
            {callEnded ? 'Call Ended' : 'AI Screening'}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Caller info card */}
      <View style={[styles.callerCard, { backgroundColor: colors.surface }]}>
        <View style={[styles.avatar, isVIP && styles.avatarVIP]}>
          <Icon name={isVIP ? 'star' : 'account'} size={28} color="#fff" />
        </View>
        <View style={styles.callerInfo}>
          <Text style={[styles.callerName, { color: colors.textPrimary }]} numberOfLines={1}>{displayName}</Text>
          {callerNumber ? <Text style={[styles.callerNumber, { color: colors.textTertiary }]}>{callerNumber}</Text> : null}
        </View>
        {isVIP && (
          <View style={styles.vipBadge}>
            <Icon name="star" size={12} color="#FF9500" />
            <Text style={styles.vipText}>VIP</Text>
          </View>
        )}
      </View>

      {/* Transcript label */}
      <View style={styles.transcriptHeader}>
        <Icon name="text-box-outline" size={16} color="#8E8E93" />
        <Text style={styles.transcriptHeaderText}>Live Transcript</Text>
      </View>

      {/* Live transcript area */}
      <View style={[styles.transcriptSection, { backgroundColor: colors.surface }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={callEnded ? handleUserInteraction : undefined}
        >
          {transcript.length === 0 && (
            <View style={styles.emptyState}>
              <Icon
                name={callEnded ? 'text-box-remove-outline' : 'microphone-outline'}
                size={36}
                color="#C7C7CC"
              />
              <Text style={styles.waitingText}>
                {callEnded ? 'No transcript available' : 'Listening to conversation...'}
              </Text>
            </View>
          )}
          {transcript.map((line) => (
            <View
              key={line.id}
              style={[
                styles.bubbleRow,
                line.speaker === 'ai' ? styles.bubbleRowAI : styles.bubbleRowCaller,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  line.speaker === 'ai'
                    ? [styles.bubbleAI, { backgroundColor: isDark ? '#1A2744' : '#EFF6FF' }]
                    : [styles.bubbleCaller, { backgroundColor: isDark ? '#1A2E1A' : '#F0FDF4' }],
                ]}
              >
                <Text style={[styles.bubbleSpeaker, line.speaker === 'caller' && styles.bubbleSpeakerCaller]}>
                  {line.speaker === 'ai' ? '🤖 AI' : '📞 Caller'}
                </Text>
                <Text
                  style={[
                    styles.bubbleText,
                    { color: colors.textPrimary },
                    line.isStreaming && styles.bubbleTextStreaming,
                  ]}
                >
                  {line.text}
                  {line.isStreaming && <Text style={styles.cursor}>▊</Text>}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Bottom actions */}
      <View style={styles.bottomBar}>
        {callEnded ? (
          <View style={styles.endedActions}>
            <TouchableOpacity style={styles.viewDetailsButton} onPress={handleViewDetails} activeOpacity={0.7}>
              <Icon name="file-document-outline" size={18} color="#fff" />
              <Text style={styles.viewDetailsText}>View Details</Text>
            </TouchableOpacity>

            {/* Done button with countdown */}
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleDismiss}
              activeOpacity={0.7}
            >
              <Text style={[styles.doneText, { color: colors.textPrimary }]}>{countdown > 0 ? `Done (${countdown}s)` : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: colors.surfaceSecondary }]} onPress={handleDismiss} activeOpacity={0.7}>
            <Icon name="arrow-down" size={20} color={colors.textTertiary} />
            <Text style={[styles.dismissText, { color: colors.textTertiary }]}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default IncomingCallScreen;
