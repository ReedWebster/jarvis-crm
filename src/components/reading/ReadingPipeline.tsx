import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Lightbulb,
  Filter,
  Award,
  Clock,
  Mic,
  Video,
  FileText,
  BookMarked,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
} from 'date-fns';
import type { ReadingItem, ReadingStatus, ReadingType } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge } from '../shared/Badge';
import { useTheme } from '../../hooks/useTheme';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const READING_TYPES: ReadingType[] = ['book', 'article', 'course', 'podcast', 'video'];

const TYPE_COLORS: Record<string, string> = {
  book:    'var(--text-muted)',
  article: 'var(--text-muted)',
  course:  'var(--text-muted)',
  podcast: 'var(--text-muted)',
  video:   'var(--text-muted)',
};

const TYPE_HOURS: Record<ReadingType, number> = {
  book: 8,
  article: 0.5,
  course: 4,
  podcast: 1,
  video: 0.75,
};

const COLUMNS: { key: ReadingStatus; label: string }[] = [
  { key: 'want-to-read', label: 'Want to Read' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function TypeIcon({ type, size = 14 }: { type: ReadingType; size?: number }) {
  const props = { size, className: 'inline-block' };
  switch (type) {
    case 'book':    return <BookOpen {...props} />;
    case 'article': return <FileText {...props} />;
    case 'course':  return <Award {...props} />;
    case 'podcast': return <Mic {...props} />;
    case 'video':   return <Video {...props} />;
    default:        return <BookMarked {...props} />;
  }
}

function TypeEmoji({ type }: { type: ReadingType }) {
  const map: Record<ReadingType, string> = {
    book: '📚',
    article: '📄',
    course: '🎓',
    podcast: '🎙️',
    video: '🎬',
  };
  return <span>{map[type] ?? '📖'}</span>;
}

function PriorityIcon({ priority }: { priority: number }) {
  if (priority === 1) return <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>▲▲▲</span>;
  if (priority === 2) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>▲▲</span>;
  return <span style={{ color: '#6b7280', fontSize: 12 }}>▲</span>;
}

// ─── STAR RATING ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value?: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={readonly ? 'cursor-default' : 'cursor-pointer'}
        >
          <Star
            size={14}
            fill={(hover || value || 0) >= s ? 'var(--text-muted)' : 'transparent'}
            stroke={(hover || value || 0) >= s ? 'var(--text-muted)' : 'var(--text-muted)'}
          />
        </button>
      ))}
    </div>
  );
}

// ─── EMPTY FORM STATE ────────────────────────────────────────────────────────

