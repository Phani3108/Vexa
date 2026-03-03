/**
 * AI Caller — React Native App
 *
 * AuthProvider wraps the whole app so every screen can access user state.
 * SplashScreen now checks auth state and navigates accordingly.
 * A global socket listener auto-navigates to IncomingCallScreen on call:started.
 */

import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import {
  SplashScreen,
  LoginScreen,
  OnboardingScreen,
  CallDetailScreen,
  SetupForwardingScreen,
  DeliveryPreferencesScreen,
  VIPContactsScreen,
  IncomingCallScreen,
  PriorityTimeScreen,
} from './src/screens';
import TabNavigator from './src/navigation/TabNavigator';
import socketService from './src/services/socket';
import * as transcriptStore from './src/services/transcriptStore';
import { SocketCallStartedEvent } from './src/types/api';

const Stack = createStackNavigator();

function App() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const activeCallRef = useRef<string | null>(null);

  // Track active call data so we can navigate back
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    callerNumber: string;
    callerName?: string;
    isVIP?: boolean;
  } | null>(null);

  // Global socket listener — auto-show IncomingCallScreen when a call arrives.
  useEffect(() => {
    const navigateToIncoming = (callId: string, callerNumber: string, callerName?: string, isVIP?: boolean) => {
      if (activeCallRef.current === callId) return; // already showing
      activeCallRef.current = callId;
      transcriptStore.startCall(callId);
      setActiveCall({ callId, callerNumber, callerName, isVIP });
      console.log('[App] Navigating to IncomingCall for', callId);

      const doNavigate = () => {
        navigationRef.current?.navigate('IncomingCall', {
          callId,
          callerNumber,
          callerName: callerName || callerNumber,
          isVIP: isVIP || false,
        });
      };

      // If the navigator isn't ready yet (e.g. still on Onboarding or Splash),
      // wait until it is — the NavigationContainer fires onReady which sets
      // navigationRef. Poll briefly so the modal isn't lost.
      if (!navigationRef.current?.isReady()) {
        const poll = setInterval(() => {
          if (navigationRef.current?.isReady()) {
            clearInterval(poll);
            doNavigate();
          }
        }, 200);
        setTimeout(() => clearInterval(poll), 10000); // safety: stop after 10s
      } else {
        doNavigate();
      }
    };

    const onCallStarted = (data: SocketCallStartedEvent) => {
      console.log('[App] call:started received:', JSON.stringify(data));
      navigateToIncoming(data.callId, data.from, data.callerName, data.isVIP);
    };

    // Fallback: if call:started was missed, first transcript opens the screen
    // Also buffers the transcript into the store so it's shown when screen opens
    const onTranscriptFallback = (data: any) => {
      // Always buffer into store for any active call
      const speaker: 'ai' | 'caller' = data.speaker === 'ai' ? 'ai' : 'caller';
      if (activeCallRef.current === data.callId) {
        transcriptStore.addTranscript(speaker, data.text);
      } else if (!activeCallRef.current) {
        // call:started was missed — open the screen now
        console.log('[App] call:transcript fallback — opening screen for', data.callId);
        navigateToIncoming(data.callId, 'Unknown', undefined, false);
        // Store this transcript too (navigateToIncoming calls startCall)
        transcriptStore.addTranscript(speaker, data.text);
      }
    };

    const onCallEnded = () => {
      activeCallRef.current = null;
      setActiveCall(null);
      // Don't clear store immediately — let IncomingCallScreen show "call ended" first
      setTimeout(() => transcriptStore.endCall(), 6000);
    };

    socketService.on('call:started', onCallStarted);
    socketService.on('call:transcript', onTranscriptFallback);
    socketService.on('call:ended', onCallEnded);
    console.log('[App] Socket listeners registered. Connected:', socketService.isConnected);
    return () => {
      socketService.off('call:started', onCallStarted);
      socketService.off('call:transcript', onTranscriptFallback);
      socketService.off('call:ended', onCallEnded);
    };
  }, []);

  return (
    <ThemeProvider>
    <AuthProvider>
      <SafeAreaProvider>
        <ThemedStatusBar />
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="EditProfile" component={OnboardingScreen} />
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="CallDetail" component={CallDetailScreen} />
            <Stack.Screen name="SetupForwarding" component={SetupForwardingScreen} />
            <Stack.Screen name="DeliveryPreferences" component={DeliveryPreferencesScreen} />
            <Stack.Screen name="VIPContacts" component={VIPContactsScreen} />
            <Stack.Screen
              name="IncomingCall"
              component={IncomingCallScreen}
              options={{
                presentation: 'modal',
                animationTypeForReplace: 'push',
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="PriorityTime" component={PriorityTimeScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const { colors } = useTheme();
  return <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />;
}

export default App;
