import { useEffect, useRef, useCallback, useState } from 'react';
import type { Insight } from '../utils/intelligence';
import { format } from 'date-fns';

// ─── SESSION DEDUP KEY ────────────────────────────────────────────────────────
// Prevents the same notification from firing more than once per session.

const SESSION_KEY = 'jarvis:notified';

function getNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markNotified(ids: string[]) {
  try {
    const existing = getNotified();
    ids.forEach(id => existing.add(id));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...existing]));
  } catch { /* ignore quota errors */ }
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export interface UseNotificationsReturn {
  permissionState: NotificationPermission | 'unsupported';
  requestPermission: () => Promise<void>;
}

export function useNotifications(insights: Insight[]): UseNotificationsReturn {
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported'
  );

  const firedRef = useRef(false);

  // Fire notifications for urgent/high insights on first load, if permission is already granted
  useEffect(() => {
    if (!supported || Notification.permission !== 'granted') return;
    if (firedRef.current) return;
    firedRef.current = true;
    fireInsightNotifications(insights);
  }, [insights, supported]);

  const requestPermission = useCallback(async () => {
    if (!supported) return;
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === 'granted') {
        firedRef.current = true;
        fireInsightNotifications(insights);
      }
    } catch {
      // Some browsers don't support the promise form — fallback is fine
    }
  }, [insights, supported]);

  return { permissionState, requestPermission };
}

// ─── FIRE NOTIFICATIONS ───────────────────────────────────────────────────────

function fireInsightNotifications(insights: Insight[]) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const today = format(new Date(), 'yyyy-MM-dd');
  const notified = getNotified();
  const toMark: string[] = [];

  // Only notify for urgent and high priority
  const actionable = insights.filter(i =>
    (i.priority === 'urgent' || i.priority === 'high') &&
    !notified.has(`${i.id}-${today}`)
  );

  // Stagger notifications by 600ms each to avoid overwhelming
  actionable.forEach((insight, idx) => {
    setTimeout(() => {
      try {
        const n = new Notification(`J.A.R.V.I.S. — ${insight.title}`, {
          body: insight.description,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          tag: insight.id, // deduplicate at OS level too
          silent: idx > 0, // only the first one makes a sound
        });
        // Auto-close after 8 seconds
        setTimeout(() => n.close(), 8000);
      } catch { /* notification blocked or unsupported option */ }
    }, idx * 600);
    toMark.push(`${insight.id}-${today}`);
  });

  if (toMark.length > 0) markNotified(toMark);
}
