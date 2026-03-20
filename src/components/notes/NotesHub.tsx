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
  FolderOpen,
  Palette,
  Layout,
  ArrowRight,
  Sparkles,
  Wand2,
  Tags,
  CheckSquare,
  Link2,
  ChevronDown,
  ChevronUp,
  Copy,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Note, NoteColor, NoteTemplate } from '../../types';
import { generateId } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge } from '../shared/Badge';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const NOTE_COLORS: Record<NoteColor, string> = {
  none: 'transparent',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

const NOTEBOOK_PRESETS = ['General', 'Work', 'Personal', 'Ideas', 'Meetings', 'Research'];

const NOTE_TEMPLATES: Record<NoteTemplate, { label: string; icon: React.ReactNode; fill: () => Partial<Omit<Note, 'id' | 'createdAt' | 'updatedAt'>> }> = {
  blank: {
    label: 'Blank Note',
    icon: <FileText size={14} />,
    fill: () => ({}),
  },
  meeting: {
    label: 'Meeting Note',
    icon: <Users size={14} />,
    fill: () => ({
      isMeetingNote: true,
      content: '## Agenda\n\n\n## Discussion\n\n\n## Action Items\n\n- [ ] \n\n## Decisions\n\n',
      tags: ['meeting'],
    }),
  },
  '1on1': {
    label: '1-on-1',
    icon: <Users size={14} />,
    fill: () => ({
      isMeetingNote: true,
      content: '## Updates\n\n\n## Wins\n\n\n## Challenges\n\n\n## Action Items\n\n- [ ] \n\n## Feedback\n\n',
      tags: ['1on1', 'meeting'],
    }),
  },
  'weekly-review': {
    label: 'Weekly Review',
    icon: <Calendar size={14} />,
    fill: () => ({
      title: `Weekly Review — ${format(new Date(), 'MMM d, yyyy')}`,
      content: '## Wins This Week\n\n\n## Misses\n\n\n## Blockers\n\n\n## Next Week Focus\n\n\n## Energy & Mood\n\n',
      tags: ['weekly-review'],
    }),
  },
  'project-kickoff': {
    label: 'Project Kickoff',
    icon: <Layout size={14} />,
    fill: () => ({
      content: '## Project Overview\n\n\n## Goals & Success Metrics\n\n\n## Stakeholders\n\n\n## Timeline\n\n\n## Risks & Mitigations\n\n\n## Action Items\n\n- [ ] \n',
      tags: ['project', 'kickoff'],
    }),
  },
  'decision-log': {
    label: 'Decision Log',
    icon: <CheckSquare size={14} />,
    fill: () => ({
      content: '## Decision\n\n\n## Context\n\n\n## Options Considered\n\n1. \n2. \n3. \n\n## Rationale\n\n\n## Impact\n\n',
      tags: ['decision'],
    }),
  },
};

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
    linkedNoteIds: [],
    notebook: '',
    color: 'none',
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

/** Simple fuzzy match — checks if all query chars appear in order in the target */
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match = high score
  if (t.includes(q)) return { match: true, score: 100 };

  // Fuzzy: all chars in order
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) {
    // Score based on how consecutive the matches were
    const score = Math.round((maxConsecutive / q.length) * 60);
    return { match: true, score };
  }
  return { match: false, score: 0 };
}

function noteColorBorder(color?: NoteColor): string | undefined {
  if (!color || color === 'none') return undefined;
  return NOTE_COLORS[color];
}

