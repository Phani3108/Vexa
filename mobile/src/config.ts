/**
 * App configuration — the ONE place to change the backend URL.
 *
 * Both the REST client (services/api.ts) and Socket.io (services/socket.ts)
 * read the base URL from here via getBaseUrl().
 *
 * Local development on a device/emulator: `localhost` will NOT work on a
 * physical device (it points at the phone itself) and on the Android emulator
 * you need `http://10.0.2.2:<port>`. Point DEV_API_URL at your machine's LAN
 * IP (e.g. `http://192.168.1.20:3000`) and set USE_DEV_API to true.
 */

/** Deployed backend — Twilio webhooks and Socket.io events come from here. */
export const PROD_API_URL = 'https://vexa-9hgb.onrender.com';

/** Local backend for development (only used when USE_DEV_API is true). */
export const DEV_API_URL = 'http://10.0.2.2:3000';

/** Flip to true to talk to a locally running backend in __DEV__ builds. */
const USE_DEV_API = false;

const DEFAULT_BASE_URL =
  typeof __DEV__ !== 'undefined' && __DEV__ && USE_DEV_API ? DEV_API_URL : PROD_API_URL;

let baseUrl = DEFAULT_BASE_URL;

export function getBaseUrl(): string {
  return baseUrl;
}

/** Override the backend URL at runtime (e.g. from a hidden debug screen). */
export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/+$/, ''); // strip trailing slashes
}
