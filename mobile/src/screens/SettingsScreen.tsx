import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Switch, Modal, FlatList } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { CommonActions } from '@react-navigation/native';
import styles from '../styles/SettingsScreen.styles';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';

const VOICES = [
  { id: 'alloy',   label: 'Alloy',   desc: 'Warm and balanced' },
  { id: 'echo',    label: 'Echo',    desc: 'Clear and composed' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Bright and articulate' },
  { id: 'ash',     label: 'Ash',     desc: 'Smooth and confident' },
  { id: 'ballad',  label: 'Ballad',  desc: 'Expressive and engaging' },
  { id: 'coral',   label: 'Coral',   desc: 'Calm and reassuring' },
  { id: 'sage',    label: 'Sage',    desc: 'Wise and professional' },
  { id: 'verse',   label: 'Verse',   desc: 'Dynamic and versatile' },
];

const TONES = [
  { id: 'professional but friendly', label: 'Professional & Friendly' },
  { id: 'casual and relaxed',        label: 'Casual & Relaxed' },
  { id: 'formal and concise',        label: 'Formal & Concise' },
  { id: 'warm and empathetic',       label: 'Warm & Empathetic' },
  { id: 'cheerful and upbeat',       label: 'Cheerful & Upbeat' },
];

const SettingsScreen = ({ navigation }: any) => {
  const { userConfig, phoneNumber, logout, refreshConfig } = useAuth();
  const { isDark, colors, toggleTheme } = useTheme();
  const [quickToggleActive, setQuickToggleActive] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [tonePickerVisible, setTonePickerVisible] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  useEffect(() => {
    fetchPriorityTimeStatus();
  }, []);

  const fetchPriorityTimeStatus = async () => {
    try {
      const response = await api.getPriorityTime();
      setQuickToggleActive(response.priorityTime?.quickToggleActive || false);
      setDndEnabled(response.priorityTime?.enabled || false);
    } catch (_err) {
      setQuickToggleActive(false);
      setDndEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickToggle = async () => {
    try {
      setToggling(true);
      const response = await api.quickTogglePriorityTime();
      setQuickToggleActive(response.quickToggleActive);
    } catch (_err) {
      Alert.alert('Error', 'Could not toggle DND. Please try again.');
    } finally {
      setToggling(false);
    }
  };

  const handleVoiceSelect = async (voiceId: string) => {
    try {
      setSavingVoice(true);
      await api.updateUserConfig({ aiSettings: { voice: voiceId } });
      await refreshConfig();
      setVoicePickerVisible(false);
    } catch (_err) {
      Alert.alert('Error', 'Could not update voice. Please try again.');
    } finally {
      setSavingVoice(false);
    }
  };

  const handleToneSelect = async (toneId: string) => {
    try {
      setSavingVoice(true);
      await api.updateUserConfig({ aiSettings: { tone: toneId } });
      await refreshConfig();
      setTonePickerVisible(false);
    } catch (_err) {
      Alert.alert('Error', 'Could not update tone. Please try again.');
    } finally {
      setSavingVoice(false);
    }
  };

  // Two-line row: label (small) + value (bold) — used when there's a real value to show
  const SettingRow = ({ icon, iconColor, iconBg, label, value, onPress, showChevron = true }: any) => (
    <TouchableOpacity style={[styles.settingRow, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingLabel, { color: colors.textTertiary }]}>{label}</Text>
          <Text style={[styles.settingValue, { color: colors.textPrimary }]}>{value}</Text>
        </View>
      </View>
      {showChevron && <Icon name="chevron-right" size={20} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  // Single-line nav row — for items that are just navigation links (no current value to show)
  const NavRow = ({ icon, iconColor, iconBg, label, badge, onPress }: any) => (
    <TouchableOpacity style={[styles.settingRow, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
        <Text style={[styles.navRowLabel, { color: colors.textPrimary }]}>{label}</Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.color + '20' }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>
      <Icon name="chevron-right" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const voiceLabel = userConfig?.aiSettings?.voice
    ? userConfig.aiSettings.voice.charAt(0).toUpperCase() + userConfig.aiSettings.voice.slice(1)
    : 'Default';
  const toneLabel = userConfig?.aiSettings?.tone
    ? userConfig.aiSettings.tone.charAt(0).toUpperCase() + userConfig.aiSettings.tone.slice(1)
    : 'Professional';

  const dndIsOn = quickToggleActive;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
      </View>

      {/* DND Quick Toggle Banner */}
      <View style={styles.quickToggleSection}>
        <TouchableOpacity
          style={[styles.quickToggleButton, dndIsOn && styles.quickToggleButtonActive]}
          onPress={handleQuickToggle}
          disabled={loading || toggling}
          activeOpacity={0.85}>
          <View style={styles.quickToggleContent}>
            <View style={[styles.dndIconCircle, { backgroundColor: dndIsOn ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)' }]}>
              <Icon name={dndIsOn ? 'do-not-disturb' : 'bell-outline'} size={22} color="#fff" />
            </View>
            <View style={styles.quickToggleTextContainer}>
              <Text style={styles.quickToggleTitle}>
                {dndIsOn ? 'DND Active' : 'Do Not Disturb'}
              </Text>
              <Text style={styles.quickToggleSubtitle}>
                {dndIsOn ? 'AI is screening all calls · Tap to disable' : 'Tap to block all non-VIP calls'}
              </Text>
            </View>
            {(loading || toggling)
              ? <ActivityIndicator color="#fff" />
              : <Icon name={dndIsOn ? 'toggle-switch' : 'toggle-switch-off-outline'} size={32} color="#fff" />
            }
          </View>
        </TouchableOpacity>
      </View>

      {/* PERSONAL INFORMATION */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PERSONAL INFORMATION</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="account-edit"
            iconColor="#007AFF"
            iconBg="#007AFF15"
            label="Profile"
            value={userConfig?.name || 'Not set'}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <SettingRow
            icon="cellphone"
            iconColor={colors.textSecondary}
            iconBg={isDark ? '#2C2C2E' : '#F0F0F0'}
            label="Your Number"
            value={phoneNumber || 'Not set'}
            onPress={() => {}}
            showChevron={false}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <SettingRow
            icon="phone-in-talk"
            iconColor="#007AFF"
            iconBg="#007AFF15"
            label="AI Number (Twilio)"
            value={userConfig?.twilioNumber || 'Not assigned'}
            onPress={() => {}}
            showChevron={false}
          />
        </View>
      </View>

      {/* AI ASSISTANT */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>AI ASSISTANT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <SettingRow
            icon="account-voice"
            iconColor="#9C27B0"
            iconBg="#9C27B015"
            label="Voice"
            value={voiceLabel}
            onPress={() => setVoicePickerVisible(true)}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <SettingRow
            icon="chat-processing"
            iconColor="#FF9800"
            iconBg="#FF980015"
            label="Conversation Tone"
            value={toneLabel}
            onPress={() => setTonePickerVisible(true)}
          />
        </View>
      </View>

      {/* CALL HANDLING */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>CALL HANDLING</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <NavRow
            icon="phone-forward"
            iconColor="#4CAF50"
            iconBg="#4CAF5015"
            label="Call Forwarding"
            onPress={() => navigation.navigate('SetupForwarding')}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <NavRow
            icon="clock-alert-outline"
            iconColor="#FF9800"
            iconBg="#FF980015"
            label="Priority Time / DND"
            badge={dndEnabled ? { label: 'ON', color: '#FF9800' } : undefined}
            onPress={() => navigation.navigate('PriorityTime')}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <NavRow
            icon="truck-delivery-outline"
            iconColor="#2196F3"
            iconBg="#2196F315"
            label="Delivery Preferences"
            onPress={() => navigation.navigate('DeliveryPreferences')}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <NavRow
            icon="star-outline"
            iconColor="#FFD700"
            iconBg="#FFD70015"
            label="VIP Contacts"
            badge={userConfig?.vipContacts?.length ? { label: `${userConfig.vipContacts.length}`, color: '#007AFF' } : undefined}
            onPress={() => navigation.navigate('VIPContacts')}
          />
        </View>
      </View>

      {/* APPEARANCE */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: isDark ? '#2C2C2E' : '#FFF3E0' }]}>
                <Icon name={isDark ? 'weather-night' : 'white-balance-sunny'} size={20} color={isDark ? '#FFD60A' : '#FF9500'} />
              </View>
              <Text style={[styles.navRowLabel, { color: colors.textPrimary }]}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E0E0E0', true: '#34C759' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>

      {/* LOGOUT */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.resetButton, { backgroundColor: colors.surface }]}
          onPress={() => {
            logout();
            navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
          }}
          activeOpacity={0.7}>
          <Text style={styles.resetText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 48 }} />

      {/* Voice Picker Modal */}
      <Modal visible={voicePickerVisible} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary }}>Choose Voice</Text>
              <TouchableOpacity onPress={() => setVoicePickerVisible(false)}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {savingVoice && <ActivityIndicator style={{ padding: 8 }} color="#007AFF" />}
            <FlatList
              data={VOICES}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const isSelected = userConfig?.aiSettings?.voice === item.id;
                return (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: isSelected ? '#007AFF10' : 'transparent' }}
                    onPress={() => handleVoiceSelect(item.id)}
                    disabled={savingVoice}
                  >
                    <Icon name={isSelected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={isSelected ? '#007AFF' : colors.textTertiary} />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: isSelected ? '600' : '400', color: colors.textPrimary }}>{item.label}</Text>
                      <Text style={{ fontSize: 13, color: colors.textTertiary }}>{item.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Tone Picker Modal */}
      <Modal visible={tonePickerVisible} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary }}>Choose Tone</Text>
              <TouchableOpacity onPress={() => setTonePickerVisible(false)}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {savingVoice && <ActivityIndicator style={{ padding: 8 }} color="#007AFF" />}
            <FlatList
              data={TONES}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const isSelected = userConfig?.aiSettings?.tone === item.id;
                return (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: isSelected ? '#FF980010' : 'transparent' }}
                    onPress={() => handleToneSelect(item.id)}
                    disabled={savingVoice}
                  >
                    <Icon name={isSelected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={isSelected ? '#FF9800' : colors.textTertiary} />
                    <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: isSelected ? '600' : '400', color: colors.textPrimary }}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default SettingsScreen;
