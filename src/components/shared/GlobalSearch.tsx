import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, Users, Briefcase, Target, X, ArrowRight } from 'lucide-react';
import type { Contact, Project, Goal, Note } from '../../types';
import type { NavSection } from '../layout/Sidebar';

interface SearchResult {
  id: string;
  type: 'contact' | 'project' | 'goal' | 'note';
  title: string;
  subtitle: string;
  section: NavSection;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: NavSection) => void;
  contacts: Contact[];
  projects: Project[];
  goals: Goal[];
  notes: Note[];
}

const TYPE_CONFIG = {
  contact: { icon: <Users size={14} />, color: 'var(--text-secondary)', label: 'Contact' },
  project: { icon: <Briefcase size={14} />, color: 'var(--text-muted)', label: 'Project' },
  goal: { icon: <Target size={14} />, color: 'var(--text-muted)', label: 'Goal' },
  note: { icon: <FileText size={14} />, color: 'var(--text-muted)', label: 'Note' },
};

export function GlobalSearch({ isOpen, onClose, onNavigate, contacts, projects, goals, notes }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setActiveIdx(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    contacts.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q)) {
        res.push({ id: c.id, type: 'contact', title: c.name, subtitle: c.company || c.relationship, section: 'contacts' });
      }
    });

    projects.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q) || p.nextAction.toLowerCase().includes(q)) {
        res.push({ id: p.id, type: 'project', title: p.name, subtitle: p.nextAction, section: 'projects' });
      }
    });

    goals.forEach(g => {
      if (g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)) {
        res.push({ id: g.id, type: 'goal', title: g.title, subtitle: `${g.period} · ${g.area}`, section: 'goals' });
      }
    });

    notes.forEach(n => {
      if (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))) {
        res.push({ id: n.id, type: 'note', title: n.title, subtitle: n.tags.join(', ') || n.content.slice(0, 60), section: 'notes' });
      }
    });

    setResults(res.slice(0, 12));
    setActiveIdx(0);
  }, [query, contacts, projects, goals, notes]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && results[activeIdx]) {
        onNavigate(results[activeIdx].section);
        onClose();
      }
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, results, activeIdx, onNavigate, onClose]);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) onNavigate('command'); // signal to parent to open
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onNavigate]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4"
      style={{ backgroundColor: 'var(--bg-elevated)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-fade-in transition-colors duration-300"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-3 px-4 py-3 transition-colors duration-300"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <Search size={18} className="flex-shrink-0 transition-colors duration-300" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts, projects, goals, notes..."
            className="flex-1 bg-transparent text-sm outline-none transition-colors duration-300 placeholder:text-[color:var(--text-muted)]"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="transition-colors duration-300"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
            >
              <X size={16} />
            </button>
          )}
          <kbd
            className="px-1.5 py-0.5 text-xs rounded transition-colors duration-300"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results list */}
        {results.length > 0 && (
          <div className="py-2 max-h-96 overflow-y-auto">
            {results.map((r, idx) => {
              const cfg = TYPE_CONFIG[r.type];
              const isActive = idx === activeIdx;
              return (
                <button
                  key={r.id}
                  onClick={() => { onNavigate(r.section); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-300"
                  style={{
                    backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    setActiveIdx(idx);
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (idx !== activeIdx) {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors duration-300"
                    style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                  >
                    {cfg.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate transition-colors duration-300"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {r.title}
                    </div>
                    <div
                      className="text-xs truncate transition-colors duration-300"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {r.subtitle}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded transition-colors duration-300"
                      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                    <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} className="transition-colors duration-300" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {query && results.length === 0 && (
          <div
            className="px-4 py-8 text-center text-sm transition-colors duration-300"
            style={{ color: 'var(--text-muted)' }}
          >
            No results for &ldquo;
            <span style={{ color: 'var(--text-secondary)' }}>{query}</span>
            &rdquo;
          </div>
        )}

        {/* Quick jump / footer */}
        {!query && (
          <div className="px-4 py-4">
            <div
              className="text-xs mb-3 transition-colors duration-300"
              style={{ color: 'var(--text-muted)' }}
            >
              Quick Jump
            </div>
            <div className="flex flex-wrap gap-2">
              {(['contacts', 'projects', 'goals', 'notes'] as NavSection[]).map(s => (
                <button
                  key={s}
                  onClick={() => { onNavigate(s); onClose(); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-300 capitalize"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div
              className="mt-4 pt-3 flex items-center justify-between text-xs transition-colors duration-300"
              style={{
                borderTop: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <span>↑↓ navigate · Enter select · Esc close</span>
              <span>⌘K to open</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
