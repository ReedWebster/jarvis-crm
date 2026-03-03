/**
 * TeamView — stripped-down Clients + Team Calendar layout for co-founders.
 * Accessed via: https://litehouse.vercel.app?view=team
 *
 * Co-founders log in with their own Supabase accounts (invite them via
 * Supabase dashboard → Authentication → Invite user). Once signed in,
 * they see and edit the same shared client data and team calendar as
 * the workspace owner.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Building2, LogOut, Moon, Sun, Eye, EyeOff, Pencil, Check, X, ChevronDown, ExternalLink } from 'lucide-react';
import { RecruitmentTracker } from '../recruitment/RecruitmentTracker';
import { DocHub } from '../dochub/DocHub';
import type { Client, DocFolder, DocFile } from '../../types';
import { ThemeContext, buildThemeValue, useThemeState } from '../../hooks/useTheme';
import { ToastProvider } from '../shared/Toast';
import { useWorkspaceStorage } from '../../hooks/useWorkspaceStorage';
import { TeamCalendarView } from './TeamCalendarView';

// ─── Team login form ──────────────────────────────────────────────────────────

function TeamLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 space-y-6"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <Building2 size={22} style={{ color: '#10b981' }} />
            </div>
          </div>
          <h1
            className="text-lg font-bold tracking-widest"
            style={{ color: 'var(--text-primary)', fontFamily: "'Times New Roman', serif", letterSpacing: '0.15em' }}
          >
            VANTA
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Team Client Access · Sign in to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="caesar-label">Email</label>
            <input
              type="email"
              className="caesar-input w-full mt-1"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="caesar-label">Password</label>
            <div className="relative mt-1">
              <input
                type={showPw ? 'text' : 'password'}
                className="caesar-input w-full pr-10"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-center" style={{ color: '#ef4444' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="caesar-btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Founder roster ───────────────────────────────────────────────────────────

export interface FounderEntry {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  focus: string;
}

// ─── Team tab shared types ────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  text: string;
  assigneeId: string | null;
  done: boolean;
  createdAt: string;
}

interface TeamMetric {
  id: string;
  label: string;
  value: string;
  unit: string; // prefix like "$"
}

interface TeamLink {
  id: string;
  label: string;
  url: string;
  emoji: string;
}

interface MeetingNote {
  id: string;
  date: string; // yyyy-MM-dd
  title: string;
  content: string;
}

const DEFAULT_METRICS: TeamMetric[] = [
  { id: 'mrr',      label: 'MRR',           value: '', unit: '$' },
  { id: 'clients',  label: 'Active Clients', value: '', unit: ''  },
  { id: 'pipeline', label: 'Pipeline',       value: '', unit: '$' },
  { id: 'expenses', label: 'Expenses MTD',   value: '', unit: '$' },
];

const teamUid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

// ─── Founder defaults ─────────────────────────────────────────────────────────

const DEFAULT_FOUNDERS: FounderEntry[] = [
  { id: 'rw', name: 'Reed Webster', initials: 'RW', color: '#10b981', role: 'Co-Founder & CEO', focus: '' },
  { id: 'lw', name: 'Luke Wills',   initials: 'LW', color: '#6366f1', role: 'Co-Founder & COO', focus: '' },
  { id: 'ss', name: 'Sam Suh',      initials: 'SS', color: '#f59e0b', role: 'Co-Founder & CTO', focus: '' },
];

interface FounderRosterProps {
  founders: FounderEntry[];
  setFounders: (v: FounderEntry[] | ((p: FounderEntry[]) => FounderEntry[])) => void;
}

function FounderRoster({ founders, setFounders }: FounderRosterProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: string; focus: string }>({ role: '', focus: '' });

  function startEdit(f: FounderEntry) {
    setEditingId(f.id);
    setDraft({ role: f.role, focus: f.focus });
  }

  function saveEdit(id: string) {
    setFounders(prev => prev.map(f => f.id === id ? { ...f, ...draft } : f));
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-4"
        style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}
      >
        Founding Team
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {founders.map(f => {
          const isEditing = editingId === f.id;
          return (
            <div
              key={f.id}
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${isEditing ? f.color + '66' : 'var(--border)'}` }}
            >
              {/* Avatar + edit button */}
              <div className="flex items-start justify-between">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: `${f.color}22`, color: f.color, letterSpacing: '0.04em' }}
                >
                  {f.initials}
                </div>
                {isEditing ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveEdit(f.id)}
                      className="p-1.5 rounded-lg"
                      style={{ color: '#10b981', backgroundColor: '#10b98122' }}
                      title="Save"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1.5 rounded-lg"
                      style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(f)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-elevated)]"
                    style={{ color: 'var(--text-muted)' }}
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>

              {/* Name */}
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {f.name}
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    className="caesar-input w-full text-xs"
                    placeholder="Title / role"
                    value={draft.role}
                    onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
                    autoFocus
                  />
                  <textarea
                    className="caesar-input w-full text-xs resize-none"
                    placeholder="Current focus / responsibilities…"
                    rows={3}
                    value={draft.focus}
                    onChange={e => setDraft(d => ({ ...d, focus: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 cursor-pointer group" onClick={() => startEdit(f)}>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {f.role || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Add role…</span>}
                  </div>
                  {f.focus && (
                    <div
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}
                    >
                      {f.focus}
                    </div>
                  )}
                  {!f.focus && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.4, fontStyle: 'italic' }}>
                      Click to add focus / responsibilities…
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Action Items ─────────────────────────────────────────────────────────────

function ActionItems({ items, setItems, founders }: {
  items: ActionItem[];
  setItems: (v: ActionItem[] | ((p: ActionItem[]) => ActionItem[])) => void;
  founders: FounderEntry[];
}) {
  const [draft, setDraft] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  function add() {
    const t = draft.trim();
    if (!t) return;
    setItems(prev => [{ id: teamUid(), text: t, assigneeId, done: false, createdAt: new Date().toISOString() }, ...prev]);
    setDraft('');
    setAssigneeId(null);
  }

  function toggle(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  }

  function remove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  const open = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
        Action Items
      </h3>

      {/* Add form */}
      <div className="flex gap-2 flex-wrap">
        <input
          className="caesar-input flex-1 text-sm min-w-[160px]"
          placeholder="Add action item…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <div className="flex gap-1">
          {founders.map(f => (
            <button
              key={f.id}
              onClick={() => setAssigneeId(assigneeId === f.id ? null : f.id)}
              className="w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center"
              style={{
                backgroundColor: assigneeId === f.id ? `${f.color}44` : 'var(--bg-elevated)',
                color: assigneeId === f.id ? f.color : 'var(--text-muted)',
                border: `1px solid ${assigneeId === f.id ? f.color : 'var(--border)'}`,
              }}
              title={f.name}
            >
              {f.initials}
            </button>
          ))}
        </div>
        <button onClick={add} className="caesar-btn-primary px-3 text-xs">Add</button>
      </div>

      {open.length === 0 && done.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5, fontStyle: 'italic' }}>No action items yet.</p>
      )}

      {/* Open items */}
      <div className="space-y-2">
        {open.map(item => {
          const assignee = founders.find(f => f.id === item.assigneeId);
          return (
            <div key={item.id} className="flex items-start gap-2.5 group">
              <button onClick={() => toggle(item.id)} className="mt-0.5 flex-shrink-0">
                <div className="w-4 h-4 rounded border" style={{ borderColor: 'var(--border)' }} />
              </button>
              <span className="flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{item.text}</span>
              {assignee && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `${assignee.color}22`, color: assignee.color }}>
                  {assignee.initials}
                </span>
              )}
              <button onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Completed */}
      {done.length > 0 && (
        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{done.length} completed</p>
          {done.map(item => {
            const assignee = founders.find(f => f.id === item.assigneeId);
            return (
              <div key={item.id} className="flex items-start gap-2.5 group opacity-40">
                <button onClick={() => toggle(item.id)} className="mt-0.5 flex-shrink-0">
                  <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: '#10b981', border: '1px solid #10b981' }}>
                    <Check size={10} style={{ color: 'white' }} />
                  </div>
                </button>
                <span className="flex-1 text-sm line-through" style={{ color: 'var(--text-muted)' }}>{item.text}</span>
                {assignee && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${assignee.color}22`, color: assignee.color }}>
                    {assignee.initials}
                  </span>
                )}
                <button onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Key Metrics ──────────────────────────────────────────────────────────────

function KeyMetrics({ metrics, setMetrics }: {
  metrics: TeamMetric[];
  setMetrics: (v: TeamMetric[] | ((p: TeamMetric[]) => TeamMetric[])) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState({ label: '', value: '', unit: '' });

  function startEdit(m: TeamMetric) {
    setEditingId(m.id);
    setDraftValue(m.value);
  }

  function saveValue(id: string) {
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, value: draftValue } : m));
    setEditingId(null);
  }

  function removeMetric(id: string) {
    setMetrics(prev => prev.filter(m => m.id !== id));
  }

  function addMetric() {
    if (!newDraft.label.trim()) return;
    setMetrics(prev => [...prev, { id: teamUid(), ...newDraft }]);
    setNewDraft({ label: '', value: '', unit: '' });
    setAddingNew(false);
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
          Key Metrics
        </h3>
        <button onClick={() => setAddingNew(v => !v)} className="text-xs px-2 py-1 rounded-lg"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}>
          + Add
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <div key={m.id} className="rounded-lg p-3 flex flex-col gap-1.5 group"
            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.label}</span>
              <button onClick={() => removeMetric(m.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                <X size={11} />
              </button>
            </div>
            {editingId === m.id ? (
              <input
                className="caesar-input w-full font-bold"
                style={{ fontSize: '1.25rem', padding: '2px 4px' }}
                value={draftValue}
                onChange={e => setDraftValue(e.target.value)}
                onBlur={() => saveValue(m.id)}
                onKeyDown={e => { if (e.key === 'Enter') saveValue(m.id); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
              />
            ) : (
              <button onClick={() => startEdit(m)} className="text-left" style={{ color: 'var(--text-primary)' }}>
                <span className="text-xl font-bold">
                  {m.unit && <span className="text-sm mr-0.5" style={{ color: 'var(--text-muted)' }}>{m.unit}</span>}
                  {m.value || <span style={{ opacity: 0.35 }}>—</span>}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {addingNew && (
        <div className="flex gap-2 flex-wrap border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <input className="caesar-input text-xs flex-1 min-w-[120px]" placeholder="Label (e.g. MRR)" value={newDraft.label}
            onChange={e => setNewDraft(d => ({ ...d, label: e.target.value }))} autoFocus />
          <input className="caesar-input text-xs w-16" placeholder="Unit ($)" value={newDraft.unit}
            onChange={e => setNewDraft(d => ({ ...d, unit: e.target.value }))} />
          <input className="caesar-input text-xs w-24" placeholder="Value" value={newDraft.value}
            onChange={e => setNewDraft(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addMetric()} />
          <button onClick={addMetric} className="caesar-btn-primary px-3 text-xs">Add</button>
          <button onClick={() => setAddingNew(false)} className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Team Links ───────────────────────────────────────────────────────────────

function TeamLinks({ links, setLinks }: {
  links: TeamLink[];
  setLinks: (v: TeamLink[] | ((p: TeamLink[]) => TeamLink[])) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', url: '', emoji: '🔗' });

  function add() {
    if (!draft.label.trim() || !draft.url.trim()) return;
    const url = draft.url.startsWith('http') ? draft.url : `https://${draft.url}`;
    setLinks(prev => [...prev, { id: teamUid(), label: draft.label, url, emoji: draft.emoji || '🔗' }]);
    setDraft({ label: '', url: '', emoji: '🔗' });
    setAdding(false);
  }

  function remove(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id));
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
          Team Links
        </h3>
        <button onClick={() => setAdding(v => !v)} className="text-xs px-2 py-1 rounded-lg"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}>
          + Add
        </button>
      </div>

      {links.length === 0 && !adding && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5, fontStyle: 'italic' }}>
          No links yet. Add shared tools, dashboards, bank accounts…
        </p>
      )}

      {links.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {links.map(l => (
            <div key={l.id} className="group relative">
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--bg-elevated)]"
                style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <span>{l.emoji}</span>
                <span className="flex-1 truncate">{l.label}</span>
                <ExternalLink size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </a>
              <button onClick={() => remove(l.id)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex gap-2 flex-wrap border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <input className="caesar-input text-xs w-12 text-center" placeholder="🔗" value={draft.emoji}
            onChange={e => setDraft(d => ({ ...d, emoji: e.target.value }))} maxLength={2} />
          <input className="caesar-input text-xs flex-1 min-w-[120px]" placeholder="Label (e.g. Notion)"
            value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} autoFocus />
          <input className="caesar-input text-xs flex-1 min-w-[160px]" placeholder="https://…"
            value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <button onClick={add} className="caesar-btn-primary px-3 text-xs">Add</button>
          <button onClick={() => setAdding(false)} className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

function MeetingNotes({ notes, setNotes }: {
  notes: MeetingNote[];
  setNotes: (v: MeetingNote[] | ((p: MeetingNote[]) => MeetingNote[])) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: todayISO(), title: '', content: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', content: '' });

  function add() {
    if (!draft.title.trim()) return;
    const note = { id: teamUid(), ...draft };
    setNotes(prev => [note, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    setDraft({ date: todayISO(), title: '', content: '' });
    setAdding(false);
    setExpandedId(note.id);
  }

  function startEdit(n: MeetingNote) {
    setEditingId(n.id);
    setEditDraft({ title: n.title, content: n.content });
    setExpandedId(n.id);
  }

  function saveEdit(id: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...editDraft } : n));
    setEditingId(null);
  }

  function remove(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
          Meeting Notes
        </h3>
        <button onClick={() => { setAdding(v => !v); setDraft({ date: todayISO(), title: '', content: '' }); }}
          className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}>
          + New
        </button>
      </div>

      {adding && (
        <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div className="flex gap-2 flex-wrap">
            <input type="date" className="caesar-input text-xs w-36" value={draft.date}
              onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
            <input className="caesar-input text-xs flex-1 min-w-[160px]" placeholder="Meeting title…"
              value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} autoFocus />
          </div>
          <textarea className="caesar-input w-full text-xs resize-none" placeholder="Notes, decisions, next steps…"
            rows={5} value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>Cancel</button>
            <button onClick={add} className="caesar-btn-primary text-xs px-4">Save</button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !adding && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5, fontStyle: 'italic' }}>No meeting notes yet.</p>
      )}

      <div className="space-y-2">
        {sorted.map(n => {
          const isExpanded = expandedId === n.id;
          const isEditing = editingId === n.id;
          return (
            <div key={n.id} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-elevated)] group"
                onClick={() => !isEditing && setExpandedId(isExpanded ? null : n.id)}
              >
                <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{n.date}</span>
                <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => startEdit(n)} className="p-1 rounded hover:bg-[var(--bg-card)]" style={{ color: 'var(--text-muted)' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => remove(n.id)} className="p-1 rounded hover:bg-[var(--bg-card)]" style={{ color: 'var(--text-muted)' }}>
                    <X size={12} />
                  </button>
                </div>
                <ChevronDown size={14} style={{
                  color: 'var(--text-muted)', flexShrink: 0,
                  transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                }} />
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <input className="caesar-input w-full text-sm" value={editDraft.title}
                        onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))} placeholder="Title" />
                      <textarea className="caesar-input w-full text-xs resize-none" rows={6} value={editDraft.content}
                        onChange={e => setEditDraft(d => ({ ...d, content: e.target.value }))} autoFocus />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingId(null)} className="text-xs px-3" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                        <button onClick={() => saveEdit(n.id)} className="caesar-btn-primary text-xs px-3 py-1">Save</button>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {n.content || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No notes recorded.</span>}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inner content (after auth) ───────────────────────────────────────────────

