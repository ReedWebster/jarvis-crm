import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { fetchReadwiseHighlights } from '../lib/_readwiseHelpers.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase is not configured.' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid auth token' });
    return;
  }

  const readwiseToken = process.env.READWISE_ACCESS_TOKEN;
  if (!readwiseToken) {
    res.status(500).json({ error: 'READWISE_ACCESS_TOKEN is not configured.' });
    return;
  }

  try {
    const highlights = await fetchReadwiseHighlights(readwiseToken);

    await supabaseAdmin.from('user_data').upsert({
      user_id: user.id,
      key: 'jarvis:readwise_highlights',
      value: highlights,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({ success: true, count: highlights.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Readwise sync failed', detail: err?.message ?? String(err) });
  }
}
