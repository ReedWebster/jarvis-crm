import { supabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(302, { Location: `/messaging?slack=error&msg=${encodeURIComponent(error)}` });
    res.end();
    return;
  }

  if (!code) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Missing Slack authorization code.</p>');
    return;
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Slack OAuth is not configured on the server.</p>');
    return;
  }

  try {
    // Exchange code for token
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
      res.writeHead(302, {
        Location: `/messaging?slack=error&msg=${encodeURIComponent(tokenJson.error ?? 'Token exchange failed')}`,
      });
      res.end();
      return;
    }

    // Slack v2 nests user tokens under authed_user
    const accessToken: string = tokenJson.authed_user?.access_token;
    const userId: string = tokenJson.authed_user?.id;
    const teamId: string = tokenJson.team?.id;
    const teamName: string = tokenJson.team?.name;

    if (!accessToken) {
      res.writeHead(302, { Location: `/messaging?slack=error&msg=no_access_token` });
      res.end();
      return;
    }

    // Fetch user profile
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
          value: {
            accessToken,
            userId,
            teamId,
            teamName,
            userName,
            userAvatar,
            connectedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (dbError) {
      res.writeHead(302, { Location: `/messaging?slack=error&msg=${encodeURIComponent(dbError.message)}` });
      res.end();
      return;
    }

    res.writeHead(302, { Location: '/messaging?slack=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, { Location: `/messaging?slack=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}` });
    res.end();
  }
}
