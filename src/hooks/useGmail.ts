import { useState, useCallback, useRef } from 'react';

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
const SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_KEY = 'gmail_token';
const EXPIRY_KEY = 'gmail_token_expiry';

// ─── Parsed message type ─────────────────────────────────────────────────────

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
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

  const isConnected = token !== null;

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
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const stored = getStoredToken();
    if (stored) return stored;
    await connect();
    const fresh = localStorage.getItem(TOKEN_KEY);
    if (!fresh) throw new Error('Failed to obtain Gmail token');
    return fresh;
  }, [connect]);

  const sendEmail = useCallback(
    async (
      to: string,
      subject: string,
      body: string,
      replyToMessageId?: string
    ): Promise<void> => {
      setIsLoading(true);
      try {
        const accessToken = await getToken();

        const lines = [
          `To: ${to}`,
          `From: me`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
        ];
        if (replyToMessageId) {
          lines.push(`In-Reply-To: ${replyToMessageId}`);
          lines.push(`References: ${replyToMessageId}`);
        }
        lines.push('', body);

        const message = lines.join('\r\n');
        const encoded = btoa(unescape(encodeURIComponent(message)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const url = replyToMessageId
          ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
          : `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`;

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `Send failed: ${res.status}`);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  const decodeBase64Url = (data: string): string => {
    try {
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(base64)));
    } catch {
      return '';
    }
  };

  const getHeader = (headers: Array<{ name: string; value: string }>, name: string): string => {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  };

  const parseMessageBody = (payload: any): string => {
    if (!payload) return '';

    // Multipart: look for text/plain part
    if (payload.parts && Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return decodeBase64Url(part.body.data);
        }
      }
      // Recurse into nested parts
      for (const part of payload.parts) {
        const result = parseMessageBody(part);
        if (result) return result;
      }
    }

    // Single part
    if (payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }

    return '';
  };

  const fetchThreads = useCallback(
    async (email: string): Promise<GmailMessage[]> => {
      setIsLoading(true);
      try {
        const accessToken = await getToken();

        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${encodeURIComponent(email)}+OR+to:${encodeURIComponent(email)}&maxResults=20`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!listRes.ok) {
          throw new Error(`Failed to fetch message list: ${listRes.status}`);
        }

        const listData = await listRes.json();
        const messageItems: Array<{ id: string }> = listData.messages ?? [];

        if (messageItems.length === 0) return [];

        const messages = await Promise.all(
          messageItems.map(async ({ id }) => {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            if (!msgRes.ok) return null;
            return msgRes.json();
          })
        );

        return messages
          .filter(Boolean)
          .map((msg: any): GmailMessage => {
            const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
            return {
              id: msg.id,
              subject: getHeader(headers, 'Subject') || '(no subject)',
              from: getHeader(headers, 'From'),
              to: getHeader(headers, 'To'),
              date: getHeader(headers, 'Date'),
              snippet: msg.snippet ?? '',
              body: parseMessageBody(msg.payload),
            };
          });
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  return {
    isConnected,
    isLoading,
    connect,
    disconnect,
    sendEmail,
    fetchThreads,
  };
}
