/**
 * Vexa — React Native App
 *
 * AuthProvider wraps the whole app so every screen can access user state.
 * SplashScreen checks auth state and navigates accordingly.
 *
 * AppNavigator owns the global socket listeners: it is the single writer of
 * the live-call store (services/transcriptStore) and auto-opens
 * IncomingCallScreen on call:started. It also sends the user back to Login
 * if the session is lost (e.g. refresh token rejected).
 */

import React, { useEffect, useRef } from 'react';
import {
  CommonActions,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
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
import { RootStackParamList } from './src/navigation/AppNavigator';
import socketService from './src/services/socket';
import * as transcriptStore from './src/services/transcriptStore';
import {
  SocketCallStartedEvent,
  SocketCallEndedEvent,
  SocketCallerNameEvent,
  SocketTranscriptClearEvent,
  SocketTranscriptDeltaEvent,
  SocketTranscriptEvent,
} from './src/types/api';

const Stack = createStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Keep the ended call's transcript around this long so IncomingCallScreen can show it. */
const ENDED_CALL_RETENTION_MS = 6000;

function AppNavigator() {
  const { isLoggedIn, isLoading } = useAuth();
  const wasLoggedIn = useRef(false);

  // If the session is lost while inside the app, go back to Login.
  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (wasLoggedIn.current && !isLoggedIn && navigationRef.isReady()) {
      const current = navigationRef.getCurrentRoute()?.name;
      if (current !== 'Login') {
        navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
      }
    }
    wasLoggedIn.current = isLoggedIn;
  }, [isLoggedIn, isLoading]);

  // Global socket listeners — single writer of the live-call store.
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };

    const openIncoming = (callId: string) => {
      const meta = transcriptStore.getSnapshot().meta;
      if (!meta || meta.callId !== callId) {
        return;
      }
      const params = {
        callId,
        callerNumber: meta.callerNumber,
        callerName: meta.callerName || meta.callerNumber,
        isVIP: meta.isVIP || false,
        inPriorityTime: meta.inPriorityTime || false,
      };
      const doNavigate = () => {
        const current = navigationRef.getCurrentRoute();
        // Don't stack a second IncomingCall for the same call, and don't
        // interrupt Splash/Login (Onboarding/Main will pick it up from the store).
        if (current?.name === 'Splash' || current?.name === 'Login') {
          return;
        }
        if (current?.name === 'IncomingCall' && (current.params as any)?.callId === callId) {
          return;
        }
        navigationRef.navigate('IncomingCall', params);
      };

      if (navigationRef.isReady()) {
        doNavigate();
        return;
      }
      // Navigator not ready yet — poll briefly so the screen isn't lost.
      let waited = 0;
      const poll = () => {
        if (navigationRef.isReady()) {
          doNavigate();
        } else if (waited < 10000) {
          waited += 200;
          later(poll, 200);
        }
      };
      later(poll, 200);
    };

    const onCallStarted = (data: SocketCallStartedEvent) => {
      transcriptStore.startCall({
        callId: data.callId,
        callerNumber: data.from,
        callerName: data.callerName && data.callerName !== 'Unknown' ? data.callerName : undefined,
        isVIP: data.isVIP || false,
        inPriorityTime: data.inPriorityTime || data.suppressNotification || false,
      });
      if (data.suppressNotification) {
        // Priority/DND mode — AI handles the call silently. Track it (home
        // widget / history) but don't pop the incoming-call screen.
        return;
      }
      openIncoming(data.callId);
    };

    /** call:started was missed (e.g. socket reconnected mid-call) — adopt the call. */
    const adoptIfUnknown = (callId: string) => {
      const snap = transcriptStore.getSnapshot();
      if (snap.callId === callId) {
        return;
      }
      if (snap.callId && !snap.ended) {
        return; // a different call is in progress — ignore stray events
      }
      transcriptStore.startCall({ callId, callerNumber: 'Unknown' });
      openIncoming(callId);
    };

    const onTranscript = (data: SocketTranscriptEvent) => {
      adoptIfUnknown(data.callId);
      transcriptStore.addTranscript(data.callId, data.speaker || 'caller', data.text);
    };

    const onDelta = (data: SocketTranscriptDeltaEvent) => {
      adoptIfUnknown(data.callId);
      transcriptStore.updateDelta(data.callId, data.fullText);
    };

    const onClear = (data: SocketTranscriptClearEvent) => {
      transcriptStore.clearStreaming(data.callId);
    };

    const onCallerName = (data: SocketCallerNameEvent) => {
      if (data.callerName) {
        transcriptStore.setCallerName(data.callId, data.callerName);
      }
    };

    const onCallEnded = (data: SocketCallEndedEvent) => {
      transcriptStore.markEnded(data.callId);
      // Keep lines briefly so IncomingCallScreen can show "call ended".
      later(() => transcriptStore.clearCall(data.callId), ENDED_CALL_RETENTION_MS);
    };

    socketService.on('call:started', onCallStarted);
    socketService.on('call:transcript', onTranscript);
    socketService.on('call:transcript:delta', onDelta);
    socketService.on('call:transcript:clear', onClear);
    socketService.on('call:caller-name', onCallerName);
    socketService.on('call:ended', onCallEnded);
    return () => {
      socketService.off('call:started', onCallStarted);
      socketService.off('call:transcript', onTranscript);
      socketService.off('call:transcript:delta', onDelta);
      socketService.off('call:transcript:clear', onClear);
      socketService.off('call:caller-name', onCallerName);
      socketService.off('call:ended', onCallEnded);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return (
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
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <AppNavigator />
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
