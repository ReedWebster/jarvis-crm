import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const draftSchema = z.array(z.object({
  contactId: z.string(),
  subject: z.string().describe('Email subject line — short, natural, not salesy'),
  message: z.string().describe('Email body — brief, warm, references shared context'),
  reasoning: z.string().describe('Why this angle/approach was chosen'),
  channel: z.enum(['email', 'imessage']).describe('Which channel to reach out on'),
}));

const enrichmentItemSchema = z.object({
  contactId: z.string(),
  summary: z.string().describe('2-3 sentence profile summary — who they are, what they do, how they connect to Reed'),
  suggestedTags: z.array(z.string()).describe('3-5 relevant tags — pick from existing list when possible, suggest new ones if nothing fits'),
  strategicNotes: z.string().describe('Actionable advice on maintaining this relationship — be specific'),
  relationshipTier: z.enum(['Inner Circle', 'Key Ally', 'Active Network', 'Acquaintance', 'Dormant']),
  followUpTiming: z.string().describe('Recommended follow-up cadence, e.g. "Every 2 weeks", "Monthly"'),
  talkingPoints: z.array(z.string()).describe('2-4 specific topics to bring up next time'),
});

const enrichmentSchema = z.object({
  enrichments: z.array(enrichmentItemSchema),
});

// ─── System Prompts ──────────────────────────────────────────────────────────

const OUTREACH_SYSTEM = `You are helping Reed Webster re-engage contacts who have gone quiet.

For each contact, write a short, personalized message that:
- Feels genuinely human and warm
- References something specific (how you met, a shared project, their company, last interaction, or recent iMessage conversation context)
- Has a clear but low-pressure reason to reconnect
- Is 2-4 sentences max in the body
- Does NOT sound automated, salesy, or templated

Channel selection:
- If iMessage data is provided and shows a recent-ish texting relationship, prefer "imessage" as the channel and write the message as a casual text (no subject needed for texts, but still provide a short subject for the UI)
- If the contact has an email but no iMessage history, use "email"
- If both are available, choose whichever feels more natural for the relationship
- For iMessage drafts, write like a text: shorter, more casual, no greeting/sign-off needed

Rules:
- No em dashes
- No fluff or filler ("hope this finds you well", "just reaching out", "touching base")
- No fake inspirational language
- No exclamation marks in subject lines
- Subject line should feel like a real person wrote it (not a newsletter)
- Vary your approach across contacts — don't repeat the same structure
- For iMessage drafts, reference the last conversation naturally if relevant ("Been thinking about what you said about X")

Tone guidance:
- casual: like texting a friend you haven't seen in a while
- warm: friendly and genuine, slightly more polished
- professional: respectful and concise, business-appropriate

You MUST respond with ONLY a JSON array (no markdown fences, no explanation).
Each element: { "contactId": "string", "subject": "string", "message": "string", "reasoning": "string", "channel": "email" | "imessage" }`;

