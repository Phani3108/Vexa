/**
 * IncomingCallScreen — shown automatically when a call:started event fires.
 *
 * Displays caller info and live word-by-word transcripts.
 * Dismiss hides the screen but the call-in-progress widget on the home
 * screen lets the user return at any time.
 *
 * Live data (transcript lines, word-by-word AI deltas, caller name, ended
 * state) is read from services/transcriptStore, which App.tsx fills from the
 * socket events.
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
import * as transcriptStore from '../services/transcriptStore';
import type { TranscriptLine } from '../services/transcriptStore';
import type { IncomingCallParams } from '../navigation/AppNavigator';
import type { LiveSpeaker } from '../types/api';

const SPEAKER_LABELS: Record<LiveSpeaker, string> = {
  ai: '🤖 AI',
  caller: '📞 Caller',
  user: '🙋 You',
  system: 'ℹ️ Status',
};

const IncomingCallScreen = ({ route, navigation }: any) => {
  const { callId, callerNumber, callerName: initialCallerName, isVIP, inPriorityTime } =
    (route.params || {}) as IncomingCallParams;
  const { colors, isDark } = useTheme();

  // Live state comes from the shared store (App.tsx is the only writer), so
  // transcripts survive dismiss/re-open and are never double-counted.
  const initial = transcriptStore.getSnapshot();
  const isSameCall = initial.callId === callId;
  const [transcript, setTranscript] = useState<TranscriptLine[]>(isSameCall ? initial.lines : []);
  const [callEnded, setCallEnded] = useState(isSameCall ? initial.ended : false);
  const [liveCallerName, setLiveCallerName] = useState<string | undefined>(
    isSameCall ? initial.meta?.callerName : undefined,
  );
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return transcriptStore.subscribe(snap => {
      if (snap.callId === callId) {
        setTranscript(snap.lines);
        setCallEnded(snap.ended);
        if (snap.meta?.callerName) {
          setLiveCallerName(snap.meta.callerName);
        }
      } else {
        // The store moved on (call cleared or a new call started) — keep the
        // last transcript on screen but treat this call as over.
        setCallEnded(true);
      }
    });
  }, [callId]);

  // Pulse animation for the live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (callEnded) {return;}
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

  // Auto-scroll on new transcript
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
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

  const callerName =
    liveCallerName ||
    (initialCallerName && initialCallerName !== callerNumber ? initialCallerName : undefined);
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
            {callEnded ? 'Call Ended' : inPriorityTime ? 'AI Handling (DND)' : 'AI Screening'}
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
          {callerNumber && callerNumber !== displayName ? <Text style={[styles.callerNumber, { color: colors.textTertiary }]}>{callerNumber}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {isVIP && (
            <View style={styles.vipBadge}>
              <Icon name="star" size={12} color="#FF9500" />
              <Text style={styles.vipText}>VIP</Text>
            </View>
          )}
          {inPriorityTime && (
            <View style={[styles.vipBadge, { backgroundColor: '#FF980020' }]}>
              <Icon name="do-not-disturb" size={12} color="#FF9800" />
              <Text style={[styles.vipText, { color: '#FF9800' }]}>DND</Text>
            </View>
          )}
        </View>
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
                <Text style={[styles.bubbleSpeaker, line.speaker !== 'ai' && styles.bubbleSpeakerCaller]}>
                  {SPEAKER_LABELS[line.speaker] ?? SPEAKER_LABELS.caller}
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
