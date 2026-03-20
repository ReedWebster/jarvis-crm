/**
 * Notifications cron job — checks for actionable events and dispatches
 * push notifications to Slack DM and email.
 *
 * Runs every hour. Checks:
 * 1. Contact follow-ups due today or overdue
 * 2. Todos due today or overdue
 * 3. Goal deadlines approaching (within 3 days)
 * 4. Client payments overdue
 * 5. Morning briefing ready (piggybacks on briefing cron)
 *
 * Deduplication: stores last-notified timestamps in Supabase
 * to avoid spamming the same alert.
 */

import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import {
  sendSlackDM,
  sendGmailNotification,
  formatSlackMessage,
  formatEmailHTML,
  type NotificationItem,
} from '../lib/_notificationHelpers.js';

const DEDUP_KEY = 'jarvis:notification_log';

interface NotificationLog {
  lastRun: string;
  sentIds: Record<string, string>; // id -> ISO date last notified
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth: Vercel Cron sends CRON_SECRET, manual trigger sends Supabase JWT
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];

  if (req.method === 'GET') {
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } else {
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing auth token' });
      return;
    }
    if (supabaseAdmin) {
      const token = authHeader.replace('Bearer ', '');
      const { error } = await supabaseAdmin.auth.getUser(token);
      if (error) {
        res.status(401).json({ error: 'Invalid auth token' });
        return;
      }
    }
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase is not configured.' });
    return;
  }

  const userId = process.env.BRIEFING_USER_ID;
  if (!userId) {
    res.status(500).json({ error: 'BRIEFING_USER_ID is not configured.' });
    return;
  }

  const notifyEmail = process.env.NOTIFICATION_EMAIL || process.env.VITE_OWNER_EMAIL;

  try {
    // ── Fetch all relevant data + dedup log in parallel ──
    const [dataResult, logResult, prefsResult] = await Promise.all([
      supabaseAdmin
        .from('user_data')
        .select('key, value')
        .eq('user_id', userId)
        .in('key', [
          'jarvis:contacts',
          'jarvis:todos',
          'jarvis:goals',
        ]),
      supabaseAdmin
        .from('user_data')
        .select('value')
        .eq('user_id', userId)
        .eq('key', DEDUP_KEY)
        .maybeSingle(),
      supabaseAdmin
        .from('user_data')
        .select('value')
        .eq('user_id', userId)
        .eq('key', 'jarvis:notification_prefs')
        .maybeSingle(),
    ]);

    // Also fetch clients from workspace_data
    const clientsResult = await supabaseAdmin
      .from('workspace_data')
      .select('value')
      .eq('key', 'clients')
      .maybeSingle();

    if (dataResult.error) {
      res.status(500).json({ error: 'Failed to fetch data', detail: dataResult.error.message });
      return;
    }

    const dataMap: Record<string, any> = {};
    for (const row of dataResult.data ?? []) {
      dataMap[row.key] = row.value;
    }

    const contacts: any[] = dataMap['jarvis:contacts'] ?? [];
    const todos: any[] = dataMap['jarvis:todos'] ?? [];
    const goals: any[] = dataMap['jarvis:goals'] ?? [];
    const clients: any[] = (clientsResult.data?.value as any[]) ?? [];

    // Notification preferences (defaults: all enabled)
    const prefs = (prefsResult.data?.value as any) ?? {};
    const enableSlack = prefs.slack !== false;
    const enableEmail = prefs.email !== false;
    const enabledTypes = new Set<string>(
      prefs.types ?? ['follow-up', 'todo-due', 'goal-deadline', 'overdue-payment'],
    );

    // Dedup log
    const log: NotificationLog = (logResult.data?.value as NotificationLog) ?? {
      lastRun: '',
      sentIds: {},
    };

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const items: NotificationItem[] = [];
    const newSentIds: Record<string, string> = {};

    // ── 1. Contact follow-ups ──────────────────────────────────────────────
    if (enabledTypes.has('follow-up')) {
      for (const c of contacts) {
        if (!c.followUpDate) continue;
        if (c.followUpDate > today) continue; // not yet due

        const dedupId = `follow-up:${c.id}:${c.followUpDate}`;
        if (log.sentIds[dedupId] === today) continue; // already sent today

        const overdue = c.followUpDate < today;
        items.push({
          type: 'follow-up',
          title: `${overdue ? 'Overdue: ' : ''}Follow up with ${c.name}`,
          body: c.followUpDate < today
            ? `Was due ${c.followUpDate}. ${c.company ? `(${c.company})` : ''}`
            : `Due today. ${c.company ? `(${c.company})` : ''}`,
          urgency: overdue ? 'high' : 'medium',
        });
        newSentIds[dedupId] = today;
      }
    }

    // ── 2. Todos due today or overdue ──────────────────────────────────────
    if (enabledTypes.has('todo-due')) {
      for (const t of todos) {
        if (t.status === 'done') continue;
        if (!t.dueDate) continue;
        if (t.dueDate > today) continue;

        const dedupId = `todo:${t.id}:${t.dueDate}`;
        if (log.sentIds[dedupId] === today) continue;

        const overdue = t.dueDate < today;
        items.push({
          type: 'todo-due',
          title: `${overdue ? 'Overdue: ' : ''}${t.title}`,
          body: overdue
            ? `Was due ${t.dueDate}. Priority: ${t.priority}`
            : `Due today. Priority: ${t.priority}`,
          urgency: t.priority === 'high' ? 'high' : overdue ? 'high' : 'medium',
        });
        newSentIds[dedupId] = today;
      }
    }

    // ── 3. Goal deadlines approaching ──────────────────────────────────────
    if (enabledTypes.has('goal-deadline')) {
      for (const g of goals) {
        if (g.status === 'completed') continue;
        if (!g.dueDate) continue;
        if (g.dueDate > threeDaysOut) continue; // more than 3 days out

        const dedupId = `goal:${g.id}:${g.dueDate}`;
        if (log.sentIds[dedupId] === today) continue;

        const overdue = g.dueDate < today;
        const daysLeft = Math.ceil(
          (new Date(g.dueDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        );

        items.push({
          type: 'goal-deadline',
          title: `${overdue ? 'Overdue: ' : ''}${g.title}`,
          body: overdue
            ? `Was due ${g.dueDate}. Progress: ${g.progress}%`
            : `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Progress: ${g.progress}%`,
          urgency: overdue ? 'high' : daysLeft <= 1 ? 'high' : 'medium',
        });
        newSentIds[dedupId] = today;
      }
    }

    // ── 4. Client payments overdue ─────────────────────────────────────────
    if (enabledTypes.has('overdue-payment')) {
      for (const client of clients) {
        if (!Array.isArray(client.payments)) continue;
        for (const p of client.payments) {
          if (p.status !== 'pending' && p.status !== 'overdue') continue;
          if (!p.dueDate || p.dueDate > today) continue;

          const dedupId = `payment:${client.id}:${p.id}`;
          if (log.sentIds[dedupId] === today) continue;

          items.push({
            type: 'overdue-payment',
            title: `Payment overdue: ${client.name}`,
            body: `$${p.amount} — ${p.description}. Due ${p.dueDate}`,
            urgency: 'high',
          });
          newSentIds[dedupId] = today;
        }
      }
    }

    // ── No items? Skip sending ─────────────────────────────────────────────
    if (items.length === 0) {
      // Update last run timestamp
      await supabaseAdmin.from('user_data').upsert(
        {
          user_id: userId,
          key: DEDUP_KEY,
          value: { ...log, lastRun: now.toISOString() },
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id,key' },
      );

      res.status(200).json({ success: true, sent: 0, message: 'No notifications to send' });
      return;
    }

    // Sort by urgency (high first)
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    // ── Dispatch ───────────────────────────────────────────────────────────
    const results: { slack: boolean; email: boolean } = { slack: false, email: false };

    const dispatches: Promise<void>[] = [];

    // Slack DM
    if (enableSlack) {
      dispatches.push(
        (async () => {
          const { text, blocks } = formatSlackMessage(items);
          results.slack = await sendSlackDM(text, blocks);
        })(),
      );
    }

    // Email
    if (enableEmail && notifyEmail) {
      dispatches.push(
        (async () => {
          const subject = `J.A.R.V.I.S. — ${items.length} notification${items.length === 1 ? '' : 's'} need your attention`;
          const html = formatEmailHTML(items);
          results.email = await sendGmailNotification(userId, notifyEmail, subject, html);
        })(),
      );
    }

    await Promise.all(dispatches);

    // ── Update dedup log ───────────────────────────────────────────────────
    // Clean old entries (only keep last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const cleanedIds: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...log.sentIds, ...newSentIds })) {
      if (v >= sevenDaysAgo) cleanedIds[k] = v;
    }

    await supabaseAdmin.from('user_data').upsert(
      {
        user_id: userId,
        key: DEDUP_KEY,
        value: { lastRun: now.toISOString(), sentIds: cleanedIds },
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,key' },
    );

    res.status(200).json({
      success: true,
      sent: items.length,
      channels: results,
      items: items.map((i) => ({ type: i.type, title: i.title, urgency: i.urgency })),
    });
  } catch (err: any) {
    console.error('[Notifications] Error:', err);
    res.status(500).json({ error: 'Notification job failed', detail: err?.message ?? String(err) });
  }
}
