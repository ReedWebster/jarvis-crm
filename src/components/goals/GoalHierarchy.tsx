import React, { useState, useMemo } from 'react';
import {
  Target,
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  Circle,
  Clock,
  Star,
  Zap,
  BookOpen,
  DollarSign,
  Heart,
  Users,
  User,
  Brain,
  TrendingUp,
  BarChart2,
  Calendar,
  AlertCircle,
  Award,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Goal, GoalPeriod, GoalStatus, LifeArea, WeeklyReview, DecisionLog, Project } from '../../types';
import { generateId, todayStr, formatDate, daysUntil } from '../../utils';
import { Modal } from '../shared/Modal';
import { Badge, StatusBadge } from '../shared/Badge';

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
  annual: 'quarterly',
  quarterly: 'weekly',
  weekly: 'daily',
  daily: null,
};

const LIFE_AREAS: { value: LifeArea; label: string; color: string; Icon: React.FC<any> }[] = [
  { value: 'ventures', label: 'Ventures', color: '#00CFFF', Icon: Zap },
  { value: 'academic', label: 'Academic', color: '#818cf8', Icon: BookOpen },
  { value: 'health', label: 'Health', color: '#22c55e', Icon: Heart },
  { value: 'spiritual', label: 'Spiritual', color: '#FFD700', Icon: Star },
  { value: 'financial', label: 'Financial', color: '#34d399', Icon: DollarSign },
  { value: 'relationships', label: 'Relationships', color: '#f472b6', Icon: Users },
  { value: 'personal', label: 'Personal', color: '#a78bfa', Icon: User },
];

const STATUSES: { value: GoalStatus; label: string }[] = [
  { value: 'not-started', label: 'Not Started' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

const LIFE_AREA_OPTIONS: { value: LifeArea; label: string }[] = LIFE_AREAS.map(({ value, label }) => ({ value, label }));

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getAreaConfig(area: LifeArea) {
  return LIFE_AREAS.find((a) => a.value === area) ?? LIFE_AREAS[6];
}

function getStatusColor(status: GoalStatus): string {
  const map: Record<GoalStatus, string> = {
    'not-started': '#6b7280',
    'in-progress': '#00CFFF',
    completed: '#22c55e',
    blocked: '#ef4444',
  };
  return map[status];
}

// ─── FORM TYPES ───────────────────────────────────────────────────────────────

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
    title: '',
    description: '',
    period: 'annual',
    status: 'not-started',
    progress: '0',
    area: 'personal',
    parentId: '',
    dueDate: '',
    linkedProjectId: '',
    ...overrides,
  };
}

interface DecisionForm {
  date: string;
  decision: string;
  reasoning: string;
  outcome: string;
  area: LifeArea;
}

function emptyDecisionForm(): DecisionForm {
  return { date: todayStr(), decision: '', reasoning: '', outcome: '', area: 'personal' };
}

// ─── WEEKLY REVIEW WIZARD ────────────────────────────────────────────────────

interface WizardForm {
  wins: string;
  misses: string;
  blockers: string;
  focusNextWeek: string;
  energyAvg: number;
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

// ─── GOAL CARD ────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  depth: number;
  children?: React.ReactNode;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string, parentPeriod: GoalPeriod) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  hasChildren: boolean;
}

