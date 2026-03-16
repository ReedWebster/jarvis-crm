import { randomBytes, createHash } from 'crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'X OAuth is not configured.',
      detail: 'Set X_CLIENT_ID and X_REDIRECT_URI in your environment.',
    }));
    return;
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const state = 'litehouse-x';

  const scope = 'tweet.read tweet.write users.read offline.access';

  const url =
    `https://twitter.com/i/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  // Store the verifier in a short-lived cookie for the callback to read
  res.setHeader('Set-Cookie', [
    `x_code_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api`,
  ]);
  res.writeHead(302, { Location: url });
  res.end();
}
