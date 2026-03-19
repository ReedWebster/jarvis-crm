import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, BarChart2, Inbox, Settings, Plus, RefreshCw, CheckCircle2, XCircle, Clock, Hash, Linkedin, Twitter, Sparkles } from 'lucide-react';
import type { Contact, SocialAccount, SocialApprovalItem, SocialPlatform, SocialPost } from '../../types';
import { Modal } from '../shared/Modal';

type TabId = 'calendar' | 'analytics' | 'approvals' | 'accounts';

interface SocialHubProps {
  contacts: Contact[];
  socialAccounts: SocialAccount[];
  setSocialAccounts: (v: SocialAccount[] | ((p: SocialAccount[]) => SocialAccount[])) => void;
  socialPosts: SocialPost[];
  setSocialPosts: (v: SocialPost[] | ((p: SocialPost[]) => SocialPost[])) => void;
  approvals: SocialApprovalItem[];
  setApprovals: (v: SocialApprovalItem[] | ((p: SocialApprovalItem[]) => SocialApprovalItem[])) => void;
}

const PLATFORM_META: Record<SocialPlatform, { label: string; icon: React.ReactNode }> = {
  linkedin:  { label: 'LinkedIn',  icon: <Linkedin size={14} /> },
  twitter:   { label: 'Twitter/X', icon: <Twitter size={14} /> },
};

function formatDateLabel(iso: string | undefined): string {
  if (!iso) return 'Unscheduled';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Unscheduled';
  }
}

