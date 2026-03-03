/**
 * useCalendarNotifications — fires browser push notifications ~10 min before
 * each of today's calendar events. Works for both personal (TimeTracker) and
 * team (TeamCalendarView) calendars.
 *
 * Deduplication: sessionStorage prevents re-firing the same event per session.
 * Polling: checks every 60 s so a background tab still delivers reminders.
 */

import { useEffect, useCallback, useState } from 'react';
import { format } from 'date-fns';
import type { TimeBlock, TimeCategory } from '../types';

// ─── SESSION DEDUP ─────────────────────────────────────────────────────────────

const NOTIF_SESSION_KEY = 'vanta:calNotif';

function getNotifiedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIF_SESSION_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function markNotifiedKey(key: string) {
  try {
    const set = getNotifiedSet();
    set.add(key);
    sessionStorage.setItem(NOTIF_SESSION_KEY, JSON.stringify([...set]));
  } catch { /* quota */ }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function to12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── HOOK ──────────────────────────────────────────────────────────────────────

export interface UseCalendarNotificationsReturn {
  permissionState: NotificationPermission | 'unsupported';
  requestPermission: () => Promise<void>;
}

/**
 * @param timeBlocks    All calendar blocks (personal or team)
 * @param categories    Category list for display names
 * @param minutesBefore Notify this many minutes before each event (default 10)
 * @param calendarLabel Prefix shown in the notification title
 */
export function useCalendarNotifications(
  timeBlocks: TimeBlock[],
  categories: TimeCategory[],
  minutesBefore = 10,
  calendarLabel = 'Calendar',
): UseCalendarNotificationsReturn {
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );

  // ── Core check ───────────────────────────────────────────────────────────────
  const checkAndFire = useCallback(() => {
    if (!supported || Notification.permission !== 'granted') return;

    const now = new Date();
    const todayDateStr = format(now, 'yyyy-MM-dd');
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const notified = getNotifiedSet();

    timeBlocks
      .filter(b => b.date === todayDateStr)
      .forEach(block => {
        const minutesUntil = timeToMinutes(block.startTime) - nowMinutes;
        if (minutesUntil <= 0 || minutesUntil > minutesBefore) return;

        const key = `${block.id}:${todayDateStr}`;
        if (notified.has(key)) return;

        const catName = categories.find(c => c.id === block.categoryId)?.name ?? 'Event';
        const title = block.title?.trim() || catName;
        const min = Math.round(minutesUntil);

        try {
          const n = new Notification(`${calendarLabel} — ${title}`, {
            body: `Starting at ${to12h(block.startTime)} (in ${min} min)`,
            icon: '/pwa-192.png',
            badge: '/pwa-192.png',
            tag: `cal-event-${block.id}`,
          });
          setTimeout(() => n.close(), 12_000);
        } catch { /* blocked or unsupported option */ }

        markNotifiedKey(key);
      });
  }, [timeBlocks, categories, minutesBefore, calendarLabel, supported]);

  // Run on mount (catches events already within the window when the page loads)
  useEffect(() => {
    checkAndFire();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 60 s so background tabs still deliver reminders
  useEffect(() => {
    if (!supported) return;
    const id = setInterval(checkAndFire, 60_000);
    return () => clearInterval(id);
  }, [checkAndFire, supported]);

  // ── Permission request (must be user-gesture) ─────────────────────────────
  const requestPermission = useCallback(async () => {
    if (!supported) return;
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === 'granted') checkAndFire();
    } catch { /* some browsers don't support promise form */ }
  }, [supported, checkAndFire]);

  return { permissionState, requestPermission };
}
