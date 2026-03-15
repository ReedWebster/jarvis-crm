import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Hash, Lock, User, Users, Search, X, RefreshCw, ArrowLeft, ChevronDown,
} from 'lucide-react';
import type { SlackChannel, SlackMessage } from '../../types/slack';
import { SlackMessageRow } from './SlackMessage';
import { SlackMessageInput } from './SlackMessageInput';

// ─── Channel icon ────────────────────────────────────────────────────────────

function ChannelIcon({ channel, size = 14 }: { channel: SlackChannel; size?: number }) {
  if (channel.type === 'im') return <User size={size} />;
  if (channel.type === 'mpim') return <Users size={size} />;
  if (channel.isPrivate) return <Lock size={size} />;
  return <Hash size={size} />;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SlackPanelProps {
  channels: SlackChannel[];
  messages: SlackMessage[];
  isLoading: boolean;
  error: string | null;
  onFetchChannels: () => Promise<void>;
  onFetchMessages: (channelId: string) => Promise<SlackMessage[]>;
  onSendMessage: (channelId: string, text: string) => Promise<void>;
  onMarkRead: (channelId: string, ts: string) => Promise<void>;
  usersCache: Map<string, { displayName: string }>;
}

export function SlackPanel({
  channels,
  messages,
  isLoading,
  error,
  onFetchChannels,
  onFetchMessages,
  onSendMessage,
  onMarkRead,
  usersCache,
}: SlackPanelProps) {
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filter, setFilter] = useState('');
  const [channelSection, setChannelSection] = useState<'all' | 'channels' | 'dms'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch channels on mount
  useEffect(() => {
    if (channels.length === 0) onFetchChannels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectChannel = useCallback(async (ch: SlackChannel) => {
    setSelectedChannel(ch);
    setShowDetail(true);
    await onFetchMessages(ch.id);
    // Mark as read with the latest message timestamp
  }, [onFetchMessages]);

  // After messages load, mark as read
  useEffect(() => {
    if (selectedChannel && messages.length > 0) {
      const latestTs = messages[messages.length - 1].ts;
      onMarkRead(selectedChannel.id, latestTs);
    }
  }, [selectedChannel, messages, onMarkRead]);

  const handleBack = () => {
    setShowDetail(false);
    setSelectedChannel(null);
  };

  const handleSend = useCallback(async (text: string) => {
    if (!selectedChannel) return;
    await onSendMessage(selectedChannel.id, text);
  }, [selectedChannel, onSendMessage]);

  // Filter channels
  const filteredChannels = channels.filter(ch => {
    const matchesFilter = !filter || ch.name.toLowerCase().includes(filter.toLowerCase());
    const matchesSection =
      channelSection === 'all' ||
      (channelSection === 'channels' && (ch.type === 'channel' || ch.type === 'group')) ||
      (channelSection === 'dms' && (ch.type === 'im' || ch.type === 'mpim'));
    return matchesFilter && matchesSection;
  });

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-1 min-h-0"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* ── Left: Channel list ── */}
      <div
        className={`flex flex-col border-r flex-shrink-0 ${showDetail ? 'hidden md:flex' : 'flex'}`}
        style={{ width: '300px', borderColor: 'var(--border)' }}
      >
        {/* Section tabs */}
        <div
          className="flex items-center gap-0.5 px-3 py-2 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {(['all', 'channels', 'dms'] as const).map(section => (
            <button
              key={section}
              onClick={() => setChannelSection(section)}
              className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
              style={{
                color: channelSection === section ? '#6366f1' : 'var(--text-muted)',
                backgroundColor: channelSection === section ? 'rgba(99,102,241,0.1)' : 'transparent',
              }}
            >
              {section === 'all' ? 'All' : section === 'channels' ? 'Channels' : 'DMs'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              className="caesar-input w-full pl-8 pr-8 text-xs py-1.5"
              placeholder="Filter channels…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Channel rows */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && channels.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-8">
              <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading channels…</span>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8">
              <Hash size={24} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No channels found</span>
            </div>
          ) : (
            filteredChannels.map(ch => {
              const isSelected = selectedChannel?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => handleSelectChannel(ch)}
                  className="w-full text-left px-3 py-2.5 border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-elevated)' : 'transparent'; }}
                >
                  <div className="flex items-center gap-2">
                    {/* Channel icon or DM avatar */}
                    {ch.dmUserAvatar ? (
                      <img src={ch.dmUserAvatar} alt="" className="w-7 h-7 rounded-md flex-shrink-0" />
                    ) : (
                      <span className="flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        <ChannelIcon channel={ch} size={14} />
                      </span>
                    )}

                    <span
                      className="text-xs truncate flex-1"
                      style={{
                        color: 'var(--text-primary)',
                        fontWeight: (ch.unreadCount ?? 0) > 0 ? 700 : 400,
                      }}
                    >
                      {ch.name}
                    </span>

                    {/* Unread badge */}
                    {(ch.unreadCount ?? 0) > 0 && (
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: '#6366f1', color: '#fff', fontSize: '10px', minWidth: '18px', textAlign: 'center' }}
                      >
                        {ch.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Topic (for channels) */}
                  {ch.topic && (
                    <div className="text-xs truncate mt-0.5 ml-6" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      {ch.topic}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Message view ── */}
      <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${!showDetail ? 'hidden md:flex' : 'flex'}`}>
        {selectedChannel ? (
          <>
            {/* Channel header */}
            <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={handleBack}
                className="md:hidden flex items-center gap-1.5 text-xs mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }}>
                  <ChannelIcon channel={selectedChannel} size={16} />
                </span>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {selectedChannel.name}
                </h2>
                {selectedChannel.numMembers != null && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {selectedChannel.numMembers} members
                  </span>
                )}
              </div>
              {selectedChannel.topic && (
                <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                  {selectedChannel.topic}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-2">
              {isLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8">
                  <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading messages…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8">
                  <Hash size={24} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No messages yet</span>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const prevMsg = i > 0 ? messages[i - 1] : null;
                    const collapsed = prevMsg?.userId === msg.userId && !msg.subtype;
                    return (
                      <SlackMessageRow
                        key={msg.ts}
                        message={msg}
                        collapsed={collapsed}
                        usersCache={usersCache}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message input */}
            <SlackMessageInput
              channelName={selectedChannel.name}
              onSend={handleSend}
              disabled={isLoading}
            />
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
            <Hash size={40} style={{ opacity: 0.3 }} />
            <p className="text-sm">Select a channel to view messages</p>
          </div>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div
          className="absolute bottom-4 right-4 text-xs rounded-lg px-3 py-2 flex items-center gap-2 z-10"
          style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
