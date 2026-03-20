import React, { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, ChevronDown, ChevronUp, Reply, Mail, Paperclip, Download } from 'lucide-react';
import { useGmail, GmailMessage } from '../../hooks/useGmail';
import { EmailComposeModal } from './EmailComposeModal';

interface Props {
  email: string;
  contactName: string;
  onClose: () => void;
  onCompose: () => void;
}

function buildEmailHtml(htmlBody: string, inlineImages: Record<string, string>): string {
  const resolved = htmlBody.replace(/cid:([^\s"'>]+)/gi, (_match, cid) => {
    return inlineImages[cid] ?? `cid:${cid}`;
  });
  return `<!DOCTYPE html>
<html>
<head>
<base target="_blank">
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 0; font-family: inherit; font-size: 13px; line-height: 1.6; color: #374151; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #6366f1; }
  pre, code { white-space: pre-wrap; word-break: break-all; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0 0 0 4px; padding-left: 12px; color: #6b7280; }
</style>
</head>
<body>${resolved}</body>
</html>`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getSenderInitial(from: string): string {
  const match = from.match(/^([^<@\s]+)/);
  return (match?.[1]?.[0] ?? from[0] ?? '?').toUpperCase();
}

function getSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split('@')[0] ?? from;
}

export function EmailThread({ email, contactName, onClose, onCompose }: Props) {
  const { fetchThreads, isConnected, connect, isLoading, downloadAttachment } = useGmail();
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const msgs = await fetchThreads(email);
      // Sort newest first
      msgs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMessages(msgs);
      setHasFetched(true);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load emails');
    }
  }, [fetchThreads, email]);

  useEffect(() => {
    if (isConnected && !hasFetched) {
      load();
    }
  }, [isConnected, hasFetched, load]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connect();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDownload = async (msgId: string, attachmentId: string, filename: string, mimeType: string) => {
    setDownloadingId(attachmentId);
    try {
      await downloadAttachment(msgId, attachmentId, filename, mimeType);
    } catch (e) {
      // Surface a generic error – the main error banner will show
      setError((e as any)?.message ?? 'Failed to download attachment');
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="rounded-xl shadow-2xl border w-full max-w-lg mx-4 flex flex-col"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', maxHeight: '80vh' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Email History
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {contactName} &lt;{email}&gt;
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && (
                <button
                  onClick={load}
                  disabled={isLoading}
                  title="Refresh"
                  style={{ color: 'var(--text-muted)' }}
                  className="p-1.5 rounded hover:opacity-70 transition-opacity"
                >
                  <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                onClick={onCompose}
                className="caesar-btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Mail size={12} /> New Email
              </button>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {/* Not connected */}
            {!isConnected && (
              <div className="flex flex-col items-center justify-center gap-4 py-8">
                <Mail size={32} style={{ color: 'var(--text-muted)' }} />
                <div className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                  Connect Gmail to view email history
                </div>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="caesar-btn-primary px-4 py-2 text-sm"
                >
                  {connecting ? 'Connecting…' : 'Connect Gmail'}
                </button>
                {error && (
                  <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>
                )}
              </div>
            )}

            {/* Loading */}
            {isConnected && isLoading && !hasFetched && (
              <div className="flex items-center justify-center gap-2 py-8">
                <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading emails…</span>
              </div>
            )}

            {/* Error */}
            {isConnected && error && (
              <div
                className="text-xs rounded-lg px-3 py-2"
                style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)' }}
              >
                {error}
              </div>
            )}

            {/* Empty state */}
            {isConnected && hasFetched && messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Mail size={28} style={{ color: 'var(--text-muted)' }} />
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No emails found with {contactName}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => {
              const isExpanded = expandedId === msg.id;
              const initial = getSenderInitial(msg.from);
              const senderName = getSenderName(msg.from);

              return (
                <div
                  key={msg.id}
                  className="rounded-lg border transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                  }}
                >
                  {/* Message row */}
                  <button
                    className="w-full text-left p-3 flex items-start gap-3"
                    onClick={() => toggleExpand(msg.id)}
                  >
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                    >
                      {initial}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {senderName}
                        </span>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(msg.date)}
                        </span>
                      </div>
                      <div className="text-xs font-medium truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {msg.subject}
                      </div>
                      {!isExpanded && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                          {msg.snippet}
                        </div>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <div className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <div className="border-t pt-3 mb-3" style={{ borderColor: 'var(--border)' }}>
                        {msg.htmlBody ? (
                          <iframe
                            srcDoc={buildEmailHtml(msg.htmlBody, msg.inlineImages ?? {})}
                            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                            className="w-full border-0"
                            style={{ minHeight: '120px', display: 'block' }}
                            onLoad={e => {
                              const el = e.currentTarget;
                              const h = el.contentDocument?.body?.scrollHeight;
                              if (h) el.style.height = `${Math.min(h + 16, 400)}px`;
                            }}
                          />
                        ) : (
                          <div
                            className="text-xs whitespace-pre-wrap"
                            style={{
                              color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-mono, monospace)',
                              lineHeight: '1.6',
                              maxHeight: '200px',
                              overflowY: 'auto',
                            }}
                          >
                            {msg.body || msg.snippet || '(no content)'}
                          </div>
                        )}
                      </div>

                      {/* Attachments (if any) */}
                      {msg.attachments.length > 0 && (
                        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                          <div
                            className="text-[11px] mb-2 flex items-center gap-1.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Paperclip size={11} />
                            {msg.attachments.length} attachment{msg.attachments.length !== 1 ? 's' : ''}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.attachments.map(att => (
                              <button
                                key={att.attachmentId}
                                onClick={() => handleDownload(msg.id, att.attachmentId, att.filename, att.mimeType)}
                                disabled={downloadingId === att.attachmentId}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition-all hover:opacity-80"
                                style={{
                                  borderColor: 'var(--border)',
                                  backgroundColor: 'var(--bg-elevated)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {downloadingId === att.attachmentId ? (
                                  <RefreshCw size={10} className="animate-spin" />
                                ) : (
                                  <Download size={10} />
                                )}
                                <span className="max-w-[140px] truncate">{att.filename}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setReplyTo(msg)}
                        className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
                        style={{
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)',
                          backgroundColor: 'var(--bg-card)',
                        }}
                      >
                        <Reply size={12} /> Reply
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reply compose modal */}
      {replyTo && (
        <EmailComposeModal
          to={email}
          toName={contactName}
          replyToMessageId={replyTo.id}
          defaultSubject={replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`}
          onSent={() => { setReplyTo(null); load(); }}
          onClose={() => setReplyTo(null)}
        />
      )}
    </>
  );
}
