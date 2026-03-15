import { supabaseAdmin } from './_supabaseAdmin.js';

const ALLOWED_METHODS = new Set([
  'conversations.list',
  'conversations.history',
  'conversations.info',
  'conversations.members',
  'conversations.mark',
  'users.info',
  'users.list',
  'chat.postMessage',
  'team.info',
]);

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

  // Parse body
  let body: any;
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body); } catch { body = {}; }
  } else {
    body = req.body ?? {};
  }

  const { method, params } = body as { method?: string; params?: Record<string, any> };

  if (!method || !ALLOWED_METHODS.has(method)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Method not allowed: ${method}` }));
    return;
  }

  // Retrieve Slack token
  const { data, error } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'slack_auth')
    .maybeSingle();

  if (error || !data?.value) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Slack is not connected' }));
    return;
  }

  const token = (data.value as any).accessToken;
  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'No Slack access token found' }));
    return;
  }

  try {
    // Call Slack API
    const slackRes = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const slackJson = await slackRes.json();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(slackJson));
  } catch (e: any) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Slack API call failed', detail: e?.message }));
  }
}
