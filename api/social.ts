import { createLinkedInPost, LinkedInError } from '../lib/_linkedin.js';
import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const action = url.searchParams.get('action');

  switch (action) {
    case 'status':
      return handleStatus(req, res, url);
    case 'ai-dm':
      return handleAiDm(req, res);
    case 'ai-drafts':
      return handleAiDrafts(req, res);
    case 'linkedin-post':
      return handleLinkedinPost(req, res);
    default:
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing or invalid action. Use ?action=status|ai-dm|ai-drafts|linkedin-post' }));
  }
}

// ─── Social Status ─────────────────────────────────────────────

async function handleStatus(req: any, res: any, url: URL) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const provider = url.searchParams.get('provider');

  const keyMap: Record<string, string> = {
    linkedin: 'linkedin_auth',
    x: 'x_auth',
  };

  const dbKey = provider ? keyMap[provider] : undefined;
  if (!dbKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing or invalid provider. Use ?provider=linkedin|x' }));
    return;
  }

  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', dbKey)
    .maybeSingle();

  if (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Failed to read ${provider} auth state`, detail: error.message }));
    return;
  }

  const value: any = data?.value ?? null;
  if (!value?.accessToken) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'disconnected' }));
    return;
  }

  const now = new Date();
  const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= now.getTime() : false;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: isExpired ? 'needs-reauth' : 'connected',
    expiresAt: value.expiresAt ?? null,
    name: value.name ?? null,
    email: value.email ?? null,
    username: value.username ?? null,
    picture: value.picture ?? null,
    pages: value.pages ?? undefined,
    instagramAccounts: value.instagramAccounts ?? undefined,
  }));
}

// ─── Social AI DM ──────────────────────────────────────────────

async function handleAiDm(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }));
    return;
  }

  const { name, context } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'name is required' }));
    return;
  }

  const userPrompt = [
    `Contact name: ${name}`,
    context ? `Context: ${context}` : '',
    '',
    'Return JSON: { "message": "..." }',
  ].join('\n');

  const systemPrompt = [
    'You are helping Reed Webster send a short, warm, natural outreach DM after adding a new contact to his CRM.',
    '',
    'The message should:',
    '- feel personal',
    '- be brief',
    '- sound natural',
    '- avoid sounding automated',
    '- avoid salesy language',
    '- avoid hype',
    '',
    'Rules:',
    '- no em dashes',
    '- no fluff',
    '- no fake inspirational language',
    '',
    'Write one concise DM draft that Reed can edit before sending.',
    'Return pure JSON and no extra text.',
  ].join('\n');

  try {
    const r = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Claude API error', detail: text }));
      return;
    }

    const data = await r.json();
    let content = Array.isArray(data.content) && data.content[0]?.text
      ? data.content[0].text
      : '';

    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Claude response was not valid JSON', raw: content }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(parsed));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to generate DM draft', detail: err?.message ?? String(err) }));
  }
}

// ─── Social AI Drafts ──────────────────────────────────────────

async function handleAiDrafts(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }));
    return;
  }

  const { topic, audience, goal, tone, callToAction } = req.body ?? {};
  if (!topic || typeof topic !== 'string') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'topic is required' }));
    return;
  }

  const userPrompt = [
    `Topic: ${topic}`,
    audience ? `Audience: ${audience}` : '',
    goal ? `Goal: ${goal}` : '',
    tone ? `Tone notes: ${tone}` : '',
    callToAction ? `Call to action: ${callToAction}` : '',
    '',
    'Return JSON with this shape:',
    '{ "drafts": [ { "platform": "linkedin" | "twitter", "content": "..." }, ... ] }',
  ].join('\n');

  const systemPrompt = [
    "You are Reed Webster's personal brand content strategist.",
    'Reed is a BYU student, entrepreneur, and founder of Vanta Marketing Co.',
    'He builds AI systems, marketing systems, and business growth infrastructure.',
    'His content should sound sharp, thoughtful, practical, and authentic.',
    '',
    'Voice rules:',
    '- professional but conversational',
    '- direct',
    '- smart',
    '- useful',
    '- confident without sounding inflated',
    '',
    'Hard rules:',
    '- no em dashes',
    '- no fluff',
    '- no fake inspirational language',
    '- no generic engagement bait',
    '- keep insights grounded and real',
    '',
    'Task:',
    'Return platform-specific drafts optimized for LinkedIn and Twitter/X.',
    'You must respond with pure JSON and no extra text.',
  ].join('\n');

  try {
    const r = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Claude API error', detail: text }));
      return;
    }

    const data = await r.json();
    let content = Array.isArray(data.content) && data.content[0]?.text
      ? data.content[0].text
      : '';

    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Claude response was not valid JSON', raw: content }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(parsed));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to generate drafts', detail: err?.message ?? String(err) }));
  }
}

// ─── LinkedIn Post ─────────────────────────────────────────────

async function handleLinkedinPost(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
    return;
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'linkedin_auth')
    .maybeSingle();

  if (dbError || !data?.value?.accessToken) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'LinkedIn is not connected. Authorize via the Social Accounts tab first.' }));
    return;
  }

  const accessToken: string = data.value.accessToken;
  const authorUrn: string | undefined = data.value.authorUrn;

  if (!authorUrn) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'LinkedIn author URN not found. Please reconnect LinkedIn.' }));
    return;
  }

  const { text, dryRun, imageDataUrl } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'text is required' }));
    return;
  }

  if (dryRun) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      dryRun: true,
      preview: { authorUrn, text },
    }));
    return;
  }

  // Decode base64 image if provided
  let imageBuffer: Buffer | undefined;
  if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
    const base64 = imageDataUrl.split(',')[1];
    if (base64) imageBuffer = Buffer.from(base64, 'base64');
  }

  try {
    const result = await createLinkedInPost(accessToken, { authorUrn, text }, imageBuffer);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, id: result.id }));
  } catch (err: any) {
    if (err instanceof LinkedInError) {
      res.statusCode = err.status || 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    } else {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unexpected LinkedIn error', detail: err?.message ?? String(err) }));
    }
  }
}
