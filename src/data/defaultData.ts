import type { AppState } from '../types';
import { todayStr } from '../utils';

const today = todayStr();

// ─── Seed Version ─────────────────────────────────────────────────────────────
// Bump this string to force a re-seed on next load (clears old localStorage data)
const SEED_VERSION = 'jarvis:seed-v1';

// ─── Seed State ───────────────────────────────────────────────────────────────
export const DEFAULT_STATE: AppState = {
  identity: {
    name: 'Reed Webster',
    role: 'Founder & Executive',
    titles: [
      'Chief of Staff',
      'Founder',
      'BYU Student',
      'Property Manager',
    ],
    photoUrl: '',
    missionStatement:
      'Build systems that scale. Execute with precision. Leave everything better than I found it.',
    priorities: [
      'Launch C.A.E.S.A.R. as my daily operating system',
      'Scale Vanta Marketing Co. to first paying clients',
      'Finish semester strong across all BYU courses',
    ],
    status: 'deep-work',
  },

  projects: [
    {
      id: 'proj_1',
      name: 'AI in Business Society',
      status: 'active',
      health: 'green',
      nextAction: 'Plan next meeting agenda and recruitment drive',
      dueDate: '2026-02-28',
      keyContacts: ['Faculty Advisor', 'VP Operations'],
      notes:
        'BYU student org focused on AI applications in business contexts. Focus on growing membership and speaker pipeline.',
      links: '',
      createdAt: today,
    },
    {
      id: 'proj_2',
      name: 'Vanta Marketing Co.',
      status: 'active',
      health: 'yellow',
      nextAction: 'Finalize financial statements and pitch first client',
      dueDate: '2026-03-01',
      keyContacts: ['Prospective Client: TBD', 'Design Lead'],
      notes:
        'Marketing venture focused on client acquisition and brand strategy. Financial statements completed — income statement and balance sheet ready.',
      links: '',
      createdAt: today,
    },
    {
      id: 'proj_3',
      name: 'Rock Canyon AI',
      status: 'active',
      health: 'green',
      nextAction: 'Define service offerings and build case studies',
      dueDate: '2026-03-15',
      keyContacts: ['Target: Local SMB', 'Technical Lead'],
      notes:
        'AI consulting and solutions venture. Financial statements processed — strong foundation established.',
      links: '',
      createdAt: today,
    },
    {
      id: 'proj_4',
      name: 'Arden Place Apartments',
      status: 'active',
      health: 'yellow',
      nextAction: 'Follow up on balcony storage violations and review digital lock upgrade options',
      dueDate: '2026-02-25',
      keyContacts: ['Owner/Landlord', 'Maintenance Tech'],
      notes:
        'Property management operations in Orem, UT. Competitive analysis against Orem/Provo complexes in progress. Digital lock modernization project scoped.',
      links: '',
      createdAt: today,
    },
    {
      id: 'proj_5',
      name: 'C.A.E.S.A.R. System',
      status: 'active',
      health: 'green',
      nextAction: 'Deploy v1 and begin daily use',
      dueDate: '2026-02-22',
      keyContacts: ['Reed Webster (Owner)'],
      notes:
        'Personal Jarvis-style AI chief of staff and CRM platform. Inspired by Iron Man\'s JARVIS. Voice commands and streaming responses in roadmap.',
      links: '',
      createdAt: today,
    },
  ],

  timeCategories: [
    { id: 'cat_1', name: 'Deep Work — Ventures', color: '#111111' },
    { id: 'cat_2', name: 'Classes & Academics', color: '#333333' },
    { id: 'cat_3', name: 'Property Management', color: '#444444' },
    { id: 'cat_4', name: 'AI in Business Society', color: '#555555' },
    { id: 'cat_5', name: 'Vanta Marketing Co.', color: '#666666' },
    { id: 'cat_6', name: 'Rock Canyon AI', color: '#777777' },
    { id: 'cat_7', name: 'Personal & Faith', color: '#888888' },
    { id: 'cat_8', name: 'Fitness & Health', color: '#999999' },
    { id: 'cat_9', name: 'Admin & Misc', color: '#aaaaaa' },
  ],

  timeBlocks: [],

  contacts: [
    {
      id: 'ct-001',
      name: 'Faculty Advisor',
      email: 'advisor@byu.edu',
      phone: '',
      company: 'BYU',
      relationship: 'Mentor',
      tags: ['Professor', 'Mentor'],
      lastContacted: today,
      followUpNeeded: false,
      notes: 'Faculty sponsor for AI in Business Society.',
      interactions: [],
      linkedProjects: ['proj_1'],
    },
  ],

  courses: [
    {
      id: 'course_1',
      name: 'Business Strategy & Governance',
      professor: 'TBD',
      credits: 3,
      currentGrade: 95,
      targetGrade: 97,
      color: 'var(--text-muted)',
      assignments: [
        {
          id: 'asgn_1_1',
          courseId: 'course_1',
          title: 'Article on governance for bootstrapped founders',
          status: 'not-started',
          dueDate: '2026-02-26',
          grade: undefined,
          weight: 15,
          notes: 'Focus on governance structures suitable for early-stage ventures',
        },
      ],
      examDates: [],
    },
    {
      id: 'course_2',
      name: 'Chinese Literature',
      professor: 'TBD',
      credits: 3,
      currentGrade: 92,
      targetGrade: 95,
      color: 'var(--text-muted)',
      assignments: [
        {
          id: 'asgn_2_1',
          courseId: 'course_2',
          title: 'Analysis of classical text — apply literary theory with proper citations',
          status: 'not-started',
          dueDate: '2026-02-27',
          grade: undefined,
          weight: 20,
          notes: 'Use at least 3 scholarly sources. MLA format.',
        },
      ],
      examDates: [],
    },
    {
      id: 'course_3',
      name: 'Religious Studies',
      professor: 'TBD',
      credits: 2,
      currentGrade: 95,
      targetGrade: 97,
      color: 'var(--text-secondary)',
      assignments: [
        {
          id: 'asgn_3_1',
          courseId: 'course_3',
          title: 'Response paper on assigned LDS talk',
          status: 'not-started',
          dueDate: '2026-02-25',
          grade: undefined,
          weight: 10,
          notes: 'Personal reflection + doctrinal analysis. 2-3 pages.',
        },
      ],
      examDates: [],
    },
  ],

  financialEntries: [],

  savingsGoals: [
    {
      id: 'sg_1',
      name: 'Emergency Fund',
      target: 5000,
      current: 0,
      deadline: '2026-12-31',
      color: 'var(--text-secondary)',
    },
    {
      id: 'sg_2',
      name: 'Venture Capital Reserve',
      target: 2000,
      current: 0,
      deadline: '2026-12-31',
      color: 'var(--text-muted)',
    },
    {
      id: 'sg_3',
      name: 'Car / Transport',
      target: 3000,
      current: 0,
      deadline: '2026-12-31',
      color: 'var(--text-muted)',
    },
  ],

  ventureFinancials: [
    { id: 'vf-vanta', name: 'Vanta Marketing Co.', entries: [] },
    { id: 'vf-rca', name: 'Rock Canyon AI', entries: [] },
    { id: 'vf-arden', name: 'Arden Place Apartments', entries: [] },
  ],

  goals: [
    {
      id: 'goal_a1',
      title: 'Launch two revenue-generating ventures',
      description:
        'Q1: Define offerings + first client | Q2: 3 clients each | Q3: Systems + delegation | Q4: Scale',
      period: 'annual',
      status: 'in-progress',
      progress: 15,
      area: 'ventures',
      dueDate: '2026-12-31',
      createdAt: today,
    },
    {
      id: 'goal_a2',
      title: 'Finish BYU semester with 3.8+ GPA',
      description:
        'Q1: Strong start — all A\'s through midterms | Q2: Finals preparation and execution',
      period: 'annual',
      status: 'in-progress',
      progress: 70,
      area: 'academic',
      dueDate: '2026-05-01',
      createdAt: today,
    },
    {
      id: 'goal_a3',
      title: 'Build J.A.R.V.I.S. into daily operating system',
      description:
        'Q1: Build and deploy v1 | Q2: Daily use + iterate | Q3: Add voice layer | Q4: Full automation',
      period: 'annual',
      status: 'in-progress',
      progress: 20,
      area: 'personal',
      dueDate: '2026-12-31',
      createdAt: today,
    },
    {
      id: 'goal_q1',
      title: 'Close first Rock Canyon AI client',
      description: 'Land one paying client for AI consulting services before end of Q1',
      period: 'quarterly',
      status: 'in-progress',
      progress: 10,
      area: 'ventures',
      parentId: 'goal_a1',
      linkedProjectId: 'proj_3',
      dueDate: '2026-03-31',
      createdAt: today,
    },
    {
      id: 'goal_q2',
      title: 'Pitch and sign first Vanta client',
      description: 'Deliver polished pitch deck and close one retainer client',
      period: 'quarterly',
      status: 'in-progress',
      progress: 15,
      area: 'ventures',
      parentId: 'goal_a1',
      linkedProjectId: 'proj_2',
      dueDate: '2026-03-31',
      createdAt: today,
    },
    {
      id: 'goal_w1',
      title: 'Complete all pending assignments',
      description: 'Governance article + Chinese lit analysis + Religious studies paper',
      period: 'weekly',
      status: 'in-progress',
      progress: 0,
      area: 'academic',
      parentId: 'goal_a2',
      dueDate: '2026-02-28',
      createdAt: today,
    },
  ],

  weeklyReviews: [],
  decisionLogs: [],

  readingItems: [
    {
      id: 'read_1',
      title: 'Zero to One',
      author: 'Peter Thiel',
      type: 'book',
      status: 'want-to-read',
      category: 'Entrepreneurship',
      priority: 1,
      notes: '',
      keyTakeaways: '',
    },
    {
      id: 'read_2',
      title: 'The Hard Thing About Hard Things',
      author: 'Ben Horowitz',
      type: 'book',
      status: 'want-to-read',
      category: 'Leadership',
      priority: 1,
      notes: '',
      keyTakeaways: '',
    },
    {
      id: 'read_3',
      title: 'Meditations',
      author: 'Marcus Aurelius',
      type: 'book',
      status: 'in-progress',
      category: 'Stoicism & Philosophy',
      priority: 2,
      notes: 'Read 1 passage per morning',
      keyTakeaways: '',
      startedAt: today,
    },
    {
      id: 'read_4',
      title: 'AI Superpowers',
      author: 'Kai-Fu Lee',
      type: 'book',
      status: 'want-to-read',
      category: 'AI & Business',
      priority: 1,
      notes: 'Relevant to Rock Canyon AI positioning',
      keyTakeaways: '',
    },
    {
      id: 'read_5',
      title: 'Monkey (Journey to the West)',
      author: 'Wu Cheng\'en',
      type: 'book',
      status: 'completed',
      category: 'Chinese Literature',
      priority: 3,
      notes: 'Analyzed for Chinese Literature course — themes of transformation and perseverance',
      keyTakeaways:
        "The Monkey King's journey mirrors any founder's path: chaos → discipline → mastery. Sun Wukong only becomes truly powerful once he accepts guidance and channels his rebellion toward purpose rather than ego.",
      completedAt: today,
      rating: 4,
    },
  ],

  candidates: [
    {
      id: 'cand-001',
      name: 'Alex Torres',
      role: 'VP Marketing',
      organization: 'AI in Business Society',
      status: 'interviewed',
      notes: 'Strong candidate. Follows up quickly. Background in digital marketing.',
      lastContactDate: today,
      linkedVentureId: 'proj_1',
    },
    {
      id: 'cand-002',
      name: 'Mia Chen',
      role: 'AI Analyst Intern',
      organization: 'Rock Canyon AI',
      status: 'contacted',
      notes: 'Referred by professor. Strong data background, Python + ML experience.',
      lastContactDate: today,
      linkedVentureId: 'proj_3',
    },
  ],

  notes: [
    {
      id: 'note-001',
      title: 'Rock Canyon AI — Service Packages',
      content:
        '## Service Tiers\n\n**Starter ($500/mo):** Monthly AI audit + recommendations report\n\n**Growth ($1,500/mo):** Workflow automation + monthly strategy call\n\n**Enterprise ($3,000/mo):** Full AI integration + dedicated support\n\n---\n\n## Target ICP\n- Local SMBs with 5–50 employees\n- Pain points: manual workflows, no data strategy, losing to AI-native competitors\n- Target industries: real estate, healthcare admin, retail, legal\n\n## Positioning\n"We make AI practical for businesses that can\'t afford an in-house team."',
      tags: ['Rock Canyon AI', 'Strategy', 'Pricing'],
      pinned: true,
      createdAt: today,
      updatedAt: today,
      linkedProjectId: 'proj_3',
      isMeetingNote: false,
    },
    {
      id: 'note-002',
      title: 'Vanta Marketing — Financial Statements Summary',
      content:
        '## Income Statement (Q1 2026)\n- Revenue: $0 (pre-client)\n- Operating Expenses: minimal\n- Net: $0\n\n## Balance Sheet\n- Assets: Intellectual property, brand assets, client pipeline\n- Liabilities: None\n\n## Next Steps\n1. Close first retainer client ($1,500–$3,000/mo)\n2. Build 3 case studies from free/discounted work\n3. Productize social media management package',
      tags: ['Vanta', 'Financial', 'Strategy'],
      pinned: true,
      createdAt: today,
      updatedAt: today,
      linkedProjectId: 'proj_2',
      isMeetingNote: false,
    },
    {
      id: 'note-003',
      title: 'Arden Place — Competitive Analysis Notes',
      content:
        '## Comps (Orem/Provo area)\n- Average 1BR: $950–$1,100/mo\n- Average 2BR: $1,200–$1,450/mo\n- Key amenities driving premium: in-unit W/D, fiber internet, smart locks, package lockers\n\n## Digital Lock Upgrade\n- Options: August, Schlage Encode, Kwikset Halo\n- Cost per unit: ~$200–$350\n- Benefits: keyless entry, remote access, eliminates lockout calls\n- ROI: reduces maintenance calls, modernizes positioning\n\n## Action Items\n- [ ] Survey tenants on satisfaction + priorities\n- [ ] Get quotes from 2 lock suppliers\n- [ ] Address balcony storage violations (3 units)',
      tags: ['Arden Place', 'Operations', 'Strategy'],
      pinned: false,
      createdAt: today,
      updatedAt: today,
      linkedProjectId: 'proj_4',
      isMeetingNote: false,
    },
    {
      id: 'note-004',
      title: 'AIBS — Spring Semester Agenda',
      content:
        '## Goals\n- Grow membership to 100+\n- Host 4 speaker events\n- Launch AI project competition\n\n## Speaker Pipeline Ideas\n- Local SaaS founder\n- VC from Kickstart Seed Fund\n- BYU CS AI researcher\n- Product manager at tech company (alum)\n\n## Event Format\n30 min talk → 15 min Q&A → networking reception\n\n## Recruitment Strategy\n- Tabling in Tanner building\n- Class announcements in business + CS departments\n- LinkedIn posts with event highlights',
      tags: ['AI in Business Society', 'Events', 'Strategy'],
      pinned: false,
      createdAt: today,
      updatedAt: today,
      linkedProjectId: 'proj_1',
      isMeetingNote: false,
    },
    {
      id: 'note-005',
      title: 'J.A.R.V.I.S. — Feature Roadmap',
      content:
        '## v1.0 (Current)\n- All core modules live\n- localStorage persistence\n- Dark HUD design\n- PWA — installable on mobile\n\n## v1.5 (Next)\n- [ ] Export data to PDF / CSV\n- [ ] Email digest of daily command brief\n- [ ] Keyboard shortcuts for every section\n\n## v2.0 (Future)\n- [ ] Claude API integration — AI-generated weekly summaries\n- [ ] Voice command layer ("JARVIS, what\'s on my agenda?")\n- [ ] Streaming chat assistant in sidebar\n- [ ] Auto-categorize time blocks via NLP\n- [ ] Smart follow-up suggestions in Contacts',
      tags: ['J.A.R.V.I.S.', 'Roadmap', 'AI'],
      pinned: true,
      createdAt: today,
      updatedAt: today,
      linkedProjectId: 'proj_5',
      isMeetingNote: false,
    },
  ],

  dailyEvents: [],

  habits: [
    { id: 'hab_1', name: 'Scripture Study', icon: '📖', order: 0 },
    { id: 'hab_2', name: 'Workout', icon: '💪', order: 1 },
    { id: 'hab_3', name: 'Deep Work Block (2hr+)', icon: '🧠', order: 2 },
    { id: 'hab_4', name: 'Review Goals', icon: '🎯', order: 3 },
    { id: 'hab_5', name: 'No Social Media Before Noon', icon: '📵', order: 4 },
    { id: 'hab_6', name: 'Evening Planning (next day)', icon: '📋', order: 5 },
  ],

  habitTracker: [],
  dailyMoodLogs: [],
  scratchpad:
    '# Quick Capture\n\nDump thoughts, links, and ideas here — process them later.\n\n---\n\n',
};

