import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { fetchGitHubActivity } from '../lib/_githubHelpers.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth: Supabase JWT
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

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    res.status(500).json({ error: 'GITHUB_TOKEN is not configured.' });
    return;
  }

  try {
    const activity = await fetchGitHubActivity(githubToken);

    // Store in Supabase
    await supabaseAdmin.from('user_data').upsert({
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
