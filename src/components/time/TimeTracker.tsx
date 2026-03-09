import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
} from 'lucide-react';
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
  getCategoryColor,
  getCategoryName,
  formatTime,
} from '../../utils';
import { analyzeTime } from '../../utils/intelligence';
import { Modal } from '../shared/Modal';
import { TimeSelect } from '../shared/TimeSelect';
import { useSupabaseStorage } from '../../hooks/useSupabaseStorage';
import { useCalendarNotifications } from '../../hooks/useCalendarNotifications';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64;
const MIN_EVENT_HEIGHT = 22;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEK_DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280',
];
const ENERGY_EMOJIS: Record<number, string> = { 1: '😴', 2: '😐', 3: '🙂', 4: '😊', 5: '🔥' };
const ENERGY_LABELS: Record<number, string> = { 1: 'Exhausted', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Peak' };

// ─── TYPES ────────────────────────────────────────────────────────────────────

type CalView = 'day' | 'week' | 'month';

interface Props {
  timeBlocks: TimeBlock[];
  setTimeBlocks: (v: TimeBlock[] | ((p: TimeBlock[]) => TimeBlock[])) => void;
  timeCategories: TimeCategory[];
  setTimeCategories: (v: TimeCategory[] | ((p: TimeCategory[]) => TimeCategory[])) => void;
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  todos: TodoItem[];
}

type RepeatOption = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface LogFormState {
  date: string;
  categoryId: string;
  title: string;
  startTime: string;
  endTime: string;
  notes: string;
  energy: 1 | 2 | 3 | 4 | 5;
  editingId?: string;
  repeat: RepeatOption;
  repeatUntil: string;
}

interface EventLayoutInfo {
  col: number;
  totalCols: number;
}

interface GhostBlock {
  date: string;
  startMin: number;
  endMin: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

function minutesToTimeStr(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function eventTopPx(startTime: string): number {
  return (timeToMinutes(startTime) / 60) * HOUR_HEIGHT;
}

function eventHeightPx(startTime: string, endTime: string): number {
  return Math.max(calcDurationHours(startTime, endTime) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
}

function buildOverlapLayout(blocks: TimeBlock[]): Map<string, EventLayoutInfo> {
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const colEnds: number[] = [];
  const blockCols = new Map<string, number>();

  for (const block of sorted) {
    const startMin = timeToMinutes(block.startTime);
    let col = colEnds.findIndex((end) => end <= startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(timeToMinutes(block.endTime)); }
    else colEnds[col] = timeToMinutes(block.endTime);
    blockCols.set(block.id, col);
  }

  const result = new Map<string, EventLayoutInfo>();
  for (const block of sorted) {
    const col = blockCols.get(block.id)!;
    const startMin = timeToMinutes(block.startTime);
    const endMin = timeToMinutes(block.endTime);
    let maxCol = col;
    for (const [id, c] of blockCols) {
      const other = sorted.find((b) => b.id === id);
      if (!other) continue;
      const oStart = timeToMinutes(other.startTime);
      const oEnd = timeToMinutes(other.endTime);
      if (oStart < endMin && oEnd > startMin) maxCol = Math.max(maxCol, c);
    }
    result.set(block.id, { col, totalCols: maxCol + 1 });
  }
  return result;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

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
  const sunday = startOfWeek(referenceDate, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** Compute y-offset within the time grid from a mouse event.
 *  getBoundingClientRect() is already viewport-relative (accounts for scroll),
 *  so clientY - rect.top gives the absolute pixel position within the column.
 */
function getMinutesAtClientY(
  containerEl: HTMLElement,
  _scrollEl: HTMLElement | null,
  clientY: number
): number {
  const rect = containerEl.getBoundingClientRect();
  const y = clientY - rect.top;
  return snapToGrid(Math.round((y / HOUR_HEIGHT) * 60));
}

// ─── EVENT BLOCK ──────────────────────────────────────────────────────────────

function EventBlock({
  block, categories, top, height, colPct, widthPct, onClick,
}: {
  block: TimeBlock;
  categories: TimeCategory[];
  top: number;
  height: number;
  colPct: number;
  widthPct: number;
  onClick: () => void;
}) {
  const color = getCategoryColor(block.categoryId, categories);
  const catName = getCategoryName(block.categoryId, categories);
  const displayName = block.title?.trim() || catName;
  const isShort = height < 38;
  const [active, setActive] = useState(false);

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${displayName}\n${formatTime(block.startTime)} – ${formatTime(block.endTime)}`}
      style={{
        position: 'absolute',
        top: top + 1,
        height: height - 2,
        left: `calc(${colPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${color}28`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        cursor: 'pointer',
        overflow: 'hidden',
        padding: isShort ? '0 5px' : '3px 6px',
        display: 'flex',
        flexDirection: isShort ? 'row' : 'column',
        alignItems: isShort ? 'center' : 'flex-start',
        gap: isShort ? 4 : 1,
        /* Bring event to front on hover/focus so overlapping events are clickable */
        zIndex: active ? 10 : 1,
        boxSizing: 'border-box',
        transition: 'filter 0.1s, z-index 0s',
        filter: active ? 'brightness(0.92)' : 'none',
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <span style={{
        fontSize: 11, fontWeight: 600, color,
        lineHeight: 1.3, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>
        {displayName}
      </span>
      {!isShort && (
        <span style={{ fontSize: 10, color: `${color}bb`, lineHeight: 1.2 }}>
          {formatTime(block.startTime)} – {formatTime(block.endTime)}
        </span>
      )}
    </div>
  );
}

// ─── GHOST BLOCK (drag preview) ───────────────────────────────────────────────

function GhostEventBlock({ startMin, endMin }: { startMin: number; endMin: number }) {
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24);
  return (
    <div
      style={{
        position: 'absolute',
        top: top + 1,
        height: height - 2,
        left: 2, right: 2,
        backgroundColor: 'rgba(59,130,246,0.15)',
        border: '2px solid #3b82f6',
        borderRadius: 6,
        zIndex: 3,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-start',
        padding: '3px 6px',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6' }}>
        {minutesToTimeStr(startMin).replace(/^0/, '')} – {minutesToTimeStr(endMin).replace(/^0/, '')}
      </span>
    </div>
  );
}

// ─── CURRENT TIME INDICATOR ───────────────────────────────────────────────────

function CurrentTimeIndicator({ topPx }: { topPx: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: topPx - 1,
        left: -7, right: 0,
        zIndex: 5,
        display: 'flex', alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 2, backgroundColor: '#ef4444' }} />
    </div>
  );
}

// ─── HOUR GRID LINES ──────────────────────────────────────────────────────────

function HourLines() {
  return (
    <>
      {HOURS.map((h) => (
        <React.Fragment key={h}>
          <div style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, borderTop: '1px solid var(--border)', zIndex: 0 }} />
          <div style={{ position: 'absolute', top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: '1px solid var(--border)', opacity: 0.35, zIndex: 0 }} />
        </React.Fragment>
      ))}
    </>
  );
}

// ─── TIME LABELS COLUMN ───────────────────────────────────────────────────────

function TimeLabels() {
  return (
    <div style={{ width: 52, flexShrink: 0 }}>
      {HOURS.map((h) => (
        <div key={h} style={{ height: HOUR_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 10, paddingTop: 6 }}>
          {h > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {formatHourLabel(h)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── DRAG HOOK ────────────────────────────────────────────────────────────────

function useDragCreate(
  scrollRef: React.RefObject<HTMLDivElement>,
  onComplete: (date: string, startTime: string, endTime: string) => void
) {
  const [ghost, setGhost] = useState<GhostBlock | null>(null);
  const dragRef = useRef<{ date: string; startMin: number; containerEl: HTMLElement } | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateGhost = useCallback((clientY: number) => {
    if (!dragRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!dragRef.current) return;
      const endMin = Math.min(
        Math.max(
          getMinutesAtClientY(dragRef.current.containerEl, scrollRef.current, clientY),
          dragRef.current.startMin + 15
        ),
        24 * 60
      );
      setGhost({ date: dragRef.current.date, startMin: dragRef.current.startMin, endMin });
    });
  }, [scrollRef]);

  const completeDrag = useCallback(() => {
    if (!dragRef.current) return;
    const { date: d, startMin } = dragRef.current;
    dragRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setGhost((prev) => {
      const endMin = prev ? prev.endMin : startMin + 60;
      onComplete(d, minutesToTimeStr(startMin), minutesToTimeStr(Math.min(endMin, 23 * 60 + 45)));
      return null;
    });
  }, [onComplete]);

  const startDrag = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    date: string,
  ) => {
    // Mouse: only left button
    if ('button' in e && e.button !== 0) return;
    e.preventDefault();
    const containerEl = e.currentTarget as HTMLElement;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startMin = Math.min(
      Math.max(getMinutesAtClientY(containerEl, scrollRef.current, clientY), 0),
      23 * 60
    );
    // On touch: tap-to-create at that time (no drag — drag conflicts with vertical scroll)
    if ('touches' in e) {
      onComplete(date, minutesToTimeStr(startMin), minutesToTimeStr(Math.min(startMin + 60, 23 * 60 + 45)));
      return;
    }

    dragRef.current = { date, startMin, containerEl };
    setGhost({ date, startMin, endMin: startMin + 60 });

    {
      const onMouseMove = (me: MouseEvent) => updateGhost(me.clientY);
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        completeDrag();
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  }, [scrollRef, updateGhost, completeDrag]);

  return { ghost, startDrag };
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────

function AppleDayView({
  date, blocks, categories, currentTimePx, isToday,
  onCreateBlock, onClickBlock, scrollRef,
}: {
  date: string;
  blocks: TimeBlock[];
  categories: TimeCategory[];
  currentTimePx: number | null;
  isToday: boolean;
  onCreateBlock: (date: string, startTime: string, endTime: string) => void;
  onClickBlock: (block: TimeBlock) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const layout = useMemo(() => buildOverlapLayout(blocks), [blocks]);
  const total = getTotalHours(blocks);
  const { ghost, startDrag } = useDragCreate(scrollRef, onCreateBlock);

  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      {/* Day header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-widest"
            style={{ color: isToday ? '#3b82f6' : 'var(--text-muted)' }}>
            {format(parseISO(date), 'EEE').toUpperCase()}
          </span>
          <span className="text-2xl font-bold w-9 h-9 flex items-center justify-center rounded-full"
            style={{ color: isToday ? '#ffffff' : 'var(--text-primary)', backgroundColor: isToday ? '#3b82f6' : 'transparent' }}>
            {format(parseISO(date), 'd')}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {format(parseISO(date), 'MMMM yyyy')}
          </span>
        </div>
        {total > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {roundHours(Math.round(total * 10) / 10)} logged
          </span>
        )}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100dvh - 200px)' }}>
        <div style={{ display: 'flex' }}>
          <TimeLabels />
          <div
            className="cal-grid-col"
            style={{
              flex: 1, position: 'relative',
              height: 24 * HOUR_HEIGHT,
              borderLeft: '1px solid var(--border)',
              cursor: 'crosshair',
              userSelect: 'none',
            }}
            onMouseDown={(e) => startDrag(e, date)}
            onTouchStart={(e) => startDrag(e, date)}
          >
            <HourLines />
            {blocks.map((block) => {
              const info = layout.get(block.id);
              if (!info) return null;
              return (
                <EventBlock
                  key={block.id} block={block} categories={categories}
                  top={eventTopPx(block.startTime)}
                  height={eventHeightPx(block.startTime, block.endTime)}
                  colPct={(100 / info.totalCols) * info.col}
                  widthPct={100 / info.totalCols}
                  onClick={() => onClickBlock(block)}
                />
              );
            })}
            {ghost && ghost.date === date && (
              <GhostEventBlock startMin={ghost.startMin} endMin={ghost.endMin} />
            )}
            {isToday && currentTimePx !== null && <CurrentTimeIndicator topPx={currentTimePx} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────

function AppleWeekView({
  weekDays, timeBlocks, categories, currentTimePx, today,
  onCreateBlock, onClickBlock, scrollRef,
}: {
  weekDays: Date[];
  timeBlocks: TimeBlock[];
  categories: TimeCategory[];
  currentTimePx: number | null;
  today: string;
  onCreateBlock: (date: string, startTime: string, endTime: string) => void;
  onClickBlock: (block: TimeBlock) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const { ghost, startDrag } = useDragCreate(scrollRef, onCreateBlock);

  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      {/* Day headers */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)', flexShrink: 0, overflowX: 'hidden', minWidth: 'calc(52px + 7 * 90px)' }}>
        <div style={{ width: 52, flexShrink: 0 }} />
        {weekDays.map((day) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const isToday = dayStr === today;
          return (
            <div key={dayStr} className="flex-1 flex flex-col items-center py-2 border-l"
              style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold mb-1 tracking-widest"
                style={{ color: isToday ? '#3b82f6' : 'var(--text-muted)', fontSize: 9 }}>
                {WEEK_DAYS_SHORT[day.getDay()]}
              </span>
              <span className="text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full"
                style={{ color: isToday ? '#ffffff' : 'var(--text-primary)', backgroundColor: isToday ? '#3b82f6' : 'transparent' }}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid — horizontal scroll on mobile so all 7 days remain accessible */}
      <div ref={scrollRef} style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, maxHeight: 'calc(100dvh - 200px)' }}>
        <div style={{ display: 'flex', height: 24 * HOUR_HEIGHT, minWidth: 'calc(52px + 7 * 90px)' }}>
          <TimeLabels />
          {weekDays.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const isToday = dayStr === today;
            const dayBlocks = getDayBlocks(timeBlocks, dayStr);
            const layout = buildOverlapLayout(dayBlocks);
            return (
              <div
                key={dayStr}
                className="cal-grid-col"
                style={{
                  flex: '1 0 90px', position: 'relative',
                  borderLeft: '1px solid var(--border)',
                  height: 24 * HOUR_HEIGHT,
                  backgroundColor: isToday ? 'rgba(59,130,246,0.04)' : 'transparent',
                  cursor: 'crosshair',
                  userSelect: 'none',
                }}
                onMouseDown={(e) => startDrag(e, dayStr)}
                onTouchStart={(e) => startDrag(e, dayStr)}
              >
                <HourLines />
                {dayBlocks.map((block) => {
                  const info = layout.get(block.id);
                  if (!info) return null;
                  return (
                    <EventBlock
                      key={block.id} block={block} categories={categories}
                      top={eventTopPx(block.startTime)}
                      height={eventHeightPx(block.startTime, block.endTime)}
                      colPct={(100 / info.totalCols) * info.col}
                      widthPct={100 / info.totalCols}
                      onClick={() => onClickBlock(block)}
                    />
                  );
                })}
                {ghost?.date === dayStr && (
                  <GhostEventBlock startMin={ghost.startMin} endMin={ghost.endMin} />
                )}
                {isToday && currentTimePx !== null && <CurrentTimeIndicator topPx={currentTimePx} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MONTH VIEW ───────────────────────────────────────────────────────────────

function AppleMonthView({
  timeBlocks, timeCategories, selectedDay, onSelectDay, monthOffset, onMonthOffsetChange,
}: {
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  selectedDay: string;
  onSelectDay: (d: string, switchToDay?: boolean) => void;
  monthOffset: number;
  onMonthOffsetChange: (n: number) => void;
}) {
  const today = todayStr();
  const referenceDate = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const paddedDays: (Date | null)[] = [...Array(startPad).fill(null), ...daysInMonth];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);
  const MAX_PILLS = 3;

  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
        {WEEK_DAYS_SHORT.map((d) => (
          <div key={d} className="py-2.5 text-center font-semibold tracking-widest"
            style={{ color: 'var(--text-muted)', fontSize: 10 }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1">
        {paddedDays.map((day, i) => {
          if (!day) return <div key={i} className="border-b border-r" style={{ borderColor: 'var(--border)', minHeight: 96 }} />;
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayBlocks = getDayBlocks(timeBlocks, dayStr);
          const isToday = dayStr === today;
          const isSelected = dayStr === selectedDay;
          const isCurrentMonth = isSameMonth(day, referenceDate);
          const sorted = dayBlocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
          const visible = sorted.slice(0, MAX_PILLS);
          const overflow = sorted.length - MAX_PILLS;

          return (
            <div key={dayStr}
              className="border-b border-r flex flex-col cursor-pointer transition-colors"
              style={{
                borderColor: 'var(--border)', minHeight: 96, padding: '6px 4px 4px',
                opacity: isCurrentMonth ? 1 : 0.38,
                backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
              }}
              onClick={() => onSelectDay(dayStr)}
              onDoubleClick={() => onSelectDay(dayStr, true)}
              onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <div className="text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 self-start"
                style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 500,
                  color: isToday ? '#ffffff' : 'var(--text-primary)',
                  backgroundColor: isToday ? '#3b82f6' : 'transparent',
                }}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-px overflow-hidden flex-1">
                {visible.map((block) => {
                  const color = getCategoryColor(block.categoryId, timeCategories);
                  const name = block.title?.trim() || getCategoryName(block.categoryId, timeCategories);
                  return (
                    <div key={block.id} className="rounded truncate"
                      style={{ backgroundColor: `${color}28`, borderLeft: `2px solid ${color}`, fontSize: 10, lineHeight: '15px', paddingLeft: 3, color }}>
                      {name}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div style={{ fontSize: 10, lineHeight: '15px', color: 'var(--text-muted)', paddingLeft: 3 }}>
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CALENDAR SIDEBAR ─────────────────────────────────────────────────────────

function CalendarSidebar({
  selectedDay, onSelectDay, timeCategories, hiddenCategoryIds,
  onToggleCategory, onAddEvent,
}: {
  selectedDay: string;
  onSelectDay: (d: string) => void;
  timeCategories: TimeCategory[];
  hiddenCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  onAddEvent: () => void;
}) {
  const [miniOffset, setMiniOffset] = useState(0);
  const today = todayStr();
  const refDate = addMonths(new Date(), miniOffset);
  const monthStart = startOfMonth(refDate);
  const monthEnd = endOfMonth(refDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const padded: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  while (padded.length % 7 !== 0) padded.push(null);

  return (
    <div style={{ width: 220, flexShrink: 0 }} className="flex flex-col gap-3">
      <button onClick={onAddEvent} className="caesar-btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={14} /> Add Event
      </button>

      <div className="caesar-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {format(refDate, 'MMMM yyyy')}
          </span>
          <div className="flex gap-0.5">
            <button onClick={() => setMiniOffset((o) => o - 1)}
              className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setMiniOffset((o) => o + 1)}
              className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-0.5">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center" style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: '20px' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {padded.map((day, i) => {
            if (!day) return <div key={i} style={{ height: 24 }} />;
            const dayStr = format(day, 'yyyy-MM-dd');
            const isToday = dayStr === today;
            const isSelected = dayStr === selectedDay;
            const inMonth = isSameMonth(day, refDate);
            return (
              <button key={dayStr} onClick={() => onSelectDay(dayStr)}
                style={{
                  height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, borderRadius: '50%', fontWeight: isToday || isSelected ? 700 : 400,
                  color: isToday ? '#ffffff' : isSelected ? '#3b82f6' : inMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                  backgroundColor: isToday ? '#3b82f6' : isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                  opacity: inMonth ? 1 : 0.4,
                }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      {timeCategories.length > 0 && (
        <div className="caesar-card p-3">
          <p className="text-xs font-semibold mb-2 tracking-widest" style={{ color: 'var(--text-muted)', fontSize: 9 }}>CALENDARS</p>
          <div className="flex flex-col gap-1.5">
            {timeCategories.map((cat) => {
              const hidden = hiddenCategoryIds.has(cat.id);
              return (
                <button key={cat.id} onClick={() => onToggleCategory(cat.id)}
                  className="flex items-center gap-2 text-left w-full">
                  <div style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, backgroundColor: hidden ? 'transparent' : cat.color, border: `2px solid ${cat.color}` }} />
                  <span style={{ fontSize: 11, color: hidden ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: hidden ? 'line-through' : 'none' }}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ENERGY PICKER ────────────────────────────────────────────────────────────

function EnergyPicker({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-2">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-xs"
          style={{
            borderColor: value === n ? 'var(--border-strong)' : 'var(--border)',
            backgroundColor: value === n ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-primary)',
          }}>
          <span className="text-base">{ENERGY_EMOJIS[n]}</span>
          <span>{ENERGY_LABELS[n]}</span>
        </button>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function TimeTracker({
  timeBlocks, setTimeBlocks, timeCategories, setTimeCategories,
}: Props) {
  const today = todayStr();

  const [calView, setCalView] = useState<CalView>(() => {
    try {
      const v = localStorage.getItem('jarvis:calView') as CalView | null;
      if (v === 'day' || v === 'week' || v === 'month') return v;
      // Default to day view on mobile (screens narrower than 640px)
      return window.innerWidth < 640 ? 'day' : 'week';
    } catch { return 'week'; }
  });
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist selected calendar view across sessions
  useEffect(() => {
    try { localStorage.setItem('jarvis:calView', calView); } catch { /* ignore */ }
  }, [calView]);

  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const currentTimePx = (currentTime.getHours() + currentTime.getMinutes() / 60) * HOUR_HEIGHT;

  useEffect(() => {
    if ((calView === 'day' || calView === 'week') && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, currentTimePx - 160);
    }
  }, [calView]); // eslint-disable-line react-hooks/exhaustive-deps

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── Calendar event notifications ───────────────────────────────────────────
  const { permissionState: notifPermission, requestPermission } =
    useCalendarNotifications(timeBlocks, timeCategories, 10, 'J.A.R.V.I.S.');

  // ─── Smart defaults from intelligence engine ────────────────────────────────
  const timeIntel = useMemo(() => analyzeTime(timeBlocks, timeCategories), [timeBlocks, timeCategories]);
  const smartCategoryId = timeIntel.suggestedCategoryId ?? timeCategories[0]?.id ?? '';

  const [logForm, setLogForm] = useState<LogFormState>({
    date: today,
    categoryId: smartCategoryId,
    title: '', startTime: '09:00', endTime: '10:00', notes: '', energy: 3,
    repeat: 'none', repeatUntil: `${new Date().getFullYear()}-12-31`,
  });
  const [catForm, setCatForm] = useState({ name: '', color: '#3b82f6' });

  const weekDays = useMemo(() => getWeekDays(addDays(new Date(), weekOffset * 7)), [weekOffset]);

  const filteredBlocks = useMemo(() =>
    hiddenCategoryIds.size === 0 ? timeBlocks : timeBlocks.filter((b) => !hiddenCategoryIds.has(b.categoryId)),
    [timeBlocks, hiddenCategoryIds]
  );

  const navTitle = useMemo(() => {
    if (calView === 'day') return format(parseISO(selectedDay), 'EEEE, MMMM d, yyyy');
    if (calView === 'week') {
      const s = weekDays[0]; const e = weekDays[6];
      return format(s, 'MMM d') + ' – ' + format(e, isSameMonth(s, e) ? 'd' : 'MMM d');
    }
    return format(addMonths(new Date(), monthOffset), 'MMMM yyyy');
  }, [calView, selectedDay, weekDays, monthOffset]);

  const openLogModal = useCallback((date?: string, startTime?: string, endTime?: string) => {
    const baseDate = date ?? selectedDay;
    setLogForm({
      date: baseDate,
      categoryId: smartCategoryId,
      title: '',
      startTime: startTime ?? '09:00',
      endTime: endTime ?? '10:00',
      notes: '', energy: 3,
      repeat: 'none',
      repeatUntil: `${new Date().getFullYear()}-12-31`,
    });
    setLogModalOpen(true);
  }, [selectedDay, smartCategoryId]);

  const openEditModal = useCallback((block: TimeBlock) => {
    setLogForm({
      date: block.date, categoryId: block.categoryId,
      title: block.title ?? '', startTime: block.startTime, endTime: block.endTime,
      notes: block.notes, energy: block.energy, editingId: block.id,
      repeat: 'none', repeatUntil: `${new Date().getFullYear()}-12-31`,
    });
    setLogModalOpen(true);
  }, []);

  const handleCreateBlock = useCallback((date: string, startTime: string, endTime: string) => {
    openLogModal(date, startTime, endTime);
  }, [openLogModal]);

  const handleLogSubmit = () => {
    if (!logForm.categoryId || calcDurationHours(logForm.startTime, logForm.endTime) <= 0) return;

    const baseFields = {
      categoryId: logForm.categoryId,
      title: logForm.title.trim() || undefined,
      startTime: logForm.startTime,
      endTime: logForm.endTime,
      notes: logForm.notes.trim(),
      energy: logForm.energy,
    };

    if (logForm.editingId) {
      setTimeBlocks((prev) => prev.map((b) => b.id === logForm.editingId
        ? { ...b, date: logForm.date, ...baseFields }
        : b));
    } else if (logForm.repeat !== 'none' && logForm.repeatUntil >= logForm.date) {
      const recurrenceId = generateId();
      const newBlocks: TimeBlock[] = [];
      let cur = parseISO(logForm.date);
      const until = parseISO(logForm.repeatUntil);
      let safetyCount = 0;
      while (cur <= until && safetyCount < 365) {
        newBlocks.push({ id: generateId(), date: format(cur, 'yyyy-MM-dd'), ...baseFields, recurrenceId });
        if (logForm.repeat === 'daily') cur = addDays(cur, 1);
        else if (logForm.repeat === 'weekly') cur = addDays(cur, 7);
        else if (logForm.repeat === 'biweekly') cur = addDays(cur, 14);
        else cur = addMonths(cur, 1);
        safetyCount++;
      }
      setTimeBlocks((prev) => [...prev, ...newBlocks]);
    } else {
      setTimeBlocks((prev) => [...prev, { id: generateId(), date: logForm.date, ...baseFields }]);
    }
    setLogModalOpen(false);
  };

  const handleDeleteBlock = (id: string, deleteAll = false) => {
    setTimeBlocks((prev) => {
      if (deleteAll) {
        const block = prev.find((b) => b.id === id);
        if (block?.recurrenceId) return prev.filter((b) => b.recurrenceId !== block.recurrenceId);
      }
      return prev.filter((b) => b.id !== id);
    });
    setLogModalOpen(false);
  };

  const handleAddCategory = () => {
    if (!catForm.name.trim()) return;
    setTimeCategories((prev) => [...prev, { id: generateId(), name: catForm.name.trim(), color: catForm.color }]);
    setCatForm({ name: '', color: DEFAULT_COLORS[timeCategories.length % DEFAULT_COLORS.length] });
  };

  const handleDeleteCategory = (id: string) => setTimeCategories((prev) => prev.filter((c) => c.id !== id));

  const handleToggleCategory = (id: string) => {
    setHiddenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNavPrev = () => {
    if (calView === 'day') setSelectedDay(format(addDays(parseISO(selectedDay), -1), 'yyyy-MM-dd'));
    else if (calView === 'week') setWeekOffset((o) => o - 1);
    else setMonthOffset((o) => o - 1);
  };
  const handleNavNext = () => {
    if (calView === 'day') setSelectedDay(format(addDays(parseISO(selectedDay), 1), 'yyyy-MM-dd'));
    else if (calView === 'week') setWeekOffset((o) => o + 1);
    else setMonthOffset((o) => o + 1);
  };
  const handleToday = () => { setSelectedDay(today); setWeekOffset(0); setMonthOffset(0); };

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* Navigation Bar — single row, doesn't wrap on mobile */}
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        {/* Prev / Next / Today */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {[handleNavPrev, handleNavNext].map((fn, i) => {
            const Icon = i === 0 ? ChevronLeft : ChevronRight;
            return (
              <button key={i} onClick={fn} className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                <Icon size={16} />
              </button>
            );
          })}
          <button onClick={handleToday}
            className="px-2 py-1 rounded-lg text-xs font-medium border transition-colors flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
            Today
          </button>
        </div>

        {/* Date title — truncates instead of wrapping */}
        <span className="text-sm font-semibold flex-1 truncate hidden sm:block" style={{ color: 'var(--text-primary)' }}>
          {navTitle}
        </span>

        {/* View toggle + settings */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <div className="flex rounded-full p-0.5" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {(['day', 'week', 'month'] as CalView[]).map((v) => (
              <button key={v} onClick={() => setCalView(v)}
                className="px-2.5 py-1 text-xs font-medium rounded-full transition-all capitalize"
                style={{
                  backgroundColor: calView === v ? 'var(--bg-card)' : 'transparent',
                  color: calView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: calView === v ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setSettingsOpen(true)} className="caesar-btn-ghost p-1.5" title="Manage calendars">
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex gap-4 items-start">
        <div className="hidden lg:block">
          <CalendarSidebar
            selectedDay={selectedDay}
            onSelectDay={(d) => { setSelectedDay(d); if (calView !== 'month') setCalView('day'); }}
            timeCategories={timeCategories}
            hiddenCategoryIds={hiddenCategoryIds}
            onToggleCategory={handleToggleCategory}
            onAddEvent={() => openLogModal()}
          />
        </div>

        {calView === 'day' && (
          <AppleDayView
            date={selectedDay}
            blocks={getDayBlocks(filteredBlocks, selectedDay)}
            categories={timeCategories}
            currentTimePx={currentTimePx}
            isToday={selectedDay === today}
            onCreateBlock={handleCreateBlock}
            onClickBlock={openEditModal}
            scrollRef={scrollRef}
          />
        )}
        {calView === 'week' && (
          <AppleWeekView
            weekDays={weekDays}
            timeBlocks={filteredBlocks}
            categories={timeCategories}
            currentTimePx={currentTimePx}
            today={today}
            onCreateBlock={handleCreateBlock}
            onClickBlock={openEditModal}
            scrollRef={scrollRef}
          />
        )}
        {calView === 'month' && (
          <AppleMonthView
            timeBlocks={filteredBlocks} timeCategories={timeCategories}
            selectedDay={selectedDay}
            onSelectDay={(d, sw) => { setSelectedDay(d); if (sw) setCalView('day'); }}
            monthOffset={monthOffset}
            onMonthOffsetChange={setMonthOffset}
          />
        )}
      </div>

      {/* New / Edit Event Modal */}
      <Modal isOpen={logModalOpen} onClose={() => setLogModalOpen(false)}
        title={logForm.editingId ? 'Edit Event' : 'New Event'} size="md">
        <div className="flex flex-col gap-4">
          <div>
            <label className="caesar-label">Title <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="caesar-input w-full" placeholder="e.g. Deep work, Team standup…"
              value={logForm.title} onChange={(e) => setLogForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
            {timeIntel.recentTitles.length > 0 && !logForm.title && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {timeIntel.recentTitles.map((t) => (
                  <button key={t} type="button"
                    onClick={() => setLogForm((f) => ({ ...f, title: t }))}
                    className="px-2 py-0.5 rounded-full text-xs border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Date</label>
              <input type="date" className="caesar-input w-full" value={logForm.date}
                onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="caesar-label">Calendar</label>
              {timeCategories.length === 0 ? (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>No calendars — add in Settings.</p>
              ) : (
                <select className="caesar-input w-full" value={logForm.categoryId}
                  onChange={(e) => setLogForm((f) => ({ ...f, categoryId: e.target.value }))}>
                  {timeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Clean time selects */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Start</label>
              <TimeSelect value={logForm.startTime} onChange={(v) => setLogForm((f) => ({ ...f, startTime: v }))} />
            </div>
            <div>
              <label className="caesar-label">End</label>
              <TimeSelect value={logForm.endTime} onChange={(v) => setLogForm((f) => ({ ...f, endTime: v }))} />
            </div>
          </div>

          {(() => {
            const d = calcDurationHours(logForm.startTime, logForm.endTime);
            return d > 0 ? (
              <p className="text-xs -mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Clock size={11} /> {roundHours(d)} duration
              </p>
            ) : (
              <p className="text-xs -mt-2" style={{ color: '#ef4444' }}>End must be after start</p>
            );
          })()}

          {/* Repeat options — only on new events */}
          {!logForm.editingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Repeat</label>
                <select className="caesar-input w-full" value={logForm.repeat}
                  onChange={(e) => setLogForm((f) => ({ ...f, repeat: e.target.value as RepeatOption }))}>
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {logForm.repeat !== 'none' && (
                <div>
                  <label className="caesar-label">Repeat until</label>
                  <input type="date" className="caesar-input w-full"
                    value={logForm.repeatUntil}
                    min={logForm.date}
                    onChange={(e) => setLogForm((f) => ({ ...f, repeatUntil: e.target.value }))} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="caesar-label">Notes</label>
            <textarea className="caesar-input w-full resize-none" rows={2} placeholder="What did you work on?"
              value={logForm.notes} onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <label className="caesar-label">Energy</label>
            <EnergyPicker value={logForm.energy} onChange={(v) => setLogForm((f) => ({ ...f, energy: v }))} />
          </div>

          <div className="flex gap-3 pt-1">
            {logForm.editingId && (() => {
              const isRecurring = !!timeBlocks.find((b) => b.id === logForm.editingId)?.recurrenceId;
              return isRecurring ? (
                <>
                  <button onClick={() => handleDeleteBlock(logForm.editingId!)}
                    className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs"
                    style={{ color: '#ef4444' }}>
                    <Trash2 size={13} /> This event
                  </button>
                  <button onClick={() => handleDeleteBlock(logForm.editingId!, true)}
                    className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs"
                    style={{ color: '#ef4444' }}>
                    <Trash2 size={13} /> All events
                  </button>
                </>
              ) : (
                <button onClick={() => handleDeleteBlock(logForm.editingId!)}
                  className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs"
                  style={{ color: '#ef4444' }}>
                  <Trash2 size={13} /> Delete
                </button>
              );
            })()}
            <button onClick={() => setLogModalOpen(false)} className="caesar-btn-ghost flex-1">Cancel</button>
            <button onClick={handleLogSubmit} className="caesar-btn-primary flex-1"
              disabled={!logForm.categoryId || calcDurationHours(logForm.startTime, logForm.endTime) <= 0}>
              {logForm.editingId ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Manage Calendars" size="md">
        <div className="flex flex-col gap-5">
          <div>
            <p className="caesar-label mb-2">Calendars</p>
            {timeCategories.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No calendars yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {timeCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-3 p-2.5 rounded-lg border"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-1" style={{ color: 'var(--text-muted)' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t" style={{ borderColor: 'var(--border)' }} />
          <div>
            <p className="caesar-label mb-3">New Calendar</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="caesar-label">Name</label>
                <input className="caesar-input w-full" placeholder="e.g. Work, Personal, Health"
                  value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="caesar-label">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border"
                    style={{ borderColor: 'var(--border)' }}
                    value={catForm.color} onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))} />
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_COLORS.map((c) => (
                      <button key={c} onClick={() => setCatForm((f) => ({ ...f, color: c }))}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: catForm.color === c ? 'white' : 'transparent', transform: catForm.color === c ? 'scale(1.15)' : 'scale(1)' }} />
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleAddCategory} className="caesar-btn-primary flex items-center gap-2 justify-center" disabled={!catForm.name.trim()}>
                <Plus size={14} /> Add Calendar
              </button>
            </div>
          </div>
          {/* Notifications */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <p className="caesar-label mb-2 flex items-center gap-1.5">
              <Bell size={12} /> Event Reminders
            </p>
            {notifPermission === 'granted' ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Notifications on — you'll be reminded 10 min before each event today.
              </p>
            ) : notifPermission === 'denied' ? (
              <p className="text-xs" style={{ color: '#ef4444' }}>
                Notifications blocked — enable them in your browser settings to get reminders.
              </p>
            ) : notifPermission === 'unsupported' ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Push notifications not supported in this browser.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Get a notification 10 min before each event starts today.
                </p>
                <button onClick={requestPermission} className="caesar-btn-primary flex items-center gap-2 justify-center">
                  <Bell size={13} /> Enable Reminders
                </button>
              </div>
            )}
          </div>

          <button onClick={() => setSettingsOpen(false)} className="caesar-btn-ghost w-full">Done</button>
        </div>
      </Modal>
    </div>
  );
}
