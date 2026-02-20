import React, { useState, useMemo } from 'react';
import {
  Sun,
  Calendar,
  Target,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Zap,
  Heart,
  TrendingUp,
  BookOpen,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, differenceInDays, parseISO, subDays } from 'date-fns';
import type {
  Identity,
  Goal,
  DailyEvent,
  Habit,
  HabitTracker,
  DailyMoodLog,
} from '../../types';
import {
  getGreeting,
  getDailyQuote,
  todayStr,
  generateId,
} from '../../utils';
import { useTheme } from '../../hooks/useTheme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  identity: Identity;
  goals: Goal[];
  dailyEvents: DailyEvent[];
  setDailyEvents: (v: DailyEvent[] | ((p: DailyEvent[]) => DailyEvent[])) => void;
  habits: Habit[];
  habitTracker: HabitTracker[];
  setHabitTracker: (v: HabitTracker[] | ((p: HabitTracker[]) => HabitTracker[])) => void;
  dailyMoodLogs: DailyMoodLog[];
  setDailyMoodLogs: (v: DailyMoodLog[] | ((p: DailyMoodLog[]) => DailyMoodLog[])) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEMESTER_END = '2025-05-01';

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  color: string;
}

function MoodSlider({ label, icon, value, onChange, color }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 caesar-label">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color }}>
          {value}/5
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${((value - 1) / 4) * 100}%, rgba(128,128,128,0.2) ${((value - 1) / 4) * 100}%)`,
        }}
      />
      <div className="flex justify-between text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

// ─── Custom tooltip for energy chart ─────────────────────────────────────────

function EnergyTooltip({
  active,
  payload,
  label,
  tooltipBg,
  tooltipText,
  tooltipBorder,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg border"
      style={{
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        color: tooltipText,
      }}
    >
      <p style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="font-bold" style={{ color: '#00CFFF' }}>Energy: {payload[0].value}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyCommandBrief({
  identity,
  goals,
  dailyEvents,
  setDailyEvents,
  habits,
  habitTracker,
  setHabitTracker,
  dailyMoodLogs,
  setDailyMoodLogs,
}: Props) {
  const { chartColors } = useTheme();

  const today = todayStr();
  const todayDate = new Date();

  // ── Derived values ──────────────────────────────────────────────────────────

  const greeting = getGreeting();
  const dailyQuote = getDailyQuote();

  const daysLeftInSemester = useMemo(() => {
    try {
      const diff = differenceInDays(parseISO(SEMESTER_END), todayDate);
      return Math.max(0, diff);
    } catch {
      return 0;
    }
  }, []);

  const todayFormatted = format(todayDate, 'EEEE, MMMM d, yyyy');

  const topGoals = useMemo(
    () => goals.filter((g) => g.status === 'in-progress').slice(0, 3),
    [goals]
  );

  const todayEvents = useMemo(
    () =>
      dailyEvents
        .filter((e) => e.date === today)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [dailyEvents, today]
  );

  // ── Add Event form state ────────────────────────────────────────────────────

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');

  function handleAddEvent() {
    const title = newEventTitle.trim();
    if (!title) return;
    const event: DailyEvent = {
      id: generateId(),
      date: today,
      title,
      time: newEventTime,
      notes: newEventNotes.trim(),
    };
    setDailyEvents((prev) => [...prev, event]);
    setNewEventTitle('');
    setNewEventTime('');
    setNewEventNotes('');
    setShowAddEvent(false);
  }

  function handleDeleteEvent(id: string) {
    setDailyEvents((prev) => prev.filter((e) => e.id !== id));
  }

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

  const completedHabits = habits.filter(
    (h) => todayHabits.habits[h.id]
  ).length;

  // ── Mood / Energy ───────────────────────────────────────────────────────────

  const todayMoodLog = useMemo(
    () => dailyMoodLogs.find((m) => m.date === today),
    [dailyMoodLogs, today]
  );

  const energyValue: 1 | 2 | 3 | 4 | 5 = todayMoodLog?.energy ?? 3;
  const moodValue: 1 | 2 | 3 | 4 | 5 = todayMoodLog?.mood ?? 3;

  function updateMoodLog(field: 'energy' | 'mood', val: number) {
    const clamped = Math.min(5, Math.max(1, val)) as 1 | 2 | 3 | 4 | 5;
    setDailyMoodLogs((prev) => {
      const existingIdx = prev.findIndex((m) => m.date === today);
      if (existingIdx >= 0) {
        return prev.map((m, i) =>
          i === existingIdx ? { ...m, [field]: clamped } : m
        );
      }
      const newLog: DailyMoodLog = {
        date: today,
        energy: field === 'energy' ? clamped : 3,
        mood: field === 'mood' ? clamped : 3,
        note: '',
      };
      return [...prev, newLog];
    });
  }

  // ── Weekly energy chart data ────────────────────────────────────────────────

  const weeklyEnergyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(todayDate, 6 - i);
      const dateKey = format(d, 'yyyy-MM-dd');
      const log = dailyMoodLogs.find((m) => m.date === dateKey);
      return {
        day: format(d, 'EEE'),
        energy: log?.energy ?? null,
      };
    });
  }, [dailyMoodLogs]);

  // ── Area color mapping ──────────────────────────────────────────────────────

  const areaColors: Record<string, string> = {
    ventures: '#00CFFF',
    academic: '#FFD700',
    health: '#22c55e',
    spiritual: '#a78bfa',
    financial: '#34d399',
    relationships: '#f97316',
    personal: '#e879f9',
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <Sun className="w-6 h-6 text-[#FFD700]" />
        <h1 className="section-title glow-gold">Daily Command Brief</h1>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-3 gap-6">

        {/* ── LEFT COLUMN (2/3) ──────────────────────────────────────────────── */}
        <div className="col-span-2 space-y-5">

          {/* Greeting + date + semester */}
          <div className="caesar-card space-y-2">
            <h2 className="text-2xl font-bold transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
              {greeting},{' '}
              <span className="text-[#FFD700] glow-gold">
                {identity.name.split(' ')[0]}
              </span>
              .
            </h2>
            <div className="flex items-center gap-4 text-sm transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#00CFFF]" />
                {todayFormatted}
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#FFD700]" />
                <span>
                  <span className="text-[#FFD700] font-semibold">
                    {daysLeftInSemester}
                  </span>{' '}
                  days left in semester
                </span>
              </span>
            </div>
          </div>

          {/* Top 3 Goals */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#00CFFF]" />
              <h3 className="text-sm font-semibold text-[#00CFFF] uppercase tracking-wider">
                Top Priorities in Progress
              </h3>
            </div>
            {topGoals.length === 0 ? (
              <p className="text-sm italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                No in-progress goals. Head to Goals to add some.
              </p>
            ) : (
              <ul className="space-y-2">
                {topGoals.map((goal, idx) => (
                  <li key={goal.id} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: areaColors[goal.area] ?? '#00CFFF',
                        color: 'var(--bg)',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug truncate transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
                        {goal.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 rounded-full h-1.5 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${goal.progress}%`,
                              background: areaColors[goal.area] ?? '#00CFFF',
                            }}
                          />
                        </div>
                        <span className="text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                          {goal.progress}%
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Today's Events */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#FFD700]" />
                <h3 className="text-sm font-semibold text-[#FFD700] uppercase tracking-wider">
                  Today's Events
                </h3>
              </div>
              <button
                onClick={() => setShowAddEvent((v) => !v)}
                className="caesar-btn-ghost flex items-center gap-1 text-xs py-1 px-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Event
              </button>
            </div>

            {/* Inline add event form */}
            {showAddEvent && (
              <div
                className="rounded-xl p-4 space-y-3 border border-[#FFD700]/20 transition-colors duration-300"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <p className="text-xs text-[#FFD700] font-semibold uppercase tracking-wider">
                  New Event
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="caesar-label block mb-1">Title</label>
                    <input
                      type="text"
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      placeholder="Event title..."
                      className="caesar-input w-full"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddEvent();
                        if (e.key === 'Escape') setShowAddEvent(false);
                      }}
                    />
                  </div>
                  <div>
                    <label className="caesar-label block mb-1">Time</label>
                    <input
                      type="time"
                      value={newEventTime}
                      onChange={(e) => setNewEventTime(e.target.value)}
                      className="caesar-input w-full"
                    />
                  </div>
                  <div>
                    <label className="caesar-label block mb-1">Notes</label>
                    <input
                      type="text"
                      value={newEventNotes}
                      onChange={(e) => setNewEventNotes(e.target.value)}
                      placeholder="Optional notes..."
                      className="caesar-input w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowAddEvent(false)}
                    className="caesar-btn-ghost text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddEvent}
                    className="caesar-btn-primary text-xs py-1.5 px-3"
                    disabled={!newEventTitle.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Event list */}
            {todayEvents.length === 0 ? (
              <p className="text-sm italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                No events scheduled for today.
              </p>
            ) : (
              <ul className="space-y-2">
                {todayEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 group rounded-lg px-3 py-2 transition-colors duration-300"
                    style={{ backgroundColor: 'var(--bg-elevated)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-[#FFD700] mt-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium transition-colors duration-300" style={{ color: 'var(--text-primary)' }}>
                        {event.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs mt-0.5 transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                        {event.time && (
                          <span className="text-[#FFD700]/70">
                            {event.time}
                          </span>
                        )}
                        {event.notes && <span>{event.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-0.5"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Habit Tracker */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#00CFFF]" />
                <h3 className="text-sm font-semibold text-[#00CFFF] uppercase tracking-wider">
                  Daily Habits
                </h3>
              </div>
              <span className="text-xs transition-colors duration-300" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className={
                    completedHabits === habits.length && habits.length > 0
                      ? 'text-[#00CFFF] font-bold'
                      : 'font-semibold'
                  }
                  style={
                    completedHabits === habits.length && habits.length > 0
                      ? {}
                      : { color: 'var(--text-primary)' }
                  }
                >
                  {completedHabits}
                </span>
                <span className="transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>/{habits.length}</span>
                {' '}habits complete
              </span>
            </div>

            {/* Progress bar */}
            {habits.length > 0 && (
              <div className="w-full rounded-full h-1.5 transition-colors duration-300" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${habits.length > 0 ? (completedHabits / habits.length) * 100 : 0}%`,
                    background:
                      completedHabits === habits.length
                        ? '#FFD700'
                        : '#00CFFF',
                  }}
                />
              </div>
            )}

            {habits.length === 0 ? (
              <p className="text-sm italic transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                No habits configured yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
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
                            ? 'bg-[#00CFFF]/10 border-[#00CFFF]/40'
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
                          <CheckCircle2 className="w-4 h-4 text-[#00CFFF] flex-shrink-0" />
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
              <BookOpen className="w-4 h-4 text-[#FFD700]" />
              <h3 className="text-xs font-semibold text-[#FFD700] uppercase tracking-wider">
                Today's Quote
              </h3>
            </div>
            <blockquote className="border-l-2 border-[#FFD700]/50 pl-3">
              <p className="text-sm leading-relaxed italic transition-colors duration-300" style={{ color: 'var(--text-primary)', opacity: 0.9 }}>
                "{dailyQuote.quote}"
              </p>
              <footer className="mt-2 text-xs transition-colors duration-300" style={{ color: 'var(--text-muted)' }}>
                — {dailyQuote.author}
              </footer>
            </blockquote>
          </div>

          {/* Energy & Mood Check-in */}
          <div className="caesar-card space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-xs font-semibold text-[#00CFFF] uppercase tracking-wider">
                Energy & Mood
              </h3>
            </div>

            <MoodSlider
              label="Energy"
              icon={<Zap className="w-3.5 h-3.5 text-[#FFD700]" />}
              value={energyValue}
              onChange={(v) => updateMoodLog('energy', v)}
              color="#FFD700"
            />

            <MoodSlider
              label="Mood"
              icon={<Heart className="w-3.5 h-3.5 text-[#00CFFF]" />}
              value={moodValue}
              onChange={(v) => updateMoodLog('mood', v)}
              color="#00CFFF"
            />
          </div>

          {/* Weekly Energy Chart */}
          <div className="caesar-card space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#00CFFF]" />
              <h3 className="text-xs font-semibold text-[#00CFFF] uppercase tracking-wider">
                Weekly Energy
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart
                data={weeklyEnergyData}
                margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
              >
                <XAxis
                  dataKey="day"
                  tick={{ fill: chartColors.text, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fill: chartColors.text, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={(props) => (
                    <EnergyTooltip
                      active={props.active}
                      payload={props.payload as { value: number }[] | undefined}
                      label={props.label}
                      tooltipBg={chartColors.tooltipBg}
                      tooltipText={chartColors.tooltipText}
                      tooltipBorder={chartColors.tooltipBorder}
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="energy"
                  stroke="#00CFFF"
                  strokeWidth={2}
                  dot={{ fill: '#00CFFF', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#FFD700', strokeWidth: 0 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

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
  'deep-work': { label: 'Deep Work', color: '#00CFFF', bg: 'rgba(0,207,255,0.12)', dot: '#00CFFF' },
  available:   { label: 'Available', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  dot: '#22c55e' },
  break:       { label: 'On Break',  color: '#FFD700', bg: 'rgba(255,215,0,0.12)',  dot: '#FFD700' },
  out:         { label: 'Out',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  dot: '#ef4444' },
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
