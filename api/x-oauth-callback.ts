import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

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
    // Exchange authorization code for tokens
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

    // Fetch authenticated user info
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

    // Clear the PKCE cookie
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
