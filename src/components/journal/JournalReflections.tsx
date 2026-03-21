import React, { useState, useMemo } from 'react';
import {
  BookHeart, Plus, Edit3, Trash2, Search, Calendar,
  Smile, Meh, Frown, ThumbsUp, ThumbsDown, Heart,
  Tag, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format, parseISO, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth } from 'date-fns';
import type { JournalEntry, JournalMood, DailyReflection } from '../../types';
import { generateId } from '../../utils';
import { Modal } from '../shared/Modal';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  entries: JournalEntry[];
  setEntries: (v: JournalEntry[] | ((p: JournalEntry[]) => JournalEntry[])) => void;
  reflections: DailyReflection[];
  setReflections: (v: DailyReflection[] | ((p: DailyReflection[]) => DailyReflection[])) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MOODS: { value: JournalMood; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'great', label: 'Great', icon: <ThumbsUp size={16} />, color: '#22c55e' },
  { value: 'good',  label: 'Good',  icon: <Smile size={16} />,    color: '#3b82f6' },
  { value: 'okay',  label: 'Okay',  icon: <Meh size={16} />,      color: '#eab308' },
  { value: 'rough', label: 'Rough', icon: <Frown size={16} />,     color: '#f97316' },
  { value: 'bad',   label: 'Bad',   icon: <ThumbsDown size={16} />,color: '#ef4444' },
];

function emptyEntry(): JournalEntry {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    date: format(new Date(), 'yyyy-MM-dd'),
    title: '',
    body: '',
    mood: undefined,
    gratitude: ['', '', ''],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

type ViewMode = 'list' | 'calendar';

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function JournalReflections({ entries, setEntries, reflections, setReflections }: Props) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JournalEntry>(emptyEntry);
  const [tagInput, setTagInput] = useState('');
  const [calMonth, setCalMonth] = useState(new Date());

  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    return [...entries]
      .filter(e => e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, search]);

  const streakDays = useMemo(() => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      if (entries.some(e => e.date === d)) streak++;
      else break;
    }
    return streak;
  }, [entries]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyEntry());
    setTagInput('');
    setModalOpen(true);
  };

  const openEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setDraft({ ...entry, gratitude: [...(entry.gratitude.length >= 3 ? entry.gratitude : [...entry.gratitude, '', '', ''].slice(0, 3))] });
    setTagInput('');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!draft.title.trim() && !draft.body.trim()) return;
    const now = new Date().toISOString();
    const cleaned = {
      ...draft,
      title: draft.title.trim() || format(parseISO(draft.date), 'MMMM d, yyyy'),
      gratitude: draft.gratitude.filter(g => g.trim()),
      updatedAt: now,
    };
    if (editingId) {
      setEntries(prev => prev.map(e => e.id === editingId ? cleaned : e));
    } else {
      setEntries(prev => [...prev, cleaned]);
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !draft.tags.includes(t)) {
      setDraft(d => ({ ...d, tags: [...d.tags, t] }));
      setTagInput('');
    }
  };

  // Calendar data
  const calDays = useMemo(() => {
    const start = startOfMonth(calMonth);
    const end = endOfMonth(calMonth);
    return eachDayOfInterval({ start, end });
  }, [calMonth]);

  const entryDateSet = useMemo(() => new Set(entries.map(e => e.date)), [entries]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="caesar-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            <BookHeart size={18} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Entries</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{entries.length}</p>
          </div>
        </div>
        <div className="caesar-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: '#f97316' }}>
            <Calendar size={18} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Current Streak</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{streakDays} day{streakDays !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="caesar-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)', color: '#ec4899' }}>
            <Heart size={18} />
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Gratitude Items</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{entries.reduce((s, e) => s + e.gratitude.length, 0)}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search journal..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          {(['list', 'calendar'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === v ? 'var(--bg-card)' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {v === 'list' ? 'List' : 'Calendar'}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className="caesar-btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={14} /> New Entry
        </button>
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <div className="caesar-card p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{format(calMonth, 'MMMM yyyy')}</p>
            <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] sm:text-xs font-medium py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
            ))}
            {/* Offset for first day */}
            {Array.from({ length: calDays[0]?.getDay() ?? 0 }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const hasEntry = entryDateSet.has(dateStr);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    const existing = entries.find(e => e.date === dateStr);
                    if (existing) openEdit(existing);
                    else { setEditingId(null); setDraft({ ...emptyEntry(), date: dateStr }); setModalOpen(true); }
                  }}
                  className="aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors relative"
                  style={{
                    backgroundColor: hasEntry ? 'var(--bg-elevated)' : 'transparent',
                    color: isToday ? '#6366f1' : 'var(--text-primary)',
                    border: isToday ? '1px solid #6366f1' : '1px solid transparent',
                  }}
                >
                  {day.getDate()}
                  {hasEntry && (
                    <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        sorted.length === 0 ? (
          <div className="caesar-card p-12 text-center">
            <BookHeart size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No journal entries yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Start journaling to track your thoughts, gratitude, and reflections.</p>
            <button onClick={openCreate} className="caesar-btn-ghost text-xs mt-4 flex items-center gap-1 mx-auto">
              <Plus size={12} /> Write your first entry
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(entry => {
              const moodMeta = MOODS.find(m => m.value === entry.mood);
              return (
                <div key={entry.id} className="caesar-card p-4 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer" onClick={() => openEdit(entry)}>
                  <div className="flex items-start gap-3">
                    {/* Mood indicator */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)', color: moodMeta?.color ?? 'var(--text-muted)' }}>
                      {moodMeta?.icon ?? <BookHeart size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{entry.title}</p>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {format(parseISO(entry.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {entry.body && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{entry.body}</p>
                      )}
                      {entry.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {entry.tags.map(t => (
                            <span key={t} className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] flex-shrink-0"
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Entry' : 'New Journal Entry'}>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Title</label>
              <input
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder={format(parseISO(draft.date), 'MMMM d, yyyy')}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Date</label>
              <input
                type="date"
                value={draft.date}
                onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
                className="mt-1 px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          {/* Mood */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>How are you feeling?</label>
            <div className="flex gap-2 mt-2">
              {MOODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setDraft(d => ({ ...d, mood: d.mood === m.value ? undefined : m.value }))}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors flex-1"
                  style={{
                    backgroundColor: draft.mood === m.value ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${draft.mood === m.value ? m.color : 'var(--border)'}`,
                    color: draft.mood === m.value ? m.color : 'var(--text-muted)',
                  }}
                >
                  {m.icon}
                  <span className="text-xs">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Journal</label>
            <textarea
              value={draft.body}
              onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
              placeholder="What's on your mind today?"
              rows={6}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Gratitude */}
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Gratitude (3 things)</label>
            <div className="space-y-2 mt-2">
              {draft.gratitude.map((g, i) => (
                <input
                  key={i}
                  value={g}
                  onChange={e => {
                    const next = [...draft.gratitude];
                    next[i] = e.target.value;
                    setDraft(d => ({ ...d, gratitude: next }));
                  }}
                  placeholder={`${i + 1}. I'm grateful for...`}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
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
              disabled={!draft.title.trim() && !draft.body.trim()}
              className="caesar-btn-primary flex-1 py-2 text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {editingId ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
