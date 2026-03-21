import React, { useState, useMemo } from 'react';
import {
  Target, Plus, Edit3, Trash2, ChevronDown, ChevronUp, ChevronRight, Check, Star,
  Zap, BookOpen, DollarSign, Heart, Users, User, Brain, Award, Calendar, AlertCircle,
  LayoutGrid, List, ChevronsDown, ChevronsUp, Filter,
} from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import type { Goal, GoalPeriod, GoalStatus, LifeArea, WeeklyReview, DecisionLog, Project } from '../../types';
import { generateId, todayStr, formatDate, daysUntil } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge, StatusBadge } from '../shared/Badge';
import { ConfettiBurst } from '../shared/ConfettiBurst';

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  goals: Goal[];
  setGoals: (v: Goal[] | ((p: Goal[]) => Goal[])) => void;
  weeklyReviews: WeeklyReview[];
  setWeeklyReviews: (v: WeeklyReview[] | ((p: WeeklyReview[]) => WeeklyReview[])) => void;
  decisionLogs: DecisionLog[];
  setDecisionLogs: (v: DecisionLog[] | ((p: DecisionLog[]) => DecisionLog[])) => void;
  projects: Project[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
];

const PERIOD_CHILD_MAP: Record<GoalPeriod, GoalPeriod | null> = {
  annual: 'quarterly', quarterly: 'weekly', weekly: 'daily', daily: null,
};

const LIFE_AREAS: { value: LifeArea; label: string; color: string; Icon: React.FC<any> }[] = [
  { value: 'ventures',      label: 'Ventures',      color: '#f97316', Icon: Zap },
  { value: 'academic',      label: 'Academic',      color: '#6366f1', Icon: BookOpen },
  { value: 'health',        label: 'Health',        color: '#22c55e', Icon: Heart },
  { value: 'spiritual',     label: 'Spiritual',     color: '#eab308', Icon: Star },
  { value: 'financial',     label: 'Financial',     color: '#3b82f6', Icon: DollarSign },
  { value: 'relationships', label: 'Relationships', color: '#ec4899', Icon: Users },
  { value: 'personal',      label: 'Personal',      color: '#8b5cf6', Icon: User },
];

const STATUSES: { value: GoalStatus; label: string }[] = [
  { value: 'not-started', label: 'Not Started' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

const STATUS_CYCLE: GoalStatus[] = ['not-started', 'in-progress', 'completed', 'blocked'];

const LIFE_AREA_OPTIONS = LIFE_AREAS.map(({ value, label }) => ({ value, label }));

function getAreaConfig(area: LifeArea) {
  return LIFE_AREAS.find(a => a.value === area) ?? LIFE_AREAS[6];
}

// ─── FORM TYPES ──────────────────────────────────────────────────────────────

interface GoalForm {
  title: string;
  description: string;
  period: GoalPeriod;
  status: GoalStatus;
  progress: string;
  area: LifeArea;
  parentId: string;
  dueDate: string;
  linkedProjectId: string;
}

function emptyGoalForm(overrides?: Partial<GoalForm>): GoalForm {
  return {
    title: '', description: '', period: 'annual', status: 'not-started',
    progress: '0', area: 'personal', parentId: '', dueDate: '', linkedProjectId: '',
    ...overrides,
  };
}

interface DecisionForm {
  date: string; decision: string; reasoning: string; outcome: string; area: LifeArea;
}

function emptyDecisionForm(): DecisionForm {
  return { date: todayStr(), decision: '', reasoning: '', outcome: '', area: 'personal' };
}

interface WizardForm {
  wins: string; misses: string; blockers: string; focusNextWeek: string; energyAvg: number;
}
function emptyWizard(): WizardForm {
  return { wins: '', misses: '', blockers: '', focusNextWeek: '', energyAvg: 3 };
}
const WIZARD_STEPS = [
  { label: 'Wins', field: 'wins' as keyof WizardForm, prompt: 'What were your wins this week?' },
  { label: 'Misses', field: 'misses' as keyof WizardForm, prompt: 'What did you miss or fall short on?' },
  { label: 'Blockers', field: 'blockers' as keyof WizardForm, prompt: 'What blockers are you facing?' },
  { label: 'Focus', field: 'focusNextWeek' as keyof WizardForm, prompt: 'What is your #1 focus for next week?' },
];

// ─── GOAL CARD ──────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  depth: number;
  children?: React.ReactNode;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string, parentPeriod: GoalPeriod) => void;
  onUpdateProgress: (id: string, progress: number) => void;
  onCycleStatus: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  hasChildren: boolean;
  childCount: number;
  childCompleted: number;
}

