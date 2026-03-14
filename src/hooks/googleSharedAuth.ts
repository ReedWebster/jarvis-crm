/**
 * googleSharedAuth — single OAuth token covering Gmail + Contacts + Calendar.
 *
 * All three services use the same CLIENT_ID and the same Google account.
 * Requesting all scopes together means ONE login prompt, ONE token, ONE
 * silent-refresh path. The token is persisted in Supabase so it survives
 * page refreshes and cross-device sessions.
 *
 * Usage in a hook:
 *   const token = await getSharedToken(supabaseUserId);
 */

import { supabase } from '../lib/supabase';

// ── GIS global type ───────────────────────────────────────────────────────────

interface GISTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GISTokenResponse) => void;
          }) => { requestAccessToken: (o?: { prompt?: string }) => void };
        };
      };
    };
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID =
  '8551940265-5t2rjjtb495tvbdj519d569vq4aa57ge.apps.googleusercontent.com';

// All Google scopes the app needs — requested together so only one prompt appears
export const ALL_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

const LS_TOKEN     = 'google_shared_token';
const LS_EXPIRY    = 'google_shared_expiry';
const LS_CONSENTED = 'google_shared_consented';
const SB_KEY       = 'jarvis:google_auth';

// Refresh 5 minutes before actual expiry so requests never hit an expired token
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface StoredAuth {
  access_token: string;
  expires_at: number;
}

// ── localStorage helpers ─────────────────────────────────────────────────────

export function getLocalToken(): string | null {
  const token  = localStorage.getItem(LS_TOKEN);
  const expiry = localStorage.getItem(LS_EXPIRY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry, 10) - EXPIRY_BUFFER_MS) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRY);
    return null;
  }
  return token;
}

export function saveLocalToken(token: string, expiresIn: number) {
  const expiresAt = Date.now() + expiresIn * 1000;
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_EXPIRY, String(expiresAt));
  localStorage.setItem(LS_CONSENTED, '1');
  return expiresAt;
}

export function clearLocalToken() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EXPIRY);
}

export function hasEverConsented(): boolean {
  return !!localStorage.getItem(LS_CONSENTED);
}

// ── Supabase persistence ─────────────────────────────────────────────────────

export async function loadTokenFromSupabase(uid: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('user_data')
      .select('value')
      .eq('user_id', uid)
      .eq('key', SB_KEY)
      .maybeSingle();
    if (!data?.value) return null;
    const auth = data.value as StoredAuth;
    if (Date.now() >= auth.expires_at - EXPIRY_BUFFER_MS) return null;
    // Restore into localStorage for synchronous access
    localStorage.setItem(LS_TOKEN, auth.access_token);
    localStorage.setItem(LS_EXPIRY, String(auth.expires_at));
    return auth.access_token;
  } catch {
    return null;
  }
}

export function saveTokenToSupabase(uid: string, token: string, expiresAt: number) {
  const auth: StoredAuth = { access_token: token, expires_at: expiresAt };
  supabase.from('user_data').upsert(
    { user_id: uid, key: SB_KEY, value: auth, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' }
  ).then(() => {}); // fire and forget
}

export function clearTokenFromSupabase(uid: string) {
  supabase.from('user_data').delete().eq('user_id', uid).eq('key', SB_KEY).then(() => {});
}

// ── GIS token client ─────────────────────────────────────────────────────────

type GISCallback = (token: string, expiresAt: number) => void;
type GISErrorCallback = (err: string) => void;

function waitForGIS(): Promise<typeof window.google.accounts.oauth2> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(window.google.accounts.oauth2); return; }
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2) { clearInterval(poll); resolve(window.google.accounts.oauth2); }
      else if (attempts > 40) { clearInterval(poll); reject(new Error('GIS not loaded')); }
    }, 250);
  });
}

/**
 * Request a new token.
 * @param silent - true = no popup (fails silently if no active session)
 */
export async function requestToken(
  silent: boolean,
  onSuccess: GISCallback,
  onError: GISErrorCallback,
): Promise<void> {
  const gis = await waitForGIS();
  const client = gis.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: ALL_GOOGLE_SCOPES,
    callback: (response: GISTokenResponse) => {
      if (response.error || !response.access_token) {
        onError(response.error ?? 'no_token');
        return;
      }
      const expiresAt = saveLocalToken(response.access_token, response.expires_in);
      onSuccess(response.access_token, expiresAt);
    },
  });
  client.requestAccessToken({ prompt: silent ? '' : 'consent' });
}

/**
 * silentRefresh — try to get a fresh token without any popup.
 * Calls onSuccess/onError asynchronously.
 */
export function silentRefresh(onSuccess?: GISCallback, onError?: GISErrorCallback) {
  requestToken(
    true,
    (tok, exp) => onSuccess?.(tok, exp),
    (err) => onError?.(err),
  ).catch(() => {});
}
