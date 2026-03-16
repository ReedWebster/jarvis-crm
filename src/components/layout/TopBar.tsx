import React, { useState } from 'react';
import { format } from 'date-fns';
import { Zap, Sun, Moon, Flame, Menu, LogOut, Bell, Users, Building2 } from 'lucide-react';
import type { StatusMode, Identity } from '../../types';
import type { Theme } from '../../hooks/useTheme';
import type { NavSection } from './Sidebar';
import { supabase } from '../../lib/supabase';

const STATUS_CONFIG: Record<StatusMode, { label: string; color: string; glow: string }> = {
  'deep-work': { label: 'Deep Work', color: '#6366f1', glow: 'rgba(99,102,241,0.2)' },
  available:   { label: 'Available', color: '#22c55e', glow: 'rgba(34,197,94,0.2)'  },
  break:       { label: 'Break',     color: '#f59e0b', glow: 'rgba(245,158,11,0.2)' },
  out:         { label: 'Out',       color: '#6b7280', glow: 'rgba(107,114,128,0.2)' },
};

interface TopBarProps {
  identity: Identity;
  sectionTitle: string;
  onStatusChange: (status: StatusMode) => void;
  onThemeToggle: () => void;
  isDark: boolean;
  theme?: Theme;
  onMenuOpen: () => void;
  urgentCount?: number;
  onNotificationClick?: () => void;
  onNavigate?: (section: NavSection) => void;
}

export function TopBar({ identity, sectionTitle, onStatusChange, onThemeToggle, isDark, theme, onMenuOpen, urgentCount = 0, onNotificationClick, onNavigate }: TopBarProps) {
  const now = new Date();
  const statusCfg = STATUS_CONFIG[identity.status];
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <header
      className="fixed top-0 left-0 md:left-56 right-0 z-30 transition-colors duration-300"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
    <div
      className="h-14 flex items-center gap-3 md:gap-4"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuOpen}
        className="flex md:hidden items-center justify-center w-11 h-11 rounded-lg border flex-shrink-0 touch-target-min"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        aria-label="Open menu"
      >
        <Menu size={16} />
      </button>

      {/* Section title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold truncate transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
          {sectionTitle}
        </h1>
        <div className="text-xs hidden sm:block transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
          {format(now, 'EEEE, MMMM d')} · {format(now, 'h:mm a')}
        </div>
      </div>

      {/* Status indicator */}
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0${identity.status === 'available' ? ' status-heartbeat' : ''}`}
            style={{ backgroundColor: statusCfg.color }}
          />
          <span className="text-xs font-medium hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
            {statusCfg.label}
          </span>
        </button>

        {showStatusMenu && (
          <div
            className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl w-40 overflow-hidden z-50 border"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            {(Object.entries(STATUS_CONFIG) as [StatusMode, typeof STATUS_CONFIG[StatusMode]][]).map(([mode, cfg]) => (
              <button
                key={mode}
                onClick={() => { onStatusChange(mode); setShowStatusMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: identity.status === mode ? cfg.color : 'var(--text-muted)',
                  backgroundColor: identity.status === mode ? 'var(--bg-elevated)' : 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = identity.status === mode ? 'var(--bg-elevated)' : 'transparent')}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                {cfg.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-6 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />

      {/* Theme toggle — hidden on mobile (accessible in sidebar) */}
      <button
        onClick={onThemeToggle}
        className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: theme === 'beacon' ? 'var(--border-strong)' : 'var(--border)',
          color: theme === 'beacon' ? '#d97706' : 'var(--text-muted)',
        }}
        title={theme === 'dark' ? 'Switch to Light' : theme === 'light' ? 'Switch to Beacon' : 'Switch to Dark'}
      >
        {theme === 'dark' ? <Sun size={14} /> : theme === 'light' ? <Flame size={14} /> : <Moon size={14} />}
      </button>

      {/* Notification bell */}
      <button
        onClick={onNotificationClick}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Notifications"
      >
        <Bell size={14} />
        {urgentCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold leading-none"
            style={{ backgroundColor: '#ef4444', color: '#fff' }}
          >
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </button>

      {/* Clients button */}
      <button
        onClick={() => onNavigate?.('recruitment')}
        className="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Clients"
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <Building2 size={14} />
        <span className="text-xs font-medium">Clients</span>
      </button>

      {/* Team page link — hidden on mobile */}
      <a
        href="/?view=team"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Open team page"
      >
        <Users size={14} />
      </a>

      {/* Divider */}
      <div className="hidden sm:block w-px h-6 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />

      {/* Power indicator — desktop only */}
      <div className="hidden sm:flex items-center gap-1.5">
        <Zap size={13} className="fill-current" style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-muted)' }}>ONLINE</span>
      </div>

      {/* Logout */}
      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </div>
    </header>
  );
}