function GoalCard({
  goal, depth, children, onEdit, onDelete, onAddSub, onUpdateProgress, onCycleStatus,
  expanded, onToggleExpand, hasChildren, childCount, childCompleted,
}: GoalCardProps) {
  const area = getAreaConfig(goal.area);
  const AreaIcon = area.Icon;
  const days = goal.dueDate ? daysUntil(goal.dueDate) : null;
  const childPeriod = PERIOD_CHILD_MAP[goal.period];
  const isOverdue = days !== null && days < 0 && goal.status !== 'completed';
  const isDueSoon = days !== null && days >= 0 && days <= 7 && goal.status !== 'completed';

  return (
    <div className={`${depth > 0 ? 'ml-4 sm:ml-5 pl-3 sm:pl-4' : ''}`} style={depth > 0 ? { borderLeft: `2px solid ${area.color}33` } : {}}>
      <div
        className="caesar-card mb-2 transition-all duration-200 hover:shadow-md"
        style={{
          borderLeftWidth: 3, borderLeftColor: area.color, borderLeftStyle: 'solid',
          ...(isOverdue ? { borderColor: '#ef4444' } : {}),
          ...(goal.status === 'completed' ? { opacity: 0.7 } : {}),
        }}
      >
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Area icon + expand toggle */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: `${area.color}18` }}
              onClick={hasChildren ? onToggleExpand : undefined}
              title={hasChildren ? (expanded ? 'Collapse' : 'Expand') : area.label}
            >
              {hasChildren ? (
                expanded ? <ChevronDown size={14} style={{ color: area.color }} /> : <ChevronRight size={14} style={{ color: area.color }} />
              ) : (
                <AreaIcon size={14} style={{ color: area.color }} />
              )}
            </div>
            {hasChildren && (
              <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {childCompleted}/{childCount}
              </span>
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span
                className={`text-sm font-semibold ${goal.status === 'completed' ? 'line-through' : ''}`}
                style={{ color: 'var(--text-primary)' }}
              >
                {goal.title}
              </span>
              {/* Status badge — clickable to cycle */}
              <button
                onClick={() => onCycleStatus(goal.id)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to change status"
              >
                <StatusBadge status={goal.status} />
              </button>
              <Badge label={area.label} color={area.color} size="xs" variant="outline" />
            </div>

            {goal.description && (
              <p className="text-xs mb-1.5 leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{goal.description}</p>
            )}

            {/* Inline progress slider */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 relative h-2 rounded-full overflow-hidden cursor-pointer group" style={{ backgroundColor: 'var(--bg-elevated)' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
                  onUpdateProgress(goal.id, pct);
                }}
                title="Click to set progress"
              >
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300${goal.progress > 0 && goal.progress < 100 ? ' progress-shimmer' : ''}`}
                  style={{
                    width: `${goal.progress}%`,
                    background: goal.progress >= 100 ? '#22c55e' : `linear-gradient(90deg, ${area.color}, ${area.color}cc)`,
                  }}
                />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 rounded-full" />
              </div>
              <div className="relative flex-shrink-0">
                <span className="text-xs font-bold tabular-nums" style={{ color: goal.progress >= 100 ? '#22c55e' : area.color }}>{goal.progress}%</span>
                <ConfettiBurst trigger={goal.progress >= 100} />
              </div>
            </div>

            {/* Due date + meta */}
            <div className="flex items-center gap-3 flex-wrap">
              {goal.dueDate && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Calendar size={10} style={{ color: isOverdue ? '#ef4444' : isDueSoon ? '#f97316' : 'var(--text-muted)' }} />
                  <span style={{ color: isOverdue ? '#ef4444' : isDueSoon ? '#f97316' : 'var(--text-muted)' }}>
                    {formatDate(goal.dueDate)}
                    {days !== null && (
                      <span className="ml-1 font-medium">
                        {days < 0 ? `(${Math.abs(days)}d overdue)` : days === 0 ? '(today)' : `(${days}d)`}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                {goal.period}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => onEdit(goal)} className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: 'var(--text-muted)' }} title="Edit">
              <Edit3 size={13} />
            </button>
            <button onClick={() => onDelete(goal.id)} className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: 'var(--text-muted)' }} title="Delete">
              <Trash2 size={13} />
            </button>
            {childPeriod && (
              <button onClick={() => onAddSub(goal.id, goal.period)} className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: area.color }} title={`Add ${childPeriod} sub-goal`}>
                <Plus size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && children}
    </div>
  );
}

// ─── 2026 SEED GOALS ────────────────────────────────────────────────────────

const SEED_2026_GOALS: Goal[] = (() => {
  const annual = (id: string, title: string, area: LifeArea): Goal => ({
    id, title, description: '2026 annual goal', period: 'annual',
    status: 'not-started', progress: 0, area, dueDate: '2026-12-31', createdAt: '2026-01-01',
  });
  const child = (id: string, title: string, parentId: string, area: LifeArea, sixMonth = false): Goal => ({
    id, title, description: sixMonth ? '6-month commitment' : '', period: 'quarterly',
    status: 'not-started', progress: 0, area, parentId,
    dueDate: sixMonth ? '2026-06-30' : '2026-12-31', createdAt: '2026-01-01',
  });
  return [
    annual('ella-sp-2026', 'Ella — Spiritual 2026', 'spiritual'),
    annual('ella-int-2026', 'Ella — Intellectual 2026', 'academic'),
    annual('ella-phys-2026', 'Ella — Physical 2026', 'health'),
    annual('ella-emo-2026', 'Ella — Emotional 2026', 'personal'),
    annual('reed-sp-2026', 'Reed — Spiritual 2026', 'spiritual'),
    annual('reed-int-2026', 'Reed — Intellectual 2026', 'academic'),
    annual('reed-phys-2026', 'Reed — Physical 2026', 'health'),
    annual('reed-emo-2026', 'Reed — Emotional 2026', 'personal'),
    annual('us-2026', 'Us — Together 2026', 'relationships'),
    child('ella-sp-1', 'Stay on top of Come Follow Me', 'ella-sp-2026', 'spiritual'),
    child('ella-sp-2', '15 min scripture study daily', 'ella-sp-2026', 'spiritual', true),
    child('ella-sp-3', 'In prayers, always express specific things I\'m grateful for', 'ella-sp-2026', 'spiritual', true),
    child('ella-sp-4', 'Be PRESENT at church — intentionally meet members', 'ella-sp-2026', 'spiritual', true),
    child('ella-int-1', 'Figure out Psychology internship', 'ella-int-2026', 'academic'),
    child('ella-int-2', 'No homework on Sundays', 'ella-int-2026', 'academic', true),
    child('ella-int-3', "Utilize TA's", 'ella-int-2026', 'academic', true),
    child('ella-int-4', 'Read 4 books', 'ella-int-2026', 'academic', true),
    child('ella-phys-1', 'Intentional mornings — gym, breakfast', 'ella-phys-2026', 'health'),
    child('ella-phys-2', 'ALWAYS be performing in team', 'ella-phys-2026', 'health', true),
    child('ella-phys-3', 'Strive for well-rounded meals', 'ella-phys-2026', 'health', true),
    child('ella-phys-4', 'Drink 2 Owalas daily', 'ella-phys-2026', 'health', true),
    child('ella-emo-1', 'Journal daily — something that made me smile, a tender mercy, and a stressor', 'ella-emo-2026', 'personal'),
    child('ella-emo-2', 'Reach out to two friends a week', 'ella-emo-2026', 'personal', true),
    child('ella-emo-3', 'Make getting ready for bed a positive experience', 'ella-emo-2026', 'personal', true),
    child('ella-emo-4', 'Set aside 15 min in afternoon to respond/clear notifications', 'ella-emo-2026', 'personal', true),
    child('reed-sp-1', 'Read the whole Old Testament (CFM)', 'reed-sp-2026', 'spiritual'),
    child('reed-sp-2', 'Scripture study before media — at least 15 min daily + 1 sentence journal', 'reed-sp-2026', 'spiritual'),
    child('reed-sp-3', 'Come to Sunday with a plan: 1 question + 1 person to serve', 'reed-sp-2026', 'spiritual'),
    child('reed-sp-4', 'Serve intentionally (ministering)', 'reed-sp-2026', 'spiritual'),
    child('reed-int-1', "Become 'dangerously competent' in Meta ads", 'reed-int-2026', 'academic'),
    child('reed-int-2', 'Reading: 6 business, 3 spiritual, 2 relationship/psychology', 'reed-int-2026', 'academic'),
    child('reed-phys-1', 'Two real meals and one clean snack daily', 'reed-phys-2026', 'health'),
    child('reed-phys-2', '12% body fat percentage', 'reed-phys-2026', 'health'),
    child('reed-phys-3', 'Lift 4 days a week, cardio 2 times a week', 'reed-phys-2026', 'health'),
    child('reed-phys-4', 'PPL program', 'reed-phys-2026', 'health'),
    child('reed-emo-1', 'Fully unplug on Sundays', 'reed-emo-2026', 'personal'),
    child('reed-emo-2', 'No work on Tuesdays (date night)', 'reed-emo-2026', 'personal'),
    child('reed-emo-3', 'Journal weekly on Sundays', 'reed-emo-2026', 'personal'),
    child('us-1', 'Go to the temple monthly', 'us-2026', 'relationships'),
    child('us-2', 'Only eat out once a week', 'us-2026', 'relationships'),
    child('us-3', 'Finish Book of Mormon together', 'us-2026', 'relationships'),
    child('us-4', '30 min weekly talk / comp counsel', 'us-2026', 'relationships'),
  ];
})();

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export function GoalHierarchy({ goals, setGoals, weeklyReviews, setWeeklyReviews, decisionLogs, setDecisionLogs, projects }: Props) {
  const [activePeriodTab, setActivePeriodTab] = useState<GoalPeriod>('annual');
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [filterArea, setFilterArea] = useState<LifeArea | 'all'>('all');
  const [viewMode, setViewMode] = useState<'tree' | 'board'>('tree');
  const [quickAddText, setQuickAddText] = useState('');

  // Goal CRUD
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm());

  // Weekly Review
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardForm, setWizardForm] = useState<WizardForm>(emptyWizard());
  const [showPastReviews, setShowPastReviews] = useState(false);

  // Decision Log
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [editingDecision, setEditingDecision] = useState<DecisionLog | null>(null);
  const [decisionForm, setDecisionForm] = useState<DecisionForm>(emptyDecisionForm());

  // ── Derived data ──────────────────────────────────────────────────────────
  const goalById = useMemo(() => new Map(goals.map(g => [g.id, g])), [goals]);

  const periodGoals = useMemo(() => {
    let filtered = goals.filter(g => g.period === activePeriodTab);
    if (filterArea !== 'all') filtered = filtered.filter(g => g.area === filterArea);
    return filtered;
  }, [goals, activePeriodTab, filterArea]);

  const rootGoals = useMemo(() => {
    return periodGoals.filter(g => !g.parentId || !goals.find(p => p.id === g.parentId));
  }, [periodGoals, goals]);

  function getChildren(parentId: string): Goal[] {
    return goals.filter(g => g.parentId === parentId);
  }

  function getDescendantStats(parentId: string): { total: number; completed: number } {
    const children = getChildren(parentId);
    let total = children.length;
    let completed = children.filter(c => c.status === 'completed').length;
    for (const c of children) {
      const sub = getDescendantStats(c.id);
      total += sub.total;
      completed += sub.completed;
    }
    return { total, completed };
  }

  // ── Period summary stats ──────────────────────────────────────────────────
  const periodStats = useMemo(() => {
    const filtered = filterArea === 'all' ? goals : goals.filter(g => g.area === filterArea);
    return PERIODS.map(p => {
      const pg = filtered.filter(g => g.period === p.value);
      const completed = pg.filter(g => g.status === 'completed').length;
      const overdue = pg.filter(g => {
        if (g.status === 'completed') return false;
        try { return g.dueDate && differenceInDays(new Date(), parseISO(g.dueDate)) > 0; } catch { return false; }
      }).length;
      const avgProgress = pg.length > 0 ? Math.round(pg.reduce((s, g) => s + g.progress, 0) / pg.length) : 0;
      return { ...p, total: pg.length, completed, overdue, avgProgress };
    });
  }, [goals, filterArea]);

  // ── Alignment score ───────────────────────────────────────────────────────
  const alignmentScore = useMemo(() => {
    const daily = goals.filter(g => g.period === 'daily');
    if (daily.length === 0) return 0;
    const annualIds = new Set(goals.filter(g => g.period === 'annual').map(g => g.id));
    function tracesBack(goalId: string, visited = new Set<string>()): boolean {
      if (visited.has(goalId)) return false;
      visited.add(goalId);
      const goal = goalById.get(goalId);
      if (!goal) return false;
      if (annualIds.has(goal.id)) return true;
      if (goal.parentId) return tracesBack(goal.parentId, visited);
      return false;
    }
    const aligned = daily.filter(g => g.parentId && tracesBack(g.id)).length;
    return Math.round((aligned / daily.length) * 100);
  }, [goals, goalById]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpandedGoals(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function expandAll() { setExpandedGoals(new Set(goals.map(g => g.id))); }
  function collapseAll() { setExpandedGoals(new Set()); }

  function updateProgress(id: string, progress: number) {
    const autoStatus = progress >= 100 ? 'completed' : progress > 0 ? 'in-progress' : 'not-started';
    setGoals(prev => prev.map(g => g.id === id ? { ...g, progress, status: g.status === 'blocked' ? g.status : autoStatus } : g));
  }

  function cycleStatus(id: string) {
    setGoals(prev => prev.map(g => {
      if (g.id !== id) return g;
      const idx = STATUS_CYCLE.indexOf(g.status);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      return { ...g, status: next, progress: next === 'completed' ? 100 : g.progress };
    }));
  }

  function quickAdd() {
    const title = quickAddText.trim();
    if (!title) return;
    const goal: Goal = {
      id: generateId(), title, description: '', period: activePeriodTab,
      status: 'not-started', progress: 0, area: filterArea === 'all' ? 'personal' : filterArea,
      dueDate: '', createdAt: todayStr(),
    };
    setGoals(prev => [...prev, goal]);
    setQuickAddText('');
  }

  function openAddGoal(overrides?: Partial<GoalForm>) {
    setEditingGoal(null);
    setGoalForm(emptyGoalForm({ period: activePeriodTab, area: filterArea === 'all' ? 'personal' : filterArea, ...overrides }));
    setShowGoalModal(true);
  }
  function openAddSubGoal(parentId: string, parentPeriod: GoalPeriod) {
    const childPeriod = PERIOD_CHILD_MAP[parentPeriod];
    if (!childPeriod) return;
    const parent = goalById.get(parentId);
    setEditingGoal(null);
    setGoalForm(emptyGoalForm({ period: childPeriod, parentId, area: parent?.area ?? 'personal' }));
    setShowGoalModal(true);
  }
  function openEditGoal(goal: Goal) {
    setEditingGoal(goal);
    setGoalForm({
      title: goal.title, description: goal.description, period: goal.period,
      status: goal.status, progress: String(goal.progress), area: goal.area,
      parentId: goal.parentId ?? '', dueDate: goal.dueDate, linkedProjectId: goal.linkedProjectId ?? '',
    });
    setShowGoalModal(true);
  }
  function saveGoal() {
    if (!goalForm.title.trim()) return;
    const progress = Math.min(100, Math.max(0, parseInt(goalForm.progress) || 0));
    const goal: Goal = {
      id: editingGoal?.id ?? generateId(), title: goalForm.title.trim(),
      description: goalForm.description.trim(), period: goalForm.period,
      status: goalForm.status, progress, area: goalForm.area,
      parentId: goalForm.parentId || undefined, dueDate: goalForm.dueDate,
      linkedProjectId: goalForm.linkedProjectId || undefined,
      createdAt: editingGoal?.createdAt ?? todayStr(),
    };
    if (editingGoal) setGoals(prev => prev.map(g => g.id === editingGoal.id ? goal : g));
    else setGoals(prev => [...prev, goal]);
    setShowGoalModal(false);
  }
  function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id && g.parentId !== id));
  }

  // Weekly Review
  function openWizard() { setWizardForm(emptyWizard()); setWizardStep(0); setShowWizard(true); }
  function submitReview() {
    const review: WeeklyReview = {
      id: generateId(), weekOf: todayStr(), wins: wizardForm.wins, misses: wizardForm.misses,
      blockers: wizardForm.blockers, focusNextWeek: wizardForm.focusNextWeek,
      energyAvg: wizardForm.energyAvg, createdAt: todayStr(),
    };
    setWeeklyReviews(prev => [review, ...prev]);
    setShowWizard(false);
  }
  const sortedReviews = useMemo(() => [...weeklyReviews].sort((a, b) => b.weekOf.localeCompare(a.weekOf)), [weeklyReviews]);

  // Decision Log
  function openAddDecision() { setEditingDecision(null); setDecisionForm(emptyDecisionForm()); setShowDecisionModal(true); }
  function openEditDecision(d: DecisionLog) {
    setEditingDecision(d);
    setDecisionForm({ date: d.date, decision: d.decision, reasoning: d.reasoning, outcome: d.outcome, area: d.area });
    setShowDecisionModal(true);
  }
  function saveDecision() {
    if (!decisionForm.decision.trim()) return;
    const log: DecisionLog = {
      id: editingDecision?.id ?? generateId(), date: decisionForm.date,
      decision: decisionForm.decision.trim(), reasoning: decisionForm.reasoning.trim(),
      outcome: decisionForm.outcome.trim(), area: decisionForm.area,
    };
    if (editingDecision) setDecisionLogs(prev => prev.map(d => d.id === editingDecision.id ? log : d));
    else setDecisionLogs(prev => [log, ...prev]);
    setShowDecisionModal(false);
  }
  function deleteDecision(id: string) { setDecisionLogs(prev => prev.filter(d => d.id !== id)); }
  function isReviewDue(log: DecisionLog): boolean {
    if (log.outcome) return false;
    try { return differenceInDays(new Date(), parseISO(log.date)) > 30; } catch { return false; }
  }

  // ── Render goal tree ──────────────────────────────────────────────────────
  function renderGoalTree(goalsToRender: Goal[], depth = 0): React.ReactNode {
    return goalsToRender.map(goal => {
      const children = getChildren(goal.id);
      const hasChildren = children.length > 0;
      const stats = getDescendantStats(goal.id);
      return (
        <GoalCard
          key={goal.id} goal={goal} depth={depth} hasChildren={hasChildren}
          childCount={stats.total} childCompleted={stats.completed}
          expanded={expandedGoals.has(goal.id)} onToggleExpand={() => toggleExpand(goal.id)}
          onEdit={openEditGoal} onDelete={deleteGoal} onAddSub={openAddSubGoal}
          onUpdateProgress={updateProgress} onCycleStatus={cycleStatus}
        >
          {expandedGoals.has(goal.id) && hasChildren ? renderGoalTree(children, depth + 1) : null}
        </GoalCard>
      );
    });
  }

  // ── Board view (kanban by status) ─────────────────────────────────────────
  function renderBoard() {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUSES.map(s => {
          const statusGoals = periodGoals.filter(g => g.status === s.value);
          const statusColors: Record<GoalStatus, string> = {
            'not-started': '#6b7280', 'in-progress': '#3b82f6', completed: '#22c55e', blocked: '#ef4444',
          };
          return (
            <div key={s.value} className="flex flex-col">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[s.value] }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{statusGoals.length}</span>
              </div>
              <div className="space-y-2 flex-1">
                {statusGoals.map(goal => {
                  const area = getAreaConfig(goal.area);
                  return (
                    <div key={goal.id} className="caesar-card p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEditGoal(goal)}
                      style={{ borderLeftWidth: 3, borderLeftColor: area.color, borderLeftStyle: 'solid' }}
                    >
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{goal.title}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                          <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, backgroundColor: area.color }} />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{goal.progress}%</span>
                      </div>
                      {goal.dueDate && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{formatDate(goal.dueDate)}</p>
                      )}
                    </div>
                  );
                })}
                {statusGoals.length === 0 && (
                  <div className="text-center py-6 text-[11px] rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    No goals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── ALIGNMENT SCORE + PERIOD STATS ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Alignment gauge */}
        <div className="caesar-card flex items-center gap-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-elevated)" strokeWidth="10" />
              <circle cx="50" cy="50" r="40" fill="none" stroke={alignmentScore >= 80 ? '#22c55e' : alignmentScore >= 50 ? '#eab308' : '#ef4444'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - alignmentScore / 100)}`}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{alignmentScore}%</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Alignment</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily→Annual</p>
          </div>
        </div>

        {/* Period stat cards */}
        {periodStats.map(p => {
          const isActive = activePeriodTab === p.value;
          return (
            <button key={p.value} onClick={() => setActivePeriodTab(p.value)}
              className="caesar-card flex flex-col gap-1 text-left transition-all"
              style={isActive ? { border: '1px solid var(--border-strong)', boxShadow: '0 0 0 1px var(--border-strong)' } : {}}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{p.label}</span>
                <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{p.total}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${p.avgProgress}%`, backgroundColor: '#6366f1' }} />
                </div>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{p.avgProgress}%</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <span style={{ color: '#22c55e' }}>{p.completed} done</span>
                {p.overdue > 0 && <span style={{ color: '#ef4444' }}>{p.overdue} overdue</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── TOOLBAR ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Area filter */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilterArea('all')}
            className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex-shrink-0"
            style={{ backgroundColor: filterArea === 'all' ? 'var(--bg-elevated)' : 'transparent', color: filterArea === 'all' ? 'var(--text-primary)' : 'var(--text-muted)', border: filterArea === 'all' ? '1px solid var(--border)' : '1px solid transparent' }}
          >
            All Areas
          </button>
          {LIFE_AREAS.map(a => {
            const count = goals.filter(g => g.area === a.value && g.period === activePeriodTab).length;
            if (count === 0 && filterArea !== a.value) return null;
            return (
              <button key={a.value} onClick={() => setFilterArea(filterArea === a.value ? 'all' : a.value)}
                className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex-shrink-0 flex items-center gap-1"
                style={{
                  backgroundColor: filterArea === a.value ? `${a.color}20` : 'transparent',
                  color: filterArea === a.value ? a.color : 'var(--text-muted)',
                  border: `1px solid ${filterArea === a.value ? `${a.color}44` : 'transparent'}`,
                }}
              >
                <a.Icon size={10} /> {a.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={expandAll} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: 'var(--text-muted)' }} title="Expand all">
            <ChevronsDown size={14} />
          </button>
          <button onClick={collapseAll} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: 'var(--text-muted)' }} title="Collapse all">
            <ChevronsUp size={14} />
          </button>
          <button onClick={() => setViewMode(v => v === 'tree' ? 'board' : 'tree')} className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors" style={{ color: viewMode === 'board' ? '#6366f1' : 'var(--text-muted)' }} title={viewMode === 'tree' ? 'Board view' : 'Tree view'}>
            {viewMode === 'tree' ? <LayoutGrid size={14} /> : <List size={14} />}
          </button>
          {!goals.some(g => g.id.startsWith('ella-') || g.id.startsWith('reed-') || g.id === 'us-2026') && (
            <button onClick={() => setGoals(prev => [...prev, ...SEED_2026_GOALS])} className="caesar-btn-ghost text-[10px] px-2 py-1 border" style={{ borderColor: 'var(--border)' }}>
              Load 2026
            </button>
          )}
          <button onClick={() => openAddGoal()} className="caesar-btn-primary flex items-center gap-1 text-xs px-3 py-1.5">
            <Plus size={12} /> Goal
          </button>
        </div>
      </div>

      {/* ── QUICK ADD ────────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <input
          value={quickAddText}
          onChange={e => setQuickAddText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') quickAdd(); }}
          placeholder={`Quick add ${activePeriodTab} goal...`}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
        <button onClick={quickAdd} disabled={!quickAddText.trim()} className="caesar-btn-primary px-3 py-2 text-sm disabled:opacity-30">
          <Plus size={14} />
        </button>
      </div>

      {/* ── GOAL VIEW ────────────────────────────────────────────────────────── */}
      {viewMode === 'tree' ? (
        rootGoals.length === 0 ? (
          <div className="caesar-card text-center py-10">
            <Target size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {activePeriodTab} goals{filterArea !== 'all' ? ` in ${filterArea}` : ''} yet.</p>
            <button onClick={() => openAddGoal()} className="caesar-btn-primary mt-4 text-xs flex items-center gap-1 mx-auto">
              <Plus size={12} /> Add {activePeriodTab} goal
            </button>
          </div>
        ) : (
          <div>{renderGoalTree(rootGoals, 0)}</div>
        )
      ) : renderBoard()}

      {/* ── WEEKLY REVIEW ────────────────────────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award size={18} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Weekly Review</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({sortedReviews.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {sortedReviews.length > 0 && (
              <button onClick={() => setShowPastReviews(v => !v)} className="caesar-btn-ghost text-xs flex items-center gap-1">
                {showPastReviews ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Past
              </button>
            )}
            <button onClick={openWizard} className="caesar-btn-primary text-xs flex items-center gap-1">
              <Star size={12} /> Review
            </button>
          </div>
        </div>
        {showPastReviews && sortedReviews.length > 0 && (
          <div className="space-y-3">
            {sortedReviews.map(r => (
              <div key={r.id} className="rounded-xl p-4 border" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Week of {formatDate(r.weekOf)}</span>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(n => <div key={n} className="w-2 h-2 rounded-full" style={{ backgroundColor: n <= r.energyAvg ? '#eab308' : 'var(--bg-hover)' }} />)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {r.wins && <div><span className="text-emerald-400 font-medium">Wins: </span><span style={{ color: 'var(--text-secondary)' }}>{r.wins}</span></div>}
                  {r.misses && <div><span style={{ color: '#ef4444' }} className="font-medium">Misses: </span><span style={{ color: 'var(--text-secondary)' }}>{r.misses}</span></div>}
                  {r.blockers && <div><span style={{ color: '#f97316' }} className="font-medium">Blockers: </span><span style={{ color: 'var(--text-secondary)' }}>{r.blockers}</span></div>}
                  {r.focusNextWeek && <div><span style={{ color: '#3b82f6' }} className="font-medium">Focus: </span><span style={{ color: 'var(--text-secondary)' }}>{r.focusNextWeek}</span></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DECISION LOG ──────────────────────────────────────────────────────── */}
      <div className="caesar-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={18} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Decision Log</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({decisionLogs.length})</span>
          </div>
          <button onClick={openAddDecision} className="caesar-btn-primary flex items-center gap-1 text-xs"><Plus size={12} /> Decision</button>
        </div>
        {decisionLogs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No decisions logged yet.</p>
        ) : (
          <div className="space-y-2">
            {[...decisionLogs].sort((a, b) => b.date.localeCompare(a.date)).map(d => {
              const area = getAreaConfig(d.area);
              return (
                <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors group" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${area.color}18` }}>
                    <area.Icon size={12} style={{ color: area.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{d.decision}</p>
                    {d.reasoning && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.reasoning}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatDate(d.date)}</span>
                      {d.outcome ? (
                        <span className="text-[10px] text-emerald-400">✓ {d.outcome}</span>
                      ) : isReviewDue(d) ? (
                        <span className="text-[10px] flex items-center gap-0.5" style={{ color: '#f97316' }}><AlertCircle size={9} /> Review due</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditDecision(d)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><Edit3 size={12} /></button>
                    <button onClick={() => deleteDecision(d.id)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}

      {/* Goal Modal */}
      <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title={editingGoal ? 'Edit Goal' : 'Add Goal'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="caesar-label">Title *</label>
            <input type="text" value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))} className="caesar-input w-full" placeholder="What do you want to achieve?" />
          </div>
          <div>
            <label className="caesar-label">Description</label>
            <textarea value={goalForm.description} onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))} className="caesar-input w-full resize-none" rows={2} placeholder="Why does this matter?" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="caesar-label">Period</label>
              <select value={goalForm.period} onChange={e => setGoalForm(p => ({ ...p, period: e.target.value as GoalPeriod }))} className="caesar-input w-full">
                {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="caesar-label">Status</label>
              <select value={goalForm.status} onChange={e => setGoalForm(p => ({ ...p, status: e.target.value as GoalStatus }))} className="caesar-input w-full">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="caesar-label">Area</label>
              <select value={goalForm.area} onChange={e => setGoalForm(p => ({ ...p, area: e.target.value as LifeArea }))} className="caesar-input w-full">
                {LIFE_AREA_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="caesar-label">Progress</label>
              <input type="number" min={0} max={100} value={goalForm.progress} onChange={e => setGoalForm(p => ({ ...p, progress: e.target.value }))} className="caesar-input w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Due Date</label>
              <input type="date" value={goalForm.dueDate} onChange={e => setGoalForm(p => ({ ...p, dueDate: e.target.value }))} className="caesar-input w-full" />
            </div>
            <div>
              <label className="caesar-label">Parent Goal</label>
              <select value={goalForm.parentId} onChange={e => setGoalForm(p => ({ ...p, parentId: e.target.value }))} className="caesar-input w-full">
                <option value="">— None —</option>
                {goals.filter(g => g.id !== editingGoal?.id).map(g => <option key={g.id} value={g.id}>[{g.period}] {g.title}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="caesar-label">Linked Project</label>
            <select value={goalForm.linkedProjectId} onChange={e => setGoalForm(p => ({ ...p, linkedProjectId: e.target.value }))} className="caesar-input w-full">
              <option value="">— None —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveGoal} className="caesar-btn-primary flex-1">{editingGoal ? 'Save Changes' : 'Add Goal'}</button>
            <button onClick={() => setShowGoalModal(false)} className="caesar-btn-ghost flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Weekly Review Wizard */}
      <Modal isOpen={showWizard} onClose={() => setShowWizard(false)} title="Weekly Review" size="md">
        <div className="flex items-center gap-2 mb-6">
          {[...WIZARD_STEPS, { label: 'Energy', field: 'energyAvg' as keyof WizardForm, prompt: '' }].map((step, idx) => (
            <React.Fragment key={step.label}>
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all"
                style={idx < wizardStep ? { backgroundColor: '#22c55e', color: '#fff' } : idx === wizardStep ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                {idx < wizardStep ? <Check size={10} /> : idx + 1}
              </div>
              {idx < 4 && <div className="flex-1 h-0.5" style={{ backgroundColor: idx < wizardStep ? '#22c55e' : 'var(--bg-elevated)' }} />}
            </React.Fragment>
          ))}
        </div>
        {wizardStep < WIZARD_STEPS.length ? (
          <div className="space-y-4">
            <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
              Step {wizardStep + 1}/{WIZARD_STEPS.length + 1}: {WIZARD_STEPS[wizardStep].prompt}
            </label>
            <textarea value={String(wizardForm[WIZARD_STEPS[wizardStep].field])} onChange={e => setWizardForm(p => ({ ...p, [WIZARD_STEPS[wizardStep].field]: e.target.value }))} className="caesar-input w-full resize-none" rows={5} placeholder="Be honest and specific..." autoFocus />
            <div className="flex gap-3">
              {wizardStep > 0 && <button onClick={() => setWizardStep(s => s - 1)} className="caesar-btn-ghost flex-1">Back</button>}
              <button onClick={() => setWizardStep(s => s + 1)} className="caesar-btn-primary flex-1">Next</button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text-primary)' }}>Step 5/5: Rate your energy (1–5)</label>
            <div className="flex items-center gap-4">
              <input type="range" min={1} max={5} step={1} value={wizardForm.energyAvg} onChange={e => setWizardForm(p => ({ ...p, energyAvg: parseInt(e.target.value) }))} className="flex-1 accent-yellow-400" />
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => <div key={n} className="w-4 h-4 rounded-full transition-all" style={{ backgroundColor: n <= wizardForm.energyAvg ? '#eab308' : 'var(--bg-hover)', boxShadow: n <= wizardForm.energyAvg ? '0 0 6px #eab308' : 'none' }} />)}
              </div>
              <span className="text-lg font-bold" style={{ color: '#eab308' }}>{wizardForm.energyAvg}/5</span>
            </div>
            <div className="rounded-xl border p-4 space-y-1 text-xs" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Summary</p>
              {wizardForm.wins && <p><span className="text-emerald-400">Wins:</span> {wizardForm.wins.slice(0, 80)}{wizardForm.wins.length > 80 ? '…' : ''}</p>}
              {wizardForm.misses && <p><span style={{ color: '#ef4444' }}>Misses:</span> {wizardForm.misses.slice(0, 80)}</p>}
              {wizardForm.focusNextWeek && <p><span style={{ color: '#3b82f6' }}>Focus:</span> {wizardForm.focusNextWeek.slice(0, 80)}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setWizardStep(s => s - 1)} className="caesar-btn-ghost flex-1">Back</button>
              <button onClick={submitReview} className="caesar-btn-primary flex-1 flex items-center justify-center gap-1"><Check size={14} /> Submit</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Decision Modal */}
      <Modal isOpen={showDecisionModal} onClose={() => setShowDecisionModal(false)} title={editingDecision ? 'Edit Decision' : 'Log Decision'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="caesar-label">Date</label>
              <input type="date" value={decisionForm.date} onChange={e => setDecisionForm(p => ({ ...p, date: e.target.value }))} className="caesar-input w-full" />
            </div>
            <div>
              <label className="caesar-label">Area</label>
              <select value={decisionForm.area} onChange={e => setDecisionForm(p => ({ ...p, area: e.target.value as LifeArea }))} className="caesar-input w-full">
                {LIFE_AREA_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="caesar-label">Decision *</label>
            <textarea value={decisionForm.decision} onChange={e => setDecisionForm(p => ({ ...p, decision: e.target.value }))} className="caesar-input w-full resize-none" rows={2} placeholder="What did you decide?" />
          </div>
          <div>
            <label className="caesar-label">Reasoning</label>
            <textarea value={decisionForm.reasoning} onChange={e => setDecisionForm(p => ({ ...p, reasoning: e.target.value }))} className="caesar-input w-full resize-none" rows={2} placeholder="Why?" />
          </div>
          <div>
            <label className="caesar-label">Outcome</label>
            <textarea value={decisionForm.outcome} onChange={e => setDecisionForm(p => ({ ...p, outcome: e.target.value }))} className="caesar-input w-full resize-none" rows={2} placeholder="Fill in later..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveDecision} className="caesar-btn-primary flex-1">{editingDecision ? 'Save' : 'Log Decision'}</button>
            <button onClick={() => setShowDecisionModal(false)} className="caesar-btn-ghost flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
