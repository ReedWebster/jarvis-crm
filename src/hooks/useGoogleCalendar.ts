import { useState, useRef, useCallback, useEffect } from 'react';
import type { TimeBlock, TimeCategory } from '../types';
import {
  GOOGLE_CLIENT_ID,
  ALL_GOOGLE_SCOPES,
  getLocalToken,
  saveLocalToken,
  hasEverConsented,
} from './googleSharedAuth';

interface GISResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAL_NAME    = 'Litehouse';
const LS_CAL_ID   = 'gcal_calendar_id';
const LS_MAP      = 'gcal_event_map';   // { [blockId]: gcalEventId }

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

// ─── Delete calendar events mentioning a contact name ────────────────────────

/**
 * Searches the Litehouse calendar for events mentioning the contact's name
 * and deletes them. Silently no-ops if not connected or no calendar exists.
 */
export async function deleteContactCalendarEvents(contactName: string): Promise<void> {
  const token = getLocalToken();
  if (!token) return;

  const calId = localStorage.getItem(LS_CAL_ID);
  if (!calId) return;

  try {
    const params = new URLSearchParams({ q: contactName, maxResults: '250' });
    const list = await gcalFetch(
      `/calendars/${encodeURIComponent(calId)}/events?${params}`,
      token
    );
    const events: Array<{ id: string }> = list?.items ?? [];
    await Promise.all(
      events.map(ev =>
        gcalFetch(
          `/calendars/${encodeURIComponent(calId)}/events/${ev.id}`,
          token,
          { method: 'DELETE' }
        ).catch(() => {}) // already deleted or not found — ignore
      )
    );
  } catch {
    // Silently fail — don't block the local delete
  }
}

// ─── Fetch events FROM Google Calendar ────────────────────────────────────────

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
}

interface GCalCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  selected?: boolean;
  accessRole?: string;
}

/** Fetch events from ALL visible Google Calendars for a date range, returned as TimeBlocks. */
async function fetchGoogleEvents(
  token: string,
  startDate: string,
  endDate: string,
): Promise<TimeBlock[]> {
  // 1. List all calendars the user has
  const calList = await gcalFetch('/users/me/calendarList', token);
  const calendars: GCalCalendarListEntry[] = (calList.items ?? []).filter(
    (c: GCalCalendarListEntry) => c.summary !== CAL_NAME // skip Litehouse calendar (already local)
  );

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeMin = `${startDate}T00:00:00`;
  const timeMax = `${endDate}T23:59:59`;

  // 2. Fetch events from each calendar in parallel
  const allBlocks: TimeBlock[] = [];

  await Promise.all(calendars.map(async (cal) => {
    try {
      const params = new URLSearchParams({
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        timeZone: tz,
      });
      const result = await gcalFetch(
        `/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        token,
      );
      const events: GCalEvent[] = (result?.items ?? []).filter(
        (e: GCalEvent) => e.status !== 'cancelled',
      );

      for (const ev of events) {
        // Skip all-day events (no dateTime)
        if (!ev.start?.dateTime || !ev.end?.dateTime) continue;

        const startDt = new Date(ev.start.dateTime);
        const endDt = new Date(ev.end.dateTime);
        const date = `${startDt.getFullYear()}-${String(startDt.getMonth() + 1).padStart(2, '0')}-${String(startDt.getDate()).padStart(2, '0')}`;
        const startTime = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`;
        const endTime = `${String(endDt.getHours()).padStart(2, '0')}:${String(endDt.getMinutes()).padStart(2, '0')}`;

        // Skip events that span midnight (endTime <= startTime means next day)
        if (endTime <= startTime && endTime !== '00:00') continue;
        // Clamp midnight-ending events
        const finalEnd = endTime === '00:00' ? '23:59' : endTime;

        allBlocks.push({
          id: `gcal_${ev.id}`,
          date,
          categoryId: '', // no local category
          title: ev.summary || '(No title)',
          startTime,
          endTime: finalEnd,
          notes: ev.description || '',
          energy: 3,
          googleEventId: ev.id,
          googleCalendarName: cal.summary,
        });
      }
    } catch {
      // Skip calendars that fail (e.g. permission issues)
    }
  }));

  return allBlocks;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleCalendar() {
  const [isSyncing, setIsSyncing]   = useState(false);
  const [isConnected, setIsConnected] = useState(() => !!getLocalToken());
  const [googleEvents, setGoogleEvents] = useState<TimeBlock[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: (o?: { prompt?: string }) => void } | null>(null);

  // Silently refresh the token on mount if the user has previously consented
  useEffect(() => {
    if (getLocalToken()) return; // token still valid
    if (!hasEverConsented()) return; // never consented
    // Token expired but user has consented before — silently get a new one (no popup)
    const tryRefresh = () => {
      if (!window.google?.accounts?.oauth2) return;
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: ALL_GOOGLE_SCOPES,
        callback: (response: GISResponse) => {
          if (!response.error && response.access_token && response.expires_in) {
            saveLocalToken(response.access_token, response.expires_in);
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
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: ALL_GOOGLE_SCOPES,
        callback: (response: GISResponse) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? 'No access token'));
            return;
          }
          saveLocalToken(response.access_token, response.expires_in);
          setIsConnected(true);
          resolve(response.access_token);
        },
      });
      tokenClientRef.current = client;
      client.requestAccessToken({ prompt: silent ? '' : 'consent' });
    });
  }, []);

  const syncToGoogle = useCallback(async (
    blocks: TimeBlock[],
    categories: TimeCategory[],
  ) => {
    setIsSyncing(true);
    try {
      let token = getLocalToken();
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

  /** Fetch events from all Google Calendars for a date range */
  const fetchFromGoogle = useCallback(async (startDate: string, endDate: string) => {
    setIsFetching(true);
    try {
      let token = getLocalToken();
      if (!token) {
        try { token = await getToken(true); } catch { return; }
      }
      const events = await fetchGoogleEvents(token, startDate, endDate);
      setGoogleEvents(events);
    } catch {
      // Silently fail — Google events are supplementary
    } finally {
      setIsFetching(false);
    }
  }, [getToken]);

  return { syncToGoogle, fetchFromGoogle, isSyncing, isFetching, isConnected, googleEvents };
}
