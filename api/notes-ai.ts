import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const autoTagSchema = z.object({
  tags: z.array(z.string()).describe('3-6 relevant tags for this note, lowercase, single words or short hyphenated phrases'),
});

const noteSummarySchema = z.object({
  summary: z.string().describe('A concise 2-4 sentence summary of the note capturing the key points and takeaways'),
});

const meetingSummarySchema = z.object({
  summary: z.string().describe('2-4 sentence overview of what was discussed and decided'),
  keyPoints: z.array(z.string()).describe('3-6 key points or decisions from the meeting'),
  actionItems: z.array(z.object({
    assignee: z.string().describe('Name of the person responsible'),
    action: z.string().describe('Clear, specific action to be taken'),
    dueDate: z.string().optional().describe('Due date if mentioned, in YYYY-MM-DD format'),
  })).describe('Action items extracted from the notes, grouped by assignee'),
});

const AUTO_TAG_SYSTEM = `You are a note-tagging assistant. Given a note's title and content, suggest 3-6 relevant tags.

Rules:
- Tags should be lowercase, single words or short hyphenated phrases (e.g. "meeting", "project-update", "financial")
- Prefer tags from the existing tag list when they fit
- Add new tags only when no existing tag matches the content
- Be specific — "q1-review" is better than "review"
- Don't repeat tags that are already applied`;

const SUMMARIZE_SYSTEM = `You are a note summarizer. Given a note's title and content, produce a concise 2-4 sentence summary that captures the key points and takeaways.

Rules:
- Be concise and specific — no filler
- Focus on actionable insights, decisions, and key facts
- If the note contains action items or todos, mention them
- Preserve any important names, dates, or numbers
- Write in a professional but approachable tone`;

const MEETING_SYSTEM = `You are a professional meeting note summarizer. Given raw meeting notes, extract:

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

  const body = req.body ?? {};
  const action: string = body.action ?? '';

  // Legacy support: if no action field and rawNotes present, treat as summarize-meeting
  const effectiveAction = action || (body.rawNotes ? 'summarize-meeting' : '');

  if (!effectiveAction || !['auto-tag', 'summarize', 'summarize-meeting'].includes(effectiveAction)) {
    res.status(400).json({ error: 'action must be "auto-tag", "summarize", or "summarize-meeting"' });
    return;
  }

  try {
    if (effectiveAction === 'auto-tag') {
      const { title, content, existingTags } = body;
      if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

      const tagList = Array.isArray(existingTags) && existingTags.length > 0
        ? `\n\nExisting tags in the system: ${existingTags.join(', ')}`
        : '';

      const result = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: AUTO_TAG_SYSTEM,
        prompt: `Title: ${title || 'Untitled'}\n\nContent:\n${content.slice(0, 3000)}${tagList}`,
        maxOutputTokens: 500,
        output: Output.object({ schema: autoTagSchema }),
      });

      if (!result.output) { res.status(502).json({ error: 'Model returned empty response' }); return; }
      res.status(200).json({ tags: result.output.tags });

    } else if (effectiveAction === 'summarize') {
      const { title, content } = body;
      if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

      const result = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: SUMMARIZE_SYSTEM,
        prompt: `Title: ${title || 'Untitled'}\n\nContent:\n${content.slice(0, 6000)}`,
        maxOutputTokens: 1000,
        output: Output.object({ schema: noteSummarySchema }),
      });

      if (!result.output) { res.status(502).json({ error: 'Model returned empty response' }); return; }
      res.status(200).json({ summary: result.output.summary });

    } else {
      // summarize-meeting
      const { title, date, attendees, rawNotes } = body;
      if (!rawNotes?.trim()) { res.status(400).json({ error: 'rawNotes is required' }); return; }

      const attendeeList = Array.isArray(attendees) && attendees.length > 0
        ? attendees.join(', ')
        : 'Not specified';

      const result = await generateText({
        model: anthropic('claude-haiku-4-5-20251001'),
        system: MEETING_SYSTEM,
        prompt: `Meeting: ${title || 'Untitled Meeting'}\nDate: ${date || 'Not specified'}\nAttendees: ${attendeeList}\n\nRaw Notes:\n${rawNotes.slice(0, 6000)}`,
        maxOutputTokens: 2000,
        output: Output.object({ schema: meetingSummarySchema }),
      });

      if (!result.output) { res.status(502).json({ error: 'Model returned empty response' }); return; }
      res.status(200).json({
        summary: result.output.summary,
        keyPoints: result.output.keyPoints,
        actionItems: result.output.actionItems,
      });
    }
  } catch (err: any) {
    console.error('[NotesAI] Error:', err?.message ?? String(err));
    res.status(500).json({ error: `Failed to ${effectiveAction}`, detail: err?.message ?? String(err) });
  }
}
