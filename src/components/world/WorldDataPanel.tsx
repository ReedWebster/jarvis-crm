import { useMemo, useState } from 'react';
import type { Project, TodoItem, Goal, Contact, FinancialEntry, Course, Habit, HabitTracker, TimeBlock, TimeCategory, Note, Client } from '../../types';

export interface WorldViewAppData {
  projects: Project[];
  todos: TodoItem[];
  goals: Goal[];
  contacts: Contact[];
  financialEntries: FinancialEntry[];
  courses: Course[];
  habits: Habit[];
  habitTracker: HabitTracker[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  notes: Note[];
  clients: Client[];
}

const HEALTH_COLORS: Record<string, string> = { green: '#4ade80', yellow: '#fbbf24', red: '#ef4444' };
const PRIORITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#64748b' };

function SectionHeader({ title, count, expanded, onToggle }: { title: string; count?: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', color: '#c0d0e8',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {count !== undefined && (
          <span style={{
            fontSize: 10, background: 'rgba(80,140,220,0.18)', color: '#7EB8F8',
            borderRadius: 10, padding: '1px 7px', fontWeight: 600,
          }}>{count}</span>
        )}
        <span style={{ fontSize: 10, color: '#475569', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </span>
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />;
}

export function WorldDataPanel({ appData }: { appData: WorldViewAppData }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>({
    projects: true, todos: true, goals: true, contacts: false,
    financial: false, academic: false, habits: true, schedule: false,
  });

  const toggle = (key: string) => setSections(s => ({ ...s, [key]: !s[key] }));

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todoStats = useMemo(() => {
    const active = appData.todos.filter(t => t.status !== 'done');
    const overdue = active.filter(t => t.dueDate && t.dueDate < today).length;
    const high = active.filter(t => t.priority === 'high').length;
    const medium = active.filter(t => t.priority === 'medium').length;
    const low = active.filter(t => t.priority === 'low').length;
    return { total: active.length, overdue, high, medium, low };
  }, [appData.todos, today]);

  const activeGoals = useMemo(() =>
    appData.goals
      .filter(g => g.status === 'in-progress')
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5),
  [appData.goals]);

  const contactStats = useMemo(() => {
    const followUpsDue = appData.contacts.filter(c => c.followUpNeeded && c.followUpDate && c.followUpDate <= today).length;
    return { total: appData.contacts.length, followUpsDue };
  }, [appData.contacts, today]);

  const financialStats = useMemo(() => {
    const monthStart = today.slice(0, 7);
    const monthEntries = appData.financialEntries.filter(e => e.date.startsWith(monthStart));
    const income = monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expense = monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    return { income, expense, net: income - expense };
  }, [appData.financialEntries, today]);

  const academicAlerts = useMemo(() => {
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekStr = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`;
    const alerts: { course: string; title: string; due: string }[] = [];
    for (const c of appData.courses) {
      for (const a of c.assignments) {
        if (a.status !== 'submitted' && a.status !== 'graded' && a.dueDate >= today && a.dueDate <= weekStr) {
          alerts.push({ course: c.name, title: a.title, due: a.dueDate });
        }
      }
      for (const ex of c.examDates) {
        if (ex.date >= today && ex.date <= weekStr) {
          alerts.push({ course: c.name, title: ex.title, due: ex.date });
        }
      }
    }
    return alerts.sort((a, b) => a.due.localeCompare(b.due));
  }, [appData.courses, today]);

  const habitStats = useMemo(() => {
    const todayLog = appData.habitTracker.find(h => h.date === today);
    if (!todayLog || appData.habits.length === 0) return { done: 0, total: appData.habits.length, pct: 0 };
    const done = appData.habits.filter(h => todayLog.habits[h.id]).length;
    return { done, total: appData.habits.length, pct: Math.round((done / appData.habits.length) * 100) };
  }, [appData.habits, appData.habitTracker, today]);

  const upcomingBlocks = useMemo(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return appData.timeBlocks
      .filter(b => b.date === today && b.startTime >= hhmm)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 3)
      .map(b => {
        const cat = appData.timeCategories.find(c => c.id === b.categoryId);
        return { title: b.title || cat?.name || 'Block', time: b.startTime, color: cat?.color || '#64748b' };
      });
  }, [appData.timeBlocks, appData.timeCategories, today]);

  const activeProjects = useMemo(() =>
    appData.projects.filter(p => p.status === 'active'),
  [appData.projects]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Data Command Panel"
        style={{
          position: 'absolute', top: 14, left: open ? 298 : 14, zIndex: 25,
          background: open ? 'rgba(60,120,220,0.22)' : 'rgba(8,12,24,0.82)',
          border: `1px solid ${open ? 'rgba(100,160,240,0.35)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8, padding: '7px 11px', color: open ? '#7EB8F8' : '#8899B4',
          cursor: 'pointer', fontSize: 11, fontWeight: 600, backdropFilter: 'blur(10px)',
          letterSpacing: '0.04em', transition: 'all 0.25s ease',
        }}
      >
        {open ? '← Hide' : '⊞ Data'}
      </button>

      {/* Panel */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 20,
        width: 276, maxHeight: 'calc(100vh - 120px)',
        background: 'rgba(8,12,24,0.90)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
        overflowY: 'auto', overflowX: 'hidden',
        padding: open ? '10px 14px 14px' : '0',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(-12px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease, padding 0.2s ease',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 6, letterSpacing: '0.02em' }}>
          Command Center
        </div>

        {/* ── Projects ── */}
        <Divider />
        <SectionHeader title="Projects" count={activeProjects.length} expanded={sections.projects} onToggle={() => toggle('projects')} />
        {sections.projects && (
          <div style={{ marginBottom: 6 }}>
            {activeProjects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: HEALTH_COLORS[p.health] || '#64748b',
                  boxShadow: `0 0 6px ${HEALTH_COLORS[p.health] || '#64748b'}55`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>{p.name}</div>
                  {p.nextAction && (
                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nextAction}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Todos ── */}
        <Divider />
        <SectionHeader title="Todos" count={todoStats.total} expanded={sections.todos} onToggle={() => toggle('todos')} />
        {sections.todos && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {todoStats.overdue > 0 && (
              <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                {todoStats.overdue} overdue
              </span>
            )}
            {[['high', todoStats.high], ['medium', todoStats.medium], ['low', todoStats.low]].map(([pri, cnt]) => (
              cnt as number > 0 ? (
                <span key={pri as string} style={{ fontSize: 10, color: PRIORITY_COLORS[pri as string], opacity: 0.85 }}>
                  {cnt} {pri as string}
                </span>
              ) : null
            ))}
          </div>
        )}

        {/* ── Goals ── */}
        <Divider />
        <SectionHeader title="Goals" count={activeGoals.length} expanded={sections.goals} onToggle={() => toggle('goals')} />
        {sections.goals && (
          <div style={{ marginBottom: 6 }}>
            {activeGoals.map(g => (
              <div key={g.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: '#c0d0e8', lineHeight: 1.3, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.title}
                  </span>
                  <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0, marginLeft: 6 }}>{g.progress}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.3s ease',
                    width: `${g.progress}%`,
                    background: g.progress >= 75 ? '#4ade80' : g.progress >= 40 ? '#fbbf24' : '#64748b',
                  }} />
                </div>
              </div>
            ))}
            {activeGoals.length === 0 && <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>No active goals</div>}
          </div>
        )}

        {/* ── Contacts ── */}
        <Divider />
        <SectionHeader title="Contacts" count={contactStats.total} expanded={sections.contacts} onToggle={() => toggle('contacts')} />
        {sections.contacts && (
          <div style={{ marginBottom: 6, display: 'flex', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>{contactStats.total}</div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: contactStats.followUpsDue > 0 ? '#fbbf24' : '#4ade80', lineHeight: 1 }}>
                {contactStats.followUpsDue}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Follow-ups</div>
            </div>
          </div>
        )}

        {/* ── Financial ── */}
        <Divider />
        <SectionHeader title="Financial" expanded={sections.financial} onToggle={() => toggle('financial')} />
        {sections.financial && (
          <div style={{ marginBottom: 6, display: 'flex', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', lineHeight: 1 }}>
                ${financialStats.income.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Income</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>
                ${financialStats.expense.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expense</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: financialStats.net >= 0 ? '#4ade80' : '#ef4444', lineHeight: 1 }}>
                {financialStats.net >= 0 ? '+' : ''}${financialStats.net.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net</div>
            </div>
          </div>
        )}

        {/* ── Academic ── */}
        <Divider />
        <SectionHeader title="Academic" count={academicAlerts.length} expanded={sections.academic} onToggle={() => toggle('academic')} />
        {sections.academic && (
          <div style={{ marginBottom: 6 }}>
            {academicAlerts.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#fbbf24', flexShrink: 0 }}>{a.due.slice(5)}</span>
                <span style={{ fontSize: 10, color: '#c0d0e8', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.title}
                </span>
                <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>{a.course}</span>
              </div>
            ))}
            {academicAlerts.length === 0 && <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>No upcoming deadlines</div>}
          </div>
        )}

        {/* ── Habits ── */}
        <Divider />
        <SectionHeader title="Habits" expanded={sections.habits} onToggle={() => toggle('habits')} />
        {sections.habits && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#c0d0e8' }}>{habitStats.done}/{habitStats.total} complete</span>
              <span style={{ fontSize: 10, color: habitStats.pct === 100 ? '#4ade80' : '#64748b', fontWeight: 600 }}>{habitStats.pct}%</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, transition: 'width 0.3s ease',
                width: `${habitStats.pct}%`,
                background: habitStats.pct === 100 ? '#4ade80' : habitStats.pct >= 50 ? '#fbbf24' : '#ef4444',
              }} />
            </div>
          </div>
        )}

        {/* ── Schedule ── */}
        <Divider />
        <SectionHeader title="Schedule" count={upcomingBlocks.length} expanded={sections.schedule} onToggle={() => toggle('schedule')} />
        {sections.schedule && (
          <div style={{ marginBottom: 6 }}>
            {upcomingBlocks.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0, width: 36 }}>{b.time}</span>
                <span style={{ fontSize: 10, color: '#c0d0e8', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.title}
                </span>
              </div>
            ))}
            {upcomingBlocks.length === 0 && <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>No upcoming blocks</div>}
          </div>
        )}
      </div>
    </>
  );
}
