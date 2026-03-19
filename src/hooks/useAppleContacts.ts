import { useCallback } from 'react';

// ── localStorage keys for Apple Contacts credentials ─────────────────────────

const LS_APPLE_EMAIL = 'apple_contacts_email';
const LS_APPLE_APP_PASSWORD = 'apple_contacts_app_password';
const LS_APPLE_PRINCIPAL = 'apple_contacts_principal';

// ── Credential helpers ───────────────────────────────────────────────────────

export function getAppleCredentials(): { email: string; appPassword: string; principal: string } | null {
  const email = localStorage.getItem(LS_APPLE_EMAIL);
  const appPassword = localStorage.getItem(LS_APPLE_APP_PASSWORD);
  const principal = localStorage.getItem(LS_APPLE_PRINCIPAL);
  if (!email || !appPassword) return null;
  return { email, appPassword, principal: principal || '' };
}

export function saveAppleCredentials(email: string, appPassword: string, principal?: string) {
  localStorage.setItem(LS_APPLE_EMAIL, email);
  localStorage.setItem(LS_APPLE_APP_PASSWORD, appPassword);
  if (principal) localStorage.setItem(LS_APPLE_PRINCIPAL, principal);
}

export function clearAppleCredentials() {
  localStorage.removeItem(LS_APPLE_EMAIL);
  localStorage.removeItem(LS_APPLE_APP_PASSWORD);
  localStorage.removeItem(LS_APPLE_PRINCIPAL);
}

export function hasAppleCredentials(): boolean {
  return !!localStorage.getItem(LS_APPLE_EMAIL) && !!localStorage.getItem(LS_APPLE_APP_PASSWORD);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAppleContacts() {
  /**
   * deleteContact — delete a contact from iCloud via our CardDAV proxy API route.
   * Only acts if credentials are configured and uid is provided.
   */
  const deleteContact = useCallback(async (uid: string): Promise<void> => {
    const creds = getAppleCredentials();
    if (!creds) return; // not connected

    const res = await fetch('/api/apple-contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        uid,
        email: creds.email,
        appPassword: creds.appPassword,
        principal: creds.principal,
      }),
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Apple CardDAV ${res.status}`);
    }
  }, []);

  /**
   * discoverPrincipal — discover the user's CardDAV principal URL.
   * Called once when credentials are first set up.
   */
  const discoverPrincipal = useCallback(async (email: string, appPassword: string): Promise<string> => {
    const res = await fetch('/api/apple-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'discover',
        email,
        appPassword,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Discovery failed (${res.status})`);
    }

    const data = await res.json();
    return data.principal;
  }, []);

  return { deleteContact, discoverPrincipal };
}
