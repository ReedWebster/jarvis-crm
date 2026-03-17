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
import { Calendar } from './components/time/TimeTracker';
import ContactsCRM from './components/contacts/ContactsCRM';
import AcademicTracker from './components/academic/AcademicTracker';
import { FinancialSnapshot } from './components/financial/FinancialSnapshot';
import { GoalHierarchy } from './components/goals/GoalHierarchy';
import { ReadingPipeline } from './components/reading/ReadingPipeline';
import { RecruitmentTracker } from './components/recruitment/RecruitmentTracker';
import { NotesHub } from './components/notes/NotesHub';
import { TodoList } from './components/todos/TodoList';
import { WorldView } from './components/world/WorldView';
import { DocHub } from './components/dochub/DocHub';
import { SocialHub } from './components/social/SocialHub';
import { MessagingHub } from './components/messaging/MessagingHub';
import { ABSHub, getABSContacts, INITIAL_MEMBERS } from './components/abs/ABSHub';
import type { ABSMember } from './components/abs/ABSHub';
import { VoiceCommandLayer } from './components/voice/VoiceCommandLayer';
import { JarvisInsightsPanel } from './components/intelligence/JarvisInsightsPanel';
import { QuickCaptureSheet } from './components/shared/QuickCaptureSheet';
import { useSupabaseStorage } from './hooks/useSupabaseStorage';
import { useWorkspaceStorage } from './hooks/useWorkspaceStorage';
import { TeamView } from './components/team/TeamView';
import { useNotifications } from './hooks/useNotifications';
import { computeInsights } from './utils/intelligence';
import { ThemeContext, buildThemeValue, useThemeState } from './hooks/useTheme';
import { ToastProvider } from './components/shared/Toast';
import { DEFAULT_STATE } from './data/defaultData';
import type {
  Identity, Project, TimeBlock, TimeCategory, Contact, Course,
  FinancialEntry, SavingsGoal, VentureFinancial, Goal, WeeklyReview,
  DecisionLog, ReadingItem, Candidate, Note, DailyEvent, Habit,
  HabitTracker, DailyMoodLog, StatusMode, TodoItem, Client,
  DocFolder, DocFile, SocialAccount, SocialPost, SocialApprovalItem,
} from './types';

const SECTION_TITLES: Record<NavSection, string> = {
  command: 'Daily Command Brief',
  identity: 'Core Identity',
  projects: 'Projects & Ventures',
  time: 'Calendar',
  contacts: 'Contacts CRM',
  academic: 'Academic Tracker',
  financial: 'Financial Snapshot',
  goals: 'Goal Hierarchy',
  reading: 'Reading Pipeline',
  recruitment: 'Clients',
  notes: 'Notes & Intelligence',
  todos: 'Todo List',
  world: 'World View',
  social: 'Social Command Center',
  dochub: 'Doc Hub',
  messaging: 'Messaging',
  abs: 'AI in Business Society',
};

// Route to TeamView for co-founders; all hooks live in MainApp so Rules of Hooks are satisfied
export default function App() {
  const isTeamView = new URLSearchParams(window.location.search).get('view') === 'team';
  if (isTeamView) return <TeamView />;
  return <MainApp />;
}

