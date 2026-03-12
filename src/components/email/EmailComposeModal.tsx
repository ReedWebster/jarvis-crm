import React, { useState, useRef } from 'react';
import { X, Send, Paperclip, XCircle } from 'lucide-react';
import { useGmail } from '../../hooks/useGmail';

interface Props {
  to?: string;
  toName?: string;
  replyToMessageId?: string;
  defaultSubject?: string;
  onSent: () => void;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailComposeModal({ to: toProp = '', toName, replyToMessageId, defaultSubject = '', onSent, onClose }: Props) {
  const { sendEmail, isLoading, isConnected, connect } = useGmail();
  const [to, setTo] = useState(toProp);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!to.trim()) { setError('Recipient is required.'); return; }
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required.'); return; }
    setError(null);
    try {
      await sendEmail(to.trim(), subject, body, replyToMessageId, attachments.length > 0 ? attachments : undefined);
      onSent();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send email');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachments(prev => [...prev, ...files]);
    // Reset input so same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl border w-full max-w-lg mx-4 flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {replyToMessageId ? 'Reply' : 'New Email'}
            </div>
            {toName && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                To: {toName} &lt;{toProp}&gt;
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
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

          {/* To field — editable if no pre-filled recipient */}
          <div>
            <label className="caesar-label">To</label>
            <input
              className="caesar-input w-full"
              placeholder="recipient@example.com"
              value={to}
              onChange={e => setTo(e.target.value)}
              disabled={!isConnected || !!toProp}
              type="email"
            />
          </div>

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
              rows={7}
              placeholder="Write your message…"
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={!isConnected}
              style={{ resize: 'vertical', minHeight: '120px' }}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="caesar-label">Attachments</label>
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}
                >
                  <Paperclip size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{file.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    style={{ color: 'var(--text-muted)' }}
                    className="hover:opacity-70 transition-opacity flex-shrink-0"
                  >
                    <XCircle size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

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
          className="flex items-center justify-between gap-2 px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Attach file */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={!isConnected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected}
              className="caesar-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
              title="Attach files"
            >
              <Paperclip size={13} />
              Attach
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="caesar-btn-ghost text-sm px-4 py-2">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isConnected || isLoading || !to.trim() || !subject.trim() || !body.trim()}
              className="caesar-btn-primary text-sm px-4 py-2 flex items-center gap-2"
            >
              <Send size={14} />
              {isLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
