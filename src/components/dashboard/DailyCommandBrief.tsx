import React, { useState, useMemo } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import {
  Sun,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  BookOpen,
  FileText,
  ListTodo,
  Check,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  Identity,
  TimeBlock,
  TimeCategory,
  Habit,
  HabitTracker,
  Note,
  TodoItem,
  MorningBriefing,
} from '../../types';
import {
  getGreeting,
  getDailyQuote,
  todayStr,
  generateId,
} from '../../utils';
import MorningBriefingCard from './MorningBriefingCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  identity: Identity;
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  onNavigateToCalendar?: () => void;
  habits: Habit[];
  habitTracker: HabitTracker[];
  setHabitTracker: (v: HabitTracker[] | ((p: HabitTracker[]) => HabitTracker[])) => void;
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  todos: TodoItem[];
  setTodos: (v: TodoItem[] | ((p: TodoItem[]) => TodoItem[])) => void;
  morningBriefing?: MorningBriefing | null;
  onRefreshBriefing?: (newBriefing: MorningBriefing) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuickAddNotePanel({ onAddNote }: { onAddNote: (note: Note) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!content.trim() && !title.trim()) return;
    const now = new Date().toISOString();
    onAddNote({
      id: generateId(),
      title: title.trim() || format(new Date(), 'MMM d, h:mm a'),
      content: content.trim(),
      tags: [],
      pinned: false,
      createdAt: now,
      updatedAt: now,
      isMeetingNote: false,
    });
    setTitle('');
    setContent('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="caesar-card space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-[var(--text-muted)]" />
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Quick Note
        </h3>
      </div>
      <input
        type="text"
        className="caesar-input w-full text-xs"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="caesar-input w-full text-xs resize-none"
        rows={3}
        placeholder="Capture a thought... (⌘+Enter to save)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
        }}
      />
      <button
        onClick={handleSave}
        disabled={!content.trim() && !title.trim()}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: saved ? 'var(--text-secondary)' : 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
      >
        {saved ? <><Check className="w-3 h-3" /> Saved to Notes</> : 'Save Note'}
      </button>
    </div>
  );
}

