import * as api from '../src/services/api';

type Reply = { status: number; body: any };

function mockFetch(replies: Reply[]) {
  const calls: { url: string; init: any }[] = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const r = replies.shift();
    if (!r) {throw new Error('unexpected fetch ' + url);}
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  });
  return calls;
}

afterEach(() => {
  api.setAuthTokens(null);
  api.setTokensRefreshedListener(null);
  api.setAuthFailureListener(null);
});

test('attaches bearer token and never sends phoneNumber identity', async () => {
  api.setAuthTokens({ token: 't1', refreshToken: 'r1' });
  const calls = mockFetch([{ status: 200, body: { calls: [], total: 0 } }]);
  await api.getCalls(5, 0);
  expect(calls[0].init.headers.Authorization).toBe('Bearer t1');
  expect(calls[0].url).not.toContain('phoneNumber');
});

test('refreshes once on 401 and retries with the new token', async () => {
  api.setAuthTokens({ token: 'old', refreshToken: 'r1' });
  const refreshed = jest.fn();
  api.setTokensRefreshedListener(refreshed);
  const calls = mockFetch([
    { status: 401, body: { error: 'expired' } },
    { status: 200, body: { token: 'new', refreshToken: 'r2' } },
    { status: 200, body: { config: { userId: 'u' } } },
  ]);
  const res = await api.getUserConfig();
  expect(res.config.userId).toBe('u');
  expect(calls[1].url).toMatch(/\/api\/auth\/refresh$/);
  expect(JSON.parse(calls[1].init.body)).toEqual({ refreshToken: 'r1' });
  expect(calls[2].init.headers.Authorization).toBe('Bearer new');
  expect(refreshed).toHaveBeenCalledWith({ token: 'new', refreshToken: 'r2' });
});

test('logs out when the refresh token is rejected', async () => {
  api.setAuthTokens({ token: 'old', refreshToken: 'bad' });
  const failed = jest.fn();
  api.setAuthFailureListener(failed);
  mockFetch([
    { status: 401, body: { error: 'expired' } },
    { status: 401, body: { error: 'Invalid refresh token' } },
  ]);
  await expect(api.getUserConfig()).rejects.toMatchObject({ status: 401 });
  expect(failed).toHaveBeenCalled();
  expect(api.getAuthTokens()).toBeNull();
});

test('updateUserConfig strips non-whitelisted fields', async () => {
  api.setAuthTokens({ token: 't', refreshToken: 'r' });
  const calls = mockFetch([{ status: 200, body: { config: {}, message: 'Saved' } }]);
  await api.updateUserConfig({ name: 'A', vipContacts: [] } as any);
  expect(JSON.parse(calls[0].init.body)).toEqual({ name: 'A' });
});

test('takeover sends only callId by default', async () => {
  api.setAuthTokens({ token: 't', refreshToken: 'r' });
  const calls = mockFetch([{ status: 200, body: { success: true, message: 'ok' } }]);
  await api.takeoverCall('CA123');
  expect(JSON.parse(calls[0].init.body)).toEqual({ callId: 'CA123' });
});
