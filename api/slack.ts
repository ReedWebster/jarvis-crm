import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

// ─── Allowed Slack API methods for the proxy ─────────────────────────────────

const ALLOWED_METHODS = new Set([
  'conversations.list', 'conversations.history', 'conversations.info',
  'conversations.members', 'conversations.mark',
  'users.info', 'users.list',
  'chat.postMessage', 'team.info',
]);

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const action = url.searchParams.get('action') ?? '';

  switch (action) {
    case 'oauth-start':
      return handleOAuthStart(req, res);
    case 'oauth-callback':
      return handleOAuthCallback(req, res, url);
    case 'status':
      return handleStatus(req, res);
    case 'disconnect':
      return handleDisconnect(req, res);
    case 'api':
      return handleApiProxy(req, res);
    default:
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
  }
}

// ─── OAuth Start ─────────────────────────────────────────────────────────────

async function handleOAuthStart(_req: any, res: any) {
  try {
    const clientId = process.env.SLACK_CLIENT_ID?.trim();
    const redirectUri = process.env.SLACK_REDIRECT_URI?.trim();

    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Slack OAuth is not configured.',
        detail: `CLIENT_ID=${!!clientId}, REDIRECT_URI=${!!redirectUri}`,
      }));
      return;
    }

    const state = 'litehouse-slack';
    const userScope = encodeURIComponent(
      'channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,users:read,chat:write',
    );
    const encodedRedirect = encodeURIComponent(redirectUri);

    const authUrl =
      `https://slack.com/oauth/v2/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodedRedirect}` +
      `&user_scope=${userScope}` +
      `&state=${state}`;

    res.statusCode = 302;
    res.setHeader('Location', authUrl);
    res.end();
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'oauth-start crashed', detail: e?.message, stack: e?.stack }));
  }
}

// ─── OAuth Callback ──────────────────────────────────────────────────────────

function redirect(res: any, location: string) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

async function handleOAuthCallback(_req: any, res: any, url: URL) {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return redirect(res, `/messaging?slack=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Missing Slack authorization code.</p>');
    return;
  }

  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SLACK_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Slack OAuth is not configured on the server.</p>');
    return;
  }

  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenJson: any = await tokenRes.json();

    if (!tokenJson.ok) {
      return redirect(res, `/messaging?slack=error&msg=${encodeURIComponent(tokenJson.error ?? 'Token exchange failed')}`);
    }

    const accessToken: string = tokenJson.authed_user?.access_token;
    const userId: string = tokenJson.authed_user?.id;
    const teamId: string = tokenJson.team?.id;
    const teamName: string = tokenJson.team?.name;

    if (!accessToken) {
      return redirect(res, '/messaging?slack=error&msg=no_access_token');
    }

    let userName = '';
    let userAvatar = '';
    try {
      const userRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userJson: any = await userRes.json();
      if (userJson.ok) {
        userName = userJson.user?.profile?.display_name || userJson.user?.real_name || '';
        userAvatar = userJson.user?.profile?.image_72 || '';
      }
    } catch {
      // Non-fatal
    }

    if (!supabaseAdmin) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<p>Supabase admin client is not configured.</p>');
      return;
    }

    const { error: dbError } = await supabaseAdmin
      .from('workspace_data')
      .upsert(
        {
          key: 'slack_auth',
          value: { accessToken, userId, teamId, teamName, userName, userAvatar, connectedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (dbError) {
      return redirect(res, `/messaging?slack=error&msg=${encodeURIComponent(dbError.message)}`);
    }

    redirect(res, '/messaging?slack=connected');
  } catch (e: any) {
    redirect(res, `/messaging?slack=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}`);
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

async function handleStatus(_req: any, res: any) {
  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
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

// ─── Disconnect ──────────────────────────────────────────────────────────────

async function handleDisconnect(_req: any, res: any) {
  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
    return;
  }

  const { data } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'slack_auth')
    .maybeSingle();

  const token = (data?.value as any)?.accessToken;

  if (token) {
    try {
      await fetch('https://slack.com/api/auth.revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // Non-fatal
    }
  }

  const { error } = await supabaseAdmin.from('workspace_data').delete().eq('key', 'slack_auth');

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

// ─── API Proxy ───────────────────────────────────────────────────────────────

async function handleApiProxy(req: any, res: any) {
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
    const slackRes = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
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
