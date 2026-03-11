import type { NextApiRequest, NextApiResponse } from 'next';
import { createLinkedInPost, LinkedInError } from '../src/lib/linkedin';

// NOTE:
// This function is a sketch of a first-party LinkedIn integration for Litehouse.
// It expects you to:
// - Set LINKEDIN_ACCESS_TOKEN in your Vercel environment (Reed's token).
// - Set LINKEDIN_AUTHOR_URN to something like "urn:li:person:XXXXXXXX".
// It does not perform OAuth itself and NEVER exposes the token to the client.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN;

  if (!accessToken || !authorUrn) {
    res.status(500).json({
      error: 'LinkedIn is not configured on the server.',
      detail: 'Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN in your environment.',
    });
    return;
  }

  const { text, dryRun } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  // Hard human-approval rule: this endpoint should only be called
  // AFTER a post has been approved in the UI.
  // The frontend must enforce that state machine; this route never auto-posts.

  if (dryRun) {
    res.status(200).json({
      ok: true,
      dryRun: true,
      preview: {
        authorUrn,
        text,
      },
    });
    return;
  }

  try {
    const result = await createLinkedInPost(accessToken, {
      authorUrn,
      text,
    });
    res.status(200).json({ ok: true, id: result.id });
  } catch (err: any) {
    if (err instanceof LinkedInError) {
      res.status(err.status || 502).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unexpected LinkedIn error', detail: err?.message ?? String(err) });
    }
  }
}

