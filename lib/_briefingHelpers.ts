/**
 * Server-side briefing helpers — pure analysis functions ported from
 * src/utils/intelligence.ts for use in Vercel API routes.
 * Only depends on date-fns (no browser APIs).
 */

import { differenceInDays, parseISO, format, startOfDay, subDays } from 'date-fns';

// ─── Lightweight type mirrors (avoid importing Vite-aliased src/types) ──────

interface TodoItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  notes: string;
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
  dueDate: string;
  area: string;
  period?: string;
}

interface Contact {
  id: string;
  name: string;
  lastContacted: string;
  followUpNeeded: boolean;
  followUpDate?: string;
  birthday?: string;
  anniversary?: string;
}

interface Habit {
  id: string;
  name: string;
  icon: string;
}

interface HabitTracker {
  date: string;
  habits: { [habitId: string]: boolean };
}

interface TimeBlock {
  id: string;
  date: string;
  categoryId: string;
  title?: string;
  startTime: string;
  endTime: string;
  energy: number;
}

interface TimeCategory {
  id: string;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  health: string;
  nextAction: string;
  dueDate: string;
}

interface Identity {
  name: string;
  priorities: string[];
}

interface Course {
  id: string;
  name: string;
  professor: string;
  credits: number;
  currentGrade: number;
  targetGrade: number;
  assignments: Array<{ id: string; title: string; status: string; dueDate: string; grade?: number; weight: number }>;
  examDates: Array<{ id: string; title: string; date: string }>;
}

interface FinancialEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  ventureId?: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
}

interface VentureFinancial {
  id: string;
  name: string;
  entries: FinancialEntry[];
}

interface WeeklyReview {
  id: string;
  weekOf: string;
  wins: string;
  misses: string;
  blockers: string;
  focusNextWeek: string;
  energyAvg: number;
}

interface DecisionLog {
  id: string;
  date: string;
  decision: string;
  reasoning: string;
  outcome: string;
  area: string;
}

interface ReadingItem {
  id: string;
  title: string;
  author: string;
  type: string;
  status: string;
  category: string;
  priority: number;
  notes: string;
}

interface Candidate {
  id: string;
  name: string;
  role: string;
  organization: string;
  status: string;
  notes: string;
  lastContactDate: string;
}

interface Client {
  id: string;
  name: string;
  company: string;
  status: string;
  contractValue: number;
  billingDay?: number;
  startDate: string;
  endDate?: string;
  notes: string;
  services: string[];
}

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  isMeetingNote: boolean;
  meetingActionItems?: string;
  meetingDecisions?: string;
}

interface DailyEvent {
  id: string;
  date: string;
  title: string;
  time: string;
  notes: string;
}

interface DailyMoodLog {
  date: string;
  energy: number;
  mood: number;
  note: string;
}

interface SocialPost {
  id: string;
  baseContent: string;
  platforms: string[];
  status: string;
  scheduledAt?: string;
}