function GoalCard({
  goal,
  depth,
  children,
  onEdit,
  onDelete,
  onAddSub,
  expanded,
  onToggleExpand,
  hasChildren,
}: GoalCardProps) {
  const area = getAreaConfig(goal.area);
  const AreaIcon = area.Icon;
  const days = goal.dueDate ? daysUntil(goal.dueDate) : null;
  const childPeriod = PERIOD_CHILD_MAP[goal.period];

  const periodColors: Record<GoalPeriod, string> = {
    annual: '#FFD700',
    quarterly: '#00CFFF',
    weekly: '#a78bfa',
    daily: '#34d399',
  };

  return (
    <div className={`${depth > 0 ? 'ml-5 pl-4' : ''}`} style={depth > 0 ? { borderLeft: '1px solid var(--border)' } : {}}>
      <div
        className="caesar-card mb-3 transition-all duration-300"
        style={{ borderLeftWidth: 3, borderLeftColor: area.color, borderLeftStyle: 'solid' }}
      >
        <div className="flex items-start gap-3">
          {/* Area Icon */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
            style={{ backgroundColor: `${area.color}20` }}
          >
            <AreaIcon size={15} style={{ color: area.color }} />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{goal.title}</span>
              <Badge label={goal.period} color={periodColors[goal.period]} size="xs" />
              <StatusBadge status={goal.status} />
              <Badge label={area.label} color={area.color} size="xs" variant="outline" />
            </div>

            {goal.description && (
              <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{goal.description}</p>
            )}

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Progress</span>
                <span className="text-xs font-medium" style={{ color: area.color }}>{goal.progress}%</span>
              </div>
              <div className="relative h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${goal.progress}%`,
                    backgroundColor: area.color,
                    boxShadow: `0 0 6px ${area.color}80`,
                  }}
                />
              </div>
            </div>

            {/* Due Date */}
            {goal.dueDate && (
              <div className="flex items-center gap-1 text-xs">
                <Calendar size={11} style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-muted)' }}>{formatDate(goal.dueDate)}</span>
                {days !== null && (
                  <span
                    className={`ml-1 font-medium ${
                      days < 0 ? 'text-red-400' : days <= 7 ? 'text-yellow-400' : ''
                    }`}
                    style={days >= 8 ? { color: 'var(--text-secondary)' } : {}}
                  >
                    {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-1">
              {hasChildren && (
                <button
                  onClick={onToggleExpand}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              )}
              <button
                onClick={() => onEdit(goal)}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Edit3 size={13} />
              </button>
              <button
                onClick={() => onDelete(goal.id)}
                className="p-1 rounded transition-colors hover:text-red-400"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {childPeriod && (
              <button
                onClick={() => onAddSub(goal.id, goal.period)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors"
                style={{ color: area.color, backgroundColor: `${area.color}15` }}
              >
                <Plus size={10} /> Sub-Goal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && children}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function GoalHierarchy({
  goals,
  setGoals,
  weeklyReviews,
  setWeeklyReviews,
  decisionLogs,
  setDecisionLogs,
  projects,
}: Props) {

  // ── UI State ──────────────────────────────────────────────────────────────
  const [activePeriodTab, setActivePeriodTab] = useState<GoalPeriod>('annual');
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  // Goal CRUD
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm());

  // Weekly Review Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardForm, setWizardForm] = useState<WizardForm>(emptyWizard());
  const [showPastReviews, setShowPastReviews] = useState(false);

  // Decision Log
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [editingDecision, setEditingDecision] = useState<DecisionLog | null>(null);
  const [decisionForm, setDecisionForm] = useState<DecisionForm>(emptyDecisionForm());

  // ── Derived: Goal tree for current period tab ─────────────────────────────
  const periodGoals = useMemo(() => goals.filter((g) => g.period === activePeriodTab), [goals, activePeriodTab]);

  const goalById = useMemo(() => {
    const map = new Map<string, Goal>();
    goals.forEach((g) => map.set(g.id, g));
    return map;
  }, [goals]);

  const rootGoals = useMemo(() => {
    return periodGoals.filter((g) => !g.parentId || !goals.find((p) => p.id === g.parentId));
  }, [periodGoals, goals]);

  function getChildren(parentId: string): Goal[] {
    return goals.filter((g) => g.parentId === parentId);
  }

  // ── Goal Alignment Score ──────────────────────────────────────────────────
  const alignmentScore = useMemo(() => {
    const daily = goals.filter((g) => g.period === 'daily');
    if (daily.length === 0) return 0;

    const annualIds = new Set(goals.filter((g) => g.period === 'annual').map((g) => g.id));

    function tracesBackToAnnual(goalId: string, visited: Set<string> = new Set()): boolean {
      if (visited.has(goalId)) return false;
      visited.add(goalId);
      const goal = goalById.get(goalId);
      if (!goal) return false;
      if (annualIds.has(goal.id)) return true;
      if (goal.parentId) return tracesBackToAnnual(goal.parentId, visited);
      return false;
    }

    const aligned = daily.filter((g) => g.parentId && tracesBackToAnnual(g.id)).length;
    return Math.round((aligned / daily.length) * 100);
  }, [goals, goalById]);

  // ── Toggle expand ─────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Goal CRUD ─────────────────────────────────────────────────────────────
  function openAddGoal(overrides?: Partial<GoalForm>) {
    setEditingGoal(null);
    setGoalForm(emptyGoalForm({ period: activePeriodTab, ...overrides }));
    setShowGoalModal(true);
  }

  function openAddSubGoal(parentId: string, parentPeriod: GoalPeriod) {
    const childPeriod = PERIOD_CHILD_MAP[parentPeriod];
    if (!childPeriod) return;
    const parent = goalById.get(parentId);
    setEditingGoal(null);
    setGoalForm(
      emptyGoalForm({
        period: childPeriod,
        parentId,
        area: parent?.area ?? 'personal',
      })
    );
    setShowGoalModal(true);
  }

  function openEditGoal(goal: Goal) {
    setEditingGoal(goal);
    setGoalForm({
      title: goal.title,
      description: goal.description,
      period: goal.period,
      status: goal.status,
      progress: String(goal.progress),
      area: goal.area,
      parentId: goal.parentId ?? '',
      dueDate: goal.dueDate,
      linkedProjectId: goal.linkedProjectId ?? '',
    });
    setShowGoalModal(true);
  }

  function saveGoal() {
    if (!goalForm.title.trim()) return;
    const progress = Math.min(100, Math.max(0, parseInt(goalForm.progress) || 0));

    const goal: Goal = {
      id: editingGoal?.id ?? generateId(),
      title: goalForm.title.trim(),
      description: goalForm.description.trim(),
      period: goalForm.period,
      status: goalForm.status,
      progress,
      area: goalForm.area,
      parentId: goalForm.parentId || undefined,
      dueDate: goalForm.dueDate,
      linkedProjectId: goalForm.linkedProjectId || undefined,
      createdAt: editingGoal?.createdAt ?? todayStr(),
    };

    if (editingGoal) {
      setGoals((prev) => prev.map((g) => (g.id === editingGoal.id ? goal : g)));
    } else {
      setGoals((prev) => [...prev, goal]);
    }
    setShowGoalModal(false);
  }

  function deleteGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id && g.parentId !== id));
  }

  // ── Weekly Review Wizard ──────────────────────────────────────────────────
  function openWizard() {
    setWizardForm(emptyWizard());
    setWizardStep(0);
    setShowWizard(true);
  }

  function handleWizardNext() {
    if (wizardStep < WIZARD_STEPS.length) {
      setWizardStep((s) => s + 1);
    }
  }

  function handleWizardBack() {
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function submitReview() {
    const review: WeeklyReview = {
      id: generateId(),
      weekOf: todayStr(),
      wins: wizardForm.wins,
      misses: wizardForm.misses,
      blockers: wizardForm.blockers,
      focusNextWeek: wizardForm.focusNextWeek,
      energyAvg: wizardForm.energyAvg,
      createdAt: todayStr(),
    };
    setWeeklyReviews((prev) => [review, ...prev]);
    setShowWizard(false);
  }

  const sortedReviews = useMemo(
    () => [...weeklyReviews].sort((a, b) => b.weekOf.localeCompare(a.weekOf)),
    [weeklyReviews]
  );

  // ── Decision Log CRUD ─────────────────────────────────────────────────────
  function openAddDecision() {
    setEditingDecision(null);
    setDecisionForm(emptyDecisionForm());
    setShowDecisionModal(true);
  }

  function openEditDecision(d: DecisionLog) {
    setEditingDecision(d);
    setDecisionForm({
      date: d.date,
      decision: d.decision,
      reasoning: d.reasoning,
      outcome: d.outcome,
      area: d.area,
    });
    setShowDecisionModal(true);
  }

  function saveDecision() {
    if (!decisionForm.decision.trim()) return;
    const log: DecisionLog = {
      id: editingDecision?.id ?? generateId(),
      date: decisionForm.date,
      decision: decisionForm.decision.trim(),
      reasoning: decisionForm.reasoning.trim(),
      outcome: decisionForm.outcome.trim(),
      area: decisionForm.area,
    };
    if (editingDecision) {
      setDecisionLogs((prev) => prev.map((d) => (d.id === editingDecision.id ? log : d)));
    } else {
      setDecisionLogs((prev) => [log, ...prev]);
    }
    setShowDecisionModal(false);
  }

  function deleteDecision(id: string) {
    setDecisionLogs((prev) => prev.filter((d) => d.id !== id));
  }

  function isReviewDue(log: DecisionLog): boolean {
    if (log.outcome) return false;
    try {
      return differenceInDays(new Date(), parseISO(log.date)) > 30;
    } catch {
      return false;
    }
  }

  // ── Recursive Goal Tree Renderer ──────────────────────────────────────────
  function renderGoalTree(goalsToRender: Goal[], depth: number = 0): React.ReactNode {
    return goalsToRender.map((goal) => {
      const children = getChildren(goal.id);
      const hasChildren = children.length > 0;
      const isExpanded = expandedGoals.has(goal.id);

      return (
        <GoalCard
          key={goal.id}
          goal={goal}
          depth={depth}
          hasChildren={hasChildren}
          expanded={isExpanded}
          onToggleExpand={() => toggleExpand(goal.id)}
          onEdit={openEditGoal}
          onDelete={deleteGoal}
          onAddSub={openAddSubGoal}
        >
          {isExpanded && hasChildren ? renderGoalTree(children, depth + 1) : null}
        </GoalCard>
      );
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 transition-colors duration-300">

      {/* ── GOAL ALIGNMENT SCORE ─────────────────────────────────────────── */}
      <div className="caesar-card transition-colors duration-300">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Gauge */}
          <div className="flex flex-col items-center justify-center min-w-[120px]">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-elevated)" strokeWidth="10" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={alignmentScore >= 70 ? '#22c55e' : alignmentScore >= 40 ? '#FFD700' : '#ef4444'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - alignmentScore / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.8s ease', filter: 'drop-shadow(0 0 6px currentColor)' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{alignmentScore}%</span>
              </div>
            </div>
            <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>Alignment</p>
          </div>

          {/* Description */}
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Goal Alignment Score</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {alignmentScore}% of your daily tasks trace back to an annual goal.
              {alignmentScore < 60 && (
                <span className="text-yellow-400 ml-1">
                  Consider linking more daily tasks to your annual priorities.
                </span>
              )}
              {alignmentScore >= 80 && (
                <span className="text-emerald-400 ml-1">
                  Excellent — your daily actions are driving your annual vision.
                </span>
              )}
            </p>
            {/* Area breakdown */}
            <div className="flex flex-wrap gap-2 mt-3">
              {LIFE_AREAS.map(({ value, label, color, Icon }) => {
                const count = goals.filter((g) => g.area === value).length;
                if (count === 0) return null;
                return (
                  <div
                    key={value}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    <Icon size={10} />
                    <span>{label} ({count})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── PERIOD TABS + GOAL TREE ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 flex-wrap">
            {PERIODS.map((p) => {
              const count = goals.filter((g) => g.period === p.value).length;
              const isActive = activePeriodTab === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setActivePeriodTab(p.value)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                  style={
                    isActive
                      ? { backgroundColor: '#00CFFF', color: '#05080f' }
                      : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
                  }
                >
                  {p.label}
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={
                      isActive
                        ? { backgroundColor: 'rgba(5,8,15,0.3)' }
                        : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => openAddGoal()}
            className="caesar-btn-primary flex items-center gap-1 text-xs"
          >
            <Plus size={13} /> Add Goal
          </button>
        </div>

        {/* Goal Tree */}
        {rootGoals.length === 0 ? (
          <div className="caesar-card text-center py-10 transition-colors duration-300">
            <Target size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No {activePeriodTab} goals yet.</p>
            <button onClick={() => openAddGoal()} className="caesar-btn-primary mt-4 text-xs flex items-center gap-1 mx-auto">
              <Plus size={12} /> Add {activePeriodTab} goal
            </button>
          </div>
        ) : (
          <div>{renderGoalTree(rootGoals, 0)}</div>
        )}
      </div>

      {/* ── WEEKLY REVIEW WIZARD ─────────────────────────────────────────── */}
      <div className="caesar-card transition-colors duration-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award size={18} style={{ color: '#FFD700' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Weekly Review</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({sortedReviews.length} logged)</span>
          </div>
          <div className="flex items-center gap-2">
            {sortedReviews.length > 0 && (
              <button
                onClick={() => setShowPastReviews((v) => !v)}
                className="caesar-btn-ghost text-xs flex items-center gap-1"
              >
                {showPastReviews ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Past Reviews
              </button>
            )}
            <button
              onClick={openWizard}
              className="caesar-btn-primary text-xs flex items-center gap-1"
              style={{ backgroundColor: '#FFD700', color: '#05080f' }}
            >
              <Star size={12} /> Start Weekly Review
            </button>
          </div>
        </div>

        {/* Past Reviews */}
        {showPastReviews && sortedReviews.length > 0 && (
          <div className="space-y-3 mt-2">
            {sortedReviews.map((r) => (
              <div
                key={r.id}
                className="rounded-xl p-4 border transition-colors duration-300"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Week of {formatDate(r.weekOf)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Energy: </span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: n <= r.energyAvg ? '#FFD700' : 'var(--bg-hover)' }}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {r.wins && (
                    <div>
                      <p className="text-emerald-400 font-medium mb-1">Wins</p>
                      <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.wins}</p>
                    </div>
                  )}
                  {r.misses && (
                    <div>
                      <p className="text-red-400 font-medium mb-1">Misses</p>
                      <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.misses}</p>
                    </div>
                  )}
                  {r.blockers && (
                    <div>
                      <p className="text-yellow-400 font-medium mb-1">Blockers</p>
                      <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.blockers}</p>
                    </div>
                  )}
                  {r.focusNextWeek && (
                    <div>
                      <p style={{ color: '#00CFFF' }} className="font-medium mb-1">Next Week Focus</p>
                      <p className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.focusNextWeek}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DECISION LOG ─────────────────────────────────────────────────── */}
      <div className="caesar-card transition-colors duration-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={18} style={{ color: '#00CFFF' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Decision Log</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({decisionLogs.length} decisions)</span>
          </div>
          <button
            onClick={openAddDecision}
            className="caesar-btn-primary flex items-center gap-1 text-xs"
          >
            <Plus size={13} /> Log Decision
          </button>
        </div>

        {decisionLogs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No decisions logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left font-medium py-2 pr-4" style={{ color: 'var(--text-muted)' }}>Date</th>
                  <th className="text-left font-medium py-2 pr-4" style={{ color: 'var(--text-muted)' }}>Decision</th>
                  <th className="text-left font-medium py-2 pr-4" style={{ color: 'var(--text-muted)' }}>Reasoning</th>
                  <th className="text-left font-medium py-2 pr-4" style={{ color: 'var(--text-muted)' }}>Outcome</th>
                  <th className="text-left font-medium py-2 pr-4" style={{ color: 'var(--text-muted)' }}>Area</th>
                  <th className="text-right font-medium py-2" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...decisionLogs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((d) => {
                    const area = getAreaConfig(d.area);
                    const reviewDue = isReviewDue(d);
                    return (
                      <tr
                        key={d.id}
                        className="group transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatDate(d.date)}</td>
                        <td className="py-2.5 pr-4 max-w-[180px]" style={{ color: 'var(--text-primary)' }}>
                          <p className="truncate">{d.decision}</p>
                        </td>
                        <td className="py-2.5 pr-4 max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                          <p className="truncate">{d.reasoning || '—'}</p>
                        </td>
                        <td className="py-2.5 pr-4">
                          {d.outcome ? (
                            <p className="text-emerald-400 truncate max-w-[160px]">{d.outcome}</p>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                              {reviewDue && (
                                <span
                                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium"
                                  style={{ backgroundColor: '#FFD70020', color: '#FFD700' }}
                                >
                                  <AlertCircle size={9} />
                                  Review Due
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: `${area.color}20`, color: area.color }}
                          >
                            {area.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditDecision(d)}
                              className="p-1 rounded transition-colors"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={() => deleteDecision(d.id)}
                              className="p-1 rounded transition-colors hover:text-red-400"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ADD/EDIT GOAL MODAL ───────────────────────────────────────────── */}
      <Modal
        isOpen={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        title={editingGoal ? 'Edit Goal' : 'Add Goal'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="caesar-label">Title *</label>
            <input
              type="text"
              value={goalForm.title}
              onChange={(e) => setGoalForm((p) => ({ ...p, title: e.target.value }))}
              className="caesar-input w-full"
              placeholder="What do you want to achieve?"
            />
          </div>

          <div>
            <label className="caesar-label">Description</label>
            <textarea
              value={goalForm.description}
              onChange={(e) => setGoalForm((p) => ({ ...p, description: e.target.value }))}
              className="caesar-input w-full resize-none"
              rows={2}
              placeholder="Why does this matter?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Period</label>
              <select
                value={goalForm.period}
                onChange={(e) => setGoalForm((p) => ({ ...p, period: e.target.value as GoalPeriod }))}
                className="caesar-input w-full"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caesar-label">Status</label>
              <select
                value={goalForm.status}
                onChange={(e) => setGoalForm((p) => ({ ...p, status: e.target.value as GoalStatus }))}
                className="caesar-input w-full"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Life Area</label>
              <select
                value={goalForm.area}
                onChange={(e) => setGoalForm((p) => ({ ...p, area: e.target.value as LifeArea }))}
                className="caesar-input w-full"
              >
                {LIFE_AREA_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caesar-label">Progress (0–100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={goalForm.progress}
                onChange={(e) => setGoalForm((p) => ({ ...p, progress: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Due Date</label>
              <input
                type="date"
                value={goalForm.dueDate}
                onChange={(e) => setGoalForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
            <div>
              <label className="caesar-label">Parent Goal (optional)</label>
              <select
                value={goalForm.parentId}
                onChange={(e) => setGoalForm((p) => ({ ...p, parentId: e.target.value }))}
                className="caesar-input w-full"
              >
                <option value="">— None —</option>
                {goals
                  .filter((g) => g.id !== editingGoal?.id)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      [{g.period}] {g.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="caesar-label">Linked Project (optional)</label>
            <select
              value={goalForm.linkedProjectId}
              onChange={(e) => setGoalForm((p) => ({ ...p, linkedProjectId: e.target.value }))}
              className="caesar-input w-full"
            >
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={saveGoal} className="caesar-btn-primary flex-1">
              {editingGoal ? 'Save Changes' : 'Add Goal'}
            </button>
            <button onClick={() => setShowGoalModal(false)} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── WEEKLY REVIEW WIZARD MODAL ────────────────────────────────────── */}
      <Modal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        title="Weekly Review"
        size="md"
      >
        {/* Step Indicators */}
        <div className="flex items-center gap-2 mb-6">
          {[...WIZARD_STEPS, { label: 'Energy', field: 'energyAvg', prompt: '' }].map((step, idx) => (
            <React.Fragment key={step.label}>
              <div
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all"
                style={
                  idx < wizardStep
                    ? { backgroundColor: '#22c55e', color: '#fff' }
                    : idx === wizardStep
                    ? { backgroundColor: '#FFD700', color: '#05080f' }
                    : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                }
              >
                {idx < wizardStep ? <Check size={10} /> : idx + 1}
              </div>
              {idx < 4 && (
                <div
                  className="flex-1 h-0.5"
                  style={{ backgroundColor: idx < wizardStep ? '#22c55e' : 'var(--bg-elevated)' }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        {wizardStep < WIZARD_STEPS.length ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                Step {wizardStep + 1} of {WIZARD_STEPS.length + 1}: {WIZARD_STEPS[wizardStep].prompt}
              </label>
              <textarea
                value={String(wizardForm[WIZARD_STEPS[wizardStep].field])}
                onChange={(e) =>
                  setWizardForm((p) => ({ ...p, [WIZARD_STEPS[wizardStep].field]: e.target.value }))
                }
                className="caesar-input w-full resize-none"
                rows={5}
                placeholder="Be honest and specific..."
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              {wizardStep > 0 && (
                <button onClick={handleWizardBack} className="caesar-btn-ghost flex-1">
                  Back
                </button>
              )}
              <button onClick={handleWizardNext} className="caesar-btn-primary flex-1">
                Next
              </button>
            </div>
          </div>
        ) : (
          // Step 5: Energy + Confirm
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--text-primary)' }}>
                Step 5 of 5: Rate your average energy this week (1–5)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={wizardForm.energyAvg}
                  onChange={(e) => setWizardForm((p) => ({ ...p, energyAvg: parseInt(e.target.value) }))}
                  className="flex-1 accent-yellow-400"
                />
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="w-4 h-4 rounded-full transition-all"
                      style={{
                        backgroundColor: n <= wizardForm.energyAvg ? '#FFD700' : 'var(--bg-hover)',
                        boxShadow: n <= wizardForm.energyAvg ? '0 0 6px #FFD700' : 'none',
                      }}
                    />
                  ))}
                </div>
                <span className="text-lg font-bold" style={{ color: '#FFD700' }}>{wizardForm.energyAvg}/5</span>
              </div>
            </div>

            {/* Summary Preview */}
            <div
              className="rounded-xl border p-4 space-y-2 text-xs transition-colors duration-300"
              style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
            >
              <p className="font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Review Summary</p>
              {wizardForm.wins && (
                <p><span className="text-emerald-400">Wins:</span> <span style={{ color: 'var(--text-secondary)' }}>{wizardForm.wins.slice(0, 80)}{wizardForm.wins.length > 80 ? '...' : ''}</span></p>
              )}
              {wizardForm.misses && (
                <p><span className="text-red-400">Misses:</span> <span style={{ color: 'var(--text-secondary)' }}>{wizardForm.misses.slice(0, 80)}{wizardForm.misses.length > 80 ? '...' : ''}</span></p>
              )}
              {wizardForm.focusNextWeek && (
                <p><span style={{ color: '#00CFFF' }}>Focus:</span> <span style={{ color: 'var(--text-secondary)' }}>{wizardForm.focusNextWeek.slice(0, 80)}{wizardForm.focusNextWeek.length > 80 ? '...' : ''}</span></p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleWizardBack} className="caesar-btn-ghost flex-1">
                Back
              </button>
              <button
                onClick={submitReview}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all"
                style={{ backgroundColor: '#FFD700', color: '#05080f' }}
              >
                <span className="flex items-center justify-center gap-1">
                  <Check size={14} /> Submit Review
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── ADD/EDIT DECISION MODAL ───────────────────────────────────────── */}
      <Modal
        isOpen={showDecisionModal}
        onClose={() => setShowDecisionModal(false)}
        title={editingDecision ? 'Edit Decision' : 'Log Decision'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="caesar-label">Date</label>
              <input
                type="date"
                value={decisionForm.date}
                onChange={(e) => setDecisionForm((p) => ({ ...p, date: e.target.value }))}
                className="caesar-input w-full"
              />
            </div>
            <div>
              <label className="caesar-label">Life Area</label>
              <select
                value={decisionForm.area}
                onChange={(e) => setDecisionForm((p) => ({ ...p, area: e.target.value as LifeArea }))}
                className="caesar-input w-full"
              >
                {LIFE_AREA_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="caesar-label">Decision *</label>
            <textarea
              value={decisionForm.decision}
              onChange={(e) => setDecisionForm((p) => ({ ...p, decision: e.target.value }))}
              className="caesar-input w-full resize-none"
              rows={2}
              placeholder="What did you decide?"
            />
          </div>

          <div>
            <label className="caesar-label">Reasoning</label>
            <textarea
              value={decisionForm.reasoning}
              onChange={(e) => setDecisionForm((p) => ({ ...p, reasoning: e.target.value }))}
              className="caesar-input w-full resize-none"
              rows={2}
              placeholder="Why did you make this decision?"
            />
          </div>

          <div>
            <label className="caesar-label">Outcome (fill in later)</label>
            <textarea
              value={decisionForm.outcome}
              onChange={(e) => setDecisionForm((p) => ({ ...p, outcome: e.target.value }))}
              className="caesar-input w-full resize-none"
              rows={2}
              placeholder="What actually happened?"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={saveDecision} className="caesar-btn-primary flex-1">
              {editingDecision ? 'Save Changes' : 'Log Decision'}
            </button>
            <button onClick={() => setShowDecisionModal(false)} className="caesar-btn-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
