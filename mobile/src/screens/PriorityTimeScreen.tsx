/**
 * Enhanced Priority Time / DND Mode Settings Screen
 * 
 * Features:
 * - Quick toggle for instant DND activation
 * - Multiple time slots per day
 * - Recurring schedule (select days of week)
 * - Emergency contact bypass list
 * - Custom message editor
 * - Real-time preview
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { styles } from '../styles/PriorityTimeScreen.styles';
import * as api from '../services/api';
import { TimeSlot, EmergencyContact } from '../types/api';
import CommonHeader from '../components/CommonHeader';
import { useTheme } from '../contexts/ThemeContext';

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export default function PriorityTimeScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickToggling, setQuickToggling] = useState(false);

  // Priority Time settings
  const [enabled, setEnabled] = useState(false);
  const [quickToggleActive, setQuickToggleActive] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [message, setMessage] = useState('');
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

  // New time slot inputs
  const [newSlotStart, setNewSlotStart] = useState('09:00');
  const [newSlotEnd, setNewSlotEnd] = useState('17:00');
  const [newSlotLabel, setNewSlotLabel] = useState('');

  // New emergency contact inputs
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRelation, setNewContactRelation] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.getPriorityTime();
      const pt = response.priorityTime || {};

      setEnabled(pt.enabled || false);
      setQuickToggleActive(pt.quickToggleActive || false);
      setTimeSlots(pt.timeSlots || []);
      setRecurringEnabled(pt.recurring?.enabled || false);
      setSelectedDays(pt.recurring?.daysOfWeek || [1, 2, 3, 4, 5]);
      setTimezone(pt.timezone || 'Asia/Kolkata');
      setMessage(
        pt.message ||
          '{userName} is currently unavailable due to important work and cannot take calls. They will be available after {endTime}. Please leave your details and they will get back to you.'
      );
      setEmergencyContacts(pt.emergencyContacts || []);
    } catch (error) {
      // Priority time endpoint may not exist yet — use defaults silently
    } finally {
      setLoading(false);
    }
  };

  const handleQuickToggle = async () => {
    try {
      setQuickToggling(true);
      const response = await api.quickTogglePriorityTime();
      setQuickToggleActive(response.quickToggleActive);
      Alert.alert('Success', response.message);
    } catch (error: any) {
      Alert.alert('Coming Soon', 'DND quick toggle will be available in a future update.');
    } finally {
      setQuickToggling(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const data = {
        enabled,
        timeSlots,
        recurring: {
          enabled: recurringEnabled,
          daysOfWeek: selectedDays,
          excludeDates: [],
        },
        timezone,
        message,
        emergencyContacts,
        quickToggleActive,
      };

      const response = await api.updatePriorityTime(data);
      // Sync UI from the server response so displayed state always matches DB
      const pt = response.priorityTime;
      if (pt) {
        setEnabled(pt.enabled ?? false);
        setQuickToggleActive(pt.quickToggleActive ?? false);
        setTimeSlots(pt.timeSlots ?? []);
        setRecurringEnabled(pt.recurring?.enabled ?? false);
        setSelectedDays(pt.recurring?.daysOfWeek ?? [1, 2, 3, 4, 5]);
        setTimezone(pt.timezone ?? 'Asia/Kolkata');
        setMessage(pt.message ?? message);
        setEmergencyContacts(pt.emergencyContacts ?? []);
      }
      Alert.alert('Saved', response.message);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTimeSlot = () => {
    if (!validateTimeFormat(newSlotStart) || !validateTimeFormat(newSlotEnd)) {
      Alert.alert('Invalid Time', 'Please enter time in HH:mm format (24-hour)');
      return;
    }

    const newSlot: TimeSlot = {
      startTime: newSlotStart,
      endTime: newSlotEnd,
      label: newSlotLabel,
    };

    setTimeSlots([...timeSlots, newSlot]);
    setNewSlotLabel('');
    Alert.alert('Success', 'Time slot added');
  };

  const handleRemoveTimeSlot = (index: number) => {
    Alert.alert('Remove Time Slot', 'Are you sure you want to remove this time slot?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const updated = timeSlots.filter((_, i) => i !== index);
          setTimeSlots(updated);
        },
      },
    ]);
  };

  const handleAddEmergencyContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      Alert.alert('Missing Info', 'Please enter both name and phone number');
      return;
    }

    const newContact: EmergencyContact = {
      name: newContactName.trim(),
      phoneNumber: newContactPhone.trim(),
      relationship: newContactRelation.trim(),
    };

    setEmergencyContacts([...emergencyContacts, newContact]);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactRelation('');
    Alert.alert('Success', 'Emergency contact added');
  };

  const handleRemoveEmergencyContact = (index: number) => {
    Alert.alert('Remove Contact', 'Are you sure you want to remove this emergency contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const updated = emergencyContacts.filter((_, i) => i !== index);
          setEmergencyContacts(updated);
        },
      },
    ]);
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  const validateTimeFormat = (time: string): boolean => {
    const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  };

  const formatTimeInput = (text: string, setter: (val: string) => void) => {
    // Remove non-numeric characters except colon
    let cleaned = text.replace(/[^0-9:]/g, '');

    // Auto-add colon after 2 digits
    if (cleaned.length === 2 && !cleaned.includes(':')) {
      cleaned += ':';
    }

    // Limit to HH:mm format
    if (cleaned.length > 5) {
      cleaned = cleaned.substring(0, 5);
    }

    setter(cleaned);
  };

  const getPreviewMessage = (): string => {
    const userName = 'John'; // Example name
    const endTime = timeSlots.length > 0 ? format12Hour(timeSlots[0].endTime) : '5:00 PM';
    return message.replace('{userName}', userName).replace('{endTime}', endTime);
  };

  const format12Hour = (time24: string): string => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CommonHeader
          title="Priority Time / DND"
          onBackPress={() => navigation.goBack()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CommonHeader
        title="Priority Time / DND"
        onBackPress={() => navigation.goBack()}
        showBackButton
        showRightButton
        rightButtonText={saving ? 'Saving...' : 'Save'}
        onRightButtonPress={handleSave}
      />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      {/* Quick Toggle */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⚡ Quick Toggle</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Instantly activate DND mode without changing your settings
        </Text>
        <TouchableOpacity
          style={[styles.quickToggleButton, quickToggleActive && styles.quickToggleButtonActive]}
          onPress={handleQuickToggle}
          disabled={quickToggling}>
          {quickToggling ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.quickToggleButtonText}>
              {quickToggleActive ? '🟢 DND Active - Tap to Disable' : '⚪ DND Inactive - Tap to Enable'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Main Enable/Disable */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Enable Scheduled Priority Time</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>Automatically enable DND during configured times</Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} />
        </View>
      </View>

      {/* Time Slots */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>⏰ Time Slots</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>Add multiple time periods when you're unavailable</Text>

        {timeSlots.map((slot, index) => (
          <View key={index} style={[styles.slotItem, { borderBottomColor: colors.divider }]}>
            <View style={styles.slotInfo}>
              <Text style={[styles.slotTime, { color: colors.textPrimary }]}>
                {format12Hour(slot.startTime)} - {format12Hour(slot.endTime)}
              </Text>
              {slot.label && <Text style={[styles.slotLabel, { color: colors.textTertiary }]}>{slot.label}</Text>}
            </View>
            <TouchableOpacity onPress={() => handleRemoveTimeSlot(index)}>
              <Text style={styles.removeButton}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addSlotSection}>
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textTertiary }]}>Start Time</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
                value={newSlotStart}
                onChangeText={text => formatTimeInput(text, setNewSlotStart)}
                placeholder="09:00"
                placeholderTextColor={colors.placeholderText}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <Text style={[styles.timeSeparator, { color: colors.textTertiary }]}>→</Text>
            <View style={styles.timeInputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textTertiary }]}>End Time</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
                value={newSlotEnd}
                onChangeText={text => formatTimeInput(text, setNewSlotEnd)}
                placeholder="17:00"
                placeholderTextColor={colors.placeholderText}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
            value={newSlotLabel}
            onChangeText={setNewSlotLabel}
            placeholder="Label (optional, e.g., 'Morning Focus')"
            placeholderTextColor={colors.placeholderText}
          />

          <TouchableOpacity style={styles.addButton} onPress={handleAddTimeSlot}>
            <Text style={styles.addButtonText}>+ Add Time Slot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recurring Schedule */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Recurring Schedule</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>Repeat priority time on specific days</Text>
          </View>
          <Switch value={recurringEnabled} onValueChange={setRecurringEnabled} />
        </View>

        {recurringEnabled && (
          <View style={styles.daysContainer}>
            {DAYS_OF_WEEK.map(day => (
              <TouchableOpacity
                key={day.value}
                style={[styles.dayButton, { borderColor: colors.border }, selectedDays.includes(day.value) && styles.dayButtonActive]}
                onPress={() => toggleDay(day.value)}>
                <Text
                  style={[
                    styles.dayButtonText,
                    { color: colors.textSecondary },
                    selectedDays.includes(day.value) && styles.dayButtonTextActive,
                  ]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Emergency Contacts */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🚨 Emergency Bypass Contacts</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>These contacts can always reach you, even during priority time</Text>

        {emergencyContacts.map((contact, index) => (
          <View key={index} style={[styles.contactItem, { borderBottomColor: colors.divider }]}>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactName, { color: colors.textPrimary }]}>{contact.name}</Text>
              <Text style={[styles.contactPhone, { color: colors.textSecondary }]}>{contact.phoneNumber}</Text>
              {contact.relationship && <Text style={[styles.contactRelation, { color: colors.textTertiary }]}>{contact.relationship}</Text>}
            </View>
            <TouchableOpacity onPress={() => handleRemoveEmergencyContact(index)}>
              <Text style={styles.removeButton}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addContactSection}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
            value={newContactName}
            onChangeText={setNewContactName}
            placeholder="Name *"
            placeholderTextColor={colors.placeholderText}
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
            value={newContactPhone}
            onChangeText={setNewContactPhone}
            placeholder="Phone Number *"
            placeholderTextColor={colors.placeholderText}
            keyboardType="phone-pad"
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
            value={newContactRelation}
            onChangeText={setNewContactRelation}
            placeholder="Relationship (optional, e.g., 'Spouse')"
            placeholderTextColor={colors.placeholderText}
          />

          <TouchableOpacity style={styles.addButton} onPress={handleAddEmergencyContact}>
            <Text style={styles.addButtonText}>+ Add Emergency Contact</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom Message */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>💬 Custom Message</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          What the AI will tell callers. Use {'{userName}'} and {'{endTime}'} as placeholders.
        </Text>

        <TextInput
          style={[styles.messageInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Enter custom message..."
          placeholderTextColor={colors.placeholderText}
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Preview */}
      <View style={[styles.previewBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>Preview (what callers will hear):</Text>
        <Text style={[styles.previewText, { color: colors.textPrimary }]}>{getPreviewMessage()}</Text>
      </View>

      {/* Timezone */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🌍 Timezone</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
          value={timezone}
          onChangeText={setTimezone}
          placeholder="e.g., Asia/Kolkata, America/New_York"
          placeholderTextColor={colors.placeholderText}
        />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    </View>
  );
}
