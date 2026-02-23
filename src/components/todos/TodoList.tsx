import React, { useState, useMemo, useRef } from 'react';
import {
  CheckSquare, Square, Plus, Edit3, Trash2, Link2,
  Calendar, ChevronDown, Circle, X,
} from 'lucide-react';
import { isToday, isTomorrow, parseISO, isPast } from 'date-fns';
import type {
  TodoItem, TodoChecklistItem, TodoStatus, TodoPriority, TodoLinkType,
  Contact, Project, Goal, Course, Note, ReadingItem, Candidate,
} from '../../types';
import { generateId, todayStr } from '../../utils';
import { Modal } from '../shared/Modal';
import { useToast } from '../shared/Toast';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  todos: TodoItem[];
  setTodos: (v: TodoItem[] | ((p: TodoItem[]) => TodoItem[])) => void;
  contacts: Contact[];
  projects: Project[];
  goals: Goal[];
  courses: Course[];
  notes: Note[];
  readingItems: ReadingItem[];
  candidates: Candidate[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string }> = {
  high:   { label: 'High',   color: 'var(--priority-high)' },
  medium: { label: 'Medium', color: 'var(--priority-medium)' },
  low:    { label: 'Low',    color: 'var(--priority-low)' },
};

const STATUS_CONFIG: Record<TodoStatus, { label: string }> = {
  'todo':        { label: 'To Do' },
  'in-progress': { label: 'In Progress' },
  'done':        { label: 'Done' },
};

const LINK_TYPE_LABELS: Record<TodoLinkType, string> = {
  contact:   'Contact',
  project:   'Project',
  goal:      'Goal',
  course:    'Course',
  note:      'Note',
  reading:   'Reading',
  candidate: 'Candidate',
};

type FilterTab = 'all' | 'today' | 'upcoming' | 'done';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function dueDateLabel(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    if (isPast(d)) return `Overdue`;
    const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return `In ${diff}d`;
  } catch { return null; }
}

function dueDateColor(dateStr?: string): string {
  if (!dateStr) return 'var(--text-muted)';
  try {
    const d = parseISO(dateStr);
    if (isPast(d) && !isToday(d)) return 'var(--priority-high)';
    if (isToday(d)) return 'var(--priority-medium)';
    return 'var(--text-muted)';
  } catch { return 'var(--text-muted)'; }
}

function safeChecklist(todo: TodoItem): TodoChecklistItem[] {
  return Array.isArray(todo.checklist) ? todo.checklist : [];
}

// ─── FORM DATA ────────────────────────────────────────────────────────────────

interface FormData {
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string;
  linkedType: TodoLinkType | '';
  linkedId: string;
}

function emptyForm(): FormData {
  return { title: '', notes: '', status: 'todo', priority: 'medium', dueDate: '', linkedType: '', linkedId: '' };
}

// ─── FORM MODAL ───────────────────────────────────────────────────────────────

interface TodoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormData) => void;
  initial?: Partial<FormData>;
  title: string;
  contacts: Contact[];
  projects: Project[];
  goals: Goal[];
  courses: Course[];
  notes: Note[];
  readingItems: ReadingItem[];
  candidates: Candidate[];
}

