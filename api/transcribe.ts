// Groq Whisper-large-v3 transcription
// Falls back gracefully when GROQ_API_KEY is not set (returns 503)
// maxDuration: 30 — well within Vercel hobby plan's 60s limit

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Client interprets 503 as "Groq not configured → use Web Speech fallback"
    res.status(503).json({ error: 'GROQ_API_KEY not configured' });
    return;
  }

  const { audio, mimeType = 'audio/webm' } = req.body ?? {};

  if (!audio || typeof audio !== 'string') {
    res.status(400).json({ error: 'audio (base64) is required' });
    return;
  }

  try {
    const buffer = Buffer.from(audio, 'base64');

    // Determine file extension for Groq (it uses the filename to detect format)
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a')
      ? 'm4a'
      : 'webm';

    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append('file', blob, `recording.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo'); // fast + accurate; large-v3 for max accuracy
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('[transcribe] Groq error:', groqRes.status, errText);
      // 429 = rate limit → client falls back to Web Speech
      res.status(groqRes.status).json({ error: errText });
      return;
    }

    const data = await groqRes.json() as { text: string };
    res.status(200).json({ text: data.text?.trim() ?? '' });
  } catch (err: any) {
    console.error('[transcribe] Error:', err?.message ?? String(err));
    res.status(500).json({ error: 'Transcription failed', detail: err?.message ?? String(err) });
  }
}
