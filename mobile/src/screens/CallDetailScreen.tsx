import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CommonHeader from '../components/CommonHeader';
import styles from '../styles/CallDetailScreen.styles';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';
import { Call, TranscriptEntry } from '../types/api';

// ─── Mock data preserved as comments ─────────────────────────────────────────
/*
const mockCallDetails: any = {
  '1': {
    number: '+91 98765 43210',
    location: 'BANGALORE, KA • 2M 15S',  // ← "location" has no backend field
    time: 'Today at 12:45 PM',
    summary: { type: 'Food Delivery', typeColor: '#FF6B35', description: '...', link: 'Delivery Preferences' },
    tags: [ { label: 'DELIVERY', color: '#007AFF' }, { label: 'RESOLVED', color: '#4CAF50' } ],
    transcript: [ ... ],
    duration: '2:15',
    currentTime: '0:42',
  },
  // ... (5 mock detail objects removed — now fetched from GET /api/calls/:id)
};
*/

/** Format seconds to "1m 05s" */
function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) { return '0s'; }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) { return `${s}s`; }
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/** Format ISO date to "Today at 12:45 PM" style */
function formatCallTime(dateStr?: string): string {
  if (!dateStr) {return '';}
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) {return `Today at ${time}`;}
  if (isYesterday) {return `Yesterday at ${time}`;}
  return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} at ${time}`;
}

/** Get colour for category label */
function getCategoryColor(categoryId?: string): string {
  if (!categoryId) {return '#666';}
  if (categoryId.startsWith('delivery'))  {return '#FF6B35';}
  if (categoryId.startsWith('spam'))      {return '#FF3B30';}
  if (categoryId.startsWith('business'))  {return '#FF3B30';}
  if (categoryId.startsWith('service'))   {return '#2196F3';}
  if (categoryId.startsWith('personal'))  {return '#007AFF';}
  return '#666';
}

/** Animated shimmer skeleton box */
const SkeletonBox = ({
  width,
  height,
  borderRadius = 4,
  style,
  boneColor,
  highlightColor,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
  boneColor: string;
  highlightColor: string;
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]),
    ).start();
  }, [shimmer]);
  const bg = shimmer.interpolate({ inputRange: [0, 1], outputRange: [boneColor, highlightColor] });
  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: bg, marginTop: 0 }, style]}
    />
  );
};

const CallDetailScreen = ({ navigation, route }: any) => {
  const { callId } = route.params || {};
  const { colors, isDark } = useTheme();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) { setError('No call ID'); setLoading(false); return; }
    (async () => {
      try {
        const { call: data } = await api.getCallById(callId);
        setCall(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load call');
      } finally {
        setLoading(false);
      }
    })();
  }, [callId]);

  if (loading) {
    const bone = isDark ? '#2C2C2E' : '#E5E5EA';
    const highlight = isDark ? '#3A3A3C' : '#F2F2F7';
    const S = (props: Omit<Parameters<typeof SkeletonBox>[0], 'boneColor' | 'highlightColor'>) => (
      <SkeletonBox {...props} boneColor={bone} highlightColor={highlight} />
    );
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CommonHeader title="Call Details" onBackPress={() => navigation.goBack()} showBackButton showRightButton={false} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Caller section skeleton */}
          <View style={[styles.callerSection, { backgroundColor: colors.surface }]}>
            <S width={48} height={48} borderRadius={24} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <S width={160} height={16} />
              <S width={200} height={12} style={{ marginTop: 8 }} />
              <S width={100} height={20} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
          </View>

          {/* AI Summary skeleton */}
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <S width={18} height={18} borderRadius={9} />
              <S width={100} height={14} style={{ marginLeft: 8 }} />
            </View>
            <S width="100%" height={14} style={{ marginTop: 14 }} />
            <S width="90%" height={14} style={{ marginTop: 8 }} />
            <S width="70%" height={14} style={{ marginTop: 8 }} />
            <View style={{ flexDirection: 'row', marginTop: 14 }}>
              <S width={70} height={24} borderRadius={12} />
              <S width={70} height={24} borderRadius={12} style={{ marginLeft: 8 }} />
            </View>
          </View>

          {/* Transcript skeleton */}
          <View style={[styles.transcriptSection, { backgroundColor: colors.surface }]}>
            <S width={130} height={12} />
            <S width="75%" height={40} borderRadius={16} style={{ marginTop: 16 }} />
            <S width="65%" height={40} borderRadius={16} style={{ marginTop: 12, alignSelf: 'flex-end' }} />
            <S width="80%" height={50} borderRadius={16} style={{ marginTop: 12 }} />
            <S width="60%" height={40} borderRadius={16} style={{ marginTop: 12, alignSelf: 'flex-end' }} />
            <S width="70%" height={40} borderRadius={16} style={{ marginTop: 12 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error || !call) {
    return (
      <View style={styles.container}>
        <CommonHeader title="Call Details" onBackPress={() => navigation.goBack()} showBackButton showRightButton={false} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#FF3B30' }}>{error || 'Call not found'}</Text>
        </View>
      </View>
    );
  }

  const categoryLabel = call.analysis?.categoryLabel || 'Unknown';
  const categoryColor = getCategoryColor(call.analysis?.categoryId);
  const durationStr = `${formatDuration(call.duration)}`;

  // Build tags from backend data
  const tags: { label: string; color: string }[] = [];
  if (call.analysis?.categoryLabel) {
    tags.push({ label: call.analysis.categoryLabel.toUpperCase(), color: '#007AFF' });
  }
  if (call.takenOver) {
    tags.push({ label: 'ANSWERED', color: '#4CAF50' });
  } else if (call.status === 'completed') {
    tags.push({ label: 'RESOLVED', color: '#4CAF50' });
  }
  if (call.analysis?.urgency === 'high' || call.analysis?.urgency === 'critical') {
    tags.push({ label: 'ESCALATED', color: '#FF9800' });
  }
  if (call.analysis?.sentiment === 'negative') {
    tags.push({ label: 'NEGATIVE', color: '#FF3B30' });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CommonHeader title="Call Details" onBackPress={() => navigation.goBack()} showBackButton showRightButton={false} />

      {/* Compact Caller Header */}
      <View style={[styles.callerSection, { backgroundColor: colors.surface }]}>
        <View style={[styles.callerAvatar, { backgroundColor: colors.surfaceSecondary }]}>
          <Icon name="account" size={28} color={colors.textTertiary} />
        </View>
        <View style={styles.callerInfo}>
          <Text style={[styles.callerNumber, { color: colors.text }]}>{call.phoneNumber}</Text>
          <Text style={[styles.callerMeta, { color: colors.textTertiary }]}>
            {call.direction.toUpperCase()} • {durationStr} • {formatCallTime(call.startedAt || call.createdAt)}
          </Text>
        </View>
      </View>

      {/* AI Summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        {/* Header: icon + title */}
        <View style={styles.summaryHeader}>
          <Icon name="robot" size={16} color="#007AFF" />
          <Text style={styles.summaryTitle}>AI SUMMARY</Text>
        </View>

        {/* Tags */}
        {tags.length > 0 && (
          <View style={[styles.tagsRow, { marginBottom: 10 }]}>
            {tags.map((tag, index) => (
              <View key={index} style={[styles.tag, { borderColor: tag.color }]}>
                <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Caller identity chips */}
        {(call.analysis?.callerName || call.analysis?.organization || call.analysis?.topic) && (
          <View style={styles.callerChips}>
            {call.analysis?.callerName ? (
              <View style={styles.chip}>
                <Icon name="account-outline" size={13} color="#555" />
                <Text style={styles.chipText}>{call.analysis.callerName}</Text>
              </View>
            ) : null}
            {call.analysis?.organization ? (
              <View style={styles.chip}>
                <Icon name="domain" size={13} color="#555" />
                <Text style={styles.chipText}>{call.analysis.organization}</Text>
              </View>
            ) : null}
            {call.analysis?.topic ? (
              <View style={styles.chip}>
                <Icon name="tag-outline" size={13} color="#555" />
                <Text style={styles.chipText}>{call.analysis.topic}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Summary text */}
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          This was a{' '}
          <Text style={[styles.summaryHighlight, { color: categoryColor }]}>{categoryLabel}</Text>
          {' '}{call.analysis?.summary || 'No summary available.'}
          {call.analysis?.actionTaken ? ` AI action: ${call.analysis.actionTaken}` : ''}
        </Text>

        {/* Action items */}
        {call.analysis?.actionItems && call.analysis.actionItems.length > 0 && (
          <View style={styles.actionItemsContainer}>
            <Text style={styles.actionItemsTitle}>ACTION NEEDED</Text>
            {call.analysis.actionItems.map((item: string, i: number) => (
              <View key={i} style={styles.actionItem}>
                <Icon name="circle-small" size={16} color="#FF9800" />
                <Text style={[styles.actionItemText, { color: colors.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Full Transcript */}
      <View style={[styles.transcriptSection, { backgroundColor: colors.surface, flex: 1 }]}>
        <Text style={[styles.transcriptTitle, { color: colors.textTertiary }]}>FULL TRANSCRIPT</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {(call.transcript || []).map((message: TranscriptEntry, index: number) => {
            const isAI = message.speaker === 'ai';
            const speakerLabel = isAI ? 'AI ASSISTANT' : (call.analysis?.callerName || 'CALLER').toUpperCase();
            return (
              <View key={index} style={[styles.messageContainer, isAI && styles.messageContainerAI]}>
                <Text style={[styles.messageSpeaker, isAI && styles.messageSpeakerAI]}>{speakerLabel}</Text>
                <View style={[styles.messageBubble, isAI
                  ? [styles.messageBubbleAI, { backgroundColor: isDark ? '#1A2744' : '#007AFF' }]
                  : [styles.messageBubbleCaller, { backgroundColor: isDark ? '#2C2C2E' : '#E8E8E8' }]]}>
                  <Text style={[styles.messageText, isAI ? styles.messageTextAI : { color: isDark ? '#FFFFFF' : '#000000' }]}>
                    {message.text}
                  </Text>
                </View>
              </View>
            );
          })}
          {(!call.transcript || call.transcript.length === 0) && (
            <Text style={{ color: '#999', textAlign: 'center', paddingVertical: 20 }}>No transcript recorded</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

export default CallDetailScreen;
