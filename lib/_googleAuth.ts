/**
 * Server-side Google OAuth utilities.
 * Uses refresh tokens stored in Supabase to get fresh access tokens
 * for Gmail and Calendar API calls from API routes / cron jobs.
 */

import { supabaseAdmin } from './_supabaseAdmin.js';

// Same client ID as the frontend GIS flow
export const GOOGLE_CLIENT_ID =
  '8551940265-5t2rjjtb495tvbdj519d569vq4aa57ge.apps.googleusercontent.com';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const SB_KEY = 'jarvis:google_server_auth';

interface StoredServerAuth {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
}

/**
 * Store refresh token (and optionally access token) in Supabase.
 */
export async function saveGoogleServerAuth(
  userId: string,
  refreshToken: string,
  accessToken?: string,
  expiresIn?: number,
) {
  if (!supabaseAdmin) throw new Error('Supabase not configured');
  const auth: StoredServerAuth = {
    refresh_token: refreshToken,
    access_token: accessToken,
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };
  await supabaseAdmin.from('user_data').upsert(
    { user_id: userId, key: SB_KEY, value: auth, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' },
  );
}

/**
 * Get a valid Google access token, refreshing if needed.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase not configured');

  const { data } = await supabaseAdmin
    .from('user_data')
    .select('value')
    .eq('user_id', userId)
    .eq('key', SB_KEY)
    .maybeSingle();

  if (!data?.value) throw new Error('No Google server auth — user needs to connect Google for briefing');
  const auth = data.value as StoredServerAuth;

  // If we have a cached access token that's still valid (with 5min buffer), use it
  if (auth.access_token && auth.expires_at && Date.now() < auth.expires_at - 5 * 60 * 1000) {
    return auth.access_token;
  }

  // Refresh the token
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) throw new Error('GOOGLE_CLIENT_SECRET not configured');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: auth.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${text}`);
  }

  const tokens: any = await res.json();
  const newAccessToken = tokens.access_token as string;
  const newExpiresIn = tokens.expires_in as number;

  // Cache the new access token
  await saveGoogleServerAuth(userId, auth.refresh_token, newAccessToken, newExpiresIn);

  return newAccessToken;
}

/**
 * Fetch Gmail messages from the last N hours.
 */
export async function fetchRecentEmails(accessToken: string, hours: number = 12) {
  const query = `newer_than:${hours}h`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=15`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!listRes.ok) return [];
  const listData: any = await listRes.json();
  const messageIds: string[] = (listData.messages ?? []).map((m: any) => m.id);
  if (messageIds.length === 0) return [];

  // Fetch message details (headers only for speed)
  const emails = await Promise.all(
    messageIds.slice(0, 10).map(async (id) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) return null;
      const msg: any = await msgRes.json();
      const headers = msg.payload?.headers ?? [];
      const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value ?? '';
      return {
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.snippet ?? '',
      };
    }),
  );

  return emails.filter(Boolean);
}

/**
 * Fetch today's Google Calendar events.
 */
export async function fetchTodayCalendarEvents(accessToken: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) return [];
  const data: any = await res.json();

  return (data.items ?? []).map((event: any) => ({
    title: event.summary ?? 'Untitled',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    location: event.location ?? '',
    description: event.description?.slice(0, 200) ?? '',
  }));
}
