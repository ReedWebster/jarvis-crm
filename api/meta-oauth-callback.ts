import { supabaseAdmin } from '../lib/_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '', `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    res.writeHead(302, {
      Location: `/social?meta=error&msg=${encodeURIComponent(errorDescription || error)}`,
    });
    res.end();
    return;
  }

  if (!code) {
    res.writeHead(302, { Location: '/social?meta=error&msg=Missing+authorization+code' });
    res.end();
    return;
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    res.writeHead(302, { Location: '/social?meta=error&msg=Meta+OAuth+not+configured+on+server' });
    res.end();
    return;
  }

  try {
    // Exchange code for short-lived user access token
    const tokenUrl =
      `https://graph.facebook.com/v20.0/oauth/access_token` +
      `?client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.writeHead(302, {
        Location: `/social?meta=error&msg=${encodeURIComponent('Token exchange failed: ' + text)}`,
      });
      res.end();
      return;
    }

    const tokenJson: any = await tokenRes.json();
    const shortLivedToken: string | undefined = tokenJson.access_token;

    if (!shortLivedToken) {
      res.writeHead(302, { Location: '/social?meta=error&msg=No+access+token+returned' });
      res.end();
      return;
    }

    // Exchange for long-lived token (60-day expiry)
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${shortLivedToken}`
    );

    let accessToken = shortLivedToken;
    let expiresAt: string | null = null;

    if (longLivedRes.ok) {
      const longLivedJson: any = await longLivedRes.json();
      if (longLivedJson.access_token) {
        accessToken = longLivedJson.access_token;
        const expiresIn: number | undefined = longLivedJson.expires_in;
        expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
      }
    }

    // Fetch user profile
    let profile: { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } } = {};
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name,email,picture&access_token=${accessToken}`
      );
      if (profileRes.ok) {
        profile = await profileRes.json();
      }
    } catch {
      // Non-fatal
    }

    // Fetch connected Facebook Pages
    let pages: { id: string; name: string; access_token: string }[] = [];
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v20.0/me/accounts?access_token=${accessToken}`
      );
      if (pagesRes.ok) {
        const pagesJson: any = await pagesRes.json();
        pages = pagesJson.data ?? [];
      }
    } catch {
      // Non-fatal
    }

    // Fetch Instagram Business Accounts linked to pages
    let instagramAccounts: { id: string; name: string; username: string; pageId: string; pageToken: string }[] = [];
    for (const page of pages) {
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v20.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        if (igRes.ok) {
          const igJson: any = await igRes.json();
          if (igJson.instagram_business_account?.id) {
            const igId = igJson.instagram_business_account.id;
            const igDetailsRes = await fetch(
              `https://graph.facebook.com/v20.0/${igId}?fields=id,name,username&access_token=${page.access_token}`
            );
            if (igDetailsRes.ok) {
              const igDetails: any = await igDetailsRes.json();
              instagramAccounts.push({
                id: igId,
                name: igDetails.name ?? '',
                username: igDetails.username ?? '',
                pageId: page.id,
                pageToken: page.access_token,
              });
            }
          }
        }
      } catch {
        // Non-fatal
      }
    }

    if (!supabaseAdmin) {
      res.writeHead(302, { Location: '/social?meta=error&msg=Supabase+not+configured' });
      res.end();
      return;
    }

    const { error: dbError } = await supabaseAdmin
      .from('workspace_data')
      .upsert(
        {
          key: 'meta_auth',
          value: {
            accessToken,
            expiresAt,
            userId: profile.id ?? null,
            name: profile.name ?? null,
            email: profile.email ?? null,
            picture: profile.picture?.data?.url ?? null,
            pages,
            instagramAccounts,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (dbError) {
      res.writeHead(302, {
        Location: `/social?meta=error&msg=${encodeURIComponent(dbError.message)}`,
      });
      res.end();
      return;
    }

    res.writeHead(302, { Location: '/social?meta=connected' });
    res.end();
  } catch (e: any) {
    res.writeHead(302, {
      Location: `/social?meta=error&msg=${encodeURIComponent(e?.message ?? 'Unknown error')}`,
    });
    res.end();
  }
}
