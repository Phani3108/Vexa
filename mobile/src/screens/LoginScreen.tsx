/**
 * LoginScreen — two-step OTP login.
 *
 *   Step 1: phone number → POST /api/auth/otp/request
 *   Step 2: 6-digit code → POST /api/auth/otp/verify
 *
 * In backend dev mode the request response includes `devCode`, which we
 * prefill so testing doesn't need a real SMS.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styles from '../styles/LoginScreen.styles';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_COUNTRY_CODE = '+91';
const RESEND_COOLDOWN_SECONDS = 30;
const E164 = /^\+[1-9]\d{6,14}$/;

/** Accepts "9876543210", "+919876543210" or "+1 (555) 123-4567". */
function toE164(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  return `${DEFAULT_COUNTRY_CODE}${digits.replace(/^0+/, '')}`;
}

type Step = 'phone' | 'code';

const LoginScreen = ({ navigation }: any) => {
  const { requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [fullPhone, setFullPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<TextInput>(null);

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (target: string) => {
    setLoading(true);
    try {
      const { devCode } = await requestOtp(target);
      setFullPhone(target);
      setCode(devCode || '');
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => codeInputRef.current?.focus(), 150);
    } catch (err: any) {
      Alert.alert('Could not send code', err.message || 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = () => {
    if (!phone.replace(/\D/g, '')) {
      Alert.alert('Missing Info', 'Please enter your phone number.');
      return;
    }
    const target = toE164(phone);
    if (!E164.test(target)) {
      Alert.alert('Invalid number', 'Please enter a valid phone number, e.g. 9876543210 or +14155550123.');
      return;
    }
    sendCode(target);
  };

  const handleVerify = async () => {
    const cleaned = code.replace(/\D/g, '');
    if (cleaned.length < 4) {
      Alert.alert('Missing code', 'Please enter the code we sent you.');
      return;
    }
    setLoading(true);
    try {
      const { isNewUser } = await verifyOtp(fullPhone, cleaned);
      // First-time users go through onboarding; returning users straight home.
      navigation.replace(isNewUser ? 'Onboarding' : 'Main');
    } catch (err: any) {
      Alert.alert('Verification failed', err.message || 'Invalid or expired code.');
      setLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('phone');
    setCode('');
    setCooldown(0);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Icon name="waveform" size={36} color="#fff" />
        </View>

        {step === 'phone' ? (
          <>
            <Text style={styles.title}>Welcome to Vexa</Text>
            <Text style={styles.subtitle}>Enter your phone number to get started.</Text>

            <Text style={styles.label}>PHONE NUMBER</Text>
            <View style={styles.phoneInputContainer}>
              <View style={styles.countryCodePicker}>
                <Text style={styles.countryCodeText}>
                  {phone.trim().startsWith('+') ? '+' : DEFAULT_COUNTRY_CODE}
                </Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="9876543210"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                value={phone}
                onChangeText={setPhone}
                onSubmitEditing={handleSendCode}
                placeholderTextColor="#999"
                editable={!loading}
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>We sent a verification code to {fullPhone}.</Text>

            <Text style={styles.otpLabel}>VERIFICATION CODE</Text>
            <View style={styles.otpContainer}>
              <TextInput
                ref={codeInputRef}
                style={styles.phoneInput}
                placeholder="123456"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={8}
                value={code}
                onChangeText={t => setCode(t.replace(/\D/g, ''))}
                onSubmitEditing={handleVerify}
                placeholderTextColor="#999"
                editable={!loading}
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              {cooldown > 0 ? (
                <Text style={styles.resendText}>Resend code in {cooldown}s</Text>
              ) : (
                <>
                  <Text style={styles.resendText}>Didn't get it? </Text>
                  <TouchableOpacity onPress={() => sendCode(fullPhone)} disabled={loading}>
                    <Text style={styles.resendLink}>Resend code</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View style={styles.resendContainer}>
              <TouchableOpacity onPress={handleChangeNumber} disabled={loading}>
                <Text style={styles.resendLink}>Change number</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Terms and Privacy */}
        <View style={styles.termsContainer}>
          <Text style={styles.termsText}>By continuing, you agree to our </Text>
          <TouchableOpacity>
            <Text style={styles.termsLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.termsText}> and </Text>
          <TouchableOpacity>
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
