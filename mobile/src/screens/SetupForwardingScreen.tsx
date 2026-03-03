import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Clipboard,
  Alert,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CommonHeader from '../components/CommonHeader';
import styles from '../styles/SetupForwardingScreen.styles';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const SetupForwardingScreen = ({ navigation }: any) => {
  const { userConfig } = useAuth();
  const { colors, isDark } = useTheme();

  // Use twilioNumber from backend config instead of hardcoded value
  const aiNumber = userConfig?.twilioNumber || 'Not assigned yet';
  // ─── Hardcoded number preserved as comment ──
  // const aiNumber = '+1 (555) 234-8901';
  // ────────────────────────────────────────────

  const [selectedPlatform, setSelectedPlatform] = useState<'iPhone' | 'Android' | null>(null);

  const handleCopyNumber = () => {
    if (!userConfig?.twilioNumber) {
      Alert.alert('No AI Number', 'Your Twilio number has not been assigned yet.');
      return;
    }
    Clipboard.setString(aiNumber);
    Alert.alert('Copied!', 'AI number copied to clipboard');
  };

  const handleOpenPhoneSettings = () => {
    Linking.openURL('tel:');
  };

  const handleSetupComplete = () => {
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <CommonHeader
        title="Setup Call Forwarding"
        onBackPress={() => navigation.goBack()}
        showBackButton={true}
        showRightButton={false}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>Setup Forwarding</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          To let your AI assistant screen calls, you need to forward your incoming calls to your personal AI number.
        </Text>

        {/* Platform Selection */}
        <View style={styles.platformSection}>
          <TouchableOpacity
            style={[
              styles.platformCard,
              { backgroundColor: colors.surface },
              selectedPlatform === 'iPhone' && styles.platformCardSelected,
            ]}
            onPress={() => setSelectedPlatform('iPhone')}
          >
            <View style={[styles.platformIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name="apple" size={32} color={colors.textSecondary} />
            </View>
            <Text style={[styles.platformLabel, { color: colors.textPrimary }]}>iPhone</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.platformCard,
              { backgroundColor: colors.surface },
              selectedPlatform === 'Android' && styles.platformCardSelected,
            ]}
            onPress={() => setSelectedPlatform('Android')}
          >
            <View style={[styles.platformIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name="android" size={32} color={colors.textSecondary} />
            </View>
            <Text style={[styles.platformLabel, { color: colors.textPrimary }]}>Android</Text>
          </TouchableOpacity>
        </View>

        {/* AI Number */}
        <View style={styles.numberSection}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>YOUR PERSONAL AI NUMBER</Text>
          <View style={[styles.numberCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.aiNumber, { color: colors.textPrimary }]}>{aiNumber}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyNumber}>
              <Icon name="content-copy" size={16} color={colors.accent} />
              <Text style={[styles.copyButtonText, { color: colors.accent }]}>Copy Number</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsSection}>
          <Text style={[styles.instructionsTitle, { color: colors.textPrimary }]}>Instructions</Text>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>1</Text>
            </View>
            <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
              Go to <Text style={[styles.bold, { color: colors.textPrimary }]}>Settings → Phone → Call Forwarding</Text>
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>2</Text>
            </View>
            <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
              Turn on <Text style={[styles.bold, { color: colors.textPrimary }]}>Call Forwarding</Text> and paste the AI number copied above into the "Forward To" field.
            </Text>
          </View>
        </View>

        {/* Open Settings Button */}
        <TouchableOpacity style={[styles.settingsButton, { backgroundColor: colors.surface }]} onPress={handleOpenPhoneSettings}>
          <Icon name="cog" size={20} color={colors.textSecondary} />
          <Text style={[styles.settingsButtonText, { color: colors.textPrimary }]}>Open Phone Settings</Text>
        </TouchableOpacity>

        {/* Complete Button */}
        <TouchableOpacity style={styles.completeButton} onPress={handleSetupComplete}>
          <Text style={styles.completeButtonText}>I've Set it Up</Text>
        </TouchableOpacity>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

export default SetupForwardingScreen;
