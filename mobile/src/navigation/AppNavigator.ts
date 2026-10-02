/**
 * Shared navigation types for the root stack navigator.
 * The actual Stack.Navigator lives in App.tsx.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  home: undefined;
  history: undefined;
  settings: undefined;
};

export type IncomingCallParams = {
  callId: string;
  callerNumber: string;
  callerName?: string;
  isVIP?: boolean;
  inPriorityTime?: boolean;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Onboarding: undefined;
  EditProfile: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  CallDetail: { callId: string };
  SetupForwarding: undefined;
  DeliveryPreferences: undefined;
  VIPContacts: undefined;
  IncomingCall: IncomingCallParams;
  PriorityTime: undefined;
};
