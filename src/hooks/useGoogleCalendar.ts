import { useState, useRef, useCallback, useEffect } from 'react';
import type { TimeBlock, TimeCategory } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_ID   = '8551940265-5t2rjjtb495tvbdj519d569vq4aa57ge.apps.googleusercontent.com';
const SCOPE       = 'https://www.googleapis.com/auth/calendar';
const CAL_NAME    = 'Litehouse';

const LS_TOKEN    = 'gcal_token';
const LS_EXPIRY   = 'gcal_token_expiry';
const LS_CAL_ID   = 'gcal_calendar_id';
const LS_MAP      = 'gcal_event_map';   // { [blockId]: gcalEventId }
const LS_CONSENTED = 'gcal_consented';  // set permanently after first successful auth

// ─── Token helpers ────────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  const token  = localStorage.getItem(LS_TOKEN);
  const expiry = localStorage.getItem(LS_EXPIRY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry, 10)) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EXPIRY);
    return null;
  }
  return token;
}

function saveToken(token: string, expiresIn: number) {
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_EXPIRY, String(Date.now() + expiresIn * 1000 - 60_000));
  localStorage.setItem(LS_CONSENTED, '1');
}

function getMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_MAP) ?? '{}'); } catch { return {}; }
}

function saveMap(map: Record<string, string>) {
  localStorage.setItem(LS_MAP, JSON.stringify(map));
}

// ─── Google Calendar API helpers ──────────────────────────────────────────────

async function gcalFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `GCal API ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// Find or create the "Litehouse" calendar, return its id
async function getOrCreateCalendar(token: string): Promise<string> {
  const stored = localStorage.getItem(LS_CAL_ID);
  if (stored) return stored;

  // List calendars and look for "Litehouse"
  const list = await gcalFetch('/users/me/calendarList', token);
  const existing = (list.items ?? []).find(
    (c: { summary: string; id: string }) => c.summary === CAL_NAME
  );
  if (existing) {
    localStorage.setItem(LS_CAL_ID, existing.id);
    return existing.id;
  }

  // Create it
  const created = await gcalFetch('/calendars', token, {
    method: 'POST',
    body: JSON.stringify({ summary: CAL_NAME }),
  });
  localStorage.setItem(LS_CAL_ID, created.id);
  return created.id;
}

// Build a Google Calendar event body from a TimeBlock
function blockToEvent(block: TimeBlock, categories: TimeCategory[]) {
  const cat  = categories.find(c => c.id === block.categoryId);
  const name = block.title?.trim() || cat?.name || 'Event';
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    summary: name,
    description: block.notes || undefined,
    start: { dateTime: `${block.date}T${block.startTime}:00`, timeZone: tz },
    end:   { dateTime: `${block.date}T${block.endTime}:00`,   timeZone: tz },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleCalendar() {
  const [isSyncing, setIsSyncing]   = useState(false);
  const [isConnected, setIsConnected] = useState(() => !!getStoredToken());
  const tokenClientRef = useRef<{ requestAccessToken: (o?: { prompt?: string }) => void } | null>(null);

  // Silently refresh the token on mount if the user has previously consented
  useEffect(() => {
    if (getStoredToken()) return; // token still valid
    if (!localStorage.getItem(LS_CONSENTED)) return; // never consented
    // Token expired but user has consented before — silently get a new one (no popup)
    const tryRefresh = () => {
      if (!window.google?.accounts?.oauth2) return;
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (!response.error && response.access_token && response.expires_in) {
            saveToken(response.access_token, response.expires_in);
            setIsConnected(true);
          }
          // silent failure — user will be prompted when they trigger a sync
        },
      });
      client.requestAccessToken({ prompt: '' });
    };
    // GIS script may not be loaded yet — wait for it
    if (window.google?.accounts?.oauth2) {
      tryRefresh();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          tryRefresh();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getToken = useCallback((silent: boolean): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google Identity Services not loaded'));
        return;
      }
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? 'No access token'));
            return;
          }
          saveToken(response.access_token, response.expires_in);
          setIsConnected(true);
          resolve(response.access_token);
        },
      });
      tokenClientRef.current.requestAccessToken({ prompt: silent ? '' : 'consent' });
    });
  }, []);

  const syncToGoogle = useCallback(async (
    blocks: TimeBlock[],
    categories: TimeCategory[],
  ) => {
    setIsSyncing(true);
    try {
      let token = getStoredToken();
      if (!token) {
        // Try silent first (no popup), fall back to interactive
        try { token = await getToken(true); } catch { token = await getToken(false); }
      }

      const calId = await getOrCreateCalendar(token);
      const map   = getMap();

      // Build set of current block ids
      const currentIds = new Set(blocks.map(b => b.id));

      // Delete gcal events for blocks that no longer exist
      const deletions = Object.entries(map)
        .filter(([blockId]) => !currentIds.has(blockId))
        .map(async ([blockId, gcalId]) => {
          try {
            await gcalFetch(`/calendars/${encodeURIComponent(calId)}/events/${gcalId}`, token!, { method: 'DELETE' });
          } catch { /* already deleted */ }
          delete map[blockId];
        });
      await Promise.all(deletions);

      // Create or update events for each block
      const upserts = blocks.map(async (block) => {
        const body = JSON.stringify(blockToEvent(block, categories));
        if (map[block.id]) {
          // Update existing
          try {
            await gcalFetch(
              `/calendars/${encodeURIComponent(calId)}/events/${map[block.id]}`,
              token!, { method: 'PUT', body }
            );
          } catch {
            // Event may have been deleted in Google — recreate it
            const created = await gcalFetch(
              `/calendars/${encodeURIComponent(calId)}/events`,
              token!, { method: 'POST', body }
            );
            map[block.id] = created.id;
          }
        } else {
          // Create new
          const created = await gcalFetch(
            `/calendars/${encodeURIComponent(calId)}/events`,
            token!, { method: 'POST', body }
          );
          map[block.id] = created.id;
        }
      });
      await Promise.all(upserts);

      saveMap(map);
    } finally {
      setIsSyncing(false);
    }
  }, [getToken]);

  return { syncToGoogle, isSyncing, isConnected };
}
