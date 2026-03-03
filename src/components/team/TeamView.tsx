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
import { Building2, LogOut, Moon, Sun, Eye, EyeOff } from 'lucide-react';
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

const FOUNDERS = [
  { name: 'Reed Webster',  role: 'Co-Founder & CEO',      initials: 'RW', color: '#10b981' },
  { name: 'Luke Wills',    role: 'Co-Founder & COO',      initials: 'LW', color: '#6366f1' },
  { name: 'Sam Suh',       role: 'Co-Founder & CTO',      initials: 'SS', color: '#f59e0b' },
];

function FounderRoster() {
  return (
    <div className="space-y-4">
      <div>
        <h2
          className="text-xs font-semibold uppercase tracking-widest mb-4"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}
        >
          Founding Team
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {FOUNDERS.map(f => (
            <div
              key={f.name}
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: `${f.color}22`, color: f.color, letterSpacing: '0.04em' }}
              >
                {f.initials}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {f.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {f.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Inner content (after auth) ───────────────────────────────────────────────

type TeamTab = 'clients' | 'calendar' | 'team' | 'docs';

function TeamContent({ session }: { session: Session }) {
  const [clients, setClients] = useWorkspaceStorage<Client[]>('clients', []);
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
          <FounderRoster />
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
