/**
 * J.A.R.V.I.S. Intelligence Engine
 * Analyses all app data locally (no API calls) to surface personalised insights,
 * smart defaults, and actionable suggestions.
 */

import { differenceInDays, parseISO, format, startOfDay, getHours } from 'date-fns';
import type {
  Contact, TimeBlock, TimeCategory, Goal, TodoItem,
  FinancialEntry, SavingsGoal, ReadingItem, Note,
  DailyMoodLog, Habit, HabitTracker,
} from '../types';

// ─── INSIGHT TYPES ───────────────────────────────────────────────────────────

export type InsightCategory =
  | 'time'
  | 'contact'
  | 'goal'
  | 'financial'
  | 'todo'
  | 'reading'
  | 'habit'
  | 'wellness';

export type InsightPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  description: string;
  /** Navigation target section */
  navTarget?: string;
  /** Contextual data for further action */
  data?: unknown;
}

// ─── ALL-DATA PAYLOAD ────────────────────────────────────────────────────────

export interface AppDataSnapshot {
  contacts: Contact[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  goals: Goal[];
  todos: TodoItem[];
  financialEntries: FinancialEntry[];
  savingsGoals: SavingsGoal[];
  readingItems: ReadingItem[];
  notes: Note[];
  dailyMoodLogs: DailyMoodLog[];
  habits: Habit[];
  habitTracker: HabitTracker[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function daysAgo(dateStr: string): number {
  return differenceInDays(startOfDay(new Date()), startOfDay(parseISO(dateStr)));
}

function daysUntil(dateStr: string): number {
  return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
}

// ─── TIME INTELLIGENCE ───────────────────────────────────────────────────────

export interface TimeIntelligence {
  topCategories: { categoryId: string; name: string; color: string; hours: number }[];
  peakHour: number | null; // hour of day (0-23) with most blocks
  avgEnergyThisWeek: number | null;
  noTimeLoggedToday: boolean;
  suggestedCategoryId: string | null;
  recentTitles: string[];
}

export function analyzeTime(
  timeBlocks: TimeBlock[],
  timeCategories: TimeCategory[],
): TimeIntelligence {
  const today = todayISO();
  const todayBlocks = timeBlocks.filter(b => b.date === today);
  const noTimeLoggedToday = todayBlocks.length === 0;

  // Last 7 days
  const last7 = timeBlocks.filter(b => daysAgo(b.date) <= 6);

  // Category usage (hours)
  const catHours: Record<string, number> = {};
  for (const b of last7) {
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    const dur = (eh * 60 + em - (sh * 60 + sm)) / 60;
    catHours[b.categoryId] = (catHours[b.categoryId] ?? 0) + Math.max(0, dur);
  }

  const catMap = new Map(timeCategories.map(c => [c.id, c]));
  const topCategories = Object.entries(catHours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, hours]) => {
      const cat = catMap.get(id);
      return { categoryId: id, name: cat?.name ?? 'Unknown', color: cat?.color ?? '#6b7280', hours };
    });

  // Peak hour
  const hourCounts: Record<number, number> = {};
  for (const b of timeBlocks) {
    const h = parseInt(b.startTime.split(':')[0], 10);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const peakHour = Object.keys(hourCounts).length
    ? Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
    : null;

  // Avg energy this week
  const energyBlocks = last7.filter(b => b.energy);
  const avgEnergyThisWeek = energyBlocks.length
    ? energyBlocks.reduce((s, b) => s + b.energy, 0) / energyBlocks.length
    : null;

  // Suggested category for current hour (most used at this hour)
  const nowHour = getHours(new Date());
  const hourBlocks = timeBlocks.filter(b => parseInt(b.startTime.split(':')[0], 10) === nowHour);
  const hourCatCounts: Record<string, number> = {};
  for (const b of hourBlocks) {
    hourCatCounts[b.categoryId] = (hourCatCounts[b.categoryId] ?? 0) + 1;
  }
  const suggestedCategoryId = Object.keys(hourCatCounts).length
    ? Object.entries(hourCatCounts).sort((a, b) => b[1] - a[1])[0][0]
    : (topCategories[0]?.categoryId ?? null);

  // Recent unique titles (last 20 blocks)
  const recentTitles = [...new Set(
    [...timeBlocks]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map(b => b.title)
      .filter((t): t is string => Boolean(t?.trim()))
  )].slice(0, 8);

  return {
    topCategories,
    peakHour,
    avgEnergyThisWeek,
    noTimeLoggedToday,
    suggestedCategoryId,
    recentTitles,
  };
}

// ─── CONTACT INTELLIGENCE ────────────────────────────────────────────────────

export interface ContactIntelligence {
  overdueFollowUps: Contact[];
  dormantContacts: Contact[]; // not contacted in 30+ days
  upcomingBirthdays: { contact: Contact; daysUntil: number }[];
  upcomingAnniversaries: { contact: Contact; daysUntil: number }[];
}

export function analyzeContacts(contacts: Contact[]): ContactIntelligence {
  const today = todayISO();

  const overdueFollowUps = contacts.filter(c => {
    if (!c.followUpNeeded || !c.followUpDate) return false;
    return c.followUpDate <= today;
  });

  const dormantContacts = contacts.filter(c => {
    if (!c.lastContacted) return false;
    return daysAgo(c.lastContacted) >= 30;
  }).sort((a, b) =>
    daysAgo(b.lastContacted) - daysAgo(a.lastContacted)
  ).slice(0, 5);

  // Upcoming birthdays within 14 days (normalize to current year)
  const thisYear = new Date().getFullYear();
  const upcomingBirthdays: { contact: Contact; daysUntil: number }[] = [];
  for (const c of contacts) {
    if (!c.birthday) continue;
    const [, mm, dd] = c.birthday.split('-');
    const thisYearDate = `${thisYear}-${mm}-${dd}`;
    const d = daysUntil(thisYearDate);
    if (d >= 0 && d <= 14) {
      upcomingBirthdays.push({ contact: c, daysUntil: d });
    }
  }
  upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  const upcomingAnniversaries: { contact: Contact; daysUntil: number }[] = [];
  for (const c of contacts) {
    if (!c.anniversary) continue;
    const [, mm, dd] = c.anniversary.split('-');
    const thisYearDate = `${thisYear}-${mm}-${dd}`;
    const d = daysUntil(thisYearDate);
    if (d >= 0 && d <= 14) {
      upcomingAnniversaries.push({ contact: c, daysUntil: d });
    }
  }
  upcomingAnniversaries.sort((a, b) => a.daysUntil - b.daysUntil);

  return { overdueFollowUps, dormantContacts, upcomingBirthdays, upcomingAnniversaries };
}

// ─── GOAL INTELLIGENCE ───────────────────────────────────────────────────────

export interface GoalIntelligence {
  stalledGoals: Goal[];  // in-progress, progress < 50%, due in 14 days
  overduGoals: Goal[];
  nearDeadlineGoals: Goal[]; // due in 7 days, not completed
}

export function analyzeGoals(goals: Goal[]): GoalIntelligence {
  const today = todayISO();

  const stalledGoals = goals.filter(g =>
    g.status === 'in-progress' &&
    g.progress < 50 &&
    g.dueDate &&
    daysUntil(g.dueDate) <= 14 &&
    daysUntil(g.dueDate) >= 0
  );

  const overduGoals = goals.filter(g =>
    g.status !== 'completed' &&
    g.dueDate &&
    g.dueDate < today
  );

  const nearDeadlineGoals = goals.filter(g =>
    g.status !== 'completed' &&
    g.dueDate &&
    daysUntil(g.dueDate) >= 0 &&
    daysUntil(g.dueDate) <= 7
  );

  return { stalledGoals, overduGoals, nearDeadlineGoals };
}

// ─── TODO INTELLIGENCE ───────────────────────────────────────────────────────

export interface TodoIntelligence {
  overdueTodos: TodoItem[];
  highPriorityUntouched: TodoItem[];
}

export function analyzeTodos(todos: TodoItem[]): TodoIntelligence {
  const today = todayISO();

  const overdueTodos = todos.filter(t =>
    t.status !== 'done' &&
    t.dueDate &&
    t.dueDate < today
  );

  const highPriorityUntouched = todos.filter(t =>
    t.status === 'todo' &&
    t.priority === 'high'
  ).slice(0, 5);

  return { overdueTodos, highPriorityUntouched };
}

// ─── FINANCIAL INTELLIGENCE ──────────────────────────────────────────────────

export interface FinancialIntelligence {
  goalsAtRisk: SavingsGoal[]; // deadline in 30 days, progress < 80%
  spendingThisMonth: number;
  incomeThisMonth: number;
}

export function analyzeFinancials(
  entries: FinancialEntry[],
  savingsGoals: SavingsGoal[],
): FinancialIntelligence {
  const now = new Date();
  const monthStr = format(now, 'yyyy-MM');

  const thisMonthEntries = entries.filter(e => e.date.startsWith(monthStr));
  const spendingThisMonth = thisMonthEntries
    .filter(e => e.type === 'expense')
    .reduce((s, e) => s + e.amount, 0);
  const incomeThisMonth = thisMonthEntries
    .filter(e => e.type === 'income')
    .reduce((s, e) => s + e.amount, 0);

  const goalsAtRisk = savingsGoals.filter(g => {
    if (!g.deadline) return false;
    const progress = g.target > 0 ? (g.current / g.target) * 100 : 100;
    return daysUntil(g.deadline) <= 30 && daysUntil(g.deadline) >= 0 && progress < 80;
  });

  return { goalsAtRisk, spendingThisMonth, incomeThisMonth };
}

// ─── READING INTELLIGENCE ────────────────────────────────────────────────────

export interface ReadingIntelligence {
  stalledBooks: ReadingItem[]; // in-progress, started > 14 days ago
}

export function analyzeReading(items: ReadingItem[]): ReadingIntelligence {
  const stalledBooks = items.filter(r => {
    if (r.status !== 'in-progress' || !r.startedAt) return false;
    return daysAgo(r.startedAt) > 14;
  }).slice(0, 3);

  return { stalledBooks };
}

// ─── HABIT INTELLIGENCE ──────────────────────────────────────────────────────

export interface HabitIntelligence {
  completionRateThisWeek: number; // 0-100
  missedToday: Habit[];
}

export function analyzeHabits(
  habits: Habit[],
  habitTracker: HabitTracker[],
): HabitIntelligence {
  const today = todayISO();
  const todayEntry = habitTracker.find(h => h.date === today);
  const missedToday = habits.filter(h => !todayEntry?.habits[h.id]);

  // Last 7 days completion rate
  const last7Days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(format(d, 'yyyy-MM-dd'));
  }
  const totalPossible = habits.length * 7;
  let completed = 0;
  for (const day of last7Days) {
    const entry = habitTracker.find(h => h.date === day);
    if (!entry) continue;
    completed += habits.filter(h => entry.habits[h.id]).length;
  }
  const completionRateThisWeek = totalPossible > 0
    ? Math.round((completed / totalPossible) * 100)
    : 100;

  return { completionRateThisWeek, missedToday };
}

// ─── MASTER INSIGHT GENERATOR ────────────────────────────────────────────────

export function computeInsights(data: AppDataSnapshot): Insight[] {
  const insights: Insight[] = [];
  let seq = 0;
  const id = () => `insight-${seq++}`;

  // Time
  const time = analyzeTime(data.timeBlocks, data.timeCategories);
  if (time.noTimeLoggedToday) {
    const nowHour = getHours(new Date());
    if (nowHour >= 8 && nowHour <= 22) {
      const sugCat = data.timeCategories.find(c => c.id === time.suggestedCategoryId);
      insights.push({
        id: id(), category: 'time', priority: 'medium',
        title: "No time logged today",
        description: sugCat
          ? `You usually work on ${sugCat.name} around this time. Log your first block?`
          : "You haven't logged any time yet today.",
        navTarget: 'time',
      });
    }
  }
  if (time.avgEnergyThisWeek !== null && time.avgEnergyThisWeek < 2.5) {
    insights.push({
      id: id(), category: 'wellness', priority: 'medium',
      title: "Low energy this week",
      description: `Your average energy rating is ${time.avgEnergyThisWeek.toFixed(1)}/5. Consider reviewing your schedule.`,
      navTarget: 'time',
    });
  }

  // Contacts
  const contacts = analyzeContacts(data.contacts);
  if (contacts.overdueFollowUps.length > 0) {
    const names = contacts.overdueFollowUps.slice(0, 3).map(c => c.name).join(', ');
    insights.push({
      id: id(), category: 'contact', priority: 'urgent',
      title: `${contacts.overdueFollowUps.length} overdue follow-up${contacts.overdueFollowUps.length > 1 ? 's' : ''}`,
      description: `Reach out to: ${names}${contacts.overdueFollowUps.length > 3 ? ` +${contacts.overdueFollowUps.length - 3} more` : ''}`,
      navTarget: 'contacts',
      data: contacts.overdueFollowUps.map(c => c.id),
    });
  }
  for (const { contact, daysUntil: d } of contacts.upcomingBirthdays.slice(0, 2)) {
    insights.push({
      id: id(), category: 'contact', priority: d === 0 ? 'urgent' : 'high',
      title: d === 0 ? `🎂 It's ${contact.name}'s birthday today!` : `${contact.name}'s birthday in ${d} day${d > 1 ? 's' : ''}`,
      description: `Don't forget to reach out to ${contact.name}.`,
      navTarget: 'contacts',
      data: contact.id,
    });
  }
  if (contacts.dormantContacts.length > 0) {
    const c = contacts.dormantContacts[0];
    const ago = daysAgo(c.lastContacted);
    insights.push({
      id: id(), category: 'contact', priority: 'low',
      title: `${c.name} hasn't been contacted in ${ago} days`,
      description: `${contacts.dormantContacts.length} contact${contacts.dormantContacts.length > 1 ? 's' : ''} haven't been touched in 30+ days.`,
      navTarget: 'contacts',
    });
  }

  // Goals
  const goalsIntel = analyzeGoals(data.goals);
  if (goalsIntel.overduGoals.length > 0) {
    insights.push({
      id: id(), category: 'goal', priority: 'urgent',
      title: `${goalsIntel.overduGoals.length} overdue goal${goalsIntel.overduGoals.length > 1 ? 's' : ''}`,
      description: goalsIntel.overduGoals.slice(0, 2).map(g => g.title).join(', '),
      navTarget: 'goals',
    });
  }
  if (goalsIntel.nearDeadlineGoals.length > 0) {
    const g = goalsIntel.nearDeadlineGoals[0];
    insights.push({
      id: id(), category: 'goal', priority: 'high',
      title: `"${g.title}" due soon`,
      description: `${daysUntil(g.dueDate)} day${daysUntil(g.dueDate) !== 1 ? 's' : ''} left — ${g.progress}% complete.`,
      navTarget: 'goals',
    });
  }
  if (goalsIntel.stalledGoals.length > 0) {
    const g = goalsIntel.stalledGoals[0];
    insights.push({
      id: id(), category: 'goal', priority: 'medium',
      title: `"${g.title}" may be stalling`,
      description: `Only ${g.progress}% complete with deadline approaching.`,
      navTarget: 'goals',
    });
  }

  // Todos
  const todosIntel = analyzeTodos(data.todos);
  if (todosIntel.overdueTodos.length > 0) {
    insights.push({
      id: id(), category: 'todo', priority: 'urgent',
      title: `${todosIntel.overdueTodos.length} overdue task${todosIntel.overdueTodos.length > 1 ? 's' : ''}`,
      description: todosIntel.overdueTodos.slice(0, 2).map(t => t.title).join(', '),
      navTarget: 'todos',
    });
  }
  if (todosIntel.highPriorityUntouched.length > 0 && todosIntel.overdueTodos.length === 0) {
    const t = todosIntel.highPriorityUntouched[0];
    insights.push({
      id: id(), category: 'todo', priority: 'high',
      title: `High-priority: "${t.title}"`,
      description: `${todosIntel.highPriorityUntouched.length} high-priority task${todosIntel.highPriorityUntouched.length > 1 ? 's' : ''} not started.`,
      navTarget: 'todos',
    });
  }

  // Financial
  const fin = analyzeFinancials(data.financialEntries, data.savingsGoals);
  if (fin.goalsAtRisk.length > 0) {
    const g = fin.goalsAtRisk[0];
    const progress = Math.round((g.current / g.target) * 100);
    insights.push({
      id: id(), category: 'financial', priority: 'high',
      title: `Savings goal "${g.name}" at risk`,
      description: `${progress}% funded, deadline in ${daysUntil(g.deadline)} days.`,
      navTarget: 'financial',
    });
  }

  // Reading
  const reading = analyzeReading(data.readingItems);
  if (reading.stalledBooks.length > 0) {
    const b = reading.stalledBooks[0];
    insights.push({
      id: id(), category: 'reading', priority: 'low',
      title: `Still reading "${b.title}"`,
      description: `Started ${daysAgo(b.startedAt!)} days ago. Pick it back up?`,
      navTarget: 'reading',
    });
  }

  // Habits
  const habits = analyzeHabits(data.habits, data.habitTracker);
  if (habits.missedToday.length > 0 && getHours(new Date()) >= 18) {
    insights.push({
      id: id(), category: 'habit', priority: 'medium',
      title: `${habits.missedToday.length} habit${habits.missedToday.length > 1 ? 's' : ''} not yet done today`,
      description: habits.missedToday.slice(0, 3).map(h => `${h.icon} ${h.name}`).join(', '),
      navTarget: 'command',
    });
  }
  if (habits.completionRateThisWeek < 50 && data.habits.length > 0) {
    insights.push({
      id: id(), category: 'habit', priority: 'medium',
      title: `Habit completion at ${habits.completionRateThisWeek}% this week`,
      description: "Your habit streak is below 50% — time to get back on track.",
      navTarget: 'command',
    });
  }

  // Sort: urgent first, then high, medium, low
  const order: Record<InsightPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return insights.sort((a, b) => order[a.priority] - order[b.priority]);
}

// ─── PREFERENCE LEARNING ─────────────────────────────────────────────────────

export interface LearnedPreferences {
  /** Most used category IDs in order of frequency */
  topCategoryIds: string[];
  /** Hours with highest block counts */
  peakWorkHours: number[];
  /** Average session duration in minutes */
  avgSessionMinutes: number;
  /** Percentage of days with logged time (last 30 days) */
  consistencyScore: number;
}

export function learnPreferences(timeBlocks: TimeBlock[]): LearnedPreferences {
  // Top categories
  const catCounts: Record<string, number> = {};
  for (const b of timeBlocks) {
    catCounts[b.categoryId] = (catCounts[b.categoryId] ?? 0) + 1;
  }
  const topCategoryIds = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, 5);

  // Peak hours
  const hourCounts: Record<number, number> = {};
  for (const b of timeBlocks) {
    const h = parseInt(b.startTime.split(':')[0], 10);
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const peakWorkHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => Number(h));

  // Average session duration
  const durations = timeBlocks.map(b => {
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }).filter(d => d > 0);
  const avgSessionMinutes = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 60;

  // Consistency score (last 30 days with at least one block)
  const datesWithBlocks = new Set(timeBlocks.map(b => b.date));
  let daysWithTime = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (datesWithBlocks.has(format(d, 'yyyy-MM-dd'))) daysWithTime++;
  }
  const consistencyScore = Math.round((daysWithTime / 30) * 100);

  return { topCategoryIds, peakWorkHours, avgSessionMinutes, consistencyScore };
}
