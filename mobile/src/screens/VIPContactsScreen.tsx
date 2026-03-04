import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  FlatList,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { CommonHeader } from '../components';
import styles from '../styles/VIPContactsScreen.styles';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';
import { VIPContact } from '../types/api';

// ─── Type for a phone contact ────────────────────────────────────────────────
interface PhoneContact {
  recordID: string;
  displayName: string;
  phoneNumbers: { label: string; number: string }[];
}

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

/** Normalise a phone number to digits only for duplicate detection */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
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

  // ── Contact picker state ──────────────────────────────────────────────────
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

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

  /** Add a new contact manually */
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

  // ── Contact picker helpers ────────────────────────────────────────────────

  /** Request contacts permission and load phone contacts */
  const openContactPicker = useCallback(async () => {
    try {
      setLoadingContacts(true);
      let granted = true;

      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Contacts Permission',
            message: 'Vexa needs access to your contacts to add VIP contacts.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }

      if (!granted) {
        Alert.alert('Permission Denied', 'Please allow contacts access in Settings to use this feature.');
        setLoadingContacts(false);
        return;
      }

      // Dynamic import — works only after `npm install react-native-contacts` + pod install
      let Contacts: any;
      try {
        Contacts = require('react-native-contacts').default;
      } catch {
        Alert.alert(
          'Not Available',
          'Contact picker requires react-native-contacts to be installed and linked.\n\nRun:\n  npm install react-native-contacts\n  cd ios && pod install',
        );
        setLoadingContacts(false);
        return;
      }

      if (Platform.OS === 'ios') {
        await Contacts.requestPermission();
      }

      const allContacts: PhoneContact[] = await Contacts.getAll();
      // Filter to only contacts with phone numbers, sort by name
      const withPhones = allContacts
        .filter((c: PhoneContact) => c.phoneNumbers && c.phoneNumbers.length > 0)
        .sort((a: PhoneContact, b: PhoneContact) =>
          (a.displayName || '').localeCompare(b.displayName || '')
        );

      setPhoneContacts(withPhones);
      setContactSearch('');
      setShowContactPicker(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load contacts');
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  /** Add a phone contact to VIP list */
  const handlePickContact = useCallback((contact: PhoneContact) => {
    const phone = contact.phoneNumbers[0]?.number || '';
    const normalizedNew = normalizePhone(phone);

    // Check for duplicates
    const alreadyAdded = contacts.some(c => {
      const normalizedExisting = normalizePhone(c.phoneNumber);
      return normalizedExisting === normalizedNew ||
        normalizedNew.endsWith(normalizedExisting) ||
        normalizedExisting.endsWith(normalizedNew);
    });

    if (alreadyAdded) {
      Alert.alert('Already Added', `${contact.displayName} is already a VIP contact.`);
      return;
    }

    Alert.alert(
      'Add VIP Contact',
      `Add ${contact.displayName} (${phone}) to your VIP list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: () => {
            const updated: VIPContact[] = [
              ...contacts,
              { name: contact.displayName, phoneNumber: phone },
            ];
            saveContacts(updated);
            setShowContactPicker(false);
          },
        },
      ]
    );
  }, [contacts, saveContacts]);

  const filteredContacts = phoneContacts.filter(c =>
    (c.displayName || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phoneNumbers.some(p => p.number.includes(contactSearch))
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <CommonHeader
        title="VIP Contacts"
        onBackPress={() => navigation.goBack()}
        showBackButton={true}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* DND Behaviour Info Card */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>HOW VIP CONTACTS WORK</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, marginBottom: 4 }]}>
          <View style={{ padding: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
              <Icon name="bell-ring" size={16} color="#4CAF50" style={{ marginTop: 2, marginRight: 8 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Normal mode: </Text>
                AI screens the call and offers to transfer VIP callers directly to you.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Icon name="do-not-disturb" size={16} color="#FF9800" style={{ marginTop: 2, marginRight: 8 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>DND / Priority Time: </Text>
                All calls including VIP are handled by AI — VIPs get a warmer message and are told you'll call back promptly.
              </Text>
            </View>
          </View>
        </View>

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
              placeholder="Phone Number (E.164, e.g. +919876543210)"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.placeholderText}
              style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8, marginBottom: 8, color: colors.textPrimary }}
            />
            <TextInput
              placeholder="Relationship (optional, e.g. Mom, Boss)"
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

        {/* Import from Contacts button */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginHorizontal: 16,
            marginTop: 12,
            paddingVertical: 12,
            borderRadius: 10,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors.accent,
            gap: 8,
          }}
          onPress={openContactPicker}
          disabled={loadingContacts}>
          {loadingContacts
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Icon name="contacts" size={20} color={colors.accent} />
          }
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>
            {loadingContacts ? 'Loading contacts…' : 'Import from Phone Contacts'}
          </Text>
        </TouchableOpacity>

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.floatingButton} onPress={() => setShowAdd(!showAdd)}>
        <Icon name={showAdd ? 'close' : 'plus'} size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Phone Contact Picker Modal ──────────────────────────────────────── */}
      <Modal
        visible={showContactPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
              Choose a Contact
            </Text>
            <TouchableOpacity onPress={() => setShowContactPicker(false)}>
              <Icon name="close" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            margin: 12,
            paddingHorizontal: 12,
            backgroundColor: colors.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Icon name="magnify" size={20} color={colors.textTertiary} />
            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts…"
              placeholderTextColor={colors.placeholderText}
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: colors.textPrimary, fontSize: 15 }}
              autoFocus
            />
            {contactSearch.length > 0 && (
              <TouchableOpacity onPress={() => setContactSearch('')}>
                <Icon name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Contact list */}
          <FlatList
            data={filteredContacts}
            keyExtractor={item => item.recordID}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: 40 }}>
                No contacts found
              </Text>
            }
            renderItem={({ item }) => {
              const colour = avatarColor(item.displayName || '?');
              const primaryPhone = item.phoneNumbers[0]?.number || '';
              const alreadyAdded = contacts.some(c => {
                const normalizedExisting = normalizePhone(c.phoneNumber);
                const normalizedNew = normalizePhone(primaryPhone);
                return normalizedExisting === normalizedNew ||
                  normalizedNew.endsWith(normalizedExisting) ||
                  normalizedExisting.endsWith(normalizedNew);
              });
              return (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 0.5,
                    borderBottomColor: colors.divider,
                    opacity: alreadyAdded ? 0.5 : 1,
                  }}
                  onPress={() => !alreadyAdded && handlePickContact(item)}
                  disabled={alreadyAdded}>
                  <View style={[styles.avatar, { backgroundColor: colour.bg, marginRight: 12 }]}>
                    <Text style={[styles.avatarText, { color: colour.fg }]}>
                      {(item.displayName || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>
                      {item.displayName}
                    </Text>
                    <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 2 }}>
                      {primaryPhone}
                      {item.phoneNumbers.length > 1 ? ` +${item.phoneNumbers.length - 1} more` : ''}
                    </Text>
                  </View>
                  {alreadyAdded ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="check-circle" size={18} color="#4CAF50" />
                      <Text style={{ color: '#4CAF50', fontSize: 12 }}>VIP</Text>
                    </View>
                  ) : (
                    <Icon name="plus-circle-outline" size={22} color={colors.accent} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
};

export default VIPContactsScreen;

