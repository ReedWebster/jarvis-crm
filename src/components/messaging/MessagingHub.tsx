import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, RefreshCw, PenSquare, Search, X, Download, Reply,
  ArrowLeft, Paperclip, AlertCircle, Trash2,
} from 'lucide-react';
import { useGmail, type GmailMessage } from '../../hooks/useGmail';
import { EmailComposeModal } from '../email/EmailComposeModal';
import type { Contact } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split('@')[0] ?? from;
}

function getSenderInitial(from: string): string {
  return getSenderName(from)[0]?.toUpperCase() ?? '?';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractEmailAddress(from: string): string {
  const match = from.match(/<(.+)>/);
  return match?.[1] ?? from;
}

// ─── Colour avatar seed (consistent colour per sender) ───────────────────────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Build sandboxed HTML for email iframe ────────────────────────────────────

function buildEmailHtml(htmlBody: string, inlineImages: Record<string, string>): string {
  // Replace cid: references with resolved data URLs
  let resolved = htmlBody.replace(/cid:([^\s"'>]+)/gi, (_match, cid) => {
    return inlineImages[cid] ?? inlineImages[cid.replace(/^<|>$/g, '')] ?? `cid:${cid}`;
  });
  return `<!DOCTYPE html>
<html>
<head>
<base target="_blank">
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 0; font-family: inherit; font-size: 14px; line-height: 1.6; color: #374151; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #6366f1; }
  pre, code { white-space: pre-wrap; word-break: break-all; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0 0 0 4px; padding-left: 12px; color: #6b7280; }
</style>
</head>
<body>${resolved}</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MessagingHubProps {
  contacts?: Contact[];
}

export function MessagingHub({ contacts = [] }: MessagingHubProps) {
  const { fetchInbox, isConnected, connect, isLoading, downloadAttachment, trashEmail } = useGmail();

  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selected, setSelected] = useState<GmailMessage | null>(null);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [trashingId, setTrashingId] = useState<string | null>(null);

  const load = useCallback(async (query?: string) => {
    setError(null);
    try {
      const msgs = await fetchInbox(50, query ?? '');
      msgs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMessages(msgs);
      setHasFetched(true);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load inbox');
    }
  }, [fetchInbox]);

  useEffect(() => {
    if (isConnected && !hasFetched) load();
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

  const handleSelectMessage = (msg: GmailMessage) => {
    setSelected(msg);
    setShowDetail(true);
  };

  const handleBack = () => {
    setShowDetail(false);
    setSelected(null);
  };

  const handleDownload = async (msgId: string, attachmentId: string, filename: string, mimeType: string) => {
    setDownloadingId(attachmentId);
    try {
      await downloadAttachment(msgId, attachmentId, filename, mimeType);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to download attachment');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleTrash = async (msgId: string) => {
    setTrashingId(msgId);
    setError(null);
    try {
      await trashEmail(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      if (selected?.id === msgId) {
        setSelected(null);
        setShowDetail(false);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete email');
    } finally {
      setTrashingId(null);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    setActiveSearch(q);
    load(q || undefined);
  };

  const handleClearSearch = () => {
    setSearch('');
    setActiveSearch('');
    load();
  };

  // ─── Not connected ─────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <Mail size={28} style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="text-center">
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Connect Gmail</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect your Gmail account to view your inbox and send emails.
          </p>
        </div>
        {error && <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>}
        <button onClick={handleConnect} disabled={connecting} className="caesar-btn-primary px-6 py-2.5">
          {connecting ? 'Connecting…' : 'Connect Gmail'}
        </button>
      </div>
    );
  }

  // ─── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100dvh - 100px)', minHeight: '520px' }}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {activeSearch ? `Search: "${activeSearch}"` : 'Inbox'}
          </h1>
          {isLoading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            disabled={isLoading}
            className="caesar-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => { setReplyTo(null); setComposeOpen(true); }}
            className="caesar-btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
          >
            <PenSquare size={13} />
            Compose
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="text-xs rounded-lg px-3 py-2 flex items-center gap-2 flex-shrink-0"
          style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)' }}
        >
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Two-panel email client */}
      <div
        className="rounded-xl border overflow-hidden flex flex-1 min-h-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
      >

        {/* ── Left: Message list ── */}
        <div
          className={`flex flex-col border-r flex-shrink-0 ${showDetail ? 'hidden md:flex' : 'flex'}`}
          style={{ width: '300px', borderColor: 'var(--border)' }}
        >
          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                className="caesar-input w-full pl-8 pr-8 text-xs py-1.5"
                placeholder="Search inbox…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {(search || activeSearch) && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </form>

          {/* Message rows */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && !hasFetched ? (
              <div className="flex items-center justify-center gap-2 p-8">
                <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-8">
                <Mail size={24} style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No messages found</span>
              </div>
            ) : (
              messages.map(msg => {
                const isSelected = selected?.id === msg.id;
                const senderName = getSenderName(msg.from);
                const color = avatarColor(senderName);
                return (
                  <div
                    key={msg.id}
                    className="group relative border-b transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-elevated)' : 'transparent'; }}
                  >
                    {/* Clickable select area */}
                    <button
                      onClick={() => handleSelectMessage(msg)}
                      className="w-full text-left px-3 py-3 pr-8"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div
                          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                          style={{ backgroundColor: color + '22', color }}
                        >
                          {getSenderInitial(msg.from)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-1 mb-0.5">
                            <span
                              className={`text-xs truncate ${!msg.isRead ? 'font-bold' : 'font-medium'}`}
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {senderName}
                            </span>
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                              {formatDate(msg.date)}
                            </span>
                          </div>
                          <div
                            className="text-xs truncate mb-0.5"
                            style={{ color: !msg.isRead ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: !msg.isRead ? 500 : 400 }}
                          >
                            {msg.subject}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                              {msg.snippet}
                            </span>
                            {msg.attachments.length > 0 && (
                              <Paperclip size={10} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                            )}
                            {!msg.isRead && (
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#6366f1' }} />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Trash button — visible on row hover */}
                    <button
                      onClick={() => handleTrash(msg.id)}
                      disabled={trashingId === msg.id}
                      title="Move to trash"
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:opacity-70"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {trashingId === msg.id
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Trash2 size={12} />
                      }
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Message detail ── */}
        <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${!showDetail ? 'hidden md:flex' : 'flex'}`}>
          {selected ? (
            <>
              {/* Detail header */}
              <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                {/* Mobile back */}
                <button
                  onClick={handleBack}
                  className="md:hidden flex items-center gap-1.5 text-xs mb-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ArrowLeft size={14} /> Back
                </button>

                <div className="flex items-start justify-between gap-3">
                  <h2
                    className="font-semibold text-sm leading-snug flex-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {selected.subject}
                  </h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setReplyTo(selected)}
                      className="caesar-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5"
                    >
                      <Reply size={12} />
                      Reply
                    </button>
                    <button
                      onClick={() => handleTrash(selected.id)}
                      disabled={trashingId === selected.id}
                      title="Move to trash"
                      className="caesar-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5"
                      style={{ color: '#f87171' }}
                    >
                      {trashingId === selected.id
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Trash2 size={12} />
                      }
                      Delete
                    </button>
                  </div>
                </div>

                {/* Sender / recipient meta */}
                <div className="flex items-center gap-2.5 mt-3">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: avatarColor(getSenderName(selected.from)) + '22',
                      color: avatarColor(getSenderName(selected.from)),
                    }}
                  >
                    {getSenderInitial(selected.from)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {getSenderName(selected.from)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {selected.from}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      To: {selected.to}
                    </div>
                  </div>
                  <div className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(selected.date)}
                  </div>
                </div>
              </div>

              {/* Email body + attachments */}
              <div className="flex-1 overflow-y-auto p-5">
                {selected.htmlBody ? (
                  <iframe
                    srcDoc={buildEmailHtml(selected.htmlBody, selected.inlineImages ?? {})}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ minHeight: '300px', display: 'block' }}
                    onLoad={e => {
                      const el = e.currentTarget;
                      const h = el.contentDocument?.body?.scrollHeight;
                      if (h) el.style.height = `${h + 24}px`;
                    }}
                  />
                ) : (
                  <div
                    className="text-sm whitespace-pre-wrap"
                    style={{
                      color: 'var(--text-secondary)',
                      lineHeight: '1.75',
                      fontFamily: 'inherit',
                    }}
                  >
                    {selected.body || selected.snippet || '(no content)'}
                  </div>
                )}

                {/* Attachments */}
                {selected.attachments.length > 0 && (
                  <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div
                      className="text-xs font-medium mb-3 flex items-center gap-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Paperclip size={12} />
                      {selected.attachments.length} attachment{selected.attachments.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.attachments.map(att => (
                        <button
                          key={att.attachmentId}
                          onClick={() => handleDownload(selected.id, att.attachmentId, att.filename, att.mimeType)}
                          disabled={downloadingId === att.attachmentId}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all hover:opacity-80"
                          style={{
                            borderColor: 'var(--border)',
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {downloadingId === att.attachmentId
                            ? <RefreshCw size={11} className="animate-spin" />
                            : <Download size={11} />
                          }
                          <span className="max-w-[160px] truncate">{att.filename}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.size)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div
              className="flex-1 flex flex-col items-center justify-center gap-3"
              style={{ color: 'var(--text-muted)' }}
            >
              <Mail size={40} style={{ opacity: 0.3 }} />
              <p className="text-sm">Select a message to read</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose / Reply modal */}
      {(composeOpen || replyTo) && (
        <EmailComposeModal
          to={replyTo ? extractEmailAddress(replyTo.from) : ''}
          toName={replyTo ? getSenderName(replyTo.from) : undefined}
          replyToMessageId={replyTo?.id}
          defaultSubject={
            replyTo
              ? replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`
              : ''
          }
          contacts={contacts}
          onSent={() => { setComposeOpen(false); setReplyTo(null); load(); }}
          onClose={() => { setComposeOpen(false); setReplyTo(null); }}
        />
      )}
    </div>
  );
}
