import React from 'react';
import type { SlackMessage as SlackMessageType } from '../../types/slack';

// ─── Basic Slack mrkdwn → JSX ───────────────────────────────────────────────

function renderMrkdwn(text: string, usersCache: Map<string, { displayName: string }>): React.ReactNode[] {
  if (!text) return [];

  // Replace user mentions <@U123> with display names
  let processed = text.replace(/<@([A-Z0-9]+)>/g, (_match, userId) => {
    const user = usersCache.get(userId);
    return `@${user?.displayName ?? userId}`;
  });

  // Replace channel mentions <#C123|name> with #name
  processed = processed.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

  // Replace URLs <url|label> or <url>
  processed = processed.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');
  processed = processed.replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)');

  // Split into segments and render
  const parts: React.ReactNode[] = [];
  const segments = processed.split(/(\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);

  segments.forEach((seg, i) => {
    if (!seg) return;

    // Bold
    if (/^\*[^*]+\*$/.test(seg)) {
      parts.push(<strong key={i}>{seg.slice(1, -1)}</strong>);
      return;
    }
    // Italic
    if (/^_[^_]+_$/.test(seg)) {
      parts.push(<em key={i}>{seg.slice(1, -1)}</em>);
      return;
    }
    // Inline code
    if (/^`[^`]+`$/.test(seg)) {
      parts.push(
        <code
          key={i}
          style={{
            backgroundColor: 'rgba(99,102,241,0.1)',
            padding: '1px 4px',
            borderRadius: '3px',
            fontSize: '0.85em',
          }}
        >
          {seg.slice(1, -1)}
        </code>,
      );
      return;
    }
    // Links
    const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      parts.push(
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#6366f1', textDecoration: 'underline' }}
        >
          {linkMatch[1]}
        </a>,
      );
      return;
    }

    parts.push(seg);
  });

  return parts;
}

// ─── Avatar color (consistent per user, matching email pattern) ─────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Timestamp formatting ───────────────────────────────────────────────────

function formatSlackTs(ts: string): string {
  try {
    const d = new Date(parseFloat(ts) * 1000);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface SlackMessageProps {
  message: SlackMessageType;
  /** If true, collapse the avatar + name (same user as previous message) */
  collapsed?: boolean;
  usersCache: Map<string, { displayName: string }>;
}

export function SlackMessageRow({ message, collapsed, usersCache }: SlackMessageProps) {
  const color = avatarColor(message.displayName ?? message.userId);
  const initial = (message.displayName ?? message.userId)[0]?.toUpperCase() ?? '?';

  return (
    <div
      className="group px-4 transition-colors"
      style={{ paddingTop: collapsed ? '2px' : '10px', paddingBottom: '2px' }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar or spacer */}
        {collapsed ? (
          <div className="w-8 flex-shrink-0" />
        ) : message.avatar ? (
          <img
            src={message.avatar}
            alt=""
            className="w-8 h-8 rounded-md flex-shrink-0 mt-0.5"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
            style={{ backgroundColor: color + '22', color }}
          >
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Name + timestamp (hidden when collapsed) */}
          {!collapsed && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                {message.displayName ?? message.userId}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {formatSlackTs(message.ts)}
                {message.isEdited && ' (edited)'}
              </span>
            </div>
          )}

          {/* Message text */}
          <div className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {renderMrkdwn(message.text, usersCache)}
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-1.5 space-y-1.5">
              {message.attachments.map((att, i) => (
                <div
                  key={i}
                  className="rounded-md border-l-2 pl-3 py-1.5"
                  style={{ borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.05)' }}
                >
                  {att.title && (
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {att.title}
                    </div>
                  )}
                  {att.text && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {att.text}
                    </div>
                  )}
                  {att.imageUrl && (
                    <img src={att.imageUrl} alt="" className="mt-1 rounded max-w-xs max-h-48 object-contain" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {message.reactions.map(r => (
                <span
                  key={r.name}
                  className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  :{r.name}: {r.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
