/**
 * OnboardingScreen — shown only for brand-new users after their first login.
 *
 * Steps:
 *   1. Name confirmation / update
 *   2. Delivery address (address where deliveries should go)
 *   3. Done → navigate to Main
 *
 * All data is saved via PUT /api/users/config.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import * as transcriptStore from '../services/transcriptStore';

type Step = 'name' | 'address';

const STEPS: Step[] = ['name', 'address'];

const OnboardingScreen = ({ navigation }: any) => {
  const { userConfig, refreshConfig } = useAuth();
  const route = useRoute();

  // When accessed via "EditProfile" route we're in edit mode — go back instead of replacing Main
  const isEditMode = route.name === 'EditProfile';

  const [step, setStep] = useState<Step>('name');
  const [saving, setSaving] = useState(false);

  // Step 1 — Name
  const [name, setName] = useState(userConfig?.name && userConfig.name !== 'User' ? userConfig.name : '');
  const [about, setAbout] = useState(userConfig?.about || '');

  // Step 2 — Delivery Address
  const [flat, setFlat] = useState(userConfig?.deliveryAddress?.flat || '');
  const [building, setBuilding] = useState(userConfig?.deliveryAddress?.building || '');
  const [landmark, setLandmark] = useState(userConfig?.deliveryAddress?.landmark || '');
  const [street, setStreet] = useState(userConfig?.deliveryAddress?.street || '');
  const [city, setCity] = useState(userConfig?.deliveryAddress?.city || '');
  const [pincode, setPincode] = useState(userConfig?.deliveryAddress?.pincode || '');
  const [societyNotes, setSocietyNotes] = useState(userConfig?.deliveryAddress?.societyNotes || '');
  const [securityNotes, setSecurityNotes] = useState(userConfig?.deliveryAddress?.securityNotes || '');

  const stepIndex = STEPS.indexOf(step);
  const totalSteps = STEPS.length;

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < totalSteps) {
      setStep(STEPS[nextIdx]);
    }
  };

  const goBack = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      setStep(STEPS[prevIdx]);
    }
  };

  // ── Save name step ────────────────────────────────────────────────────────
  const saveNameStep = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name to continue.');
      return;
    }
    setSaving(true);
    try {
      await api.updateUserConfig({ name: name.trim(), about: about.trim() });
      await refreshConfig();
      goNext();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Save address step & finish onboarding ─────────────────────────────────
  const saveAddressAndFinish = async () => {
    setSaving(true);
    try {
      await api.updateUserConfig({
        deliveryAddress: {
          flat: flat.trim(),
          building: building.trim(),
          landmark: landmark.trim(),
          street: street.trim(),
          city: city.trim(),
          pincode: pincode.trim(),
          societyNotes: societyNotes.trim(),
          securityNotes: securityNotes.trim(),
        },
      });
      await refreshConfig();
      if (isEditMode) {
        navigation.goBack();
      } else {
        navigation.replace('Main');
        // If a call arrived during onboarding, open the live screen now
        const activeCallId = transcriptStore.getActiveCallId();
        if (activeCallId) {
          setTimeout(() => {
            navigation.navigate('IncomingCall', {
              callId: activeCallId,
              callerNumber: 'Unknown',
              callerName: undefined,
              isVIP: false,
            });
          }, 300);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Skip address (it's optional) ──────────────────────────────────────────
  const skipAndFinish = () => {
    if (isEditMode) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
      const activeCallId = transcriptStore.getActiveCallId();
      if (activeCallId) {
        setTimeout(() => {
          navigation.navigate('IncomingCall', {
            callId: activeCallId,
            callerNumber: 'Unknown',
            callerName: undefined,
            isVIP: false,
          });
        }, 300);
      }
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressDot,
              i <= stepIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Step 1: Name ─────────────────────────────────────────────────── */}
        {step === 'name' && (
          <View style={styles.stepContainer}>
            <View style={styles.iconCircle}>
              <Icon name="account" size={32} color="#007AFF" />
            </View>
            <Text style={styles.stepTitle}>What's your name?</Text>
            <Text style={styles.stepSubtitle}>
              Your AI assistant will use this when talking to callers.
            </Text>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>ABOUT YOU (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="e.g. A software engineer who receives many work calls."
              value={about}
              onChangeText={setAbout}
              multiline
              numberOfLines={3}
              placeholderTextColor="#999"
            />
            <Text style={styles.helperText}>
              The AI uses this to introduce you correctly to callers.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 32 }, saving && styles.buttonDisabled]}
              onPress={saveNameStep}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Next →</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Delivery Address ─────────────────────────────────────── */}
        {step === 'address' && (
          <View style={styles.stepContainer}>
            <View style={styles.iconCircle}>
              <Icon name="home-map-marker" size={32} color="#007AFF" />
            </View>
            <Text style={styles.stepTitle}>Your Delivery Address</Text>
            <Text style={styles.stepSubtitle}>
              When deliveries call, your AI will provide this address automatically.
            </Text>

            <Text style={styles.label}>FLAT / DOOR</Text>
            <TextInput style={styles.input} placeholder="e.g. B-304" value={flat} onChangeText={setFlat} placeholderTextColor="#999" />

            <Text style={styles.label}>BUILDING / SOCIETY</Text>
            <TextInput style={styles.input} placeholder="e.g. Sunrise Residency" value={building} onChangeText={setBuilding} placeholderTextColor="#999" />

            <Text style={styles.label}>LANDMARK</Text>
            <TextInput style={styles.input} placeholder="e.g. Near HDFC ATM" value={landmark} onChangeText={setLandmark} placeholderTextColor="#999" />

            <Text style={styles.label}>STREET</Text>
            <TextInput style={styles.input} placeholder="e.g. MG Road" value={street} onChangeText={setStreet} placeholderTextColor="#999" />

            <Text style={styles.label}>CITY</Text>
            <TextInput style={styles.input} placeholder="e.g. Mumbai" value={city} onChangeText={setCity} placeholderTextColor="#999" />

            <Text style={styles.label}>PINCODE</Text>
            <TextInput style={styles.input} placeholder="e.g. 400001" value={pincode} onChangeText={setPincode} keyboardType="number-pad" placeholderTextColor="#999" />

            <Text style={styles.label}>SOCIETY NOTES (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="e.g. Main gate is on East side, use intercom 304"
              value={societyNotes}
              onChangeText={setSocietyNotes}
              multiline
              numberOfLines={2}
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>SECURITY NOTES (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="e.g. Tell security: delivery for Rahul in B-304"
              value={securityNotes}
              onChangeText={setSecurityNotes}
              multiline
              numberOfLines={2}
              placeholderTextColor="#999"
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backButton} onPress={goBack}>
                <Icon name="arrow-left" size={18} color="#333" style={{ marginRight: 6 }} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, styles.primaryButtonFlex, saving && styles.buttonDisabled]}
                onPress={saveAddressAndFinish}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Finish Setup ✓</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.skipButton} onPress={skipAndFinish}>
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 8,
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DDD',
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
    width: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  stepContainer: {
    paddingTop: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 28,
    lineHeight: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonFlex: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 32,
  },
  backButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  skipButtonText: {
    color: '#999',
    fontSize: 14,
  },
});

export default OnboardingScreen;
