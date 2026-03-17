import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { buildBriefingPrompt } from '../lib/_briefingHelpers.js';
import type { BriefingData } from '../lib/_briefingHelpers.js';
import { getGoogleAccessToken, fetchRecentEmails, fetchTodayCalendarEvents } from '../lib/_googleAuth.js';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const briefingSchema = z.object({
  executiveSummary: z.string().describe('2-3 sentence overview of the day ahead — what matters most and why'),
  priorityTasks: z.array(z.object({
    title: z.string(),
    reasoning: z.string().describe('why this matters today'),
    priority: z.enum(['high', 'medium', 'low']),
  })).describe('3-5 most impactful tasks, cross-referencing todos, project next actions, academic deadlines, client deliverables'),
  goalsCheckIn: z.array(z.object({
    title: z.string(),
    progress: z.number().describe('0-100 percentage'),
    note: z.string().describe('status or suggestion'),
  })).describe('Only goals that need attention — behind schedule, near deadline, or blocked'),
  suggestedGoals: z.array(z.object({
    title: z.string(),
    area: z.enum(['ventures', 'academic', 'health', 'spiritual', 'financial', 'relationships', 'personal']),
    reasoning: z.string().describe('why set this goal now based on current data'),
  })).describe('1-3 new goals based on gaps in current data. Empty array if nothing useful to suggest.'),
  scheduleRecommendations: z.array(z.object({
    suggestion: z.string(),
    reasoning: z.string().describe('why this schedule change would help'),
  })).describe('1-3 specific schedule changes based on energy patterns, deadline proximity, workload'),
  contactFollowUps: z.array(z.object({
    name: z.string(),
    reason: z.string().describe('why to reach out'),
  })),
  habits: z.object({
    yesterdayRate: z.number().describe('0-100 percentage'),
    focus: z.array(z.string()).describe('habit names to focus on today'),
    streakNote: z.string().describe('observation about habit trends'),
  }),
  financialSnapshot: z.object({
    recentSpending: z.string().describe('brief summary of recent spending patterns'),
    savingsProgress: z.string().describe('status of savings goals'),
    actionItems: z.array(z.string()).describe('financial actions to take, empty if nothing to flag'),
  }),
  academicAlerts: z.array(z.object({
    course: z.string(),
    alert: z.string().describe('upcoming exam, assignment due, or grade concern'),
  })).describe('Assignments due within 7 days, upcoming exams, below-target grades. Empty if no alerts.'),
  recruitmentPipeline: z.array(z.object({
    item: z.string(),
    action: z.string().describe('what needs to happen next'),
  })).describe('Active candidates and clients needing attention. Empty if nothing active.'),
  readingProgress: z.object({
    currentlyReading: z.array(z.string()).describe('titles in progress'),
    suggestion: z.string().describe('what to read next and why'),
  }),
  socialMedia: z.array(z.object({
    item: z.string(),
    action: z.string().describe('posts to approve, schedule, or create'),
  })).describe('Pending posts/approvals. Empty if nothing pending.'),
  wellnessCheck: z.object({
    energyTrend: z.enum(['up', 'down', 'stable']),
    moodTrend: z.enum(['up', 'down', 'stable']),
    recommendation: z.string().describe('wellness suggestion based on recent logs'),
  }),
  strategicNotes: z.array(z.string()).describe('Non-obvious patterns across ALL data — energy trends, scheduling conflicts, financial patterns, relationship maintenance gaps'),
  calendar: z.array(z.object({
    time: z.string(),
    title: z.string(),
    prepNotes: z.string().describe('what to prepare'),
  })).describe('Calendar events with prep notes for meetings. Use Google Calendar events if provided.'),
  emailDigest: z.array(z.object({
    from: z.string(),
    subject: z.string(),
    summary: z.string().describe('1-sentence summary'),
    urgent: z.boolean(),
  })).describe('Summarized overnight emails. Empty if no emails provided.'),
});

