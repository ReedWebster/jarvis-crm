import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

const draftSchema = z.array(z.object({
  contactId: z.string(),
  subject: z.string().describe('Email subject line — short, natural, not salesy'),
  message: z.string().describe('Email body — brief, warm, references shared context'),
  reasoning: z.string().describe('Why this angle/approach was chosen'),
  channel: z.enum(['email', 'imessage']).describe('Which channel to reach out on'),
}));

const SYSTEM_PROMPT = `You are helping Reed Webster re-engage contacts who have gone quiet.

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

  const { contacts, tone = 'warm' } = req.body ?? {};
  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: 'contacts array is required' });
    return;
  }

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

  // Build a lookup of iMessage conversations by contactId
  const imessageByContactId = new Map<string, any>();
  for (const conv of imessageData) {
    if (conv.contactId) {
      imessageByContactId.set(conv.contactId, conv);
    }
  }

  // Cap at 10 contacts per request
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

    // Include iMessage context if available
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

  try {
    const { text: rawJson } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 3000,
    });

    if (!rawJson) {
      res.status(502).json({ error: 'Claude returned empty response' });
      return;
    }

    const cleaned = rawJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    let drafts: z.infer<typeof draftSchema>;
    try {
      drafts = draftSchema.parse(JSON.parse(cleaned));
    } catch (parseErr: any) {
      console.error('[OutreachCoach] Parse failed. Raw:', rawJson.slice(0, 500));
      res.status(502).json({ error: 'Draft format error — try again.' });
      return;
    }

    res.status(200).json({ drafts });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate drafts', detail: err?.message ?? String(err) });
  }
}
