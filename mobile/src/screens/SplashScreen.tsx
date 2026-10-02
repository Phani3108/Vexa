
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Splash'>;

/** Minimum time the splash stays up so the animation can play. */
const MIN_SPLASH_MS = 2500;

const SplashScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { isLoading, isLoggedIn } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const companyFadeAnim = useRef(new Animated.Value(0)).current;
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Animations run once on mount (previously they restarted whenever auth
  // state changed because they shared an effect with navigation).
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Company name fade in after logo
    const companyTimer = setTimeout(() => {
      Animated.timing(companyFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 400);

    const minTimer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);

    return () => {
      clearTimeout(companyTimer);
      clearTimeout(minTimer);
    };
  }, [fadeAnim, scaleAnim, slideAnim, companyFadeAnim]);

  // Navigate once auth has loaded AND the minimum splash time has passed.
  useEffect(() => {
    if (minTimeElapsed && !isLoading) {
      navigation.replace(isLoggedIn ? 'Main' : 'Login');
    }
  }, [minTimeElapsed, isLoading, isLoggedIn, navigation]);

  return (
    <View style={styles.container}>
      {/* Gradient circles background effect */}
      <View style={styles.gradientCircle1} />
      <View style={styles.gradientCircle2} />
      
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: slideAnim },
            ],
          },
        ]}
      >
        {/* App Logo/Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>V</Text>
          </View>
        </View>

        {/* App Name */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            <Text style={styles.titleAI}>Vexa</Text>
          </Text>
          <Text style={styles.tagline}>Your Intelligent Call Assistant</Text>
        </View>
      </Animated.View>

      {/* Company branding at bottom */}
      <Animated.View
        style={[
          styles.companyContainer,
          { opacity: companyFadeAnim },
        ]}
      >
        <View style={styles.divider} />
        <Text style={styles.companyText}>by</Text>
        <Text style={styles.companyName}>Septara Labs</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#007AFF',
    opacity: 0.1,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -150,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#00D4FF',
    opacity: 0.08,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  titleAI: {
    color: '#007AFF',
    fontWeight: '800',
  },
  titleCaller: {
    color: '#FFFFFF',
    fontWeight: '300',
  },
  tagline: {
    fontSize: 16,
    color: '#8E93A6',
    letterSpacing: 1,
    fontWeight: '400',
  },
  companyContainer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#3A3F5C',
    marginBottom: 16,
  },
  companyText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  companyName: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 2,
  },
});

export default SplashScreen;
