import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { fetchGitHubActivity } from '../lib/_githubHelpers.js';
import { fetchNotionPages } from '../lib/_notionHelpers.js';
import { fetchNews } from '../lib/_newsHelpers.js';
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

  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const provider = url.searchParams.get('provider');

  switch (provider) {
    case 'github':
      return handleGithubSync(req, res, user);
    case 'notion':
      return handleNotionSync(req, res, user);
    case 'news':
      return handleNewsSync(req, res, user);
    case 'readwise':
      return handleReadwiseSync(req, res, user);
    default:
      res.status(400).json({ error: 'Missing or invalid provider. Use ?provider=github|notion|news|readwise' });
  }
}

// ─── GitHub Sync ───────────────────────────────────────────────

async function handleGithubSync(_req: any, res: any, user: { id: string }) {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    res.status(500).json({ error: 'GITHUB_TOKEN is not configured.' });
    return;
  }

  try {
    const activity = await fetchGitHubActivity(githubToken);

    await supabaseAdmin!.from('user_data').upsert({
      user_id: user.id,
      key: 'jarvis:github_activity',
      value: activity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });

    res.status(200).json({ success: true, activity });
  } catch (err: any) {
    res.status(500).json({ error: 'GitHub sync failed', detail: err?.message ?? String(err) });
  }
}

// ─── Notion Sync ───────────────────────────────────────────────

async function handleNotionSync(_req: any, res: any, user: { id: string }) {
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

    await supabaseAdmin!.from('user_data').upsert({
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

// ─── News Sync ─────────────────────────────────────────────────

async function handleNewsSync(_req: any, res: any, user: { id: string }) {
  const newsApiKey = process.env.NEWS_API_KEY;
  if (!newsApiKey) {
    res.status(500).json({ error: 'NEWS_API_KEY is not configured.' });
    return;
  }

  try {
    const { data: configData } = await supabaseAdmin!
      .from('user_data')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'jarvis:news_config')
      .maybeSingle();

    const config = configData?.value as { queries?: string[] } | null;
    const queries = config?.queries ?? ['AI startups', 'tech'];

    const articles = await fetchNews(newsApiKey, queries);

    await supabaseAdmin!.from('user_data').upsert({
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

// ─── Readwise Sync ─────────────────────────────────────────────

async function handleReadwiseSync(_req: any, res: any, user: { id: string }) {
  const readwiseToken = process.env.READWISE_ACCESS_TOKEN;
  if (!readwiseToken) {
    res.status(500).json({ error: 'READWISE_ACCESS_TOKEN is not configured.' });
    return;
  }

  try {
    const highlights = await fetchReadwiseHighlights(readwiseToken);

    await supabaseAdmin!.from('user_data').upsert({
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
