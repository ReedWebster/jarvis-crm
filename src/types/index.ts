// ─── IDENTITY ───────────────────────────────────────────────────────────────

export type StatusMode = 'deep-work' | 'available' | 'break' | 'out';

export interface Identity {
  name: string;
  role: string;
  titles: string[];
  photoUrl?: string;
  missionStatement: string;
  priorities: string[];
  status: StatusMode;
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'on-hold' | 'completed';
export type HealthColor = 'green' | 'yellow' | 'red';

export interface ActionItem {
  assignee: string;
  action: string;
  dueDate?: string;
}

export interface MeetingAISummary {
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  summarizedAt: string;
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string;         // YYYY-MM-DD
  attendees: string[];  // free-text names
  rawNotes: string;
  aiSummary?: MeetingAISummary;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  health: HealthColor;
  nextAction: string;
  dueDate: string;
  keyContacts: string[];
  notes: string;
  links: string;
  createdAt: string;
  githubRepo?: string;       // e.g. "owner/repo" — links project to GitHub activity
  meetingNotes?: MeetingNote[];
}

// ─── TIME TRACKING ───────────────────────────────────────────────────────────

export interface TimeCategory {
  id: string;
  name: string;
  color: string;
}

export interface TimeBlock {
  id: string;
  date: string; // YYYY-MM-DD
  categoryId: string;
  title?: string;   // optional display name; falls back to category name
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  notes: string;
  energy: 1 | 2 | 3 | 4 | 5;
  recurrenceId?: string; // groups repeating events for bulk delete
  clientId?: string;     // team calendar: linked client
  googleEventId?: string; // set when sourced from Google Calendar (read-only in UI)
  googleCalendarName?: string; // display name of the source Google Calendar
}

// ─── CONTACTS ────────────────────────────────────────────────────────────────

export type ContactTag = string;

export interface ContactInteraction {
  id: string;
  date: string;
  type: string;
  notes: string;
}

export interface AIEnrichment {
  summary: string;           // 2-3 sentence profile summary
  suggestedTags: string[];   // AI-suggested tags (existing + new)
  strategicNotes: string;    // How to maintain this relationship
  relationshipTier: string;  // "Inner Circle" | "Key Ally" | "Active Network" | "Acquaintance" | "Dormant"
  followUpTiming: string;    // e.g. "Every 2 weeks"
  talkingPoints: string[];   // Topics for next conversation
  enrichedAt: string;        // ISO date of last enrichment
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;    // display address string
  mapLat?: number;     // geocoded lat from address autocomplete selection
  mapLng?: number;     // geocoded lng from address autocomplete selection
  mapLabel?: string;   // short "City, State" label derived from geocoding
  metAt?: string;      // where/how you met this person (e.g. "Harvard", "YC S24", "Conference")
  linkedin?: string;          // LinkedIn profile URL or username
  googleResourceName?: string; // Google People API resource name (e.g. "people/c12345") — set when synced from Google
  appleContactUid?: string;    // vCard UID from Apple Contacts — used for CardDAV delete sync
  relationship: string;
  tags: ContactTag[];
  lastContacted: string;
  followUpDate?: string;
  followUpNeeded: boolean;
  birthday?: string;
  anniversary?: string;
  notes: string;
  interactions: ContactInteraction[];
  linkedProjects: string[];
  aiEnrichment?: AIEnrichment;
}

// ─── ACADEMIC ────────────────────────────────────────────────────────────────

export type AssignmentStatus = 'not-started' | 'in-progress' | 'submitted' | 'graded';

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  status: AssignmentStatus;
  dueDate: string;
  grade?: number;
  weight: number;
  notes: string;
}

export interface Course {
  id: string;
  name: string;
  professor: string;
  credits: number;
  currentGrade: number;
  targetGrade: number;
  assignments: Assignment[];
  examDates: { id: string; title: string; date: string }[];
  color: string;
}

// ─── FINANCIAL ───────────────────────────────────────────────────────────────

export interface FinancialEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  ventureId?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  color: string;
}

