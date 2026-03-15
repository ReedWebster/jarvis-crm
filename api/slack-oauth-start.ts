export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Slack OAuth is not configured.',
      detail: 'Set SLACK_CLIENT_ID and SLACK_REDIRECT_URI in your environment.',
    }));
    return;
  }

  const state = 'litehouse-slack';
  const userScope = encodeURIComponent(
    'channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,users:read,chat:write',
  );
  const encodedRedirect = encodeURIComponent(redirectUri);

  const url =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodedRedirect}` +
    `&user_scope=${userScope}` +
    `&state=${state}`;

  res.writeHead(302, { Location: url });
  res.end();
}
