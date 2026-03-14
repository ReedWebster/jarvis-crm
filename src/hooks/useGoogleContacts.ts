import { useRef, useCallback } from 'react';
import type { Contact } from '../types';
import { generateId, todayStr } from '../utils';
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

const LS_SYNC_TOKEN = 'gcontacts_sync_token';

// ─── Google People API types ──────────────────────────────────────────────────

interface PersonName     { displayName?: string; }
interface EmailAddress   { value?: string; }
interface PhoneNumber    { value?: string; }
interface Organization   { name?: string; title?: string; }
interface Birthday       { date?: { year?: number; month?: number; day?: number }; }
interface PersonMetadata { deleted?: boolean; }

interface Person {
  resourceName?: string;
  metadata?: PersonMetadata;
  names?: PersonName[];
  emailAddresses?: EmailAddress[];
  phoneNumbers?: PhoneNumber[];
  organizations?: Organization[];
  birthdays?: Birthday[];
}

interface ConnectionsResponse {
  connections?: Person[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

// ─── People API fetch helpers ─────────────────────────────────────────────────

async function fetchConnections(
  accessToken: string,
  syncToken?: string | null,
): Promise<{ people: Person[]; nextSyncToken?: string }> {
  const all: Person[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,organizations,birthdays',
      pageSize: '1000',
      requestSyncToken: 'true',
      ...(syncToken  ? { syncToken }             : {}),
      ...(pageToken  ? { pageToken }             : {}),
    });

    const res = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // 400 with sync token = token stale, caller should retry without it
    if (res.status === 400 && syncToken) throw Object.assign(new Error('sync_token_expired'), { code: 400 });
    if (!res.ok) throw new Error(`People API ${res.status}`);

    const data: ConnectionsResponse = await res.json();
    if (data.connections) all.push(...data.connections);
    nextSyncToken = data.nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { people: all, nextSyncToken };
}

// ─── Map Google Person → Contact ──────────────────────────────────────────────

function mapPerson(person: Person): Contact | null {
  const name = person.names?.[0]?.displayName?.trim();
  if (!name) return null;

  const email    = person.emailAddresses?.[0]?.value?.trim() || undefined;
  const phone    = person.phoneNumbers?.[0]?.value?.trim()   || undefined;
  const org      = person.organizations?.[0];
  const company  = org?.name?.trim()  || undefined;
  const relationship = org?.title?.trim() || '';

  let birthday: string | undefined;
  const bd = person.birthdays?.[0]?.date;
  if (bd?.year && bd?.month && bd?.day) {
    birthday = `${bd.year}-${String(bd.month).padStart(2, '0')}-${String(bd.day).padStart(2, '0')}`;
  }

  return {
    id: generateId(),
    name,
    email,
    phone,
    company,
    relationship,
    tags: ['Other'],
    lastContacted: todayStr(),
    followUpNeeded: false,
    notes: '',
    interactions: [],
    linkedProjects: [],
    ...(birthday ? { birthday } : {}),
    ...(person.resourceName ? { googleResourceName: person.resourceName } : {}),
  };
}

// ─── Delete a contact from Google Contacts ────────────────────────────────────

async function deletePersonFromGoogle(resourceName: string, accessToken: string): Promise<void> {
  const res = await fetch(
    `https://people.googleapis.com/v1/${resourceName}:deleteContact`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `People API ${res.status}`);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoogleContacts() {
  const tokenClientRef = useRef<{ requestAccessToken: (o?: { prompt?: string }) => void } | null>(null);

  // Get a fresh access token — silent if GIS has a cached session, otherwise shows popup
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
          resolve(response.access_token);
        },
      });
      tokenClientRef.current = client;
      client.requestAccessToken({ prompt: silent ? '' : 'consent' });
    });
  }, []);

  /**
   * autoSync — called on page load.
   * Uses stored token + incremental sync token to fetch only new/changed contacts.
   * Returns new contacts to add (deleted contacts are ignored for now).
   * Returns null if no stored token exists (user hasn't synced yet).
   */
  const autoSync = useCallback(async (): Promise<Contact[] | null> => {
    let token = getLocalToken();

    // If no stored token, only attempt silent re-auth if user has previously consented
    if (!token) {
      if (!hasEverConsented()) return null; // never connected
      try {
        token = await getToken(true);
      } catch {
        return null; // Silent auth failed — don't show popup
      }
    }

    const storedSyncToken = localStorage.getItem(LS_SYNC_TOKEN);

    try {
      let result = await fetchConnections(token, storedSyncToken);

      // Stale sync token — retry as full sync
      if (!result) return null;

      if (result.nextSyncToken) {
        localStorage.setItem(LS_SYNC_TOKEN, result.nextSyncToken);
      }

      return result.people
        .filter(p => !p.metadata?.deleted)
        .map(mapPerson)
        .filter((c): c is Contact => c !== null);

    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { code?: number }).code === 400) {
        // Sync token stale — clear it and do a full sync
        localStorage.removeItem(LS_SYNC_TOKEN);
        const result = await fetchConnections(token);
        if (result.nextSyncToken) localStorage.setItem(LS_SYNC_TOKEN, result.nextSyncToken);
        return result.people
          .filter(p => !p.metadata?.deleted)
          .map(mapPerson)
          .filter((c): c is Contact => c !== null);
      }
      throw err;
    }
  }, [getToken]);

  /**
   * syncContacts — called by the manual "Sync Google" button.
   * Always shows OAuth popup, does a full sync, resets sync token.
   */
  const syncContacts = useCallback(async (): Promise<Contact[]> => {
    localStorage.removeItem(LS_SYNC_TOKEN); // force full sync on manual trigger
    let token: string;
    if (hasEverConsented() && !getLocalToken()) {
      // Previously consented, token just expired — try silent first
      try { token = await getToken(true); } catch { token = await getToken(false); }
    } else {
      token = await getToken(false);
    }
    const result = await fetchConnections(token);
    if (result.nextSyncToken) localStorage.setItem(LS_SYNC_TOKEN, result.nextSyncToken);
    return result.people
      .filter(p => !p.metadata?.deleted)
      .map(mapPerson)
      .filter((c): c is Contact => c !== null);
  }, [getToken]);

  /**
   * deleteContact — silently removes a contact from Google Contacts.
   * Only acts if googleResourceName is set. Skips silently if no token.
   */
  const deleteContact = useCallback(async (googleResourceName: string): Promise<void> => {
    let token = getLocalToken();
    if (!token) {
      if (!hasEverConsented()) return; // never connected
      try { token = await getToken(true); } catch { return; } // silent re-auth failed
    }
    await deletePersonFromGoogle(googleResourceName, token);
  }, [getToken]);

  return { syncContacts, autoSync, deleteContact };
}
