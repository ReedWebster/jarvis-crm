import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, saveGoogleServerAuth } from '../lib/_googleAuth.js';
import { supabaseAdmin } from '../lib/_supabaseAdmin.js';
import { randomBytes, createHash } from 'crypto';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...rest] = c.trim().split('=');
      return [k, rest.join('=')];
    })
  );
}

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const action = url.searchParams.get('action');

  switch (action) {
    case 'start':
      return handleStart(req, res, url);
    case 'google-callback':
      return handleGoogleCallback(req, res, url);
    case 'linkedin-callback':
      return handleLinkedinCallback(req, res, url);
    case 'x-callback':
      return handleXCallback(req, res, url);
    default:
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing or invalid action. Use ?action=start|google-callback|linkedin-callback|x-callback' }));
  }
}

// ─── OAuth Start ───────────────────────────────────────────────

async function handleStart(req: any, res: any, url: URL) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const provider = url.searchParams.get('provider');

  if (provider === 'google') {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'GOOGLE_REDIRECT_URI is not configured.' }));
      return;
    }
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=litehouse-google-briefing`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (provider === 'linkedin') {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'LinkedIn OAuth is not configured.' }));
      return;
    }
    const scope = encodeURIComponent('w_member_social openid profile email');
    const authUrl =
      `https://www.linkedin.com/oauth/v2/authorization` +
      `?response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&state=litehouse-linkedin`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (provider === 'x') {
    const clientId = process.env.X_CLIENT_ID;
    const redirectUri = process.env.X_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'X OAuth is not configured.' }));
      return;
    }
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const scope = 'tweet.read tweet.write users.read offline.access';
    const authUrl =
      `https://twitter.com/i/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=litehouse-x` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;
    res.setHeader('Set-Cookie', [
      `x_code_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api`,
    ]);
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Missing or invalid provider. Use ?provider=google|linkedin|x' }));
}

// ─── Google Callback ───────────────────────────────────────────

async function handleGoogleCallback(req: any, res: any, url: URL) {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<p>Google authorization failed: ${error}</p>`);
    return;
  }

  if (!code) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Missing authorization code.</p>');
    return;
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const userId = process.env.BRIEFING_USER_ID;

  if (!clientSecret || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Google OAuth is not configured (missing GOOGLE_CLIENT_SECRET or GOOGLE_REDIRECT_URI).</p>');
    return;
  }

  if (!userId) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>BRIEFING_USER_ID is not configured.</p>');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<p>Failed to exchange code for tokens: ${text}</p>`);
      return;
    }

    const tokens: any = await tokenRes.json();
    const refreshToken = tokens.refresh_token as string | undefined;
    const accessToken = tokens.access_token as string | undefined;
    const expiresIn = tokens.expires_in as number | undefined;

    if (!refreshToken) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<p>Google did not return a refresh token. Try revoking access at <a href="https://myaccount.google.com/permissions">Google Account Permissions</a> and reconnecting.</p>');
      return;
    }

    await saveGoogleServerAuth(userId, refreshToken, accessToken, expiresIn);

    res.writeHead(302, { Location: '/?google_briefing=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, { Location: `/?google_briefing=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}` });
    res.end();
  }
}

// ─── LinkedIn Callback ─────────────────────────────────────────

async function handleLinkedinCallback(req: any, res: any, url: URL) {
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

    let profile: { sub?: string; name?: string; email?: string; picture?: string } = {};
    try {
      const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        profile = await userInfoRes.json();
      }
    } catch {
      // Non-fatal
    }

    const authorUrn = profile.sub ? `urn:li:person:${profile.sub}` : undefined;

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
            authorUrn,
            name: profile.name ?? null,
            email: profile.email ?? null,
            picture: profile.picture ?? null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (dbError) {
      res.writeHead(302, { Location: `/social?linkedin=error&msg=${encodeURIComponent(dbError.message)}` });
      res.end();
      return;
    }

    res.writeHead(302, { Location: '/social?linkedin=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, { Location: `/social?linkedin=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}` });
    res.end();
  }
}

// ─── X (Twitter) Callback ──────────────────────────────────────

async function handleXCallback(req: any, res: any, url: URL) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    res.writeHead(302, {
      Location: `/social?x=error&msg=${encodeURIComponent(errorDescription || error)}`,
    });
    res.end();
    return;
  }

  if (!code || state !== 'litehouse-x') {
    res.writeHead(302, { Location: '/social?x=error&msg=Invalid+callback+state' });
    res.end();
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const codeVerifier = cookies['x_code_verifier'];

  if (!codeVerifier) {
    res.writeHead(302, { Location: '/social?x=error&msg=Missing+PKCE+verifier+%28session+expired%3F%29' });
    res.end();
    return;
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.writeHead(302, { Location: '/social?x=error&msg=X+OAuth+not+configured+on+server' });
    res.end();
    return;
  }

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.writeHead(302, {
        Location: `/social?x=error&msg=${encodeURIComponent('Token exchange failed: ' + text)}`,
      });
      res.end();
      return;
    }

    const tokenJson: any = await tokenRes.json();
    const accessToken: string | undefined = tokenJson.access_token;
    const refreshToken: string | undefined = tokenJson.refresh_token;
    const expiresIn: number | undefined = tokenJson.expires_in;

    if (!accessToken) {
      res.writeHead(302, { Location: '/social?x=error&msg=No+access+token+returned' });
      res.end();
      return;
    }

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    let userInfo: { id?: string; name?: string; username?: string; profile_image_url?: string } = {};
    try {
      const userRes = await fetch(
        'https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (userRes.ok) {
        const userJson: any = await userRes.json();
        userInfo = userJson.data ?? {};
      }
    } catch {
      // Non-fatal
    }

    if (!supabaseAdmin) {
      res.writeHead(302, { Location: '/social?x=error&msg=Supabase+not+configured' });
      res.end();
      return;
    }

    const { error: dbError } = await supabaseAdmin
      .from('workspace_data')
      .upsert(
        {
          key: 'x_auth',
          value: {
            accessToken,
            refreshToken: refreshToken ?? null,
            expiresAt,
            userId: userInfo.id ?? null,
            name: userInfo.name ?? null,
            username: userInfo.username ?? null,
            picture: userInfo.profile_image_url ?? null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (dbError) {
      res.writeHead(302, {
        Location: `/social?x=error&msg=${encodeURIComponent(dbError.message)}`,
      });
      res.end();
      return;
    }

    res.setHeader('Set-Cookie', [
      'x_code_verifier=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/api',
    ]);
    res.writeHead(302, { Location: '/social?x=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, {
      Location: `/social?x=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}`,
    });
    res.end();
  }
}
