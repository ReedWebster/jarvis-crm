/**
 * TeamCalendarView — same Apple-style calendar as the personal Calendar,
 * but backed by workspace_data (shared across all co-founders).
 * Default categories: Meeting, Filming, Editing, Creative, Admin.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Clock, Settings, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import {
  format, startOfWeek, addDays, parseISO,
  startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, getDay, addMonths, isBefore,
} from 'date-fns';
import type { TimeBlock, TimeCategory, Client } from '../../types';
import {
  generateId, todayStr, calcDurationHours,
  getCategoryColor, getCategoryName, formatTime,
} from '../../utils';
import { Modal } from '../shared/Modal';
import { TimeSelect } from '../shared/TimeSelect';
import { useWorkspaceStorage } from '../../hooks/useWorkspaceStorage';
import { useCalendarNotifications } from '../../hooks/useCalendarNotifications';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 64;
const MIN_EVENT_HEIGHT = 22;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEK_DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280'];

const DEFAULT_TEAM_CATEGORIES: TimeCategory[] = [
  { id: 'tc-meeting',  name: 'Meeting',  color: '#3b82f6' },
  { id: 'tc-filming',  name: 'Filming',  color: '#10b981' },
  { id: 'tc-editing',  name: 'Editing',  color: '#f59e0b' },
  { id: 'tc-creative', name: 'Creative', color: '#8b5cf6' },
  { id: 'tc-admin',    name: 'Admin',    color: '#6b7280' },
];

type CalView = 'day' | 'week' | 'month';

type RepeatOption = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface LogFormState {
  date: string;
  categoryId: string;
  title: string;
  startTime: string;
  endTime: string;
  notes: string;
  clientId: string;
  repeat: RepeatOption;
  repeatUntil: string;
  editingId?: string;
}

interface EventLayoutInfo { col: number; totalCols: number; }
interface GhostBlock { date: string; startMin: number; endMin: number; }

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}
function snapToGrid(minutes: number): number { return Math.round(minutes / 15) * 15; }
function minutesToTimeStr(minutes: number): string {
  const c = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}
function eventTopPx(startTime: string): number { return (timeToMinutes(startTime) / 60) * HOUR_HEIGHT; }
function eventHeightPx(s: string, e: string): number { return Math.max(calcDurationHours(s, e) * HOUR_HEIGHT, MIN_EVENT_HEIGHT); }

function buildOverlapLayout(blocks: TimeBlock[]): Map<string, EventLayoutInfo> {
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const colEnds: number[] = [];
  const blockCols = new Map<string, number>();
  for (const block of sorted) {
    const startMin = timeToMinutes(block.startTime);
    let col = colEnds.findIndex(end => end <= startMin);
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
      const other = sorted.find(b => b.id === id);
      if (!other) continue;
      if (timeToMinutes(other.startTime) < endMin && timeToMinutes(other.endTime) > startMin) maxCol = Math.max(maxCol, c);
    }
    result.set(block.id, { col, totalCols: maxCol + 1 });
  }
  return result;
}

function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM'; if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
function getDayBlocks(blocks: TimeBlock[], date: string): TimeBlock[] { return blocks.filter(b => b.date === date); }
function getTotalHours(blocks: TimeBlock[]): number { return blocks.reduce((s, b) => s + calcDurationHours(b.startTime, b.endTime), 0); }
function roundHours(h: number): string { return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`; }
function getWeekDays(ref: Date): Date[] { const s = startOfWeek(ref, { weekStartsOn: 0 }); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
function getMinutesAtClientY(el: HTMLElement, _scroll: HTMLElement | null, clientY: number): number {
  return snapToGrid(Math.round(((clientY - el.getBoundingClientRect().top) / HOUR_HEIGHT) * 60));
}

// ─── EVENT BLOCK ──────────────────────────────────────────────────────────────

function EventBlock({ block, categories, top, height, colPct, widthPct, onClick, clientName }: {
  block: TimeBlock; categories: TimeCategory[]; top: number; height: number;
  colPct: number; widthPct: number; onClick: () => void; clientName?: string;
}) {
  const color = getCategoryColor(block.categoryId, categories);
  const displayName = block.title?.trim() || getCategoryName(block.categoryId, categories);
  const isShort = height < 38;
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${displayName}${clientName ? ` · ${clientName}` : ''}\n${formatTime(block.startTime)} – ${formatTime(block.endTime)}`}
      style={{
        position: 'absolute', top: top + 1, height: height - 2,
        left: `calc(${colPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${color}28`, borderLeft: `3px solid ${color}`,
        borderRadius: 6, cursor: 'pointer', overflow: 'hidden',
        padding: isShort ? '0 5px' : '3px 6px',
        display: 'flex', flexDirection: isShort ? 'row' : 'column',
        alignItems: isShort ? 'center' : 'flex-start', gap: isShort ? 4 : 1,
        zIndex: 1, boxSizing: 'border-box', transition: 'filter 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(0.92)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none'; }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
        {displayName}
      </span>
      {!isShort && <span style={{ fontSize: 10, color: `${color}bb`, lineHeight: 1.2 }}>{formatTime(block.startTime)} – {formatTime(block.endTime)}</span>}
      {!isShort && clientName && <span style={{ fontSize: 9, color: `${color}99`, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>● {clientName}</span>}
    </div>
  );
}

// ─── GHOST BLOCK ──────────────────────────────────────────────────────────────

function GhostEventBlock({ startMin, endMin }: { startMin: number; endMin: number }) {
  return (
    <div style={{
      position: 'absolute', top: (startMin / 60) * HOUR_HEIGHT + 1,
      height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 24) - 2,
      left: 2, right: 2, backgroundColor: 'rgba(59,130,246,0.15)',
      border: '2px solid #3b82f6', borderRadius: 6, zIndex: 3, pointerEvents: 'none',
      display: 'flex', alignItems: 'flex-start', padding: '3px 6px',
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6' }}>
        {minutesToTimeStr(startMin)} – {minutesToTimeStr(endMin)}
      </span>
    </div>
  );
}

// ─── CURRENT TIME INDICATOR ───────────────────────────────────────────────────

function CurrentTimeIndicator({ topPx }: { topPx: number }) {
  return (
    <div style={{ position: 'absolute', top: topPx - 1, left: -7, right: 0, zIndex: 5, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 2, backgroundColor: '#ef4444' }} />
    </div>
  );
}

// ─── HOUR GRID LINES ──────────────────────────────────────────────────────────

function HourLines() {
  return (
    <>
      {HOURS.map(h => (
        <React.Fragment key={h}>
          <div style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, borderTop: '1px solid var(--border)', zIndex: 0 }} />
          <div style={{ position: 'absolute', top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: '1px solid var(--border)', opacity: 0.35, zIndex: 0 }} />
        </React.Fragment>
      ))}
    </>
  );
}

// ─── TIME LABELS ──────────────────────────────────────────────────────────────

function TimeLabels() {
  return (
    <div style={{ width: 52, flexShrink: 0 }}>
      {HOURS.map(h => (
        <div key={h} style={{ height: HOUR_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 10, paddingTop: 6 }}>
          {h > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1, whiteSpace: 'nowrap' }}>{formatHourLabel(h)}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── DRAG HOOK ────────────────────────────────────────────────────────────────

function useDragCreate(scrollRef: React.RefObject<HTMLDivElement>, onComplete: (date: string, startTime: string, endTime: string) => void) {
  const [ghost, setGhost] = useState<GhostBlock | null>(null);
  const dragRef = useRef<{ date: string; startMin: number; containerEl: HTMLElement } | null>(null);

  const startDrag = useCallback((e: React.MouseEvent, date: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const containerEl = e.currentTarget as HTMLElement;
    const startMin = Math.min(Math.max(getMinutesAtClientY(containerEl, scrollRef.current, e.clientY), 0), 23 * 60);
    dragRef.current = { date, startMin, containerEl };
    setGhost({ date, startMin, endMin: startMin + 60 });

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const endMin = Math.min(Math.max(getMinutesAtClientY(dragRef.current.containerEl, scrollRef.current, me.clientY), dragRef.current.startMin + 15), 24 * 60);
      setGhost({ date: dragRef.current.date, startMin: dragRef.current.startMin, endMin });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current) return;
      const { date: d, startMin } = dragRef.current;
      dragRef.current = null;
      setGhost(prev => {
        const endMin = prev ? prev.endMin : startMin + 60;
        onComplete(d, minutesToTimeStr(startMin), minutesToTimeStr(Math.min(endMin, 23 * 60 + 45)));
        return null;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [scrollRef, onComplete]);

  return { ghost, startDrag };
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────

function AppleDayView({ date, blocks, categories, currentTimePx, isToday, onCreateBlock, onClickBlock, scrollRef, clientsMap }: {
  date: string; blocks: TimeBlock[]; categories: TimeCategory[];
  currentTimePx: number | null; isToday: boolean; clientsMap: Map<string, string>;
  onCreateBlock: (date: string, startTime: string, endTime: string) => void;
  onClickBlock: (block: TimeBlock) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const layout = useMemo(() => buildOverlapLayout(blocks), [blocks]);
  const total = getTotalHours(blocks);
  const { ghost, startDrag } = useDragCreate(scrollRef, onCreateBlock);

  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: isToday ? '#3b82f6' : 'var(--text-muted)' }}>{format(parseISO(date), 'EEE').toUpperCase()}</span>
        <span className="text-2xl font-bold w-9 h-9 flex items-center justify-center rounded-full" style={{ color: isToday ? '#fff' : 'var(--text-primary)', backgroundColor: isToday ? '#3b82f6' : 'transparent' }}>{format(parseISO(date), 'd')}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{format(parseISO(date), 'MMMM yyyy')}</span>
        {total > 0 && <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{roundHours(Math.round(total * 10) / 10)} logged</span>}
      </div>
      <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'flex' }}>
          <TimeLabels />
          <div style={{ flex: 1, position: 'relative', height: 24 * HOUR_HEIGHT, borderLeft: '1px solid var(--border)', cursor: 'crosshair', userSelect: 'none' }} onMouseDown={e => startDrag(e, date)}>
            <HourLines />
            {blocks.map(block => {
              const info = layout.get(block.id);
              if (!info) return null;
              return <EventBlock key={block.id} block={block} categories={categories} top={eventTopPx(block.startTime)} height={eventHeightPx(block.startTime, block.endTime)} colPct={(100 / info.totalCols) * info.col} widthPct={100 / info.totalCols} onClick={() => onClickBlock(block)} clientName={block.clientId ? clientsMap.get(block.clientId) : undefined} />;
            })}
            {ghost?.date === date && <GhostEventBlock startMin={ghost.startMin} endMin={ghost.endMin} />}
            {isToday && currentTimePx !== null && <CurrentTimeIndicator topPx={currentTimePx} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────

function AppleWeekView({ weekDays, timeBlocks, categories, currentTimePx, today, onCreateBlock, onClickBlock, scrollRef, clientsMap }: {
  weekDays: Date[]; timeBlocks: TimeBlock[]; categories: TimeCategory[];
  currentTimePx: number | null; today: string; clientsMap: Map<string, string>;
  onCreateBlock: (date: string, startTime: string, endTime: string) => void;
  onClickBlock: (block: TimeBlock) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const { ghost, startDrag } = useDragCreate(scrollRef, onCreateBlock);
  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      <div className="flex border-b" style={{ borderColor: 'var(--border)', flexShrink: 0 }}>
        <div style={{ width: 52, flexShrink: 0 }} />
        {weekDays.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const isToday = dayStr === today;
          return (
            <div key={dayStr} className="flex-1 flex flex-col items-center py-2 border-l" style={{ borderColor: 'var(--border)' }}>
              <span style={{ fontSize: 9, color: isToday ? '#3b82f6' : 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em' }}>{WEEK_DAYS_SHORT[day.getDay()]}</span>
              <span className="text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full" style={{ color: isToday ? '#fff' : 'var(--text-primary)', backgroundColor: isToday ? '#3b82f6' : 'transparent' }}>{format(day, 'd')}</span>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'flex', height: 24 * HOUR_HEIGHT }}>
          <TimeLabels />
          {weekDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const isToday = dayStr === today;
            const dayBlocks = getDayBlocks(timeBlocks, dayStr);
            const layout = buildOverlapLayout(dayBlocks);
            return (
              <div key={dayStr} style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--border)', height: 24 * HOUR_HEIGHT, backgroundColor: isToday ? 'rgba(59,130,246,0.04)' : 'transparent', cursor: 'crosshair', userSelect: 'none' }} onMouseDown={e => startDrag(e, dayStr)}>
                <HourLines />
                {dayBlocks.map(block => {
                  const info = layout.get(block.id);
                  if (!info) return null;
                  return <EventBlock key={block.id} block={block} categories={categories} top={eventTopPx(block.startTime)} height={eventHeightPx(block.startTime, block.endTime)} colPct={(100 / info.totalCols) * info.col} widthPct={100 / info.totalCols} onClick={() => onClickBlock(block)} clientName={block.clientId ? clientsMap.get(block.clientId) : undefined} />;
                })}
                {ghost?.date === dayStr && <GhostEventBlock startMin={ghost.startMin} endMin={ghost.endMin} />}
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

function AppleMonthView({ timeBlocks, timeCategories, selectedDay, onSelectDay, monthOffset }: {
  timeBlocks: TimeBlock[]; timeCategories: TimeCategory[];
  selectedDay: string; onSelectDay: (d: string, switchToDay?: boolean) => void;
  monthOffset: number;
}) {
  const today = todayStr();
  const refDate = addMonths(new Date(), monthOffset);
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(refDate), end: endOfMonth(refDate) });
  const startPad = getDay(startOfMonth(refDate));
  const paddedDays: (Date | null)[] = [...Array(startPad).fill(null), ...daysInMonth];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  return (
    <div className="flex-1 rounded-xl overflow-hidden border flex flex-col" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
        {WEEK_DAYS_SHORT.map(d => <div key={d} className="py-2.5 text-center font-semibold tracking-widest" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 flex-1">
        {paddedDays.map((day, i) => {
          if (!day) return <div key={i} className="border-b border-r" style={{ borderColor: 'var(--border)', minHeight: 96 }} />;
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayBlocks = getDayBlocks(timeBlocks, dayStr);
          const isToday = dayStr === today;
          const isSelected = dayStr === selectedDay;
          const inMonth = isSameMonth(day, refDate);
          const sorted = dayBlocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
          const visible = sorted.slice(0, 3);
          const overflow = sorted.length - 3;
          return (
            <div key={dayStr} className="border-b border-r flex flex-col cursor-pointer transition-colors" style={{ borderColor: 'var(--border)', minHeight: 96, padding: '6px 4px 4px', opacity: inMonth ? 1 : 0.38, backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent' }}
              onClick={() => onSelectDay(dayStr)} onDoubleClick={() => onSelectDay(dayStr, true)}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? '#fff' : 'var(--text-primary)', backgroundColor: isToday ? '#3b82f6' : 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', marginBottom: 4 }}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-px overflow-hidden flex-1">
                {visible.map(block => {
                  const color = getCategoryColor(block.categoryId, timeCategories);
                  const name = block.title?.trim() || getCategoryName(block.categoryId, timeCategories);
                  return <div key={block.id} className="rounded truncate" style={{ backgroundColor: `${color}28`, borderLeft: `2px solid ${color}`, fontSize: 10, lineHeight: '15px', paddingLeft: 3, color }}>{name}</div>;
                })}
                {overflow > 0 && <div style={{ fontSize: 10, lineHeight: '15px', color: 'var(--text-muted)', paddingLeft: 3 }}>+{overflow} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CALENDAR SIDEBAR ─────────────────────────────────────────────────────────

function CalendarSidebar({ selectedDay, onSelectDay, timeCategories, hiddenCategoryIds, onToggleCategory, onAddEvent }: {
  selectedDay: string; onSelectDay: (d: string) => void;
  timeCategories: TimeCategory[]; hiddenCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void; onAddEvent: () => void;
}) {
  const [miniOffset, setMiniOffset] = useState(0);
  const today = todayStr();
  const refDate = addMonths(new Date(), miniOffset);
  const days = eachDayOfInterval({ start: startOfMonth(refDate), end: endOfMonth(refDate) });
  const startPad = getDay(startOfMonth(refDate));
  const padded: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  while (padded.length % 7 !== 0) padded.push(null);

  return (
    <div style={{ width: 220, flexShrink: 0 }} className="flex flex-col gap-3">
      <button onClick={onAddEvent} className="caesar-btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={14} /> Add Event
      </button>

      <div className="caesar-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{format(refDate, 'MMMM yyyy')}</span>
          <div className="flex gap-0.5">
            <button onClick={() => setMiniOffset(o => o - 1)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setMiniOffset(o => o + 1)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
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
              <button key={dayStr} onClick={() => onSelectDay(dayStr)} style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, borderRadius: '50%', fontWeight: isToday || isSelected ? 700 : 400, color: isToday ? '#fff' : isSelected ? '#3b82f6' : inMonth ? 'var(--text-primary)' : 'var(--text-muted)', backgroundColor: isToday ? '#3b82f6' : isSelected ? 'rgba(59,130,246,0.12)' : 'transparent', opacity: inMonth ? 1 : 0.4 }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      {timeCategories.length > 0 && (
        <div className="caesar-card p-3">
          <p style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 8 }}>CALENDARS</p>
          <div className="flex flex-col gap-1.5">
            {timeCategories.map(cat => {
              const hidden = hiddenCategoryIds.has(cat.id);
              return (
                <button key={cat.id} onClick={() => onToggleCategory(cat.id)} className="flex items-center gap-2 text-left w-full">
                  <div style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, backgroundColor: hidden ? 'transparent' : cat.color, border: `2px solid ${cat.color}` }} />
                  <span style={{ fontSize: 11, color: hidden ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: hidden ? 'line-through' : 'none' }}>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export function TeamCalendarView() {
  const today = todayStr();
  const [teamBlocks, setTeamBlocks] = useWorkspaceStorage<TimeBlock[]>('teamBlocks', []);
  const [teamCategories, setTeamCategories] = useWorkspaceStorage<TimeCategory[]>('teamCategories', DEFAULT_TEAM_CATEGORIES);
  const [teamClients] = useWorkspaceStorage<Client[]>('clients', []);
  const clientsMap = useMemo(() => new Map(teamClients.map(c => [c.id, c.name])), [teamClients]);

  const [calView, setCalView] = useState<CalView>('week');
  const [selectedDay, setSelectedDay] = useState(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const currentTimePx = (currentTime.getHours() + currentTime.getMinutes() / 60) * HOUR_HEIGHT;

  // ─── Calendar event notifications ─────────────────────────────────────────
  const { permissionState: notifPermission, requestPermission } =
    useCalendarNotifications(teamBlocks, teamCategories, 10, 'Team Calendar');

  useEffect(() => {
    if ((calView === 'day' || calView === 'week') && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, currentTimePx - 160);
    }
  }, [calView]); // eslint-disable-line react-hooks/exhaustive-deps

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', color: '#3b82f6' });

  const [logForm, setLogForm] = useState<LogFormState>({
    date: today, categoryId: teamCategories[0]?.id ?? '',
    title: '', startTime: '09:00', endTime: '10:00', notes: '', clientId: '',
    repeat: 'none', repeatUntil: `${new Date().getFullYear()}-12-31`,
  });

  const weekDays = useMemo(() => getWeekDays(addDays(new Date(), weekOffset * 7)), [weekOffset]);
  const filteredBlocks = useMemo(() =>
    hiddenCategoryIds.size === 0 ? teamBlocks : teamBlocks.filter(b => !hiddenCategoryIds.has(b.categoryId)),
    [teamBlocks, hiddenCategoryIds]
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
    setLogForm({ date: baseDate, categoryId: teamCategories[0]?.id ?? '', title: '', startTime: startTime ?? '09:00', endTime: endTime ?? '10:00', notes: '', clientId: '', repeat: 'none', repeatUntil: `${new Date().getFullYear()}-12-31` });
    setLogModalOpen(true);
  }, [selectedDay, teamCategories]);

  const openEditModal = useCallback((block: TimeBlock) => {
    setLogForm({ date: block.date, categoryId: block.categoryId, title: block.title ?? '', startTime: block.startTime, endTime: block.endTime, notes: block.notes, clientId: block.clientId ?? '', repeat: 'none', repeatUntil: `${new Date().getFullYear()}-12-31`, editingId: block.id });
    setLogModalOpen(true);
  }, []);

  const handleLogSubmit = () => {
    if (!logForm.categoryId || calcDurationHours(logForm.startTime, logForm.endTime) <= 0) return;
    const fields = { categoryId: logForm.categoryId, title: logForm.title.trim() || undefined, startTime: logForm.startTime, endTime: logForm.endTime, notes: logForm.notes.trim(), energy: 3 as const, ...(logForm.clientId ? { clientId: logForm.clientId } : { clientId: undefined }) };
    if (logForm.editingId) {
      setTeamBlocks(prev => prev.map(b => b.id === logForm.editingId ? { ...b, date: logForm.date, ...fields } : b));
    } else if (logForm.repeat !== 'none' && logForm.repeatUntil >= logForm.date) {
      const recurrenceId = generateId();
      const newBlocks: TimeBlock[] = [];
      let cur = parseISO(logForm.date);
      const until = parseISO(logForm.repeatUntil);
      let safety = 0;
      while (!isBefore(until, cur) && safety < 365) {
        newBlocks.push({ id: generateId(), date: format(cur, 'yyyy-MM-dd'), ...fields, recurrenceId });
        if (logForm.repeat === 'daily') cur = addDays(cur, 1);
        else if (logForm.repeat === 'weekly') cur = addDays(cur, 7);
        else if (logForm.repeat === 'biweekly') cur = addDays(cur, 14);
        else cur = addMonths(cur, 1);
        safety++;
      }
      setTeamBlocks(prev => [...prev, ...newBlocks]);
    } else {
      setTeamBlocks(prev => [...prev, { id: generateId(), date: logForm.date, ...fields }]);
    }
    setLogModalOpen(false);
  };

  const handleDeleteBlock = (id: string, deleteAll = false) => {
    setTeamBlocks(prev => {
      if (deleteAll) {
        const block = prev.find(b => b.id === id);
        if (block?.recurrenceId) return prev.filter(b => b.recurrenceId !== block.recurrenceId);
      }
      return prev.filter(b => b.id !== id);
    });
    setLogModalOpen(false);
  };
  const handleAddCategory = () => {
    if (!catForm.name.trim()) return;
    setTeamCategories(prev => [...prev, { id: generateId(), name: catForm.name.trim(), color: catForm.color }]);
    setCatForm({ name: '', color: DEFAULT_COLORS[teamCategories.length % DEFAULT_COLORS.length] });
  };
  const handleDeleteCategory = (id: string) => setTeamCategories(prev => prev.filter(c => c.id !== id));
  const handleToggleCategory = (id: string) => setHiddenCategoryIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleNavPrev = () => {
    if (calView === 'day') setSelectedDay(format(addDays(parseISO(selectedDay), -1), 'yyyy-MM-dd'));
    else if (calView === 'week') setWeekOffset(o => o - 1);
    else setMonthOffset(o => o - 1);
  };
  const handleNavNext = () => {
    if (calView === 'day') setSelectedDay(format(addDays(parseISO(selectedDay), 1), 'yyyy-MM-dd'));
    else if (calView === 'week') setWeekOffset(o => o + 1);
    else setMonthOffset(o => o + 1);
  };
  const handleToday = () => { setSelectedDay(today); setWeekOffset(0); setMonthOffset(0); };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Navigation Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {[handleNavPrev, handleNavNext].map((fn, i) => {
            const Icon = i === 0 ? ChevronLeft : ChevronRight;
            return (
              <button key={i} onClick={fn} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
                <Icon size={16} />
              </button>
            );
          })}
          <button onClick={handleToday} className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}>
            Today
          </button>
          <span className="text-sm font-semibold ml-1 hidden sm:block" style={{ color: 'var(--text-primary)' }}>{navTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full p-0.5" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {(['day', 'week', 'month'] as CalView[]).map(v => (
              <button key={v} onClick={() => setCalView(v)} className="px-3 py-1 text-xs font-medium rounded-full transition-all" style={{ backgroundColor: calView === v ? 'var(--bg-card)' : 'transparent', color: calView === v ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: calView === v ? '0 1px 3px rgba(0,0,0,0.15)' : 'none' }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => setSettingsOpen(true)} className="caesar-btn-ghost p-2" title="Manage calendars">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex gap-4 items-start">
        <div className="hidden lg:block">
          <CalendarSidebar
            selectedDay={selectedDay}
            onSelectDay={d => { setSelectedDay(d); if (calView !== 'month') setCalView('day'); }}
            timeCategories={teamCategories}
            hiddenCategoryIds={hiddenCategoryIds}
            onToggleCategory={handleToggleCategory}
            onAddEvent={() => openLogModal()}
          />
        </div>
        {calView === 'day' && <AppleDayView date={selectedDay} blocks={getDayBlocks(filteredBlocks, selectedDay)} categories={teamCategories} currentTimePx={currentTimePx} isToday={selectedDay === today} onCreateBlock={openLogModal} onClickBlock={openEditModal} scrollRef={scrollRef} clientsMap={clientsMap} />}
        {calView === 'week' && <AppleWeekView weekDays={weekDays} timeBlocks={filteredBlocks} categories={teamCategories} currentTimePx={currentTimePx} today={today} onCreateBlock={openLogModal} onClickBlock={openEditModal} scrollRef={scrollRef} clientsMap={clientsMap} />}
        {calView === 'month' && <AppleMonthView timeBlocks={filteredBlocks} timeCategories={teamCategories} selectedDay={selectedDay} onSelectDay={(d, sw) => { setSelectedDay(d); if (sw) setCalView('day'); }} monthOffset={monthOffset} />}
      </div>

      {/* New / Edit Event Modal */}
      <Modal isOpen={logModalOpen} onClose={() => setLogModalOpen(false)} title={logForm.editingId ? 'Edit Event' : 'New Event'} size="md">
        <div className="flex flex-col gap-4">
          <div>
            <label className="caesar-label">Title <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="caesar-input w-full" placeholder="e.g. Team meeting, Filming session…" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Date</label>
              <input type="date" className="caesar-input w-full" value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="caesar-label">Calendar</label>
              {teamCategories.length === 0 ? (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>No calendars — add in Settings.</p>
              ) : (
                <select className="caesar-input w-full" value={logForm.categoryId} onChange={e => setLogForm(f => ({ ...f, categoryId: e.target.value }))}>
                  {teamCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Start</label>
              <TimeSelect value={logForm.startTime} onChange={v => setLogForm(f => ({ ...f, startTime: v }))} />
            </div>
            <div>
              <label className="caesar-label">End</label>
              <TimeSelect value={logForm.endTime} onChange={v => setLogForm(f => ({ ...f, endTime: v }))} />
            </div>
          </div>
          {(() => {
            const d = calcDurationHours(logForm.startTime, logForm.endTime);
            return d > 0
              ? <p className="text-xs -mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Clock size={11} /> {roundHours(d)} duration</p>
              : <p className="text-xs -mt-2" style={{ color: '#ef4444' }}>End must be after start</p>;
          })()}
          {/* Repeat — only on new events */}
          {!logForm.editingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Repeat</label>
                <select className="caesar-input w-full" value={logForm.repeat} onChange={e => setLogForm(f => ({ ...f, repeat: e.target.value as RepeatOption }))}>
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
                  <input type="date" className="caesar-input w-full" value={logForm.repeatUntil} min={logForm.date} onChange={e => setLogForm(f => ({ ...f, repeatUntil: e.target.value }))} />
                </div>
              )}
            </div>
          )}
          {teamClients.length > 0 && (
            <div>
              <label className="caesar-label">Linked Client <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <select className="caesar-input w-full" value={logForm.clientId} onChange={e => setLogForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">No client linked</option>
                {teamClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="caesar-label">Notes</label>
            <textarea className="caesar-input w-full resize-none" rows={2} placeholder="Details, location, etc." value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-1">
            {logForm.editingId && (() => {
              const isRecurring = !!teamBlocks.find(b => b.id === logForm.editingId)?.recurrenceId;
              return isRecurring ? (
                <>
                  <button onClick={() => handleDeleteBlock(logForm.editingId!)} className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs" style={{ color: '#ef4444' }}>
                    <Trash2 size={13} /> This event
                  </button>
                  <button onClick={() => handleDeleteBlock(logForm.editingId!, true)} className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs" style={{ color: '#ef4444' }}>
                    <Trash2 size={13} /> All events
                  </button>
                </>
              ) : (
                <button onClick={() => handleDeleteBlock(logForm.editingId!)} className="caesar-btn-ghost px-3 flex items-center gap-1.5 text-xs" style={{ color: '#ef4444' }}>
                  <Trash2 size={13} /> Delete
                </button>
              );
            })()}
            <button onClick={() => setLogModalOpen(false)} className="caesar-btn-ghost flex-1">Cancel</button>
            <button onClick={handleLogSubmit} className="caesar-btn-primary flex-1" disabled={!logForm.categoryId || calcDurationHours(logForm.startTime, logForm.endTime) <= 0}>
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
            {teamCategories.length === 0 ? (
              <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No calendars yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {teamCategories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-1" style={{ color: 'var(--text-muted)' }}><Trash2 size={13} /></button>
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
                <input className="caesar-input w-full" placeholder="e.g. Filming, Meetings, Creative" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="caesar-label">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" className="w-10 h-10 rounded cursor-pointer border" style={{ borderColor: 'var(--border)' }} value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} />
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_COLORS.map(c => <button key={c} onClick={() => setCatForm(f => ({ ...f, color: c }))} className="w-6 h-6 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: catForm.color === c ? 'white' : 'transparent', transform: catForm.color === c ? 'scale(1.15)' : 'scale(1)' }} />)}
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
                Notifications on — you'll be reminded 10 min before each team event today.
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
                  Get a notification 10 min before each team event starts today.
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