function TodoFormModal({
  isOpen, onClose, onSave, initial, title,
  contacts, projects, goals, courses, notes, readingItems, candidates,
}: TodoFormModalProps) {
  const [form, setForm] = useState<FormData>(emptyForm());

  React.useEffect(() => {
    if (isOpen) {
      setForm({
        title: initial?.title ?? '',
        notes: initial?.notes ?? '',
        status: initial?.status ?? 'todo',
        priority: initial?.priority ?? 'medium',
        dueDate: initial?.dueDate ?? '',
        linkedType: initial?.linkedType ?? '',
        linkedId: initial?.linkedId ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const linkOptions = useMemo((): { id: string; label: string }[] => {
    if (!form.linkedType) return [];
    switch (form.linkedType) {
      case 'contact':   return contacts.map(c => ({ id: c.id, label: c.name }));
      case 'project':   return projects.map(p => ({ id: p.id, label: p.name }));
      case 'goal':      return goals.map(g => ({ id: g.id, label: g.title }));
      case 'course':    return courses.map(c => ({ id: c.id, label: c.name }));
      case 'note':      return notes.map(n => ({ id: n.id, label: n.title }));
      case 'reading':   return readingItems.map(r => ({ id: r.id, label: r.title }));
      case 'candidate': return candidates.map(c => ({ id: c.id, label: c.name }));
      default:          return [];
    }
  }, [form.linkedType, contacts, projects, goals, courses, notes, readingItems, candidates]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={e => { e.preventDefault(); if (form.title.trim()) onSave(form); }} className="flex flex-col gap-4">
        <div>
          <label className="caesar-label">Task *</label>
          <input
            className="caesar-input w-full"
            placeholder="What needs to be done?"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Priority</label>
            <select className="caesar-input w-full" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as TodoPriority }))}>
              {(Object.keys(PRIORITY_CONFIG) as TodoPriority[]).map(p => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="caesar-label">Status</label>
            <select className="caesar-input w-full" value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as TodoStatus }))}>
              {(Object.keys(STATUS_CONFIG) as TodoStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="caesar-label">Due Date</label>
          <input className="caesar-input w-full" type="date" value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div>
          <label className="caesar-label">Link to CRM Item</label>
          <div className="grid grid-cols-2 gap-2">
            <select className="caesar-input w-full" value={form.linkedType}
              onChange={e => setForm(f => ({ ...f, linkedType: e.target.value as TodoLinkType | '', linkedId: '' }))}>
              <option value="">No link</option>
              {(Object.keys(LINK_TYPE_LABELS) as TodoLinkType[]).map(t => (
                <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {form.linkedType && (
              <select className="caesar-input w-full" value={form.linkedId}
                onChange={e => setForm(f => ({ ...f, linkedId: e.target.value }))}>
                <option value="">Select…</option>
                {linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
          </div>
        </div>
        <div>
          <label className="caesar-label">Notes</label>
          <textarea className="caesar-input w-full resize-none" rows={2}
            placeholder="Additional details..." value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Save Task</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── CHECKLIST ────────────────────────────────────────────────────────────────

interface ChecklistProps {
  todoId: string;
  checklist: TodoChecklistItem[];
  onUpdate: (todoId: string, checklist: TodoChecklistItem[]) => void;
}

function Checklist({ todoId, checklist, onUpdate }: ChecklistProps) {
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    onUpdate(todoId, checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c));
  };

  const remove = (id: string) => {
    onUpdate(todoId, checklist.filter(c => c.id !== id));
  };

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    const item: TodoChecklistItem = { id: generateId(), text, checked: false };
    onUpdate(todoId, [...checklist, item]);
    setNewText('');
    inputRef.current?.focus();
  };

  const checkedCount = checklist.filter(c => c.checked).length;

  return (
    <div className="flex flex-col gap-1 mt-2">
      {/* Progress bar (only if items exist) */}
      {checklist.length > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: `${checklist.length > 0 ? (checkedCount / checklist.length) * 100 : 0}%`,
                backgroundColor: checkedCount === checklist.length && checklist.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}
            />
          </div>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {checkedCount}/{checklist.length}
          </span>
        </div>
      )}

      {/* Items */}
      {checklist.map(item => (
        <div key={item.id} className="flex items-center gap-2 group/item">
          <button
            onClick={() => toggle(item.id)}
            className="flex-shrink-0 transition-colors"
            style={{ color: item.checked ? 'var(--text-secondary)' : 'var(--text-muted)' }}
          >
            {item.checked
              ? <CheckSquare size={14} style={{ color: 'var(--text-secondary)' }} />
              : <Square size={14} />
            }
          </button>
          <span
            className="flex-1 text-xs"
            style={{
              color: item.checked ? 'var(--text-muted)' : 'var(--text-secondary)',
              textDecoration: item.checked ? 'line-through' : 'none',
            }}
          >
            {item.text}
          </span>
          <button
            onClick={() => remove(item.id)}
            className="opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={11} />
          </button>
        </div>
      ))}

      {/* Add item row */}
      <div className="flex items-center gap-2 mt-0.5">
        <Plus size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-[var(--text-muted)]"
          style={{ color: 'var(--text-secondary)' }}
          placeholder="Add item..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          onBlur={addItem}
        />
      </div>
    </div>
  );
}

// ─── TODO CARD ────────────────────────────────────────────────────────────────

interface TodoCardProps {
  todo: TodoItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChecklistUpdate: (todoId: string, checklist: TodoChecklistItem[]) => void;
}

function TodoCard({ todo, onToggle, onEdit, onDelete, onChecklistUpdate }: TodoCardProps) {
  const isDone = todo.status === 'done';
  const pCfg = PRIORITY_CONFIG[todo.priority];
  const dateLabel = dueDateLabel(todo.dueDate);
  const dateColor = dueDateColor(todo.dueDate);
  const checklist = safeChecklist(todo);

  return (
    <div
      className="caesar-card flex flex-col gap-2 transition-all duration-200"
      style={{ opacity: isDone ? 0.5 : 1 }}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className="mt-0.5 flex-shrink-0 transition-colors duration-150"
          style={{ color: isDone ? pCfg.color : 'var(--text-muted)' }}
        >
          {isDone
            ? <CheckSquare size={17} style={{ color: pCfg.color }} />
            : <Square size={17} />
          }
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium leading-snug"
            style={{
              color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {todo.title}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: pCfg.color }}>
              <Circle size={6} fill={pCfg.color} />
              {pCfg.label}
            </span>
            {todo.status === 'in-progress' && (
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                In Progress
              </span>
            )}
            {dateLabel && (
              <span className="flex items-center gap-1 text-xs" style={{ color: dateColor }}>
                <Calendar size={11} />
                {dateLabel}
              </span>
            )}
            {todo.linkedType && todo.linkedLabel && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <Link2 size={10} />
                {LINK_TYPE_LABELS[todo.linkedType]}: {todo.linkedLabel}
              </span>
            )}
          </div>

          {todo.notes && (
            <p className="text-xs mt-1.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{todo.notes}</p>
          )}

          {/* Checklist */}
          {!isDone && (
            <Checklist todoId={todo.id} checklist={checklist} onUpdate={onChecklistUpdate} />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
            <Edit3 size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg transition-colors hover:text-[var(--text-secondary)]" style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function TodoList({
  todos, setTodos,
  contacts, projects, goals, courses, notes, readingItems, candidates,
}: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<'created' | 'due' | 'priority'>('priority');
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<TodoItem | null>(null);

  const labelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    contacts.forEach(c => { map[c.id] = c.name; });
    projects.forEach(p => { map[p.id] = p.name; });
    goals.forEach(g => { map[g.id] = g.title; });
    courses.forEach(c => { map[c.id] = c.name; });
    notes.forEach(n => { map[n.id] = n.title; });
    readingItems.forEach(r => { map[r.id] = r.title; });
    candidates.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [contacts, projects, goals, courses, notes, readingItems, candidates]);

  const filtered = useMemo(() => {
    const today = todayStr();
    let list = todos;
    switch (filter) {
      case 'today':    list = todos.filter(t => t.dueDate === today && t.status !== 'done'); break;
      case 'upcoming': list = todos.filter(t => t.dueDate && t.dueDate > today && t.status !== 'done'); break;
      case 'done':     list = todos.filter(t => t.status === 'done'); break;
      default:         list = todos.filter(t => t.status !== 'done');
    }
    const priorityOrder: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => {
      if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sortBy === 'due') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [todos, filter, sortBy]);

  const stats = useMemo(() => ({
    total: todos.length,
    done: todos.filter(t => t.status === 'done').length,
    today: todos.filter(t => t.dueDate === todayStr() && t.status !== 'done').length,
    overdue: todos.filter(t => {
      if (!t.dueDate || t.status === 'done') return false;
      try { return isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate)); } catch { return false; }
    }).length,
  }), [todos]);

  const handleAdd = (data: FormData) => {
    const linkedLabel = data.linkedId ? labelLookup[data.linkedId] : undefined;
    const newTodo: TodoItem = {
      id: generateId(),
      title: data.title,
      notes: data.notes,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate || undefined,
      createdAt: new Date().toISOString(),
      linkedType: data.linkedType || undefined,
      linkedId: data.linkedId || undefined,
      linkedLabel,
      checklist: [],
    };
    setTodos(prev => [newTodo, ...(Array.isArray(prev) ? prev : [])]);
    setAddOpen(false);
    toast.success('Task added');
  };

  const handleEdit = (data: FormData) => {
    if (!editItem) return;
    const linkedLabel = data.linkedId ? labelLookup[data.linkedId] : undefined;
    setTodos(prev =>
      (Array.isArray(prev) ? prev : []).map(t =>
        t.id === editItem.id
          ? { ...t, title: data.title, notes: data.notes, status: data.status, priority: data.priority,
              dueDate: data.dueDate || undefined, linkedType: data.linkedType || undefined,
              linkedId: data.linkedId || undefined, linkedLabel }
          : t
      )
    );
    setEditItem(null);
    toast.success('Task updated');
  };

  const handleToggle = (todo: TodoItem) => {
    const nextStatus: TodoStatus = todo.status === 'done' ? 'todo' : 'done';
    setTodos(prev =>
      (Array.isArray(prev) ? prev : []).map(t => t.id === todo.id ? { ...t, status: nextStatus } : t)
    );
  };

  const handleDelete = (id: string) => {
    setTodos(prev => (Array.isArray(prev) ? prev : []).filter(t => t.id !== id));
    toast.success('Task deleted');
  };

  const handleChecklistUpdate = (todoId: string, checklist: TodoChecklistItem[]) => {
    setTodos(prev =>
      (Array.isArray(prev) ? prev : []).map(t => t.id === todoId ? { ...t, checklist } : t)
    );
  };

  const FILTER_TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',      label: 'Active',   count: todos.filter(t => t.status !== 'done').length },
    { id: 'today',    label: 'Today',    count: stats.today },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'done',     label: 'Done',     count: stats.done },
  ];

  return (
    <div className="flex flex-col gap-6 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Todo List</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Tasks linked across your entire CRM
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} />
          Add Task
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: stats.total },
          { label: 'Done',      value: stats.done },
          { label: 'Due Today', value: stats.today },
          { label: 'Overdue',   value: stats.overdue, warn: stats.overdue > 0 },
        ].map(s => (
          <div key={s.label} className="caesar-card text-center py-3 transition-colors duration-300">
            <p className="text-2xl font-bold" style={{ color: s.warn ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {s.value}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + Sort */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
              style={{
                backgroundColor: filter === tab.id ? 'var(--bg-elevated)' : 'transparent',
                color: filter === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          <select
            className="text-xs rounded-lg px-2 py-1.5"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="priority">Sort: Priority</option>
            <option value="due">Sort: Due Date</option>
            <option value="created">Sort: Newest</option>
          </select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="caesar-card flex flex-col items-center justify-center py-16 text-center transition-colors duration-300">
          <CheckSquare size={38} className="mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {filter === 'done' ? 'No completed tasks yet' : 'All clear — no tasks here'}
          </p>
          {filter !== 'done' && (
            <button onClick={() => setAddOpen(true)} className="mt-4 caesar-btn-ghost flex items-center gap-2 text-sm">
              <Plus size={14} /> Add your first task
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(todo => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onToggle={() => handleToggle(todo)}
              onEdit={() => setEditItem(todo)}
              onDelete={() => handleDelete(todo.id)}
              onChecklistUpdate={handleChecklistUpdate}
            />
          ))}
        </div>
      )}

      {/* Add Modal */}
      <TodoFormModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        title="New Task"
        contacts={contacts} projects={projects} goals={goals}
        courses={courses} notes={notes} readingItems={readingItems} candidates={candidates}
      />

      {/* Edit Modal */}
      {editItem && (
        <TodoFormModal
          isOpen={!!editItem}
          onClose={() => setEditItem(null)}
          onSave={handleEdit}
          initial={{
            title: editItem.title,
            notes: editItem.notes,
            status: editItem.status,
            priority: editItem.priority,
            dueDate: editItem.dueDate ?? '',
            linkedType: editItem.linkedType ?? '',
            linkedId: editItem.linkedId ?? '',
          }}
          title={`Edit — ${editItem.title}`}
          contacts={contacts} projects={projects} goals={goals}
          courses={courses} notes={notes} readingItems={readingItems} candidates={candidates}
        />
      )}
    </div>
  );
}
