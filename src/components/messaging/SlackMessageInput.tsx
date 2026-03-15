import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface SlackMessageInputProps {
  channelName: string;
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

export function SlackMessageInput({ channelName, onSend, disabled }: SlackMessageInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } catch {
      // Error is handled by the hook
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="px-4 py-3 border-t flex-shrink-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-end gap-2 rounded-lg border px-3 py-2"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
      >
        <textarea
          className="flex-1 bg-transparent border-0 outline-none resize-none text-sm"
          style={{ color: 'var(--text-primary)', minHeight: '20px', maxHeight: '120px' }}
          placeholder={`Message ${channelName}`}
          value={text}
          onChange={e => setText(e.target.value)}
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