export interface VentureFinancial {
  id: string;
  name: string;
  entries: FinancialEntry[];
}

// ─── GOALS ───────────────────────────────────────────────────────────────────

export type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked';
export type GoalPeriod = 'annual' | 'quarterly' | 'weekly' | 'daily';
export type LifeArea = 'ventures' | 'academic' | 'health' | 'spiritual' | 'financial' | 'relationships' | 'personal';

export interface Goal {
  id: string;
  title: string;
  description: string;
  period: GoalPeriod;
  status: GoalStatus;
  progress: number; // 0-100
  area: LifeArea;
  parentId?: string;
  linkedProjectId?: string;
  dueDate: string;
  createdAt: string;
}

export interface WeeklyReview {
  id: string;
  weekOf: string;
  wins: string;
  misses: string;
  blockers: string;
  focusNextWeek: string;
  energyAvg: number;
  createdAt: string;
}

export interface DecisionLog {
  id: string;
  date: string;
  decision: string;
  reasoning: string;
  outcome: string;
  area: LifeArea;
}

// ─── READING ─────────────────────────────────────────────────────────────────

export type ReadingStatus = 'want-to-read' | 'in-progress' | 'completed';
export type ReadingType = 'book' | 'article' | 'course' | 'podcast' | 'video';

export interface ReadingItem {
  id: string;
  title: string;
  author: string;
  type: ReadingType;
  status: ReadingStatus;
  category: string;
  priority: 1 | 2 | 3;
  notes: string;
  keyTakeaways: string;
  startedAt?: string;
  completedAt?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
}

// ─── RECRUITMENT ─────────────────────────────────────────────────────────────

export type CandidateStatus = 'contacted' | 'interviewed' | 'offered' | 'joined' | 'declined';

export interface Candidate {
  id: string;
  name: string;
  role: string;
  organization: string; // which venture or org
  status: CandidateStatus;
  notes: string;
  lastContactDate: string;
  email?: string;
  linkedIn?: string;
  linkedVentureId?: string;
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

export type ClientStatus = 'prospect' | 'active' | 'paused' | 'completed';
export type PaymentStatus = 'pending' | 'paid' | 'overdue';

export interface ClientPayment {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
}

export type ContractPricingModel = 'retainer' | 'commission';

export interface ClientContractInfo {
  type: 'uploaded' | 'generated';
  fileName: string;
  createdAt: string;
  // Uploaded contract
  fileData?: string;  // base64 encoded
  fileType?: string;  // MIME type, e.g. 'application/pdf'
  // Generated contract metadata (HTML is regenerated on demand)
  pricingModel?: ContractPricingModel;
  retainerAmount?: number;
  commissionRate?: number;
  commissionBasis?: string;
  paymentTerms?: string;
  contractDuration?: string;
  additionalNotes?: string;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  status: ClientStatus;
  services: string[];
  contractValue: number;
  billingDay?: number;
  startDate: string;
  endDate?: string;
  notes: string;
  payments: ClientPayment[];
  linkedProjectId?: string;
  contract?: ClientContractInfo;
}

// ─── NOTES ───────────────────────────────────────────────────────────────────

export type NoteTemplate = 'blank' | 'meeting' | '1on1' | 'weekly-review' | 'project-kickoff' | 'decision-log';

export type NoteColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  linkedProjectId?: string;
  linkedContactId?: string;
  linkedGoalId?: string;
  linkedCourseId?: string;
  linkedNoteIds?: string[];
  notebook?: string;
  color?: NoteColor;
  isMeetingNote: boolean;
  meetingAttendees?: string;
  meetingActionItems?: string;
  meetingDecisions?: string;
}

// ─── DAILY COMMAND ───────────────────────────────────────────────────────────

export interface DailyEvent {
  id: string;
  date: string;
  title: string;
  time: string;
  notes: string;
}

export interface HabitTracker {
  date: string; // YYYY-MM-DD
  habits: { [habitId: string]: boolean };
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  order: number;
}

