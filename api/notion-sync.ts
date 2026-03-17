import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { fetchNotionPages } from '../lib/_notionHelpers.js';

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

  const notionToken = process.env.NOTION_API_KEY;
  if (!notionToken) {
    res.status(500).json({ error: 'NOTION_API_KEY is not configured.' });
    return;
  }

  const databaseIdsRaw = process.env.NOTION_DATABASE_IDS ?? '';
  const databaseIds = databaseIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (databaseIds.length === 0) {
    res.status(500).json({ error: 'NOTION_DATABASE_IDS is not configured.' });
    return;
  }

  try {
    const pages = await fetchNotionPages(notionToken, databaseIds);

    await supabaseAdmin.from('user_data').upsert({
      user_id: user.id,
      key: 'jarvis:notion_pages',
      value: pages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({ success: true, count: pages.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Notion sync failed', detail: err?.message ?? String(err) });
  }
}
