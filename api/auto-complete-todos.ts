import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { format } from 'date-fns';

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

const autoCompleteSchema = z.object({
  completions: z.array(z.object({
    todoId: z.string().describe('The id of the todo to mark as done'),
    reason: z.string().describe('Brief explanation of why this can be auto-completed'),
  })).describe('Todos that Litehouse can confidently auto-complete'),
  skipped: z.array(z.object({
    todoId: z.string(),
    reason: z.string().describe('Why this todo requires human action'),
  })).describe('Todos that need Reed to handle personally'),
});

const SYSTEM_PROMPT = `You are Litehouse, Reed Webster's personal life-management AI.

You are reviewing his todo list to determine which items can be AUTO-COMPLETED — meaning they are effectively done or no longer need action.

A todo CAN be auto-completed if:
- It's a reminder that has already passed and the event is over (e.g., "Reminder: meeting at 3pm" and it's now the next day)
- It's a recurring reminder or nudge that has served its purpose (e.g., "Check in with X this week" and the week is over)
- It's a simple time-based task that has naturally resolved (e.g., "Wait for email reply" dated 2+ weeks ago)
- It's a task explicitly marked as a reminder/notification rather than an action item
- It's duplicate of another todo
- It's been completed based on context clues (e.g., "Submit assignment" and the due date has long passed — the assignment was either submitted or the deadline is gone)
- It's a low-priority item that's been sitting for 30+ days with no progress and is clearly stale/irrelevant

A todo CANNOT be auto-completed if:
- It requires Reed to physically do something (call someone, write something, build something, attend something)
- It's a meaningful goal or project task
- It involves money, commitments, or decisions
- It has active checklist items that aren't checked
- It's linked to an active project, goal, or contact that still matters
- There's any ambiguity about whether it's done

Be CONSERVATIVE. When in doubt, skip it. It's better to leave a todo than to incorrectly mark something as done.`;

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
    // Fetch todos
    const { data: todoRow, error: fetchError } = await supabaseAdmin
      .from('user_data')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'jarvis:todos')
      .single();

    if (fetchError || !todoRow) {
      res.status(500).json({ error: 'Failed to fetch todos', detail: fetchError?.message });
      return;
    }

    const allTodos: TodoItem[] = todoRow.value ?? [];
    const activeTodos = allTodos.filter(t => t.status !== 'done');

    if (activeTodos.length === 0) {
      res.status(200).json({ success: true, completed: 0, message: 'No active todos.' });
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const todoSummary = activeTodos.map(t => ({
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

    const prompt = `Today is ${today}.

Here are Reed's active todos (${activeTodos.length} items):

${JSON.stringify(todoSummary, null, 2)}

Review each todo and determine which ones can be safely auto-completed. Be conservative.`;

    const { output: result } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt,
      output: Output.object({ schema: autoCompleteSchema }),
      maxTokens: 2000,
    });

    if (!result || result.completions.length === 0) {
      // Store a log entry even when nothing was completed
      const logEntry = {
        date: today,
        completedAt: new Date().toISOString(),
        completed: [],
        skipped: result?.skipped?.length ?? activeTodos.length,
        message: 'No todos eligible for auto-completion.',
      };

      await supabaseAdmin.from('user_data').upsert({
        user_id: userId,
        key: `jarvis:auto_complete_log:${today}`,
        value: logEntry,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });

      res.status(200).json({ success: true, completed: 0, logEntry });
      return;
    }

    // Mark completed todos as done
    const completedIds = new Set(result.completions.map(c => c.todoId));
    const updatedTodos = allTodos.map(t => {
      if (completedIds.has(t.id)) {
        return {
          ...t,
          status: 'done' as const,
          checklist: t.checklist.map(c => ({ ...c, checked: true })),
        };
      }
      return t;
    });

    // Write updated todos back to Supabase
    await supabaseAdmin.from('user_data').upsert({
      user_id: userId,
      key: 'jarvis:todos',
      value: updatedTodos,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    // Store completion log
    const logEntry = {
      date: today,
      completedAt: new Date().toISOString(),
      completed: result.completions,
      skipped: result.skipped.length,
      totalActive: activeTodos.length,
    };

    await supabaseAdmin.from('user_data').upsert({
      user_id: userId,
      key: `jarvis:auto_complete_log:${today}`,
      value: logEntry,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({
      success: true,
      completed: result.completions.length,
      completions: result.completions,
      skipped: result.skipped.length,
      logEntry,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to auto-complete todos', detail: err?.message ?? String(err) });
  }
}
