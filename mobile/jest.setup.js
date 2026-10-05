/* eslint-env jest */
import 'react-native-gesture-handler/jestSetup';

// In-memory AsyncStorage (v3 ships no jest mock)
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  const api = {
    getItem: jest.fn(async key => (key in store ? store[key] : null)),
    setItem: jest.fn(async (key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async key => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
  return { __esModule: true, default: api };
});

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// Never open a real socket in tests
jest.mock('socket.io-client', () => {
  const socket = {
    on: jest.fn(),
    off: jest.fn(),
    onAny: jest.fn(),
    offAny: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(function () {
      return this;
    }),
    disconnect: jest.fn(function () {
      return this;
    }),
    removeAllListeners: jest.fn(),
    connected: false,
    active: false,
  };
  return { io: jest.fn(() => socket), __socket: socket };
});
