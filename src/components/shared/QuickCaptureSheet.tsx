import React, { useState, useEffect } from 'react';
import { X, Clock, CheckSquare, FileText, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type {
  TimeBlock, TimeCategory, TodoItem, Note,
  Contact, DailyEvent,
} from '../../types';
import { generateId, todayStr } from '../../utils';
import { TimeSelect } from './TimeSelect';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  timeCategories: TimeCategory[];
  contacts: Contact[];
  onAddTimeBlock: (b: TimeBlock) => void;
  onAddTodo: (t: TodoItem) => void;
  onAddNote: (n: Note) => void;
  onAddContact: (c: Contact) => void;
  onAddEvent: (e: DailyEvent) => void;
}

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────

type Tab = 'time' | 'todo' | 'note' | 'contact' | 'event';

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'time',    label: 'Time',    Icon: Clock },
  { id: 'todo',    label: 'Todo',    Icon: CheckSquare },
  { id: 'note',    label: 'Note',    Icon: FileText },
  { id: 'contact', label: 'Contact', Icon: User },
  { id: 'event',   label: 'Event',   Icon: Calendar },
];

// ─── DEFAULT TIMES ────────────────────────────────────────────────────────────

function nowRounded(): string {
  const now = new Date();
  const m = Math.round(now.getMinutes() / 15) * 15;
  const h = m === 60 ? now.getHours() + 1 : now.getHours();
  return `${String(h % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function oneHourLater(start: string): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ─── SHARED BUTTON STYLES ────────────────────────────────────────────────────

const priorityColors: Record<string, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#ef4444',
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function QuickCaptureSheet({
  isOpen, onClose, timeCategories, onAddTimeBlock,
  onAddTodo, onAddNote, onAddContact, onAddEvent,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('time');
  const today = todayStr();

  // ── Time form ──────────────────────────────────────────────────────────────
  const defaultStart = nowRounded();
  const [timeForm, setTimeForm] = useState({
    categoryId: timeCategories[0]?.id ?? '',
    title: '',
    startTime: defaultStart,
    endTime: oneHourLater(defaultStart),
  });

  // ── Todo form ──────────────────────────────────────────────────────────────
  const [todoForm, setTodoForm] = useState({
    title: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  });

  // ── Note form ──────────────────────────────────────────────────────────────
  const [noteForm, setNoteForm] = useState({ title: '', content: '' });

  // ── Contact form ───────────────────────────────────────────────────────────
  const [contactForm, setContactForm] = useState({ name: '', relationship: '' });

  // ── Event form ─────────────────────────────────────────────────────────────
  const [eventForm, setEventForm] = useState({ title: '', date: today, time: defaultStart });

  // Reset forms when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    const start = nowRounded();
    setTimeForm({ categoryId: timeCategories[0]?.id ?? '', title: '', startTime: start, endTime: oneHourLater(start) });
    setTodoForm({ title: '', priority: 'medium' });
    setNoteForm({ title: '', content: '' });
    setContactForm({ name: '', relationship: '' });
    setEventForm({ title: '', date: today, time: start });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Save handlers ──────────────────────────────────────────────────────────

  const handleSaveTime = () => {
    if (!timeForm.categoryId) return;
    onAddTimeBlock({
      id: generateId(), date: today,
      categoryId: timeForm.categoryId,
      title: timeForm.title.trim() || undefined,
      startTime: timeForm.startTime,
      endTime: timeForm.endTime,
      notes: '', energy: 3,
    });
    onClose();
  };

  const handleSaveTodo = () => {
    if (!todoForm.title.trim()) return;
    onAddTodo({
      id: generateId(), title: todoForm.title.trim(),
      notes: '', status: 'todo', priority: todoForm.priority,
      createdAt: new Date().toISOString(),
      checklist: [],
    });
    onClose();
  };

  const handleSaveNote = () => {
    if (!noteForm.content.trim() && !noteForm.title.trim()) return;
    const now = new Date().toISOString();
    onAddNote({
      id: generateId(),
      title: noteForm.title.trim() || format(new Date(), 'MMM d, h:mm a'),
      content: noteForm.content.trim(),
      tags: [], pinned: false,
      createdAt: now, updatedAt: now,
      isMeetingNote: false,
    });
    onClose();
  };

  const handleSaveContact = () => {
    if (!contactForm.name.trim()) return;
    onAddContact({
      id: generateId(), name: contactForm.name.trim(),
      relationship: contactForm.relationship.trim(),
      tags: [], lastContacted: today,
      followUpNeeded: false, notes: '',
      interactions: [], linkedProjects: [],
    });
    onClose();
  };

  const handleSaveEvent = () => {
    if (!eventForm.title.trim()) return;
    onAddEvent({
      id: generateId(), date: eventForm.date,
      title: eventForm.title.trim(),
      time: eventForm.time, notes: '',
    });
    onClose();
  };

  const handleSave = () => {
    if (activeTab === 'time')    handleSaveTime();
    else if (activeTab === 'todo')    handleSaveTodo();
    else if (activeTab === 'note')    handleSaveNote();
    else if (activeTab === 'contact') handleSaveContact();
    else if (activeTab === 'event')   handleSaveEvent();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[59]"
        style={{ backgroundColor: 'rgba(5,8,15,0.6)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          maxHeight: '75vh',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-strong)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Quick Capture
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex border-b flex-shrink-0 px-2"
          style={{ borderColor: 'var(--border)' }}
        >
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors"
              style={{
                color: activeTab === id ? '#6366f1' : 'var(--text-muted)',
                borderBottom: activeTab === id ? '2px solid #6366f1' : '2px solid transparent',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Form area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* ── TIME ── */}
          {activeTab === 'time' && (
            <>
              {timeCategories.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
                  Add a calendar category in Time Tracker first.
                </p>
              ) : (
                <>
                  <div>
                    <label className="caesar-label">Calendar</label>
                    <select
                      className="caesar-input w-full"
                      value={timeForm.categoryId}
                      onChange={e => setTimeForm(f => ({ ...f, categoryId: e.target.value }))}
                    >
                      {timeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="caesar-label">Title (optional)</label>
                    <input
                      className="caesar-input w-full"
                      placeholder="e.g. Deep work, Meeting…"
                      value={timeForm.title}
                      onChange={e => setTimeForm(f => ({ ...f, title: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="caesar-label">Start</label>
                      <TimeSelect value={timeForm.startTime} onChange={v => setTimeForm(f => ({ ...f, startTime: v }))} />
                    </div>
                    <div>
                      <label className="caesar-label">End</label>
                      <TimeSelect value={timeForm.endTime} onChange={v => setTimeForm(f => ({ ...f, endTime: v }))} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── TODO ── */}
          {activeTab === 'todo' && (
            <>
              <div>
                <label className="caesar-label">Task</label>
                <input
                  className="caesar-input w-full"
                  placeholder="What needs to be done?"
                  value={todoForm.title}
                  onChange={e => setTodoForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveTodo()}
                />
              </div>
              <div>
                <label className="caesar-label">Priority</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setTodoForm(f => ({ ...f, priority: p }))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize"
                      style={{
                        borderColor: todoForm.priority === p ? priorityColors[p] : 'var(--border)',
                        backgroundColor: todoForm.priority === p ? `${priorityColors[p]}18` : 'transparent',
                        color: todoForm.priority === p ? priorityColors[p] : 'var(--text-muted)',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── NOTE ── */}
          {activeTab === 'note' && (
            <>
              <div>
                <label className="caesar-label">Title (optional)</label>
                <input
                  className="caesar-input w-full"
                  placeholder="Note title…"
                  value={noteForm.title}
                  onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="caesar-label">Content</label>
                <textarea
                  className="caesar-input w-full resize-none"
                  rows={5}
                  placeholder="Start typing…"
                  value={noteForm.content}
                  onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* ── CONTACT ── */}
          {activeTab === 'contact' && (
            <>
              <div>
                <label className="caesar-label">Name</label>
                <input
                  className="caesar-input w-full"
                  placeholder="Full name"
                  value={contactForm.name}
                  onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveContact()}
                />
              </div>
              <div>
                <label className="caesar-label">Relationship (optional)</label>
                <input
                  className="caesar-input w-full"
                  placeholder="e.g. Investor, Colleague, Friend…"
                  value={contactForm.relationship}
                  onChange={e => setContactForm(f => ({ ...f, relationship: e.target.value }))}
                />
              </div>
            </>
          )}

          {/* ── EVENT ── */}
          {activeTab === 'event' && (
            <>
              <div>
                <label className="caesar-label">Event</label>
                <input
                  className="caesar-input w-full"
                  placeholder="What's happening?"
                  value={eventForm.title}
                  onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveEvent()}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="caesar-label">Date</label>
                  <input
                    type="date"
                    className="caesar-input w-full"
                    value={eventForm.date}
                    onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="caesar-label">Time</label>
                  <TimeSelect value={eventForm.time} onChange={v => setEventForm(f => ({ ...f, time: v }))} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Save button */}
        <div
          className="px-4 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={handleSave}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity active:opacity-80"
            style={{ backgroundColor: '#6366f1', color: '#fff' }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}
