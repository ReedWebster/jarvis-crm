import { GOOGLE_CLIENT_ID, saveGoogleServerAuth } from './_googleAuth.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
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
    // Exchange authorization code for tokens
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

    // Store in Supabase
    await saveGoogleServerAuth(userId, refreshToken, accessToken, expiresIn);

    // Redirect back to the app
    res.writeHead(302, { Location: '/?google_briefing=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, { Location: `/?google_briefing=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}` });
    res.end();
  }
}
