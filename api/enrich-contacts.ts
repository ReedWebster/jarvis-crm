import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const enrichmentSchema = z.array(z.object({
  contactId: z.string(),
  summary: z.string().describe('2-3 sentence profile summary — who they are, what they do, how they connect to Reed'),
  suggestedTags: z.array(z.string()).describe('3-5 relevant tags — pick from existing list when possible, suggest new ones if nothing fits'),
  strategicNotes: z.string().describe('Actionable advice on maintaining this relationship — be specific'),
  relationshipTier: z.enum(['Inner Circle', 'Key Ally', 'Active Network', 'Acquaintance', 'Dormant']),
  followUpTiming: z.string().describe('Recommended follow-up cadence, e.g. "Every 2 weeks", "Monthly"'),
  talkingPoints: z.array(z.string()).describe('2-4 specific topics to bring up next time'),
}));

const SYSTEM_PROMPT = `You are analyzing contacts for Reed Webster's personal CRM to generate enriched profiles.

For each contact, produce:
1. **summary**: 2-3 sentences capturing who this person is, what they do, and how they connect to Reed. Be specific — use their company, role, where they met, and any shared context.
2. **suggestedTags**: 3-5 tags that categorize this person. Use tags from the provided existing list when applicable. Suggest 1-2 new tags only if nothing in the existing list fits. Tags should be concise (1-3 words): industry, role type, relationship context, shared interests.
3. **strategicNotes**: 1-2 sentences of actionable advice on how Reed should maintain or strengthen this relationship. Reference specific details from their data.
4. **relationshipTier**: Classify based on interaction frequency, recency, and context depth:
   - "Inner Circle": frequent contact, deep relationship, high trust
   - "Key Ally": important professional or personal connection, regular engagement
   - "Active Network": periodic contact, valuable connection
   - "Acquaintance": infrequent contact, low-depth interactions
   - "Dormant": no recent contact, relationship has gone cold
5. **followUpTiming**: Recommended cadence based on tier and context (e.g. "Every week", "Every 2 weeks", "Monthly", "Quarterly")
6. **talkingPoints**: 2-4 specific conversation topics for next interaction — based on their company news, shared projects, notes, recent interactions, or personal milestones.

Rules:
- Be concise and specific — no filler or generic advice
- Reference actual data from the contact (company, notes, interactions, tags)
- If data is sparse, say so in the summary and suggest lower-effort follow-up
- Respond with ONLY a JSON array (no markdown fences, no explanation)`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' });
    return;
  }

  const { contacts, existingTags = [] } = req.body ?? {};
  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'contacts array is required' });
    return;
  }

  const batch = contacts.slice(0, 10);

  const contactSummaries = batch.map((c: any, i: number) => {
    const daysSince = c.lastContacted
      ? Math.floor((Date.now() - new Date(c.lastContacted).getTime()) / 86400000)
      : null;

    const parts = [
      `Contact ${i + 1}:`,
      `  ID: ${c.id}`,
      `  Name: ${c.name}`,
      c.company ? `  Company: ${c.company}` : null,
      c.relationship ? `  Relationship: ${c.relationship}` : null,
      c.metAt ? `  Met at: ${c.metAt}` : null,
      c.tags?.length ? `  Current tags: ${c.tags.join(', ')}` : `  Current tags: none`,
      daysSince != null ? `  Days since last contact: ${daysSince}` : null,
      c.followUpNeeded ? `  Follow-up needed: yes` : null,
      c.birthday ? `  Birthday: ${c.birthday}` : null,
      c.linkedProjects?.length ? `  Linked projects: ${c.linkedProjects.join(', ')}` : null,
      c.linkedin ? `  LinkedIn: ${c.linkedin}` : null,
      c.notes ? `  Notes: ${c.notes.slice(0, 300)}` : null,
    ].filter(Boolean);

    if (c.interactions?.length) {
      parts.push('  Recent interactions:');
      for (const int of c.interactions.slice(0, 5)) {
        parts.push(`    - ${int.date} (${int.type}): ${int.notes || 'no notes'}`);
      }
    }

    return parts.join('\n');
  }).join('\n\n');

  const tagList = existingTags.length > 0
    ? `\nExisting tags in the CRM: ${existingTags.join(', ')}\n`
    : '';

  const userPrompt = `${tagList}\nEnrich these ${batch.length} contacts:\n\n${contactSummaries}`;

  try {
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

    const cleaned = rawJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    let enrichments: z.infer<typeof enrichmentSchema>;
    try {
      enrichments = enrichmentSchema.parse(JSON.parse(cleaned));
    } catch (parseErr: any) {
      console.error('[EnrichContacts] Parse failed. Raw:', rawJson.slice(0, 500));
      res.status(502).json({ error: 'Enrichment format error — try again.' });
      return;
    }

    res.status(200).json({ enrichments });
  } catch (err: any) {
    console.error('[EnrichContacts] Error:', err?.message ?? String(err));
    res.status(500).json({ error: 'Failed to enrich contacts', detail: err?.message ?? String(err) });
  }
}
