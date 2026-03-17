import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { generateText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { format } from 'date-fns';
import { getGoogleAccessToken } from '../lib/_googleAuth.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodoItem {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt: string;
  linkedType?: string;
  linkedId?: string;
  linkedLabel?: string;
  checklist: Array<{ id: string; text: string; checked: boolean }>;
}

// ─── Mutable state passed to tools ────────────────────────────────────────────

interface RunState {
  userId: string;
  allTodos: TodoItem[];
  contacts: any[];
  projects: any[];
  goals: any[];
  socialApprovals: any[];
  socialPosts: any[];
  googleToken: string | null;
  actions: Array<{ todoId: string; action: string; detail: string }>;
  completedTodoIds: Set<string>;
}

// ─── Build tools that close over RunState ─────────────────────────────────────

function buildTools(state: RunState) {
  return {
    send_email: tool({
      description: 'Send an email via Gmail on behalf of Reed. Use for todos like "Email X about Y", "Send follow-up to Z", "Reply to W". Only send when the todo clearly specifies who to email and the general topic.',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action completes'),
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body text. Write as Reed — professional, direct, friendly. No fluff.'),
      }),
      execute: async ({ todoId, to, subject, body }) => {
        if (!state.googleToken) return { success: false, error: 'Gmail not connected' };
        try {
          const rawEmail = [
            `To: ${to}`,
            `Subject: ${subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            body,
          ].join('\r\n');
          const encoded = Buffer.from(rawEmail).toString('base64url');

          const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${state.googleToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
          });

          if (!res.ok) {
            const text = await res.text();
            return { success: false, error: `Gmail API error: ${text}` };
          }

          state.completedTodoIds.add(todoId);
          state.actions.push({ todoId, action: 'send_email', detail: `Sent email to ${to}: "${subject}"` });
          return { success: true, message: `Email sent to ${to}` };
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) };
        }
      },
    }),

    update_contact: tool({
      description: 'Update a contact record — mark as followed up, update follow-up date, add an interaction log. Use for todos like "Follow up with X", "Check in with Y", "Reach out to Z".',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action completes'),
        contactName: z.string().describe('Name of the contact to update'),
        markFollowedUp: z.boolean().describe('Set followUpNeeded to false'),
        newFollowUpDate: z.string().optional().describe('New follow-up date (YYYY-MM-DD) if scheduling a future check-in'),
        interactionNote: z.string().describe('Brief note for the interaction log'),
      }),
      execute: async ({ todoId, contactName, markFollowedUp, newFollowUpDate, interactionNote }) => {
        const contact = state.contacts.find((c: any) =>
          c.name.toLowerCase().includes(contactName.toLowerCase())
        );
        if (!contact) return { success: false, error: `Contact "${contactName}" not found` };

        const today = format(new Date(), 'yyyy-MM-dd');
        contact.lastContacted = today;
        if (markFollowedUp) contact.followUpNeeded = false;
        if (newFollowUpDate) {
          contact.followUpDate = newFollowUpDate;
          contact.followUpNeeded = true;
        }
        contact.interactions = contact.interactions || [];
        contact.interactions.push({
          id: crypto.randomUUID(),
          date: today,
          type: 'auto-followup',
          notes: interactionNote,
        });

        // Write contacts back
        await supabaseAdmin!.from('user_data').upsert({
          user_id: state.userId,
          key: 'jarvis:contacts',
          value: state.contacts,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });

        state.completedTodoIds.add(todoId);
        state.actions.push({ todoId, action: 'update_contact', detail: `Updated contact "${contact.name}" — ${interactionNote}` });
        return { success: true, message: `Updated ${contact.name}` };
      },
    }),

    approve_social_post: tool({
      description: 'Approve a pending social media post/approval item. Use for todos like "Review social posts", "Approve LinkedIn draft".',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action completes'),
        approvalId: z.string().describe('ID of the social approval item to approve'),
      }),
      execute: async ({ todoId, approvalId }) => {
        const item = state.socialApprovals.find((a: any) => a.id === approvalId);
        if (!item) return { success: false, error: `Approval item "${approvalId}" not found` };

        item.status = 'approved';

        await supabaseAdmin!.from('user_data').upsert({
          user_id: state.userId,
          key: 'jarvis:socialApprovals',
          value: state.socialApprovals,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });

        state.completedTodoIds.add(todoId);
        state.actions.push({ todoId, action: 'approve_social_post', detail: `Approved social post: "${item.title || item.preview?.slice(0, 50)}"` });
        return { success: true, message: `Approved: ${item.title}` };
      },
    }),

    update_project: tool({
      description: 'Update a project\'s next action, status, or notes. Use for todos related to project management updates.',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action completes'),
        projectName: z.string().describe('Name of the project'),
        nextAction: z.string().optional().describe('New next action for the project'),
        notes: z.string().optional().describe('Append to project notes'),
        health: z.enum(['green', 'yellow', 'red']).optional().describe('Update project health'),
      }),
      execute: async ({ todoId, projectName, nextAction, notes, health }) => {
        const project = state.projects.find((p: any) =>
          p.name.toLowerCase().includes(projectName.toLowerCase())
        );
        if (!project) return { success: false, error: `Project "${projectName}" not found` };

        if (nextAction) project.nextAction = nextAction;
        if (notes) project.notes = project.notes ? `${project.notes}\n${notes}` : notes;
        if (health) project.health = health;

        await supabaseAdmin!.from('user_data').upsert({
          user_id: state.userId,
          key: 'jarvis:projects',
          value: state.projects,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });

        state.completedTodoIds.add(todoId);
        state.actions.push({ todoId, action: 'update_project', detail: `Updated project "${project.name}"` });
        return { success: true, message: `Updated ${project.name}` };
      },
    }),

    mark_todo_done: tool({
      description: 'Mark a todo as done WITHOUT performing any external action. Use for: stale reminders, passed deadlines, duplicate items, expired time-based tasks, or items that are clearly no longer relevant. Do NOT use this for items that need real work — use the other tools first.',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID to mark as done'),
        reason: z.string().describe('Why this todo can be closed without action'),
      }),
      execute: async ({ todoId, reason }) => {
        state.completedTodoIds.add(todoId);
        state.actions.push({ todoId, action: 'mark_done', detail: reason });
        return { success: true, message: `Marked done: ${reason}` };
      },
    }),

    skip_todo: tool({
      description: 'Explicitly skip a todo that requires Reed\'s personal attention. Call this for every todo you cannot handle.',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID to skip'),
        reason: z.string().describe('Why this needs Reed\'s personal action'),
      }),
      execute: async ({ todoId, reason }) => {
        state.actions.push({ todoId, action: 'skipped', detail: reason });
        return { success: true, message: `Skipped: ${reason}` };
      },
    }),

    draft_email: tool({
      description: 'Draft an email for Reed to review later instead of sending immediately. Use when the email content needs Reed\'s approval first, or when the topic is sensitive enough to warrant a review. Saves the draft for Reed to send or dismiss.',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action relates to'),
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body text. Write as Reed — professional, direct, friendly. No fluff.'),
      }),
      execute: async ({ todoId, to, subject, body }) => {
        try {
          // Fetch existing drafts
          const draftsResult = await supabaseAdmin!.from('user_data')
            .select('value')
            .eq('user_id', state.userId)
            .eq('key', 'jarvis:email_drafts')
            .maybeSingle();

          const existingDrafts: any[] = draftsResult.data?.value ?? [];

          const newDraft = {
            id: crypto.randomUUID(),
            to,
            subject,
            body,
            todoId,
            createdAt: new Date().toISOString(),
            status: 'pending' as const,
          };

          existingDrafts.push(newDraft);

          await supabaseAdmin!.from('user_data').upsert({
            user_id: state.userId,
            key: 'jarvis:email_drafts',
            value: existingDrafts,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,key' });

          // Set todo to in-progress instead of done
          const todo = state.allTodos.find(t => t.id === todoId);
          if (todo) todo.status = 'in-progress';

          state.actions.push({ todoId, action: 'draft_email', detail: `Drafted email to ${to}: "${subject}"` });
          return { success: true, message: `Email draft saved for review — to ${to}: "${subject}"` };
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) };
        }
      },
    }),

    create_calendar_event: tool({
      description: 'Create a Google Calendar event. Use for todos like "Schedule meeting with X", "Block time for Y", "Set up call with Z".',
      inputSchema: z.object({
        todoId: z.string().describe('The todo ID this action completes'),
        title: z.string().describe('Event title'),
        date: z.string().describe('Event date in YYYY-MM-DD format'),
        startTime: z.string().describe('Start time in HH:MM format (24h)'),
        endTime: z.string().describe('End time in HH:MM format (24h)'),
        description: z.string().optional().describe('Optional event description'),
      }),
      execute: async ({ todoId, title, date, startTime, endTime, description }) => {
        if (!state.googleToken) return { success: false, error: 'Google Calendar not connected' };
        try {
          const event = {
            summary: title,
            description: description ?? '',
            start: {
              dateTime: `${date}T${startTime}:00`,
              timeZone: 'America/Chicago',
            },
            end: {
              dateTime: `${date}T${endTime}:00`,
              timeZone: 'America/Chicago',
            },
          };

          const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${state.googleToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          });

          if (!calRes.ok) {
            const text = await calRes.text();
            return { success: false, error: `Google Calendar API error: ${text}` };
          }

          const created = await calRes.json();

          state.completedTodoIds.add(todoId);
          state.actions.push({ todoId, action: 'create_calendar_event', detail: `Created event "${title}" on ${date} ${startTime}-${endTime}` });
          return { success: true, message: `Calendar event created: "${title}" on ${date}`, eventId: created.id };
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) };
        }
      },
    }),

    decompose_goal: tool({
      description: 'Break down a goal into 3-5 actionable sub-tasks. Use for todos like "Plan out X goal", "Break down Y into steps", or when a goal needs concrete next actions.',
      inputSchema: z.object({
        goalId: z.string().describe('The ID of the goal to decompose into sub-tasks'),
      }),
      execute: async ({ goalId }) => {
        const goal = state.goals.find((g: any) => g.id === goalId);
        if (!goal) return { success: false, error: `Goal "${goalId}" not found` };

        try {
          const { text } = await generateText({
            model: anthropic('claude-haiku-4-5-20251001'),
            system: 'You are a productivity assistant. Given a goal, generate 3-5 specific, actionable sub-tasks. Respond with ONLY a JSON array of objects with "title" (string) and "priority" ("high" | "medium" | "low") fields. No markdown fences.',
            prompt: `Goal: "${goal.title}"\nDescription: "${goal.description || 'No description'}"\nArea: ${goal.area}\nProgress: ${goal.progress}%\n\nGenerate 3-5 concrete next-step tasks to advance this goal.`,
            maxOutputTokens: 500,
          });

          const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const subtasks: Array<{ title: string; priority: string }> = JSON.parse(cleaned);

          const now = new Date().toISOString();
          const newTodos: TodoItem[] = subtasks.slice(0, 5).map(st => ({
            id: crypto.randomUUID(),
            title: st.title,
            notes: `Auto-generated sub-task for goal: ${goal.title}`,
            status: 'todo',
            priority: st.priority || 'medium',
            createdAt: now,
            linkedType: 'goal',
            linkedId: goalId,
            linkedLabel: goal.title,
            checklist: [],
          }));

          // Add new todos to local state (will be persisted at the end)
          state.allTodos.push(...newTodos);

          state.actions.push({ todoId: goalId, action: 'decompose_goal', detail: `Created ${newTodos.length} sub-tasks for goal "${goal.title}"` });
          return { success: true, message: `Created ${newTodos.length} sub-tasks for "${goal.title}"`, tasks: newTodos.map(t => t.title) };
        } catch (e: any) {
          return { success: false, error: e?.message ?? String(e) };
        }
      },
    }),
  };
}

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Litehouse, Reed Webster's personal AI chief of staff.

It's early morning. You're reviewing Reed's todo list and completing everything you can on his behalf so he wakes up with less on his plate.

You have tools to ACTUALLY DO THINGS:
- send_email: Send emails via Gmail as Reed (follow-ups, check-ins, quick replies)
- draft_email: Save an email draft for Reed to review before sending (use for sensitive or important emails)
- update_contact: Mark contacts as followed up, log interactions, set new follow-up dates
- approve_social_post: Approve pending social media posts
- update_project: Update project status, next actions, health
- create_calendar_event: Create Google Calendar events (scheduling, time blocking)
- decompose_goal: Break a goal into 3-5 actionable sub-tasks
- mark_todo_done: Close stale/expired/irrelevant todos that need no action
- skip_todo: Skip todos that need Reed personally

RULES:
1. For EVERY active todo, you must call exactly one tool (complete it OR skip it). Do not leave any todo unaddressed.
2. When sending emails, write as Reed — professional, direct, warm. No corporate speak. Sound like a real person.
3. For "follow up with X" or "check in with Y" todos: if the contact has an email, send a brief personalized email AND update the contact record. If no email, just update the contact record with an interaction note.
4. For social media approval todos: only approve posts that look on-brand and professional.
5. For project-related todos: update the project if the todo is about changing status/notes/next-action.
6. mark_todo_done is for items that are STALE, EXPIRED, or RESOLVED — not for items you're actively doing. Use the action tools first, then the todo gets auto-completed.
7. When in doubt, use skip_todo. It's better to leave something for Reed than to do it wrong.
8. NEVER send emails about sensitive topics (legal, financial, HR, personal conflicts).
9. NEVER approve social posts that contain anything controversial or off-brand.
10. For email follow-ups, keep them SHORT — 2-4 sentences max.`;

// ─── Handler ──────────────────────────────────────────────────────────────────

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

  try {
    // ── Fetch all relevant CRM data in parallel ──
    const keys = [
      'jarvis:todos', 'jarvis:contacts', 'jarvis:projects',
      'jarvis:goals', 'jarvis:socialApprovals', 'jarvis:socialPosts',
    ];

    const googleTokenPromise = (async () => {
      try { return await getGoogleAccessToken(userId); }
      catch { return null; }
    })();

    const [dbResult, googleToken] = await Promise.all([
      supabaseAdmin
        .from('user_data')
        .select('key, value')
        .eq('user_id', userId)
        .in('key', keys),
      googleTokenPromise,
    ]);

    if (dbResult.error) {
      res.status(500).json({ error: 'Failed to fetch data', detail: dbResult.error.message });
      return;
    }

    const dataMap: Record<string, any> = {};
    for (const row of dbResult.data ?? []) {
      dataMap[row.key] = row.value;
    }

    const allTodos: TodoItem[] = dataMap['jarvis:todos'] ?? [];
    const activeTodos = allTodos.filter(t => t.status !== 'done');

    if (activeTodos.length === 0) {
      res.status(200).json({ success: true, completed: 0, message: 'No active todos.' });
      return;
    }

    // ── Build run state (tools mutate this) ──
    const state: RunState = {
      userId,
      allTodos,
      contacts: dataMap['jarvis:contacts'] ?? [],
      projects: dataMap['jarvis:projects'] ?? [],
      goals: dataMap['jarvis:goals'] ?? [],
      socialApprovals: dataMap['jarvis:socialApprovals'] ?? [],
      socialPosts: dataMap['jarvis:socialPosts'] ?? [],
      googleToken,
      actions: [],
      completedTodoIds: new Set(),
    };

    const today = format(new Date(), 'yyyy-MM-dd');

    // ── Build context for Claude ──
    const todoContext = activeTodos.map(t => ({
      id: t.id,
      title: t.title,
      notes: t.notes || '',
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate || 'none',
      createdAt: t.createdAt,
      linkedType: t.linkedType || 'none',
      linkedLabel: t.linkedLabel || '',
      checklistTotal: t.checklist.length,
      checklistDone: t.checklist.filter(c => c.checked).length,
    }));

    // Include contacts with emails so Claude knows who it can email
    const contactContext = state.contacts
      .filter((c: any) => c.email || c.followUpNeeded)
      .map((c: any) => ({
        name: c.name,
        email: c.email || null,
        followUpNeeded: c.followUpNeeded,
        followUpDate: c.followUpDate || null,
        lastContacted: c.lastContacted || null,
        company: c.company || '',
        relationship: c.relationship || '',
      }));

    // Active projects for context
    const projectContext = state.projects
      .filter((p: any) => p.status === 'active')
      .map((p: any) => ({
        name: p.name,
        status: p.status,
        health: p.health,
        nextAction: p.nextAction || '',
      }));

    // Pending social approvals
    const socialContext = state.socialApprovals
      .filter((a: any) => a.status === 'pending')
      .map((a: any) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        preview: a.preview?.slice(0, 100),
      }));

    const prompt = `Today is ${today}. It's 7 AM.

═══ REED'S ACTIVE TODOS (${activeTodos.length} items) ═══
${JSON.stringify(todoContext, null, 2)}

═══ CONTACTS (with email / needing follow-up) ═══
${JSON.stringify(contactContext, null, 2)}

═══ ACTIVE PROJECTS ═══
${JSON.stringify(projectContext, null, 2)}

═══ PENDING SOCIAL APPROVALS ═══
${socialContext.length > 0 ? JSON.stringify(socialContext, null, 2) : 'None pending.'}

═══ CAPABILITIES ═══
- Gmail: ${googleToken ? 'CONNECTED — can send emails' : 'NOT CONNECTED — cannot send emails'}

Go through EVERY todo and either complete it using your tools or skip it. Be thorough but conservative.`;

    // ── Run the agent loop ──
    const maxSteps = Math.min(activeTodos.length * 2, 30); // generous but bounded

    await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt,
      tools: buildTools(state),
      maxOutputTokens: 4000,
      stopWhen: stepCountIs(maxSteps),
    });

    // ── Apply completed todos to the full list ──
    if (state.completedTodoIds.size > 0) {
      const updatedTodos = allTodos.map(t => {
        if (state.completedTodoIds.has(t.id)) {
          return {
            ...t,
            status: 'done' as const,
            checklist: t.checklist.map(c => ({ ...c, checked: true })),
          };
        }
        return t;
      });

      await supabaseAdmin.from('user_data').upsert({
        user_id: userId,
        key: 'jarvis:todos',
        value: updatedTodos,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
    }

    // ── Store log ──
    const completedActions = state.actions.filter(a => a.action !== 'skipped');
    const skippedActions = state.actions.filter(a => a.action === 'skipped');

    const logEntry = {
      date: today,
      completedAt: new Date().toISOString(),
      totalActive: activeTodos.length,
      completed: completedActions,
      skipped: skippedActions,
      gmailConnected: !!googleToken,
    };

    await supabaseAdmin.from('user_data').upsert({
      user_id: userId,
      key: `jarvis:auto_complete_log:${today}`,
      value: logEntry,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({
      success: true,
      completed: completedActions.length,
      skipped: skippedActions.length,
      actions: state.actions,
      logEntry,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to auto-complete todos', detail: err?.message ?? String(err) });
  }
}
