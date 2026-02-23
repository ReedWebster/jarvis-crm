import React, { useState, useMemo, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';

// Error boundary — prevents a single section crash from blanking the whole app
class SectionErrorBoundary extends Component<{ children: ReactNode; section: string }, { error: Error | null }> {
  constructor(props: { children: ReactNode; section: string }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[LITEHOUSE] Section "${this.props.section}" crashed:`, error, info);
  }
  componentDidUpdate(prev: { section: string }) {
    if (prev.section !== this.props.section && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Something went wrong in this section.</p>
          <p className="text-xs font-mono mb-4" style={{ color: '#ef4444' }}>{this.state.error.message}</p>
          <button className="caesar-btn-ghost text-xs" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { LoginPage } from './components/auth/LoginPage';
import { Sidebar, type NavSection } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { GlobalSearch } from './components/shared/GlobalSearch';
import DailyCommandBrief from './components/dashboard/DailyCommandBrief';
import CoreIdentityPanel from './components/identity/CoreIdentityPanel';
import { ProjectsTracker } from './components/projects/ProjectsTracker';
import { TimeTracker } from './components/time/TimeTracker';
import ContactsCRM from './components/contacts/ContactsCRM';
import AcademicTracker from './components/academic/AcademicTracker';
import { FinancialSnapshot } from './components/financial/FinancialSnapshot';
import { GoalHierarchy } from './components/goals/GoalHierarchy';
import { ReadingPipeline } from './components/reading/ReadingPipeline';
import { RecruitmentTracker } from './components/recruitment/RecruitmentTracker';
import { NotesHub } from './components/notes/NotesHub';
import { TodoList } from './components/todos/TodoList';
import { NetworkingMap } from './components/networking/NetworkingMap';
import { VoiceCommandLayer } from './components/voice/VoiceCommandLayer';
import { useSupabaseStorage } from './hooks/useSupabaseStorage';
import { ThemeContext, buildThemeValue, useThemeState } from './hooks/useTheme';
import { ToastProvider } from './components/shared/Toast';
import { DEFAULT_STATE } from './data/defaultData';
import type {
  Identity, Project, TimeBlock, TimeCategory, Contact, Course,
  FinancialEntry, SavingsGoal, VentureFinancial, Goal, WeeklyReview,
  DecisionLog, ReadingItem, Candidate, Note, DailyEvent, Habit,
  HabitTracker, DailyMoodLog, StatusMode, TodoItem, Client,
} from './types';

const SECTION_TITLES: Record<NavSection, string> = {
  command: 'Daily Command Brief',
  identity: 'Core Identity',
  projects: 'Projects & Ventures',
  time: 'Time Tracker',
  contacts: 'Contacts CRM',
  academic: 'Academic Tracker',
  financial: 'Financial Snapshot',
  goals: 'Goal Hierarchy',
  reading: 'Reading Pipeline',
  recruitment: 'Clients',
  notes: 'Notes & Intelligence',
  todos: 'Todo List',
  networking: 'Networking Map',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('command');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Theme ─────────────────────────────────────────────────────────────────
  const { theme, toggle } = useThemeState();
  const themeCtx = useMemo(() => buildThemeValue(theme, toggle), [theme, toggle]);

  // ─── Persistent State (synced to Supabase) ────────────────────────────────
  const [identity, setIdentity] = useSupabaseStorage<Identity>('jarvis:identity', DEFAULT_STATE.identity);
  const [projects, setProjects] = useSupabaseStorage<Project[]>('jarvis:projects', DEFAULT_STATE.projects);
  const [timeBlocks, setTimeBlocks] = useSupabaseStorage<TimeBlock[]>('jarvis:timeBlocks', DEFAULT_STATE.timeBlocks);
  const [timeCategories, setTimeCategories] = useSupabaseStorage<TimeCategory[]>('jarvis:timeCategories', DEFAULT_STATE.timeCategories);
  const [contacts, setContacts] = useSupabaseStorage<Contact[]>('jarvis:contacts', DEFAULT_STATE.contacts);
  const [courses, setCourses] = useSupabaseStorage<Course[]>('jarvis:courses', DEFAULT_STATE.courses);
  const [financialEntries, setFinancialEntries] = useSupabaseStorage<FinancialEntry[]>('jarvis:financialEntries', DEFAULT_STATE.financialEntries);
  const [savingsGoals, setSavingsGoals] = useSupabaseStorage<SavingsGoal[]>('jarvis:savingsGoals', DEFAULT_STATE.savingsGoals);
  const [ventureFinancials, setVentureFinancials] = useSupabaseStorage<VentureFinancial[]>('jarvis:ventureFinancials', DEFAULT_STATE.ventureFinancials);
  const [goals, setGoals] = useSupabaseStorage<Goal[]>('jarvis:goals', DEFAULT_STATE.goals);
  const [weeklyReviews, setWeeklyReviews] = useSupabaseStorage<WeeklyReview[]>('jarvis:weeklyReviews', DEFAULT_STATE.weeklyReviews);
  const [decisionLogs, setDecisionLogs] = useSupabaseStorage<DecisionLog[]>('jarvis:decisionLogs', DEFAULT_STATE.decisionLogs);
  const [readingItems, setReadingItems] = useSupabaseStorage<ReadingItem[]>('jarvis:readingItems', DEFAULT_STATE.readingItems);
  const [candidates, setCandidates] = useSupabaseStorage<Candidate[]>('jarvis:candidates', DEFAULT_STATE.candidates);
  const [clients, setClients] = useSupabaseStorage<Client[]>('jarvis:clients', []);
  const [notes, setNotes] = useSupabaseStorage<Note[]>('jarvis:notes', DEFAULT_STATE.notes);
  const [dailyEvents, setDailyEvents] = useSupabaseStorage<DailyEvent[]>('jarvis:dailyEvents', DEFAULT_STATE.dailyEvents);
  const [habits] = useSupabaseStorage<Habit[]>('jarvis:habits', DEFAULT_STATE.habits);
  const [habitTracker, setHabitTracker] = useSupabaseStorage<HabitTracker[]>('jarvis:habitTracker', DEFAULT_STATE.habitTracker);
  const [dailyMoodLogs, setDailyMoodLogs] = useSupabaseStorage<DailyMoodLog[]>('jarvis:dailyMoodLogs', DEFAULT_STATE.dailyMoodLogs);
  const [scratchpad, setScratchpad] = useSupabaseStorage<string>('jarvis:scratchpad', DEFAULT_STATE.scratchpad);
  const [todos, setTodos] = useSupabaseStorage<TodoItem[]>('jarvis:todos', []);

  const handleStatusChange = (status: StatusMode) => {
    setIdentity(prev => ({ ...prev, status }));
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'command':
        return (
          <DailyCommandBrief
            identity={identity}
            goals={goals}
            dailyEvents={dailyEvents}
            setDailyEvents={setDailyEvents}
            habits={habits}
            habitTracker={habitTracker}
            setHabitTracker={setHabitTracker}
            notes={notes}
            setNotes={setNotes}
            todos={todos}
            setTodos={setTodos}
          />
        );
      case 'identity':
        return <CoreIdentityPanel identity={identity} setIdentity={setIdentity} />;
      case 'projects':
        return <ProjectsTracker projects={projects} setProjects={setProjects} />;
      case 'time':
        return (
          <TimeTracker
            timeBlocks={timeBlocks}
            setTimeBlocks={setTimeBlocks}
            timeCategories={timeCategories}
            setTimeCategories={setTimeCategories}
            notes={notes}
            setNotes={setNotes}
            todos={todos}
          />
        );
      case 'contacts':
        return <ContactsCRM contacts={contacts} setContacts={setContacts} />;
      case 'academic':
        return <AcademicTracker courses={courses} setCourses={setCourses} />;
      case 'financial':
        return (
          <FinancialSnapshot
            financialEntries={financialEntries}
            setFinancialEntries={setFinancialEntries}
            savingsGoals={savingsGoals}
            setSavingsGoals={setSavingsGoals}
            ventureFinancials={ventureFinancials}
            setVentureFinancials={setVentureFinancials}
          />
        );
      case 'goals':
        return (
          <GoalHierarchy
            goals={goals}
            setGoals={setGoals}
            weeklyReviews={weeklyReviews}
            setWeeklyReviews={setWeeklyReviews}
            decisionLogs={decisionLogs}
            setDecisionLogs={setDecisionLogs}
            projects={projects}
          />
        );
      case 'reading':
        return <ReadingPipeline readingItems={readingItems} setReadingItems={setReadingItems} />;
      case 'recruitment':
        return <RecruitmentTracker clients={clients} setClients={setClients} />;
      case 'notes':
        return (
          <NotesHub
            notes={notes}
            setNotes={setNotes}
            scratchpad={scratchpad}
            setScratchpad={setScratchpad}
          />
        );
      case 'todos':
        return (
          <TodoList
            todos={todos}
            setTodos={setTodos}
            contacts={contacts}
            projects={projects}
            goals={goals}
            courses={courses}
            notes={notes}
            readingItems={readingItems}
            candidates={candidates}
          />
        );
      case 'networking':
        return (
          <NetworkingMap
            contacts={contacts}
            setContacts={setContacts}
            projects={projects}
            onNavigateToCRM={() => setActiveSection('contacts')}
          />
        );
      default:
        return null;
    }
  };

  // Auth gate — show loading spinner, then login, then app
  if (authLoading) {
    return (
      <ThemeContext.Provider value={themeCtx}>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
          <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--text-muted)] rounded-full animate-spin" />
        </div>
      </ThemeContext.Provider>
    );
  }

  if (!session) {
    return (
      <ThemeContext.Provider value={themeCtx}>
        <LoginPage />
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeCtx}>
      <ToastProvider>
      <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg)' }}>
        <Sidebar
          active={activeSection}
          onNavigate={setActiveSection}
          onSearch={() => setSearchOpen(true)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <TopBar
          identity={identity}
          sectionTitle={SECTION_TITLES[activeSection]}
          onStatusChange={handleStatusChange}
          onThemeToggle={toggle}
          isDark={theme === 'dark'}
          onMenuOpen={() => setMobileSidebarOpen(true)}
        />

        {/* Main Content */}
        <main
          className="ml-0 md:ml-56 min-h-screen overflow-x-hidden"
          style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}
        >
          <div
            className={activeSection === 'networking'
              ? 'animate-fade-in'
              : 'p-4 md:p-6 max-w-[1600px] animate-fade-in'}
            style={activeSection === 'networking'
              ? { height: 'calc(100dvh - 56px - env(safe-area-inset-top))' }
              : undefined}
            key={activeSection}
          >
            <SectionErrorBoundary section={activeSection}>
              {renderSection()}
            </SectionErrorBoundary>
          </div>
        </main>

        {/* Global Search */}
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={(section) => { setActiveSection(section); }}
          contacts={contacts}
          projects={projects}
          goals={goals}
          notes={notes}
        />

        {/* Voice Command Layer */}
        <VoiceCommandLayer
          onNavigate={setActiveSection}
          activeSection={activeSection}
          identity={identity}
          contacts={contacts}
          projects={projects}
          goals={goals}
          notes={notes}
          timeBlocks={timeBlocks}
          timeCategories={timeCategories}
          habits={habits}
          habitTracker={habitTracker}
          courses={courses}
          financialEntries={financialEntries}
          ventureFinancials={ventureFinancials}
          readingItems={readingItems}
          dailyEvents={dailyEvents}
          scratchpad={scratchpad}
          setNotes={setNotes}
          setTimeBlocks={setTimeBlocks}
          setGoals={setGoals}
          setContacts={setContacts}
          setHabitTracker={setHabitTracker}
          setReadingItems={setReadingItems}
          setScratchpad={setScratchpad}
          setDailyEvents={setDailyEvents}
        />
      </div>
      </ToastProvider>
    </ThemeContext.Provider>
  );
}