interface SocialApprovalItem {
  id: string;
  type: string;
  content: string;
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function daysUntil(dateStr: string): number {
  return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
}

// ─── Build Claude prompt from raw Supabase data ────────────────────────────

export interface BriefingHistoryContext {
  pastBriefings: Array<{ date: string; executiveSummary: string }>;
  completionVelocity: { avgPerDay: number; trend: string };
  reflections: Array<{ date: string; wins: string; challenges: string }>;
}

export interface BriefingData {
  identity: Identity;
  todos: TodoItem[];
  goals: Goal[];
  projects: Project[];
  habits: Habit[];
  habitTracker: HabitTracker[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  contacts: Contact[];
  courses: Course[];
  financialEntries: FinancialEntry[];
  savingsGoals: SavingsGoal[];
  ventureFinancials: VentureFinancial[];
  weeklyReviews: WeeklyReview[];
  decisionLogs: DecisionLog[];
  readingItems: ReadingItem[];
  candidates: Candidate[];
  clients: Client[];
  notes: Note[];
  dailyEvents: DailyEvent[];
  dailyMoodLogs: DailyMoodLog[];
  socialPosts: SocialPost[];
  socialApprovals: SocialApprovalItem[];
  history?: BriefingHistoryContext;
  weather?: { temp: number; feelsLike: number; condition: string; high: number; low: number } | null;
  githubActivity?: {
    lastSyncAt: string;
    recentCommits: Array<{ repo: string; message: string; date: string }>;
    openPRs: Array<{ repo: string; title: string; url: string }>;
    openIssues: Array<{ repo: string; title: string; url: string; labels: string[] }>;
  } | null;
  screenTime?: Array<{ date: string; totalMinutes: number; categories: Record<string, number>; pickups: number }>;
  newsFeed?: Array<{ title: string; source: string; url: string; publishedAt: string }>;
  notionPages?: Array<{ id: string; title: string; lastEditedAt: string; contentPreview?: string }>;
  readwiseHighlights?: Array<{ id: string; text: string; bookTitle: string; author: string; highlightedAt: string }>;
}

export function buildBriefingPrompt(
  data: BriefingData,
  emails: any[] = [],
  calendarEvents: any[] = [],
): string {
  const today = todayISO();
  const dayOfWeek = format(new Date(), 'EEEE');
  const todayDate = format(new Date(), 'MMMM d, yyyy');
  const sevenDaysOut = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  // ── Improvement #3: Send less data — pre-filter aggressively ──
  // Only send overdue, high-priority, due-within-3-days, and in-progress todos
  const activeTodos = data.todos.filter(t => t.status !== 'done');
  const overdueTodos = activeTodos.filter(t => t.dueDate && t.dueDate < today);
  const highPriority = activeTodos.filter(t => t.priority === 'high');
  const threeDaysOut = format(new Date(Date.now() + 3 * 86400000), 'yyyy-MM-dd');

  const relevantTodos = activeTodos
    .filter(t =>
      t.priority === 'high' ||
      t.status === 'in-progress' ||
      (t.dueDate && t.dueDate <= threeDaysOut)
    )
    .sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 } as Record<string, number>;
      return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
    })
    .slice(0, 10);

  const todosSection = relevantTodos.length > 0
    ? relevantTodos
        .map(t => `- [${t.priority.toUpperCase()}] ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ''}${t.status === 'in-progress' ? ' [IN PROGRESS]' : ''}`)
        .join('\n')
    : 'No active todos.';

  // Goals — only send those needing attention (blocked, behind schedule, or due within 14 days)
  const activeGoals = data.goals.filter(g => g.status !== 'completed');
  const attentionGoals = activeGoals.filter(g =>
    g.status === 'blocked' ||
    (g.dueDate && daysUntil(g.dueDate) <= 14) ||
    (g.progress < 50 && g.dueDate && daysUntil(g.dueDate) <= 30)
  );
  const goalsSection = attentionGoals.length > 0
    ? attentionGoals
        .slice(0, 8)
        .map(g => `- "${g.title}" — ${g.progress}% complete, due ${g.dueDate}, area: ${g.area}${g.status === 'blocked' ? ' [BLOCKED]' : ''}`)
        .join('\n')
    : `${activeGoals.length} active goals, all on track.`;

  // Life areas that have goals vs don't
  const areasWithGoals = new Set(data.goals.map(g => g.area));
  const allAreas = ['ventures', 'academic', 'health', 'spiritual', 'financial', 'relationships', 'personal'];
  const areasWithoutGoals = allAreas.filter(a => !areasWithGoals.has(a));

  // Projects
  const activeProjects = data.projects.filter(p => p.status === 'active');
  const projectsSection = activeProjects.length > 0
    ? activeProjects
        .map(p => `- ${p.name} [${p.health}] — next: ${p.nextAction || 'none'}${p.dueDate ? `, due: ${p.dueDate}` : ''}`)
        .join('\n')
    : 'No active projects.';

  // Today's time blocks
  const todayBlocks = data.timeBlocks
    .filter(b => b.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const catMap = new Map(data.timeCategories.map(c => [c.id, c.name]));
  const calendarSection = todayBlocks.length > 0
    ? todayBlocks
        .map(b => `- ${b.startTime}–${b.endTime}: ${b.title || catMap.get(b.categoryId) || 'Untitled'}`)
        .join('\n')
    : 'Nothing scheduled today.';

  // Recent energy patterns from time blocks (last 7 days)
  const recentBlocks = data.timeBlocks.filter(b => {
    const d = daysUntil(b.date);
    return d >= -7 && d <= 0;
  });
  const energyByHour: Record<string, { total: number; count: number }> = {};
  for (const b of recentBlocks) {
    const hour = b.startTime.split(':')[0];
    if (!energyByHour[hour]) energyByHour[hour] = { total: 0, count: 0 };
    energyByHour[hour].total += b.energy;
    energyByHour[hour].count += 1;
  }
  const energyPatternSection = Object.keys(energyByHour).length > 0
    ? Object.entries(energyByHour)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([hour, { total, count }]) => `- ${hour}:00 → avg energy ${(total / count).toFixed(1)}/5 (${count} blocks)`)
        .join('\n')
    : 'No recent energy data.';

  // Habits — yesterday's completion + 7-day trend
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  const yesterdayEntry = data.habitTracker.find(h => h.date === yesterday);
  const yesterdayCompleted = yesterdayEntry
    ? data.habits.filter(h => yesterdayEntry.habits[h.id]).length
    : 0;
  const yesterdayRate = data.habits.length > 0
    ? Math.round((yesterdayCompleted / data.habits.length) * 100)
    : 100;

  // 7-day habit trend
  const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i + 1), 'yyyy-MM-dd'));
  const weeklyRates = last7Days.map(date => {
    const entry = data.habitTracker.find(h => h.date === date);
    if (!entry || data.habits.length === 0) return null;
    return Math.round((data.habits.filter(h => entry.habits[h.id]).length / data.habits.length) * 100);
  }).filter((r): r is number => r !== null);
  const avgWeeklyRate = weeklyRates.length > 0 ? Math.round(weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length) : null;

  const habitsSection = data.habits.length > 0
    ? `Yesterday: ${yesterdayCompleted}/${data.habits.length} (${yesterdayRate}%)${avgWeeklyRate !== null ? ` | 7-day avg: ${avgWeeklyRate}%` : ''}\nHabits: ${data.habits.map(h => `${h.icon} ${h.name}`).join(', ')}`
    : 'No habits configured.';

  // Contacts needing follow-up
  const followUps = data.contacts.filter(c => c.followUpNeeded && c.followUpDate && c.followUpDate <= today);
  const staleContacts = data.contacts.filter(c => c.lastContacted && daysUntil(c.lastContacted) <= -30).slice(0, 5);
  const upcomingBirthdays = (() => {
    const thisYear = new Date().getFullYear();
    const results: { name: string; daysUntil: number }[] = [];
    for (const c of data.contacts) {
      if (!c.birthday) continue;
      const [, mm, dd] = c.birthday.split('-');
      const d = daysUntil(`${thisYear}-${mm}-${dd}`);
      if (d >= 0 && d <= 7) results.push({ name: c.name, daysUntil: d });
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  })();
  const upcomingAnniversaries = (() => {
    const thisYear = new Date().getFullYear();
    const results: { name: string; daysUntil: number }[] = [];
    for (const c of data.contacts) {
      if (!c.anniversary) continue;
      const [, mm, dd] = c.anniversary.split('-');
      const d = daysUntil(`${thisYear}-${mm}-${dd}`);
      if (d >= 0 && d <= 7) results.push({ name: c.name, daysUntil: d });
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  })();

  const contactsSection = [
    ...(followUps.length > 0
      ? [`Overdue follow-ups: ${followUps.map(c => c.name).join(', ')}`]
      : []),
    ...(staleContacts.length > 0
      ? [`Stale contacts (30+ days): ${staleContacts.map(c => `${c.name} (${Math.abs(daysUntil(c.lastContacted))}d ago)`).join(', ')}`]
      : []),
    ...(upcomingBirthdays.length > 0
      ? [`Upcoming birthdays: ${upcomingBirthdays.map(b => `${b.name} (${b.daysUntil === 0 ? 'TODAY' : `in ${b.daysUntil}d`})`).join(', ')}`]
      : []),
    ...(upcomingAnniversaries.length > 0
      ? [`Upcoming anniversaries: ${upcomingAnniversaries.map(a => `${a.name} (${a.daysUntil === 0 ? 'TODAY' : `in ${a.daysUntil}d`})`).join(', ')}`]
      : []),
  ].join('\n') || 'No contact actions needed.';

  // Priorities from identity
  const prioritiesSection = data.identity.priorities.length > 0
    ? data.identity.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'None set.';

  // ─── NEW DATA SECTIONS ────────────────────────────────────────────────────

  // Academic
  const academicSection = (() => {
    if (data.courses.length === 0) return null;
    const lines: string[] = [];
    for (const course of data.courses) {
      const gradeStatus = course.currentGrade < course.targetGrade ? ' [BELOW TARGET]' : '';
      lines.push(`- ${course.name} (${course.professor}): ${course.currentGrade}%/${course.targetGrade}% target${gradeStatus}`);

      // Upcoming assignments (next 7 days)
      const upcomingAssignments = course.assignments
        .filter(a => a.status !== 'completed' && a.dueDate && a.dueDate <= sevenDaysOut && a.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      for (const a of upcomingAssignments) {
        lines.push(`  → Assignment due: "${a.title}" on ${a.dueDate} (weight: ${a.weight}%)`);
      }

      // Overdue assignments
      const overdueAssignments = course.assignments
        .filter(a => a.status !== 'completed' && a.dueDate && a.dueDate < today);
      for (const a of overdueAssignments) {
        lines.push(`  → OVERDUE: "${a.title}" was due ${a.dueDate}`);
      }

      // Upcoming exams (next 14 days)
      const upcomingExams = course.examDates
        .filter(e => e.date >= today && daysUntil(e.date) <= 14)
        .sort((a, b) => a.date.localeCompare(b.date));
      for (const e of upcomingExams) {
        lines.push(`  → Exam: "${e.title}" on ${e.date} (${daysUntil(e.date)} days away)`);
      }
    }
    return lines.join('\n');
  })();

  // Financial
  const financialSection = (() => {
    const recentEntries = data.financialEntries
      .filter(e => e.date >= thirtyDaysAgo)
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalIncome = recentEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = recentEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);

    // Top expense categories
    const expenseByCategory: Record<string, number> = {};
    for (const e of recentEntries.filter(e => e.type === 'expense')) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;
    }
    const topCategories = Object.entries(expenseByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const lines: string[] = [];
    lines.push(`Last 30 days: $${totalIncome.toFixed(0)} income, $${totalExpenses.toFixed(0)} expenses (net: $${(totalIncome - totalExpenses).toFixed(0)})`);
    if (topCategories.length > 0) {
      lines.push(`Top expense categories: ${topCategories.map(([cat, amt]) => `${cat}: $${amt.toFixed(0)}`).join(', ')}`);
    }

    // Savings goals
    if (data.savingsGoals.length > 0) {
      lines.push('Savings goals:');
      for (const sg of data.savingsGoals) {
        const pct = sg.target > 0 ? Math.round((sg.current / sg.target) * 100) : 0;
        lines.push(`- ${sg.name}: $${sg.current.toFixed(0)}/$${sg.target.toFixed(0)} (${pct}%)${sg.deadline ? ` deadline: ${sg.deadline}` : ''}`);
      }
    }

    // Venture financials
    if (data.ventureFinancials.length > 0) {
      const ventureLines = data.ventureFinancials.map(vf => {
        const income = vf.entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const expense = vf.entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
        return `- ${vf.name}: $${income.toFixed(0)} in / $${expense.toFixed(0)} out (net: $${(income - expense).toFixed(0)})`;
      });
      if (ventureLines.length > 0) {
        lines.push('Venture P&L:');
        lines.push(...ventureLines);
      }
    }

    return lines.length > 0 ? lines.join('\n') : null;
  })();

  // Weekly review (most recent)
  const weeklyReviewSection = (() => {
    if (data.weeklyReviews.length === 0) return null;
    const latest = data.weeklyReviews.sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
    return [
      `Latest review (week of ${latest.weekOf}):`,
      `- Wins: ${latest.wins || 'none noted'}`,
      `- Misses: ${latest.misses || 'none noted'}`,
      `- Blockers: ${latest.blockers || 'none'}`,
      `- Focus next week: ${latest.focusNextWeek || 'not set'}`,
      `- Energy avg: ${latest.energyAvg}/5`,
    ].join('\n');
  })();

  // Recent decisions
  const recentDecisionsSection = (() => {
    const recent = data.decisionLogs
      .filter(d => d.date >= thirtyDaysAgo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    if (recent.length === 0) return null;
    return recent
      .map(d => `- [${d.area}] ${d.decision} (${d.date})${d.outcome ? ` → ${d.outcome}` : ''}`)
      .join('\n');
  })();

  // Reading pipeline
  const readingSection = (() => {
    const inProgress = data.readingItems.filter(r => r.status === 'in-progress');
    const wantToRead = data.readingItems.filter(r => r.status === 'want-to-read').sort((a, b) => a.priority - b.priority);
    const lines: string[] = [];
    if (inProgress.length > 0) {
      lines.push(`Currently reading: ${inProgress.map(r => `"${r.title}" by ${r.author} (${r.type})`).join(', ')}`);
    }
    if (wantToRead.length > 0) {
      lines.push(`Want to read (top 3): ${wantToRead.slice(0, 3).map(r => `"${r.title}" by ${r.author}`).join(', ')}`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
  })();

  // Recruitment pipeline
  const recruitmentSection = (() => {
    const activeCandidates = data.candidates.filter(c => !['rejected', 'withdrawn', 'hired'].includes(c.status));
    const activeClients = data.clients.filter(c => c.status === 'active');
    const lines: string[] = [];
    if (activeClients.length > 0) {
      lines.push(`Active clients: ${activeClients.map(c => `${c.name} (${c.company}, $${c.contractValue}/mo)`).join(', ')}`);
      // Check for billing days coming up
      const todayDay = new Date().getDate();
      const billingAlert = activeClients.filter(c => c.billingDay && Math.abs(c.billingDay - todayDay) <= 3);
      if (billingAlert.length > 0) {
        lines.push(`Billing soon: ${billingAlert.map(c => `${c.name} (day ${c.billingDay})`).join(', ')}`);
      }
    }
    if (activeCandidates.length > 0) {
      lines.push(`Active candidates: ${activeCandidates.map(c => `${c.name} for ${c.role} at ${c.organization} [${c.status}]`).join(', ')}`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
  })();

  // Meeting notes with pending action items
  const meetingNotesSection = (() => {
    const recentMeetingNotes = data.notes
      .filter(n => n.isMeetingNote && n.meetingActionItems && n.updatedAt >= thirtyDaysAgo)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
    if (recentMeetingNotes.length === 0) return null;
    return recentMeetingNotes
      .map(n => `- "${n.title}" (${n.updatedAt.split('T')[0]}): ${n.meetingActionItems?.slice(0, 120)}`)
      .join('\n');
  })();

  // Daily events for today
  const dailyEventsSection = (() => {
    const todayEvents = data.dailyEvents
      .filter(e => e.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
    if (todayEvents.length === 0) return null;
    return todayEvents
      .map(e => `- ${e.time}: ${e.title}${e.notes ? ` (${e.notes})` : ''}`)
      .join('\n');
  })();

  // Mood/energy trends (last 7 days)
  const wellnessSection = (() => {
    const recentLogs = data.dailyMoodLogs
      .filter(l => daysUntil(l.date) >= -7)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (recentLogs.length === 0) return null;
    const avgEnergy = recentLogs.reduce((s, l) => s + l.energy, 0) / recentLogs.length;
    const avgMood = recentLogs.reduce((s, l) => s + l.mood, 0) / recentLogs.length;
    const lines = [
      `7-day avg — Energy: ${avgEnergy.toFixed(1)}/5, Mood: ${avgMood.toFixed(1)}/5`,
      `Daily logs: ${recentLogs.map(l => `${l.date}: E${l.energy}/M${l.mood}${l.note ? ` "${l.note}"` : ''}`).join(' | ')}`,
    ];
    return lines.join('\n');
  })();

  // Social media
  const socialSection = (() => {
    const pendingPosts = data.socialPosts.filter(p => p.status === 'draft' || p.status === 'scheduled');
    const pendingApprovals = data.socialApprovals.filter(a => a.status === 'pending');
    const lines: string[] = [];
    if (pendingApprovals.length > 0) {
      lines.push(`${pendingApprovals.length} item(s) awaiting approval`);
    }
    if (pendingPosts.length > 0) {
      lines.push(`${pendingPosts.filter(p => p.status === 'draft').length} draft(s), ${pendingPosts.filter(p => p.status === 'scheduled').length} scheduled`);
      for (const p of pendingPosts.slice(0, 3)) {
        lines.push(`- [${p.status}] ${p.platforms.join('/')}: "${p.baseContent.slice(0, 60)}..."${p.scheduledAt ? ` (scheduled: ${p.scheduledAt})` : ''}`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : null;
  })();

  // Google Calendar events (if available)
  const googleCalendarSection = calendarEvents.length > 0
    ? calendarEvents
        .map(e => {
          const start = e.start ? new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '?';
          const end = e.end ? new Date(e.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '?';
          return `- ${start}–${end}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`;
        })
        .join('\n')
    : null;

  // Gmail overnight emails (if available)
  const emailSection = emails.length > 0
    ? emails
        .map(e => `- From: ${e.from} | Subject: ${e.subject} | "${e.snippet?.slice(0, 60)}"`)
        .join('\n')
    : null;

  // ─── Assemble the full prompt ─────────────────────────────────────────────

  const sections = [
    `Today: ${dayOfWeek}, ${todayDate}`,
  ];

  if (data.weather) {
    sections.push(
      `WEATHER: ${data.weather.temp}°F (feels like ${data.weather.feelsLike}°F), ${data.weather.condition}, high ${data.weather.high}°F / low ${data.weather.low}°F`
    );
  }

  sections.push(
    '',
    `MY PRIORITIES:`,
    prioritiesSection,
    '',
    `TODOS (${activeTodos.length} active, ${overdueTodos.length} overdue, ${highPriority.length} high-priority):`,
    todosSection,
    '',
    `CALENDAR TODAY (time blocks):`,
    calendarSection,
  ];

  if (dailyEventsSection) {
    sections.push('', `DAILY EVENTS TODAY:`, dailyEventsSection);
  }

  if (googleCalendarSection) {
    sections.push('', `GOOGLE CALENDAR TODAY:`, googleCalendarSection);
  }

  sections.push(
    '',
    `GOALS (${activeGoals.length} active):`,
    goalsSection,
  );

  if (areasWithoutGoals.length > 0) {
    sections.push(`Life areas without goals: ${areasWithoutGoals.join(', ')}`);
  }

  sections.push(
    '',
    `PROJECTS (${activeProjects.length} active):`,
    projectsSection,
    '',
    `HABITS:`,
    habitsSection,
    '',
    `ENERGY PATTERNS (7-day avg by hour):`,
    energyPatternSection,
    '',
    `CONTACTS:`,
    contactsSection,
  );

  if (academicSection) {
    sections.push('', `ACADEMIC:`, academicSection);
  }

  if (financialSection) {
    sections.push('', `FINANCIAL (last 30 days):`, financialSection);
  }

  if (recruitmentSection) {
    sections.push('', `RECRUITMENT / CLIENTS:`, recruitmentSection);
  }

  if (readingSection) {
    sections.push('', `READING PIPELINE:`, readingSection);
  }

  if (wellnessSection) {
    sections.push('', `WELLNESS (mood/energy logs):`, wellnessSection);
  }

  if (weeklyReviewSection) {
    sections.push('', `LATEST WEEKLY REVIEW:`, weeklyReviewSection);
  }

  if (recentDecisionsSection) {
    sections.push('', `RECENT DECISIONS:`, recentDecisionsSection);
  }

  if (meetingNotesSection) {
    sections.push('', `MEETING ACTION ITEMS (pending):`, meetingNotesSection);
  }

  if (socialSection) {
    sections.push('', `SOCIAL MEDIA:`, socialSection);
  }

  if (emailSection) {
    sections.push('', `OVERNIGHT EMAILS (${emails.length}):`, emailSection);
  }

  // ── GitHub activity ──
  if (data.githubActivity) {
    const gh = data.githubActivity;
    const ghLines: string[] = [];
    if (gh.recentCommits.length > 0) {
      ghLines.push(`Recent commits (${gh.recentCommits.length}):`);
      for (const c of gh.recentCommits.slice(0, 5)) {
        ghLines.push(`- ${c.repo}: "${c.message}" (${c.date.split('T')[0]})`);
      }
    }
    if (gh.openPRs.length > 0) {
      ghLines.push(`Open PRs (${gh.openPRs.length}): ${gh.openPRs.slice(0, 5).map(p => `${p.repo}: ${p.title}`).join('; ')}`);
    }
    if (gh.openIssues.length > 0) {
      ghLines.push(`Open issues (${gh.openIssues.length}): ${gh.openIssues.slice(0, 5).map(i => `${i.repo}: ${i.title}`).join('; ')}`);
    }
    if (ghLines.length > 0) {
      sections.push('', `GITHUB ACTIVITY:`, ...ghLines);
    }
  }

  // ── News feed ──
  if (data.newsFeed && data.newsFeed.length > 0) {
    sections.push('', `INDUSTRY NEWS (${data.newsFeed.length} articles):`);
    for (const n of data.newsFeed.slice(0, 5)) {
      sections.push(`- "${n.title}" (${n.source}, ${n.publishedAt?.split('T')[0] ?? ''})`);
    }
  }

  // ── Notion pages ──
  if (data.notionPages && data.notionPages.length > 0) {
    const recentPages = data.notionPages
      .sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt))
      .slice(0, 5);
    sections.push('', `NOTION (recently edited pages):`);
    for (const p of recentPages) {
      sections.push(`- "${p.title}" (edited: ${p.lastEditedAt.split('T')[0]})${p.contentPreview ? ` — ${p.contentPreview.slice(0, 80)}` : ''}`);
    }
  }

  // ── Readwise highlights ──
  if (data.readwiseHighlights && data.readwiseHighlights.length > 0) {
    sections.push('', `RECENT READING HIGHLIGHTS (${data.readwiseHighlights.length}):`);
    for (const h of data.readwiseHighlights.slice(0, 5)) {
      sections.push(`- "${h.text.slice(0, 100)}" — ${h.bookTitle} by ${h.author}`);
    }
  }

  // ── Screen time ──
  if (data.screenTime && data.screenTime.length > 0) {
    const recent = data.screenTime.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const avgMinutes = Math.round(recent.reduce((s, e) => s + e.totalMinutes, 0) / recent.length);
    sections.push('', `SCREEN TIME (${recent.length}-day avg: ${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m):`);
    for (const s of recent) {
      const cats = Object.entries(s.categories).map(([k, v]) => `${k}: ${v}m`).join(', ');
      sections.push(`- ${s.date}: ${Math.floor(s.totalMinutes / 60)}h ${s.totalMinutes % 60}m (${s.pickups} pickups)${cats ? ` [${cats}]` : ''}`);
    }
  }

  // ── Briefing history (past summaries, velocity, reflections) ────────────
  if (data.history) {
    const h = data.history;
    if (h.pastBriefings.length > 0) {
      sections.push('', `PAST BRIEFING SUMMARIES (last ${h.pastBriefings.length} days):`);
      for (const b of h.pastBriefings) {
        sections.push(`- ${b.date}: ${b.executiveSummary}`);
      }
    }
    if (h.completionVelocity.avgPerDay > 0) {
      sections.push('', `TASK COMPLETION VELOCITY:`,
        `Average ${h.completionVelocity.avgPerDay.toFixed(1)} tasks/day (trend: ${h.completionVelocity.trend})`,
        `Use this to calibrate how many tasks to recommend today.`);
    }
    if (h.reflections.length > 0) {
      sections.push('', `RECENT END-OF-DAY REFLECTIONS:`);
      for (const r of h.reflections) {
        const parts = [];
        if (r.wins) parts.push(`Wins: ${r.wins}`);
        if (r.challenges) parts.push(`Challenges: ${r.challenges}`);
        sections.push(`- ${r.date}: ${parts.join(' | ') || 'no details'}`);
      }
    }
  }

  return sections.join('\n');
}
