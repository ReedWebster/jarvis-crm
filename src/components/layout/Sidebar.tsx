import React from 'react';
import {
  LayoutDashboard, User, Briefcase, Clock, Users, GraduationCap,
  DollarSign, Target, BookOpen, UserPlus, FileText, Search, ChevronRight, CheckSquare
} from 'lucide-react';

export type NavSection =
  | 'command'
  | 'identity'
  | 'projects'
  | 'time'
  | 'contacts'
  | 'academic'
  | 'financial'
  | 'goals'
  | 'reading'
  | 'recruitment'
  | 'notes'
  | 'todos';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'command',     label: 'Command Brief',   icon: <LayoutDashboard size={18} /> },
  { id: 'identity',   label: 'Core Identity',    icon: <User size={18} /> },
  { id: 'projects',   label: 'Projects',         icon: <Briefcase size={18} /> },
  { id: 'time',       label: 'Time Tracker',     icon: <Clock size={18} /> },
  { id: 'contacts',   label: 'Contacts CRM',     icon: <Users size={18} /> },
  { id: 'academic',   label: 'Academic',         icon: <GraduationCap size={18} /> },
  { id: 'financial',  label: 'Financial',        icon: <DollarSign size={18} /> },
  { id: 'goals',      label: 'Goal Hierarchy',   icon: <Target size={18} /> },
  { id: 'reading',    label: 'Reading Pipeline', icon: <BookOpen size={18} /> },
  { id: 'recruitment',label: 'Recruitment',      icon: <UserPlus size={18} /> },
  { id: 'notes',      label: 'Notes & Intel',    icon: <FileText size={18} /> },
  { id: 'todos',      label: 'Todo List',        icon: <CheckSquare size={18} /> },
];

interface SidebarProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  onSearch: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ active, onNavigate, onSearch, mobileOpen, onMobileClose }: SidebarProps) {
  const handleNavigate = (section: NavSection) => {
    onNavigate(section);
    onMobileClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 md:w-56 flex flex-col z-40 transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 transition-colors duration-300" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="text-sm font-bold tracking-wide transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
              J.A.R.V.I.S.
            </div>
            <div className="text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
              Command Center
            </div>
          </div>

          {/* Search */}
          <div className="p-3 transition-colors duration-300" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => { onSearch(); onMobileClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Search size={14} />
              <span>Search...</span>
              <span className="ml-auto text-xs font-mono" style={{ color: 'var(--text-muted)' }}>⌘K</span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            <div className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative"
                    style={{
                      backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                        style={{ backgroundColor: 'var(--text-primary)' }}
                      />
                    )}
                    <span style={{ color: isActive ? 'var(--text-primary)' : 'inherit' }}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {isActive && (
                      <ChevronRight size={12} className="ml-auto" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-3 text-center transition-colors duration-300" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v1.0.0</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Powered by Reed Webster</div>
          </div>
        </div>
      </aside>
    </>
  );
}
