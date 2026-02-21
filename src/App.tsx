import React, { useState, useMemo } from 'react';
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
import { VoiceCommandLayer } from './components/voice/VoiceCommandLayer';
import { useLocalStorage } from './hooks/useLocalStorage';
import { ThemeContext, buildThemeValue, useThemeState } from './hooks/useTheme';
import { DEFAULT_STATE } from './data/defaultData';
import type {
  Identity, Project, TimeBlock, TimeCategory, Contact, Course,
  FinancialEntry, SavingsGoal, VentureFinancial, Goal, WeeklyReview,
  DecisionLog, ReadingItem, Candidate, Note, DailyEvent, Habit,
  HabitTracker, DailyMoodLog, StatusMode, TodoItem,
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
  recruitment: 'Recruitment',
  notes: 'Notes & Intelligence',
  todos: 'Todo List',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('command');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ─── Theme ─────────────────────────────────────────────────────────────────
  const { theme, toggle } = useThemeState();
  const themeCtx = useMemo(() => buildThemeValue(theme, toggle), [theme, toggle]);

  // ─── Persistent State ──────────────────────────────────────────────────────
  const [identity, setIdentity] = useLocalStorage<Identity>('jarvis:identity', DEFAULT_STATE.identity);
  const [projects, setProjects] = useLocalStorage<Project[]>('jarvis:projects', DEFAULT_STATE.projects);
  const [timeBlocks, setTimeBlocks] = useLocalStorage<TimeBlock[]>('jarvis:timeBlocks', DEFAULT_STATE.timeBlocks);
  const [timeCategories, setTimeCategories] = useLocalStorage<TimeCategory[]>('jarvis:timeCategories', DEFAULT_STATE.timeCategories);
  const [contacts, setContacts] = useLocalStorage<Contact[]>('jarvis:contacts', DEFAULT_STATE.contacts);
  const [courses, setCourses] = useLocalStorage<Course[]>('jarvis:courses', DEFAULT_STATE.courses);
  const [financialEntries, setFinancialEntries] = useLocalStorage<FinancialEntry[]>('jarvis:financialEntries', DEFAULT_STATE.financialEntries);
  const [savingsGoals, setSavingsGoals] = useLocalStorage<SavingsGoal[]>('jarvis:savingsGoals', DEFAULT_STATE.savingsGoals);
  const [ventureFinancials, setVentureFinancials] = useLocalStorage<VentureFinancial[]>('jarvis:ventureFinancials', DEFAULT_STATE.ventureFinancials);
  const [goals, setGoals] = useLocalStorage<Goal[]>('jarvis:goals', DEFAULT_STATE.goals);
  const [weeklyReviews, setWeeklyReviews] = useLocalStorage<WeeklyReview[]>('jarvis:weeklyReviews', DEFAULT_STATE.weeklyReviews);
  const [decisionLogs, setDecisionLogs] = useLocalStorage<DecisionLog[]>('jarvis:decisionLogs', DEFAULT_STATE.decisionLogs);
  const [readingItems, setReadingItems] = useLocalStorage<ReadingItem[]>('jarvis:readingItems', DEFAULT_STATE.readingItems);
  const [candidates, setCandidates] = useLocalStorage<Candidate[]>('jarvis:candidates', DEFAULT_STATE.candidates);
  const [notes, setNotes] = useLocalStorage<Note[]>('jarvis:notes', DEFAULT_STATE.notes);
  const [dailyEvents, setDailyEvents] = useLocalStorage<DailyEvent[]>('jarvis:dailyEvents', DEFAULT_STATE.dailyEvents);
  const [habits] = useLocalStorage<Habit[]>('jarvis:habits', DEFAULT_STATE.habits);
  const [habitTracker, setHabitTracker] = useLocalStorage<HabitTracker[]>('jarvis:habitTracker', DEFAULT_STATE.habitTracker);
  const [dailyMoodLogs, setDailyMoodLogs] = useLocalStorage<DailyMoodLog[]>('jarvis:dailyMoodLogs', DEFAULT_STATE.dailyMoodLogs);
  const [scratchpad, setScratchpad] = useLocalStorage<string>('jarvis:scratchpad', DEFAULT_STATE.scratchpad);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>('jarvis:todos', []);

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
            dailyMoodLogs={dailyMoodLogs}
            setDailyMoodLogs={setDailyMoodLogs}
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
        return <RecruitmentTracker candidates={candidates} setCandidates={setCandidates} />;
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
      default:
        return null;
    }
  };

  return (
    <ThemeContext.Provider value={themeCtx}>
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
        <main className="ml-0 md:ml-56 pt-14 min-h-screen">
          <div className="p-4 md:p-6 max-w-[1600px] animate-fade-in" key={activeSection}>
            {renderSection()}
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
    </ThemeContext.Provider>
  );
}
