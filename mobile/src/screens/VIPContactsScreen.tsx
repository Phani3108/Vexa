import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { CommonHeader } from '../components';
import styles from '../styles/VIPContactsScreen.styles';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';
import { VIPContact } from '../types/api';

// ─── Mock data preserved as comments ─────────────────────────────────────────
/*
const [vipContacts, setVipContacts] = useState([
  { id: '1', name: 'Mom', initial: 'M', initialBg: '#FFE5D0', initialColor: '#FF6B00',
    description: 'Always bypasses screening', escalate: true },
  { id: '2', name: 'Rahul (Boss)', initial: 'R', initialBg: '#E3F2FD', initialColor: '#2196F3',
    description: 'Work hours priority', escalate: true },
  { id: '3', name: 'Wife', initial: 'W', initialBg: '#F3E5F5', initialColor: '#9C27B0',
    description: 'Mobile: +91 98765 00003', escalate: true },
]);
*/
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a colour from a name for the avatar */
function avatarColor(name: string): { bg: string; fg: string } {
  const colors = [
    { bg: '#FFE5D0', fg: '#FF6B00' },
    { bg: '#E3F2FD', fg: '#2196F3' },
    { bg: '#F3E5F5', fg: '#9C27B0' },
    { bg: '#E8F5E9', fg: '#4CAF50' },
    { bg: '#FFF3E0', fg: '#FF9800' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  return colors[Math.abs(hash) % colors.length];
}

const VIPContactsScreen = ({ navigation }: any) => {
  const { userConfig, refreshConfig } = useAuth();
  const { colors, isDark } = useTheme();
  const contacts: VIPContact[] = userConfig?.vipContacts || [];

  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelationship, setNewRelationship] = useState('');

  /** Persist the full vipContacts list via PUT */
  const saveContacts = useCallback(async (updated: VIPContact[]) => {
    setSaving(true);
    try {
      await api.updateVIPContacts(updated);
      await refreshConfig();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [refreshConfig]);

  /** Delete a contact by index */
  const handleDelete = useCallback((index: number) => {
    Alert.alert('Remove VIP', `Remove ${contacts[index].name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const updated = contacts.filter((_, i) => i !== index);
          saveContacts(updated);
        },
      },
    ]);
  }, [contacts, saveContacts]);

  /** Add a new contact */
  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert('Missing info', 'Name and phone number are required');
      return;
    }
    const updated: VIPContact[] = [
      ...contacts,
      { name: newName.trim(), phoneNumber: newPhone.trim(), relationship: newRelationship.trim() || undefined },
    ];
    saveContacts(updated);
    setShowAdd(false);
    setNewName('');
    setNewPhone('');
    setNewRelationship('');
  }, [contacts, newName, newPhone, newRelationship, saveContacts]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <CommonHeader
        title="VIP Contacts"
        onBackPress={() => navigation.goBack()}
        showBackButton={true}
      />

        {/* ── Blocked tab commented out — backend has blockedNumbers[] but no CRUD API ──
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'VIP' && styles.tabActive]}
            onPress={() => setActiveTab('VIP')}
          >
            <Text style={[styles.tabText, activeTab === 'VIP' && styles.tabTextActive]}>VIP Contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'Blocked' && styles.tabActive]}
            onPress={() => setActiveTab('Blocked')}
          >
            <Text style={[styles.tabText, activeTab === 'Blocked' && styles.tabTextActive]}>Blocked</Text>
          </TouchableOpacity>
        </View>
        ──────────────────────────────────────────────────────────────────────── */}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>YOUR VIP LIST</Text>
        </View>

        {/* VIP Contacts List — from userConfig.vipContacts */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {contacts.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>
              No VIP contacts yet. Tap + to add one.
            </Text>
          )}
          {contacts.map((contact, index) => {
            const colour = avatarColor(contact.name);
            return (
              <View key={`${contact.phoneNumber}-${index}`}>
                <View style={styles.contactRow}>
                  <View style={styles.contactLeft}>
                    <View style={[styles.avatar, { backgroundColor: colour.bg }]}>
                      <Text style={[styles.avatarText, { color: colour.fg }]}>
                        {contact.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: colors.textPrimary }]}>{contact.name}</Text>
                      <Text style={[styles.contactDescription, { color: colors.textTertiary }]}>
                        {contact.relationship ? `${contact.relationship} • ` : ''}{contact.phoneNumber}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(index)}>
                    <Icon name="close-circle" size={22} color="#FF3B30" />
                  </TouchableOpacity>
                  {/* ── Escalate toggle commented out — not in backend VIPContact schema ──
                  <View style={styles.contactRight}>
                    <Text style={styles.escalateLabel}>Escalate</Text>
                    <Switch
                      value={contact.escalate}
                      onValueChange={() => toggleEscalate(contact.id)}
                      trackColor={{ false: '#E0E0E0', true: '#34C759' }}
                      thumbColor="#fff"
                    />
                  </View>
                  ──────────────────────────────────────────────────────────── */}
                </View>
                {index < contacts.length - 1 && <View style={[styles.divider, { backgroundColor: colors.divider }]} />}
              </View>
            );
          })}
        </View>

        {/* Inline Add Form */}
        {showAdd && (
          <View style={[styles.card, { marginHorizontal: 16, marginTop: 12, padding: 16, backgroundColor: colors.surface }]}>
            <TextInput
              placeholder="Name"
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={colors.placeholderText}
              style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, marginBottom: 8, color: colors.textPrimary }}
            />
            <TextInput
              placeholder="Phone Number"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.placeholderText}
              style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, marginBottom: 8, color: colors.textPrimary }}
            />
            <TextInput
              placeholder="Relationship (optional)"
              value={newRelationship}
              onChangeText={setNewRelationship}
              placeholderTextColor={colors.placeholderText}
              style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, marginBottom: 12, color: colors.textPrimary }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={{ color: colors.textTertiary, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} disabled={saving}>
                <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>
                  {saving ? 'Saving...' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Helper Text */}
        <View style={styles.helperContainer}>
          <Text style={[styles.helperText, { color: colors.textTertiary }]}>
            Calls from VIP contacts will bypass the AI screening and ring your phone immediately.
          </Text>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.floatingButton} onPress={() => setShowAdd(true)}>
        <Icon name="plus" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default VIPContactsScreen;
