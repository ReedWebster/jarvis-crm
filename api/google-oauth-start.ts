import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './_googleAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    res.status(500).json({ error: 'GOOGLE_REDIRECT_URI is not configured.' });
    return;
  }

  const state = 'litehouse-google-briefing';

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(GOOGLE_SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  res.writeHead(302, { Location: url });
  res.end();
}
