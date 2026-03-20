import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const autoTagSchema = z.object({
  tags: z.array(z.string()).describe('3-6 relevant tags for this note, lowercase, single words or short hyphenated phrases'),
});

const SYSTEM_PROMPT = `You are a note-tagging assistant. Given a note's title and content, suggest 3-6 relevant tags.

Rules:
- Tags should be lowercase, single words or short hyphenated phrases (e.g. "meeting", "project-update", "financial")
- Prefer tags from the existing tag list when they fit
- Add new tags only when no existing tag matches the content
- Be specific — "q1-review" is better than "review"
- Don't repeat tags that are already applied`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { title, content, existingTags } = req.body ?? {};

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const tagList = Array.isArray(existingTags) && existingTags.length > 0
    ? `\n\nExisting tags in the system: ${existingTags.join(', ')}`
    : '';

  const userPrompt = `Title: ${title || 'Untitled'}

Content:
${content.slice(0, 3000)}${tagList}`;

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 500,
      output: Output.object({ schema: autoTagSchema }),
    });

    if (!result.output) {
      res.status(502).json({ error: 'Model returned empty response' });
      return;
    }

    res.status(200).json({ tags: result.output.tags });
  } catch (err: any) {
    console.error('[AutoTag] Error:', err?.message ?? String(err));
    res.status(500).json({ error: 'Failed to auto-tag', detail: err?.message ?? String(err) });
  }
}
