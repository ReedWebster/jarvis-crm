/**
 * Notification dispatch helpers — Slack DM + Gmail sending.
 * Used by the notifications cron job to push alerts to Reed.
 */

import { supabaseAdmin } from './_supabaseAdmin.js';
import { getGoogleAccessToken } from './_googleAuth.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotificationItem {
  type: 'follow-up' | 'todo-due' | 'goal-deadline' | 'briefing-ready' | 'overdue-payment';
  title: string;
  body: string;
  urgency: 'high' | 'medium' | 'low';
}

// ─── Slack DM ───────────────────────────────────────────────────────────────

async function getSlackAuth(): Promise<{ accessToken: string; userId: string } | null> {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'slack_auth')
    .maybeSingle();

  const val = data?.value as any;
  if (!val?.accessToken || !val?.userId) return null;
  return { accessToken: val.accessToken, userId: val.userId };
}

/**
 * Send a Slack DM to the authenticated user.
 * Opens a DM channel first, then posts the message.
 */
export async function sendSlackDM(text: string, blocks?: any[]): Promise<boolean> {
  const auth = await getSlackAuth();
  if (!auth) {
    console.warn('[Notifications] Slack not connected — skipping DM');
    return false;
  }

  try {
    // Open a DM channel with the authed user
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ users: auth.userId }),
    });
    const openJson: any = await openRes.json();
    if (!openJson.ok) {
      console.error('[Notifications] Slack conversations.open failed:', openJson.error);
      return false;
    }

    const channelId = openJson.channel?.id;
    if (!channelId) return false;

    // Post the message
    const msgPayload: any = { channel: channelId, text };
    if (blocks) msgPayload.blocks = blocks;

    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(msgPayload),
    });
    const msgJson: any = await msgRes.json();
    if (!msgJson.ok) {
      console.error('[Notifications] Slack chat.postMessage failed:', msgJson.error);
      return false;
    }

    return true;
  } catch (e: any) {
    console.error('[Notifications] Slack DM error:', e?.message);
    return false;
  }
}

// ─── Gmail Send ─────────────────────────────────────────────────────────────

/**
 * Send an email via Gmail API using the stored OAuth tokens.
 * Constructs a raw RFC 2822 message and sends via Gmail's send endpoint.
 */
export async function sendGmailNotification(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  try {
    const accessToken = await getGoogleAccessToken(userId);

    // Build RFC 2822 message
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      htmlBody,
    ];
    const rawMessage = messageParts.join('\r\n');

    // Base64url encode
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Notifications] Gmail send failed:', errText);
      return false;
    }

    return true;
  } catch (e: any) {
    console.error('[Notifications] Gmail error:', e?.message);
    return false;
  }
}

// ─── Format Helpers ─────────────────────────────────────────────────────────

/**
 * Build a single Slack message from a batch of notification items.
 */
export function formatSlackMessage(items: NotificationItem[]): { text: string; blocks: any[] } {
  const urgencyEmoji: Record<string, string> = {
    high: ':red_circle:',
    medium: ':large_yellow_circle:',
    low: ':white_circle:',
  };

  const typeEmoji: Record<string, string> = {
    'follow-up': ':busts_in_silhouette:',
    'todo-due': ':ballot_box_with_check:',
    'goal-deadline': ':dart:',
    'briefing-ready': ':sunrise:',
    'overdue-payment': ':money_with_wings:',
  };

  const lines = items.map(
    (i) => `${urgencyEmoji[i.urgency]} ${typeEmoji[i.type] ?? ''} *${i.title}*\n${i.body}`,
  );

  const text = `J.A.R.V.I.S. Notifications (${items.length} items)`;

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `J.A.R.V.I.S. — ${items.length} Notification${items.length === 1 ? '' : 's'}` },
    },
    { type: 'divider' },
    ...lines.map((line) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: line },
    })),
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_Sent from <https://litehouse.vercel.app|Litehouse>_` }],
    },
  ];

  return { text, blocks };
}

/**
 * Build an HTML email body from notification items.
 */
export function formatEmailHTML(items: NotificationItem[]): string {
  const urgencyColor: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#6b7280',
  };

  const typeLabel: Record<string, string> = {
    'follow-up': 'Follow-Up',
    'todo-due': 'Todo Due',
    'goal-deadline': 'Goal Deadline',
    'briefing-ready': 'Briefing Ready',
    'overdue-payment': 'Payment Overdue',
  };

  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${urgencyColor[i.urgency]};margin-right:8px;vertical-align:middle;"></span>
          <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${typeLabel[i.type] ?? i.type}</span>
          <div style="font-weight:600;font-size:15px;margin-top:4px;color:#111827;">${i.title}</div>
          <div style="color:#4b5563;font-size:14px;margin-top:2px;">${i.body}</div>
        </td>
      </tr>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="background:#111827;padding:20px 24px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">J.A.R.V.I.S. Notifications</h1>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">${items.length} item${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} your attention</p>
      </td>
    </tr>
    ${rows}
    <tr>
      <td style="padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb;">
        <a href="https://litehouse.vercel.app" style="color:#6366f1;font-size:13px;text-decoration:none;">Open Litehouse &rarr;</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
