import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Plus,
  Edit3,
  Trash2,
  Pin,
  Search,
  Tag,
  Star,
  Link,
  Calendar,
  Users,
  BookOpen,
  Check,
  X,
  PinOff,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Note } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge } from '../shared/Badge';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function emptyNote(): Omit<Note, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '',
    content: '',
    tags: [],
    pinned: false,
    linkedProjectId: '',
    linkedContactId: '',
    linkedGoalId: '',
    isMeetingNote: false,
    meetingAttendees: '',
    meetingActionItems: '',
    meetingDecisions: '',
  };
}

const TAG_COLORS = [
  'var(--text-muted)',
  'var(--text-muted)',
  'var(--text-muted)',
  'var(--text-secondary)',
  'var(--text-muted)',
  'var(--text-secondary)',
  'var(--text-muted)',
  'var(--text-muted)',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function formatRelative(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(d, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ─── TAG CHIP INPUT ───────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  function addTag(raw: string) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange([...tags, trimmed]);
    setInputValue('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] min-h-[40px] items-center">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: `${tagColor(tag)}20`, color: tagColor(tag), border: `1px solid ${tagColor(tag)}40` }}
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:opacity-70 transition-opacity"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addTag(inputValue)}
        placeholder={tags.length === 0 ? 'Add tags (Enter or comma to add)…' : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-white outline-none placeholder-gray-600"
      />
    </div>
  );
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  scratchpad: string;
  setScratchpad: (v: string) => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function NotesHub({ notes, setNotes, scratchpad, setScratchpad }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [form, setForm] = useState<Omit<Note, 'id' | 'createdAt' | 'updatedAt'>>(emptyNote());
  const [tagInputStr, setTagInputStr] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [scratchpadSaved, setScratchpadSaved] = useState(false);
  const scratchpadSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scratchpad auto-save indicator ──────────────────────────────────────

  function handleScratchpadChange(val: string) {
    setScratchpad(val);
    setScratchpadSaved(false);
    if (scratchpadSaveTimer.current) clearTimeout(scratchpadSaveTimer.current);
    scratchpadSaveTimer.current = setTimeout(() => {
      setScratchpadSaved(true);
      setTimeout(() => setScratchpadSaved(false), 2000);
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (scratchpadSaveTimer.current) clearTimeout(scratchpadSaveTimer.current);
    };
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    notes.forEach((n) =>
      n.tags.forEach((t) => tagMap.set(t, (tagMap.get(t) ?? 0) + 1))
    );
    return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return notes.filter((n) => {
      const matchesSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q));
      const matchesTag = !activeTagFilter || n.tags.includes(activeTagFilter);
      return matchesSearch && matchesTag;
    });
  }, [notes, searchQuery, activeTagFilter]);

  const pinnedNotes = useMemo(
    () => filteredNotes.filter((n) => n.pinned),
    [filteredNotes]
  );

  const archivedNotes = useMemo(
    () => filteredNotes.filter((n) => !n.pinned).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    [filteredNotes]
  );

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingNote(null);
    setForm(emptyNote());
    setTagInputStr('');
    setModalOpen(true);
  }

  function openEdit(note: Note) {
    setEditingNote(note);
    setForm({
      title: note.title,
      content: note.content,
      tags: [...note.tags],
      pinned: note.pinned,
      linkedProjectId: note.linkedProjectId ?? '',
      linkedContactId: note.linkedContactId ?? '',
      linkedGoalId: note.linkedGoalId ?? '',
      isMeetingNote: note.isMeetingNote,
      meetingAttendees: note.meetingAttendees ?? '',
      meetingActionItems: note.meetingActionItems ?? '',
      meetingDecisions: note.meetingDecisions ?? '',
    });
    setTagInputStr('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingNote(null);
  }

  function saveNote() {
    if (!form.title.trim() && !form.content.trim()) return;
    const now = new Date().toISOString();
    if (editingNote) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNote.id
            ? {
                ...form,
                id: editingNote.id,
                createdAt: editingNote.createdAt,
                updatedAt: now,
              }
            : n
        )
      );
    } else {
      setNotes((prev) => [
        ...prev,
        {
          ...form,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    closeModal();
  }

  function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function togglePin(id: string) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n
      )
    );
  }

  // ── Note card ─────────────────────────────────────────────────────────────

  function renderNoteCard(note: Note, compact = false) {
    const hasLink =
      note.linkedProjectId || note.linkedContactId || note.linkedGoalId;

    return (
      <div
        key={note.id}
        className="caesar-card p-4 rounded-xl border border-[var(--border)] hover:border-[var(--border)] transition-all duration-200 flex flex-col"
        style={{ background: 'var(--bg-elevated)', breakInside: 'avoid' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {note.pinned && (
                <Star size={12} fill="var(--text-secondary)" stroke="var(--text-secondary)" className="shrink-0" />
              )}
              {note.isMeetingNote && (
                <Badge label="Meeting" size="xs" />
              )}
              <h3 className="text-white font-semibold text-sm leading-tight">
                {note.title || <span className=" italic">Untitled</span>}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => openEdit(note)}
              className="p-1   transition-colors rounded"
              title="Edit"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={() => togglePin(note.id)}
              className="p-1  hover: transition-colors rounded"
              title={note.pinned ? 'Unpin' : 'Pin'}
            >
              {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <button
              onClick={() => deleteNote(note.id)}
              className="p-1  hover:text-[var(--text-secondary)] transition-colors rounded"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Content preview */}
        <p
          className={` text-xs leading-relaxed mb-2 ${
            compact ? 'line-clamp-2' : 'line-clamp-4'
          }`}
        >
          {note.content || <span className="italic text-gray-600">No content</span>}
        </p>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {note.tags.map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setActiveTagFilter(activeTagFilter === tag ? null : tag)
                }
                className="px-1.5 py-0.5 rounded-full text-xs font-medium transition-all hover:opacity-80"
                style={{
                  background: `${tagColor(tag)}15`,
                  color: tagColor(tag),
                  border: `1px solid ${tagColor(tag)}30`,
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Links badge */}
        {hasLink && (
          <div className="flex items-center gap-1 mb-2">
            <Link size={10} className="text-gray-600" />
            <span className="text-gray-600 text-xs">
              {[
                note.linkedProjectId && `Project: ${note.linkedProjectId}`,
                note.linkedContactId && `Contact: ${note.linkedContactId}`,
                note.linkedGoalId && `Goal: ${note.linkedGoalId}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]/50">
          <span className="text-gray-600 text-xs">
            {formatRelative(note.updatedAt)}
          </span>
          {note.isMeetingNote && note.meetingAttendees && (
            <div className="flex items-center gap-1">
              <Users size={10} className="text-gray-600" />
              <span className="text-gray-600 text-xs truncate max-w-[100px]">
                {note.meetingAttendees.split(',')[0].trim()}
                {note.meetingAttendees.split(',').length > 1 && ' +more'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <FileText size={22} style={{ color: 'var(--text-muted)' }} />
            Notes & Intelligence
          </h1>
          <p className=" text-sm mt-0.5">
            {notes.length} note{notes.length !== 1 ? 's' : ''} · {pinnedNotes.length} pinned
          </p>
        </div>
        <button onClick={openAdd} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Note
        </button>
      </div>

      {/* ── Scratchpad ── */}
      <div className="caesar-card p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-white">
            <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
            Quick Capture
          </label>
          <span
            className={`flex items-center gap-1 text-xs transition-all duration-300 ${
              scratchpadSaved ? 'text-[var(--text-secondary)] opacity-100' : 'opacity-0'
            }`}
          >
            <Check size={11} />
            Saved
          </span>
        </div>
        <textarea
          className="caesar-input w-full resize-none text-sm leading-relaxed"
          rows={5}
          placeholder="Capture anything — ideas, reminders, fleeting thoughts…"
          value={scratchpad}
          onChange={(e) => handleScratchpadChange(e.target.value)}
        />
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 "
        />
        <input
          type="text"
          placeholder="Search notes by title, content, or tag…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="caesar-input pl-10 pr-4 py-2.5 text-sm w-full rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2  hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Tag cloud ── */}
      {allTags.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={13} className="" />
            <span className="text-xs  font-medium uppercase tracking-wide">
              Tags
            </span>
            {activeTagFilter && (
              <button
                onClick={() => setActiveTagFilter(null)}
                className="flex items-center gap-1 text-xs  hover:text-white transition-colors ml-2"
              >
                <X size={10} />
                Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() =>
                  setActiveTagFilter(activeTagFilter === tag ? null : tag)
                }
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:scale-105"
                style={
                  activeTagFilter === tag
                    ? {
                        background: `${tagColor(tag)}25`,
                        color: tagColor(tag),
                        borderColor: `${tagColor(tag)}60`,
                      }
                    : {
                        background: 'transparent',
                        color: '#6b7280',
                        borderColor: '#1a2744',
                      }
                }
              >
                #{tag}
                <span className="ml-1 opacity-60">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Pinned notes ── */}
      {pinnedNotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star size={14} fill="var(--text-secondary)" stroke="var(--text-secondary)" />
            <h2 className="text-sm font-semibold text-white">
              Pinned ({pinnedNotes.length})
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {pinnedNotes.map((note) => (
              <div key={note.id} className="min-w-[260px] max-w-[300px] shrink-0">
                {renderNoteCard(note, true)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Archive (masonry) ── */}
      {archivedNotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="" />
            <h2 className="text-sm font-semibold text-white">
              All Notes ({archivedNotes.length})
            </h2>
          </div>
          <div
            style={{
              columnCount: 3,
              columnGap: '16px',
            }}
            className="masonry-grid"
          >
            {archivedNotes.map((note) => (
              <div key={note.id} style={{ breakInside: 'avoid', marginBottom: '16px' }}>
                {renderNoteCard(note)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {filteredNotes.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          {searchQuery || activeTagFilter ? (
            <p>No notes match your search.</p>
          ) : (
            <p>No notes yet. Click "New Note" to get started.</p>
          )}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingNote ? 'Edit Note' : 'New Note'}
        size="xl"
      >
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="caesar-label">Title</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="Note title…"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Content */}
          <div>
            <label className="caesar-label">Content</label>
            <textarea
              className="caesar-input w-full mt-1 resize-none font-mono text-sm leading-relaxed"
              rows={8}
              placeholder="Write your note here. Markdown supported in preview."
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="caesar-label">Tags</label>
            <div className="mt-1">
              <TagInput
                tags={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
              />
            </div>
          </div>

          {/* Toggles row */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, pinned: !f.pinned }))}
                className={`w-10 h-5 rounded-full transition-all relative ${
                  form.pinned ? 'bg-[var(--bg-elevated)]' : 'bg-[var(--bg-elevated)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    form.pinned ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300 flex items-center gap-1">
                <Pin size={13} />
                Pinned
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, isMeetingNote: !f.isMeetingNote }))
                }
                className={`w-10 h-5 rounded-full transition-all relative ${
                  form.isMeetingNote ? 'bg-[var(--bg-elevated)]' : 'bg-[var(--bg-elevated)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    form.isMeetingNote ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300 flex items-center gap-1">
                <Calendar size={13} />
                Meeting Note
              </span>
            </label>
          </div>

          {/* Meeting fields */}
          {form.isMeetingNote && (
            <div className="space-y-3 p-4 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
              <p className="text-xs  font-medium uppercase tracking-wide">
                Meeting Details
              </p>
              <div>
                <label className="caesar-label">Attendees</label>
                <input
                  type="text"
                  className="caesar-input w-full mt-1"
                  placeholder="Comma-separated names"
                  value={form.meetingAttendees ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meetingAttendees: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="caesar-label">Action Items</label>
                <textarea
                  className="caesar-input w-full mt-1 resize-none"
                  rows={3}
                  placeholder="What needs to be done?"
                  value={form.meetingActionItems ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meetingActionItems: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="caesar-label">Decisions Made</label>
                <textarea
                  className="caesar-input w-full mt-1 resize-none"
                  rows={2}
                  placeholder="Key decisions from this meeting"
                  value={form.meetingDecisions ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meetingDecisions: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          {/* Links */}
          <div className="space-y-3 p-4 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-xs  font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Link size={11} />
              Linked To (optional)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="caesar-label">Project ID</label>
                <input
                  type="text"
                  className="caesar-input w-full mt-1 text-xs"
                  placeholder="Project ID"
                  value={form.linkedProjectId ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, linkedProjectId: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="caesar-label">Contact ID</label>
                <input
                  type="text"
                  className="caesar-input w-full mt-1 text-xs"
                  placeholder="Contact ID"
                  value={form.linkedContactId ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, linkedContactId: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="caesar-label">Goal ID</label>
                <input
                  type="text"
                  className="caesar-input w-full mt-1 text-xs"
                  placeholder="Goal ID"
                  value={form.linkedGoalId ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, linkedGoalId: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveNote}
              disabled={!form.title.trim() && !form.content.trim()}
              className="caesar-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingNote ? 'Save Changes' : 'Create Note'}
            </button>
            <button onClick={closeModal} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