function emptyForm(): Omit<ReadingItem, 'id'> {
  return {
    title: '',
    author: '',
    type: 'book',
    status: 'want-to-read',
    category: '',
    priority: 2,
    notes: '',
    keyTakeaways: '',
    startedAt: undefined,
    completedAt: undefined,
    rating: undefined,
  };
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  readingItems: ReadingItem[];
  setReadingItems: (v: ReadingItem[] | ((p: ReadingItem[]) => ReadingItem[])) => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function ReadingPipeline({ readingItems, setReadingItems }: Props) {
  const { chartColors } = useTheme();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ReadingItem | null>(null);
  const [form, setForm] = useState<Omit<ReadingItem, 'id'>>(emptyForm());
  const [insightSearch, setInsightSearch] = useState('');
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<ReadingType | 'all'>('all');

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingItem(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(item: ReadingItem) {
    setEditingItem(item);
    setForm({ ...item });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingItem(null);
  }

  function saveItem() {
    if (!form.title.trim()) return;
    if (editingItem) {
      setReadingItems((prev) =>
        prev.map((i) => (i.id === editingItem.id ? { ...form, id: editingItem.id } : i))
      );
    } else {
      setReadingItems((prev) => [...prev, { ...form, id: generateId() }]);
    }
    closeModal();
  }

  function deleteItem(id: string) {
    setReadingItems((prev) => prev.filter((i) => i.id !== id));
  }

  function moveItem(id: string, direction: 'left' | 'right') {
    setReadingItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const idx = COLUMNS.findIndex((c) => c.key === item.status);
        if (direction === 'left' && idx > 0) {
          const newStatus = COLUMNS[idx - 1].key;
          return { ...item, status: newStatus };
        }
        if (direction === 'right' && idx < COLUMNS.length - 1) {
          const newStatus = COLUMNS[idx + 1].key;
          const updates: Partial<ReadingItem> = { status: newStatus };
          if (newStatus === 'in-progress' && !item.startedAt) updates.startedAt = todayStr();
          if (newStatus === 'completed' && !item.completedAt) updates.completedAt = todayStr();
          return { ...item, ...updates };
        }
        return item;
      })
    );
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const completedThisMonth = readingItems.filter(
      (i) =>
        i.status === 'completed' &&
        i.completedAt &&
        isWithinInterval(parseISO(i.completedAt), { start: monthStart, end: monthEnd })
    );
    const booksThisMonth = completedThisMonth.filter((i) => i.type === 'book').length;
    const articlesThisMonth = completedThisMonth.filter((i) => i.type === 'article').length;
    const totalCompleted = readingItems.filter((i) => i.status === 'completed').length;
    const hoursEstimated = readingItems
      .filter((i) => i.status === 'completed')
      .reduce((sum, i) => sum + (TYPE_HOURS[i.type] ?? 1), 0);
    return { booksThisMonth, articlesThisMonth, totalCompleted, hoursEstimated };
  }, [readingItems]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const months: { label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({
        label: format(d, 'MMM'),
        start: startOfMonth(d),
        end: endOfMonth(d),
      });
    }
    return months.map(({ label, start, end }) => {
      const row: Record<string, string | number> = { month: label };
      READING_TYPES.forEach((t) => {
        row[t] = readingItems.filter(
          (i) =>
            i.type === t &&
            i.status === 'completed' &&
            i.completedAt &&
            isWithinInterval(parseISO(i.completedAt), { start, end })
        ).length;
      });
      return row;
    });
  }, [readingItems]);

  // ── Insights ───────────────────────────────────────────────────────────────

  const completedWithTakeaways = useMemo(() => {
    const q = insightSearch.toLowerCase();
    return readingItems.filter(
      (i) =>
        i.status === 'completed' &&
        i.keyTakeaways?.trim() &&
        (!q ||
          i.title.toLowerCase().includes(q) ||
          i.author.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q))
    );
  }, [readingItems, insightSearch]);

  // ── Kanban columns ─────────────────────────────────────────────────────────

  const columnItems = useMemo(() => {
    return COLUMNS.reduce<Record<ReadingStatus, ReadingItem[]>>(
      (acc, col) => {
        acc[col.key] = readingItems.filter(
          (i) =>
            i.status === col.key &&
            (filterType === 'all' || i.type === filterType)
        );
        return acc;
      },
      { 'want-to-read': [], 'in-progress': [], completed: [] }
    );
  }, [readingItems, filterType]);

  // ── Render reading card ────────────────────────────────────────────────────

  function renderCard(item: ReadingItem) {
    const colIdx = COLUMNS.findIndex((c) => c.key === item.status);
    const canLeft = colIdx > 0;
    const canRight = colIdx < COLUMNS.length - 1;

    return (
      <div
        key={item.id}
        className="caesar-card p-3 rounded-xl mb-3 transition-all duration-200"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span style={{ color: TYPE_COLORS[item.type] }}>
              <TypeEmoji type={item.type} />
            </span>
            <span className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </span>
          </div>
          <PriorityIcon priority={item.priority} />
        </div>

        {/* Author / source */}
        {item.author && (
          <p className="text-xs mb-1.5 truncate" style={{ color: 'var(--text-secondary)' }}>{item.author}</p>
        )}

        {/* Category badge */}
        {item.category && (
          <div className="mb-2">
            <Badge label={item.category} color={TYPE_COLORS[item.type]} size="xs" />
          </div>
        )}

        {/* Completed extras */}
        {item.status === 'completed' && (
          <div className="mb-2 space-y-1">
            <StarRating value={item.rating} readonly />
            {item.completedAt && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Completed {formatDate(item.completedAt)}
              </p>
            )}
            {item.keyTakeaways && (
              <p className="text-xs line-clamp-2 italic" style={{ color: 'var(--text-secondary)' }}>
                "{item.keyTakeaways.slice(0, 80)}{item.keyTakeaways.length > 80 ? '…' : ''}"
              </p>
            )}
          </div>
        )}

        {/* Notes preview for non-completed */}
        {item.status !== 'completed' && item.notes && (
          <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-muted)' }}>{item.notes}</p>
        )}

        {/* Action row */}
        <div
          className="flex items-center justify-between mt-2 pt-2 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(item)}
              className="p-1 transition-colors rounded"
              style={{ color: 'var(--text-secondary)' }}
              title="Edit"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={() => deleteItem(item.id)}
              className="p-1 transition-colors hover:text-[var(--text-secondary)] rounded"
              style={{ color: 'var(--text-secondary)' }}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {canLeft && (
              <button
                onClick={() => moveItem(item.id, 'left')}
                className="p-1 transition-colors rounded text-xs flex items-center gap-0.5"
                style={{ color: 'var(--text-secondary)' }}
                title="Move left"
              >
                <ChevronLeft size={13} />
              </button>
            )}
            {canRight && (
              <button
                onClick={() => moveItem(item.id, 'right')}
                className="p-1 transition-colors rounded text-xs flex items-center gap-0.5"
                style={{ color: 'var(--text-secondary)' }}
                title="Move right"
              >
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 transition-colors duration-300">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <BookOpen size={22} style={{ color: 'var(--text-muted)' }} />
            Reading Pipeline
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Track your learning journey</p>
        </div>
        <button onClick={openAdd} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Books This Month',
            value: stats.booksThisMonth,
            icon: <TypeIcon type="book" size={16} />,
            color: 'var(--text-muted)',
          },
          {
            label: 'Articles This Month',
            value: stats.articlesThisMonth,
            icon: <TypeIcon type="article" size={16} />,
            color: 'var(--text-muted)',
          },
          {
            label: 'Total Completed',
            value: stats.totalCompleted,
            icon: <Award size={16} />,
            color: 'var(--text-secondary)',
          },
          {
            label: 'Hours Invested',
            value: `${stats.hoursEstimated.toFixed(0)}h`,
            icon: <Clock size={16} />,
            color: 'var(--text-muted)',
          },
        ].map((s) => (
          <div key={s.label} className="caesar-card p-4 rounded-xl transition-colors duration-300">
            <div className="flex items-center gap-2 mb-1" style={{ color: s.color }}>
              {s.icon}
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Type filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} style={{ color: 'var(--text-muted)' }} />
        <button
          onClick={() => setFilterType('all')}
          className="px-3 py-1 rounded-full text-xs font-medium transition-all border"
          style={
            filterType === 'all'
              ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border)', backgroundColor: 'transparent' }
          }
        >
          All
        </button>
        {READING_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t === filterType ? 'all' : t)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 border"
            style={
              filterType === t
                ? {
                    backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-strong)',
                  }
                : {
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border)',
                    backgroundColor: 'transparent',
                  }
            }
          >
            <TypeEmoji type={t} />
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>

      {/* ── Kanban board ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="rounded-2xl p-4 transition-colors duration-300"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              minHeight: '300px',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{col.label}</h3>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                }}
              >
                {columnItems[col.key].length}
              </span>
            </div>
            <div>
              {columnItems[col.key].length === 0 ? (
                <p className="text-xs text-center mt-8" style={{ color: 'var(--text-muted)' }}>No items</p>
              ) : (
                columnItems[col.key].map((item) => renderCard(item))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart ── */}
      <div className="caesar-card p-5 rounded-2xl transition-colors duration-300">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Completions Per Month</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={12}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.text, fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.text, fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: chartColors.tooltipBg,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: chartColors.tooltipText }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(v) => <span style={{ color: chartColors.text, textTransform: 'capitalize' }}>{v}</span>}
            />
            {READING_TYPES.map((t) => (
              <Bar
                key={t}
                dataKey={t}
                stackId="a"
                fill={TYPE_COLORS[t]}
                radius={t === 'video' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Insights Vault ── */}
      <div className="caesar-card p-5 rounded-2xl transition-colors duration-300">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={18} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Insights Vault
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({completedWithTakeaways.length})</span>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search insights…"
              value={insightSearch}
              onChange={(e) => setInsightSearch(e.target.value)}
              className="caesar-input pl-9 pr-3 py-1.5 text-sm w-56 rounded-lg"
            />
          </div>
        </div>

        {completedWithTakeaways.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Complete items and add key takeaways to build your insights vault.
          </p>
        ) : (
          <div className="space-y-2">
            {completedWithTakeaways.map((item) => {
              const expanded = expandedInsights.has(item.id);
              return (
                <div
                  key={item.id}
                  className="rounded-xl overflow-hidden transition-colors duration-300"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}
                >
                  <button
                    className="w-full flex items-center justify-between p-3 text-left transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onClick={() =>
                      setExpandedInsights((prev) => {
                        const next = new Set(prev);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        return next;
                      })
                    }
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span style={{ color: TYPE_COLORS[item.type] }}>
                        <TypeEmoji type={item.type} />
                      </span>
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      {item.author && (
                        <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                          — {item.author}
                        </span>
                      )}
                      {item.category && (
                        <Badge label={item.category} color={TYPE_COLORS[item.type]} size="xs" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <StarRating value={item.rating} readonly />
                      <ChevronRight
                        size={14}
                        style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      />
                    </div>
                  </button>
                  {expanded && (
                    <div
                      className="px-4 pb-4 pt-1 border-t"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                        {item.keyTakeaways}
                      </p>
                      {item.completedAt && (
                        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                          Completed {formatDate(item.completedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingItem ? 'Edit Item' : 'Add Reading Item'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="caesar-label">Title *</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="Book / article / course title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Author */}
          <div>
            <label className="caesar-label">Author / Source</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="Author or publisher"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            />
          </div>

          {/* Type & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Type</label>
              <select
                className="caesar-input w-full mt-1"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as ReadingType }))
                }
              >
                {READING_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="caesar-label">Status</label>
              <select
                className="caesar-input w-full mt-1"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as ReadingStatus }))
                }
              >
                <option value="want-to-read">Want to Read</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="caesar-label">Category</label>
            <input
              type="text"
              className="caesar-input w-full mt-1"
              placeholder="e.g. Leadership, Finance, Health"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="caesar-label">Priority</label>
            <div className="flex gap-4 mt-2">
              {([1, 2, 3] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={form.priority === p}
                    onChange={() => setForm((f) => ({ ...f, priority: p }))}
                    className="accent-gold"
                  />
                  <span className="text-sm flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <PriorityIcon priority={p} />
                    <span>
                      {p === 1 ? 'High' : p === 2 ? 'Medium' : 'Low'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Started At</label>
              <input
                type="date"
                className="caesar-input w-full mt-1"
                value={form.startedAt ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startedAt: e.target.value || undefined }))
                }
              />
            </div>
            <div>
              <label className="caesar-label">Completed At</label>
              <input
                type="date"
                className="caesar-input w-full mt-1"
                value={form.completedAt ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, completedAt: e.target.value || undefined }))
                }
              />
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="caesar-label">Rating</label>
            <div className="mt-2">
              <StarRating
                value={form.rating}
                onChange={(v) =>
                  setForm((f) => ({ ...f, rating: v as ReadingItem['rating'] }))
                }
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="caesar-label">Notes</label>
            <textarea
              className="caesar-input w-full mt-1 resize-none"
              rows={3}
              placeholder="Personal notes, context, why you want to read this…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Key Takeaways */}
          <div>
            <label className="caesar-label">Key Takeaways</label>
            <textarea
              className="caesar-input w-full mt-1 resize-none"
              rows={4}
              placeholder="What did you learn? What will you apply?"
              value={form.keyTakeaways}
              onChange={(e) => setForm((f) => ({ ...f, keyTakeaways: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveItem}
              disabled={!form.title.trim()}
              className="caesar-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingItem ? 'Save Changes' : 'Add Item'}
            </button>
            <button onClick={closeModal} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