// ─── Seed Initializer ─────────────────────────────────────────────────────────
// Called synchronously in main.tsx before React renders.
// Only runs once per seed version — safe to update SEED_VERSION to force re-seed.
export function applySeedData(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_VERSION)) return;

  // Clean up any old caesar: keys from previous naming
  const OLD_KEYS = [
    'caesar:identity','caesar:projects','caesar:timeBlocks','caesar:timeCategories',
    'caesar:contacts','caesar:courses','caesar:financialEntries','caesar:savingsGoals',
    'caesar:ventureFinancials','caesar:goals','caesar:weeklyReviews','caesar:decisionLogs',
    'caesar:readingItems','caesar:candidates','caesar:notes','caesar:dailyEvents',
    'caesar:habits','caesar:habitTracker','caesar:dailyMoodLogs','caesar:scratchpad',
    'caesar:seed-v2',
  ];
  OLD_KEYS.forEach(k => localStorage.removeItem(k));

  const keyMap: Record<string, unknown> = {
    'jarvis:identity': DEFAULT_STATE.identity,
    'jarvis:projects': DEFAULT_STATE.projects,
    'jarvis:timeBlocks': DEFAULT_STATE.timeBlocks,
    'jarvis:timeCategories': DEFAULT_STATE.timeCategories,
    'jarvis:contacts': DEFAULT_STATE.contacts,
    'jarvis:courses': DEFAULT_STATE.courses,
    'jarvis:financialEntries': DEFAULT_STATE.financialEntries,
    'jarvis:savingsGoals': DEFAULT_STATE.savingsGoals,
    'jarvis:ventureFinancials': DEFAULT_STATE.ventureFinancials,
    'jarvis:goals': DEFAULT_STATE.goals,
    'jarvis:weeklyReviews': DEFAULT_STATE.weeklyReviews,
    'jarvis:decisionLogs': DEFAULT_STATE.decisionLogs,
    'jarvis:readingItems': DEFAULT_STATE.readingItems,
    'jarvis:candidates': DEFAULT_STATE.candidates,
    'jarvis:notes': DEFAULT_STATE.notes,
    'jarvis:dailyEvents': DEFAULT_STATE.dailyEvents,
    'jarvis:habits': DEFAULT_STATE.habits,
    'jarvis:habitTracker': DEFAULT_STATE.habitTracker,
    'jarvis:dailyMoodLogs': DEFAULT_STATE.dailyMoodLogs,
    'jarvis:scratchpad': DEFAULT_STATE.scratchpad,
  };

  Object.entries(keyMap).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });

  localStorage.setItem(SEED_VERSION, 'true');
}
