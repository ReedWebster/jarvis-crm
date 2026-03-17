import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { fetchNews } from '../lib/_newsHelpers.js';

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

  const newsApiKey = process.env.NEWS_API_KEY;
  if (!newsApiKey) {
    res.status(500).json({ error: 'NEWS_API_KEY is not configured.' });
    return;
  }

  try {
    // Read user's configured queries
    const { data: configData } = await supabaseAdmin
      .from('user_data')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'jarvis:news_config')
      .maybeSingle();

    const config = configData?.value as { queries?: string[] } | null;
    const queries = config?.queries ?? ['AI startups', 'tech'];

    const articles = await fetchNews(newsApiKey, queries);

    await supabaseAdmin.from('user_data').upsert({
      user_id: user.id,
      key: 'jarvis:news_feed',
      value: articles,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({ success: true, count: articles.length });
  } catch (err: any) {
    res.status(500).json({ error: 'News sync failed', detail: err?.message ?? String(err) });
  }
}
