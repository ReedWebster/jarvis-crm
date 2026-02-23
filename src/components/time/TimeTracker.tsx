import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Clock,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Target,
  Check,
  X,
  CalendarDays,
  LayoutGrid,
  Calendar,
  FileText,
  ListTodo,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  format,
  startOfWeek,
  addDays,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  getDay,
  addMonths,
} from 'date-fns';
import type { TimeBlock, TimeCategory, Note, TodoItem } from '../../types';
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
import { useSupabaseStorage } from '../../hooks/useSupabaseStorage';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type PlannerView = 'daily' | 'weekly' | 'monthly';

interface Props {
  timeBlocks: TimeBlock[];
  setTimeBlocks: (v: TimeBlock[] | ((p: TimeBlock[]) => TimeBlock[])) => void;
  timeCategories: TimeCategory[];
  setTimeCategories: (v: TimeCategory[] | ((p: TimeCategory[]) => TimeCategory[])) => void;
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  todos: TodoItem[];
}

interface LogFormState {
  date: string;
  categoryId: string;
  title: string;
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

// Hours shown in daily view (6am → 11pm)
const DAY_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

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

// Returns blocks that overlap an hour slot (e.g., hour=9 means 09:00–10:00)
function getBlocksForHour(blocks: TimeBlock[], hour: number): TimeBlock[] {
  return blocks.filter((b) => {
    const [sh] = b.startTime.split(':').map(Number);
    const [eh] = b.endTime.split(':').map(Number);
    return sh <= hour && eh > hour;
  });
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, hours, color } = payload[0].payload;
  const total = payload[0].payload.total;
  const pct = total > 0 ? Math.round((hours / total) * 100) : 0;
  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs shadow-lg"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: `${color}50`, color: 'var(--text-primary)' }}
    >
      <p className="font-semibold" style={{ color }}>{name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{roundHours(hours)} · {pct}%</p>
    </div>
  );
}

// Quick Add Note — saves directly to Notes & Intel
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
    <div className="caesar-card flex flex-col gap-2">
      <h2 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <FileText size={12} /> QUICK NOTE
      </h2>
      <input
        className="caesar-input text-xs w-full"
        placeholder="Title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        className="caesar-input text-xs w-full resize-none"
        rows={4}
        placeholder="Capture a thought, insight, or intel…"
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
      />
      <button
        onClick={handleSave}
        disabled={!content.trim() && !title.trim()}
        className="caesar-btn-primary text-xs py-1.5 flex items-center justify-center gap-1.5"
      >
        {saved ? <><Check size={12} /> Saved to Notes</> : <><Plus size={12} /> Add to Notes & Intel</>}
      </button>
    </div>
  );
}

// Todo Summary — shows incomplete todos for the sidebar
function TodoSummaryPanel({ todos }: { todos: TodoItem[] }) {
  const incomplete = todos.filter(t => t.status !== 'done');
  const high = incomplete.filter(t => t.priority === 'high');
  const medium = incomplete.filter(t => t.priority === 'medium');
  const low = incomplete.filter(t => t.priority === 'low');

  const renderGroup = (label: string, items: TodoItem[], dot: string) => {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span>
        </div>
        {items.slice(0, 3).map(t => (
          <div key={t.id} className="flex items-start gap-2 pl-3">
            <div className="w-3 h-3 rounded border flex-shrink-0 mt-0.5" style={{ borderColor: 'var(--border)' }} />
            <span className="text-xs leading-tight truncate" style={{ color: 'var(--text-secondary)' }}>{t.title}</span>
          </div>
        ))}
        {items.length > 3 && (
          <p className="text-xs pl-3" style={{ color: 'var(--text-muted)' }}>+{items.length - 3} more</p>
        )}
      </div>
    );
  };

  return (
    <div className="caesar-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <ListTodo size={12} /> TODO LIST
        </h2>
        {incomplete.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {incomplete.length} open
          </span>
        )}
      </div>
      {incomplete.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>All caught up ✓</p>
      ) : (
        <div className="flex flex-col gap-3">
          {renderGroup('High Priority', high, '#dc2626')}
          {renderGroup('Medium', medium, '#d97706')}
          {renderGroup('Low', low, '#6b7280')}
        </div>
      )}
    </div>
  );
}

