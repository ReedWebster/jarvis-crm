import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../lib/_googleAuth.js';
import { randomBytes, createHash } from 'crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const provider = url.searchParams.get('provider');

  if (provider === 'google') {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      res.status(500).json({ error: 'GOOGLE_REDIRECT_URI is not configured.' });
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