type TeamTab = 'clients' | 'calendar' | 'team' | 'docs';

function TeamContent({ session }: { session: Session }) {
  const [clients, setClients] = useWorkspaceStorage<Client[]>('clients', []);
  const [founders, setFounders] = useWorkspaceStorage<FounderEntry[]>('teamFounders', DEFAULT_FOUNDERS);
  const [actionItems, setActionItems] = useWorkspaceStorage<ActionItem[]>('teamActionItems', []);
  const [metrics, setMetrics] = useWorkspaceStorage<TeamMetric[]>('teamMetrics', DEFAULT_METRICS);
  const [links, setLinks] = useWorkspaceStorage<TeamLink[]>('teamLinks', []);
  const [meetingNotes, setMeetingNotes] = useWorkspaceStorage<MeetingNote[]>('teamMeetingNotes', []);
  const [docFolders, setDocFolders] = useWorkspaceStorage<DocFolder[]>('teamDocs:folders', []);
  const [docFiles, setDocFiles] = useWorkspaceStorage<DocFile[]>('teamDocs:files', []);
  const [activeTab, setActiveTab] = useState<TeamTab>('clients');
  const { theme, toggle } = useThemeState();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Minimal header */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Vanta" className="w-7 h-7 rounded-full" style={{ border: '1px solid var(--border)' }} />
            <div>
              <span
                className="text-sm font-bold tracking-widest"
                style={{ color: 'var(--text-primary)', fontFamily: "'Times New Roman', serif", letterSpacing: '0.12em' }}
              >
                VANTA
              </span>
              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>Team</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>
              {session.user.email}
            </span>
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)]"
              style={{ color: 'var(--text-muted)' }}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-elevated)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex px-5 gap-1 pb-0" style={{ borderTop: '1px solid var(--border)' }}>
          {([
            { id: 'clients',  label: 'Clients' },
            { id: 'calendar', label: 'Calendar' },
            { id: 'team',     label: 'Team' },
            { id: 'docs',     label: 'Doc Hub' },
          ] as { id: TeamTab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors relative"
              style={{
                color: activeTab === id ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab === id ? '2px solid #10b981' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main
        className="max-w-5xl mx-auto px-4 md:px-6 py-6"
        style={{ paddingTop: 'calc(56px + 41px + env(safe-area-inset-top) + 24px)' }}
      >
        {activeTab === 'clients' && (
          <RecruitmentTracker clients={clients} setClients={setClients} />
        )}
        {activeTab === 'calendar' && (
          <TeamCalendarView />
        )}
        {activeTab === 'team' && (
          <div className="space-y-6">
            <FounderRoster founders={founders} setFounders={setFounders} />
            <div className="grid gap-6 md:grid-cols-2">
              <ActionItems items={actionItems} setItems={setActionItems} founders={founders} />
              <KeyMetrics metrics={metrics} setMetrics={setMetrics} />
            </div>
            <TeamLinks links={links} setLinks={setLinks} />
            <MeetingNotes notes={meetingNotes} setNotes={setMeetingNotes} />
          </div>
        )}
        {activeTab === 'docs' && (
          <DocHub
            folders={docFolders}
            setFolders={setDocFolders}
            files={docFiles}
            setFiles={setDocFiles}
          />
        )}
      </main>
    </div>
  );
}

// ─── Root TeamView ────────────────────────────────────────────────────────────

export function TeamView() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, toggle } = useThemeState();
  const themeCtx = React.useMemo(() => buildThemeValue(theme, toggle), [theme, toggle]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="w-7 h-7 border-2 border-[var(--border)] border-t-[var(--text-muted)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={themeCtx}>
      <ToastProvider>
        {session ? <TeamContent session={session} /> : <TeamLogin />}
      </ToastProvider>
    </ThemeContext.Provider>
  );
}
