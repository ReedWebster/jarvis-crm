import React, { useState, useMemo } from 'react';
import {
  Bookmark as BookmarkIcon, Plus, Edit3, Trash2, Search,
  Link2, Lightbulb, Quote, Image, FileText, Pin, PinOff,
  ExternalLink, Tag,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Bookmark, BookmarkType } from '../../types';
import { generateId } from '../../utils';
import { Modal } from '../shared/Modal';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  bookmarks: Bookmark[];
  setBookmarks: (v: Bookmark[] | ((p: Bookmark[]) => Bookmark[])) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TYPES: { value: BookmarkType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'link',       label: 'Link',       icon: <Link2 size={14} />,     color: '#3b82f6' },
  { value: 'idea',       label: 'Idea',       icon: <Lightbulb size={14} />, color: '#eab308' },
  { value: 'quote',      label: 'Quote',      icon: <Quote size={14} />,     color: '#8b5cf6' },
  { value: 'screenshot', label: 'Screenshot', icon: <Image size={14} />,     color: '#ec4899' },
  { value: 'reference',  label: 'Reference',  icon: <FileText size={14} />,  color: '#22c55e' },
];

function emptyBookmark(): Bookmark {
  return {
    id: generateId(),
    title: '',
    url: '',
    content: '',
    type: 'link',
    tags: [],
    pinned: false,
    createdAt: new Date().toISOString(),
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function BookmarksInspiration({ bookmarks, setBookmarks }: Props) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<BookmarkType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Bookmark>(emptyBookmark);
  const [tagInput, setTagInput] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookmarks
      .filter(b => {
        if (filterType !== 'all' && b.type !== filterType) return false;
        return b.title.toLowerCase().includes(q) || b.content.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [bookmarks, search, filterType]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    bookmarks.forEach(b => b.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [bookmarks]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyBookmark());
    setTagInput('');
    setModalOpen(true);
  };

  const openEdit = (bm: Bookmark) => {
    setEditingId(bm.id);
    setDraft({ ...bm });
    setTagInput('');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!draft.title.trim()) return;
    if (editingId) {
      setBookmarks(prev => prev.map(b => b.id === editingId ? { ...draft } : b));
    } else {
      setBookmarks(prev => [...prev, draft]);
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const togglePin = (id: string) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, pinned: !b.pinned } : b));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !draft.tags.includes(t)) {
      setDraft(d => ({ ...d, tags: [...d.tags, t] }));
      setTagInput('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {TYPES.map(type => {
          const count = bookmarks.filter(b => b.type === type.value).length;
          return (
            <button
              key={type.value}
              onClick={() => setFilterType(filterType === type.value ? 'all' : type.value)}
              className="caesar-card p-3 flex items-center gap-2 transition-colors"
              style={{
                border: filterType === type.value ? `1px solid ${type.color}` : undefined,
              }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: type.color }}>
                {type.icon}
              </div>
              <div className="text-left">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{type.label}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bookmarks..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>
        <button onClick={openCreate} className="caesar-btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={14} /> Save
        </button>
      </div>

      {/* Bookmarks grid */}
      {filtered.length === 0 ? (
        <div className="caesar-card p-12 text-center">
          <BookmarkIcon size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No bookmarks yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Save links, ideas, quotes, and inspiration for later.</p>
          <button onClick={openCreate} className="caesar-btn-ghost text-xs mt-4 flex items-center gap-1 mx-auto">
            <Plus size={12} /> Add your first bookmark
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(bm => {
            const typeMeta = TYPES.find(t => t.value === bm.type);
            return (
              <div key={bm.id} className="caesar-card p-4 flex flex-col hover:bg-[var(--bg-hover)] transition-colors cursor-pointer" onClick={() => openEdit(bm)}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)', color: typeMeta?.color ?? 'var(--text-muted)' }}>
                    {typeMeta?.icon ?? <BookmarkIcon size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{bm.title}</p>
                    {bm.url && (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {bm.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); togglePin(bm.id); }}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)]"
                      style={{ color: bm.pinned ? '#f97316' : 'var(--text-muted)' }}
                    >
                      {bm.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(bm.id); }}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)]"
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {bm.content && (
                  <p className="text-xs line-clamp-3 flex-1" style={{ color: 'var(--text-muted)' }}>{bm.content}</p>
                )}
                {bm.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {bm.tags.slice(0, 3).map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{t}</span>
                    ))}
                    {bm.tags.length > 3 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{bm.tags.length - 3}</span>
                    )}
                  </div>
                )}
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  {format(parseISO(bm.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Bookmark' : 'New Bookmark'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Title</label>
            <input
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="Bookmark title"
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Type</label>
            <div className="flex gap-2 mt-2">
              {TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setDraft(d => ({ ...d, type: t.value }))}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-1 justify-center"
                  style={{
                    backgroundColor: draft.type === t.value ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${draft.type === t.value ? t.color : 'var(--border)'}`,
                    color: draft.type === t.value ? t.color : 'var(--text-muted)',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* URL (for links) */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>URL (optional)</label>
            <input
              value={draft.url ?? ''}
              onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
              placeholder="https://..."
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Notes / Content</label>
            <textarea
              value={draft.content}
              onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
              placeholder="Add notes, the quote text, your idea..."
              rows={4}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Tags</label>
            <div className="flex gap-2 mt-1">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag..."
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
              <button onClick={addTag} className="caesar-btn-ghost px-3 py-2 text-sm"><Tag size={14} /></button>
            </div>
            {allTags.length > 0 && draft.tags.length === 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {allTags.slice(0, 10).map(t => (
                  <button
                    key={t}
                    onClick={() => setDraft(d => ({ ...d, tags: [...d.tags, t] }))}
                    className="px-2 py-0.5 rounded text-xs hover:opacity-80"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {draft.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {draft.tags.map(t => (
                  <button
                    key={t}
                    onClick={() => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))}
                    className="px-2 py-0.5 rounded text-xs flex items-center gap-1 hover:line-through"
                    style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    {t} &times;
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="caesar-btn-ghost flex-1 py-2 text-sm">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!draft.title.trim()}
              className="caesar-btn-primary flex-1 py-2 text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {editingId ? 'Save Changes' : 'Save Bookmark'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
