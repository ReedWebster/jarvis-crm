import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Clock,
  Zap,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import type { TimeBlock, TimeCategory } from '../../types';
import {
  generateId,
  todayStr,
  calcDurationHours,
  aggregateTimeByCategory,
  getCategoryColor,
  getCategoryName,
  formatTime,
} from '../../utils';
import { Modal } from '../shared/Modal';
import { useTheme } from '../../hooks/useTheme';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Props {
  timeBlocks: TimeBlock[];
  setTimeBlocks: (v: TimeBlock[] | ((p: TimeBlock[]) => TimeBlock[])) => void;
  timeCategories: TimeCategory[];
  setTimeCategories: (v: TimeCategory[] | ((p: TimeCategory[]) => TimeCategory[])) => void;
}

interface LogFormState {
  date: string;
  categoryId: string;
  startTime: string;
  endTime: string;
  notes: string;
  energy: 1 | 2 | 3 | 4 | 5;
}

interface CategoryFormState {
  name: string;
  color: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// Priority categories that count toward the "Focus Score"
const PRIORITY_CATEGORY_IDS = ['cat-rca', 'cat-vanta', 'cat-aibs'];

const ENERGY_EMOJIS: Record<number, string> = {
  1: '😴',
  2: '😐',
  3: '🙂',
  4: '😊',
  5: '🔥',
};

const ENERGY_LABELS: Record<number, string> = {
  1: 'Exhausted',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Peak',
};

const DEFAULT_COLORS = ['#111111','#222222','#333333','#444444','#555555','#666666','#777777','#888888'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getDayBlocks(blocks: TimeBlock[], date: string): TimeBlock[] {
  return blocks.filter((b) => b.date === date);
}

function getTotalHours(blocks: TimeBlock[]): number {
  return blocks.reduce((sum, b) => sum + calcDurationHours(b.startTime, b.endTime), 0);
}

function roundHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function getWeekDays(referenceDate: Date): Date[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function calcFocusScore(blocks: TimeBlock[], categories: TimeCategory[]): number {
  if (blocks.length === 0) return 0;
  const total = getTotalHours(blocks);
  if (total === 0) return 0;

  // Find categories whose IDs match priority IDs OR whose names match known ventures
  const priorityCatIds = categories
    .filter(
      (c) =>
        PRIORITY_CATEGORY_IDS.includes(c.id) ||
        ['rca', 'vanta', 'aibs'].some((key) => c.name.toLowerCase().includes(key))
    )
    .map((c) => c.id);

  const priorityHours = blocks
    .filter((b) => priorityCatIds.includes(b.categoryId))
    .reduce((sum, b) => sum + calcDurationHours(b.startTime, b.endTime), 0);

  return Math.round((priorityHours / total) * 100);
}

function calcEnergyAvg(blocks: TimeBlock[]): number {
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, b) => sum + b.energy, 0) / blocks.length;
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

// Custom Donut Tooltip
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, hours, color } = payload[0].payload;
  const total = payload[0].payload.total;
  const pct = total > 0 ? Math.round((hours / total) * 100) : 0;
  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs shadow-lg transition-colors duration-300"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: `${color}50`,
        color: 'var(--text-primary)',
      }}
    >
      <p className="font-semibold" style={{ color }}>
        {name}
      </p>
      <p style={{ color: 'var(--text-secondary)' }}>
        {roundHours(hours)} · {pct}%
      </p>
    </div>
  );
}

