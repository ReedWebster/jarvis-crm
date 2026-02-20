import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      // Use `!== null` so the string "null" doesn't bypass initialValue
      return item !== null ? (JSON.parse(item) ?? initialValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Persist to localStorage in an effect so the write is decoupled from the
  // React state updater — errors here won't silently swallow data.
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`[Jarvis] Could not save "${key}" to localStorage:`, error);
    }
  }, [key, storedValue]);

  // Sync across tabs: if another window writes the same key, reflect it here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        setStoredValue(JSON.parse(e.newValue) ?? initialValue);
      } catch {
        // Ignore parse errors from other tabs
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initialValue]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => value instanceof Function ? value(prev) : value);
  }, []);

  return [storedValue, setValue];
}

export function useAppState() {
  // Each section has its own storage key for better isolation
  return null;
}
