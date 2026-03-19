export interface LinkedInPostRequest {
  authorUrn: string;           // e.g. "urn:li:person:XXXXXXXX"
  text: string;
}

export interface LinkedInPostResponse {
  id: string;
}

export class LinkedInError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

export async function createLinkedInPost(
  accessToken: string,
  req: LinkedInPostRequest,
): Promise<LinkedInPostResponse> {
  if (!req.text.trim()) {
    throw new LinkedInError('Post text cannot be empty.', 400);
  }

  const body = {
    author: req.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: req.text,
        },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LinkedInError(
      `LinkedIn API error (${res.status}): ${text}`,
      res.status,
    );
  }

  const location = res.headers.get('x-restli-id') || '';
  return { id: location };
}

