import React, { useState } from 'react';
import {
  LayoutDashboard, User, Briefcase, Clock, Users, GraduationCap,
  Target, Building2, FileText, Search, ChevronRight,
  GripVertical, Settings2, Check, Sun, Moon,
  Share2, Inbox, Flame, Atom,
  Zap, BarChart3, BookHeart, Bookmark, Activity,
} from 'lucide-react';
import type { Theme } from '../../hooks/useTheme';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type NavSection =
  | 'command'
  | 'identity'
  | 'nexus'
  | 'projects'
  | 'time'
  | 'contacts'
  | 'learning'
  | 'notes-docs'
  | 'goals'
  | 'recruitment'
  | 'social'
  | 'messaging'
  | 'abs'
  | 'automation'
  | 'analytics'
  | 'health'
  | 'journal'
  | 'bookmarks'
  // Legacy aliases kept for saved navOrder migration
  | 'academic'
  | 'class-notes'
  | 'financial'
  | 'reading'
  | 'notes'
  | 'todos'
  | 'world'
  | 'dochub';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
}

// Map legacy nav IDs from saved orders to their consolidated replacements
const LEGACY_MAP: Partial<Record<string, NavSection>> = {
  academic: 'learning',
  'class-notes': 'learning',
  reading: 'learning',
  financial: 'projects',
  notes: 'notes-docs',
  dochub: 'notes-docs',
  todos: 'command',
  world: 'nexus',
};

const NAV_ITEMS: NavItem[] = [
  { id: 'command',     label: 'Command Brief',       icon: <LayoutDashboard size={18} /> },
  { id: 'nexus',      label: 'Nexus',                icon: <Atom size={18} /> },
  { id: 'identity',   label: 'Core Identity',        icon: <User size={18} /> },
  { id: 'projects',   label: 'Projects & Finance',   icon: <Briefcase size={18} /> },
  { id: 'time',       label: 'Calendar',             icon: <Clock size={18} /> },
  { id: 'contacts',   label: 'Contacts CRM',         icon: <Users size={18} /> },
  { id: 'learning',   label: 'Learning',             icon: <GraduationCap size={18} /> },
  { id: 'notes-docs', label: 'Notes & Docs',         icon: <FileText size={18} /> },
  { id: 'goals',      label: 'Goal Hierarchy',       icon: <Target size={18} /> },
  { id: 'recruitment',label: 'Clients',              icon: <Building2 size={18} /> },
  { id: 'social',     label: 'Social Command',       icon: <Share2 size={18} /> },
  { id: 'messaging',  label: 'Messaging',            icon: <Inbox size={18} /> },
  { id: 'abs',        label: 'ABS',                  icon: <Users size={18} /> },
  { id: 'automation', label: 'Automation',            icon: <Zap size={18} /> },
  { id: 'analytics',  label: 'Analytics & Insights', icon: <BarChart3 size={18} /> },
  { id: 'health',     label: 'Health',               icon: <Activity size={18} /> },
  { id: 'journal',    label: 'Journal',              icon: <BookHeart size={18} /> },
  { id: 'bookmarks',  label: 'Bookmarks',            icon: <Bookmark size={18} /> },
];

const DEFAULT_ORDER = NAV_ITEMS.map(i => i.id);

function buildOrderedItems(navOrder: NavSection[]): NavItem[] {
  const ordered: NavItem[] = [];
  const remaining = new Set(NAV_ITEMS);
  const added = new Set<string>();

  for (const id of navOrder) {
    // Remap legacy IDs to their new consolidated tab
    const mapped = LEGACY_MAP[id] ?? id;
    if (added.has(mapped)) continue;
    const item = NAV_ITEMS.find(i => i.id === mapped);
    if (item) { ordered.push(item); remaining.delete(item); added.add(mapped); }
  }
  // Append any new items not yet in saved order
  for (const item of remaining) ordered.push(item);
  return ordered;
}

// ─── SORTABLE NAV ITEM ────────────────────────────────────────────────────────

