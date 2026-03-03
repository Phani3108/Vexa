import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CommonHeader from '../components/CommonHeader';
import styles from '../styles/DeliveryPreferencesScreen.styles';
import * as api from '../services/api';
import { CallCategory } from '../types/api';
import { useTheme } from '../contexts/ThemeContext';

// ─── Mock data preserved as comments ─────────────────────────────────────────
/*
const tabs = ['Food', 'Packages', 'Groceries', 'Security Gate'];
const [defaultAction, setDefaultAction] = useState('Leave at door');
const [instructions, setInstructions] = useState('Leave at the main door. Ring the bell once...');
const [autoApproveList, setAutoApproveList] = useState([
  { id: '1', name: 'Maid', icon: 'broom', frequency: 'Daily', enabled: true },
  { id: '2', name: 'Cook', icon: 'chef-hat', frequency: 'Daily', enabled: true },
  { id: '3', name: 'Water Delivery', icon: 'water', frequency: 'Weekly', enabled: true },
]);
*/
// ─────────────────────────────────────────────────────────────────────────────

const DeliveryPreferencesScreen = ({ navigation }: any) => {
  const { colors, isDark } = useTheme();
  const [categories, setCategories] = useState<CallCategory[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local editable copies for the active category
  const [editAction, setEditAction] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  /** Fetch categories from backend */
  const fetchCategories = useCallback(async () => {
    try {
      const { categories: cats } = await api.getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setEditAction(cats[0].action);
        setEditInstructions(cats[0].instructions);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  /** When active tab changes, sync local edits */
  const switchTab = (idx: number) => {
    setActiveIdx(idx);
    const cat = categories[idx];
    if (cat) {
      setEditAction(cat.action);
      setEditInstructions(cat.instructions);
    }
  };

  /** Save the active category */
  const handleSave = useCallback(async () => {
    const cat = categories[activeIdx];
    if (!cat) { return; }
    setSaving(true);
    try {
      await api.updateCategory(cat.id, { action: editAction as CallCategory['action'], instructions: editInstructions });
      // Update local state
      setCategories(prev =>
        prev.map((c, i) => (i === activeIdx ? { ...c, action: editAction as CallCategory['action'], instructions: editInstructions } : c)),
      );
      Alert.alert('Saved', `${cat.label} preferences updated`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [categories, activeIdx, editAction, editInstructions]);

  const activeCat = categories[activeIdx];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <CommonHeader
        title="AI Assistant"
        onBackPress={() => navigation.goBack()}
        showBackButton
        showRightButton
        rightButtonText={saving ? 'Saving...' : 'Save'}
        onRightButtonPress={handleSave}
      />

      {loading ? (
        <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} size="large" color={colors.accent} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Delivery Prefs</Text>

          {/* Tabs — one per category from backend */}
          <View style={styles.tabsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((cat, idx) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.tab, { backgroundColor: colors.surfaceSecondary }, activeIdx === idx && styles.tabActive]}
                  onPress={() => switchTab(idx)}
                >
                  <Text style={[styles.tabText, { color: colors.textSecondary }, activeIdx === idx && styles.tabTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {activeCat && (
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                {activeCat.label.toUpperCase()} (AI RESPONSE)
              </Text>

              {/* Default Action */}
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Default Action</Text>
                <TextInput
                  style={[styles.rowValue, { flex: 1, textAlign: 'right', color: colors.textPrimary }]}
                  value={editAction}
                  onChangeText={setEditAction}
                  placeholder="e.g. Leave at door"
                  placeholderTextColor={colors.placeholderText}
                />
              </View>

              {/* Instructions for AI */}
              <View style={styles.instructionsSection}>
                <Text style={[styles.instructionsLabel, { color: colors.textPrimary }]}>Instructions for AI</Text>
                <TextInput
                  style={[styles.instructionsInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
                  multiline
                  numberOfLines={4}
                  value={editInstructions}
                  onChangeText={setEditInstructions}
                  placeholder="Enter instructions for AI..."
                  placeholderTextColor={colors.placeholderText}
                />
                <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                  AI will use this to talk to the caller in this category.
                </Text>
              </View>
            </View>
          )}

          {categories.length === 0 && (
            <Text style={{ color: colors.textTertiary, textAlign: 'center', paddingVertical: 40 }}>
              No categories configured. Add them from the backend.
            </Text>
          )}

          {/* ── Auto-Approve List commented out — no backend concept ──
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>AUTO-APPROVE LIST</Text>
              <TouchableOpacity><Text style={styles.addButton}>+ Add New</Text></TouchableOpacity>
            </View>
            {autoApproveList.map((item) => (
              <View key={item.id} style={styles.approveItem}>
                <View style={styles.approveLeft}>
                  <View style={styles.approveIcon}><Icon name={item.icon} size={24} color="#666" /></View>
                  <View style={styles.approveInfo}>
                    <Text style={styles.approveName}>{item.name}</Text>
                    <Text style={styles.approveFrequency}>{item.frequency}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => toggleApproval(item.id)}>
                  <View style={[styles.checkbox, item.enabled && styles.checkboxActive]}>
                    {item.enabled && <Icon name="check" size={16} color="#fff" />}
                  </View>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.approveHelperText}>
              AI will automatically approve these entries when security calls.
            </Text>
          </View>
          ──────────────────────────────────────────────────────────────────────── */}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButtonLarge, saving && { opacity: 0.6 }, { backgroundColor: colors.accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={[styles.saveButtonText, { color: '#FFFFFF' }]}>{saving ? 'Saving...' : 'Save Preferences'}</Text>
          </TouchableOpacity>

          {/* Bottom padding */}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
};

export default DeliveryPreferencesScreen;
