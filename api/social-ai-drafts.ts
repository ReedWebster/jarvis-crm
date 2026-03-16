const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
    return;
  }

  const { topic, audience, goal, tone, callToAction } = req.body ?? {};
  if (!topic || typeof topic !== 'string') {
    res.status(400).json({ error: 'topic is required' });
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
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: 'Claude API error', detail: text });
      return;
    }

    const data = await r.json();
    let content = Array.isArray(data.content) && data.content[0]?.text
      ? data.content[0].text
      : '';

    // Strip markdown code fences if present
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(502).json({ error: 'Claude response was not valid JSON', raw: content });
      return;
    }

    res.status(200).json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate drafts', detail: err?.message ?? String(err) });
  }
}

