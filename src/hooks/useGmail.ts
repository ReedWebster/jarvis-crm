import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Google Identity Services type declarations ───────────────────────────────

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_ID = '8551940265-5t2rjjtb495tvbdj519d569vq4aa57ge.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify';
const TOKEN_KEY = 'gmail_token';
const EXPIRY_KEY = 'gmail_token_expiry';
const SUPABASE_KEY = 'jarvis:gmail_auth';

interface GmailAuth {
  access_token: string;
  expires_at: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  inlineImages?: Record<string, string>; // contentId → data URL
  attachments: GmailAttachment[];
  isRead: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGmail() {
  const getStoredToken = (): string | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (!token || !expiry) return null;
    if (Date.now() > parseInt(expiry, 10)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRY_KEY);
      return null;
    }
    return token;
  };

  const [token, setToken] = useState<string | null>(getStoredToken);
  const [isLoading, setIsLoading] = useState(false);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const userIdRef = useRef<string | null>(null);

  const isConnected = token !== null;

  // ── Subscribe to Supabase auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      userIdRef.current = session?.user.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user.id ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  const silentReconnectRef = useRef(false);

  // ── On login: restore Gmail token from Supabase, or silently re-auth if expired ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user.id;
      if (!uid) return;
      supabase
        .from('user_data')
        .select('value')
        .eq('user_id', uid)
        .eq('key', SUPABASE_KEY)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.value) return;
          const auth = data.value as GmailAuth;
          if (Date.now() < auth.expires_at) {
            // Token still valid — restore immediately
            localStorage.setItem(TOKEN_KEY, auth.access_token);
            localStorage.setItem(EXPIRY_KEY, String(auth.expires_at));
            setToken(auth.access_token);
          } else {
            // Token expired — attempt silent re-auth once GIS is ready
            silentReconnectRef.current = true;
            attemptSilentReconnect();
          }
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attemptSilentReconnect = () => {
    // Poll for GIS to load (it's a script tag loaded async in index.html)
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds
    const poll = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2) {
        clearInterval(poll);
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: TokenResponse) => {
            if (response.error || !silentReconnectRef.current) return;
            const expiresAt = Date.now() + response.expires_in * 1000;
            localStorage.setItem(TOKEN_KEY, response.access_token);
            localStorage.setItem(EXPIRY_KEY, String(expiresAt));
            setToken(response.access_token);
            saveTokenToSupabase(response.access_token, expiresAt);
          },
        });
        // prompt: '' = silent if user has previously authorized; shows popup only if needed
        client.requestAccessToken({ prompt: '' });
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
      }
    }, 500);
  };

  const saveTokenToSupabase = (accessToken: string, expiresAt: number) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const auth: GmailAuth = { access_token: accessToken, expires_at: expiresAt };
    supabase.from('user_data').upsert(
      { user_id: uid, key: SUPABASE_KEY, value: auth, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );
  };

  const clearTokenFromSupabase = () => {
    const uid = userIdRef.current;
    if (!uid) return;
    supabase.from('user_data').delete().eq('user_id', uid).eq('key', SUPABASE_KEY);
  };

  const connect = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google Identity Services not loaded'));
        return;
      }

      if (!tokenClientRef.current) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: TokenResponse) => {
            if (response.error) {
              reject(new Error(response.error));
              return;
            }
            const expiresAt = Date.now() + response.expires_in * 1000;
            localStorage.setItem(TOKEN_KEY, response.access_token);
            localStorage.setItem(EXPIRY_KEY, String(expiresAt));
            setToken(response.access_token);
            // Persist per-user Gmail auth so the connection
            // can be restored automatically on future logins.
            saveTokenToSupabase(response.access_token, expiresAt);
            resolve();
          },
        });
      }

      tokenClientRef.current.requestAccessToken({ prompt: '' });
    });
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    setToken(null);
    tokenClientRef.current = null;
    clearTokenFromSupabase();
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const stored = getStoredToken();
    if (stored) return stored;
    await connect();
    const fresh = localStorage.getItem(TOKEN_KEY);
    if (!fresh) throw new Error('Failed to obtain Gmail token');
    return fresh;
  }, [connect]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const decodeBase64Url = (data: string): string => {
    try {
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return '';
    }
  };

  const getHeader = (headers: Array<{ name: string; value: string }>, name: string): string => {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  };

  const parseMessageBody = (payload: any): string => {
    if (!payload) return '';
    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return decodeBase64Url(part.body.data);
        }
      }
      for (const part of payload.parts) {
        const result = parseMessageBody(part);
        if (result) return result;
      }
    }
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }
    return '';
  };

  const parseHtmlBody = (payload: any): string => {
    if (!payload) return '';
    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return decodeBase64Url(part.body.data);
        }
      }
      for (const part of payload.parts) {
        const result = parseHtmlBody(part);
        if (result) return result;
      }
    }
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }
    return '';
  };

  const parseInlineImages = (payload: any): Record<string, string> => {
    const map: Record<string, string> = {};
    const extract = (parts: any[]) => {
      for (const part of parts) {
        if (
          part.mimeType?.startsWith('image/') &&
          part.body?.data &&
          !part.body?.attachmentId
        ) {
          const cidHeader = (part.headers as Array<{ name: string; value: string }> | undefined)
            ?.find(h => h.name.toLowerCase() === 'content-id')?.value;
          if (cidHeader) {
            const cid = cidHeader.replace(/^<|>$/g, '');
            map[cid] = `data:${part.mimeType};base64,${part.body.data.replace(/-/g, '+').replace(/_/g, '/')}`;
          }
        }
        if (part.parts) extract(part.parts);
      }
    };
    if (payload?.parts) extract(payload.parts);
    return map;
  };

  const parseAttachments = (payload: any): GmailAttachment[] => {
    const attachments: GmailAttachment[] = [];
    const extract = (parts: any[]) => {
      for (const part of parts) {
        if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType ?? 'application/octet-stream',
            size: part.body.size ?? 0,
          });
        }
        if (part.parts) extract(part.parts);
      }
    };
    if (payload?.parts) extract(payload.parts);
    return attachments;
  };

  const parseMessageData = (msg: any): GmailMessage => {
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
    const htmlBody = parseHtmlBody(msg.payload);
    const inlineImages = parseInlineImages(msg.payload);
    return {
      id: msg.id,
      threadId: msg.threadId ?? msg.id,
      subject: getHeader(headers, 'Subject') || '(no subject)',
      from: getHeader(headers, 'From'),
      to: getHeader(headers, 'To'),
      date: getHeader(headers, 'Date'),
      snippet: msg.snippet ?? '',
      body: parseMessageBody(msg.payload),
      htmlBody: htmlBody || undefined,
      inlineImages: Object.keys(inlineImages).length > 0 ? inlineImages : undefined,
      attachments: parseAttachments(msg.payload),
      isRead: !(msg.labelIds ?? []).includes('UNREAD'),
    };
  };

  const fetchMessageById = async (id: string, accessToken: string): Promise<any | null> => {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    return res.json();
  };

  // ─── Encode raw MIME message for Gmail API ───────────────────────────────────

  const encodeMimeMessage = (mimeMessage: string): string => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(mimeMessage);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const buildMimeMessage = async (
    to: string,
    subject: string,
    body: string,
    replyToMessageId?: string,
    attachments?: File[]
  ): Promise<string> => {
    const extraHeaders: string[] = [];
    if (replyToMessageId) {
      extraHeaders.push(`In-Reply-To: ${replyToMessageId}`);
      extraHeaders.push(`References: ${replyToMessageId}`);
    }

    if (!attachments || attachments.length === 0) {
      const lines = [
        `To: ${to}`,
        `From: me`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ...extraHeaders,
        '',
        body,
      ];
      return lines.join('\r\n');
    }

    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const headers = [
      `To: ${to}`,
      `From: me`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ...extraHeaders,
    ].join('\r\n');

    const textPart =
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `\r\n` +
      body;

    const attachmentParts: string[] = [];
    for (const file of attachments) {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      // Wrap at 76 chars for MIME compliance
      const wrapped = base64Data.match(/.{1,76}/g)?.join('\r\n') ?? base64Data;
      attachmentParts.push(
        `--${boundary}\r\n` +
        `Content-Type: ${file.type || 'application/octet-stream'}; name="${file.name}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${file.name}"\r\n` +
        `\r\n` +
        wrapped
      );
    }

    return (
      headers +
      '\r\n\r\n' +
      [textPart, ...attachmentParts].join('\r\n\r\n') +
      `\r\n--${boundary}--`
    );
  };

  // ─── Send email ──────────────────────────────────────────────────────────────

  const sendEmail = useCallback(
    async (
      to: string,
      subject: string,
      body: string,
      replyToMessageId?: string,
      attachments?: File[]
    ): Promise<void> => {
      setIsLoading(true);
      try {
        const accessToken = await getToken();
        const mimeMessage = await buildMimeMessage(to, subject, body, replyToMessageId, attachments);
        const raw = encodeMimeMessage(mimeMessage);

        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw }),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any)?.error?.message ?? `Send failed: ${res.status}`);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  // ─── Fetch threads by contact email ──────────────────────────────────────────

  const fetchThreads = useCallback(
    async (email: string): Promise<GmailMessage[]> => {
      setIsLoading(true);
      try {
        const accessToken = await getToken();

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${encodeURIComponent(email)}+OR+to:${encodeURIComponent(email)}&maxResults=20`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!listRes.ok) throw new Error(`Failed to fetch message list: ${listRes.status}`);

        const listData = await listRes.json();
        const messageItems: Array<{ id: string }> = listData.messages ?? [];
        if (messageItems.length === 0) return [];

        const messages = await Promise.all(
          messageItems.map(({ id }) => fetchMessageById(id, accessToken))
        );

        return messages.filter(Boolean).map(parseMessageData);
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  // ─── Fetch inbox ─────────────────────────────────────────────────────────────

  const fetchInbox = useCallback(
    async (maxResults = 50, query = ''): Promise<GmailMessage[]> => {
      setIsLoading(true);
      try {
        const accessToken = await getToken();

        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (query) {
          params.set('q', query);
        } else {
          params.set('labelIds', 'INBOX');
        }

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!listRes.ok) throw new Error(`Failed to fetch inbox: ${listRes.status}`);

        const listData = await listRes.json();
        const messageItems: Array<{ id: string }> = listData.messages ?? [];
        if (messageItems.length === 0) return [];

        const messages = await Promise.all(
          messageItems.map(({ id }) => fetchMessageById(id, accessToken))
        );

        return messages.filter(Boolean).map(parseMessageData);
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  // ─── Download attachment ──────────────────────────────────────────────────────

  const downloadAttachment = useCallback(
    async (messageId: string, attachmentId: string, filename: string, mimeType: string): Promise<void> => {
      const accessToken = await getToken();

      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) throw new Error(`Failed to download attachment: ${res.status}`);

      const data = await res.json();
      const base64 = (data.data as string).replace(/-/g, '+').replace(/_/g, '/');
      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [getToken]
  );

  // ─── Helper: handle API errors, auto-disconnect on scope issues ──────────────

  const handleApiError = useCallback(async (res: Response, fallback: string): Promise<never> => {
    const err = await res.json().catch(() => ({}));
    const msg: string = (err as any)?.error?.message ?? fallback;
    if (res.status === 401 || (res.status === 403 && msg.toLowerCase().includes('scope'))) {
      // Token is missing required scopes or is invalid — clear it so user re-authorizes
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRY_KEY);
      setToken(null);
      tokenClientRef.current = null;
      clearTokenFromSupabase();
      throw new Error('Gmail needs to be reconnected to enable new permissions. Please click "Connect Gmail".');
    }
    throw new Error(msg);
  }, []);

  // ─── Trash email ──────────────────────────────────────────────────────────────

  const trashEmail = useCallback(async (messageId: string): Promise<void> => {
    const accessToken = await getToken();
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) await handleApiError(res, `Trash failed: ${res.status}`);
  }, [getToken, handleApiError]);

  // ─── Mark as read ─────────────────────────────────────────────────────────────

  const markAsRead = useCallback(async (messageId: string): Promise<void> => {
    const accessToken = await getToken();
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }
    );
    if (!res.ok) await handleApiError(res, `Mark as read failed: ${res.status}`);
  }, [getToken, handleApiError]);

  return {
    isConnected,
    isLoading,
    connect,
    disconnect,
    sendEmail,
    fetchThreads,
    fetchInbox,
    downloadAttachment,
    trashEmail,
    markAsRead,
  };
}
