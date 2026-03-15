import { useState, useEffect, useCallback, useRef } from 'react';
import type { SlackChannel, SlackMessage, SlackUser } from '../types/slack';

type SlackStatus = 'loading' | 'disconnected' | 'connected';

interface SlackState {
  status: SlackStatus;
  teamName: string;
  userName: string;
  userAvatar: string;
}

async function slackApi(method: string, params?: Record<string, any>): Promise<any> {
  const res = await fetch('/api/slack-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) throw new Error(`Slack API error: ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'Slack API returned error');
  return json;
}

export function useSlack() {
  const [state, setState] = useState<SlackState>({
    status: 'loading',
    teamName: '',
    userName: '',
    userAvatar: '',
  });
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usersCache = useRef<Map<string, SlackUser>>(new Map());

  // ─── Check connection status ───────────────────────────────────────────────

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/slack-status');
      const json = await res.json();
      setState({
        status: json.status === 'connected' ? 'connected' : 'disconnected',
        teamName: json.teamName ?? '',
        userName: json.userName ?? '',
        userAvatar: json.userAvatar ?? '',
      });
    } catch {
      setState(s => ({ ...s, status: 'disconnected' }));
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ─── Connect / Disconnect ──────────────────────────────────────────────────

  const connect = useCallback(() => {
    window.location.href = '/api/slack-oauth-start';
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/slack-disconnect', { method: 'POST' });
    } catch {
      // best-effort
    }
    setState({ status: 'disconnected', teamName: '', userName: '', userAvatar: '' });
    setChannels([]);
    setMessages([]);
    usersCache.current.clear();
  }, []);

  // ─── Resolve user info ────────────────────────────────────────────────────

  const resolveUser = useCallback(async (userId: string): Promise<SlackUser | null> => {
    if (usersCache.current.has(userId)) return usersCache.current.get(userId)!;
    try {
      const json = await slackApi('users.info', { user: userId });
      const u = json.user;
      const su: SlackUser = {
        id: u.id,
        displayName: u.profile?.display_name || u.real_name || u.name || u.id,
        realName: u.real_name || u.name || u.id,
        avatar: u.profile?.image_72 || u.profile?.image_48 || '',
        isBot: u.is_bot ?? false,
      };
      usersCache.current.set(userId, su);
      return su;
    } catch {
      return null;
    }
  }, []);

  // ─── Batch resolve multiple users ─────────────────────────────────────────

  const resolveUsers = useCallback(async (userIds: string[]): Promise<Map<string, SlackUser>> => {
    const missing = userIds.filter(id => !usersCache.current.has(id));
    await Promise.all(missing.map(id => resolveUser(id)));
    return usersCache.current;
  }, [resolveUser]);

  // ─── Fetch channels ───────────────────────────────────────────────────────

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allChannels: SlackChannel[] = [];
      let cursor: string | undefined;

      // Paginate through all channels
      do {
        const params: any = {
          types: 'public_channel,private_channel,im,mpim',
          exclude_archived: true,
          limit: 200,
        };
        if (cursor) params.cursor = cursor;

        const json = await slackApi('conversations.list', params);
        const raw: any[] = json.channels ?? [];

        for (const ch of raw) {
          const type = ch.is_im ? 'im' : ch.is_mpim ? 'mpim' : ch.is_private ? 'group' : 'channel';
          const channel: SlackChannel = {
            id: ch.id,
            name: ch.name ?? ch.id,
            type,
            isPrivate: ch.is_private ?? false,
            topic: ch.topic?.value || undefined,
            purpose: ch.purpose?.value || undefined,
            numMembers: ch.num_members,
            unreadCount: ch.unread_count_display ?? ch.unread_count ?? 0,
          };

          // For DMs, resolve the other user's name
          if (type === 'im' && ch.user) {
            const user = await resolveUser(ch.user);
            if (user) {
              channel.name = user.displayName;
              channel.dmUserName = user.displayName;
              channel.dmUserAvatar = user.avatar;
            }
          }

          allChannels.push(channel);
        }

        cursor = json.response_metadata?.next_cursor || undefined;
      } while (cursor);

      // Sort: unread first, then alphabetically
      allChannels.sort((a, b) => {
        const ua = a.unreadCount ?? 0;
        const ub = b.unreadCount ?? 0;
        if (ua > 0 && ub === 0) return -1;
        if (ua === 0 && ub > 0) return 1;
        return a.name.localeCompare(b.name);
      });

      setChannels(allChannels);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch channels');
    } finally {
      setIsLoading(false);
    }
  }, [resolveUser]);

  // ─── Fetch messages ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (channelId: string, olderThanTs?: string): Promise<SlackMessage[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = { channel: channelId, limit: 50 };
      if (olderThanTs) params.latest = olderThanTs;

      const json = await slackApi('conversations.history', params);
      const raw: any[] = json.messages ?? [];

      // Resolve all unique user IDs
      const userIds = [...new Set(raw.map((m: any) => m.user).filter(Boolean))];
      await resolveUsers(userIds);

      const msgs: SlackMessage[] = raw.map((m: any) => {
        const user = usersCache.current.get(m.user);
        return {
          ts: m.ts,
          userId: m.user ?? '',
          text: m.text ?? '',
          displayName: user?.displayName ?? m.user ?? 'Unknown',
          avatar: user?.avatar ?? '',
          attachments: (m.attachments ?? []).map((a: any) => ({
            title: a.title,
            text: a.text,
            imageUrl: a.image_url,
            thumbUrl: a.thumb_url,
          })),
          reactions: (m.reactions ?? []).map((r: any) => ({
            name: r.name,
            count: r.count,
            users: r.users ?? [],
          })),
          threadTs: m.thread_ts !== m.ts ? m.thread_ts : undefined,
          replyCount: m.reply_count,
          isEdited: !!m.edited,
          subtype: m.subtype,
        };
      });

      // Reverse to chronological order (Slack returns newest first)
      msgs.reverse();

      if (!olderThanTs) {
        setMessages(msgs);
      }
      return msgs;
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch messages');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [resolveUsers]);

  // ─── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (channelId: string, text: string) => {
    setError(null);
    try {
      await slackApi('chat.postMessage', { channel: channelId, text });
      // Re-fetch messages to show the sent message
      await fetchMessages(channelId);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send message');
      throw e;
    }
  }, [fetchMessages]);

  // ─── Mark channel as read ─────────────────────────────────────────────────

  const markRead = useCallback(async (channelId: string, ts: string) => {
    try {
      await slackApi('conversations.mark', { channel: channelId, ts });
    } catch {
      // Non-fatal
    }
  }, []);

  return {
    ...state,
    channels,
    messages,
    isLoading,
    error,
    connect,
    disconnect,
    fetchChannels,
    fetchMessages,
    sendMessage,
    markRead,
    resolveUser,
    usersCache: usersCache.current,
  };
}
