import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { buildBriefingPrompt } from '../lib/_briefingHelpers.js';
import type { BriefingData } from '../lib/_briefingHelpers.js';
import { getGoogleAccessToken, fetchRecentEmails, fetchTodayCalendarEvents } from '../lib/_googleAuth.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are Reed Webster's personal chief of staff and life management AI.
Generate a comprehensive, actionable morning briefing for today.

Structure your response as JSON with this exact shape:
{
  "executiveSummary": "2-3 sentence overview of the day ahead — what matters most and why",
  "priorityTasks": [{ "title": "...", "reasoning": "why this matters today", "priority": "high|medium|low" }],
  "goalsCheckIn": [{ "title": "...", "progress": 0-100, "note": "status or suggestion" }],
  "contactFollowUps": [{ "name": "...", "reason": "why to reach out" }],
  "habits": { "yesterdayRate": 0-100, "focus": ["habit names to focus on today"] },
  "strategicNotes": ["pattern-based suggestions, prep reminders, or strategic observations"],
  "calendar": [{ "time": "HH:MM", "title": "...", "prepNotes": "what to prepare" }],
  "emailDigest": [{ "from": "...", "subject": "...", "summary": "1-sentence summary", "urgent": true/false }]
}

Rules:
- priorityTasks: Pick the 3-5 most impactful tasks. Consider deadlines, priorities, and project context.
- goalsCheckIn: Only include goals that need attention (behind schedule, near deadline, or blocked).
- strategicNotes: Surface non-obvious patterns — energy trends, scheduling conflicts, things to prepare for upcoming deadlines.
- calendar: If Google Calendar events are provided, use those. Include prep notes for meetings that need preparation.
- emailDigest: Summarize overnight emails. Flag urgent ones. If no emails provided, return an empty array.
- Be direct, practical, no fluff. Like a smart executive assistant who knows everything about Reed's life.
- Return ONLY valid JSON, no markdown fences or extra text.`;

export default async function handler(req: any, res: any) {
  // Accept GET (Vercel Cron) or POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth: Vercel Cron sends CRON_SECRET, manual trigger sends Supabase JWT
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];

  if (req.method === 'GET') {
    // Cron trigger — verify secret
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } else {
    // POST — verify Supabase JWT
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' });
    return;
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

  try {
    // Pull all data in a single query
    const keys = [
      'jarvis:todos', 'jarvis:goals', 'jarvis:projects',
      'jarvis:habits', 'jarvis:habitTracker',
      'jarvis:timeBlocks', 'jarvis:timeCategories',
      'jarvis:contacts', 'jarvis:identity',
    ];

    const { data: rows, error: dbError } = await supabaseAdmin
      .from('user_data')
      .select('key, value')
      .eq('user_id', userId)
      .in('key', keys);

    if (dbError) {
      res.status(500).json({ error: 'Failed to fetch data', detail: dbError.message });
      return;
    }

    const dataMap: Record<string, any> = {};
    for (const row of rows ?? []) {
      dataMap[row.key] = row.value;
    }

    const briefingData: BriefingData = {
      identity: dataMap['jarvis:identity'] ?? { name: 'Reed', priorities: [] },
      todos: dataMap['jarvis:todos'] ?? [],
      goals: dataMap['jarvis:goals'] ?? [],
      projects: dataMap['jarvis:projects'] ?? [],
      habits: dataMap['jarvis:habits'] ?? [],
      habitTracker: dataMap['jarvis:habitTracker'] ?? [],
      timeBlocks: dataMap['jarvis:timeBlocks'] ?? [],
      timeCategories: dataMap['jarvis:timeCategories'] ?? [],
      contacts: dataMap['jarvis:contacts'] ?? [],
    };

    // Try to fetch Google data (Gmail + Calendar) — non-fatal if unavailable
    let gmailData: any[] = [];
    let calendarData: any[] = [];
    let googleStatus = 'not_connected';
    try {
      const googleToken = await getGoogleAccessToken(userId);
      googleStatus = 'token_ok';
      [gmailData, calendarData] = await Promise.all([
        fetchRecentEmails(googleToken, 12),
        fetchTodayCalendarEvents(googleToken),
      ]);
      googleStatus = `gmail:${gmailData.length},calendar:${calendarData.length}`;
    } catch (e: any) {
      googleStatus = `error: ${e?.message ?? 'unknown'}`;
    }

    // Build the prompt
    const userPrompt = buildBriefingPrompt(briefingData, gmailData, calendarData);

    // Call Claude API
    const r = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: 'Claude API error', detail: text });
      return;
    }

    const claudeResponse = await r.json();
    const content = Array.isArray(claudeResponse.content) && claudeResponse.content[0]?.text
      ? claudeResponse.content[0].text
      : '';

    let sections;
    try {
      sections = JSON.parse(content);
    } catch {
      res.status(502).json({ error: 'Claude response was not valid JSON', raw: content });
      return;
    }

    // Build the briefing object
    const today = new Date().toISOString().split('T')[0];
    const briefing = {
      date: today,
      generatedAt: new Date().toISOString(),
      sections,
    };

    // Store in Supabase — latest briefing + date-keyed archive
    await Promise.all([
      supabaseAdmin.from('user_data').upsert({
        user_id: userId,
        key: 'jarvis:morning_briefing',
        value: briefing,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' }),
      supabaseAdmin.from('user_data').upsert({
        user_id: userId,
        key: `jarvis:briefing:${today}`,
        value: briefing,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' }),
    ]);

    res.status(200).json({ success: true, briefing, googleStatus });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate briefing', detail: err?.message ?? String(err) });
  }
}
