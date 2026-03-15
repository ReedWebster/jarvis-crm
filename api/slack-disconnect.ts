import { supabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
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

  // Read current token to revoke it
  const { data } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'slack_auth')
    .maybeSingle();

  const token = (data?.value as any)?.accessToken;

  // Revoke the token with Slack (best-effort)
  if (token) {
    try {
      await fetch('https://slack.com/api/auth.revoke', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    } catch {
      // Non-fatal — continue with deletion
    }
  }

  // Delete from Supabase
  const { error } = await supabaseAdmin
    .from('workspace_data')
    .delete()
    .eq('key', 'slack_auth');

  if (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to disconnect', detail: error.message }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
}
