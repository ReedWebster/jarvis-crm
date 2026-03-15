import { supabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Supabase admin client is not configured.',
      detail: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.',
    }));
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'slack_auth')
    .maybeSingle();

  if (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to read Slack auth state', detail: error.message }));
    return;
  }

  const value: any = data?.value ?? null;
  if (!value?.accessToken) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'disconnected' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'connected',
    teamName: value.teamName ?? null,
    userName: value.userName ?? null,
    userAvatar: value.userAvatar ?? null,
  }));
}
