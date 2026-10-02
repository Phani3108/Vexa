/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Let the splash timer elapse with no saved session → Login
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
  });
  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
});
