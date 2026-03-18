import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const meetingSummarySchema = z.object({
  summary: z.string().describe('2-4 sentence overview of what was discussed and decided'),
  keyPoints: z.array(z.string()).describe('3-6 key points or decisions from the meeting'),
  actionItems: z.array(z.object({
    assignee: z.string().describe('Name of the person responsible'),
    action: z.string().describe('Clear, specific action to be taken'),
    dueDate: z.string().optional().describe('Due date if mentioned, in YYYY-MM-DD format'),
  })).describe('Action items extracted from the notes, grouped by assignee'),
});

const SYSTEM_PROMPT = `You are a professional meeting note summarizer. Given raw meeting notes, extract:

1. **summary**: A concise 2-4 sentence overview capturing the purpose, key discussions, and main outcomes of the meeting.
2. **keyPoints**: 3-6 bullet points covering the most important decisions, insights, or topics discussed. Be specific — reference actual details from the notes.
3. **actionItems**: Every concrete next step or task mentioned. For each action item:
   - Assign it to the most likely person based on context (use the attendees list and any names mentioned in the notes)
   - Write the action clearly and specifically
   - Include a due date only if explicitly mentioned or clearly implied in the notes

Rules:
- Be concise and specific — no filler or vague language
- If the notes are sparse, extract what you can and keep keyPoints to what's clearly stated
- For action items with no clear owner, use "All" or the most logical attendee based on context
- Due dates should only be included when explicitly stated or strongly implied`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { title, date, attendees, rawNotes } = req.body ?? {};

  if (!rawNotes || typeof rawNotes !== 'string' || rawNotes.trim().length === 0) {
    res.status(400).json({ error: 'rawNotes is required' });
    return;
  }

  const attendeeList = Array.isArray(attendees) && attendees.length > 0
    ? attendees.join(', ')
    : 'Not specified';

  const userPrompt = `Meeting: ${title || 'Untitled Meeting'}
Date: ${date || 'Not specified'}
Attendees: ${attendeeList}

Raw Notes:
${rawNotes.slice(0, 6000)}`;

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 2000,
      output: Output.object({ schema: meetingSummarySchema }),
    });

    if (!result.output) {
      res.status(502).json({ error: 'Model returned empty response' });
      return;
    }

    res.status(200).json({
      summary: result.output.summary,
      keyPoints: result.output.keyPoints,
      actionItems: result.output.actionItems,
    });
  } catch (err: any) {
    console.error('[SummarizeMeeting] Error:', err?.message ?? String(err));
    res.status(500).json({ error: 'Failed to summarize meeting', detail: err?.message ?? String(err) });
  }
}
