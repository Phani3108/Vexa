/**
 * Shared navigation types for the root stack navigator.
 * The actual Stack.Navigator lives in App.tsx.
 */

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Onboarding: undefined;
  EditProfile: undefined;
  Main: undefined;
  CallDetail: { callId: string };
  SetupForwarding: undefined;
  DeliveryPreferences: undefined;
  VIPContacts: undefined;
  PriorityTime: undefined;
};
