import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * CardDAV proxy for Apple/iCloud Contacts.
 *
 * DELETE — delete a contact by UID from iCloud via CardDAV
 * POST   — discover the CardDAV principal URL for credential setup
 *
 * iCloud CardDAV endpoint: contacts.icloud.com
 * Auth: Basic (Apple ID email + app-specific password)
 */

const CARDDAV_HOST = 'https://contacts.icloud.com';

function basicAuth(email: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${email}:${appPassword}`).toString('base64');
}

// ── Discover principal URL via PROPFIND ──────────────────────────────────────

async function discoverPrincipal(email: string, appPassword: string): Promise<string> {
  // Step 1: PROPFIND on root to get current-user-principal
  const res = await fetch(`${CARDDAV_HOST}/`, {
    method: 'PROPFIND',
    headers: {
      Authorization: basicAuth(email, appPassword),
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '0',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:current-user-principal/>
  </A:prop>
</A:propfind>`,
  });

  if (res.status === 401) throw new Error('Invalid Apple ID or app-specific password');
  if (!res.ok) throw new Error(`PROPFIND failed: ${res.status}`);

  const xml = await res.text();

  // Extract principal href from XML response
  const hrefMatch = xml.match(/<[^>]*current-user-principal[^>]*>[\s\S]*?<[^>]*href[^>]*>([^<]+)<\/[^>]*href/i);
  if (!hrefMatch?.[1]) throw new Error('Could not discover principal URL');

  const principal = hrefMatch[1].trim();

  // Step 2: PROPFIND on principal to get addressbook-home-set
  const homeRes = await fetch(`${CARDDAV_HOST}${principal}`, {
    method: 'PROPFIND',
    headers: {
      Authorization: basicAuth(email, appPassword),
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '0',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <A:prop>
    <C:addressbook-home-set/>
  </A:prop>
</A:propfind>`,
  });

  if (!homeRes.ok) throw new Error(`Home-set PROPFIND failed: ${homeRes.status}`);

  const homeXml = await homeRes.text();
  const homeMatch = homeXml.match(/<[^>]*addressbook-home-set[^>]*>[\s\S]*?<[^>]*href[^>]*>([^<]+)<\/[^>]*href/i);
  if (!homeMatch?.[1]) throw new Error('Could not discover addressbook home');

  return homeMatch[1].trim();
}

// ── Find the vCard URL for a UID via REPORT ──────────────────────────────────

async function findContactUrl(
  principal: string,
  uid: string,
  email: string,
  appPassword: string,
): Promise<string | null> {
  // Use addressbook-multiget with a UID filter to find the contact's URL
  // First, list all contacts in the default addressbook
  const addressbookUrl = `${CARDDAV_HOST}${principal}card/`;

  const res = await fetch(addressbookUrl, {
    method: 'REPORT',
    headers: {
      Authorization: basicAuth(email, appPassword),
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<C:addressbook-query xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <A:prop>
    <A:getetag/>
  </A:prop>
  <C:filter>
    <C:prop-filter name="UID">
      <C:text-match collation="i;octet">${escapeXml(uid)}</C:text-match>
    </C:prop-filter>
  </C:filter>
</C:addressbook-query>`,
  });

  if (!res.ok) {
    // Fallback: try the conventional URL pattern
    return `${addressbookUrl}${uid}.vcf`;
  }

  const xml = await res.text();
  const hrefMatch = xml.match(/<[^>]*href[^>]*>([^<]*\.vcf)<\/[^>]*href/i);
  if (hrefMatch?.[1]) return `${CARDDAV_HOST}${hrefMatch[1].trim()}`;

  // Fallback: conventional URL pattern (most iCloud contacts use UID.vcf)
  return `${addressbookUrl}${uid}.vcf`;
}

// ── Delete a contact by UID ──────────────────────────────────────────────────

async function deleteContact(
  principal: string,
  uid: string,
  email: string,
  appPassword: string,
): Promise<void> {
  const contactUrl = await findContactUrl(principal, uid, email, appPassword);
  if (!contactUrl) throw new Error('Contact not found');

  const fullUrl = contactUrl.startsWith('http') ? contactUrl : `${CARDDAV_HOST}${contactUrl}`;

  const res = await fetch(fullUrl, {
    method: 'DELETE',
    headers: {
      Authorization: basicAuth(email, appPassword),
    },
  });

  // 204 = deleted, 404 = already gone — both are fine
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`CardDAV DELETE failed: ${res.status}`);
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') {
    const { uid, email, appPassword, principal } = req.body ?? {};
    if (!uid || !email || !appPassword) {
      return res.status(400).json({ error: 'Missing uid, email, or appPassword' });
    }

    try {
      // If no principal stored, discover it first
      let principalPath = principal;
      if (!principalPath) {
        principalPath = await discoverPrincipal(email, appPassword);
      }

      await deleteContact(principalPath, uid, email, appPassword);
      return res.status(200).json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'POST') {
    const { action, email, appPassword } = req.body ?? {};

    if (action === 'discover') {
      if (!email || !appPassword) {
        return res.status(400).json({ error: 'Missing email or appPassword' });
      }

      try {
        const principal = await discoverPrincipal(email, appPassword);
        return res.status(200).json({ principal });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return res.status(401).json({ error: message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
