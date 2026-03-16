export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Meta OAuth is not configured.',
      detail: 'Set META_APP_ID and META_REDIRECT_URI in your environment.',
    }));
    return;
  }

  // Scopes cover both Facebook Pages posting and Instagram Business publishing
  const scope = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
  ].join(',');

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=litehouse-meta` +
    `&response_type=code`;

  res.writeHead(302, { Location: url });
  res.end();
}
