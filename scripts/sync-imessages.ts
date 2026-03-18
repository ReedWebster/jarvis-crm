#!/usr/bin/env npx tsx
/**
 * sync-imessages.ts
 *
 * Reads the macOS iMessage database (~/Library/Messages/chat.db),
 * extracts recent conversations, matches them to Litehouse contacts by phone number,
 * and uploads conversation summaries to Supabase.
 *
 * Prerequisites:
 *   1. Grant Full Disk Access to your terminal app (System Settings > Privacy & Security > Full Disk Access)
 *   2. npm install better-sqlite3 @supabase/supabase-js dotenv
 *   3. Create a .env file with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRIEFING_USER_ID
 *
 * Usage:
 *   npx tsx scripts/sync-imessages.ts
 *
 * Can be run on a cron (e.g. launchd) to keep iMessage data fresh.
 */

import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';

// Load .env.local first (pulled from Vercel), then .env as fallback
config({ path: resolve(import.meta.dirname ?? '.', '../.env.local') });
config({ path: resolve(import.meta.dirname ?? '.', '../.env') });

// ─── Config ──────────────────────────────────────────────────────────────────

const IMESSAGE_DB = resolve(process.env.HOME ?? '~', 'Library/Messages/chat.db');
const DAYS_BACK = 90; // how far back to scan messages

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.BRIEFING_USER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRIEFING_USER_ID');
  process.exit(1);
}

if (!existsSync(IMESSAGE_DB)) {
  console.error(`iMessage database not found at ${IMESSAGE_DB}`);
  console.error('This script only works on macOS with iMessage.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Phone number normalization ──────────────────────────────────────────────

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d+]/g, '');
  // If it starts with +1 or is 11 digits starting with 1, normalize to 10-digit
  if (digits.startsWith('+1') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('1') && digits.length === 11) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits; // international numbers stay as-is
}

// ─── iMessage DB types ───────────────────────────────────────────────────────

interface RawMessage {
  handle_id: string;
  text: string | null;
  is_from_me: number;
  date_ts: number; // seconds since epoch
  service: string;
}

interface ConversationSummary {
  handle: string; // phone or email identifier
  normalizedPhone: string | null;
  lastMessageDate: string; // ISO string
  lastMessageFromMe: boolean;
  lastMessagePreview: string;
  messageCount: number;
  myMessageCount: number;
  theirMessageCount: number;
  daysSinceLastMessage: number;
  daysSinceMyLastMessage: number;
  recentMessages: Array<{
    text: string;
    fromMe: boolean;
    date: string;
  }>;
}

// ─── Read iMessage DB ────────────────────────────────────────────────────────

