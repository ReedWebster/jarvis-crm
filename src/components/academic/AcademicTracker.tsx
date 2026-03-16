import React, { useState, useMemo } from 'react';
import {
  GraduationCap,
  Plus,
  Edit3,
  Trash2,
  BookOpen,
  Calendar,
  Clock,
  ChevronRight,
  Award,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Course, Assignment, AssignmentStatus } from '../../types';
import {
  generateId,
  todayStr,
  formatDate,
  daysUntil,
  isOverdue,
} from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge, StatusBadge } from '../shared/Badge';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  courses: Course[];
  setCourses: (v: Course[] | ((p: Course[]) => Course[])) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ASSIGNMENT_STATUSES: AssignmentStatus[] = ['not-started', 'in-progress', 'submitted', 'graded'];

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  'submitted': 'Submitted',
  'graded': 'Graded',
};

const STATUS_COLORS: Record<AssignmentStatus, string> = {
  'not-started': '#6b7280',
  'in-progress': '#3b82f6',
  'submitted':   '#a855f7',
  'graded':      '#22c55e',
};

const COURSE_COLORS = [
  // Neutrals
  '#6b7280','#9ca3af',
  // Reds / Pinks
  '#ef4444','#f43f5e','#ec4899',
  // Oranges / Yellows
  '#f97316','#eab308',
  // Greens
  '#22c55e','#10b981','#14b8a6',
  // Blues
  '#3b82f6','#6366f1','#0ea5e9',
  // Purples
  '#a855f7','#8b5cf6',
  // Custom (shown as a color input)
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function gradeToLetter(percent: number): string {
  if (percent >= 93) return 'A';
  if (percent >= 90) return 'A-';
  if (percent >= 87) return 'B+';
  if (percent >= 83) return 'B';
  if (percent >= 80) return 'B-';
  if (percent >= 77) return 'C+';
  if (percent >= 73) return 'C';
  if (percent >= 70) return 'C-';
  if (percent >= 67) return 'D+';
  if (percent >= 63) return 'D';
  if (percent >= 60) return 'D-';
  return 'F';
}

function gradeColor(percent: number): string {
  if (percent >= 87) return 'var(--text-primary)';
  if (percent >= 73) return 'var(--text-secondary)';
  return 'var(--text-muted)';
}

// ─── STATS ROW ────────────────────────────────────────────────────────────────

function StatsRow({ courses }: { courses: Course[] }) {
  const totalCredits = courses.reduce((s, c) => s + c.credits, 0);

  const stats = [
    {
      label: 'Total Credits',
      value: totalCredits,
      icon: BookOpen,
    },
    {
      label: 'Courses',
      value: courses.length,
      icon: GraduationCap,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {stats.map(({ label, value, icon: Icon }) => (
        <div key={label} className="caesar-card flex items-center gap-3 transition-colors duration-300">
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 40, height: 40, backgroundColor: 'var(--bg-elevated)' }}
          >
            <Icon size={18} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div>
            <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {value}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── COURSE CARD ─────────────────────────────────────────────────────────────

interface CourseCardProps {
  course: Course;
  onEdit: () => void;
  onDelete: () => void;
  onAddAssignment: () => void;
  onAddExam: () => void;
  onAssignmentStatusChange: (courseId: string, assignmentId: string, newStatus: AssignmentStatus) => void;
}

function CourseCard({
  course,
  onEdit,
  onDelete,
  onAddAssignment,
  onAddExam,
  onAssignmentStatusChange,
}: CourseCardProps) {
  const color = course.color || 'var(--text-muted)';
  const letter = gradeToLetter(course.currentGrade);
  const gColor = gradeColor(course.currentGrade);

  const nextAssignment = useMemo(() => {
    const pending = course.assignments
      .filter((a) => a.status !== 'submitted' && a.status !== 'graded')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    return pending[0] ?? null;
  }, [course.assignments]);

  const nextExam = useMemo(() => {
    const upcoming = course.examDates
      .filter((e) => daysUntil(e.date) >= 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming[0] ?? null;
  }, [course.examDates]);

  return (
    <div className="caesar-card flex flex-col gap-4 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: color, boxShadow: '0 0 0 1px var(--border)' }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{course.name}</h3>
            {course.professor && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{course.professor}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge label={`${course.credits} cr`} color={color} size="xs" />
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors hover:text-[var(--text-secondary)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Grade Display */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-3xl font-black leading-none" style={{ color: gColor }}>
            {course.currentGrade}
            <span className="text-base ml-0.5 font-semibold opacity-60">%</span>
          </span>
          <span className="text-sm font-bold mt-0.5" style={{ color: gColor }}>{letter}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>Current</span>
            <span>Target: {course.targetGrade}%</span>
          </div>
          <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(course.currentGrade, 100)}%`, backgroundColor: gColor }}
            />
          </div>
          {course.currentGrade < course.targetGrade && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {(course.targetGrade - course.currentGrade).toFixed(1)}% below target
            </p>
          )}
        </div>
      </div>

      {/* Next Assignment */}
      {nextAssignment ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <BookOpen size={13} className="flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{nextAssignment.title}</p>
            <p
              className="text-xs"
              style={{ color: isOverdue(nextAssignment.dueDate) ? 'var(--text-secondary)' : 'var(--text-muted)' }}
            >
              {isOverdue(nextAssignment.dueDate)
                ? `Overdue by ${Math.abs(daysUntil(nextAssignment.dueDate))}d`
                : `Due ${formatDate(nextAssignment.dueDate)}`}
            </p>
          </div>
          <StatusBadge status={nextAssignment.status} />
        </div>
      ) : (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <CheckCircle size={13} style={{ color: 'var(--text-secondary)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No pending assignments</span>
        </div>
      )}

      {/* Exam Countdown */}
      {nextExam && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--bg-elevated)',
          }}
        >
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{nextExam.title}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {daysUntil(nextExam.date) === 0
                ? 'Today!'
                : daysUntil(nextExam.date) === 1
                ? 'Tomorrow'
                : `In ${daysUntil(nextExam.date)} days`}
            </p>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(nextExam.date)}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onAddAssignment}
          className="caesar-btn-ghost flex items-center justify-center gap-2 text-xs flex-1 py-2"
        >
          <Plus size={13} />
          Add Assignment
        </button>
        <button
          onClick={onAddExam}
          className="caesar-btn-ghost flex items-center justify-center gap-2 text-xs flex-1 py-2"
        >
          <Calendar size={13} />
          Add Exam
        </button>
      </div>
    </div>
  );
}

// ─── ADD/EDIT COURSE MODAL ────────────────────────────────────────────────────

interface CourseFormData {
  name: string;
  professor: string;
  credits: number;
  currentGrade: number;
  targetGrade: number;
  color: string;
}

function emptyCourseForm(): CourseFormData {
  return {
    name: '',
    professor: '',
    credits: 3,
    currentGrade: 90,
    targetGrade: 93,
    color: COURSE_COLORS[0],
  };
}

interface CourseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CourseFormData) => void;
  initial?: Partial<CourseFormData>;
  title: string;
}

function CourseFormModal({ isOpen, onClose, onSave, initial, title }: CourseFormModalProps) {
  const [form, setForm] = useState<CourseFormData>(emptyCourseForm());

  React.useEffect(() => {
    if (isOpen) {
      setForm({
        name: initial?.name ?? '',
        professor: initial?.professor ?? '',
        credits: initial?.credits ?? 3,
        currentGrade: initial?.currentGrade ?? 90,
        targetGrade: initial?.targetGrade ?? 93,
        color: initial?.color ?? COURSE_COLORS[0],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="caesar-label">Course Name *</label>
          <input
            className="caesar-input w-full"
            placeholder="e.g. Advanced Finance"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="caesar-label">Professor</label>
          <input
            className="caesar-input w-full"
            placeholder="Professor name"
            value={form.professor}
            onChange={(e) => setForm((f) => ({ ...f, professor: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="caesar-label">Credits</label>
            <input
              className="caesar-input w-full"
              type="number"
              min={1}
              max={6}
              step={0.5}
              value={form.credits}
              onChange={(e) => setForm((f) => ({ ...f, credits: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="caesar-label">Current Grade %</label>
            <input
              className="caesar-input w-full"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.currentGrade}
              onChange={(e) => setForm((f) => ({ ...f, currentGrade: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="caesar-label">Target Grade %</label>
            <input
              className="caesar-input w-full"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.targetGrade}
              onChange={(e) => setForm((f) => ({ ...f, targetGrade: Number(e.target.value) }))}
            />
          </div>
        </div>

        {/* Color Picker */}
        <div>
          <label className="caesar-label">Course Color</label>
          <div className="flex flex-wrap gap-2 mt-1 items-center">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className="w-7 h-7 rounded-full transition-all duration-150"
                style={{
                  backgroundColor: c,
                  boxShadow: form.color === c ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--border)' : 'none',
                  transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
            {/* Custom color swatch */}
            <label
              className="w-7 h-7 rounded-full cursor-pointer transition-all duration-150 flex items-center justify-center overflow-hidden"
              title="Custom color"
              style={{
                background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                boxShadow: !COURSE_COLORS.includes(form.color) ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--border)' : 'none',
                transform: !COURSE_COLORS.includes(form.color) ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <input
                type="color"
                className="opacity-0 w-full h-full cursor-pointer absolute"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </label>
            {/* Current custom hex */}
            {!COURSE_COLORS.includes(form.color) && (
              <span className="text-xs font-mono" style={{ color: form.color }}>{form.color}</span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Save Course</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ASSIGNMENT FORM MODAL ────────────────────────────────────────────────────

interface AssignmentFormData {
  courseId: string;
  title: string;
  status: AssignmentStatus;
  dueDate: string;
  weight: number;
  grade?: number;
  notes: string;
}

function emptyAssignmentForm(courseId = ''): AssignmentFormData {
  return {
    courseId,
    title: '',
    status: 'not-started',
    dueDate: todayStr(),
    weight: 10,
    grade: undefined,
    notes: '',
  };
}

interface AssignmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AssignmentFormData) => void;
  courses: Course[];
  initial?: Partial<AssignmentFormData>;
  title: string;
}

function AssignmentFormModal({
  isOpen,
  onClose,
  onSave,
  courses,
  initial,
  title,
}: AssignmentFormModalProps) {
  const [form, setForm] = useState<AssignmentFormData>(emptyAssignmentForm());

  React.useEffect(() => {
    if (isOpen) {
      setForm({
        courseId: initial?.courseId ?? (courses[0]?.id ?? ''),
        title: initial?.title ?? '',
        status: initial?.status ?? 'not-started',
        dueDate: initial?.dueDate ?? todayStr(),
        weight: initial?.weight ?? 10,
        grade: initial?.grade,
        notes: initial?.notes ?? '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.courseId) return;
    onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="caesar-label">Course *</label>
          <select
            className="caesar-input w-full"
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
            required
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="caesar-label">Assignment Title *</label>
          <input
            className="caesar-input w-full"
            placeholder="e.g. Problem Set 3"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Status</label>
            <select
              className="caesar-input w-full"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AssignmentStatus }))}
            >
              {ASSIGNMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="caesar-label">Due Date</label>
            <input
              className="caesar-input w-full"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="caesar-label">Weight (%)</label>
            <input
              className="caesar-input w-full"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="caesar-label">Grade (if graded)</label>
            <input
              className="caesar-input w-full"
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="—"
              value={form.grade ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  grade: e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
            />
          </div>
        </div>
        <div>
          <label className="caesar-label">Notes</label>
          <textarea
            className="caesar-input w-full resize-none"
            rows={2}
            placeholder="Instructions, reminders..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Save Assignment</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── EXAM FORM MODAL ──────────────────────────────────────────────────────────

interface ExamFormData {
  courseId: string;
  title: string;
  date: string;
}

interface ExamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExamFormData) => void;
  courses: Course[];
  initialCourseId?: string;
}

function ExamFormModal({ isOpen, onClose, onSave, courses, initialCourseId }: ExamFormModalProps) {
  const [form, setForm] = useState<ExamFormData>({ courseId: '', title: '', date: todayStr() });

  React.useEffect(() => {
    if (isOpen) {
      setForm({
        courseId: initialCourseId ?? (courses[0]?.id ?? ''),
        title: '',
        date: todayStr(),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.courseId) return;
    onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Exam" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="caesar-label">Course *</label>
          <select
            className="caesar-input w-full"
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
            required
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="caesar-label">Exam Title *</label>
          <input
            className="caesar-input w-full"
            placeholder="e.g. Midterm Exam"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="caesar-label">Date *</label>
          <input
            className="caesar-input w-full"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="caesar-btn-ghost">Cancel</button>
          <button type="submit" className="caesar-btn-primary">Save Exam</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ASSIGNMENT KANBAN ────────────────────────────────────────────────────────

interface KanbanProps {
  courses: Course[];
  onStatusChange: (courseId: string, assignmentId: string, newStatus: AssignmentStatus) => void;
  onAddAssignment: () => void;
  onDeleteAssignment: (courseId: string, assignmentId: string) => void;
}

function AssignmentKanban({ courses, onStatusChange, onAddAssignment, onDeleteAssignment }: KanbanProps) {
  const allAssignments = useMemo(() => {
    return courses.flatMap((course) =>
      course.assignments.map((a) => ({ ...a, courseName: course.name, courseColor: course.color || 'var(--text-muted)', courseId: course.id }))
    );
  }, [courses]);

  const columns: { status: AssignmentStatus; icon: React.ReactNode }[] = [
    { status: 'not-started', icon: <Clock size={13} style={{ color: '#6b7280' }} /> },
    { status: 'in-progress', icon: <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} /> },
    { status: 'submitted', icon: <CheckCircle size={13} style={{ color: 'var(--text-muted)' }} /> },
    { status: 'graded', icon: <Award size={13} style={{ color: 'var(--text-secondary)' }} /> },
  ];

  const moveStatus = (
    courseId: string,
    assignmentId: string,
    currentStatus: AssignmentStatus,
    direction: 'left' | 'right'
  ) => {
    const idx = ASSIGNMENT_STATUSES.indexOf(currentStatus);
    const newIdx = direction === 'right' ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= ASSIGNMENT_STATUSES.length) return;
    onStatusChange(courseId, assignmentId, ASSIGNMENT_STATUSES[newIdx]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title text-base">Assignment Board</h2>
        <button onClick={onAddAssignment} className="caesar-btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} />
          Add Assignment
        </button>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {columns.map(({ status, icon }) => {
          const colAssignments = allAssignments.filter((a) => a.status === status);
          const color = STATUS_COLORS[status];
          return (
            <div key={status} className="flex flex-col gap-2">
              {/* Column Header */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: `${color}12`, border: `1px solid ${color}25` }}
              >
                {icon}
                <span className="text-xs font-semibold" style={{ color }}>
                  {STATUS_LABELS[status]}
                </span>
                <span
                  className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {colAssignments.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 min-h-20">
                {colAssignments.length === 0 && (
                  <div
                    className="flex items-center justify-center py-6 rounded-xl border border-dashed"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Empty</span>
                  </div>
                )}
                {colAssignments.map((assignment) => {
                  const overdue = isOverdue(assignment.dueDate) && (status === 'not-started' || status === 'in-progress');
                  const statusIdx = ASSIGNMENT_STATUSES.indexOf(status);
                  return (
                    <div
                      key={assignment.id}
                      className="caesar-card !p-3 flex flex-col gap-2 transition-colors duration-300"
                      style={overdue ? { borderColor: 'var(--bg-elevated)' } : {}}
                    >
                      {/* Course dot + title */}
                      <div className="flex items-start gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ backgroundColor: assignment.courseColor }}
                        />
                        <p className="text-xs font-medium leading-snug flex-1" style={{ color: 'var(--text-secondary)' }}>
                          {assignment.title}
                        </p>
                      </div>

                      {/* Course name */}
                      <p className="text-xs pl-4 truncate" style={{ color: 'var(--text-muted)' }}>{assignment.courseName}</p>

                      {/* Due date */}
                      <div className="flex items-center gap-1 pl-4">
                        <Calendar size={10} style={{ color: overdue ? 'var(--text-secondary)' : 'var(--text-muted)' }} />
                        <span
                          className="text-xs"
                          style={{ color: overdue ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                        >
                          {overdue
                            ? `Overdue ${Math.abs(daysUntil(assignment.dueDate))}d`
                            : formatDate(assignment.dueDate)}
                        </span>
                      </div>

                      {/* Weight + grade */}
                      <div className="flex items-center gap-2 pl-4">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{assignment.weight}%</span>
                        {assignment.grade !== undefined && (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: gradeColor(assignment.grade) }}
                          >
                            {assignment.grade}% · {gradeToLetter(assignment.grade)}
                          </span>
                        )}
                      </div>

                      {/* Move + Delete buttons */}
                      <div
                        className="flex items-center gap-1 pt-1 border-t"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <button
                          onClick={() => moveStatus(assignment.courseId, assignment.id, status, 'left')}
                          disabled={statusIdx === 0}
                          className="p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <ChevronLeft size={12} />
                        </button>
                        <button
                          onClick={() => moveStatus(assignment.courseId, assignment.id, status, 'right')}
                          disabled={statusIdx === ASSIGNMENT_STATUSES.length - 1}
                          className="p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <ChevronRight size={12} />
                        </button>
                        <button
                          onClick={() => onDeleteAssignment(assignment.courseId, assignment.id)}
                          className="p-1 rounded transition-colors hover:text-[var(--text-secondary)] ml-auto"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EXAM COUNTDOWN ───────────────────────────────────────────────────────────

function ExamCountdown({ courses }: { courses: Course[] }) {
  const upcomingExams = useMemo(() => {
    return courses
      .flatMap((course) =>
        course.examDates
          .filter((e) => daysUntil(e.date) >= 0)
          .map((e) => ({
            ...e,
            courseName: course.name,
            courseColor: course.color || 'var(--text-muted)',
            days: daysUntil(e.date),
          }))
      )
      .sort((a, b) => a.days - b.days);
  }, [courses]);

  if (upcomingExams.length === 0) return null;

  const urgencyColor = (days: number) => {
    if (days <= 2) return 'var(--text-secondary)';
    if (days <= 7) return 'var(--text-muted)';
    return 'var(--text-secondary)';
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="section-title text-base flex items-center gap-2">
        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
        Exam Countdown
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {upcomingExams.map((exam) => {
          const uColor = urgencyColor(exam.days);
          return (
            <div
              key={exam.id}
              className="caesar-card flex flex-col gap-2 text-center transition-colors duration-300"
              style={{ borderColor: `${uColor}30` }}
            >
              <div
                className="w-2 h-2 rounded-full mx-auto"
                style={{ backgroundColor: exam.courseColor }}
              />
              <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-secondary)' }}>{exam.title}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{exam.courseName}</p>
              <div
                className="rounded-lg py-2 px-3"
                style={{ backgroundColor: `${uColor}15` }}
              >
                <p className="text-2xl font-black leading-none" style={{ color: uColor }}>
                  {exam.days === 0 ? '!' : exam.days}
                </p>
                <p className="text-xs mt-0.5" style={{ color: uColor }}>
                  {exam.days === 0 ? 'Today' : exam.days === 1 ? 'day left' : 'days left'}
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(exam.date)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AcademicTracker({ courses, setCourses }: Props) {
  // Course modals
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Assignment modals
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [prefillCourseId, setPrefillCourseId] = useState<string>('');

  // Exam modals
  const [addExamOpen, setAddExamOpen] = useState(false);
  const [examPrefillCourseId, setExamPrefillCourseId] = useState<string>('');

  // ── Course CRUD ──────────────────────────────────────────────────────────────

  const handleAddCourse = (data: CourseFormData) => {
    const newCourse: Course = {
      id: generateId(),
      name: data.name,
      professor: data.professor,
      credits: data.credits,
      currentGrade: data.currentGrade,
      targetGrade: data.targetGrade,
      color: data.color,
      assignments: [],
      examDates: [],
    };
    setCourses((prev) => [...(Array.isArray(prev) ? prev : []), newCourse]);
    setAddCourseOpen(false);
  };

  const handleEditCourse = (data: CourseFormData) => {
    if (!selectedCourse) return;
    setCourses((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === selectedCourse.id
          ? {
              ...c,
              name: data.name,
              professor: data.professor,
              credits: data.credits,
              currentGrade: data.currentGrade,
              targetGrade: data.targetGrade,
              color: data.color,
            }
          : c
      )
    );
    setEditCourseOpen(false);
    setSelectedCourse(null);
  };

  const handleDeleteCourse = (courseId: string) => {
    if (!window.confirm('Delete this course and all its assignments?')) return;
    setCourses((prev) => (Array.isArray(prev) ? prev : []).filter((c) => c.id !== courseId));
  };

  const openEditCourse = (course: Course) => {
    setSelectedCourse(course);
    setEditCourseOpen(true);
  };

  const openAddAssignmentForCourse = (courseId: string) => {
    setPrefillCourseId(courseId);
    setAddAssignmentOpen(true);
  };

  const openAddExamForCourse = (courseId: string) => {
    setExamPrefillCourseId(courseId);
    setAddExamOpen(true);
  };

  // ── Assignment CRUD ──────────────────────────────────────────────────────────

  const handleAddAssignment = (data: AssignmentFormData) => {
    const newAssignment: Assignment = {
      id: generateId(),
      courseId: data.courseId,
      title: data.title,
      status: data.status,
      dueDate: data.dueDate,
      weight: data.weight,
      grade: data.grade,
      notes: data.notes,
    };
    setCourses((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === data.courseId
          ? { ...c, assignments: [...c.assignments, newAssignment] }
          : c
      )
    );
    setAddAssignmentOpen(false);
    setPrefillCourseId('');
  };

  const handleAssignmentStatusChange = (
    courseId: string,
    assignmentId: string,
    newStatus: AssignmentStatus
  ) => {
    setCourses((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === courseId
          ? {
              ...c,
              assignments: c.assignments.map((a) =>
                a.id === assignmentId ? { ...a, status: newStatus } : a
              ),
            }
          : c
      )
    );
  };

  const handleAddExam = (data: ExamFormData) => {
    const newExam = { id: generateId(), title: data.title, date: data.date };
    setCourses((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === data.courseId
          ? { ...c, examDates: [...c.examDates, newExam] }
          : c
      )
    );
    setAddExamOpen(false);
    setExamPrefillCourseId('');
  };

  const handleDeleteAssignment = (courseId: string, assignmentId: string) => {
    setCourses((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        c.id === courseId
          ? { ...c, assignments: c.assignments.filter((a) => a.id !== assignmentId) }
          : c
      )
    );
  };

  return (
    <div className="flex flex-col gap-8 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Academic Tracker</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Courses, assignments, and exam schedule</p>
        </div>
        <button
          onClick={() => setAddCourseOpen(true)}
          className="caesar-btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Add Course
        </button>
      </div>

      {/* Stats Row */}
      <StatsRow courses={courses} />

      {/* Course Cards */}
      <div className="flex flex-col gap-4">
        <h2 className="section-title text-base flex items-center gap-2">
          <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
          My Courses
        </h2>
        {courses.length === 0 ? (
          <div className="caesar-card flex flex-col items-center justify-center py-16 text-center transition-colors duration-300">
            <GraduationCap size={40} className="mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No courses added yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Click "Add Course" to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onEdit={() => openEditCourse(course)}
                onDelete={() => handleDeleteCourse(course.id)}
                onAddAssignment={() => openAddAssignmentForCourse(course.id)}
                onAddExam={() => openAddExamForCourse(course.id)}
                onAssignmentStatusChange={handleAssignmentStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Exam Countdown */}
      <ExamCountdown courses={courses} />

      {/* Assignment Kanban */}
      {courses.length > 0 && (
        <AssignmentKanban
          courses={courses}
          onStatusChange={handleAssignmentStatusChange}
          onAddAssignment={() => { setPrefillCourseId(courses[0]?.id ?? ''); setAddAssignmentOpen(true); }}
          onDeleteAssignment={handleDeleteAssignment}
        />
      )}

      {/* Add Course Modal */}
      <CourseFormModal
        isOpen={addCourseOpen}
        onClose={() => setAddCourseOpen(false)}
        onSave={handleAddCourse}
        title="Add New Course"
      />

      {/* Edit Course Modal */}
      {selectedCourse && (
        <CourseFormModal
          isOpen={editCourseOpen}
          onClose={() => { setEditCourseOpen(false); setSelectedCourse(null); }}
          onSave={handleEditCourse}
          initial={{
            name: selectedCourse.name,
            professor: selectedCourse.professor,
            credits: selectedCourse.credits,
            currentGrade: selectedCourse.currentGrade,
            targetGrade: selectedCourse.targetGrade,
            color: selectedCourse.color,
          }}
          title={`Edit — ${selectedCourse.name}`}
        />
      )}

      {/* Add Assignment Modal */}
      <AssignmentFormModal
        isOpen={addAssignmentOpen}
        onClose={() => { setAddAssignmentOpen(false); setPrefillCourseId(''); }}
        onSave={handleAddAssignment}
        courses={courses}
        initial={{ courseId: prefillCourseId || courses[0]?.id }}
        title="Add Assignment"
      />

      {/* Add Exam Modal */}
      <ExamFormModal
        isOpen={addExamOpen}
        onClose={() => { setAddExamOpen(false); setExamPrefillCourseId(''); }}
        onSave={handleAddExam}
        courses={courses}
        initialCourseId={examPrefillCourseId || courses[0]?.id}
      />
    </div>
  );
}
