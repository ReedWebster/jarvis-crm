/**
 * useSupabaseStorage — drop-in replacement for useLocalStorage that syncs
 * every key to a Supabase `user_data` table.
 *
 * Strategy:
 *  1. Reads from localStorage on first render (instant, no loading flash).
 *  2. When the user's session resolves, fetches the canonical value from Supabase.
 *     - If Supabase has data → use it (source of truth, updates local state + cache).
 *     - If Supabase is empty → migrate current localStorage value up to Supabase.
 *  3. Every setter call saves to localStorage immediately and debounces a Supabase upsert.
 *
 * Uses a module-level auth singleton so only ONE auth listener exists regardless
 * of how many storage keys the app has.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ─── Module-level auth singleton ─────────────────────────────────────────────

let _userId: string | null = null;
const _listeners = new Set<(uid: string | null) => void>();
let _initialized = false;

function _initAuth() {
  if (_initialized) return;
  _initialized = true;

  supabase.auth.getSession().then(({ data: { session } }) => {
    _userId = session?.user.id ?? null;
    _listeners.forEach(fn => fn(_userId));
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    _userId = session?.user.id ?? null;
    _listeners.forEach(fn => fn(_userId));
  });
}

function _subscribeUserId(fn: (uid: string | null) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSupabaseStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Fast init from localStorage (no flash on first render)
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) ?? initialValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const [userId, setUserId] = useState<string | null>(_userId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T>(storedValue);
  const userIdRef = useRef<string | null>(userId);
  latestRef.current = storedValue;
  userIdRef.current = userId;

  // ── Persist every change to localStorage ──
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (e) {
      console.warn(`[LITEHOUSE] localStorage write failed for "${key}"`, e);
    }
  }, [key, storedValue]);

  // ── Subscribe to shared auth state (one listener per hook instance) ──
  useEffect(() => {
    _initAuth();
    const unsub = _subscribeUserId(uid => setUserId(uid));
    // If auth already resolved before this hook mounted, sync immediately
    if (_userId !== userId) setUserId(_userId);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On login: load from Supabase or migrate localStorage up ──
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from('user_data')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn(`[LITEHOUSE] Load failed for "${key}":`, error.message);
          return;
        }
        if (data?.value !== undefined) {
          // Supabase is source of truth — update state + cache
          setStoredValue(data.value as T);
        } else {
          // Nothing in Supabase yet — push up what we have locally
          supabase.from('user_data').upsert(
            {
              user_id: userId,
              key,
              value: latestRef.current,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,key' }
          ).then(({ error: e }) => {
            if (e) console.warn(`[LITEHOUSE] Migration failed for "${key}":`, e.message);
          });
        }
      });

    return () => { cancelled = true; };
  }, [userId, key]);

  // ── Flush pending save immediately (used on visibility change / unload) ──
  const flushToSupabase = useCallback(
    (value: T, uid: string) => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      supabase
        .from('user_data')
        .upsert(
          { user_id: uid, key, value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        )
        .then(({ error }) => {
          if (error) console.warn(`[LITEHOUSE] Flush failed for "${key}":`, error.message);
        });
    },
    [key]
  );

  // ── Debounced save to Supabase ──
  const syncToSupabase = useCallback(
    (value: T, uid: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        supabase
          .from('user_data')
          .upsert(
            { user_id: uid, key, value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' }
          )
          .then(({ error }) => {
            if (error) console.warn(`[LITEHOUSE] Save failed for "${key}":`, error.message);
          });
      }, 500);
    },
    [key]
  );

  // ── Flush on tab hide / mobile app switch / page close ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && saveTimerRef.current && userIdRef.current) {
        flushToSupabase(latestRef.current, userIdRef.current);
      }
    };
    const handleBeforeUnload = () => {
      if (saveTimerRef.current && userIdRef.current) {
        flushToSupabase(latestRef.current, userIdRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushToSupabase]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const next = value instanceof Function ? value(prev) : value;
        if (userId) syncToSupabase(next, userId);
        return next;
      });
    },
    [userId, syncToSupabase]
  );

  return [storedValue, setValue];
}
