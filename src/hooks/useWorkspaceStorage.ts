/**
 * useWorkspaceStorage — like useSupabaseStorage but writes to a shared
 * `workspace_data` table (no user_id column) so ALL authenticated users
 * read/write the same data. Used for shared team resources like Clients.
 *
 * SQL to run once in Supabase SQL editor:
 * ─────────────────────────────────────────────────────────────────────
 * create table if not exists workspace_data (
 *   key        text primary key,
 *   value      jsonb not null default '[]',
 *   updated_at timestamptz default now()
 * );
 * alter table workspace_data enable row level security;
 * create policy "authenticated_all" on workspace_data
 *   for all to authenticated using (true) with check (true);
 * ─────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ─── Module-level auth singleton (same pattern as useSupabaseStorage) ────────

let _wsUserId: string | null = null;
const _wsListeners = new Set<(uid: string | null) => void>();
let _wsInitialized = false;

function _initWsAuth() {
  if (_wsInitialized) return;
  _wsInitialized = true;
  supabase.auth.getSession().then(({ data: { session } }) => {
    _wsUserId = session?.user.id ?? null;
    _wsListeners.forEach(fn => fn(_wsUserId));
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    _wsUserId = session?.user.id ?? null;
    _wsListeners.forEach(fn => fn(_wsUserId));
  });
}

function _subscribeWsUserId(fn: (uid: string | null) => void): () => void {
  _wsListeners.add(fn);
  return () => _wsListeners.delete(fn);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const lsKey = `ws:${key}`;

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(lsKey);
      return item !== null ? (JSON.parse(item) ?? initialValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const [userId, setUserId] = useState<string | null>(_wsUserId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T>(storedValue);
  const isAuthRef = useRef<boolean>(false);
  latestRef.current = storedValue;
  isAuthRef.current = !!userId;

  // Persist to localStorage on every change
  useEffect(() => {
    try { window.localStorage.setItem(lsKey, JSON.stringify(storedValue)); } catch { /* ignore */ }
  }, [lsKey, storedValue]);

  // Subscribe to shared auth state
  useEffect(() => {
    _initWsAuth();
    const unsub = _subscribeWsUserId(uid => setUserId(uid));
    if (_wsUserId !== userId) setUserId(_wsUserId);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On login: load from workspace_data or push up local data
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from('workspace_data')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn(`[WORKSPACE] Load failed for "${key}":`, error.message);
          return;
        }
        if (data?.value !== undefined) {
          setStoredValue(data.value as T);
        } else {
          // Nothing in workspace yet — push up what we have locally
          supabase
            .from('workspace_data')
            .upsert(
              { key, value: latestRef.current, updated_at: new Date().toISOString() },
              { onConflict: 'key' },
            )
            .then(({ error: e }) => {
              if (e) console.warn(`[WORKSPACE] Initial push failed for "${key}":`, e.message);
            });
        }
      });

    return () => { cancelled = true; };
  }, [userId, key]);

  // Flush pending save immediately (used on visibility change / unload)
  const flushToWorkspace = useCallback(
    (value: T) => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      supabase
        .from('workspace_data')
        .upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        )
        .then(({ error }) => {
          if (error) console.warn(`[WORKSPACE] Flush failed for "${key}":`, error.message);
        });
    },
    [key],
  );

  // Debounced save to workspace_data
  const syncToWorkspace = useCallback(
    (value: T) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        supabase
          .from('workspace_data')
          .upsert(
            { key, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
          )
          .then(({ error }) => {
            if (error) console.warn(`[WORKSPACE] Save failed for "${key}":`, error.message);
          });
      }, 500);
    },
    [key],
  );

  // Flush on tab hide / mobile app switch / page close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && saveTimerRef.current && isAuthRef.current) {
        flushToWorkspace(latestRef.current);
      }
    };
    const handleBeforeUnload = () => {
      if (saveTimerRef.current && isAuthRef.current) {
        flushToWorkspace(latestRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushToWorkspace]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const next = value instanceof Function ? value(prev) : value;
        if (userId) syncToWorkspace(next);
        return next;
      });
    },
    [userId, syncToWorkspace],
  );

  return [storedValue, setValue];
}
