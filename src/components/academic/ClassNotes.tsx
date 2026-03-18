import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  Search,
  FileText,
  ChevronLeft,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Note, Course } from '../../types';
import { generateId, todayStr } from '../../utils';
import { Modal } from '../shared/Modal';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  courses: Course[];
  onBack: () => void;
}

// ─── NOTE FORM ────────────────────────────────────────────────────────────────

interface NoteFormData {
  title: string;
  content: string;
  courseId: string;
  tags: string;
}

function emptyForm(defaultCourseId = ''): NoteFormData {
  return { title: '', content: '', courseId: defaultCourseId, tags: '' };
}

interface NoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NoteFormData) => void;
  courses: Course[];
  initial?: NoteFormData;
  title: string;
}

function NoteFormModal({ isOpen, onClose, onSave, courses, initial, title }: NoteFormModalProps) {
  const [form, setForm] = useState<NoteFormData>(initial ?? emptyForm(courses[0]?.id ?? ''));

  React.useEffect(() => {
    if (isOpen) setForm(initial ?? emptyForm(courses[0]?.id ?? ''));
  }, [isOpen, initial, courses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="caesar-label">Course *</label>
          <select
            className="caesar-input w-full"
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
            required
          >
            <option value="">— No course —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="caesar-label">Title *</label>
          <input
            className="caesar-input w-full"
            placeholder="e.g. Lecture 5 — Market Structures"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="caesar-label">Notes</label>
          <textarea
            className="caesar-input w-full"
            rows={8}
            placeholder="Write your class notes here…"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>
        <div>
          <label className="caesar-label">Tags (comma-separated)</label>
          <input
            className="caesar-input w-full"
            placeholder="e.g. lecture, midterm, chapter 4"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Save Note</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── NOTE CARD ────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note;
  courseColor: string;
  onEdit: () => void;
  onDelete: () => void;
}

function NoteCard({ note, courseColor, onEdit, onDelete }: NoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = note.content.slice(0, 180);
  const hasMore = note.content.length > 180;

  return (
    <div className="caesar-card flex flex-col gap-3 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
            style={{ backgroundColor: courseColor }}
          />
          <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
            {note.title}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors hover:text-[var(--text-secondary)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      {note.content && (
        <div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
            {expanded ? note.content : preview}
            {!expanded && hasMore && '…'}
          </p>
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs mt-1 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Date */}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {format(parseISO(note.updatedAt), 'MMM d, yyyy')}
      </p>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function ClassNotes({ notes, setNotes, courses, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [filterCourseId, setFilterCourseId] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);

  // Only notes linked to a course
  const classNotes = useMemo(
    () => notes.filter((n) => !!n.linkedCourseId),
    [notes]
  );

  const filtered = useMemo(() => {
    let result = classNotes;
    if (filterCourseId !== 'all') result = result.filter((n) => n.linkedCourseId === filterCourseId);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [classNotes, filterCourseId, search]);

  const courseMap = useMemo(() => {
    const m: Record<string, Course> = {};
    for (const c of courses) m[c.id] = c;
    return m;
  }, [courses]);

  const handleAdd = (data: NoteFormData) => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: generateId(),
      title: data.title,
      content: data.content,
      tags: data.tags.split(',').map((t) => t.trim()).filter(Boolean),
      pinned: false,
      createdAt: now,
      updatedAt: now,
      linkedCourseId: data.courseId || undefined,
      isMeetingNote: false,
    };
    setNotes((prev) => [...(Array.isArray(prev) ? prev : []), newNote]);
    setAddOpen(false);
  };

  const handleEdit = (data: NoteFormData) => {
    if (!editNote) return;
    setNotes((prev) =>
      (Array.isArray(prev) ? prev : []).map((n) =>
        n.id === editNote.id
          ? {
              ...n,
              title: data.title,
              content: data.content,
              tags: data.tags.split(',').map((t) => t.trim()).filter(Boolean),
              linkedCourseId: data.courseId || undefined,
              updatedAt: new Date().toISOString(),
            }
          : n
      )
    );
    setEditNote(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    setNotes((prev) => (Array.isArray(prev) ? prev : []).filter((n) => n.id !== id));
  };

  // Group notes by course for display
  const notesByCourse = useMemo(() => {
    const groups: { course: Course | null; notes: Note[] }[] = [];
    if (filterCourseId !== 'all') {
      const course = courseMap[filterCourseId] ?? null;
      groups.push({ course, notes: filtered });
    } else {
      const seen = new Set<string>();
      for (const note of filtered) {
        const cid = note.linkedCourseId ?? '';
        if (!seen.has(cid)) {
          seen.add(cid);
          const groupNotes = filtered.filter((n) => (n.linkedCourseId ?? '') === cid);
          groups.push({ course: cid ? courseMap[cid] ?? null : null, notes: groupNotes });
        }
      }
    }
    return groups;
  }, [filtered, filterCourseId, courseMap]);

  return (
    <div className="flex flex-col gap-6 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="caesar-btn-ghost flex items-center gap-1.5 text-sm"
          >
            <ChevronLeft size={15} />
            Academic
          </button>
          <div>
            <h1 className="section-title">Class Notes</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {classNotes.length} note{classNotes.length !== 1 ? 's' : ''} across {courses.length} course{courses.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="caesar-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          New Note
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            className="caesar-input w-full pl-9"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="caesar-input sm:w-52"
          value={filterCourseId}
          onChange={(e) => setFilterCourseId(e.target.value)}
        >
          <option value="all">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="caesar-card flex flex-col items-center justify-center py-16 text-center transition-colors duration-300">
          <FileText size={40} className="mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {classNotes.length === 0 ? 'No class notes yet' : 'No notes match your search'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {classNotes.length === 0 ? 'Click "New Note" to add your first class note' : 'Try a different search or filter'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {notesByCourse.map(({ course, notes: groupNotes }) => (
            <div key={course?.id ?? 'uncategorized'} className="flex flex-col gap-3">
              {/* Course header */}
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: course?.color ?? 'var(--text-muted)' }}
                />
                <h2 className="section-title text-sm">
                  {course?.name ?? 'Uncategorized'}
                </h2>
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                  {groupNotes.length} note{groupNotes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    courseColor={course?.color ?? 'var(--text-muted)'}
                    onEdit={() => setEditNote(note)}
                    onDelete={() => handleDelete(note.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Note Modal */}
      <NoteFormModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        courses={courses}
        title="New Class Note"
      />

      {/* Edit Note Modal */}
      {editNote && (
        <NoteFormModal
          isOpen={true}
          onClose={() => setEditNote(null)}
          onSave={handleEdit}
          courses={courses}
          initial={{
            title: editNote.title,
            content: editNote.content,
            courseId: editNote.linkedCourseId ?? '',
            tags: editNote.tags.join(', '),
          }}
          title="Edit Note"
        />
      )}
    </div>
  );
}