const SYSTEM_PROMPT = `You are Reed Webster's personal chief of staff and life management AI.
Generate a comprehensive, actionable morning briefing synthesizing ALL data from his CRM/life system.

Rules:
- priorityTasks: Pick the 3-5 most impactful tasks. Cross-reference todos, project next actions, academic deadlines, client deliverables, and recruitment needs.
- goalsCheckIn: Only include goals that need attention (behind schedule, near deadline, or blocked).
- suggestedGoals: Propose 1-3 new goals based on gaps you see in current data — areas without goals, patterns in time/energy data, upcoming deadlines, etc. Only suggest if genuinely useful.
- scheduleRecommendations: Suggest 1-3 specific schedule changes based on energy patterns, time block analysis, deadline proximity, and workload distribution. Be concrete.
- financialSnapshot: Summarize recent financial activity, savings goal progress, and flag anything concerning. Return empty actionItems array if nothing to flag.
- academicAlerts: Flag assignments due within 7 days, upcoming exams, and courses where grades are below target. Return empty array if no alerts.
- recruitmentPipeline: Summarize active candidates and clients needing attention. Return empty array if nothing active.
- readingProgress: Note what's currently being read and suggest next reads from the want-to-read list.
- socialMedia: Flag posts needing approval, content that should be created, or scheduling gaps. Return empty array if nothing pending.
- wellnessCheck: Analyze recent mood/energy logs to surface trends and give one actionable recommendation.
- strategicNotes: Array of plain strings. Surface non-obvious patterns across ALL data.
- calendar: If Google Calendar events are provided, use those. Include prep notes for meetings.
- emailDigest: Summarize overnight emails. Flag urgent ones. Return empty array if no emails provided.
- Be direct, practical, no fluff. Like a smart executive assistant who knows EVERYTHING about Reed's life.

You MUST respond with ONLY a JSON object (no markdown fences, no explanation) using EXACTLY these keys:
{
  "executiveSummary": "string",
  "priorityTasks": [{"title": "string", "reasoning": "string", "priority": "high|medium|low"}],
  "goalsCheckIn": [{"title": "string", "progress": 0, "note": "string"}],
  "suggestedGoals": [{"title": "string", "area": "ventures|academic|health|spiritual|financial|relationships|personal", "reasoning": "string"}],
  "scheduleRecommendations": [{"suggestion": "string", "reasoning": "string"}],
  "contactFollowUps": [{"name": "string", "reason": "string"}],
  "habits": {"yesterdayRate": 0, "focus": ["string"], "streakNote": "string"},
  "financialSnapshot": {"recentSpending": "string", "savingsProgress": "string", "actionItems": ["string"]},
  "academicAlerts": [{"course": "string", "alert": "string"}],
  "recruitmentPipeline": [{"item": "string", "action": "string"}],
  "readingProgress": {"currentlyReading": ["string"], "suggestion": "string"},
  "socialMedia": [{"item": "string", "action": "string"}],
  "wellnessCheck": {"energyTrend": "up|down|stable", "moodTrend": "up|down|stable", "recommendation": "string"},
  "strategicNotes": ["plain string, not an object"],
  "calendar": [{"time": "string", "title": "string", "prepNotes": "string"}],
  "emailDigest": [{"from": "string", "subject": "string", "summary": "string", "urgent": true}]
}`;

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
    // Pull ALL CRM data in a single query
    const keys = [
      'jarvis:todos', 'jarvis:goals', 'jarvis:projects',
      'jarvis:habits', 'jarvis:habitTracker',
      'jarvis:timeBlocks', 'jarvis:timeCategories',
      'jarvis:contacts', 'jarvis:identity',
      'jarvis:courses', 'jarvis:financialEntries',
      'jarvis:savingsGoals', 'jarvis:ventureFinancials',
      'jarvis:weeklyReviews', 'jarvis:decisionLogs',
      'jarvis:readingItems', 'jarvis:candidates',
      'jarvis:notes', 'jarvis:dailyEvents',
      'jarvis:dailyMoodLogs', 'jarvis:socialPosts',
      'jarvis:socialApprovals',
    ];

    // ── Improvement #2: Parallelize ALL data fetching ──
    // DB queries + Google API run concurrently instead of sequentially
    const googleDataPromise = (async () => {
      try {
        const googleToken = await getGoogleAccessToken(userId);
        const [gmail, calendar] = await Promise.all([
          fetchRecentEmails(googleToken, 12),
          fetchTodayCalendarEvents(googleToken),
        ]);
        return { gmail, calendar, status: `gmail:${gmail.length},calendar:${calendar.length}` };
      } catch (e: any) {
        return { gmail: [] as any[], calendar: [] as any[], status: `error: ${e?.message ?? 'unknown'}` };
      }
    })();

    const [userResult, workspaceResult, googleData] = await Promise.all([
      supabaseAdmin
        .from('user_data')
        .select('key, value')
        .eq('user_id', userId)
        .in('key', keys),
      supabaseAdmin
        .from('workspace_data')
        .select('key, value')
        .eq('key', 'clients'),
      googleDataPromise,
    ]);

    if (userResult.error) {
      res.status(500).json({ error: 'Failed to fetch data', detail: userResult.error.message });
      return;
    }

    const dataMap: Record<string, any> = {};
    for (const row of userResult.data ?? []) {
      dataMap[row.key] = row.value;
    }

    const clients = workspaceResult.data?.[0]?.value ?? [];

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
      courses: dataMap['jarvis:courses'] ?? [],
      financialEntries: dataMap['jarvis:financialEntries'] ?? [],
      savingsGoals: dataMap['jarvis:savingsGoals'] ?? [],
      ventureFinancials: dataMap['jarvis:ventureFinancials'] ?? [],
      weeklyReviews: dataMap['jarvis:weeklyReviews'] ?? [],
      decisionLogs: dataMap['jarvis:decisionLogs'] ?? [],
      readingItems: dataMap['jarvis:readingItems'] ?? [],
      candidates: dataMap['jarvis:candidates'] ?? [],
      clients,
      notes: dataMap['jarvis:notes'] ?? [],
      dailyEvents: dataMap['jarvis:dailyEvents'] ?? [],
      dailyMoodLogs: dataMap['jarvis:dailyMoodLogs'] ?? [],
      socialPosts: dataMap['jarvis:socialPosts'] ?? [],
      socialApprovals: dataMap['jarvis:socialApprovals'] ?? [],
    };

    // Build the prompt (improvement #3: pre-filtered data inside buildBriefingPrompt)
    const userPrompt = buildBriefingPrompt(briefingData, googleData.gmail, googleData.calendar);

    // Generate briefing as raw JSON (no schema/tool compilation — most reliable)
    const { text: rawJson } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxTokens: 4000,
    });

    if (!rawJson) {
      res.status(502).json({ error: 'Claude returned empty response' });
      return;
    }

    // Strip markdown fences if present, then parse
    const cleaned = rawJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    let sections: z.infer<typeof briefingSchema>;
    try {
      sections = briefingSchema.parse(JSON.parse(cleaned));
    } catch (parseErr: any) {
      // Log the raw response for debugging, return user-friendly error
      console.error('[Briefing] Parse failed. Raw response:', rawJson.slice(0, 500));
      console.error('[Briefing] Parse error:', parseErr?.message?.slice(0, 300));
      res.status(502).json({ error: 'Briefing format error — retrying usually fixes this. Try again.' });
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

    res.status(200).json({ success: true, briefing, googleStatus: googleData.status });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate briefing', detail: err?.message ?? String(err) });
  }
}