export interface DailyMoodLog {
  date: string;
  energy: 1 | 2 | 3 | 4 | 5;
  mood: 1 | 2 | 3 | 4 | 5;
  note: string;
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────

export interface HealthEntry {
  id: string;
  date: string; // YYYY-MM-DD
  // Sleep
  sleepHours?: number;
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  // Activity
  steps?: number;
  activeMinutes?: number;
  workoutType?: string;
  workoutDuration?: number; // minutes
  caloriesBurned?: number;
  // Vitals
  restingHR?: number;
  avgHR?: number;
  hrv?: number; // heart rate variability
  bodyBattery?: number; // 0–100 (Garmin)
  stressLevel?: number; // 0–100 (Garmin)
  spo2?: number; // blood oxygen %
  // Body
  weight?: number; // lbs
  bodyFat?: number; // %
  // Hydration / Nutrition
  waterOz?: number;
  calories?: number;
  // Notes
  notes?: string;
  // Source
  source: 'manual' | 'garmin';
  createdAt: string;
}

export interface GarminConfig {
  connected: boolean;
  consumerKey?: string;
  consumerSecret?: string;
  accessToken?: string;
  tokenSecret?: string;
  lastSyncAt?: string;
  userId?: string;
}

// ─── VOICE ───────────────────────────────────────────────────────────────────

export interface VoiceSettings {
  ttsEnabled: boolean;
  chimeEnabled: boolean;
  pushToTalk: boolean;
  speechRate: number;
  speechPitch: number;
  preferredVoice: string;
  showWaveform: boolean;
  alwaysOn: boolean;
}

export interface VoiceCommandEntry {
  id: string;
  ts: string;
  transcript: string;
  intent: string;
  response: string;
  success: boolean;
}

// ─── TODOS ───────────────────────────────────────────────────────────────────

export type TodoStatus = 'todo' | 'in-progress' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoLinkType = 'contact' | 'project' | 'goal' | 'course' | 'note' | 'reading' | 'candidate';
export type TodoRepeat = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface TodoChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate?: string;
  createdAt: string;
  linkedType?: TodoLinkType;
  linkedId?: string;
  linkedLabel?: string;
  checklist: TodoChecklistItem[];
  repeat?: TodoRepeat;
}

// ─── SOCIAL / BRAND OPERATIONS ───────────────────────────────────────────────

export type SocialPlatform = 'linkedin' | 'twitter';

export type SocialAccountStatus = 'connected' | 'disconnected' | 'needs-reauth';

export interface SocialAccount {
  platform: SocialPlatform;
  status: SocialAccountStatus;
  accountName?: string;
  // Note: provider tokens are managed by Ayrshare and never exposed to the client.
  lastSyncAt?: string;
}

export type SocialPostStatus = 'draft' | 'pending-approval' | 'scheduled' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  creatorUserId: string;
  platforms: SocialPlatform[];
  baseContent: string;
  linkedinContent?: string;
  twitterContent?: string;
  mediaUrls?: string[];          // stored as public URLs once uploaded
  perPlatformMedia?: Partial<Record<SocialPlatform, string[]>>;
  status: SocialPostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  approvalState: 'draft' | 'pending' | 'approved';
  externalPostIds?: Partial<Record<SocialPlatform, string>>;
  analyticsSnapshot?: SocialAnalyticsSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAnalyticsSnapshot {
  windowStart: string;
  windowEnd: string;
  perPlatform: Partial<Record<SocialPlatform, {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    followerDelta: number;
    topPostId?: string;
    topPostPreview?: string;
  }>>;
}

export type SocialApprovalType = 'post-draft' | 'dm-suggestion' | 'idea' | 'retry' | 'reschedule';

export type SocialApprovalStatus = 'pending' | 'approved' | 'dismissed';

