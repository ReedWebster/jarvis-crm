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

  const { name, context } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
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
    const content = Array.isArray(data.content) && data.content[0]?.text
      ? data.content[0].text
      : '';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(502).json({ error: 'Claude response was not valid JSON', raw: content });
      return;
    }

    res.status(200).json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate DM draft', detail: err?.message ?? String(err) });
  }
}