function MainApp() {
  const [activeSection, setActiveSection] = useState<NavSection>('command');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // roleChecked stays false until the ownership check resolves, blocking the full app render
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
      if (!session) setRoleChecked(true); // No session → no role check needed, show login
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setRoleChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Owner gate — blocks full app render until role is confirmed ──────────
  // Primary check: VITE_OWNER_EMAIL env var (baked in at build time — instant, no SQL needed).
  // Any signed-in user whose email doesn't match is redirected to ?view=team immediately.
  useEffect(() => {
    if (!session?.user.email) return;
    setRoleChecked(false); // Hold the spinner while we check

    const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.trim().toLowerCase();
    const userEmail = session.user.email.trim().toLowerCase();

    if (ownerEmail) {
      // Fast path — no database call needed
      if (userEmail !== ownerEmail) {
        window.location.replace(window.location.origin + '/?view=team');
        // Do NOT setRoleChecked — page is navigating away
      } else {
        setRoleChecked(true); // Confirmed owner
      }
      return;
    }

    // Fallback (env var not set): use workspace_data table
    const uid = session.user.id;
    supabase
      .from('workspace_data')
      .select('value')
      .eq('key', 'workspace_config')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Table doesn't exist yet — assume owner (workspace not yet set up)
          setRoleChecked(true);
          return;
        }
        if (!data?.value) {
          // No owner on record — register this user and proceed
          supabase.from('workspace_data').upsert(
            { key: 'workspace_config', value: { owner_user_id: uid }, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
          );
          setRoleChecked(true);
        } else {
          const cfg = data.value as { owner_user_id?: string };
          if (cfg.owner_user_id && cfg.owner_user_id !== uid) {
            window.location.replace(window.location.origin + '/?view=team');
          } else {
            setRoleChecked(true);
          }
        }
      });
  }, [session?.user.email, session?.user.id]);

  // ─── Theme ─────────────────────────────────────────────────────────────────
  const { theme, toggle } = useThemeState();
  const themeCtx = useMemo(() => buildThemeValue(theme, toggle), [theme, toggle]);

  // ─── Persistent State (synced to Supabase) ────────────────────────────────
  const [identity, setIdentity] = useSupabaseStorage<Identity>('jarvis:identity', DEFAULT_STATE.identity);
  const [projects, setProjects] = useSupabaseStorage<Project[]>('jarvis:projects', DEFAULT_STATE.projects);
  const [timeBlocks, setTimeBlocks] = useSupabaseStorage<TimeBlock[]>('jarvis:timeBlocks', DEFAULT_STATE.timeBlocks);
  const [timeCategories, setTimeCategories] = useSupabaseStorage<TimeCategory[]>('jarvis:timeCategories', DEFAULT_STATE.timeCategories);
  const [contacts, setContacts] = useSupabaseStorage<Contact[]>('jarvis:contacts', DEFAULT_STATE.contacts);
  const [contactTags, setContactTags] = useSupabaseStorage<Array<{ name: string; color: string }>>('jarvis:contactTags', DEFAULT_STATE.contactTags);
  const [courses, setCourses] = useSupabaseStorage<Course[]>('jarvis:courses', DEFAULT_STATE.courses);
  const [financialEntries, setFinancialEntries] = useSupabaseStorage<FinancialEntry[]>('jarvis:financialEntries', DEFAULT_STATE.financialEntries);
  const [savingsGoals, setSavingsGoals] = useSupabaseStorage<SavingsGoal[]>('jarvis:savingsGoals', DEFAULT_STATE.savingsGoals);
  const [ventureFinancials, setVentureFinancials] = useSupabaseStorage<VentureFinancial[]>('jarvis:ventureFinancials', DEFAULT_STATE.ventureFinancials);
  const [goals, setGoals] = useSupabaseStorage<Goal[]>('jarvis:goals', DEFAULT_STATE.goals);
  const [weeklyReviews, setWeeklyReviews] = useSupabaseStorage<WeeklyReview[]>('jarvis:weeklyReviews', DEFAULT_STATE.weeklyReviews);
  const [decisionLogs, setDecisionLogs] = useSupabaseStorage<DecisionLog[]>('jarvis:decisionLogs', DEFAULT_STATE.decisionLogs);
  const [readingItems, setReadingItems] = useSupabaseStorage<ReadingItem[]>('jarvis:readingItems', DEFAULT_STATE.readingItems);
  const [candidates, setCandidates] = useSupabaseStorage<Candidate[]>('jarvis:candidates', DEFAULT_STATE.candidates);
  // Clients are workspace-shared — all team members read/write the same data
  const [clients, setClients] = useWorkspaceStorage<Client[]>('clients', []);
  const [notes, setNotes] = useSupabaseStorage<Note[]>('jarvis:notes', DEFAULT_STATE.notes);
  const [dailyEvents, setDailyEvents] = useSupabaseStorage<DailyEvent[]>('jarvis:dailyEvents', DEFAULT_STATE.dailyEvents);
  const [habits] = useSupabaseStorage<Habit[]>('jarvis:habits', DEFAULT_STATE.habits);
  const [habitTracker, setHabitTracker] = useSupabaseStorage<HabitTracker[]>('jarvis:habitTracker', DEFAULT_STATE.habitTracker);
  const [dailyMoodLogs, setDailyMoodLogs] = useSupabaseStorage<DailyMoodLog[]>('jarvis:dailyMoodLogs', DEFAULT_STATE.dailyMoodLogs);
  const [scratchpad, setScratchpad] = useSupabaseStorage<string>('jarvis:scratchpad', DEFAULT_STATE.scratchpad);
  const [todos, setTodos] = useSupabaseStorage<TodoItem[]>('jarvis:todos', []);
  const [docFolders, setDocFolders] = useSupabaseStorage<DocFolder[]>('jarvis:docFolders', []);
  const [docFiles, setDocFiles] = useSupabaseStorage<DocFile[]>('jarvis:docFiles', []);
  const [navOrder, setNavOrder] = useSupabaseStorage<NavSection[]>('jarvis:navOrder', []);
  const [socialAccounts, setSocialAccounts] = useSupabaseStorage<SocialAccount[]>('jarvis:socialAccounts', []);
  const [socialPosts, setSocialPosts] = useSupabaseStorage<SocialPost[]>('jarvis:socialPosts', []);
  const [socialApprovals, setSocialApprovals] = useSupabaseStorage<SocialApprovalItem[]>('jarvis:socialApprovals', []);
  const [morningBriefing, setMorningBriefing] = useSupabaseStorage<import('./types').MorningBriefing | null>('jarvis:morning_briefing', null);
  const [absMembers, setAbsMembers] = useSupabaseStorage<ABSMember[]>('jarvis:absMembers', INITIAL_MEMBERS);
  const [districtTagMap, setDistrictTagMap] = useSupabaseStorage<Record<string, string>>('jarvis:districtTagMap', {
    'Financial Core': 'Investor',   'Central Tower': 'Investor',    'Capital Row': 'Investor',
    'Exchange Sq': 'Client',        'Commerce Plaza': 'Partner',    'Metro Center': 'Colleague',
    'Skyline Block': 'Investor',    'Civic Hub': 'Colleague',       'Crown Heights': 'Mentor',
    'Midtown West': 'Client',       'Uptown East': 'Recruit',       'Gallery Row': 'Partner',
    'The Arcade': 'Client',         'Merchant Row': 'Partner',      'Harbor Gate': 'Colleague',
    'River Bend': 'Mentor',         'Lakeside': 'Friend',           'Park Ave': 'Mentor',
    'BYU Campus': 'Professor',      'Arts Quarter': 'Friend',       'Market Street': 'Colleague',
    'Innovation Mile': 'Recruit',   'Craft District': 'Friend',     'Bricktown': 'Colleague',
    'The Yards': 'Recruit',         'Riverside': 'Other',           'Garden Block': 'Friend',
    'Oak St': 'Family',             'Maple Ave': 'Family',          'Pine Court': 'Family',
    'Birch Lane': 'Family',         'Cedar Row': 'Family',          'Elm Park': 'Family',
    'Chestnut Way': 'Family',       'Aspen Hill': 'Family',         'Valley View': 'Family',
    'City Park': 'Other',           'Memorial Green': 'Other',      'Botanical Garden': 'Other',
    'Riverside Park': 'Other',      'Central Commons': 'Other',
    'Harbor': 'Other',              'Bay Front': 'Other',           'Marina': 'Other',           'River District': 'Other',
  });

  // Bundled read-only data for WorldView data panel
  const worldAppData = useMemo(() => ({
    projects, todos, goals, contacts, financialEntries,
    courses, habits, habitTracker, timeBlocks, timeCategories, notes,
  }), [projects, todos, goals, contacts, financialEntries,
       courses, habits, habitTracker, timeBlocks, timeCategories, notes]);

  // One-time migration: if workspace clients is empty and old user_data has clients, copy them over
  useEffect(() => {
    if (!session?.user.id || clients.length > 0) return;
    const uid = session.user.id;
    supabase
      .from('user_data')
      .select('value')
      .eq('user_id', uid)
      .eq('key', 'jarvis:clients')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.value || !Array.isArray(data.value) || data.value.length === 0) return;
        // Workspace is still empty — migrate old clients across
        supabase
          .from('workspace_data')
          .upsert({ key: 'clients', value: data.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
          .then(() => { setClients(data.value as Client[]); });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  // One-time migration: tag any contact with last name "Webster" as Family
  useEffect(() => {
    if (contacts.length === 0) return;
    const needsUpdate = contacts.some(c => {
      const lastName = c.name.trim().split(/\s+/).pop() ?? '';
      return lastName.toLowerCase() === 'webster' && !c.tags.includes('Family');
    });
    if (!needsUpdate) return;
    setContacts(prev => prev.map(c => {
      const lastName = c.name.trim().split(/\s+/).pop() ?? '';
      if (lastName.toLowerCase() === 'webster' && !c.tags.includes('Family')) {
        return { ...c, tags: [...c.tags.filter(t => t !== 'Family'), 'Family'] as import('./types').ContactTag[] };
      }
      return c;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]);

  // One-time migration: make Reed top-level president, all execs report to Reed
  useEffect(() => {
    if (absMembers.length === 0) return;
    const reed = absMembers.find(m => m.id === 'reed');
    if (!reed || reed.reportsTo === null) return; // already applied
    setAbsMembers(prev => prev.map(m => {
      if (m.id === 'reed') return { ...m, reportsTo: null };
      if (m.reportsTo === 'luke') return { ...m, reportsTo: 'reed' };
      if (m.id === 'luke') return { ...m, reportsTo: 'reed' };
      return m;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absMembers.length]);

  // One-time migration: seed ABS org members as contacts
  useEffect(() => {
    if (contacts.length === 0) return;
    if (contacts.some(c => c.id === 'abs_luke')) return;
    setContacts(prev => [...prev, ...getABSContacts()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]);

  // One-time migration: inject M COM 320-010 course from Canvas calendar feed if not already present
  useEffect(() => {
    if (courses.length === 0) return;
    if (courses.some(c => c.id === 'course_mcom320')) return;
    setCourses(prev => [DEFAULT_STATE.courses[0], ...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses.length]);

  const handleStatusChange = (status: StatusMode) => {
    setIdentity(prev => ({ ...prev, status }));
  };

  // ─── Intelligence + Notifications ─────────────────────────────────────────
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [insightsPanelOpen, setInsightsPanelOpen] = useState(false);

  const insightsData = useMemo(() => ({
    contacts, timeBlocks, timeCategories, goals, todos,
    financialEntries, savingsGoals, readingItems, notes,
    dailyMoodLogs, habits, habitTracker,
  }), [contacts, timeBlocks, timeCategories, goals, todos,
       financialEntries, savingsGoals, readingItems, notes,
       dailyMoodLogs, habits, habitTracker]);

  const allInsights = useMemo(() => computeInsights(insightsData), [insightsData]);
  const urgentCount = useMemo(
    () => allInsights.filter(i => i.priority === 'urgent' || i.priority === 'high').length,
    [allInsights]
  );

  const { requestPermission } = useNotifications(allInsights);

  const renderSection = () => {
    switch (activeSection) {
      case 'command':
        return (
          <DailyCommandBrief
            identity={identity}
            timeBlocks={timeBlocks}
            timeCategories={timeCategories}
            onNavigateToCalendar={() => setActiveSection('time')}
            habits={habits}
            habitTracker={habitTracker}
            setHabitTracker={setHabitTracker}
            notes={notes}
            setNotes={setNotes}
            todos={todos}
            setTodos={setTodos}
            morningBriefing={morningBriefing}
            onRefreshBriefing={setMorningBriefing}
          />
        );
      case 'identity':
        return <CoreIdentityPanel identity={identity} setIdentity={setIdentity} />;
      case 'projects':
        return <ProjectsTracker projects={projects} setProjects={setProjects} onNavigate={setActiveSection} />;
      case 'time':
        return (
          <Calendar
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
        return (
          <ContactsCRM
            contacts={contacts}
            setContacts={setContacts}
            contactTags={contactTags}
            setContactTags={setContactTags}
            projects={projects}
            onNavigateToNetworking={() => setActiveSection('world')}
          />
        );
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
      case 'world':
        return (
          <WorldView
            contactTags={contactTags}
            districtTagMap={districtTagMap}
            onDistrictTagMapChange={setDistrictTagMap}
            appData={worldAppData}
            onNavigateToSection={(section) => setActiveSection(section as typeof activeSection)}
          />
        );
      case 'social':
        return (
          <SocialHub
            contacts={contacts}
            socialAccounts={socialAccounts}
            setSocialAccounts={setSocialAccounts}
            socialPosts={socialPosts}
            setSocialPosts={setSocialPosts}
            approvals={socialApprovals}
            setApprovals={setSocialApprovals}
          />
        );
      case 'dochub':
        return (
          <DocHub
            folders={docFolders}
            setFolders={setDocFolders}
            files={docFiles}
            setFiles={setDocFiles}
          />
        );
      case 'messaging':
        return <MessagingHub contacts={contacts} />;
      case 'abs':
        return <ABSHub members={absMembers} setMembers={setAbsMembers} />;
      default:
        return null;
    }
  };

  // Auth gate — spinner until both auth AND role check resolve
  if (authLoading || !roleChecked) {
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
          navOrder={navOrder}
          onNavOrderChange={order => setNavOrder(() => order)}
          onThemeToggle={toggle}
          isDark={theme === 'dark'}
          theme={theme}
        />

        <TopBar
          identity={identity}
          sectionTitle={SECTION_TITLES[activeSection]}
          onStatusChange={handleStatusChange}
          onThemeToggle={toggle}
          isDark={theme === 'dark'}
          theme={theme}
          onMenuOpen={() => setMobileSidebarOpen(true)}
          urgentCount={urgentCount}
          onNotificationClick={() => { requestPermission(); setInsightsPanelOpen(true); }}
          onNavigate={setActiveSection}
        />

        {/* Main Content */}
        <main
          className="ml-0 md:ml-56 min-h-screen overflow-x-hidden"
          style={{
            paddingTop: 'calc(56px + env(safe-area-inset-top))',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <div
            className={activeSection === 'world'
              ? 'animate-fade-in h-full overflow-hidden'
              : 'p-3 sm:p-4 md:p-6 max-w-[1600px] mx-auto w-full animate-fade-in'}
            style={activeSection === 'world'
              ? { height: 'calc(100dvh - 56px - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }
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

        {/* J.A.R.V.I.S. Insights Panel */}
        <JarvisInsightsPanel
          data={insightsData}
          onNavigate={setActiveSection}
          onRequestNotificationPermission={requestPermission}
          externalOpen={insightsPanelOpen}
          onExternalOpenChange={setInsightsPanelOpen}
        />

        {/* Mobile Quick Capture FAB — safe-area aware */}
        <button
          onClick={() => setQuickCaptureOpen(true)}
          className="fixed md:hidden z-[60] w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 touch-target-min"
          style={{
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
            left: 'calc(1rem + env(safe-area-inset-left))',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
            color: '#fff',
            fontSize: 24,
            fontWeight: 300,
          }}
          aria-label="Quick capture"
        >
          +
        </button>

        {/* Quick Capture Sheet */}
        <QuickCaptureSheet
          isOpen={quickCaptureOpen}
          onClose={() => setQuickCaptureOpen(false)}
          timeCategories={timeCategories}
          contacts={contacts}
          onAddTimeBlock={(b) => setTimeBlocks(prev => [...prev, b])}
          onAddTodo={(t) => setTodos(prev => [...prev, t])}
          onAddNote={(n) => setNotes(prev => [...prev, n])}
          onAddContact={(c) => setContacts(prev => [...prev, c])}
          onAddEvent={(e) => setDailyEvents(prev => [...prev, e])}
        />
      </div>
      </ToastProvider>
    </ThemeContext.Provider>
  );
}
