import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const noteSummarySchema = z.object({
  summary: z.string().describe('A concise 2-4 sentence summary of the note capturing the key points and takeaways'),
});

const SYSTEM_PROMPT = `You are a note summarizer. Given a note's title and content, produce a concise 2-4 sentence summary that captures the key points and takeaways.

Rules:
- Be concise and specific — no filler
- Focus on actionable insights, decisions, and key facts
- If the note contains action items or todos, mention them
- Preserve any important names, dates, or numbers
- Write in a professional but approachable tone`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { title, content } = req.body ?? {};

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const userPrompt = `Title: ${title || 'Untitled'}

Content:
${content.slice(0, 6000)}`;

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 1000,
      output: Output.object({ schema: noteSummarySchema }),
    });

    if (!result.output) {
      res.status(502).json({ error: 'Model returned empty response' });
      return;
    }

    res.status(200).json({ summary: result.output.summary });
  } catch (err: any) {
    console.error('[SummarizeNote] Error:', err?.message ?? String(err));
    res.status(500).json({ error: 'Failed to summarize note', detail: err?.message ?? String(err) });
  }
}
