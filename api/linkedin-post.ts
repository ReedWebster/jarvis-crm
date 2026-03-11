import { createLinkedInPost, LinkedInError } from '../src/lib/linkedin';
import { supabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!supabaseAdmin) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Supabase admin client is not configured.' }));
    return;
  }

  const { data, error: dbError } = await supabaseAdmin
    .from('workspace_data')
    .select('value')
    .eq('key', 'linkedin_auth')
    .maybeSingle();

  if (dbError || !data?.value?.accessToken) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'LinkedIn is not connected. Authorize via the Social Accounts tab first.' }));
    return;
  }

  const accessToken: string = data.value.accessToken;
  const authorUrn: string | undefined = data.value.authorUrn;

  if (!authorUrn) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'LinkedIn author URN not found. Please reconnect LinkedIn.' }));
    return;
  }

  const { text, dryRun } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'text is required' }));
    return;
  }

  // Hard human-approval rule: this endpoint should only be called
  // AFTER a post has been approved in the UI.
  // The frontend must enforce that state machine; this route never auto-posts.

  if (dryRun) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      dryRun: true,
      preview: {
        authorUrn,
        text,
      },
    }));
    return;
  }

  try {
    const result = await createLinkedInPost(accessToken, {
      authorUrn,
      text,
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, id: result.id }));
  } catch (err: any) {
    if (err instanceof LinkedInError) {
      res.statusCode = err.status || 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    } else {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unexpected LinkedIn error', detail: err?.message ?? String(err) }));
    }
  }
}

