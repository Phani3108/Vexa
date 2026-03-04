
import React, { useState } from 'react';
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

const LoginScreen = ({ navigation }: any) => {
  const { login } = useAuth();
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Map display phone numbers to their actual backend equivalents.
  // The user types the display number; the backend receives the real number.
  const PHONE_NUMBER_MAP: Record<string, string> = {
    '8008072908': '7977986302',
  };

  const handleLogin = async () => {
    const digits = phone.replace(/[^0-9]/g, '');
    const backendDigits = PHONE_NUMBER_MAP[digits] ?? digits;
    const fullPhone = `${countryCode}${backendDigits}`;

    if (!digits) {
      Alert.alert('Missing Info', 'Please enter your phone number.');
      return;
    }

    setLoading(true);
    try {
      const { isNewUser } = await login(fullPhone);

      if (isNewUser) {
        // First-time user — go through onboarding
        navigation.replace('Onboarding');
      } else {
        // Returning user — straight to home
        navigation.replace('Main');
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
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

        {/* Title */}
        <Text style={styles.title}>Welcome to Vexa</Text>
        <Text style={styles.subtitle}>Enter your phone number to get started.</Text>

        {/* Phone Number Section */}
        <Text style={styles.label}>PHONE NUMBER</Text>
        <View style={styles.phoneInputContainer}>
          <TouchableOpacity style={styles.countryCodePicker}>
            <Text style={styles.countryCodeText}>{countryCode}</Text>
            <Icon name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>
          <TextInput
            style={styles.phoneInput}
            placeholder="9876543210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholderTextColor="#999"
          />
        </View>

        {/* Login Button */}
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

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
