export interface SlackChannel {
  id: string;
  name: string;
  type: 'channel' | 'group' | 'im' | 'mpim';
  isPrivate: boolean;
  topic?: string;
  purpose?: string;
  numMembers?: number;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTs?: string;
  /** For DMs: resolved name of the other user */
  dmUserName?: string;
  dmUserAvatar?: string;
}

export interface SlackMessage {
  ts: string;
  userId: string;
  text: string;
  displayName?: string;
  avatar?: string;
  attachments?: SlackAttachment[];
  reactions?: SlackReaction[];
  threadTs?: string;
  replyCount?: number;
  isEdited?: boolean;
  subtype?: string;
}

export interface SlackUser {
  id: string;
  displayName: string;
  realName: string;
  avatar: string;
  isBot: boolean;
}

export interface SlackAttachment {
  title?: string;
  text?: string;
  imageUrl?: string;
  thumbUrl?: string;
}

export interface SlackReaction {
  name: string;
  count: number;
  users: string[];
}