function formatTimeLabel(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function SocialHub({
  contacts,
  socialAccounts,
  setSocialAccounts,
  socialPosts,
  setSocialPosts,
  approvals,
  setApprovals,
}: SocialHubProps) {
  const [activeTab, setActiveTab] = useState<TabId>('calendar');
  const [composerOpen, setComposerOpen] = useState(false);
  const [baseContent, setBaseContent] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDrafts, setAiDrafts] = useState<{ platform: string; content: string }[]>([]);
  const [linkedinStatus, setLinkedinStatus] = useState<'unknown' | 'disconnected' | 'connected' | 'needs-reauth'>('unknown');
  const [linkedinProfile, setLinkedinProfile] = useState<{ name?: string; email?: string; picture?: string } | null>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);
  const [linkedinBanner, setLinkedinBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const li = params.get('linkedin');
    if (li === 'connected') return { type: 'success', msg: 'LinkedIn connected successfully!' };
    if (li === 'error') return { type: 'error', msg: params.get('msg') || 'LinkedIn connection failed.' };
    return null;
  });

  // X (Twitter)
  const [xStatus, setXStatus] = useState<'unknown' | 'disconnected' | 'connected' | 'needs-reauth'>('unknown');
  const [xProfile, setXProfile] = useState<{ name?: string; username?: string; picture?: string } | null>(null);
  const [xLoading, setXLoading] = useState(false);
  const [xError, setXError] = useState<string | null>(null);
  const [xBanner, setXBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const x = params.get('x');
    if (x === 'connected') return { type: 'success', msg: 'X connected successfully!' };
    if (x === 'error') return { type: 'error', msg: params.get('msg') || 'X connection failed.' };
    return null;
  });

  const groupedPosts = useMemo(() => {
    const groups: Record<string, SocialPost[]> = {};
    [...socialPosts].forEach(p => {
      const key = (p.scheduledAt ?? p.createdAt ?? '').slice(0, 10) || 'unscheduled';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [socialPosts]);

  const pendingApprovals = approvals.filter(a => a.status === 'pending');

  // Load LinkedIn connection status from server (workspace_data) on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLinkedinLoading(true);
      setLinkedinError(null);
      try {
        const res = await fetch('/api/social-status?provider=linkedin');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLinkedinError(json?.error || 'Failed to load LinkedIn status');
          setLinkedinStatus('unknown');
        } else {
          const st = json?.status as 'disconnected' | 'connected' | 'needs-reauth' | undefined;
          setLinkedinStatus(st ?? 'disconnected');
          if (json?.name || json?.picture) {
            setLinkedinProfile({ name: json.name, email: json.email, picture: json.picture });
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setLinkedinError(err?.message ?? 'Failed to load LinkedIn status');
        setLinkedinStatus('unknown');
      } finally {
        if (!cancelled) setLinkedinLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setXLoading(true);
      setXError(null);
      try {
        const res = await fetch('/api/social-status?provider=x');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setXError(json?.error || 'Failed to load X status');
          setXStatus('unknown');
        } else {
          setXStatus(json?.status ?? 'disconnected');
          if (json?.name || json?.username) {
            setXProfile({ name: json.name, username: json.username, picture: json.picture });
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setXError(err?.message ?? 'Failed to load X status');
        setXStatus('unknown');
      } finally {
        if (!cancelled) setXLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="section-title">Social Command Center</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Plan, approve, and review content for your personal brand.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setComposerOpen(true)}
            className="caesar-btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            New Post
          </button>
        </div>
      </div>

      {/* OAuth callback banners */}
      {[
        { banner: linkedinBanner, clear: () => setLinkedinBanner(null) },
        { banner: xBanner, clear: () => setXBanner(null) },
      ].map(({ banner, clear }, i) => banner && (
        <div
          key={i}
          className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
          style={{
            backgroundColor: banner.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: banner.type === 'success' ? '#22c55e' : '#ef4444',
            border: `1px solid ${banner.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          <span>{banner.msg}</span>
          <button type="button" onClick={() => {
            clear();
            window.history.replaceState({}, '', window.location.pathname);
          }} style={{ opacity: 0.7 }}>✕</button>
        </div>
      ))}

      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl border"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
      >
        {[
          { id: 'calendar' as TabId, label: 'Content Calendar', icon: <Calendar size={14} /> },
          { id: 'analytics' as TabId, label: 'Analytics', icon: <BarChart2 size={14} /> },
          { id: 'approvals' as TabId, label: 'Approvals', icon: <Inbox size={14} /> },
          { id: 'accounts' as TabId, label: 'Social Accounts', icon: <Settings size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {tab.icon}
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="section-subtitle">Schedule</p>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {socialPosts.length === 0 ? 'No posts yet' : `${socialPosts.length} posts`}
            </span>
          </div>
          {groupedPosts.length === 0 ? (
            <div className="caesar-card text-sm" style={{ color: 'var(--text-muted)' }}>
              No posts yet. Click <strong>New Post</strong> to draft your first update.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {groupedPosts.map(([date, posts]) => (
                <div key={date} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      {date === 'unscheduled' ? 'Unscheduled' : formatDateLabel(date)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                      {posts.length} post{posts.length > 1 ? 's' : ''}
                    </span>
                    <hr className="flex-1 caesar-divider" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {posts.map(post => (
                      <div key={post.id} className="caesar-card flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {post.platforms.map(p => (
                              <span key={p} className="tag" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {PLATFORM_META[p]?.icon}
                                <span className="ml-1 text-[10px] uppercase tracking-wide">
                                  {PLATFORM_META[p]?.label}
                                </span>
                              </span>
                            ))}
                          </div>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {post.status.replace('-', ' ')}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                          {post.baseContent}
                        </p>
                        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>
                              {formatDateLabel(post.scheduledAt ?? post.createdAt)} {formatTimeLabel(post.scheduledAt)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="caesar-btn-ghost px-2 py-1 text-[11px]"
                            onClick={() => setComposerOpen(true)}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="section-subtitle">Last 30 Days</p>
            <button
              type="button"
              className="caesar-btn-ghost flex items-center gap-1 text-xs"
              title="Refresh analytics"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(PLATFORM_META) as SocialPlatform[]).map(p => (
              <div key={p} className="caesar-card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {PLATFORM_META[p].icon}
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {PLATFORM_META[p].label}
                    </span>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    Connected
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Connect Ayrshare and add your API key on the server to see live analytics here.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="section-subtitle">Pending Approvals</p>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {pendingApprovals.length === 0 ? 'No items waiting' : `${pendingApprovals.length} pending`}
            </span>
          </div>
          {pendingApprovals.length === 0 ? (
            <div className="caesar-card text-sm" style={{ color: 'var(--text-muted)' }}>
              Nothing in the queue. AI suggestions and drafts that need a review will show up here.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingApprovals.map(item => (
                <div key={item.id} className="caesar-card flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>
                        {item.title}
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                        style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                      >
                        {item.type}
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {item.preview}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {item.suggestedPlatform && (
                        <>
                          <Hash size={11} />
                          <span>{PLATFORM_META[item.suggestedPlatform]?.label}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="caesar-btn-ghost px-3 py-1 text-xs flex items-center gap-1"
                        onClick={() => {
                          setApprovals(prev => prev.map(a => a.id === item.id ? { ...a, status: 'approved' } : a));
                        }}
                      >
                        <CheckCircle2 size={12} />
                        Approve
                      </button>
                      <button
                        type="button"
                        className="caesar-btn-ghost px-3 py-1 text-xs flex items-center gap-1"
                        onClick={() => {
                          setApprovals(prev => prev.map(a => a.id === item.id ? { ...a, status: 'dismissed', dismissalReason: 'other' } : a));
                        }}
                      >
                        <XCircle size={12} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="section-subtitle">Social Accounts</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Connection settings are stored in your workspace; secrets stay on the server.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(PLATFORM_META) as SocialPlatform[]).map(platform => {
              const existing = socialAccounts.find(a => a.platform === platform);
              const statusFromState = existing?.status ?? 'disconnected';

              const liveStatus =
                platform === 'linkedin' ? linkedinStatus :
                platform === 'twitter' ? xStatus :
                'unknown';

              const status = liveStatus === 'unknown' ? statusFromState : (liveStatus as SocialAccount['status']);
              const isLoading =
                platform === 'linkedin' ? linkedinLoading :
                platform === 'twitter' ? xLoading :
                false;
              const platformError =
                platform === 'linkedin' ? linkedinError :
                platform === 'twitter' ? xError :
                null;

              const profileName =
                platform === 'linkedin' ? linkedinProfile?.name :
                platform === 'twitter'
                  ? (xProfile?.username ? `@${xProfile.username}` : xProfile?.name)
                  : existing?.accountName;

              const oauthStartPath =
                platform === 'linkedin' ? '/api/oauth-start?provider=linkedin' :
                platform === 'twitter' ? '/api/oauth-start?provider=x' :
                undefined;

              const label = PLATFORM_META[platform].label;
              const color =
                status === 'connected' ? '#22c55e' :
                status === 'needs-reauth' ? '#f59e0b' :
                'var(--text-muted)';
              const statusText =
                status === 'connected' ? 'Connected' :
                status === 'needs-reauth' ? 'Needs Reauth' :
                'Disconnected';

              const connectLabel = isLoading
                ? 'Checking…'
                : status === 'connected' ? `Reconnect ${label}` : `Connect ${label}`;

              return (
                <div key={platform} className="caesar-card flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        {PLATFORM_META[platform].icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {label}
                        </p>
                        {profileName ? (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {profileName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ backgroundColor: 'var(--bg-elevated)', color }}
                    >
                      {statusText}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="caesar-btn-ghost flex items-center justify-center gap-1 text-xs"
                    disabled={isLoading || !oauthStartPath}
                    onClick={oauthStartPath ? () => { window.location.href = oauthStartPath; } : undefined}
                  >
                    {connectLabel}
                  </button>
                  {platformError && (
                    <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>
                      {platformError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Composer modal shell (content implemented incrementally) */}
      <Modal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New Social Post"
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Start with a base idea, then refine per platform. Use AI assist to generate sharp, on-brand drafts.
          </p>
          <button
            type="button"
            className="caesar-btn-ghost flex items-center gap-2 text-sm"
            disabled={aiLoading}
            onClick={async () => {
              setAiLoading(true);
              setAiError(null);
              setAiDrafts([]);
              try {
                const res = await fetch('/api/social-ai-drafts', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ topic: baseContent || 'Social post about entrepreneurship, AI, and systems.' }),
                });
                const json = await res.json();
                if (!res.ok) {
                  setAiError(json?.error || 'Failed to generate drafts');
                } else {
                  setAiDrafts(Array.isArray(json?.drafts) ? json.drafts : []);
                }
              } catch (err: any) {
                setAiError(err?.message ?? 'Failed to generate drafts');
              } finally {
                setAiLoading(false);
              }
            }}
          >
            <Sparkles size={14} />
            {aiLoading ? 'Generating…' : 'Generate AI Draft'}
          </button>
          {aiError && (
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {aiError}
            </p>
          )}
          {aiDrafts.length > 0 && (
            <div className="caesar-card flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                AI Suggestions
              </p>
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                {aiDrafts.map((d, idx) => (
                  <div key={idx} className="rounded-lg p-2" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {d.platform || 'Draft'}
                      </span>
                      <button
                        type="button"
                        className="caesar-btn-ghost px-2 py-0.5 text-[11px]"
                        onClick={() => setBaseContent(d.content)}
                      >
                        Use
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {d.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <textarea
            className="caesar-textarea mt-1"
            rows={5}
            placeholder="Base content for this post..."
            value={baseContent}
            onChange={e => setBaseContent(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              type="button"
              className="caesar-btn-ghost text-sm"
              onClick={() => setComposerOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="caesar-btn-primary text-sm"
              disabled={!baseContent.trim()}
              onClick={() => {
                const linkedinDraft = aiDrafts.find(d => d.platform === 'linkedin')?.content;
                const twitterDraft = aiDrafts.find(d => d.platform === 'twitter')?.content;
                const platforms: SocialPlatform[] = [];
                if (linkedinDraft) platforms.push('linkedin');
                if (twitterDraft) platforms.push('twitter');
                if (platforms.length === 0) platforms.push('linkedin', 'twitter');

                setSocialPosts(prev => [...prev, {
                  id: crypto.randomUUID(),
                  creatorUserId: 'reed',
                  platforms,
                  baseContent: baseContent.trim(),
                  linkedinContent: linkedinDraft,
                  twitterContent: twitterDraft,
                  status: 'draft',
                  approvalState: 'draft',
                  createdAt: new Date().toISOString(),
                }]);
                setBaseContent('');
                setAiDrafts([]);
                setAiError(null);
                setComposerOpen(false);
              }}
            >
              Save Draft
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