function TodoSummaryPanel({
  todos,
  onComplete,
  onAdd,
}: {
  todos: TodoItem[];
  onComplete: (id: string) => void;
  onAdd: (title: string, priority: 'high' | 'medium' | 'low') => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), newPriority);
    setNewTitle('');
    setNewPriority('medium');
    setShowAdd(false);
  };

  const incomplete = todos.filter((t) => t.status !== 'done');
  const high = incomplete.filter((t) => t.priority === 'high');
  const medium = incomplete.filter((t) => t.priority === 'medium');
  const low = incomplete.filter((t) => t.priority === 'low');

  const groups = [
    { label: 'High', items: high, color: 'var(--priority-high)' },
    { label: 'Medium', items: medium, color: 'var(--priority-medium)' },
    { label: 'Low', items: low, color: 'var(--priority-low)' },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="caesar-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-[var(--text-muted)]" />
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Todo Summary
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {incomplete.length} remaining
          </span>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 text-xs py-0.5 px-1.5 rounded transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Add todo"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-lg p-3 space-y-2 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
          <input
            type="text"
            className="caesar-input w-full text-xs"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setShowAdd(false);
            }}
          />
          <div className="flex gap-2">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setNewPriority(p)}
                className="flex-1 py-1 rounded text-xs font-medium capitalize transition-colors"
                style={{
                  backgroundColor: newPriority === p ? `var(--priority-${p})` : 'var(--bg-card)',
                  color: newPriority === p ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${newPriority === p ? `var(--priority-${p})` : 'var(--border)'}`,
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="caesar-btn-ghost text-xs py-1 px-2">Cancel</button>
            <button onClick={handleAdd} disabled={!newTitle.trim()} className="caesar-btn-primary text-xs py-1 px-2">Add</button>
          </div>
        </div>
      )}

      {incomplete.length === 0 && !showAdd ? (
        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
          All caught up!
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(({ label, items, color }) => (
            <div key={label}>
              <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {label}
              </p>
              <ul className="space-y-1">
                {items.slice(0, 3).map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5 group">
                    <button
                      onClick={() => onComplete(t.id)}
                      className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors hover:border-[var(--text-secondary)]"
                      style={{ borderColor: 'var(--border)' }}
                      title="Mark done"
                    >
                      <Check className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <span className="text-xs truncate" style={{ color }}>{t.title}</span>
                  </li>
                ))}
                {items.length > 3 && (
                  <li className="text-xs pl-5" style={{ color: 'var(--text-muted)' }}>
                    +{items.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyCommandBrief({
  identity,
  timeBlocks,
  timeCategories,
  onNavigateToCalendar,
  habits,
  habitTracker,
  setHabitTracker,
  notes: _notes,
  setNotes,
  todos,
  setTodos,
  morningBriefing,
  onRefreshBriefing,
}: Props) {

  const today = todayStr();
  const todayDate = new Date();

  const greeting = getGreeting();
  const dailyQuote = getDailyQuote();
  const todayFormatted = format(todayDate, 'EEEE, MMMM d, yyyy');

  // Current time as HH:MM for "now" indicator
  const nowStr = useMemo(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  // Today's time blocks sorted by start time
  const todayBlocks = useMemo(
    () =>
      timeBlocks
        .filter((b) => b.date === today)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [timeBlocks, today]
  );

  // ── Habit tracker ───────────────────────────────────────────────────────────

  const todayHabits = useMemo(() => {
    const existing = habitTracker.find((h) => h.date === today);
    if (existing) return existing;
    return { date: today, habits: {} };
  }, [habitTracker, today]);

  function toggleHabit(habitId: string) {
    setHabitTracker((prev) => {
      const existingIdx = prev.findIndex((h) => h.date === today);
      const current = prev[existingIdx] ?? { date: today, habits: {} };
      const updated: HabitTracker = {
        ...current,
        habits: {
          ...current.habits,
          [habitId]: !current.habits[habitId],
        },
      };
      if (existingIdx >= 0) {
        return prev.map((h, i) => (i === existingIdx ? updated : h));
      }
      return [...prev, updated];
    });
  }

  const completedHabits = habits.filter((h) => todayHabits.habits[h.id]).length;
  const animatedHabits = useCountUp(completedHabits);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Sun className="w-6 h-6 text-[var(--text-muted)]" />
        <h1 className="section-title">Daily Command Brief</h1>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN (2/3) ──────────────────────────────────────────────── */}
        <div className="col-span-1 md:col-span-2 space-y-5">

          {/* Greeting + date */}
          <div className="caesar-card space-y-2">
            <h2 className="text-2xl font-bold transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
              {greeting},{' '}
              <span className="text-[var(--text-muted)]">
                {identity.name.split(' ')[0]}
              </span>
              .
            </h2>
            <div className="flex items-center gap-4 text-sm transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                {todayFormatted}
              </span>
            </div>
          </div>

          {/* AI Morning Briefing */}
          <MorningBriefingCard
            briefing={morningBriefing ?? null}
            onRefresh={onRefreshBriefing ?? (() => {})}
          />

          {/* Today's Schedule — interactive snapshot */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Today's Schedule
                </h3>
              </div>
              {onNavigateToCalendar && (
                <button
                  onClick={onNavigateToCalendar}
                  className="caesar-btn-ghost flex items-center gap-1.5 text-xs py-1 px-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open Calendar
                </button>
              )}
            </div>

            {todayBlocks.length === 0 ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
                  Nothing scheduled for today.
                </p>
                {onNavigateToCalendar && (
                  <button
                    onClick={onNavigateToCalendar}
                    className="text-xs underline underline-offset-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Add blocks in Calendar →
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {todayBlocks.map((block) => {
                  const cat = timeCategories.find((c) => c.id === block.categoryId);
                  const color = cat?.color ?? 'var(--text-muted)';
                  const isNow = nowStr >= block.startTime && nowStr < block.endTime;
                  const isPast = block.endTime <= nowStr;

                  return (
                    <li
                      key={block.id}
                      onClick={onNavigateToCalendar}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150"
                      style={{
                        backgroundColor: isNow ? `${color}18` : 'var(--bg-elevated)',
                        border: `1px solid ${isNow ? color + '50' : 'transparent'}`,
                        cursor: onNavigateToCalendar ? 'pointer' : 'default',
                        opacity: isPast && !isNow ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!onNavigateToCalendar) return;
                        e.currentTarget.style.backgroundColor = isNow ? `${color}28` : 'var(--bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isNow ? `${color}18` : 'var(--bg-elevated)';
                      }}
                    >
                      {/* Category color bar */}
                      <div
                        className="w-1 rounded-full flex-shrink-0 self-stretch min-h-[2rem]"
                        style={{ backgroundColor: color }}
                      />

                      {/* Block info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {block.title || cat?.name || 'Untitled'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatTime(block.startTime)} – {formatTime(block.endTime)}
                        </p>
                      </div>

                      {/* Now badge */}
                      {isNow && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{
                            backgroundColor: `${color}25`,
                            color,
                          }}
                        >
                          Now
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Daily Habits */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Daily Habits
                </h3>
              </div>
              <span className="text-xs transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className={
                    completedHabits === habits.length && habits.length > 0
                      ? 'text-[var(--text-muted)] font-bold'
                      : 'font-semibold'
                  }
                  style={
                    completedHabits === habits.length && habits.length > 0
                      ? {}
                      : { color: 'var(--text-primary)' }
                  }
                >
                  {animatedHabits}
                </span>
                <span className="transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>/{habits.length}</span>
                {' '}habits complete
              </span>
            </div>

            {habits.length > 0 && (
              <div className="w-full rounded-full h-1.5 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className={`h-1.5 rounded-full transition-all duration-500${completedHabits > 0 && completedHabits < habits.length ? ' progress-shimmer' : ''}`}
                  style={{
                    width: `${habits.length > 0 ? (completedHabits / habits.length) * 100 : 0}%`,
                    background:
                      completedHabits === habits.length
                        ? 'linear-gradient(90deg, var(--text-secondary), var(--text-muted), var(--text-secondary))'
                        : 'linear-gradient(90deg, var(--text-muted), var(--border-strong), var(--text-muted))',
                  }}
                />
              </div>
            )}

            {habits.length === 0 ? (
              <p className="text-sm italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                No habits configured yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {habits
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((habit) => {
                    const done = !!todayHabits.habits[habit.id];
                    return (
                      <button
                        key={habit.id}
                        onClick={() => toggleHabit(habit.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          done
                            ? 'border-[var(--border)]'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                        style={
                          done
                            ? { color: 'var(--text-primary)' }
                            : { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' }
                        }
                      >
                        <span className="text-lg leading-none">{habit.icon}</span>
                        <span className="flex-1 text-sm font-medium truncate">
                          {habit.name}
                        </span>
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 flex-shrink-0 opacity-30" />
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (1/3) ──────────────────────────────────────────────── */}
        <div className="col-span-1 space-y-5">

          {/* Daily Quote */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Today's Quote
              </h3>
            </div>
            <blockquote className="border-l-2 border-[var(--text-muted)]/50 pl-3">
              <p className="text-sm leading-relaxed italic transition-colors duration-300" style={{ color: 'var(--text-primary)', opacity: 0.9 }}>
                "{dailyQuote.quote}"
              </p>
              <footer className="mt-2 text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                — {dailyQuote.author}
              </footer>
            </blockquote>
          </div>

          {/* Quick Note */}
          <QuickAddNotePanel onAddNote={(note) => setNotes((prev) => [note, ...prev])} />

          {/* Todo Summary */}
          <TodoSummaryPanel
            todos={todos}
            onComplete={(id) => setTodos((prev) => prev.map((t) => t.id === id ? { ...t, status: 'done' } : t))}
            onAdd={(title, priority) => setTodos((prev) => [{
              id: generateId(),
              title,
              notes: '',
              status: 'todo',
              priority,
              createdAt: new Date().toISOString(),
              checklist: [],
            }, ...prev])}
          />

          {/* Quick Status */}
          <div className="caesar-card space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
              Current Status
            </h3>
            <StatusPill status={identity.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  'deep-work': { label: 'Deep Work', color: 'var(--text-muted)', bg: 'var(--bg-elevated)', dot: 'var(--text-muted)' },
  available:   { label: 'Available', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)',  dot: 'var(--text-secondary)' },
  break:       { label: 'On Break',  color: 'var(--text-muted)', bg: 'var(--bg-elevated)',  dot: 'var(--text-muted)' },
  out:         { label: 'Out',       color: 'var(--text-secondary)', bg: 'var(--bg-elevated)',  dot: 'var(--text-secondary)' },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.available;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-full w-fit"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}
    >
      <span
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ background: cfg.dot }}
      />
      <span className="text-sm font-semibold" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}
