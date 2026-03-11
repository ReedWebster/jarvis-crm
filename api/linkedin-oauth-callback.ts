import { supabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<p>LinkedIn authorization failed: ${error}</p>`);
    return;
  }

  if (!code || !state) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Missing LinkedIn authorization code or state.</p>');
    return;
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>LinkedIn OAuth is not configured on the server.</p>');
    return;
  }

  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<p>Failed to exchange code for tokens: ${text}</p>`);
      return;
    }

    const tokenJson: any = await tokenRes.json();
    const accessToken: string | undefined = tokenJson.access_token;
    const expiresIn: number | undefined = tokenJson.expires_in;

    if (!accessToken) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<p>LinkedIn did not return an access token.</p>');
      return;
    }

    const now = Date.now();
    const expiresAt = expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null;

    if (!supabaseAdmin) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<p>Supabase admin client is not configured; cannot persist LinkedIn tokens.</p>');
      return;
    }

    const { error: dbError } = await supabaseAdmin
      .from('workspace_data')
      .upsert(
        {
          key: 'linkedin_auth',
          value: {
            accessToken,
            expiresAt,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (dbError) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<p>Saved LinkedIn token, but failed to persist to workspace_data: ${dbError.message}</p>`);
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>LinkedIn account connected. You can close this tab and return to Litehouse.</p>');
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<p>Unexpected LinkedIn error: ${e?.message ?? String(e)}</p>`);
  }
}