function SortableNavItem({
  item,
  isActive,
  isEditing,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  isEditing: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={isEditing ? undefined : onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative"
        style={{
          backgroundColor: isActive && !isEditing ? 'var(--bg-elevated)' : 'transparent',
          color: isActive && !isEditing ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: isEditing ? 'default' : 'pointer',
        }}
        onMouseEnter={e => { if (!isActive && !isEditing) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!isActive && !isEditing) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {isActive && !isEditing && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
            style={{ backgroundColor: 'var(--text-primary)' }}
          />
        )}

        {isEditing ? (
          <span
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing"
            style={{ color: 'var(--text-muted)', touchAction: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </span>
        ) : (
          <span style={{ color: isActive ? 'var(--text-primary)' : 'inherit' }}>
            {item.icon}
          </span>
        )}

        <span>{item.label}</span>

        {isActive && !isEditing && (
          <ChevronRight size={12} className="ml-auto" style={{ color: 'var(--text-muted)' }} />
        )}
      </button>
    </div>
  );
}

// ─── SIDEBAR PROPS ────────────────────────────────────────────────────────────

interface SidebarProps {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
  onSearch: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  navOrder: NavSection[];
  onNavOrderChange: (order: NavSection[]) => void;
  onThemeToggle?: () => void;
  isDark?: boolean;
  theme?: Theme;
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

export function Sidebar({
  active, onNavigate, onSearch, mobileOpen, onMobileClose,
  navOrder, onNavOrderChange, onThemeToggle, isDark, theme,
}: SidebarProps) {
  const [isEditing, setIsEditing] = useState(false);

  const orderedItems = buildOrderedItems(navOrder.length > 0 ? navOrder : DEFAULT_ORDER);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;
    const ids = orderedItems.map(i => i.id);
    const oldIndex = ids.indexOf(dragActive.id as NavSection);
    const newIndex = ids.indexOf(over.id as NavSection);
    if (oldIndex !== -1 && newIndex !== -1) {
      onNavOrderChange(arrayMove(ids, oldIndex, newIndex));
    }
  };

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
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Beacon scanline sweep */}
        <div className="sidebar-scanline" />

        <div className="flex flex-col h-full" style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div className="p-4 transition-colors duration-300 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <img src="/favicon.svg" alt="LITEHOUSE" className="beacon-logo-pulse w-9 h-9 rounded-full flex-shrink-0" style={{ border: '1px solid var(--border)' }} />
            <div>
              <div className="text-sm font-bold tracking-widest transition-colors duration-300" style={{ color: 'var(--text-primary)', fontFamily: "'Times New Roman', Times, serif", letterSpacing: '0.15em' }}>
                LITEHOUSE
              </div>
              <div className="text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                Command Center
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="p-3 transition-colors duration-300" style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => { onSearch(); onMobileClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 hover:border-[var(--border-strong)]"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Search size={13} />
              <span className="flex-1 text-left text-xs">Quick search...</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>⌘K</kbd>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {isEditing ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {orderedItems.map(item => (
                      <SortableNavItem
                        key={item.id}
                        item={item}
                        isActive={active === item.id}
                        isEditing
                        onClick={() => {}}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="space-y-0.5">
                {orderedItems.map(item => (
                  <SortableNavItem
                    key={item.id}
                    item={item}
                    isActive={active === item.id}
                    isEditing={false}
                    onClick={() => handleNavigate(item.id)}
                  />
                ))}
              </div>
            )}
          </nav>

          {/* Footer */}
          <div
            className="p-3 flex items-center justify-between gap-2 transition-colors duration-300"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>v1.0.0</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Built by Reed Webster</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Theme toggle — mobile only (hidden on sm+ where TopBar shows it) */}
              {onThemeToggle && (
                <button
                  onClick={onThemeToggle}
                  className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border transition-colors"
                  style={{
                    backgroundColor: theme === 'beacon' ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
                    borderColor: theme === 'beacon' ? 'var(--border-strong)' : 'var(--border)',
                    color: theme === 'beacon' ? '#d97706' : 'var(--text-muted)',
                  }}
                  title={theme === 'dark' ? 'Switch to Light' : theme === 'light' ? 'Switch to Beacon' : 'Switch to Dark'}
                >
                  {theme === 'dark' ? <Sun size={13} /> : theme === 'light' ? <Flame size={13} /> : <Moon size={13} />}
                </button>
              )}
              <button
                onClick={() => setIsEditing(v => !v)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: isEditing ? '#6366f1' : 'var(--bg-elevated)',
                  color: isEditing ? '#fff' : 'var(--text-muted)',
                }}
                title={isEditing ? 'Done reordering' : 'Reorder tabs'}
              >
                {isEditing ? <Check size={12} /> : <Settings2 size={12} />}
                {isEditing ? 'Done' : ''}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