export interface SocialApprovalItem {
  id: string;
  type: SocialApprovalType;
  title: string;
  preview: string;
  createdAt: string;
  relatedContactId?: string;
  relatedPostId?: string;
  source: 'ai' | 'system' | 'manual';
  status: SocialApprovalStatus;
  suggestedPlatform?: SocialPlatform;
  metadata?: Record<string, any>;
  dismissalReason?: 'too-formal' | 'wrong-topic' | 'bad-timing' | 'off-brand' | 'other';
}

// ─── NETWORKING MAP ──────────────────────────────────────────────────────────

export type RelationshipStrength = 'hot' | 'warm' | 'cold' | 'personal';

export interface NetworkOrg {
  id: string;
  name: string;
  color: string;
  autoTag?: ContactTag;
  memberContactIds: string[];
}

export interface ContactMapData {
  contactId: string;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  geocodedAddress?: string; // address string that produced the current lat/lng
  nodeX?: number;
  nodeY?: number;
  nodeZ?: number;
  mapNotes: string;
  strength: RelationshipStrength;
  voiceNote?: string;
  photo?: string;
  buildingId?: string; // references CityBuilding.id for 3D city placement
}

export interface NetworkManualConnection {
  id: string;
  sourceContactId: string;
  targetContactId: string;
  label: string;
}

export type CityBuildingArchetype = 'tower' | 'midrise' | 'slab' | 'residential' | 'warehouse' | 'campus' | 'spire' | 'podiumTower';

export interface CityBuilding {
  id: string;             // e.g. "vanta-0", "byu-2"
  districtId: string;     // "vanta" | "byu" | "rockcanyonai" | "neighborhood" | "chapel" | "outskirts"
  name: string;           // user-editable display name, e.g. "Vanta Tower 1"
  archetype: CityBuildingArchetype;
  position: { x: number; z: number };
  contactIds: string[];   // denormalized for fast render lookup
}

export interface NetworkingMapState {
  contactData: Record<string, ContactMapData>;
  manualConnections: NetworkManualConnection[];
  showAutoConnections: boolean;
  activeView: 'geographic' | 'network';
  orgs: NetworkOrg[];
  buildings?: CityBuilding[];
}

export interface MapFilters {
  ventureId: string;
  relationshipType: string;
  location: string;
  strength: RelationshipStrength | 'all';
  followUpOnly: boolean;
  search: string;
}

// ─── DOC HUB ─────────────────────────────────────────────────────────────────

export interface DocFolder {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
}

export interface DocFile {
  id: string;
  name: string;
  folderId: string | null;
  type: string;
  size: number;
  uploadedAt: string;
  content: string; // base64 data URL
}

// ─── GITHUB ACTIVITY ────────────────────────────────────────────────────────

export interface GitHubActivity {
  lastSyncAt: string;
  recentCommits: Array<{ repo: string; message: string; date: string }>;
  openPRs: Array<{ repo: string; title: string; url: string }>;
  openIssues: Array<{ repo: string; title: string; url: string; labels: string[] }>;
}

// ─── NEWS FEED ──────────────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

export interface NewsConfig {
  queries: string[];
  enabled: boolean;
}

// ─── NOTION ─────────────────────────────────────────────────────────────────

export interface NotionPageSummary {
  id: string;
  title: string;
  lastEditedAt: string;
  url: string;
  contentPreview?: string;
  database?: string;
}

export interface NotionConfig {
  databaseIds: string[];
  enabled: boolean;
  lastSyncAt?: string;
}

// ─── READWISE ───────────────────────────────────────────────────────────────

export interface ReadwiseHighlight {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  highlightedAt: string;
  note?: string;
}

// ─── SCREEN TIME ────────────────────────────────────────────────────────────

export interface ScreenTimeEntry {
  date: string;
  totalMinutes: number;
  categories: Record<string, number>;
  pickups: number;
}

// ─── EMAIL DRAFTS ───────────────────────────────────────────────────────────

export interface EmailDraft {
  id: string;
  to: string;
  subject: string;
  body: string;
  todoId: string;
  createdAt: string;
  status: 'pending' | 'sent' | 'dismissed';
}

// ─── EVENT LOG ──────────────────────────────────────────────────────────────