// ─── TAG CHIP INPUT ───────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  allTags,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allTags?: string[];
}) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!allTags || !inputValue.trim()) return [];
    const q = inputValue.toLowerCase();
    return allTags
      .filter((t) => t.toLowerCase().includes(q) && !tags.includes(t))
      .slice(0, 5);
  }, [allTags, inputValue, tags]);

  function addTag(raw: string) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange([...tags, trimmed]);
    setInputValue('');
    setShowSuggestions(false);
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
    <div className="relative">
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
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 150);
            if (inputValue.trim()) addTag(inputValue);
          }}
          onFocus={() => inputValue.trim() && setShowSuggestions(true)}
          placeholder={tags.length === 0 ? 'Add tags (Enter or comma to add)…' : ''}
          className="flex-1 min-w-[100px] bg-transparent text-sm text-white outline-none placeholder-gray-600"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute z-10 top-full mt-1 left-0 right-0 rounded-lg border border-[var(--border)] shadow-lg overflow-hidden"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              #{s}
            </button>
          ))}
        </div>
      )}
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

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);

  const [scratchpadSaved, setScratchpadSaved] = useState(false);
  const scratchpadSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkTagAction, setBulkTagAction] = useState<'add' | 'remove'>('add');

  const [backlinksNoteId, setBacklinksNoteId] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'n' && !modalOpen) {
        e.preventDefault();
        openAdd();
      }
      if (meta && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [modalOpen]);

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

  const allTagsList = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [notes]);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    notes.forEach((n) =>
      n.tags.forEach((t) => tagMap.set(t, (tagMap.get(t) ?? 0) + 1))
    );
    return Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const allNotebooks = useMemo(() => {
    const nbSet = new Set<string>();
    notes.forEach((n) => {
      if (n.notebook) nbSet.add(n.notebook);
    });
    return Array.from(nbSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim();
    return notes
      .map((n) => {
        // Notebook filter
        if (activeNotebook && n.notebook !== activeNotebook) return null;
        // Tag filter
        if (activeTagFilter && !n.tags.includes(activeTagFilter)) return null;
        // Search filter
        if (!q) return { note: n, score: 0 };

        const titleMatch = fuzzyMatch(q, n.title);
        const contentMatch = fuzzyMatch(q, n.content);
        const tagMatch = n.tags.some((t) => fuzzyMatch(q, t).match);

        if (titleMatch.match || contentMatch.match || tagMatch) {
          const score = Math.max(
            titleMatch.score * 1.5,
            contentMatch.score,
            tagMatch ? 50 : 0
          );
          return { note: n, score };
        }
        return null;
      })
      .filter((r): r is { note: Note; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.note);
  }, [notes, searchQuery, activeTagFilter, activeNotebook]);

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

  // Backlinks computation
  const backlinksFor = useMemo(() => {
    if (!backlinksNoteId) return [];
    return notes.filter(
      (n) => n.linkedNoteIds?.includes(backlinksNoteId) && n.id !== backlinksNoteId
    );
  }, [notes, backlinksNoteId]);

  const linkedFromNote = useMemo(() => {
    if (!backlinksNoteId) return [];
    const note = notes.find((n) => n.id === backlinksNoteId);
    if (!note?.linkedNoteIds?.length) return [];
    return notes.filter((n) => note.linkedNoteIds!.includes(n.id));
  }, [notes, backlinksNoteId]);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd(template?: NoteTemplate) {
    setEditingNote(null);
    const base = emptyNote();
    if (template && NOTE_TEMPLATES[template]) {
      const tmpl = NOTE_TEMPLATES[template].fill();
      Object.assign(base, tmpl);
    }
    if (activeNotebook) base.notebook = activeNotebook;
    setForm(base);
    setModalOpen(true);
    setTemplatePickerOpen(false);
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
      linkedNoteIds: note.linkedNoteIds ?? [],
      notebook: note.notebook ?? '',
      color: note.color ?? 'none',
    });
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
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function togglePin(id: string) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n
      )
    );
  }

  // ── Scratchpad to note conversion ──────────────────────────────────────

  function promoteToNote() {
    if (!scratchpad.trim()) return;
    const now = new Date().toISOString();
    const lines = scratchpad.trim().split('\n');
    const title = lines[0].replace(/^#+\s*/, '').slice(0, 80) || 'From Quick Capture';
    const content = lines.length > 1 ? lines.slice(1).join('\n').trim() : lines[0];
    setNotes((prev) => [
      ...prev,
      {
        ...emptyNote(),
        id: generateId(),
        title,
        content,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setScratchpad('');
  }

  // ── Bulk tag management ─────────────────────────────────────────────────

  function toggleSelectNote(id: string) {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkTags() {
    if (selectedNoteIds.size === 0 || bulkTags.length === 0) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => {
        if (!selectedNoteIds.has(n.id)) return n;
        let newTags = [...n.tags];
        if (bulkTagAction === 'add') {
          for (const t of bulkTags) {
            if (!newTags.includes(t)) newTags.push(t);
          }
        } else {
          newTags = newTags.filter((t) => !bulkTags.includes(t));
        }
        return { ...n, tags: newTags, updatedAt: now };
      })
    );
    setBulkTagModalOpen(false);
    setBulkTags([]);
    setSelectedNoteIds(new Set());
    setBulkMode(false);
  }

  // ── AI: Auto-tag ────────────────────────────────────────────────────────

  async function autoTagNote() {
    if (!form.content.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content.slice(0, 3000),
          existingTags: allTagsList,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tags)) {
          const merged = [...new Set([...form.tags, ...data.tags.map((t: string) => t.toLowerCase())])];
          setForm((f) => ({ ...f, tags: merged }));
        }
      }
    } catch { /* silently fail */ }
    setAiLoading(false);
  }

  // ── AI: Summarize note ──────────────────────────────────────────────────

  async function summarizeNote() {
    if (!form.content.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/summarize-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content.slice(0, 6000),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setForm((f) => ({
            ...f,
            content: `## Summary\n${data.summary}\n\n---\n\n${f.content}`,
          }));
        }
      }
    } catch { /* silently fail */ }
    setAiLoading(false);
  }

  // ── Note card ─────────────────────────────────────────────────────────────

  function renderNoteCard(note: Note, compact = false) {
    const hasLink =
      note.linkedProjectId || note.linkedContactId || note.linkedGoalId;
    const borderColor = noteColorBorder(note.color);
    const hasBacklinks = notes.some((n) => n.linkedNoteIds?.includes(note.id));
    const hasLinkedNotes = (note.linkedNoteIds?.length ?? 0) > 0;

    return (
      <div
        key={note.id}
        className={`caesar-card p-4 rounded-xl border hover:border-[var(--border)] transition-all duration-200 flex flex-col ${
          bulkMode && selectedNoteIds.has(note.id) ? 'ring-2 ring-blue-500/50' : ''
        }`}
        style={{
          background: 'var(--bg-elevated)',
          borderColor: borderColor || 'var(--border)',
          borderLeftWidth: borderColor ? '3px' : undefined,
          borderLeftColor: borderColor || undefined,
          breakInside: 'avoid',
        }}
        onClick={bulkMode ? () => toggleSelectNote(note.id) : undefined}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {bulkMode && (
                <input
                  type="checkbox"
                  checked={selectedNoteIds.has(note.id)}
                  onChange={() => toggleSelectNote(note.id)}
                  className="w-3.5 h-3.5 rounded accent-blue-500"
                />
              )}
              {note.pinned && (
                <Star size={12} fill="var(--text-secondary)" stroke="var(--text-secondary)" className="shrink-0" />
              )}
              {note.isMeetingNote && (
                <Badge label="Meeting" size="xs" />
              )}
              {note.notebook && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)]">
                  {note.notebook}
                </span>
              )}
              <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                {note.title || <span className="italic">Untitled</span>}
              </h3>
            </div>
          </div>
          {!bulkMode && (
            <div className="flex items-center gap-1 shrink-0">
              {(hasBacklinks || hasLinkedNotes) && (
                <button
                  onClick={() => setBacklinksNoteId(backlinksNoteId === note.id ? null : note.id)}
                  className="p-1 transition-colors rounded"
                  style={{ color: backlinksNoteId === note.id ? 'var(--text-secondary)' : undefined }}
                  title="View linked notes"
                >
                  <Link2 size={12} />
                </button>
              )}
              <button
                onClick={() => openEdit(note)}
                className="p-1 transition-colors rounded"
                title="Edit"
              >
                <Edit3 size={12} />
              </button>
              <button
                onClick={() => togglePin(note.id)}
                className="p-1 hover: transition-colors rounded"
                title={note.pinned ? 'Unpin' : 'Pin'}
              >
                {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
              <button
                onClick={() => deleteNote(note.id)}
                className="p-1 hover:text-[var(--text-secondary)] transition-colors rounded"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Content preview */}
        <p
          className={`text-xs leading-relaxed mb-2 ${
            compact ? 'line-clamp-2' : 'line-clamp-4'
          }`}
          style={{ color: 'var(--text-muted)' }}
        >
          {note.content || <span className="italic text-gray-600">No content</span>}
        </p>

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {note.tags.map((tag) => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTagFilter(activeTagFilter === tag ? null : tag);
                }}
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

        {/* Backlinks inline */}
        {backlinksNoteId === note.id && (backlinksFor.length > 0 || linkedFromNote.length > 0) && (
          <div className="mb-2 p-2 rounded-lg border border-[var(--border)] text-xs space-y-1" style={{ background: 'var(--bg)' }}>
            {linkedFromNote.length > 0 && (
              <div>
                <span className="text-[var(--text-muted)] font-medium">Links to:</span>
                {linkedFromNote.map((ln) => (
                  <button
                    key={ln.id}
                    onClick={(e) => { e.stopPropagation(); openEdit(ln); }}
                    className="ml-1 text-[var(--text-secondary)] hover:underline"
                  >
                    {ln.title || 'Untitled'}
                  </button>
                ))}
              </div>
            )}
            {backlinksFor.length > 0 && (
              <div>
                <span className="text-[var(--text-muted)] font-medium">Linked from:</span>
                {backlinksFor.map((bl) => (
                  <button
                    key={bl.id}
                    onClick={(e) => { e.stopPropagation(); openEdit(bl); }}
                    className="ml-1 text-[var(--text-secondary)] hover:underline"
                  >
                    {bl.title || 'Untitled'}
                  </button>
                ))}
              </div>
            )}
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
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''} · {pinnedNotes.length} pinned
            {activeNotebook && (
              <span className="ml-1">
                · <FolderOpen size={11} className="inline" /> {activeNotebook}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk mode toggle */}
          <button
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedNoteIds(new Set());
            }}
            className={`caesar-btn-ghost text-xs flex items-center gap-1 ${bulkMode ? 'ring-1 ring-blue-500/50' : ''}`}
            title="Bulk tag management"
          >
            <Tags size={14} />
            Bulk
          </button>

          {/* Template picker */}
          <div className="relative">
            <button
              onClick={() => setTemplatePickerOpen(!templatePickerOpen)}
              className="caesar-btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              New Note
              <ChevronDown size={12} />
            </button>
            {templatePickerOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-[var(--border)] shadow-xl z-20 overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)' }}
              >
                {(Object.entries(NOTE_TEMPLATES) as [NoteTemplate, typeof NOTE_TEMPLATES[NoteTemplate]][]).map(([key, tmpl]) => (
                  <button
                    key={key}
                    onClick={() => openAdd(key)}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {tmpl.icon}
                    {tmpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {bulkMode && (
        <div
          className="flex items-center gap-3 p-3 rounded-xl border border-blue-500/30"
          style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {selectedNoteIds.size} selected
          </span>
          <button
            onClick={() => {
              setBulkTagAction('add');
              setBulkTagModalOpen(true);
            }}
            disabled={selectedNoteIds.size === 0}
            className="caesar-btn-ghost text-xs disabled:opacity-40"
          >
            + Add Tags
          </button>
          <button
            onClick={() => {
              setBulkTagAction('remove');
              setBulkTagModalOpen(true);
            }}
            disabled={selectedNoteIds.size === 0}
            className="caesar-btn-ghost text-xs disabled:opacity-40"
          >
            - Remove Tags
          </button>
          <button
            onClick={() => {
              setSelectedNoteIds(new Set(filteredNotes.map((n) => n.id)));
            }}
            className="caesar-btn-ghost text-xs ml-auto"
          >
            Select All
          </button>
          <button
            onClick={() => {
              setBulkMode(false);
              setSelectedNoteIds(new Set());
            }}
            className="caesar-btn-ghost text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Scratchpad ── */}
      <div className="caesar-card p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-white">
            <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
            Quick Capture
          </label>
          <div className="flex items-center gap-2">
            {scratchpad.trim() && (
              <button
                onClick={promoteToNote}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                title="Convert to note"
              >
                <ArrowRight size={11} />
                Save as Note
              </button>
            )}
            <span
              className={`flex items-center gap-1 text-xs transition-all duration-300 ${
                scratchpadSaved ? 'text-[var(--text-secondary)] opacity-100' : 'opacity-0'
              }`}
            >
              <Check size={11} />
              Saved
            </span>
          </div>
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
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search notes (fuzzy)… ⌘K"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="caesar-input pl-10 pr-4 py-2.5 text-sm w-full rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Notebooks row ── */}
      {allNotebooks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen size={13} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Notebooks
            </span>
            {activeNotebook && (
              <button
                onClick={() => setActiveNotebook(null)}
                className="flex items-center gap-1 text-xs hover:text-white transition-colors ml-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={10} />
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allNotebooks.map((nb) => (
              <button
                key={nb}
                onClick={() => setActiveNotebook(activeNotebook === nb ? null : nb)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:scale-105"
                style={
                  activeNotebook === nb
                    ? {
                        background: 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--text-secondary)',
                      }
                    : {
                        background: 'transparent',
                        color: '#6b7280',
                        borderColor: '#1a2744',
                      }
                }
              >
                <FolderOpen size={10} className="inline mr-1" />
                {nb}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tag cloud ── */}
      {allTags.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Tag size={13} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Tags
            </span>
            {activeTagFilter && (
              <button
                onClick={() => setActiveTagFilter(null)}
                className="flex items-center gap-1 text-xs hover:text-white transition-colors ml-2"
                style={{ color: 'var(--text-muted)' }}
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
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
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
          {searchQuery || activeTagFilter || activeNotebook ? (
            <p>No notes match your search.</p>
          ) : (
            <>
              <p>No notes yet. Click "New Note" to get started.</p>
              <p className="text-xs mt-1 text-gray-700">Tip: Press <kbd className="px-1 py-0.5 rounded bg-[var(--border)] text-[10px]">⌘N</kbd> to create a note</p>
            </>
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

          {/* Notebook + Color row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Notebook</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  list="notebook-list"
                  className="caesar-input w-full text-sm"
                  placeholder="General, Work, Ideas…"
                  value={form.notebook ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notebook: e.target.value }))}
                />
                <datalist id="notebook-list">
                  {NOTEBOOK_PRESETS.map((nb) => (
                    <option key={nb} value={nb} />
                  ))}
                  {allNotebooks
                    .filter((nb) => !NOTEBOOK_PRESETS.includes(nb))
                    .map((nb) => (
                      <option key={nb} value={nb} />
                    ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="caesar-label">Color Accent</label>
              <div className="flex items-center gap-1.5 mt-2">
                {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      form.color === c ? 'scale-110 ring-2 ring-white/30' : 'hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: c === 'none' ? 'var(--bg-elevated)' : NOTE_COLORS[c],
                      borderColor: form.color === c ? 'white' : 'transparent',
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between">
              <label className="caesar-label">Content</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={summarizeNote}
                  disabled={aiLoading || !form.content.trim()}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}
                  title="AI Summarize"
                >
                  <Sparkles size={11} />
                  Summarize
                </button>
              </div>
            </div>
            <textarea
              className="caesar-input w-full mt-1 resize-none font-mono text-sm leading-relaxed"
              rows={8}
              placeholder="Write your note here. Markdown supported in preview."
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </div>

          {/* Tags with AI auto-tag */}
          <div>
            <div className="flex items-center justify-between">
              <label className="caesar-label">Tags</label>
              <button
                onClick={autoTagNote}
                disabled={aiLoading || !form.content.trim()}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
                style={{ color: 'var(--text-secondary)' }}
                title="AI Auto-Tag"
              >
                <Wand2 size={11} />
                {aiLoading ? 'Thinking…' : 'Auto-tag'}
              </button>
            </div>
            <div className="mt-1">
              <TagInput
                tags={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                allTags={allTagsList}
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
                  form.pinned ? 'bg-[var(--text-secondary)]' : 'bg-[var(--bg-elevated)]'
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
                  form.isMeetingNote ? 'bg-[var(--text-secondary)]' : 'bg-[var(--bg-elevated)]'
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
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
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

          {/* Note-to-Note Links */}
          <div className="space-y-3 p-4 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Link2 size={11} />
              Linked Notes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(form.linkedNoteIds ?? []).map((lnId) => {
                const ln = notes.find((n) => n.id === lnId);
                return (
                  <span
                    key={lnId}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--border)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {ln?.title || 'Untitled'}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          linkedNoteIds: (f.linkedNoteIds ?? []).filter((id) => id !== lnId),
                        }))
                      }
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
            <select
              className="caesar-input w-full text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const id = e.target.value;
                if (!(form.linkedNoteIds ?? []).includes(id)) {
                  setForm((f) => ({
                    ...f,
                    linkedNoteIds: [...(f.linkedNoteIds ?? []), id],
                  }));
                }
              }}
            >
              <option value="">Link a note…</option>
              {notes
                .filter((n) => n.id !== editingNote?.id && !(form.linkedNoteIds ?? []).includes(n.id))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || 'Untitled'}
                  </option>
                ))}
            </select>
          </div>

          {/* Entity Links */}
          <div className="space-y-3 p-4 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
            <p className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Link size={11} />
              Linked To (optional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* ── Bulk Tag Modal ── */}
      <Modal
        isOpen={bulkTagModalOpen}
        onClose={() => setBulkTagModalOpen(false)}
        title={`${bulkTagAction === 'add' ? 'Add' : 'Remove'} Tags — ${selectedNoteIds.size} notes`}
        size="sm"
      >
        <div className="space-y-4">
          <TagInput
            tags={bulkTags}
            onChange={setBulkTags}
            allTags={allTagsList}
          />
          <div className="flex gap-3">
            <button
              onClick={applyBulkTags}
              disabled={bulkTags.length === 0}
              className="caesar-btn-primary flex-1 disabled:opacity-50"
            >
              {bulkTagAction === 'add' ? 'Add Tags' : 'Remove Tags'}
            </button>
            <button onClick={() => setBulkTagModalOpen(false)} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
