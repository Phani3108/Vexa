import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styles from '../styles/ProfileScreen.styles';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';
import socketService from '../services/socket';
import * as transcriptStore from '../services/transcriptStore';
import { CallListItem } from '../types/api';

/** Pick an icon & colour for a call */
function callVisuals(call: CallListItem): { icon: string; iconColor: string } {
  const cat = call.categoryId || '';
  if (cat.startsWith('delivery'))  {return { icon: 'silverware-fork-knife', iconColor: '#4CAF50' };}
  if (cat.startsWith('spam'))      {return { icon: 'alert-circle', iconColor: '#FF3B30' };}
  if (cat.startsWith('service'))   {return { icon: 'shopping', iconColor: '#FF9800' };}
  if (cat.startsWith('personal'))  {return { icon: 'account', iconColor: '#007AFF' };}
  return { icon: 'phone-incoming', iconColor: '#666' };
}

function formatTime(dateStr?: string): string {
  if (!dateStr) {return '';}
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) {return 'Good Morning';}
  if (h < 17) {return 'Good Afternoon';}
  return 'Good Evening';
}

const ProfileScreen = ({ navigation }: any) => {
  const { userConfig, phoneNumber } = useAuth();
  const { colors, isDark } = useTheme();
  const [recentCalls, setRecentCalls] = useState<CallListItem[]>([]);
  const [callsToday, setCallsToday] = useState(0);
  const [loading, setLoading] = useState(true);

  // Active call tracking for the widget
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    callerNumber: string;
    callerName?: string;
    isVIP?: boolean;
    inPriorityTime?: boolean;
  } | null>(null);

  // Pulse animation for live indicator
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (!activeCall) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [activeCall, pulseAnim]);

  // Listen for call events
  useEffect(() => {
    const onStarted = (data: any) => {
      setActiveCall({
        callId: data.callId,
        callerNumber: data.from,
        callerName: data.callerName,
        isVIP: data.isVIP || false,
        inPriorityTime: data.inPriorityTime || data.suppressNotification || false,
      });
    };
    const onEnded = () => setActiveCall(null);

    socketService.on('call:started', onStarted);
    socketService.on('call:ended', onEnded);
    return () => {
      socketService.off('call:started', onStarted);
      socketService.off('call:ended', onEnded);
    };
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      // Fetch 5 for the recent list, and up to 200 to count today's calls
      const [recentRes, allRes] = await Promise.all([
        api.getCalls(5, 0),
        api.getCalls(200, 0),
      ]);
      setRecentCalls(recentRes.calls);
      const today = new Date().toDateString();
      setCallsToday(
        allRes.calls.filter(c => c.timestamp && new Date(c.timestamp).toDateString() === today).length,
      );
    } catch (_err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch every time the screen comes into focus (tab switch, navigate back, etc.)
  useFocusEffect(
    useCallback(() => {
      fetchRecent();
    }, [fetchRecent]),
  );

  // Also refresh when a call ends
  useEffect(() => {
    const onCallEnded = () => {
      // Small delay to let the backend finish saving the call
      setTimeout(() => fetchRecent(), 1500);
    };
    socketService.on('call:ended', onCallEnded);
    return () => { socketService.off('call:ended', onCallEnded); };
  }, [fetchRecent]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      {/* Hero Header */}
      <View style={[styles.heroGradient, { backgroundColor: colors.heroBg }]}>
        <View style={styles.heroContent}>
          <View style={styles.greetingRow}>
            <View>
              <Text style={styles.greetingText}>{getGreeting()}</Text>
              <Text style={styles.phoneText}>{userConfig?.name || phoneNumber || 'User'}</Text>
            </View>
            <View style={styles.avatarCircle}>
              <Icon name="robot" size={28} color={colors.accent} />
            </View>
          </View>

          {/* Status pill */}
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusPillText}>
              {userConfig ? 'AI is actively screening calls' : 'Loading...'}
            </Text>
          </View>
        </View>
      </View>

      {/* Call in Progress widget */}
      {activeCall && (
        <TouchableOpacity
          style={[styles.callWidget, activeCall.inPriorityTime && { backgroundColor: '#FF980015' }]}
          onPress={() => {
            // In DND/priority mode, calls are handled silently — tapping the widget
            // still lets the user view the live transcript if they want.
            navigation.navigate('IncomingCall', {
              callId: activeCall.callId,
              callerNumber: activeCall.callerNumber,
              callerName: activeCall.callerName || activeCall.callerNumber,
              isVIP: activeCall.isVIP || false,
              inPriorityTime: activeCall.inPriorityTime || false,
            });
          }}
          activeOpacity={0.8}
        >
          <View style={styles.callWidgetLeft}>
            <Animated.View style={[
              styles.callWidgetDot,
              { opacity: pulseAnim, backgroundColor: activeCall.inPriorityTime ? '#FF9800' : '#4CD964' },
            ]} />
            <View>
              <Text style={styles.callWidgetTitle}>
                {activeCall.inPriorityTime ? '🤫 AI Handling (DND)' : 'Call in Progress'}
              </Text>
              <Text style={styles.callWidgetSub}>
                {activeCall.isVIP ? '⭐ VIP · ' : ''}{activeCall.callerName || activeCall.callerNumber}
              </Text>
            </View>
          </View>
          <View style={styles.callWidgetAction}>
            <Text style={styles.callWidgetActionText}>View</Text>
            <Icon name="chevron-right" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={[styles.quickActionsRow, activeCall && { marginTop: 0 }, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('VIPContacts')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B3015' }]}>
            <Icon name="star" size={22} color="#FF3B30" />
          </View>
          <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>VIP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('PriorityTime')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#4CAF5015' }]}>
            <Icon name="clock-outline" size={22} color="#4CAF50" />
          </View>
          <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>DND</Text>
        </TouchableOpacity>
      </View>

      {/* AI Info Card */}
      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>YOUR AI NUMBER</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{userConfig?.twilioNumber || '—'}</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>CALLS TODAY</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {loading ? '...' : callsToday}
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.activitySection}>
        <View style={styles.activityHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>RECENT ACTIVITY</Text>
          <TouchableOpacity onPress={() => navigation.navigate('history')}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator style={{ paddingVertical: 30 }} color={colors.accent} />}

        {!loading && recentCalls.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <Icon name="phone-off" size={40} color="#CCC" />
            <Text style={styles.emptyText}>No recent calls yet</Text>
            <Text style={styles.emptySubtext}>
              Calls screened by your AI will appear here
            </Text>
          </View>
        )}

        {recentCalls.map((call, index) => {
          const vis = callVisuals(call);
          const summary = call.summary
            ? call.summary.slice(0, 50) + (call.summary.length > 50 ? '...' : '')
            : call.status;
          return (
            <TouchableOpacity
              key={call.callId}
              style={[
                styles.activityItem,
                { backgroundColor: colors.surface },
                index === recentCalls.length - 1 && { marginBottom: 0 },
              ]}
              onPress={() => navigation.navigate('CallDetail', { callId: call.callId })}
            >
              <View style={[styles.activityIcon, { backgroundColor: `${vis.iconColor}12` }]}>
                <Icon name={vis.icon} size={20} color={vis.iconColor} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={[styles.activityName, { color: colors.textPrimary }]}>{call.callerName || call.from}</Text>
                <Text style={[styles.activityStatus, { color: colors.textTertiary }]} numberOfLines={1}>{summary}</Text>
              </View>
              <View style={styles.activityRight}>
                <Text style={[styles.activityTime, { color: colors.textTertiary }]}>{formatTime(call.timestamp)}</Text>
                <Icon name="chevron-right" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

export default ProfileScreen;
