/**
 * J.A.R.V.I.S. Intelligence Engine
 * Analyses all app data locally (no API calls) to surface personalised insights,
 * smart defaults, and actionable suggestions.
 */

import { differenceInDays, parseISO, format, startOfDay, getHours } from 'date-fns';
import type {
  Contact, ContactInteraction, TimeBlock, TimeCategory, Goal, TodoItem,
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

  // ── Cross-domain correlations ──────────────────────────────────────────

  // Goal-time alignment: goals with deadlines but no time logged toward them
  const alignment = checkGoalCalendarAlignment(data.goals, data.timeBlocks, data.timeCategories);
  const misaligned = alignment.filter(a => a.alignment === 'none' && a.goalTitle);
  if (misaligned.length > 0) {
    const first = misaligned[0];
    insights.push({
      id: id(), category: 'goal', priority: 'high',
      title: `No time logged for "${first.goalTitle}"`,
      description: `${misaligned.length} active goal${misaligned.length > 1 ? 's have' : ' has'} zero hours logged this week. Consider scheduling focused time.`,
      navTarget: 'goals',
    });
  }

  // Contact-todo: contacts with meetings but no follow-up todos
  const contactsWithRecentInteractions = data.contacts.filter(c => {
    if (!c.lastContacted) return false;
    return daysAgo(c.lastContacted) <= 3;
  });
  const contactTodos = data.todos.filter(t => t.linkedType === 'contact' && t.status !== 'done');
  const contactsWithoutTodos = contactsWithRecentInteractions.filter(c =>
    !contactTodos.some(t => t.linkedId === c.id) && !c.followUpNeeded
  );
  if (contactsWithoutTodos.length > 0) {
    insights.push({
      id: id(), category: 'contact', priority: 'low',
      title: `Recent meeting with ${contactsWithoutTodos[0].name} — no follow-up`,
      description: `You interacted with ${contactsWithoutTodos.length} contact${contactsWithoutTodos.length > 1 ? 's' : ''} recently but have no open follow-up tasks.`,
      navTarget: 'contacts',
    });
  }

  // Mood-meeting correlation: check if mood drops on heavy meeting days
  if (data.dailyMoodLogs.length >= 7 && data.timeBlocks.length > 0) {
    const last14Logs = data.dailyMoodLogs
      .filter(l => daysAgo(l.date) <= 14)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (last14Logs.length >= 5) {
      const meetingCats = data.timeCategories
        .filter(c => c.name.toLowerCase().includes('meet'))
        .map(c => c.id);

      let heavyMeetingMoodSum = 0;
      let heavyMeetingDays = 0;
      let lightMoodSum = 0;
      let lightDays = 0;

      for (const log of last14Logs) {
        const dayBlocks = data.timeBlocks.filter(b => b.date === log.date);
        const meetingHours = dayBlocks
          .filter(b => meetingCats.includes(b.categoryId))
          .reduce((s, b) => {
            const [sh, sm] = b.startTime.split(':').map(Number);
            const [eh, em] = b.endTime.split(':').map(Number);
            return s + Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
          }, 0);

        if (meetingHours >= 3) {
          heavyMeetingMoodSum += log.mood;
          heavyMeetingDays++;
        } else {
          lightMoodSum += log.mood;
          lightDays++;
        }
      }

      if (heavyMeetingDays >= 2 && lightDays >= 2) {
        const heavyAvg = heavyMeetingMoodSum / heavyMeetingDays;
        const lightAvg = lightMoodSum / lightDays;
        if (lightAvg - heavyAvg >= 0.8) {
          insights.push({
            id: id(), category: 'wellness', priority: 'medium',
            title: 'Mood drops on heavy meeting days',
            description: `Your mood averages ${heavyAvg.toFixed(1)}/5 on 3+ hour meeting days vs ${lightAvg.toFixed(1)}/5 otherwise. Consider protecting focus time.`,
            navTarget: 'time',
          });
        }
      }
    }
  }

  // ── Trend detection (rolling window) ──────────────────────────────────

  // Habit trend: compare this week vs last week
  if (data.habits.length > 0 && data.habitTracker.length > 0) {
    const thisWeekDates: string[] = [];
    const lastWeekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d1 = new Date(); d1.setDate(d1.getDate() - i);
      thisWeekDates.push(format(d1, 'yyyy-MM-dd'));
      const d2 = new Date(); d2.setDate(d2.getDate() - 7 - i);
      lastWeekDates.push(format(d2, 'yyyy-MM-dd'));
    }

    function weekRate(dates: string[]): number {
      const total = data.habits.length * 7;
      if (total === 0) return 100;
      let done = 0;
      for (const day of dates) {
        const entry = data.habitTracker.find(h => h.date === day);
        if (!entry) continue;
        done += data.habits.filter(h => entry.habits[h.id]).length;
      }
      return Math.round((done / total) * 100);
    }

    const thisRate = weekRate(thisWeekDates);
    const lastRate = weekRate(lastWeekDates);
    const delta = thisRate - lastRate;

    if (delta <= -20 && lastRate > 0) {
      insights.push({
        id: id(), category: 'habit', priority: 'high',
        title: `Habit completion dropped ${Math.abs(delta)}%`,
        description: `This week: ${thisRate}% vs last week: ${lastRate}%. Getting back on track early is easier.`,
        navTarget: 'command',
      });
    }
  }

  // Spending trend: compare this month vs last month
  if (data.financialEntries.length > 0) {
    const now = new Date();
    const thisMonthStr = format(now, 'yyyy-MM');
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = format(lastMonth, 'yyyy-MM');

    const thisMonthSpend = data.financialEntries
      .filter(e => e.date.startsWith(thisMonthStr) && e.type === 'expense')
      .reduce((s, e) => s + e.amount, 0);
    const lastMonthSpend = data.financialEntries
      .filter(e => e.date.startsWith(lastMonthStr) && e.type === 'expense')
      .reduce((s, e) => s + e.amount, 0);

    // Prorate this month to estimate full-month spend
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedSpend = dayOfMonth > 3 ? (thisMonthSpend / dayOfMonth) * daysInMonth : 0;

    if (lastMonthSpend > 0 && projectedSpend > lastMonthSpend * 1.3 && projectedSpend > 100) {
      const pctOver = Math.round(((projectedSpend - lastMonthSpend) / lastMonthSpend) * 100);
      insights.push({
        id: id(), category: 'financial', priority: 'medium',
        title: `Spending trending ${pctOver}% above last month`,
        description: `Projected $${Math.round(projectedSpend)} vs $${Math.round(lastMonthSpend)} last month. Review recent expenses?`,
        navTarget: 'financial',
      });
    }
  }

  // ── Smart note suggestions ────────────────────────────────────────────

  // Suggest meeting note if recent interactions without notes
  const recentContactsWithMeetings = data.contacts.filter(c => {
    if (!c.lastContacted) return false;
    if (daysAgo(c.lastContacted) > 1) return false;
    const recentMeetings = c.interactions.filter(i =>
      i.type === 'meeting' && daysAgo(i.date) <= 1
    );
    return recentMeetings.length > 0;
  });

  const todayNotes = data.notes.filter(n => n.isMeetingNote && daysAgo(n.createdAt) <= 1);
  if (recentContactsWithMeetings.length > 0 && todayNotes.length === 0) {
    const names = recentContactsWithMeetings.slice(0, 2).map(c => c.name).join(', ');
    insights.push({
      id: id(), category: 'contact', priority: 'medium',
      title: 'Create a meeting note?',
      description: `You met with ${names} recently. Capture your notes while they're fresh.`,
      navTarget: 'notes',
    });
  }

  // Suggest status update for near-deadline goals
  const goalsNearDeadline = data.goals.filter(g =>
    g.status !== 'completed' && g.dueDate && daysUntil(g.dueDate) <= 3 && daysUntil(g.dueDate) >= 0
  );
  const recentGoalNotes = data.notes.filter(n =>
    n.tags.some(t => t.includes('goal') || t.includes('status')) && daysAgo(n.createdAt) <= 3
  );
  if (goalsNearDeadline.length > 0 && recentGoalNotes.length === 0) {
    insights.push({
      id: id(), category: 'goal', priority: 'medium',
      title: `Goal deadline tomorrow — capture status?`,
      description: `"${goalsNearDeadline[0].title}" is due soon. Write a quick status update note.`,
      navTarget: 'notes',
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

// ─── CONTACT RELATIONSHIP SCORING ───────────────────────────────────────────

/**
 * Scores a contact's relationship health from 0-100 based on
 * recency (40%), frequency (30%), and depth (30%) of interactions.
 */
export function scoreContactRelationship(
  contact: Contact,
  allInteractions: ContactInteraction[],
): number {
  const now = new Date();

  // Recency: days since last interaction, scored 100 → 0 over 90 days
  let recencyScore = 0;
  if (contact.lastContacted) {
    const daysSince = differenceInDays(startOfDay(now), startOfDay(parseISO(contact.lastContacted)));
    recencyScore = Math.max(0, Math.round(100 - (daysSince / 90) * 100));
  }

  // Frequency: number of interactions in last 90 days, capped at 100
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const recentInteractions = allInteractions.filter(i => {
    try {
      return parseISO(i.date) >= ninetyDaysAgo;
    } catch {
      return false;
    }
  });
  const frequencyScore = Math.min(100, recentInteractions.length * 10);

  // Depth: weighted by type (meeting=3, call=2, everything else=1)
  const typeWeights: Record<string, number> = { meeting: 3, call: 2 };
  const totalDepth = recentInteractions.reduce((sum, i) => {
    return sum + (typeWeights[i.type] ?? 1);
  }, 0);
  const depthScore = Math.min(100, totalDepth * 5);

  return Math.round(recencyScore * 0.4 + frequencyScore * 0.3 + depthScore * 0.3);
}

// ─── TIME AUDIT ─────────────────────────────────────────────────────────────

export interface TimeAuditResult {
  byCategory: Record<string, { name: string; hours: number; color: string }>;
  totalHours: number;
}

/**
 * Computes a time audit breakdown by category for the last N days.
 */
export function computeTimeAudit(
  timeBlocks: TimeBlock[],
  categories: TimeCategory[],
  days: number = 7,
): TimeAuditResult {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const catMap = new Map(categories.map(c => [c.id, c]));
  const byCategory: Record<string, { name: string; hours: number; color: string }> = {};
  let totalHours = 0;

  for (const b of timeBlocks) {
    try {
      if (parseISO(b.date) < startOfDay(cutoff)) continue;
    } catch {
      continue;
    }
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    const dur = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
    totalHours += dur;

    const cat = catMap.get(b.categoryId);
    const name = cat?.name ?? 'Unknown';
    const color = cat?.color ?? '#6b7280';
    if (!byCategory[b.categoryId]) {
      byCategory[b.categoryId] = { name, hours: 0, color };
    }
    byCategory[b.categoryId].hours += dur;
  }

  return { byCategory, totalHours };
}

// ─── GOAL-CALENDAR ALIGNMENT ────────────────────────────────────────────────

export interface GoalAlignmentEntry {
  goalTitle: string;
  area: string;
  hoursThisWeek: number;
  alignment: 'good' | 'low' | 'none';
}

/**
 * For each active goal, checks if any time category name loosely matches
 * the goal's area or title and returns an alignment score.
 */
export function checkGoalCalendarAlignment(
  goals: Goal[],
  timeBlocks: TimeBlock[],
  categories: TimeCategory[],
): GoalAlignmentEntry[] {
  const audit = computeTimeAudit(timeBlocks, categories, 7);
  const catMap = new Map(categories.map(c => [c.id, c]));

  return goals
    .filter(g => g.status === 'in-progress' || g.status === 'not-started')
    .map(g => {
      const goalTerms = [g.area, g.title].map(s => s.toLowerCase());

      // Sum hours from any category whose name loosely matches goal area or title
      let hoursThisWeek = 0;
      for (const [catId, data] of Object.entries(audit.byCategory)) {
        const catName = data.name.toLowerCase();
        const matches = goalTerms.some(term =>
          catName.includes(term) || term.includes(catName)
        );
        if (matches) {
          hoursThisWeek += data.hours;
        }
      }

      const alignment: 'good' | 'low' | 'none' =
        hoursThisWeek >= 3 ? 'good' :
        hoursThisWeek > 0 ? 'low' : 'none';

      return {
        goalTitle: g.title,
        area: g.area,
        hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
        alignment,
      };
    });
}

// ─── OPTIMAL SCHEDULE SUGGESTIONS ───────────────────────────────────────────

export interface ScheduleSuggestion {
  slot: string;
  activity: string;
  reason: string;
}

/**
 * Analyses energy patterns by hour from timeBlocks and moodLogs
 * to suggest best times for deep work, meetings, and admin.
 */
export function suggestOptimalSchedule(
  timeBlocks: TimeBlock[],
  moodLogs: DailyMoodLog[],
): ScheduleSuggestion[] {
  // Collect energy data per hour bucket from time blocks
  const hourEnergy: Record<number, { total: number; count: number }> = {};

  for (const b of timeBlocks) {
    if (!b.energy) continue;
    const h = parseInt(b.startTime.split(':')[0], 10);
    if (!hourEnergy[h]) hourEnergy[h] = { total: 0, count: 0 };
    hourEnergy[h].total += b.energy;
    hourEnergy[h].count += 1;
  }

  // Incorporate mood log energy (assign to morning/afternoon/evening buckets)
  for (const log of moodLogs) {
    // Default mood log energy to midday (12) since logs are daily
    if (!hourEnergy[12]) hourEnergy[12] = { total: 0, count: 0 };
    hourEnergy[12].total += log.energy;
    hourEnergy[12].count += 1;
  }

  // Calculate average energy per hour
  const hourAvg: { hour: number; avg: number }[] = [];
  for (const [h, data] of Object.entries(hourEnergy)) {
    hourAvg.push({ hour: Number(h), avg: data.total / data.count });
  }
  hourAvg.sort((a, b) => b.avg - a.avg);

  if (hourAvg.length === 0) {
    return [
      { slot: '9:00 AM', activity: 'Deep Work', reason: 'Not enough data yet — mornings are generally best for focus.' },
      { slot: '1:00 PM', activity: 'Meetings', reason: 'Post-lunch is often good for collaborative work.' },
      { slot: '4:00 PM', activity: 'Admin / Email', reason: 'Energy typically dips in late afternoon.' },
    ];
  }

  const suggestions: ScheduleSuggestion[] = [];

  // Highest energy hours → deep work
  const topHours = hourAvg.slice(0, Math.max(1, Math.ceil(hourAvg.length * 0.33)));
  const deepWorkSlot = topHours[0];
  suggestions.push({
    slot: formatHour(deepWorkSlot.hour),
    activity: 'Deep Work',
    reason: `Your average energy at this hour is ${deepWorkSlot.avg.toFixed(1)}/5 — your peak.`,
  });

  // Mid-energy hours → meetings
  const midIdx = Math.floor(hourAvg.length / 2);
  if (midIdx < hourAvg.length) {
    const meetingSlot = hourAvg[midIdx];
    suggestions.push({
      slot: formatHour(meetingSlot.hour),
      activity: 'Meetings',
      reason: `Moderate energy (${meetingSlot.avg.toFixed(1)}/5) suits collaborative work.`,
    });
  }

  // Lowest energy hours → admin
  const lowSlot = hourAvg[hourAvg.length - 1];
  if (lowSlot.hour !== deepWorkSlot.hour) {
    suggestions.push({
      slot: formatHour(lowSlot.hour),
      activity: 'Admin / Email',
      reason: `Energy dips to ${lowSlot.avg.toFixed(1)}/5 — good for low-stakes tasks.`,
    });
  }

  return suggestions;
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}
