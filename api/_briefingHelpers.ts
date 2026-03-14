/**
 * Server-side briefing helpers — pure analysis functions ported from
 * src/utils/intelligence.ts for use in Vercel API routes.
 * Only depends on date-fns (no browser APIs).
 */

import { differenceInDays, parseISO, format, startOfDay } from 'date-fns';

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function daysAgo(dateStr: string): number {
  return differenceInDays(startOfDay(new Date()), startOfDay(parseISO(dateStr)));
}

function daysUntil(dateStr: string): number {
  return differenceInDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
}

// ─── Build Claude prompt from raw Supabase data ────────────────────────────

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
}

export function buildBriefingPrompt(
  data: BriefingData,
  emails: any[] = [],
  calendarEvents: any[] = [],
): string {
  const today = todayISO();
  const dayOfWeek = format(new Date(), 'EEEE');
  const todayDate = format(new Date(), 'MMMM d, yyyy');

  // Todos
  const activeTodos = data.todos.filter(t => t.status !== 'done');
  const overdueTodos = activeTodos.filter(t => t.dueDate && t.dueDate < today);
  const highPriority = activeTodos.filter(t => t.priority === 'high');

  const todosSection = activeTodos.length > 0
    ? activeTodos
        .sort((a, b) => {
          const p = { high: 0, medium: 1, low: 2 } as Record<string, number>;
          return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
        })
        .slice(0, 15)
        .map(t => `- [${t.priority.toUpperCase()}] ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ''}${t.status === 'in-progress' ? ' [IN PROGRESS]' : ''}`)
        .join('\n')
    : 'No active todos.';

  // Goals
  const activeGoals = data.goals.filter(g => g.status !== 'completed');
  const goalsSection = activeGoals.length > 0
    ? activeGoals
        .slice(0, 10)
        .map(g => `- "${g.title}" — ${g.progress}% complete, due ${g.dueDate}, area: ${g.area}${g.status === 'blocked' ? ' [BLOCKED]' : ''}`)
        .join('\n')
    : 'No active goals.';

  // Projects
  const activeProjects = data.projects.filter(p => p.status === 'active');
  const projectsSection = activeProjects.length > 0
    ? activeProjects
        .map(p => `- ${p.name} [${p.health}] — next: ${p.nextAction || 'none'}${p.dueDate ? `, due: ${p.dueDate}` : ''}`)
        .join('\n')
    : 'No active projects.';

  // Today's calendar
  const todayBlocks = data.timeBlocks
    .filter(b => b.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const catMap = new Map(data.timeCategories.map(c => [c.id, c.name]));
  const calendarSection = todayBlocks.length > 0
    ? todayBlocks
        .map(b => `- ${b.startTime}–${b.endTime}: ${b.title || catMap.get(b.categoryId) || 'Untitled'}`)
        .join('\n')
    : 'Nothing scheduled today.';

  // Habits — yesterday's completion
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  const yesterdayEntry = data.habitTracker.find(h => h.date === yesterday);
  const yesterdayCompleted = yesterdayEntry
    ? data.habits.filter(h => yesterdayEntry.habits[h.id]).length
    : 0;
  const yesterdayRate = data.habits.length > 0
    ? Math.round((yesterdayCompleted / data.habits.length) * 100)
    : 100;
  const habitsSection = data.habits.length > 0
    ? `Yesterday: ${yesterdayCompleted}/${data.habits.length} (${yesterdayRate}%)\nHabits: ${data.habits.map(h => `${h.icon} ${h.name}`).join(', ')}`
    : 'No habits configured.';

  // Contacts needing follow-up
  const followUps = data.contacts.filter(c => c.followUpNeeded && c.followUpDate && c.followUpDate <= today);
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

  const contactsSection = [
    ...(followUps.length > 0
      ? [`Overdue follow-ups: ${followUps.map(c => c.name).join(', ')}`]
      : []),
    ...(upcomingBirthdays.length > 0
      ? [`Upcoming birthdays: ${upcomingBirthdays.map(b => `${b.name} (${b.daysUntil === 0 ? 'TODAY' : `in ${b.daysUntil}d`})`).join(', ')}`]
      : []),
  ].join('\n') || 'No contact actions needed.';

  // Priorities from identity
  const prioritiesSection = data.identity.priorities.length > 0
    ? data.identity.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'None set.';

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
        .map(e => `- From: ${e.from} | Subject: ${e.subject} | "${e.snippet?.slice(0, 100)}"`)
        .join('\n')
    : null;

  const sections = [
    `Today: ${dayOfWeek}, ${todayDate}`,
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

  if (googleCalendarSection) {
    sections.push('', `GOOGLE CALENDAR TODAY:`, googleCalendarSection);
  }

  sections.push(
    '',
    `GOALS (${activeGoals.length} active):`,
    goalsSection,
    '',
    `PROJECTS (${activeProjects.length} active):`,
    projectsSection,
    '',
    `HABITS:`,
    habitsSection,
    '',
    `CONTACTS:`,
    contactsSection,
  );

  if (emailSection) {
    sections.push('', `OVERNIGHT EMAILS (${emails.length}):`, emailSection);
  }

  return sections.join('\n');
}