const ENRICH_SYSTEM = `You are analyzing contacts for Reed Webster's personal CRM to generate enriched profiles.

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
- If data is sparse, say so in the summary and suggest lower-effort follow-up`;

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body ?? {};
  const action: string = body.action ?? '';

  // Legacy support: if no action field, infer from body shape
  const effectiveAction = action || (body.tone !== undefined ? 'outreach' : body.existingTags !== undefined ? 'enrich' : '');

  if (!effectiveAction || !['outreach', 'enrich'].includes(effectiveAction)) {
    res.status(400).json({ error: 'action must be "outreach" or "enrich"' });
    return;
  }

  const { contacts } = body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'contacts array is required' });
    return;
  }

  try {
    if (effectiveAction === 'outreach') {
      const { tone = 'warm' } = body;

      // Fetch synced iMessage data if available
      let imessageData: any[] = [];
      if (supabaseAdmin) {
        const userId = process.env.BRIEFING_USER_ID;
        if (userId) {
          const { data } = await supabaseAdmin
            .from('user_data')
            .select('value')
            .eq('user_id', userId)
            .eq('key', 'jarvis:imessages')
            .maybeSingle();
          imessageData = data?.value ?? [];
        }
      }

      const imessageByContactId = new Map<string, any>();
      for (const conv of imessageData) {
        if (conv.contactId) {
          imessageByContactId.set(conv.contactId, conv);
        }
      }

      const batch = contacts.slice(0, 10);

      const contactSummaries = batch.map((c: any, i: number) => {
        const parts = [
          `Contact ${i + 1}:`,
          `  ID: ${c.id}`,
          `  Name: ${c.name}`,
          c.company ? `  Company: ${c.company}` : null,
          c.relationship ? `  Relationship: ${c.relationship}` : null,
          c.metAt ? `  Met at: ${c.metAt}` : null,
          c.tags?.length ? `  Tags: ${c.tags.join(', ')}` : null,
          `  Days since last contact: ${c.daysSinceContact}`,
          c.linkedProjects?.length ? `  Linked projects: ${c.linkedProjects.join(', ')}` : null,
          c.notes ? `  Notes: ${c.notes.slice(0, 200)}` : null,
          c.hasEmail ? `  Has email: yes` : `  Has email: no`,
          c.hasPhone ? `  Has phone: yes` : `  Has phone: no`,
        ].filter(Boolean);

        if (c.recentInteractions?.length) {
          parts.push('  Recent interactions:');
          for (const int of c.recentInteractions.slice(0, 5)) {
            parts.push(`    - ${int.date} (${int.type}): ${int.notes || 'no notes'}`);
          }
        }

        const imsg = imessageByContactId.get(c.id);
        if (imsg) {
          parts.push(`  iMessage data:`);
          parts.push(`    Last text: ${imsg.daysSinceLastMessage}d ago (${imsg.lastMessageFromMe ? 'from Reed' : 'from them'})`);
          parts.push(`    Days since Reed's last text: ${imsg.daysSinceMyLastMessage}d`);
          parts.push(`    Message volume (${90}d): ${imsg.messageCount} total (${imsg.myMessageCount} from Reed, ${imsg.theirMessageCount} from them)`);
          if (imsg.recentMessages?.length) {
            parts.push(`    Recent texts:`);
            for (const m of imsg.recentMessages.slice(0, 3)) {
              const who = m.fromMe ? 'Reed' : c.name;
              const date = new Date(m.date).toLocaleDateString();
              parts.push(`      [${date}] ${who}: "${m.text}"`);
            }
          }
        }

        return parts.join('\n');
      }).join('\n\n');

      const userPrompt = `Tone: ${tone}\n\nGenerate re-engagement messages for these ${batch.length} stale contacts:\n\n${contactSummaries}`;

      const { text: rawJson } = await generateText({
        model: anthropic('claude-haiku-4.5-20251001'),
        system: OUTREACH_SYSTEM,
        prompt: userPrompt,
        maxOutputTokens: 3000,
      });

      if (!rawJson) { res.status(502).json({ error: 'Claude returned empty response' }); return; }

      const cleaned = rawJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      let drafts: z.infer<typeof draftSchema>;
      try {
        drafts = draftSchema.parse(JSON.parse(cleaned));
      } catch (parseErr: any) {
        console.error('[ContactsAI] Outreach parse failed. Raw:', rawJson.slice(0, 500));
        res.status(502).json({ error: 'Draft format error — try again.' });
        return;
      }

      res.status(200).json({ drafts });

    } else {
      // enrich
      const { existingTags = [] } = body;
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

      const result = await generateText({
        model: anthropic('claude-haiku-4.5-20251001'),
        system: ENRICH_SYSTEM,
        prompt: userPrompt,
        maxOutputTokens: 4000,
        output: Output.object({ schema: enrichmentSchema }),
      });

      if (!result.output) { res.status(502).json({ error: 'Model returned empty response' }); return; }
      res.status(200).json({ enrichments: result.output.enrichments });
    }
  } catch (err: any) {
    console.error('[ContactsAI] Error:', err?.message ?? String(err));
    res.status(500).json({ error: `Failed to ${effectiveAction}`, detail: err?.message ?? String(err) });
  }
}
