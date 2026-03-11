import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { useGmail } from '../../hooks/useGmail';

interface Props {
  to: string;
  toName: string;
  replyToMessageId?: string;
  defaultSubject?: string;
  onSent: () => void;
  onClose: () => void;
}

export function EmailComposeModal({ to, toName, replyToMessageId, defaultSubject = '', onSent, onClose }: Props) {
  const { sendEmail, isLoading, isConnected, connect } = useGmail();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connect();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect to Gmail');
    } finally {
      setConnecting(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setError(null);
    try {
      await sendEmail(to, subject, body, replyToMessageId);
      onSent();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send email');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl border w-full max-w-lg mx-4 flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {replyToMessageId ? 'Reply' : 'New Email'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              To: {toName} &lt;{to}&gt;
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {!isConnected && (
            <div
              className="rounded-lg p-3 text-sm flex items-center justify-between"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Connect Gmail to send emails</span>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="caesar-btn-primary text-xs px-3 py-1.5"
              >
                {connecting ? 'Connecting…' : 'Connect Gmail'}
              </button>
            </div>
          )}

          <div>
            <label className="caesar-label">Subject</label>
            <input
              className="caesar-input w-full"
              placeholder="Email subject…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              disabled={!isConnected}
            />
          </div>

          <div>
            <label className="caesar-label">Message</label>
            <textarea
              className="caesar-textarea w-full"
              rows={8}
              placeholder="Write your message…"
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={!isConnected}
              style={{ resize: 'vertical', minHeight: '140px' }}
            />
          </div>

          {error && (
            <div
              className="text-xs rounded-lg px-3 py-2"
              style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button onClick={onClose} className="caesar-btn-ghost text-sm px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!isConnected || isLoading || !subject.trim() || !body.trim()}
            className="caesar-btn-primary text-sm px-4 py-2 flex items-center gap-2"
          >
            <Send size={14} />
            {isLoading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
