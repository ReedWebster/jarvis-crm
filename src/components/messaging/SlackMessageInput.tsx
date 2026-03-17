import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, AtSign } from 'lucide-react';
import type { SlackUser } from '../../types/slack';

interface SlackMessageInputProps {
  channelName: string;
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  usersCache: Map<string, SlackUser>;
}

export function SlackMessageInput({ channelName, onSend, disabled, usersCache }: SlackMessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0); // cursor position of the '@'
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build sorted user list once (exclude bots)
  const allUsers = useMemo(() => {
    const users = Array.from(usersCache.values()).filter(u => !u.isBot);
    users.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return users;
  }, [usersCache]);

  // Filter users by mention query
  const mentionResults = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allUsers
      .filter(u => u.displayName.toLowerCase().includes(q) || u.realName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, allUsers]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [mentionResults.length]);

  // Close menu on outside click
  useEffect(() => {
    if (mentionQuery === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionQuery]);

  const insertMention = useCallback((user: SlackUser) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0)); // remove @query
    const newText = `${before}<@${user.id}> ${after}`;
    setText(newText);
    setMentionQuery(null);

    // Re-focus and set cursor after the inserted mention
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const pos = before.length + user.id.length + 4; // <@ID> + space
        ta.setSelectionRange(pos, pos);
      }
    });
  }, [text, mentionStart, mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const cursor = e.target.selectionStart ?? val.length;
    // Look backwards from cursor for an unmatched '@'
    const beforeCursor = val.slice(0, cursor);
    const atIdx = beforeCursor.lastIndexOf('@');

    if (atIdx >= 0) {
      // '@' must be at start or preceded by whitespace
      const charBefore = atIdx > 0 ? beforeCursor[atIdx - 1] : ' ';
      if (/\s/.test(charBefore)) {
        const query = beforeCursor.slice(atIdx + 1);
        // No spaces in mention query
        if (!/\s/.test(query)) {
          setMentionQuery(query);
          setMentionStart(atIdx);
          return;
        }
      }
    }
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention menu navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionResults[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
      setMentionQuery(null);
    } catch {
      // Error is handled by the hook
    } finally {
      setSending(false);
    }
  };

  const triggerMention = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    // Insert '@' if not already preceded by one
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insert = (needsSpace ? ' ' : '') + '@';
    const newText = before + insert + after;
    setText(newText);
    const newPos = cursor + insert.length;
    setMentionStart(newPos - 1);
    setMentionQuery('');
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <div
      className="px-4 py-3 border-t flex-shrink-0 relative"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Mention autocomplete dropdown */}
      {mentionQuery !== null && mentionResults.length > 0 && (
        <div
          ref={menuRef}
          className="absolute left-4 right-4 bottom-full mb-1 rounded-lg border overflow-hidden shadow-lg z-20"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          <div className="px-3 py-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            People
          </div>
          {mentionResults.map((user, i) => (
            <button
              key={user.id}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors"
              style={{
                backgroundColor: i === selectedIdx ? 'var(--bg-elevated)' : 'transparent',
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => insertMention(user)}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-6 h-6 rounded-md flex-shrink-0" />
              ) : (
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#6366f1' }}
                >
                  {user.displayName[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {user.displayName}
                </div>
                {user.realName !== user.displayName && (
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {user.realName}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-lg border px-3 py-2"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <button
          onClick={triggerMention}
          disabled={disabled || sending}
          className="p-1 rounded transition-colors flex-shrink-0 hover:bg-black/5"
          style={{ color: 'var(--text-muted)' }}
          title="Mention someone"
        >
          <AtSign size={16} />
        </button>
        <textarea
          ref={textareaRef}
          className="flex-1 bg-transparent border-0 outline-none resize-none text-sm"
          style={{ color: 'var(--text-primary)', minHeight: '20px', maxHeight: '120px' }}
          placeholder={`Message ${channelName}`}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || disabled}
          className="p-1.5 rounded-md transition-colors flex-shrink-0"
          style={{
            color: text.trim() ? '#6366f1' : 'var(--text-muted)',
            opacity: text.trim() ? 1 : 0.5,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
