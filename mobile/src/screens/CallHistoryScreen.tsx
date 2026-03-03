import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styles from '../styles/CallHistoryScreen.styles';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';
import socketService from '../services/socket';
import { CallListItem } from '../types/api';

// ─── Helpers: derive display data from backend Call model ────────────────────

/** Map backend status to a display-friendly status label */
function getDisplayStatus(call: CallListItem): string {
  if (call.status === 'completed') {return 'SCREENED';}
  if (call.status === 'in-progress') {return 'LIVE';}
  return call.status.toUpperCase();
}

/** Pick an icon + colour based on category */
function getCategoryVisuals(categoryId?: string): { icon: string; iconColor: string; iconBg: string } {
  if (!categoryId) {return { icon: 'phone', iconColor: '#666', iconBg: '#66661A' };}
  if (categoryId.startsWith('delivery.food'))    {return { icon: 'truck-delivery', iconColor: '#FF6B35', iconBg: '#FF6B3515' };}
  if (categoryId.startsWith('delivery.package')) {return { icon: 'package-variant', iconColor: '#FF9800', iconBg: '#FF980015' };}
  if (categoryId.startsWith('delivery.grocery')) {return { icon: 'shopping', iconColor: '#4CAF50', iconBg: '#4CAF5015' };}
  if (categoryId.startsWith('service.maintenance')) {return { icon: 'wrench', iconColor: '#2196F3', iconBg: '#2196F315' };}
  if (categoryId.startsWith('service.visitor'))  {return { icon: 'account', iconColor: '#007AFF', iconBg: '#007AFF15' };}
  if (categoryId.startsWith('business.sales'))   {return { icon: 'phone-off', iconColor: '#FF3B30', iconBg: '#FF3B3015' };}
  if (categoryId.startsWith('spam'))             {return { icon: 'cancel', iconColor: '#FF3B30', iconBg: '#FF3B3015' };}
  if (categoryId.startsWith('personal'))         {return { icon: 'account', iconColor: '#007AFF', iconBg: '#007AFF15' };}
  return { icon: 'phone', iconColor: '#666', iconBg: '#F0F0F0' };
}

/** Format date to a section header like "TODAY", "YESTERDAY", or "Feb 20" */
function getSectionLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const callDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - callDay.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 1) {return 'TODAY';}
  if (diff < 2) {return 'YESTERDAY';}
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }).toUpperCase();
}

/** Format time like "12:45 PM" */
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Mock data preserved as comments for reference ───────────────────────────
/*
const mockCalls = [
  { id: '1', name: 'Food Delivery Service', number: '+91 98765 43210', status: 'SCREENED',
    type: 'delivery', time: '12:45 PM',
    summary: 'Delivery driver confirmed they are at the gate. AI instructed them to leave the food at the security desk.',
    icon: 'truck-delivery', iconColor: '#FF6B35', iconBg: '#FF6B3515', section: 'RECENT' },
  // ... (12 mock items removed — now fetched from GET /api/calls)
];
*/

const CallHistoryScreen = ({ navigation }: any) => {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getCalls(50, 0);
      setCalls(result.calls || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchCalls();
    }, [fetchCalls]),
  );

  // Also refresh when a call ends
  useEffect(() => {
    const onCallEnded = () => {
      setTimeout(() => fetchCalls(), 1500);
    };
    socketService.on('call:ended', onCallEnded);
    return () => { socketService.off('call:ended', onCallEnded); };
  }, [fetchCalls]);

  // ── Status style (matches backend status values) ──────────────────────────
  const getStatusStyle = (displayStatus: string) => {
    switch (displayStatus) {
      case 'SCREENED':
        return { color: '#007AFF', icon: 'shield-check' };
      case 'ESCALATED':
        return { color: '#FF9800', icon: 'phone-alert' };
      case 'ANSWERED':
        return { color: '#4CAF50', icon: 'check-circle' };
      case 'LIVE':
        return { color: '#FF3B30', icon: 'phone-in-talk' };
      default:
        return { color: '#666', icon: 'phone' };
    }
  };

  const renderSection = (section: string) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>{section}</Text>
    </View>
  );

  const renderCallItem = ({ item }: { item: CallListItem }) => {
    const displayStatus = getDisplayStatus(item);
    const statusStyle = getStatusStyle(displayStatus);
    const visuals = getCategoryVisuals(item.categoryId);
    const callerName = item.callerName || item.from;
    const summary = item.summary || 'No summary available';

    return (
      <TouchableOpacity
        style={[styles.callItem, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}
        onPress={() => navigation.navigate('CallDetail', { callId: item.callId })}
      >
        <View style={[styles.callIcon, { backgroundColor: visuals.iconBg }]}>
          <Icon name={visuals.icon} size={24} color={visuals.iconColor} />
        </View>

        <View style={styles.callContent}>
          <View style={styles.callHeader}>
            <Text style={[styles.callName, { color: colors.textPrimary }]}>{callerName}</Text>
            <Text style={[styles.callTime, { color: colors.textTertiary }]}>{formatTime(item.timestamp)}</Text>
          </View>

          <View style={styles.callMeta}>
            <View style={styles.statusBadge}>
              <Icon name={statusStyle.icon} size={12} color={statusStyle.color} />
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {displayStatus}
              </Text>
            </View>
            <Text style={[styles.callNumber, { color: colors.textTertiary }]}>{item.from}</Text>
          </View>

          <Text style={[styles.callSummary, { color: colors.textSecondary }]} numberOfLines={2}>
            <Text style={[styles.aiLabel, { color: colors.textPrimary }]}>AI: </Text>
            {summary}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Filter calls based on active filter and search query ──────────────────
  const filteredCalls = calls.filter(call => {
    const displayStatus = getDisplayStatus(call);
    const matchesFilter =
      activeFilter === 'All' ||
      (activeFilter === 'Screened' && displayStatus === 'SCREENED');
    const callerName = call.callerName || call.from;
    const summary = call.summary || '';
    const matchesSearch =
      searchQuery === '' ||
      callerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // ── Group calls by date section ───────────────────────────────────────────
  const groupedCalls = filteredCalls.reduce((acc: Record<string, CallListItem[]>, call) => {
    const section = getSectionLabel(call.timestamp);
    if (!acc[section]) { acc[section] = []; }
    acc[section].push(call);
    return acc;
  }, {});

  const sections = Object.keys(groupedCalls).map(section => ({
    title: section,
    data: groupedCalls[section],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Call History</Text>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBg }]}>
        <Icon name="magnify" size={20} color={colors.placeholderText} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search callers or summaries"
          placeholderTextColor={colors.placeholderText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {['All', 'Screened'].map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterTab,
              { backgroundColor: colors.surface },
              activeFilter === filter && [styles.filterTabActive, { backgroundColor: colors.surfaceSecondary }],
            ]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text
              style={[
                styles.filterText,
                { color: colors.textSecondary },
                activeFilter === filter && [styles.filterTextActive, { color: colors.textPrimary }],
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading / Error / Call List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#FF3B30', textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={fetchCalls} style={{ marginTop: 12 }}>
            <Text style={{ color: '#007AFF' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          renderItem={({ item: section }) => (
            <View>
              {renderSection(section.title)}
              {section.data.map((call: CallListItem) => (
                <View key={call.callId}>
                  {renderCallItem({ item: call })}
                </View>
              ))}
            </View>
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 }}>
              <View style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center', marginBottom: 20,
              }}>
                <Icon name="phone-clock" size={48} color={colors.textTertiary} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}>
                No Call History
              </Text>
              <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 40 }}>
                When your AI assistant screens calls, they'll appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default CallHistoryScreen;