export interface EventLogEntry {
  id: string;
  key: string;
  action: 'create' | 'update' | 'delete';
  timestamp: string;
  summary?: string;
}

// ─── DAILY REFLECTION ───────────────────────────────────────────────────────

export interface DailyReflection {
  date: string;           // YYYY-MM-DD
  reflection: string;     // freeform
  wins: string;
  challenges: string;
  createdAt: string;
}

// ─── MORNING BRIEFING ───────────────────────────────────────────────────────

export interface MorningBriefing {
  date: string;
  generatedAt: string;
  weather?: { temp: number; feelsLike: number; condition: string; high: number; low: number } | null;
  sections: {
    executiveSummary: string;
    priorityTasks: Array<{ title: string; reasoning: string; priority: string }>;
    goalsCheckIn: Array<{ title: string; progress: number; note: string }>;
    suggestedGoals?: Array<{ title: string; area: string; reasoning: string }>;
    scheduleRecommendations?: Array<{ suggestion: string; reasoning: string }>;
    contactFollowUps: Array<{ name: string; reason: string }>;
    habits: { yesterdayRate: number; focus: string[]; streakNote?: string };
    financialSnapshot?: { recentSpending: string; savingsProgress: string; actionItems: string[] };
    academicAlerts?: Array<{ course: string; alert: string }>;
    recruitmentPipeline?: Array<{ item: string; action: string }>;
    readingProgress?: { currentlyReading: string[]; suggestion: string };
    socialMedia?: Array<{ item: string; action: string }>;
    wellnessCheck?: { energyTrend: string; moodTrend: string; recommendation: string };
    strategicNotes: string[];
    calendar: Array<{ time: string; title: string; prepNotes?: string }>;
    emailDigest: Array<{ from: string; subject: string; summary: string; urgent: boolean }>;
  };
}

// ─── AUTOMATION & WORKFLOWS ─────────────────────────────────────────────────

export type AutomationTrigger = 'new-contact' | 'meeting-ended' | 'todo-overdue' | 'goal-stalled' | 'follow-up-due' | 'habit-missed' | 'custom';
export type AutomationAction = 'create-todo' | 'create-note' | 'send-notification' | 'update-status' | 'tag-contact' | 'custom';

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, string>;
  action: AutomationAction;
  actionConfig: Record<string, string>;
  enabled: boolean;
  lastTriggeredAt?: string;
  runCount: number;
  createdAt: string;
}

// ─── JOURNAL & REFLECTIONS ──────────────────────────────────────────────────

export type JournalMood = 'great' | 'good' | 'okay' | 'rough' | 'bad';

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  mood?: JournalMood;
  gratitude: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── BOOKMARKS & INSPIRATION ────────────────────────────────────────────────

export type BookmarkType = 'link' | 'idea' | 'quote' | 'screenshot' | 'reference';

export interface Bookmark {
  id: string;
  title: string;
  url?: string;
  content: string;
  type: BookmarkType;
  tags: string[];
  pinned: boolean;
  linkedProjectId?: string;
  linkedNoteId?: string;
  createdAt: string;
}

// ─── ROOT APP STATE ──────────────────────────────────────────────────────────

export interface AppState {
  identity: Identity;
  projects: Project[];
  timeCategories: TimeCategory[];
  timeBlocks: TimeBlock[];
  contacts: Contact[];
  contactTags: Array<{ name: string; color: string; parent?: string }>;
  courses: Course[];
  financialEntries: FinancialEntry[];
  savingsGoals: SavingsGoal[];
  ventureFinancials: VentureFinancial[];
  goals: Goal[];
  weeklyReviews: WeeklyReview[];
  decisionLogs: DecisionLog[];
  readingItems: ReadingItem[];
  candidates: Candidate[];
  notes: Note[];
  dailyEvents: DailyEvent[];
  habits: Habit[];
  habitTracker: HabitTracker[];
  dailyMoodLogs: DailyMoodLog[];
  healthEntries: HealthEntry[];
  garminConfig: GarminConfig;
  scratchpad: string;
}