function EnergyPicker({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-2">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-xs"
          style={{
            borderColor: value === n ? 'var(--border-strong)' : 'var(--border)',
            backgroundColor: value === n ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-primary)',
          }}
        >
          <span className="text-base">{ENERGY_EMOJIS[n]}</span>
          <span>{ENERGY_LABELS[n]}</span>
        </button>
      ))}
    </div>
  );
}

// Block chip for daily timeline
function BlockChip({
  block, categories, onDelete, onRename,
}: {
  block: TimeBlock;
  categories: TimeCategory[];
  onDelete: (id: string) => void;
  onRename?: (id: string, title: string) => void;
}) {
  const color = getCategoryColor(block.categoryId, categories);
  const catName = getCategoryName(block.categoryId, categories);
  const displayName = block.title?.trim() || catName;
  const duration = calcDurationHours(block.startTime, block.endTime);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = () => {
    setEditing(false);
    onRename?.(block.id, draft.trim());
  };

  const startEdit = () => {
    setDraft(block.title ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded text-xs group"
      style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none font-semibold min-w-0"
          style={{ color }}
          value={draft}
          placeholder={catName}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setEditing(false); setDraft(block.title ?? ''); }
          }}
        />
      ) : (
        <button
          onClick={startEdit}
          className="font-semibold truncate flex-1 text-left hover:underline"
          style={{ color }}
          title="Click to rename"
        >
          {displayName}
        </button>
      )}
      <span style={{ color: 'var(--text-muted)' }}>{formatTime(block.startTime)}–{formatTime(block.endTime)}</span>
      <span style={{ color: 'var(--text-muted)' }}>({roundHours(duration)})</span>
      <span title={ENERGY_LABELS[block.energy]}>{ENERGY_EMOJIS[block.energy]}</span>
      <button
        onClick={() => onDelete(block.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ─── FOCUS AREAS PANEL ────────────────────────────────────────────────────────

function FocusAreasPanel({
  date,
  focusItems,
  onUpdate,
}: {
  date: string;
  focusItems: string[];
  onUpdate: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addItem = () => {
    if (!draft.trim()) return;
    onUpdate([...focusItems, draft.trim()]);
    setDraft('');
    inputRef.current?.focus();
  };

  const removeItem = (i: number) => {
    onUpdate(focusItems.filter((_, idx) => idx !== i));
  };

  const updateItem = (i: number, val: string) => {
    const updated = [...focusItems];
    updated[i] = val;
    onUpdate(updated);
  };

  return (
    <div className="caesar-card">
      <div className="flex items-center gap-2 mb-3">
        <Target size={14} style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Focus Areas — {format(parseISO(date), 'EEEE, MMM d')}
        </h2>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {focusItems.length === 0 && (
          <p className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>
            No focus areas set for today. Add your top priorities below.
          </p>
        )}
        {focusItems.map((item, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
              style={{ border: '1.5px solid var(--text-muted)', color: 'var(--text-muted)' }}
            >
              {i + 1}
            </div>
            <input
              className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-b-[var(--border)]"
              style={{ color: 'var(--text-primary)' }}
              value={item}
              onChange={e => updateItem(i, e.target.value)}
            />
            <button
              onClick={() => removeItem(i)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="caesar-input flex-1 text-sm"
          placeholder="Add a focus area..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
        />
        <button
          onClick={addItem}
          disabled={!draft.trim()}
          className="caesar-btn-ghost px-3 py-1.5"
          style={{ fontSize: 12 }}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── DAILY VIEW ───────────────────────────────────────────────────────────────

function DailyView({
  date,
  blocks,
  categories,
  onAddBlock,
  onDeleteBlock,
  onRenameBlock,
  focusItems,
  onUpdateFocus,
}: {
  date: string;
  blocks: TimeBlock[];
  categories: TimeCategory[];
  onAddBlock: (startHour: number) => void;
  onDeleteBlock: (id: string) => void;
  onRenameBlock: (id: string, title: string) => void;
  focusItems: string[];
  onUpdateFocus: (items: string[]) => void;
}) {
  const total = getTotalHours(blocks);

  return (
    <div className="flex flex-col gap-4">
      {/* Focus Areas */}
      <FocusAreasPanel date={date} focusItems={focusItems} onUpdate={onUpdateFocus} />

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="caesar-card py-3 flex flex-col items-center">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Hours Logged</span>
          <span className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {total > 0 ? roundHours(Math.round(total * 10) / 10) : '—'}
          </span>
        </div>
        <div className="caesar-card py-3 flex flex-col items-center">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Blocks</span>
          <span className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{blocks.length}</span>
        </div>
        <div className="caesar-card py-3 flex flex-col items-center">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Energy</span>
          <span className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {blocks.length > 0 ? ENERGY_EMOJIS[Math.round(calcEnergyAvg(blocks))] : '—'}
          </span>
        </div>
        <div className="caesar-card py-3 flex flex-col items-center">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Focus Areas</span>
          <span className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{focusItems.length}</span>
        </div>
      </div>

      {/* Hourly Timeline */}
      <div className="caesar-card">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Schedule
        </h2>
        <div className="flex flex-col">
          {DAY_HOURS.map((hour) => {
            const hourBlocks = getBlocksForHour(blocks, hour);
            const timeLabel = `${hour === 12 ? '12' : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'am' : hour === 12 ? 'pm' : 'pm'}`;
            return (
              <div
                key={hour}
                className="flex gap-3 min-h-[44px] border-b group"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Hour label */}
                <div
                  className="w-12 text-xs text-right pt-2 flex-shrink-0 font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {timeLabel}
                </div>

                {/* Block area */}
                <div className="flex-1 py-1.5 flex flex-col gap-1">
                  {hourBlocks.map(b => (
                    <BlockChip key={b.id} block={b} categories={categories} onDelete={onDeleteBlock} onRename={onRenameBlock} />
                  ))}
                  {hourBlocks.length === 0 && (
                    <button
                      onClick={() => onAddBlock(hour)}
                      className="w-full text-left text-xs py-1 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      + add block
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── WEEKLY VIEW ─────────────────────────────────────────────────────────────

function WeekDayColumn({
  day, blocks, categories, isSelected, isToday, onClick,
}: {
  day: Date; blocks: TimeBlock[]; categories: TimeCategory[];
  isSelected: boolean; isToday: boolean; onClick: () => void;
}) {
  const totalHours = getTotalHours(blocks);
  const MAX_DISPLAY_HOURS = 10;
  const maxHeight = 120;

  const segments = blocks.map((b) => {
    const h = calcDurationHours(b.startTime, b.endTime);
    const proportion = Math.min(h / MAX_DISPLAY_HOURS, 1);
    return { height: Math.max(proportion * maxHeight, 3), color: getCategoryColor(b.categoryId, categories), id: b.id };
  });
  const rawTotal = segments.reduce((s, seg) => s + seg.height, 0);
  const scale = rawTotal > maxHeight ? maxHeight / rawTotal : 1;
  const scaled = segments.map((s) => ({ ...s, height: s.height * scale }));

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-1 rounded-xl p-2 transition-all border"
      style={{
        borderColor: isSelected || isToday ? 'var(--border)' : 'transparent',
        backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
      }}
      onMouseEnter={e => { if (!isSelected && !isToday) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      onMouseLeave={e => { if (!isSelected && !isToday) (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
    >
      <span className="text-xs font-medium" style={{ color: isToday ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
        {format(day, 'EEE')}
      </span>
      <span className="text-sm font-bold" style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {format(day, 'd')}
      </span>
      <div
        className="w-full rounded overflow-hidden flex flex-col-reverse gap-px"
        style={{ height: `${maxHeight}px`, backgroundColor: 'var(--bg-elevated)' }}
      >
        {scaled.map((seg, i) => (
          <div key={i} style={{ height: `${seg.height}px`, backgroundColor: seg.color, opacity: 0.85 }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {totalHours > 0 ? roundHours(Math.round(totalHours * 10) / 10) : '—'}
      </span>
    </button>
  );
}

function WeeklyView({
  weekDays, timeBlocks, timeCategories, selectedDay, onSelectDay, weekOffset, onWeekOffsetChange,
}: {
  weekDays: Date[]; timeBlocks: TimeBlock[]; timeCategories: TimeCategory[];
  selectedDay: string; onSelectDay: (d: string) => void;
  weekOffset: number; onWeekOffsetChange: (n: number) => void;
}) {
  const today = todayStr();
  const weeklyBlocks = timeBlocks.filter(b => {
    const start = format(weekDays[0], 'yyyy-MM-dd');
    const end = format(weekDays[6], 'yyyy-MM-dd');
    return b.date >= start && b.date <= end;
  });
  const weeklyTotals = aggregateTimeByCategory(weeklyBlocks, timeCategories);
  const maxWeeklyHours = weeklyTotals.length > 0 ? weeklyTotals[0].hours : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Week navigator */}
      <div className="caesar-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Week of {format(weekDays[0], 'MMM d')}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => onWeekOffsetChange(weekOffset - 1)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => onWeekOffsetChange(0)} className="px-2 py-1 text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>
              This Week
            </button>
            <button onClick={() => onWeekOffsetChange(weekOffset + 1)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {weekDays.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            return (
              <WeekDayColumn
                key={dayStr}
                day={day}
                blocks={getDayBlocks(timeBlocks, dayStr)}
                categories={timeCategories}
                isSelected={dayStr === selectedDay}
                isToday={dayStr === today}
                onClick={() => onSelectDay(dayStr)}
              />
            );
          })}
        </div>
      </div>

      {/* Weekly Totals */}
      <div className="caesar-card">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Week Totals — {roundHours(Math.round(getTotalHours(weeklyBlocks) * 10) / 10)}
        </h2>
        {weeklyTotals.length === 0 ? (
          <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No time logged this week.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {weeklyTotals.map((t, i) => {
              const barWidth = maxWeeklyHours > 0 ? Math.round((t.hours / maxWeeklyHours) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="w-24 truncate" style={{ color: 'var(--text-secondary)' }}>{t.name}</span>
                  <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: t.color }} />
                  </div>
                  <span className="w-10 text-right" style={{ color: 'var(--text-secondary)' }}>{roundHours(t.hours)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Day Summary */}
      {selectedDay && (() => {
        const selBlocks = getDayBlocks(timeBlocks, selectedDay);
        const label = selectedDay === today ? 'Today' : format(parseISO(selectedDay), 'EEEE, MMM d');
        return (
          <div className="caesar-card">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {label}
              {selBlocks.length > 0 && (
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                  {roundHours(Math.round(getTotalHours(selBlocks) * 10) / 10)}
                </span>
              )}
            </h2>
            {selBlocks.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No blocks logged.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {selBlocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime)).map(block => (
                  <BlockChip key={block.id} block={block} categories={timeCategories} onDelete={() => {}} onRename={() => {}} />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── MONTHLY VIEW ─────────────────────────────────────────────────────────────

function MonthlyView({
  timeBlocks, timeCategories, selectedDay, onSelectDay, monthOffset, onMonthOffsetChange,
}: {
  timeBlocks: TimeBlock[]; timeCategories: TimeCategory[];
  selectedDay: string; onSelectDay: (d: string) => void;
  monthOffset: number; onMonthOffsetChange: (n: number) => void;
}) {
  const today = todayStr();
  const referenceDate = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Pad to start on Monday
  const startPad = (getDay(monthStart) + 6) % 7; // 0=Mon … 6=Sun
  const paddedDays: (Date | null)[] = [
    ...Array(startPad).fill(null),
    ...daysInMonth,
  ];
  // Pad end to complete last row
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  const WEEK_LABELS_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEK_LABELS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="caesar-card">
      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {format(referenceDate, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => onMonthOffsetChange(monthOffset - 1)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => onMonthOffsetChange(0)} className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Today
          </button>
          <button onClick={() => onMonthOffsetChange(monthOffset + 1)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-2">
        {WEEK_LABELS_LONG.map((d, i) => (
          <div key={i} className="text-center text-xs font-medium py-1" style={{ color: 'var(--text-muted)' }}>
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{WEEK_LABELS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: 'var(--border)' }}>
        {paddedDays.map((day, i) => {
          if (!day) return <div key={i} style={{ backgroundColor: 'var(--bg-card)' }} className="h-14 sm:h-20" />;
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayBlocks = getDayBlocks(timeBlocks, dayStr);
          const total = getTotalHours(dayBlocks);
          const isCurrentMonth = isSameMonth(day, referenceDate);
          const isSelected = dayStr === selectedDay;
          const isToday = dayStr === today;

          // Get category color dots (top 3 categories)
          const catGroups = dayBlocks.reduce<Record<string, number>>((acc, b) => {
            acc[b.categoryId] = (acc[b.categoryId] ?? 0) + 1;
            return acc;
          }, {});
          const topCats = Object.entries(catGroups).sort((a, b) => b[1] - a[1]).slice(0, 3);

          return (
            <button
              key={dayStr}
              onClick={() => onSelectDay(dayStr)}
              className="h-14 sm:h-20 p-1 sm:p-1.5 flex flex-col text-left transition-colors"
              style={{
                backgroundColor: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                opacity: isCurrentMonth ? 1 : 0.4,
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-card)'; }}
            >
              <div
                className="text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  color: isToday ? 'var(--bg-card)' : 'var(--text-primary)',
                  backgroundColor: isToday ? 'var(--text-primary)' : 'transparent',
                }}
              >
                {format(day, 'd')}
              </div>
              {total > 0 && (
                <div className="text-xs font-mono hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                  {roundHours(Math.round(total * 10) / 10)}
                </div>
              )}
              <div className="flex gap-0.5 mt-auto flex-wrap">
                {topCats.map(([catId]) => (
                  <div
                    key={catId}
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
                    style={{ backgroundColor: getCategoryColor(catId, timeCategories) }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function TimeTracker({ timeBlocks, setTimeBlocks, timeCategories, setTimeCategories, notes, setNotes, todos }: Props) {
  const today = todayStr();

  // ── Planner State ──
  const [plannerView, setPlannerView] = useState<PlannerView>('daily');
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  // ── Daily Focus ──
  const [dailyFocus, setDailyFocus] = useSupabaseStorage<Record<string, string[]>>('jarvis:dailyFocus', {});

  const getFocusItems = (date: string) => dailyFocus[date] ?? [];
  const updateFocusItems = (date: string, items: string[]) => {
    setDailyFocus(prev => ({ ...prev, [date]: items }));
  };

  // ── Log Modal ──
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logForm, setLogForm] = useState<LogFormState>({
    date: today,
    categoryId: timeCategories[0]?.id ?? '',
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
    energy: 3,
  });

  // ── Category Settings ──
  const [catForm, setCatForm] = useState<CategoryFormState>({ name: '', color: '#555555' });

  // ── Week Days ──
  const weekDays = useMemo(() => {
    const ref = addDays(new Date(), weekOffset * 7);
    return getWeekDays(ref);
  }, [weekOffset]);

  // ── Derived ──
  const selectedBlocks = useMemo(() => getDayBlocks(timeBlocks, selectedDay), [timeBlocks, selectedDay]);
  const todayBlocks = useMemo(() => getDayBlocks(timeBlocks, today), [timeBlocks, today]);
  const totalHoursToday = useMemo(() => getTotalHours(todayBlocks), [todayBlocks]);
  const focusScore = useMemo(() => calcFocusScore(todayBlocks, timeCategories), [todayBlocks, timeCategories]);

  // Donut chart for today
  const donutData = useMemo(() => {
    const agg = aggregateTimeByCategory(todayBlocks, timeCategories);
    const total = agg.reduce((s, a) => s + a.hours, 0);
    return agg.map((a) => ({ ...a, total }));
  }, [todayBlocks, timeCategories]);

  const handleAddNote = useCallback((note: Note) => {
    setNotes(prev => [note, ...prev]);
  }, [setNotes]);

  // ── Handlers ──
  const openLogModal = useCallback((startHour?: number) => {
    const sh = startHour !== undefined ? `${String(startHour).padStart(2, '0')}:00` : '09:00';
    const eh = startHour !== undefined ? `${String(startHour + 1).padStart(2, '0')}:00` : '10:00';
    setLogForm({
      date: selectedDay,
      categoryId: timeCategories[0]?.id ?? '',
      title: '',
      startTime: sh,
      endTime: eh,
      notes: '',
      energy: 3,
    });
    setLogModalOpen(true);
  }, [selectedDay, timeCategories]);

  const handleLogSubmit = () => {
    if (!logForm.categoryId || !logForm.startTime || !logForm.endTime) return;
    const duration = calcDurationHours(logForm.startTime, logForm.endTime);
    if (duration <= 0) return;
    const block: TimeBlock = {
      id: generateId(),
      date: logForm.date,
      categoryId: logForm.categoryId,
      title: logForm.title.trim() || undefined,
      startTime: logForm.startTime,
      endTime: logForm.endTime,
      notes: logForm.notes.trim(),
      energy: logForm.energy,
    };
    setTimeBlocks((prev) => [...prev, block]);
    setLogModalOpen(false);
  };

  const handleRenameBlock = useCallback((id: string, title: string) => {
    setTimeBlocks(prev => prev.map(b => b.id === id ? { ...b, title: title || undefined } : b));
  }, [setTimeBlocks]);

  const handleDeleteBlock = useCallback((id: string) => {
    setTimeBlocks((prev) => prev.filter((b) => b.id !== id));
  }, [setTimeBlocks]);

  const handleAddCategory = () => {
    if (!catForm.name.trim()) return;
    const newCat: TimeCategory = { id: generateId(), name: catForm.name.trim(), color: catForm.color };
    setTimeCategories((prev) => [...prev, newCat]);
    setCatForm({ name: '', color: DEFAULT_COLORS[timeCategories.length % DEFAULT_COLORS.length] });
  };

  const handleDeleteCategory = (id: string) => {
    setTimeCategories((prev) => prev.filter((c) => c.id !== id));
  };

  // When week view day is clicked → navigate to daily view
  const handleWeekDaySelect = (dayStr: string) => {
    setSelectedDay(dayStr);
  };

  // When month view day is clicked → switch to daily view
  const handleMonthDaySelect = (dayStr: string) => {
    setSelectedDay(dayStr);
    setPlannerView('daily');
  };

  return (
    <div className="flex flex-col gap-5 transition-colors duration-300">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Clock size={20} />
            Time Planner
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Toggle */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {([
              { key: 'daily' as PlannerView, icon: <CalendarDays size={13} />, label: 'Day' },
              { key: 'weekly' as PlannerView, icon: <LayoutGrid size={13} />, label: 'Week' },
              { key: 'monthly' as PlannerView, icon: <Calendar size={13} />, label: 'Month' },
            ]).map(v => (
              <button
                key={v.key}
                onClick={() => setPlannerView(v.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: plannerView === v.key ? 'var(--bg-elevated)' : 'transparent',
                  color: plannerView === v.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderRight: '1px solid var(--border)',
                }}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>

          {/* Date Navigator (daily/weekly) */}
          {plannerView === 'daily' && (
            <div className="flex items-center gap-1 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setSelectedDay(format(addDays(parseISO(selectedDay), -1), 'yyyy-MM-dd'))}
                className="p-1.5 transition-colors" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>
                {selectedDay === today ? 'Today' : format(parseISO(selectedDay), 'MMM d')}
              </span>
              <button
                onClick={() => setSelectedDay(format(addDays(parseISO(selectedDay), 1), 'yyyy-MM-dd'))}
                className="p-1.5 transition-colors" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Log Time */}
          <button onClick={() => openLogModal()} className="caesar-btn-primary flex items-center gap-2">
            <Plus size={14} /> Log Time
          </button>

          <button onClick={() => setSettingsOpen(true)} className="caesar-btn-ghost p-2" title="Manage categories">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Left sidebar — stats + chart */}
        <div className="xl:col-span-1 flex flex-col gap-4">
          {/* Today Stats */}
          <div className="caesar-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>TODAY</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {totalHoursToday > 0 ? roundHours(Math.round(totalHoursToday * 10) / 10) : '—'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>hours logged</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{focusScore}%</div>
                <div className="text-xs flex items-center gap-1 justify-end" style={{ color: 'var(--text-muted)' }}>
                  <Zap size={10} /> focus
                </div>
              </div>
            </div>
          </div>

          {/* Donut */}
          <div className="caesar-card">
            <h2 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>TODAY'S BREAKDOWN</h2>
            {donutData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
                <Clock size={24} />
                <p className="text-xs">No blocks yet</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                        paddingAngle={2} dataKey="hours" isAnimationActive animationBegin={0} animationDuration={600}>
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} opacity={0.9} />)}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {roundHours(Math.round(totalHoursToday * 10) / 10)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>logged</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  {donutData.map((d, i) => {
                    const pct = totalHoursToday > 0 ? Math.round((d.hours / totalHoursToday) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{roundHours(d.hours)}</span>
                        <span className="font-semibold w-8 text-right" style={{ color: d.color }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Quick Add Note */}
          <QuickAddNotePanel onAddNote={handleAddNote} />

          {/* Todo Summary */}
          <TodoSummaryPanel todos={todos} />
        </div>

        {/* Right main area */}
        <div className="xl:col-span-3">
          {plannerView === 'daily' && (
            <DailyView
              date={selectedDay}
              blocks={selectedBlocks}
              categories={timeCategories}
              onAddBlock={openLogModal}
              onDeleteBlock={handleDeleteBlock}
              onRenameBlock={handleRenameBlock}
              focusItems={getFocusItems(selectedDay)}
              onUpdateFocus={(items) => updateFocusItems(selectedDay, items)}
            />
          )}

          {plannerView === 'weekly' && (
            <WeeklyView
              weekDays={weekDays}
              timeBlocks={timeBlocks}
              timeCategories={timeCategories}
              selectedDay={selectedDay}
              onSelectDay={handleWeekDaySelect}
              weekOffset={weekOffset}
              onWeekOffsetChange={setWeekOffset}
            />
          )}

          {plannerView === 'monthly' && (
            <MonthlyView
              timeBlocks={timeBlocks}
              timeCategories={timeCategories}
              selectedDay={selectedDay}
              onSelectDay={handleMonthDaySelect}
              monthOffset={monthOffset}
              onMonthOffsetChange={setMonthOffset}
            />
          )}
        </div>
      </div>

      {/* ── Log Time Modal ── */}
      <Modal isOpen={logModalOpen} onClose={() => setLogModalOpen(false)} title="Log Time Block" size="md">
        <div className="flex flex-col gap-4">
          <div>
            <label className="caesar-label">Event Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              className="caesar-input w-full"
              placeholder="e.g. Team standup, Deep work session…"
              value={logForm.title}
              onChange={(e) => setLogForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="caesar-label">Date</label>
            <input type="date" className="caesar-input w-full" value={logForm.date}
              onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="caesar-label">Category</label>
            {timeCategories.length === 0 ? (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>No categories yet — add one in Settings.</p>
            ) : (
              <select className="caesar-input w-full" value={logForm.categoryId}
                onChange={(e) => setLogForm((f) => ({ ...f, categoryId: e.target.value }))}>
                {timeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Start Time</label>
              <input type="time" className="caesar-input w-full" value={logForm.startTime}
                onChange={(e) => setLogForm((f) => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="caesar-label">End Time</label>
              <input type="time" className="caesar-input w-full" value={logForm.endTime}
                onChange={(e) => setLogForm((f) => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          {logForm.startTime && logForm.endTime && (() => {
            const d = calcDurationHours(logForm.startTime, logForm.endTime);
            return (
              <div className="text-xs -mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Clock size={11} />
                {d > 0 ? <span>{roundHours(d)} duration</span> : <span style={{ color: 'var(--text-secondary)' }}>End time must be after start</span>}
              </div>
            );
          })()}
          <div>
            <label className="caesar-label">Notes</label>
            <textarea className="caesar-input w-full resize-none" rows={2} placeholder="What did you work on?"
              value={logForm.notes} onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <label className="caesar-label">Energy Level</label>
            <EnergyPicker value={logForm.energy} onChange={(v) => setLogForm((f) => ({ ...f, energy: v }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setLogModalOpen(false)} className="caesar-btn-ghost flex-1">Cancel</button>
            <button onClick={handleLogSubmit} className="caesar-btn-primary flex-1"
              disabled={!logForm.categoryId || !logForm.startTime || !logForm.endTime || calcDurationHours(logForm.startTime, logForm.endTime) <= 0}>
              Log Block
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Manage Time Categories" size="md">
        <div className="flex flex-col gap-5">
          <div>
            <p className="caesar-label mb-2">Current Categories</p>
            {timeCategories.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No categories yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {timeCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-3 p-2.5 rounded-lg border"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 transition-colors" style={{ color: 'var(--text-muted)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t" style={{ borderColor: 'var(--border)' }} />
          <div>
            <p className="caesar-label mb-3">Add New Category</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="caesar-label">Category Name</label>
                <input className="caesar-input w-full" placeholder="e.g. Deep Work, Admin, Exercise"
                  value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="caesar-label">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
                    value={catForm.color} onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))} />
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_COLORS.map((c) => (
                      <button key={c} onClick={() => setCatForm((f) => ({ ...f, color: c }))}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: catForm.color === c ? 'white' : 'transparent', transform: catForm.color === c ? 'scale(1.1)' : 'scale(1)' }} />
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleAddCategory} className="caesar-btn-primary flex items-center gap-2 w-full justify-center" disabled={!catForm.name.trim()}>
                <Plus size={14} /> Add Category
              </button>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(false)} className="caesar-btn-ghost w-full">Done</button>
        </div>
      </Modal>
    </div>
  );
}