// Energy radio button
function EnergyPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="flex gap-2">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-xs ${
            value === n
              ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'text-gray-500 hover:border-gray-500'
          }`}
          style={value !== n ? { borderColor: 'var(--border)' } : undefined}
        >
          <span className="text-base">{ENERGY_EMOJIS[n]}</span>
          <span>{ENERGY_LABELS[n]}</span>
        </button>
      ))}
    </div>
  );
}

// Weekly column day cell
interface DayColumnProps {
  day: Date;
  blocks: TimeBlock[];
  categories: TimeCategory[];
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
}

function DayColumn({ day, blocks, categories, isSelected, isToday, onClick }: DayColumnProps) {
  const totalHours = getTotalHours(blocks);
  const MAX_DISPLAY_HOURS = 10;
  const maxHeight = 120;

  // Build segments from blocks
  const segments = blocks.map((b) => {
    const h = calcDurationHours(b.startTime, b.endTime);
    const proportion = Math.min(h / MAX_DISPLAY_HOURS, 1);
    return {
      height: Math.max(proportion * maxHeight, 3),
      color: getCategoryColor(b.categoryId, categories),
      id: b.id,
    };
  });

  // Scale if total exceeds max
  const rawTotal = segments.reduce((s, seg) => s + seg.height, 0);
  const scale = rawTotal > maxHeight ? maxHeight / rawTotal : 1;
  const scaled = segments.map((s) => ({ ...s, height: s.height * scale }));

  const dayLabel = format(day, 'EEE');
  const dateLabel = format(day, 'd');

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 flex-1 rounded-xl p-2 transition-all border ${
        isSelected
          ? 'border-[var(--border)] bg-[var(--bg-elevated)]'
          : isToday
          ? 'border-[var(--border)] bg-[var(--bg-elevated)]'
          : 'border-transparent'
      }`}
      style={!isSelected && !isToday ? { borderColor: 'transparent' } : undefined}
      onMouseEnter={(e) => {
        if (!isSelected && !isToday) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isToday) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
        }
      }}
    >
      <span
        className="text-xs font-medium"
        style={{ color: isToday ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      >
        {dayLabel}
      </span>
      <span
        className="text-sm font-bold"
        style={{
          color: isSelected ? 'var(--text-primary)' : isToday ? 'var(--text-secondary)' : 'var(--text-secondary)',
        }}
      >
        {dateLabel}
      </span>

      {/* Stacked bar */}
      <div
        className="w-full rounded overflow-hidden flex flex-col-reverse gap-px transition-colors duration-300"
        style={{ height: `${maxHeight}px`, backgroundColor: 'var(--bg-elevated)' }}
      >
        {scaled.map((seg, i) => (
          <div
            key={i}
            style={{ height: `${seg.height}px`, backgroundColor: seg.color, opacity: 0.85 }}
          />
        ))}
      </div>

      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {totalHours > 0 ? roundHours(Math.round(totalHours * 10) / 10) : '—'}
      </span>
    </button>
  );
}

// Time block card
interface BlockCardProps {
  block: TimeBlock;
  categories: TimeCategory[];
  onDelete: (id: string) => void;
}

