import React, { useMemo } from 'react';
import {
  BarChart3, TrendingUp, Target, Users, Clock,
  BookOpen, CheckSquare, DollarSign, Heart,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { format, parseISO, subDays, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import type {
  Goal, Contact, TodoItem, TimeBlock, TimeCategory,
  FinancialEntry, ReadingItem, HabitTracker, Habit, DailyMoodLog, Note,
} from '../../types';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  goals: Goal[];
  contacts: Contact[];
  todos: TodoItem[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  financialEntries: FinancialEntry[];
  readingItems: ReadingItem[];
  habitTracker: HabitTracker[];
  habits: Habit[];
  dailyMoodLogs: DailyMoodLog[];
  notes: Note[];
}

// ─── COLORS ────────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#3b82f6', '#eab308', '#14b8a6'];

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="caesar-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function AnalyticsInsights({
  goals, contacts, todos, timeBlocks, timeCategories,
  financialEntries, readingItems, habitTracker, habits, dailyMoodLogs, notes,
}: Props) {
  const today = new Date();
  const thirtyDaysAgo = subDays(today, 30);

  // Goal progress
  const goalStats = useMemo(() => {
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const avgProgress = total > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / total) : 0;
    return { total, completed, avgProgress };
  }, [goals]);

  // Todo completion rate (last 30 days)
  const todoStats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter(t => t.status === 'done').length;
    const overdue = todos.filter(t => t.dueDate && t.status !== 'done' && new Date(t.dueDate) < today).length;
    return { total, done, rate: total > 0 ? Math.round((done / total) * 100) : 0, overdue };
  }, [todos, today]);

  // Time allocation (last 30 days)
  const timeData = useMemo(() => {
    const recent = timeBlocks.filter(b => {
      try { return parseISO(b.date) >= thirtyDaysAgo; } catch { return false; }
    });
    const catMap: Record<string, number> = {};
    for (const b of recent) {
      const [sh, sm] = b.startTime.split(':').map(Number);
      const [eh, em] = b.endTime.split(':').map(Number);
      const hrs = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
      const cat = timeCategories.find(c => c.id === b.categoryId)?.name ?? 'Other';
      catMap[cat] = (catMap[cat] ?? 0) + hrs;
    }
    return Object.entries(catMap)
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);
  }, [timeBlocks, timeCategories, thirtyDaysAgo]);

  // Financial summary (last 30 days)
  const finStats = useMemo(() => {
    const recent = financialEntries.filter(e => {
      try { return parseISO(e.date) >= thirtyDaysAgo; } catch { return false; }
    });
    const income = recent.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expense = recent.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    return { income, expense, net: income - expense };
  }, [financialEntries, thirtyDaysAgo]);

  // Habit completion rate (last 14 days)
  const habitRate = useMemo(() => {
    const recent = habitTracker.filter(h => {
      try { return parseISO(h.date) >= subDays(today, 14); } catch { return false; }
    });
    if (recent.length === 0 || habits.length === 0) return 0;
    let total = 0;
    let done = 0;
    for (const day of recent) {
      for (const habit of habits) {
        total++;
        if (day.habits[habit.id]) done++;
      }
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [habitTracker, habits, today]);

  // Mood trend (last 14 days)
  const moodData = useMemo(() => {
    return dailyMoodLogs
      .filter(m => { try { return parseISO(m.date) >= subDays(today, 14); } catch { return false; } })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(m => ({ date: format(parseISO(m.date), 'MM/dd'), mood: m.mood, energy: m.energy }));
  }, [dailyMoodLogs, today]);

  // Contact engagement
  const contactStats = useMemo(() => {
    const total = contacts.length;
    const needsFollowUp = contacts.filter(c => c.followUpNeeded).length;
    const recentlyContacted = contacts.filter(c => {
      try { return parseISO(c.lastContacted) >= thirtyDaysAgo; } catch { return false; }
    }).length;
    return { total, needsFollowUp, recentlyContacted };
  }, [contacts, thirtyDaysAgo]);

  // Reading stats
  const readingStats = useMemo(() => {
    const total = readingItems.length;
    const completed = readingItems.filter(r => r.status === 'completed').length;
    const inProgress = readingItems.filter(r => r.status === 'in-progress').length;
    return { total, completed, inProgress };
  }, [readingItems]);

  // Goal progress by area
  const goalsByArea = useMemo(() => {
    const areaMap: Record<string, { count: number; avgProgress: number }> = {};
    for (const g of goals) {
      if (!areaMap[g.area]) areaMap[g.area] = { count: 0, avgProgress: 0 };
      areaMap[g.area].count++;
      areaMap[g.area].avgProgress += g.progress;
    }
    return Object.entries(areaMap).map(([area, d]) => ({
      area: area.charAt(0).toUpperCase() + area.slice(1),
      progress: Math.round(d.avgProgress / d.count),
      count: d.count,
    }));
  }, [goals]);

  const fmt$ = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<Target size={18} />} label="Goal Progress" value={`${goalStats.avgProgress}%`} sub={`${goalStats.completed}/${goalStats.total} completed`} />
        <StatCard icon={<CheckSquare size={18} />} label="Todo Rate" value={`${todoStats.rate}%`} sub={`${todoStats.done} done, ${todoStats.overdue} overdue`} />
        <StatCard icon={<Heart size={18} />} label="Habit Rate (14d)" value={`${habitRate}%`} />
        <StatCard icon={<Users size={18} />} label="Contacts" value={contactStats.total} sub={`${contactStats.needsFollowUp} need follow-up`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Time allocation */}
        <div className="caesar-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Clock size={14} /> Time Allocation (30d)
          </h3>
          {timeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="hours" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No time blocks in the last 30 days</p>
          )}
        </div>

        {/* Goal progress by area */}
        <div className="caesar-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Target size={14} /> Goals by Area
          </h3>
          {goalsByArea.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={goalsByArea}>
                <XAxis dataKey="area" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="progress" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No goals yet</p>
          )}
        </div>

        {/* Mood & Energy trend */}
        <div className="caesar-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Heart size={14} /> Mood & Energy (14d)
          </h3>
          {moodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={moodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="mood" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="Mood" />
                <Line type="monotone" dataKey="energy" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Energy" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>No mood logs in the last 14 days</p>
          )}
        </div>

        {/* Financial snapshot */}
        <div className="caesar-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <DollarSign size={14} /> Financial (30d)
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Income</p>
              <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{fmt$(finStats.income)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Expense</p>
              <p className="text-lg font-bold" style={{ color: '#ef4444' }}>{fmt$(finStats.expense)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Net</p>
              <p className="text-lg font-bold" style={{ color: finStats.net >= 0 ? '#22c55e' : '#ef4444' }}>{fmt$(finStats.net)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Reading: {readingStats.inProgress} in progress, {readingStats.completed} completed</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Notes created: {notes.length} total</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