function readIMessages(): ConversationSummary[] {
  const db = new Database(IMESSAGE_DB, { readonly: true });

  // iMessage stores dates as nanoseconds since 2001-01-01 (Core Data epoch)
  // Core Data epoch offset from Unix epoch
  const CORE_DATA_EPOCH = 978307200;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_BACK);
  const cutoffCoreData = (cutoffDate.getTime() / 1000 - CORE_DATA_EPOCH) * 1_000_000_000;

  const rows = db.prepare(`
    SELECT
      h.id as handle_id,
      m.text,
      m.is_from_me,
      (m.date / 1000000000 + ${CORE_DATA_EPOCH}) as date_ts,
      m.service
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.date > ?
      AND m.text IS NOT NULL
      AND m.text != ''
    ORDER BY m.date DESC
  `).all(cutoffCoreData) as RawMessage[];

  db.close();

  // Group by handle
  const byHandle = new Map<string, RawMessage[]>();
  for (const row of rows) {
    const existing = byHandle.get(row.handle_id) ?? [];
    existing.push(row);
    byHandle.set(row.handle_id, existing);
  }

  const now = new Date();
  const summaries: ConversationSummary[] = [];

  for (const [handle, messages] of byHandle) {
    // Skip group chats (they typically have chat_id patterns, not direct handles)
    // Skip very short conversations
    if (messages.length < 1) continue;

    const sorted = messages.sort((a, b) => b.date_ts - a.date_ts); // newest first
    const latest = sorted[0];
    const myMessages = sorted.filter(m => m.is_from_me === 1);
    const theirMessages = sorted.filter(m => m.is_from_me === 0);
    const latestFromMe = myMessages[0];

    const lastDate = new Date(latest.date_ts * 1000);
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    const lastMyDate = latestFromMe ? new Date(latestFromMe.date_ts * 1000) : lastDate;
    const daysSinceMyLast = Math.floor((now.getTime() - lastMyDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check if this looks like a phone number
    const isPhone = /^\+?\d[\d\s()-]{6,}$/.test(handle) || handle.startsWith('+');
    const normalizedPhone = isPhone ? normalizePhone(handle) : null;

    summaries.push({
      handle,
      normalizedPhone,
      lastMessageDate: lastDate.toISOString(),
      lastMessageFromMe: latest.is_from_me === 1,
      lastMessagePreview: (latest.text ?? '').slice(0, 150),
      messageCount: messages.length,
      myMessageCount: myMessages.length,
      theirMessageCount: theirMessages.length,
      daysSinceLastMessage: daysSince,
      daysSinceMyLastMessage: daysSinceMyLast,
      // Last 5 messages for AI context
      recentMessages: sorted.slice(0, 5).map(m => ({
        text: (m.text ?? '').slice(0, 200),
        fromMe: m.is_from_me === 1,
        date: new Date(m.date_ts * 1000).toISOString(),
      })),
    });
  }

  return summaries;
}

// ─── Match to contacts ───────────────────────────────────────────────────────

interface ContactMatch {
  contactId: string;
  contactName: string;
  handle: string;
  matchedBy: 'phone' | 'email';
}

async function matchToContacts(summaries: ConversationSummary[]): Promise<{
  matches: Map<string, ContactMatch>;
  unmatchedSummaries: ConversationSummary[];
}> {
  // Fetch contacts from Supabase
  const { data, error } = await supabase
    .from('user_data')
    .select('value')
    .eq('user_id', USER_ID!)
    .eq('key', 'jarvis:contacts')
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch contacts:', error.message);
    return { matches: new Map(), unmatchedSummaries: summaries };
  }

  const contacts: any[] = data?.value ?? [];

  // Build lookup maps
  const phoneToContact = new Map<string, any>();
  const emailToContact = new Map<string, any>();

  for (const contact of contacts) {
    if (contact.phone) {
      phoneToContact.set(normalizePhone(contact.phone), contact);
    }
    if (contact.email) {
      emailToContact.set(contact.email.toLowerCase(), contact);
    }
  }

  const matches = new Map<string, ContactMatch>();
  const unmatched: ConversationSummary[] = [];

  for (const summary of summaries) {
    let matched = false;

    // Try phone match
    if (summary.normalizedPhone) {
      const contact = phoneToContact.get(summary.normalizedPhone);
      if (contact) {
        matches.set(summary.handle, {
          contactId: contact.id,
          contactName: contact.name,
          handle: summary.handle,
          matchedBy: 'phone',
        });
        matched = true;
      }
    }

    // Try email match (iMessage can use email addresses as handles)
    if (!matched && summary.handle.includes('@')) {
      const contact = emailToContact.get(summary.handle.toLowerCase());
      if (contact) {
        matches.set(summary.handle, {
          contactId: contact.id,
          contactName: contact.name,
          handle: summary.handle,
          matchedBy: 'email',
        });
        matched = true;
      }
    }

    if (!matched) {
      unmatched.push(summary);
    }
  }

  return { matches, unmatchedSummaries: unmatched };
}

// ─── Upload to Supabase ──────────────────────────────────────────────────────

async function upload(
  summaries: ConversationSummary[],
  matches: Map<string, ContactMatch>,
) {
  // Build the payload: summaries enriched with contact IDs
  const enriched = summaries.map(s => ({
    ...s,
    contactId: matches.get(s.handle)?.contactId ?? null,
    contactName: matches.get(s.handle)?.contactName ?? null,
    matchedBy: matches.get(s.handle)?.matchedBy ?? null,
    // Strip full message list for storage efficiency — keep only last 5
    recentMessages: s.recentMessages.slice(0, 5),
  }));

  const { error } = await supabase.from('user_data').upsert({
    user_id: USER_ID!,
    key: 'jarvis:imessages',
    value: enriched,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,key' });

  if (error) {
    console.error('Failed to upload iMessage data:', error.message);
    process.exit(1);
  }

  return enriched;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading iMessage database...');
  const summaries = readIMessages();
  console.log(`Found ${summaries.length} conversations in the last ${DAYS_BACK} days`);

  console.log('Matching to contacts...');
  const { matches, unmatchedSummaries } = await matchToContacts(summaries);
  console.log(`Matched ${matches.size} conversations to contacts`);
  console.log(`${unmatchedSummaries.length} unmatched conversations`);

  console.log('Uploading to Supabase...');
  const enriched = await upload(summaries, matches);

  const withContact = enriched.filter(e => e.contactId);
  console.log(`\nDone! Synced ${enriched.length} conversations (${withContact.length} matched to contacts)`);

  // Show some stats
  const stale = withContact.filter(e => e.daysSinceMyLastMessage > 14);
  if (stale.length > 0) {
    console.log(`\nContacts you haven't texted in 14+ days:`);
    for (const s of stale.sort((a, b) => b.daysSinceMyLastMessage - a.daysSinceMyLastMessage).slice(0, 10)) {
      console.log(`  ${s.contactName} — ${s.daysSinceMyLastMessage}d since your last text`);
    }
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
