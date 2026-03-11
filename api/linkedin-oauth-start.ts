export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'LinkedIn OAuth is not configured.',
      detail: 'Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI in your environment.',
    }));
    return;
  }

  const state = 'litehouse-linkedin'; // For Reed-only instance; for multi-user, generate per-session
  const scope = encodeURIComponent('openid profile email w_member_social');
  const encodedRedirect = encodeURIComponent(redirectUri);

  const url =
    `https://www.linkedin.com/oauth/v2/authorization` +
    `?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodedRedirect}` +
    `&scope=${scope}` +
    `&state=${state}`;

  res.writeHead(302, { Location: url });
  res.end();
}