function BlockCard({ block, categories, onDelete }: BlockCardProps) {
  const color = getCategoryColor(block.categoryId, categories);
  const name = getCategoryName(block.categoryId, categories);
  const duration = calcDurationHours(block.startTime, block.endTime);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border group transition-colors duration-300"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-card)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
      }}
    >
      {/* Color dot */}
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color }}>
            {name}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatTime(block.startTime)} – {formatTime(block.endTime)}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ({roundHours(duration)})
          </span>
        </div>
        {block.notes && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {block.notes}
          </p>
        )}
      </div>

      {/* Energy */}
      <span className="text-base" title={ENERGY_LABELS[block.energy]}>
        {ENERGY_EMOJIS[block.energy]}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(block.id)}
        className="hover:text-[var(--text-secondary)] transition-colors opacity-0 group-hover:opacity-100 p-1"
        style={{ color: 'var(--text-muted)' }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Mood trend line chart tooltip
function MoodTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div
      className="px-2 py-1.5 rounded-lg border text-xs shadow-lg transition-colors duration-300"
      style={{
        borderColor: 'var(--border-strong)',
        backgroundColor: 'var(--bg-card)',
      }}
    >
      <p style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className=" font-semibold">
        {ENERGY_EMOJIS[Math.round(val)]} {val.toFixed(1)}
      </p>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function TimeTracker({
  timeBlocks,
  setTimeBlocks,
  timeCategories,
  setTimeCategories,
}: Props) {
  const today = todayStr();
  const { chartColors } = useTheme();

  // ── State ──
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logForm, setLogForm] = useState<LogFormState>({
    date: today,
    categoryId: timeCategories[0]?.id ?? '',
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
    energy: 3,
  });
  const [catForm, setCatForm] = useState<CategoryFormState>({ name: '', color: '#555555' });

  // ── Week Days ──
  const weekDays = useMemo(() => {
    const ref = addDays(new Date(), weekOffset * 7);
    return getWeekDays(ref);
  }, [weekOffset]);

  // ── Derived ──
  const todayBlocks = useMemo(() => getDayBlocks(timeBlocks, today), [timeBlocks, today]);
  const selectedBlocks = useMemo(
    () => getDayBlocks(timeBlocks, selectedDay),
    [timeBlocks, selectedDay]
  );
  const totalHoursToday = useMemo(() => getTotalHours(todayBlocks), [todayBlocks]);
  const focusScore = useMemo(
    () => calcFocusScore(todayBlocks, timeCategories),
    [todayBlocks, timeCategories]
  );

  // Donut chart data for today
  const donutData = useMemo(() => {
    const agg = aggregateTimeByCategory(todayBlocks, timeCategories);
    const total = agg.reduce((s, a) => s + a.hours, 0);
    return agg.map((a) => ({ ...a, total }));
  }, [todayBlocks, timeCategories]);

  // Weekly totals (for sidebar)
  const weeklyBlocks = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    return timeBlocks.filter((b) => b.date >= startStr && b.date <= endStr);
  }, [timeBlocks, weekDays]);

  const weeklyTotals = useMemo(
    () => aggregateTimeByCategory(weeklyBlocks, timeCategories),
    [weeklyBlocks, timeCategories]
  );

  const maxWeeklyHours = useMemo(
    () => (weeklyTotals.length > 0 ? weeklyTotals[0].hours : 1),
    [weeklyTotals]
  );

  // Mood trend: last 7 days
  const moodTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = format(addDays(new Date(), i - 6), 'yyyy-MM-dd');
      const dayBlocks = getDayBlocks(timeBlocks, d);
      const avg = calcEnergyAvg(dayBlocks);
      return { day: format(parseISO(d), 'EEE'), avg: avg > 0 ? avg : null };
    });
  }, [timeBlocks]);

  // ── Handlers ──
  const openLogModal = () => {
    setLogForm({
      date: selectedDay,
      categoryId: timeCategories[0]?.id ?? '',
      startTime: '09:00',
      endTime: '10:00',
      notes: '',
      energy: 3,
    });
    setLogModalOpen(true);
  };

  const handleLogSubmit = () => {
    if (!logForm.categoryId || !logForm.startTime || !logForm.endTime) return;
    const duration = calcDurationHours(logForm.startTime, logForm.endTime);
    if (duration <= 0) return;

    const block: TimeBlock = {
      id: generateId(),
      date: logForm.date,
      categoryId: logForm.categoryId,
      startTime: logForm.startTime,
      endTime: logForm.endTime,
      notes: logForm.notes.trim(),
      energy: logForm.energy,
    };
    setTimeBlocks((prev) => [...prev, block]);
    setLogModalOpen(false);
  };

  const handleDeleteBlock = useCallback(
    (id: string) => {
      setTimeBlocks((prev) => prev.filter((b) => b.id !== id));
    },
    [setTimeBlocks]
  );

  const handleAddCategory = () => {
    if (!catForm.name.trim()) return;
    const newCat: TimeCategory = {
      id: generateId(),
      name: catForm.name.trim(),
      color: catForm.color,
    };
    setTimeCategories((prev) => [...prev, newCat]);
    setCatForm({ name: '', color: DEFAULT_COLORS[timeCategories.length % DEFAULT_COLORS.length] });
  };

  const handleDeleteCategory = (id: string) => {
    setTimeCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const selectedDayLabel =
    selectedDay === today
      ? 'Today'
      : format(parseISO(selectedDay), 'EEEE, MMM d');

  return (
    <div className="flex flex-col gap-6 transition-colors duration-300">
      {/* ── Header Row ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock size={20} className="" />
          <div>
            <h1 className="section-title">Time Tracker</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Focus Score */}
          <div className="caesar-card px-4 py-2 flex flex-col items-center min-w-[90px]">
            <div className="flex items-center gap-1">
              <Zap size={13} className="" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Focus Score</span>
            </div>
            <span
              className="text-xl font-bold mt-0.5"
              style={{
                color:
                  focusScore >= 60
                    ? 'var(--text-secondary)'
                    : focusScore >= 30
                    ? 'var(--text-muted)'
                    : 'var(--text-secondary)',
              }}
            >
              {focusScore}%
            </span>
          </div>

          {/* Total Hours */}
          <div className="caesar-card px-4 py-2 flex flex-col items-center min-w-[80px]">
            <div className="flex items-center gap-1">
              <Clock size={13} className="" />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Today</span>
            </div>
            <span className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {roundHours(Math.round(totalHoursToday * 10) / 10)}
            </span>
          </div>

          {/* Buttons */}
          <button
            onClick={openLogModal}
            className="caesar-btn-primary flex items-center gap-2"
          >
            <Plus size={15} />
            Log Time
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="caesar-btn-ghost p-2"
            title="Manage categories"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* LEFT: Donut + Mood Trend */}
        <div className="flex flex-col gap-5">
          {/* Donut Chart */}
          <div className="caesar-card">
            <h2
              className="text-sm font-semibold mb-3 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <span
                className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
                style={{}}
              />
              Today's Breakdown
            </h2>

            {donutData.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-10 gap-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={28} />
                <p className="text-xs">No blocks logged today</p>
              </div>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="hours"
                      isAnimationActive
                      animationBegin={0}
                      animationDuration={600}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={0.9} />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {roundHours(Math.round(totalHoursToday * 10) / 10)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>logged</span>
                </div>
              </div>
            )}

            {/* Legend */}
            {donutData.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2">
                {donutData.map((d, i) => {
                  const pct =
                    totalHoursToday > 0
                      ? Math.round((d.hours / totalHoursToday) * 100)
                      : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {d.name}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{roundHours(d.hours)}</span>
                      <span
                        className="font-semibold w-8 text-right"
                        style={{ color: d.color }}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mood Trend */}
          <div className="caesar-card">
            <h2
              className="text-sm font-semibold mb-3 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <TrendingUp size={14} className="" />
              7-Day Energy Trend
            </h2>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={moodTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: chartColors.text }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 3, 5]}
                  tick={{ fontSize: 10, fill: chartColors.text }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<MoodTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--text-muted)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--text-muted)', r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CENTER: Weekly View + Selected Day Blocks */}
        <div className="xl:col-span-2 flex flex-col gap-5">
          {/* Weekly Grid */}
          <div className="caesar-card">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-sm font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--text-muted)', boxShadow: '0 0 6px var(--text-muted)' }}
                />
                Week of {format(weekDays[0], 'MMM d')}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-2 py-1 text-xs transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                  }}
                >
                  Today
                </button>
                <button
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="flex gap-1">
              {weekDays.map((day) => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayBlocks = getDayBlocks(timeBlocks, dayStr);
                const isTodayDay = dayStr === today;
                const isSelected = dayStr === selectedDay;

                return (
                  <DayColumn
                    key={dayStr}
                    day={day}
                    blocks={dayBlocks}
                    categories={timeCategories}
                    isSelected={isSelected}
                    isToday={isTodayDay}
                    onClick={() => setSelectedDay(dayStr)}
                  />
                );
              })}
            </div>
          </div>

          {/* Weekly Totals Sidebar */}
          <div className="caesar-card">
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: 'var(--text-primary)' }}
            >
              Week Totals — {roundHours(Math.round(getTotalHours(weeklyBlocks) * 10) / 10)}
            </h2>
            {weeklyTotals.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
                No time logged this week.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {weeklyTotals.map((t, i) => {
                  const barWidth =
                    maxWeeklyHours > 0
                      ? Math.round((t.hours / maxWeeklyHours) * 100)
                      : 0;
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="w-24 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {t.name}
                      </span>
                      <div
                        className="flex-1 rounded-full h-1.5 overflow-hidden transition-colors duration-300"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%`, backgroundColor: t.color }}
                        />
                      </div>
                      <span className="w-10 text-right" style={{ color: 'var(--text-secondary)' }}>
                        {roundHours(t.hours)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Day Blocks */}
          <div className="caesar-card">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Clock size={14} className="" />
                {selectedDayLabel}
                {selectedBlocks.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-[var(--text-muted)]/20  border border-[var(--border)]">
                    {roundHours(Math.round(getTotalHours(selectedBlocks) * 10) / 10)}
                  </span>
                )}
              </h2>
              <button
                onClick={openLogModal}
                className="flex items-center gap-1.5 text-xs  hover:text-white transition-colors"
              >
                <Plus size={13} />
                Add block
              </button>
            </div>

            {selectedBlocks.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-8 gap-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={24} />
                <p className="text-xs">No blocks for {selectedDayLabel.toLowerCase()}.</p>
                <button
                  onClick={openLogModal}
                  className="mt-1 text-xs  hover:text-white transition-colors"
                >
                  + Log a time block
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedBlocks
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((block) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      categories={timeCategories}
                      onDelete={handleDeleteBlock}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Log Time Modal ── */}
      <Modal
        isOpen={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        title="Log Time Block"
        size="md"
      >
        <div className="flex flex-col gap-4">
          {/* Date */}
          <div>
            <label className="caesar-label">Date</label>
            <input
              type="date"
              className="caesar-input w-full"
              value={logForm.date}
              onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          {/* Category */}
          <div>
            <label className="caesar-label">Category</label>
            {timeCategories.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                No categories yet. Add one in Settings first.
              </p>
            ) : (
              <select
                className="caesar-input w-full"
                value={logForm.categoryId}
                onChange={(e) => setLogForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                {timeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Start Time</label>
              <input
                type="time"
                className="caesar-input w-full"
                value={logForm.startTime}
                onChange={(e) => setLogForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="caesar-label">End Time</label>
              <input
                type="time"
                className="caesar-input w-full"
                value={logForm.endTime}
                onChange={(e) => setLogForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* Duration preview */}
          {logForm.startTime && logForm.endTime && (
            <div
              className="text-xs -mt-2 flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Clock size={11} />
              {(() => {
                const d = calcDurationHours(logForm.startTime, logForm.endTime);
                return d > 0 ? (
                  <span className="">{roundHours(d)} duration</span>
                ) : (
                  <span className="text-[var(--text-secondary)]">End time must be after start time</span>
                );
              })()}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="caesar-label">Notes</label>
            <textarea
              className="caesar-input w-full resize-none"
              rows={2}
              placeholder="What did you work on?"
              value={logForm.notes}
              onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Energy */}
          <div>
            <label className="caesar-label">Energy Level</label>
            <EnergyPicker
              value={logForm.energy}
              onChange={(v) => setLogForm((f) => ({ ...f, energy: v }))}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setLogModalOpen(false)}
              className="caesar-btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleLogSubmit}
              className="caesar-btn-primary flex-1"
              disabled={
                !logForm.categoryId ||
                !logForm.startTime ||
                !logForm.endTime ||
                calcDurationHours(logForm.startTime, logForm.endTime) <= 0
              }
            >
              Log Block
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Manage Time Categories"
        size="md"
      >
        <div className="flex flex-col gap-5">
          {/* Existing Categories */}
          <div>
            <p className="caesar-label mb-2">Current Categories</p>
            {timeCategories.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
                No categories yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {timeCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border transition-colors duration-300"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                      {cat.name}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {cat.id}
                    </span>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="hover:text-[var(--text-secondary)] transition-colors p-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t transition-colors duration-300" style={{ borderColor: 'var(--border)' }} />

          {/* Add New Category */}
          <div>
            <p className="caesar-label mb-3">Add New Category</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="caesar-label">Category Name</label>
                <input
                  className="caesar-input w-full"
                  placeholder="e.g. Deep Work, Admin, Exercise"
                  value={catForm.name}
                  onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="caesar-label">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="w-10 h-10 rounded cursor-pointer border transition-colors duration-300"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
                    value={catForm.color}
                    onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCatForm((f) => ({ ...f, color: c }))}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          catForm.color === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddCategory}
                className="caesar-btn-primary flex items-center gap-2 w-full justify-center"
                disabled={!catForm.name.trim()}
              >
                <Plus size={14} />
                Add Category
              </button>
            </div>
          </div>

          <button
            onClick={() => setSettingsOpen(false)}
            className="caesar-btn-ghost w-full"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
}
