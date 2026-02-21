import React, { useState } from 'react';
import { format } from 'date-fns';
import { Zap, Sun, Moon, Menu, LogOut } from 'lucide-react';
import type { StatusMode, Identity } from '../../types';
import { supabase } from '../../lib/supabase';

const STATUS_CONFIG: Record<StatusMode, { label: string; color: string; glow: string }> = {
  'deep-work': { label: 'Deep Work', color: '#737373', glow: 'rgba(115,115,115,0.2)' },
  available:   { label: 'Available', color: 'var(--text-secondary)', glow: 'rgba(90,138,90,0.2)'  },
  break:       { label: 'Break',     color: '#737373', glow: 'rgba(115,115,115,0.2)' },
  out:         { label: 'Out',       color: '#555555', glow: 'rgba(85,85,85,0.2)'   },
};

interface TopBarProps {
  identity: Identity;
  sectionTitle: string;
  onStatusChange: (status: StatusMode) => void;
  onThemeToggle: () => void;
  isDark: boolean;
  onMenuOpen: () => void;
}

export function TopBar({ identity, sectionTitle, onStatusChange, onThemeToggle, isDark, onMenuOpen }: TopBarProps) {
  const now = new Date();
  const statusCfg = STATUS_CONFIG[identity.status];
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <header
      className="fixed top-0 left-0 md:left-56 right-0 h-14 z-30 flex items-center px-4 md:px-6 gap-3 md:gap-4 transition-colors duration-300"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuOpen}
        className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg border flex-shrink-0"
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
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusCfg.color }} />
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

      {/* Theme toggle */}
      <button
        onClick={onThemeToggle}
        className="flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Power indicator — desktop only */}
      <div className="hidden sm:flex items-center gap-1.5">
        <Zap size={14} className="fill-current" style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-muted)' }}>ONLINE</span>
      </div>

      {/* Logout */}
      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-200 hover:border-[var(--border-strong)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </header>
  );
}
