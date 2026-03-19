export interface LinkedInPostRequest {
  authorUrn: string;           // e.g. "urn:li:person:XXXXXXXX"
  text: string;
  imageUrl?: string;           // public URL of an uploaded image
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

/**
 * Register an image upload with LinkedIn, upload the binary, then return the asset URN.
 */
async function uploadImageToLinkedIn(
  accessToken: string,
  authorUrn: string,
  imageBuffer: Buffer,
): Promise<string> {
  // Step 1: Register the upload
  const registerBody = {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: authorUrn,
      serviceRelationships: [
        { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
      ],
    },
  };

  const regRes = await fetch(`${LINKEDIN_API_BASE}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(registerBody),
  });

  if (!regRes.ok) {
    const text = await regRes.text();
    throw new LinkedInError(`LinkedIn image register failed (${regRes.status}): ${text}`, regRes.status);
  }

  const regData = await regRes.json();
  const uploadUrl: string = regData.value?.uploadMechanism?.[
    'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
  ]?.uploadUrl;
  const asset: string = regData.value?.asset;

  if (!uploadUrl || !asset) {
    throw new LinkedInError('LinkedIn did not return an upload URL or asset.', 500);
  }

  // Step 2: Upload the binary
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'image/png',
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new LinkedInError(`LinkedIn image upload failed (${uploadRes.status}): ${text}`, uploadRes.status);
  }

  return asset;
}

export async function createLinkedInPost(
  accessToken: string,
  req: LinkedInPostRequest,
  imageBuffer?: Buffer,
): Promise<LinkedInPostResponse> {
  if (!req.text.trim()) {
    throw new LinkedInError('Post text cannot be empty.', 400);
  }

  let mediaAsset: string | undefined;
  if (imageBuffer && imageBuffer.length > 0) {
    mediaAsset = await uploadImageToLinkedIn(accessToken, req.authorUrn, imageBuffer);
  }

  const shareContent: any = {
    shareCommentary: { text: req.text },
    shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
  };

  if (mediaAsset) {
    shareContent.media = [
      {
        status: 'READY',
        media: mediaAsset,
      },
    ];
  }

  const body = {
    author: req.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent,
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
