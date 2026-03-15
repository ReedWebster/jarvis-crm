/**
 * VoiceCommandLayer — J.A.R.V.I.S. Voice Interface
 * Web Speech API only. No external services. Chrome / Edge primary targets.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, History, Volume2, VolumeX, RotateCcw, Search } from 'lucide-react';
import { format } from 'date-fns';
import { parseIntent, fuzzyMatch } from '../../utils/voiceCommands';
import type { VoiceIntent } from '../../utils/voiceCommands';
import type { NavSection } from '../layout/Sidebar';
import type {
  Contact, Project, Goal, Note, TimeBlock, TimeCategory,
  Habit, HabitTracker, Course, FinancialEntry, VentureFinancial,
  ReadingItem, DailyEvent, Identity, VoiceSettings, VoiceCommandEntry,
} from '../../types';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { todayStr, calcDurationHours, getCategoryName } from '../../utils';

// ─── Web Speech API types (not fully present in all TypeScript lib.dom versions) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;

interface SpeechRecognitionResultItem { transcript: string; confidence: number; }
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; length: number; [i: number]: SpeechRecognitionResultItem };
}
interface SpeechRecognitionEvt extends Event { results: SpeechRecognitionResultList; resultIndex: number; }
interface SpeechRecognitionErrEvt extends Event { error: string; }

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VoiceCommandLayerProps {
  // Navigation
  onNavigate: (section: NavSection) => void;
  activeSection: NavSection;
  // Data
  identity: Identity;
  contacts: Contact[];
  projects: Project[];
  goals: Goal[];
  notes: Note[];
  timeBlocks: TimeBlock[];
  timeCategories: TimeCategory[];
  habits: Habit[];
  habitTracker: HabitTracker[];
  courses: Course[];
  financialEntries: FinancialEntry[];
  ventureFinancials: VentureFinancial[];
  readingItems: ReadingItem[];
  dailyEvents: DailyEvent[];
  scratchpad: string;
  // Setters
  setNotes: (fn: (prev: Note[]) => Note[]) => void;
  setTimeBlocks: (fn: (prev: TimeBlock[]) => TimeBlock[]) => void;
  setGoals: (fn: (prev: Goal[]) => Goal[]) => void;
  setContacts: (fn: (prev: Contact[]) => Contact[]) => void;
  setHabitTracker: (fn: (prev: HabitTracker[]) => HabitTracker[]) => void;
  setReadingItems: (fn: (prev: ReadingItem[]) => ReadingItem[]) => void;
  setScratchpad: (v: string | ((p: string) => string)) => void;
  setDailyEvents: (fn: (prev: DailyEvent[]) => DailyEvent[]) => void;
  // CSV import trigger
  onOpenCSVImport?: () => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsEnabled: true,
  chimeEnabled: true,
  pushToTalk: false,
  speechRate: 0.95,
  speechPitch: 0.9,
  preferredVoice: '',
  showWaveform: true,
  alwaysOn: false,
};

// ─── Audio chime (Web Audio API, no file needed) ──────────────────────────────

function playChime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    const osc = ctx.createOscillator();
    osc.connect(gain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {/* ignore in environments without AudioContext */}
}

// ─── Card state ───────────────────────────────────────────────────────────────

type CardStatus = 'listening' | 'processing' | 'success' | 'low-confidence' | 'error' | null;

interface CommandCard {
  status: CardStatus;
  transcript: string;
  intentLabel: string;
  response: string;
}

const STATUS_COLORS: Record<NonNullable<CardStatus>, string> = {
  listening: '#737373',
  processing: '#737373',
  success: 'var(--text-secondary)',
  'low-confidence': '#888888',
  error: 'var(--text-secondary)',
};

// ─── Life area mapper (spoken → GoalArea) ────────────────────────────────────

function mapLifeArea(spoken: string) {
  const s = spoken.toLowerCase();
  if (s.includes('venture') || s.includes('business') || s.includes('startup')) return 'ventures';
  if (s.includes('academ') || s.includes('school') || s.includes('class')) return 'academic';
  if (s.includes('health') || s.includes('fitness') || s.includes('workout')) return 'health';
  if (s.includes('spirit') || s.includes('faith') || s.includes('church')) return 'spiritual';
  if (s.includes('financ') || s.includes('money') || s.includes('budget')) return 'financial';
  if (s.includes('relat') || s.includes('friend') || s.includes('family')) return 'relationships';
  return 'personal';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceCommandLayer(props: VoiceCommandLayerProps) {
  const {
    onNavigate, contacts, projects, goals, notes, timeBlocks, timeCategories,
    habits, habitTracker, courses, financialEntries, ventureFinancials, readingItems,
    dailyEvents, scratchpad, identity,
    setNotes, setTimeBlocks, setGoals, setContacts, setHabitTracker,
    setReadingItems, setScratchpad, setDailyEvents, onOpenCSVImport,
  } = props;

  // ── Persistent voice settings & history ────────────────────────────────────
  const [voiceSettings, setVoiceSettings] = useLocalStorage<VoiceSettings>(
    'jarvis:voice-settings', DEFAULT_VOICE_SETTINGS,
  );
  const [cmdHistory, setCmdHistory] = useLocalStorage<VoiceCommandEntry[]>(
    'jarvis:voice-history', [],
  );

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [card, setCard] = useState<CommandCard>({ status: null, transcript: '', intentLabel: '', response: '' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [alwaysOnActive, setAlwaysOnActive] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<VoiceIntent | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [historySearch, setHistorySearch] = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alwaysOnRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceHeldRef = useRef(false);
  const isListeningRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // ── Check support & load voices ────────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { setIsSupported(false); return; }
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  // ── Speak helper ───────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!voiceSettings.ttsEnabled) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = voiceSettings.speechRate;
    utter.pitch = voiceSettings.speechPitch;
    const allVoices = window.speechSynthesis.getVoices();
    if (voiceSettings.preferredVoice) {
      const pref = allVoices.find(v => v.name === voiceSettings.preferredVoice);
      if (pref) utter.voice = pref;
    } else {
      const deepMale = allVoices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Daniel') || v.name.includes('Alex') || v.name.includes('Tom') ||
          v.name.includes('David') || v.name.toLowerCase().includes('male')),
      );
      if (deepMale) utter.voice = deepMale;
    }
    window.speechSynthesis.speak(utter);
  }, [voiceSettings]);

  // ── Auto-dismiss command card ──────────────────────────────────────────────
  const showCard = useCallback((c: CommandCard) => {
    setCard(c);
    if (cardDismissTimerRef.current) clearTimeout(cardDismissTimerRef.current);
    if (c.status !== 'listening' && c.status !== null) {
      cardDismissTimerRef.current = setTimeout(() => {
        setCard(prev => ({ ...prev, status: null }));
      }, 4000);
    }
  }, []);

  // ── Stop listening ─────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText('');
  }, []);

  // ── Execute intent ────────────────────────────────────────────────────────
  const executeIntent = useCallback((intent: VoiceIntent): { response: string; success: boolean } => {
    const { type, params } = intent;
    const today = todayStr();

    switch (type) {
      // ── Navigate ──────────────────────────────────────────────────────────
      case 'navigate': {
        onNavigate(params.section as NavSection);
        const sectionLabel = params.section.charAt(0).toUpperCase() + params.section.slice(1);
        return { response: `Navigating to ${sectionLabel}.`, success: true };
      }

      // ── Time: log ─────────────────────────────────────────────────────────
      case 'time.log': {
        onNavigate('time');
        const hrs = params.hours ? `${params.hours} hours ` : '';
        const cat = params.category || 'your work';
        return { response: `Navigating to Calendar. Log ${hrs}to ${cat}.`, success: true };
      }

      // ── Time: start timer ─────────────────────────────────────────────────
      case 'time.start': {
        onNavigate('time');
        const cat = params.category ? `for ${params.category}` : '';
        return { response: `Opening Calendar${cat ? ' ' + cat : ''}. Start your timer there.`, success: true };
      }

      // ── Time: stop ────────────────────────────────────────────────────────
      case 'time.stop': {
        onNavigate('time');
        return { response: 'Opening Calendar. Stop your active timer there.', success: true };
      }

      // ── Time: today ───────────────────────────────────────────────────────
      case 'time.today': {
        const todayBlocks = timeBlocks.filter(b => b.date === today);
        if (todayBlocks.length === 0) {
          return { response: "You haven't logged any time today yet.", success: true };
        }
        const totalHrs = todayBlocks.reduce((s, b) => s + calcDurationHours(b.startTime, b.endTime), 0);
        const cats = [...new Set(todayBlocks.map(b => getCategoryName(b.categoryId, timeCategories)))];
        return {
          response: `Today you've logged ${totalHrs.toFixed(1)} hours across ${cats.slice(0, 3).join(', ')}.`,
          success: true,
        };
      }

      // ── Time: week ────────────────────────────────────────────────────────
      case 'time.week': {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(0, 0, 0, 0);
        const weekBlocks = timeBlocks.filter(b => new Date(b.date) >= monday);
        const total = weekBlocks.reduce((s, b) => s + calcDurationHours(b.startTime, b.endTime), 0);
        return { response: `You've logged ${total.toFixed(1)} hours this week.`, success: true };
      }

      // ── Task: add ─────────────────────────────────────────────────────────
      case 'task.add': {
        const name = params.name || 'New task';
        setDailyEvents(prev => [
          ...prev,
          { id: crypto.randomUUID(), date: today, title: name, time: '09:00', notes: '' },
        ]);
        return { response: `Task added: "${name}".`, success: true };
      }

      // ── Task: complete ────────────────────────────────────────────────────
      case 'task.complete': {
        const nameQ = (params.name || '').toLowerCase();
        const match = dailyEvents.find(e => e.date === today && e.title.toLowerCase().includes(nameQ));
        if (match) {
          setDailyEvents(prev => prev.filter(e => e.id !== match.id));
          return { response: `Done. Marked "${match.title}" as complete.`, success: true };
        }
        onNavigate('command');
        return { response: `Couldn't find that task. Opening your command brief.`, success: false };
      }

      // ── Task: list ────────────────────────────────────────────────────────
      case 'task.list': {
        const todayTasks = dailyEvents.filter(e => e.date === today);
        if (todayTasks.length === 0) {
          return { response: "You have no tasks logged for today.", success: true };
        }
        const list = todayTasks.slice(0, 3).map(e => e.title).join(', ');
        return { response: `Today's tasks: ${list}.`, success: true };
      }

      // ── Goal: add ─────────────────────────────────────────────────────────
      case 'goal.add': {
        const area = mapLifeArea(params.area || 'personal');
        setGoals(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            title: params.title || 'New goal',
            description: '',
            period: 'quarterly',
            status: 'not-started',
            progress: 0,
            area: area as Goal['area'],
            dueDate: '',
            createdAt: today,
          },
        ]);
        return { response: `Goal added: "${params.title}" under ${area}.`, success: true };
      }

      // ── Project: status ───────────────────────────────────────────────────
      case 'project.status': {
        const nameQ = (params.name || '').toLowerCase();
        const project = projects.find(p => fuzzyMatch(nameQ, p.name));
        if (!project) {
          return { response: `I couldn't find a project matching "${params.name}".`, success: false };
        }
        const due = project.dueDate ? `Due ${project.dueDate}.` : '';
        return {
          response: `${project.name} is ${project.status} with ${project.health} health. Next: ${project.nextAction}. ${due}`,
          success: true,
        };
      }

      // ── Project: update ───────────────────────────────────────────────────
      case 'project.update': {
        const nameQ = (params.name || '').toLowerCase();
        const project = projects.find(p => fuzzyMatch(nameQ, p.name));
        if (!project) {
          return { response: `I couldn't find a project matching "${params.name}".`, success: false };
        }
        // Can't setProjects from here; navigate and inform
        onNavigate('projects');
        return {
          response: `Opening Projects. Update "${project.name}" next action to: ${params.action}.`,
          success: true,
        };
      }

      // ── Project: filter ───────────────────────────────────────────────────
      case 'project.filter': {
        onNavigate('projects');
        const count = projects.filter(p => p.status === 'active').length;
        return { response: `Navigating to Projects. You have ${count} active projects.`, success: true };
      }

      // ── Contact: add ──────────────────────────────────────────────────────
      case 'contact.add': {
        onNavigate('contacts');
        return { response: `Opening Contacts. Add "${params.name}" from there.`, success: true };
      }

      // ── Contact: last ─────────────────────────────────────────────────────
      case 'contact.last': {
        const nameQ = (params.name || '').toLowerCase();
        const contact = contacts.find(c => fuzzyMatch(nameQ, c.name));
        if (!contact) {
          return { response: `I couldn't find a contact named "${params.name}".`, success: false };
        }
        const last = contact.lastContacted || 'unknown date';
        return { response: `You last contacted ${contact.name} on ${last}.`, success: true };
      }

      // ── Contact: follow-up ────────────────────────────────────────────────
      case 'contact.followup': {
        const nameQ = (params.name || '').toLowerCase();
        const contact = contacts.find(c => fuzzyMatch(nameQ, c.name));
        if (!contact) {
          return { response: `I couldn't find a contact named "${params.name}".`, success: false };
        }
        setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, followUpNeeded: true } : c));
        return { response: `Done. ${contact.name} flagged for follow-up.`, success: true };
      }

      // ── Academic: due ─────────────────────────────────────────────────────
      case 'academic.due': {
        const allAssignments = courses.flatMap(c =>
          c.assignments.filter(a => a.status !== 'graded' && a.status !== 'submitted' && a.dueDate >= today)
            .map(a => ({ ...a, courseName: c.name })),
        ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        if (allAssignments.length === 0) {
          return { response: "No upcoming assignments found.", success: true };
        }
        const top3 = allAssignments.slice(0, 3)
          .map(a => `${a.title} for ${a.courseName} due ${a.dueDate}`).join('. ');
        return { response: `Upcoming: ${top3}.`, success: true };
      }

      // ── Academic: grade ───────────────────────────────────────────────────
      case 'academic.grade': {
        const courseQ = (params.course || '').toLowerCase();
        const course = courses.find(c => fuzzyMatch(courseQ, c.name));
        if (!course) {
          return { response: `I couldn't find a course matching "${params.course}".`, success: false };
        }
        return { response: `Your current grade in ${course.name} is ${course.currentGrade}%.`, success: true };
      }

      // ── Academic: add assignment ───────────────────────────────────────────
      case 'academic.add': {
        onNavigate('academic');
        return {
          response: `Opening Academics. Add the assignment "${params.title}" there.`,
          success: true,
        };
      }

      // ── Finance: venture ──────────────────────────────────────────────────
      case 'finance.venture': {
        const ventureQ = (params.venture || '').toLowerCase();
        const thisMonth = today.slice(0, 7); // YYYY-MM
        const venture = ventureFinancials.find(v => fuzzyMatch(ventureQ, v.name));
        let entries = financialEntries.filter(e =>
          e.date.startsWith(thisMonth) && e.type === 'expense' &&
          (venture ? e.ventureId === venture.id : true),
        );
        if (venture) entries = venture.entries.filter(e => e.date.startsWith(thisMonth) && e.type === 'expense');
        const total = entries.reduce((s, e) => s + e.amount, 0);
        const name = venture?.name || params.venture;
        return { response: `${name} spending this month: $${total.toFixed(2)}.`, success: true };
      }

      // ── Finance: net ──────────────────────────────────────────────────────
      case 'finance.net': {
        const thisMonth = today.slice(0, 7);
        const monthEntries = financialEntries.filter(e => e.date.startsWith(thisMonth));
        const income = monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const expense = monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
        const net = income - expense;
        return {
          response: `This month: $${income.toFixed(2)} income, $${expense.toFixed(2)} expenses. Net: $${net.toFixed(2)}.`,
          success: true,
        };
      }

      // ── Finance: tithe ────────────────────────────────────────────────────
      case 'finance.tithe': {
        const thisMonth = today.slice(0, 7);
        const tithe = financialEntries.filter(e =>
          e.date.startsWith(thisMonth) && e.category.toLowerCase().includes('tithe'),
        ).reduce((s, e) => s + e.amount, 0);
        return { response: `You've tithed $${tithe.toFixed(2)} this month.`, success: true };
      }

      // ── Finance: import ───────────────────────────────────────────────────
      case 'finance.import': {
        if (onOpenCSVImport) {
          onNavigate('financial');
          setTimeout(onOpenCSVImport, 300);
          return { response: 'Opening the CSV import. Upload your bank statement.', success: true };
        }
        onNavigate('financial');
        return { response: 'Navigating to Finances. Use the Import button to upload transactions.', success: true };
      }

      // ── Note: add ─────────────────────────────────────────────────────────
      case 'note.add': {
        const content = params.content || '';
        setScratchpad(prev => `${content}\n\n---\n\n${prev}`);
        return { response: `Note saved to scratchpad.`, success: true };
      }

      // ── Note: pinned ──────────────────────────────────────────────────────
      case 'note.pinned': {
        onNavigate('notes');
        const count = notes.filter(n => n.pinned).length;
        return { response: `Opening Notes. You have ${count} pinned notes.`, success: true };
      }

      // ── Reading: add ──────────────────────────────────────────────────────
      case 'reading.add': {
        setReadingItems(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            title: params.title || 'Unknown Title',
            author: params.author || '',
            type: 'book',
            status: 'want-to-read',
            category: 'General',
            priority: 2,
            notes: '',
            keyTakeaways: '',
          },
        ]);
        const byStr = params.author ? ` by ${params.author}` : '';
        return { response: `Added "${params.title}"${byStr} to your reading list.`, success: true };
      }

      // ── Reading: current ──────────────────────────────────────────────────
      case 'reading.current': {
        const inProgress = readingItems.filter(r => r.status === 'in-progress');
        if (inProgress.length === 0) {
          return { response: "You don't have any books in progress right now.", success: true };
        }
        const list = inProgress.map(r => `${r.title} by ${r.author || 'unknown'}`).join(', and ');
        return { response: `Currently reading: ${list}.`, success: true };
      }

      // ── Reading: complete ─────────────────────────────────────────────────
      case 'reading.complete': {
        const titleQ = (params.title || '').toLowerCase();
        const item = readingItems.find(r => fuzzyMatch(titleQ, r.title));
        if (!item) {
          return { response: `Couldn't find "${params.title}" in your reading list.`, success: false };
        }
        setReadingItems(prev => prev.map(r =>
          r.id === item.id ? { ...r, status: 'completed', completedAt: today } : r,
        ));
        return { response: `"${item.title}" marked as complete. Well done, Reed.`, success: true };
      }

      // ── Habit: check ──────────────────────────────────────────────────────
      case 'habit.check': {
        const habitQ = (params.habit || '').toLowerCase();
        const habit = habits.find(h => fuzzyMatch(habitQ, h.name));
        if (!habit) {
          return { response: `I couldn't find a habit matching "${params.habit}".`, success: false };
        }
        setHabitTracker(prev => {
          const existing = prev.find(t => t.date === today);
          if (existing) {
            return prev.map(t =>
              t.date === today ? { ...t, habits: { ...t.habits, [habit.id]: true } } : t,
            );
          }
          return [...prev, { date: today, habits: { [habit.id]: true } }];
        });
        return { response: `${habit.name} checked off for today. Keep it up.`, success: true };
      }

      // ── Habit: streak ─────────────────────────────────────────────────────
      case 'habit.streak': {
        const habitQ = (params.habit || '').toLowerCase();
        const habit = habits.find(h => fuzzyMatch(habitQ, h.name));
        if (!habit) {
          return { response: `I couldn't find a habit matching "${params.habit}".`, success: false };
        }
        // Count consecutive days ending today
        let streak = 0;
        const d = new Date();
        while (true) {
          const ds = format(d, 'yyyy-MM-dd');
          const entry = habitTracker.find(t => t.date === ds);
          if (!entry?.habits[habit.id]) break;
          streak++;
          d.setDate(d.getDate() - 1);
        }
        return { response: `Your streak for ${habit.name} is ${streak} day${streak !== 1 ? 's' : ''}.`, success: true };
      }

      // ── System: time ──────────────────────────────────────────────────────
      case 'system.time': {
        const now = new Date();
        const timeStr = format(now, 'h:mm a');
        const dateStr = format(now, 'EEEE, MMMM do, yyyy');
        return { response: `It's ${timeStr} on ${dateStr}.`, success: true };
      }

      // ── System: morning brief ─────────────────────────────────────────────
      case 'system.brief': {
        const todayTasks = dailyEvents.filter(e => e.date === today);
        const todayTracker = habitTracker.find(t => t.date === today);
        const doneHabits = habits.filter(h => todayTracker?.habits[h.id]).length;
        const inProgress = readingItems.find(r => r.status === 'in-progress');
        const status = identity.status.replace('-', ' ');
        const parts = [
          `Good morning, Reed.`,
          `Today is ${format(new Date(), 'EEEE, MMMM do')}.`,
          `You're currently in ${status} mode.`,
          todayTasks.length > 0
            ? `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} today: ${todayTasks.slice(0, 2).map(t => t.title).join(' and ')}.`
            : 'No tasks scheduled today.',
          `${doneHabits} of ${habits.length} habits complete.`,
          inProgress ? `Currently reading: ${inProgress.title}.` : '',
        ].filter(Boolean);
        return { response: parts.join(' '), success: true };
      }

      // ── System: mute ──────────────────────────────────────────────────────
      case 'system.mute': {
        setVoiceSettings(prev => ({ ...prev, ttsEnabled: false }));
        return { response: '', success: true }; // Can't speak if muted
      }

      // ── System: unmute ────────────────────────────────────────────────────
      case 'system.unmute': {
        setVoiceSettings(prev => ({ ...prev, ttsEnabled: true }));
        return { response: 'Voice responses enabled. Online and ready, Reed.', success: true };
      }

      // ── System: help ──────────────────────────────────────────────────────
      case 'system.help': {
        return {
          response: "I can navigate sections, log time, add tasks, check habits, query projects, look up contacts, summarize finances, take notes, and more. Try saying: go to projects, log 2 hours to deep work, or take a note colon followed by your note.",
          success: true,
        };
      }

      default:
        return {
          response: `I didn't catch that, Reed. Try saying: log time, add task, show finances, or give me my morning brief.`,
          success: false,
        };
    }
  }, [
    onNavigate, contacts, projects, goals, notes, timeBlocks, timeCategories,
    habits, habitTracker, courses, financialEntries, ventureFinancials, readingItems,
    dailyEvents, scratchpad, identity,
    setNotes, setTimeBlocks, setGoals, setContacts, setHabitTracker,
    setReadingItems, setScratchpad, setDailyEvents, onOpenCSVImport,
    voiceSettings.ttsEnabled, setVoiceSettings,
  ]);

  // ── Process a final transcript ────────────────────────────────────────────
  const processTranscript = useCallback((transcript: string) => {
    if (!transcript.trim()) return;

    showCard({ status: 'processing', transcript, intentLabel: 'Analyzing...', response: '' });

    const intent = parseIntent(transcript);
    const CONFIDENCE_THRESHOLD = 0.72;

    if (intent.type === 'unknown' || intent.confidence < 0.50) {
      const { response } = executeIntent(intent);
      showCard({ status: 'error', transcript, intentLabel: 'Unrecognized', response });
      speak(response);
      setCmdHistory(prev => [{
        id: crypto.randomUUID(), ts: new Date().toISOString(),
        transcript, intent: intent.type, response, success: false,
      }, ...prev].slice(0, 20));
      return;
    }

    if (intent.confidence < CONFIDENCE_THRESHOLD) {
      setPendingConfirm(intent);
      showCard({
        status: 'low-confidence',
        transcript,
        intentLabel: `Did you mean: ${intentLabel(intent)}?`,
        response: '',
      });
      return;
    }

    const { response, success } = executeIntent(intent);
    showCard({
      status: success ? 'success' : 'error',
      transcript,
      intentLabel: intentLabel(intent),
      response,
    });
    speak(response);
    setCmdHistory(prev => [{
      id: crypto.randomUUID(), ts: new Date().toISOString(),
      transcript, intent: intent.type, response, success,
    }, ...prev].slice(0, 20));
  }, [executeIntent, showCard, speak, setCmdHistory]);

  // ── Start main listening session ──────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR || isListeningRef.current) return;

    // Check permission first time
    if (hasPermission === null) {
      setPermissionOpen(true);
      return;
    }

    // Stop always-on first (can't run both)
    alwaysOnRef.current?.stop();
    alwaysOnRef.current = null;

    if (voiceSettings.chimeEnabled) playChime();

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    let finalText = '';

    recognition.onresult = (e: SpeechRecognitionEvt) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInterimText(finalText + interim);
      // Reset silence timer on each result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => stopListening(), 8000);
    };

    recognition.onerror = (e: SpeechRecognitionErrEvt) => {
      if (e.error !== 'no-speech') console.warn('[JARVIS voice]', e.error);
      stopListening();
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      if (finalText.trim()) processTranscript(finalText.trim());
      finalText = '';
    };

    recognition.start();
    setIsListening(true);
    setInterimText('');
    showCard({ status: 'listening', transcript: '', intentLabel: '', response: '' });

    // 8-second max silence
    silenceTimerRef.current = setTimeout(() => stopListening(), 8000);
  }, [hasPermission, voiceSettings.chimeEnabled, stopListening, processTranscript, showCard]);

  // ── Always-on "Hey Jarvis" detection ─────────────────────────────────────
  const startAlwaysOn = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR || !voiceSettings.alwaysOn || isListeningRef.current) return;

    const ao = new SR();
    ao.continuous = true;
    ao.interimResults = true;
    ao.lang = 'en-US';
    alwaysOnRef.current = ao;

    ao.onresult = (e: SpeechRecognitionEvt) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript.toLowerCase();
        if (txt.includes('jarvis')) {
          ao.stop();
          alwaysOnRef.current = null;
          startListening();
          break;
        }
      }
    };

    ao.onend = () => {
      setAlwaysOnActive(false);
      if (voiceSettings.alwaysOn && !isListeningRef.current) {
        setTimeout(() => startAlwaysOn(), 800);
      }
    };

    ao.onerror = () => { setAlwaysOnActive(false); };

    try {
      ao.start();
      setAlwaysOnActive(true);
    } catch {
      setAlwaysOnActive(false);
    }
  }, [voiceSettings.alwaysOn, startListening]);

  useEffect(() => {
    if (voiceSettings.alwaysOn && hasPermission && !isListening) {
      startAlwaysOn();
    } else if (!voiceSettings.alwaysOn) {
      alwaysOnRef.current?.stop();
      alwaysOnRef.current = null;
      setAlwaysOnActive(false);
    }
  }, [voiceSettings.alwaysOn, hasPermission, isListening, startAlwaysOn]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Spacebar push-to-talk
      if (
        voiceSettings.pushToTalk &&
        e.code === 'Space' &&
        !spaceHeldRef.current &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        spaceHeldRef.current = true;
        startListening();
      }
      // Escape to cancel
      if (e.key === 'Escape' && isListening) {
        stopListening();
        showCard({ status: null, transcript: '', intentLabel: '', response: '' });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (voiceSettings.pushToTalk && e.code === 'Space' && spaceHeldRef.current) {
        spaceHeldRef.current = false;
        if (isListening) stopListening();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [voiceSettings.pushToTalk, isListening, startListening, stopListening, showCard]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => {
    recognitionRef.current?.stop();
    alwaysOnRef.current?.stop();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (cardDismissTimerRef.current) clearTimeout(cardDismissTimerRef.current);
  }, []);

  // ── Grant permission and start ────────────────────────────────────────────
  const grantPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      setPermissionOpen(false);
      startListening();
    } catch {
      setHasPermission(false);
      setPermissionOpen(false);
    }
  };

  if (!isSupported) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleMic = () => {
    if (isListening) {
      stopListening();
      showCard({ status: null, transcript: '', intentLabel: '', response: '' });
    } else {
      startListening();
    }
  };

  const retryCommand = (entry: VoiceCommandEntry) => processTranscript(entry.transcript);

  const confirmPending = () => {
    if (!pendingConfirm) return;
    const { response, success } = executeIntent(pendingConfirm);
    showCard({ status: success ? 'success' : 'error', transcript: pendingConfirm.raw, intentLabel: intentLabel(pendingConfirm), response });
    speak(response);
    setCmdHistory(prev => [{
      id: crypto.randomUUID(), ts: new Date().toISOString(),
      transcript: pendingConfirm.raw, intent: pendingConfirm.type, response, success,
    }, ...prev].slice(0, 20));
    setPendingConfirm(null);
  };

  const filteredHistory = cmdHistory.filter(e =>
    !historySearch ||
    e.transcript.toLowerCase().includes(historySearch.toLowerCase()) ||
    e.intent.toLowerCase().includes(historySearch.toLowerCase()),
  );

  return (
    <>
      {/* ── Always-on indicator in top bar area ──────────────────────────── */}
      {alwaysOnActive && (
        <div
          className="fixed top-0 left-56 z-30 px-3 py-1 text-xs font-mono flex items-center gap-1.5"
          style={{ color: 'var(--text-muted)', opacity: 0.7 }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
          LITEHOUSE ready
        </div>
      )}

      {/* ── Command card (appears above mic button) ───────────────────────── */}
      {card.status !== null && (
        <div
          className="fixed bottom-24 right-6 z-[90] w-80 rounded-2xl overflow-hidden shadow-2xl animate-slide-in"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: `1px solid ${STATUS_COLORS[card.status]}40`,
            boxShadow: `0 0 24px ${STATUS_COLORS[card.status]}30`,
          }}
        >
          {/* Color bar */}
          <div className="h-1" style={{ backgroundColor: STATUS_COLORS[card.status] }} />

          <div className="p-4">
            {/* Listening state */}
            {card.status === 'listening' && (
              <div className="flex items-center gap-3">
                {voiceSettings.showWaveform && (
                  <div className="flex items-end gap-0.5 h-6">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className="w-1 rounded-full voice-bar"
                        style={{
                          backgroundColor: 'var(--text-secondary)',
                          animationDelay: `${i * 80}ms`,
                          height: '100%',
                        }}
                      />
                    ))}
                  </div>
                )}
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Listening...
                </span>
              </div>
            )}

            {/* Interim transcript */}
            {card.status === 'listening' && interimText && (
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {interimText}
              </p>
            )}

            {/* Processing / result */}
            {card.status !== 'listening' && (
              <>
                {card.transcript && (
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Heard: "{card.transcript}"
                  </p>
                )}
                {card.intentLabel && (
                  <p className="text-xs font-mono mb-1" style={{ color: STATUS_COLORS[card.status] }}>
                    → {card.intentLabel}
                  </p>
                )}
                {card.response && (
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {card.response}
                  </p>
                )}

                {/* Low-confidence confirm/cancel */}
                {card.status === 'low-confidence' && pendingConfirm && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={confirmPending}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }}
                    >
                      Yes, do it
                    </button>
                    <button
                      onClick={() => { setPendingConfirm(null); showCard({ status: null, transcript: '', intentLabel: '', response: '' }); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Dismiss */}
          {card.status !== 'listening' && (
            <button
              onClick={() => showCard({ status: null, transcript: '', intentLabel: '', response: '' })}
              className="absolute top-3 right-3 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── History panel (slide-out from right) ───────────────────────────── */}
      {historyOpen && (
        <>
          <div
            className="fixed inset-0 z-[85]"
            onClick={() => setHistoryOpen(false)}
          />
          <div
            className="fixed right-0 top-0 h-full w-80 z-[86] flex flex-col shadow-2xl animate-slide-in"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderLeft: '1px solid var(--border)',
            }}
          >
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Command History
              </h3>
              <button onClick={() => setHistoryOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Search commands..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-2">
              {filteredHistory.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No commands yet
                </p>
              ) : (
                filteredHistory.map(entry => (
                  <div
                    key={entry.id}
                    className="px-4 py-3"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          "{entry.transcript}"
                        </p>
                        <p className="text-xs font-mono mt-0.5" style={{ color: entry.success ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                          {entry.intent}
                        </p>
                        {entry.response && (
                          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                            {entry.response}
                          </p>
                        )}
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                          {format(new Date(entry.ts), 'MMM d · h:mm a')}
                        </p>
                      </div>
                      <button
                        onClick={() => retryCommand(entry)}
                        title="Retry"
                        className="flex-shrink-0 p-1 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--bg-elevated)', backdropFilter: 'blur(4px)' }}
          onClick={e => e.target === e.currentTarget && setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl animate-fade-in"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              className="flex items-center justify-between p-5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Voice Preferences
              </h2>
              <button onClick={() => setSettingsOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Toggles */}
              {([
                ['Voice responses', 'ttsEnabled'],
                ['Activation chime', 'chimeEnabled'],
                ['Push-to-talk (Spacebar)', 'pushToTalk'],
                ['Show waveform animation', 'showWaveform'],
                ['Always-on "Hey Jarvis"', 'alwaysOn'],
              ] as [string, keyof VoiceSettings][]).map(([label, key]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <button
                    onClick={() => setVoiceSettings(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="relative w-10 h-5 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: voiceSettings[key] ? 'var(--text-primary)' : 'var(--bg-elevated)' }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                      style={{ transform: voiceSettings[key] ? 'translateX(20px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
              ))}

              {/* Speech rate */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Speech rate</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {voiceSettings.speechRate.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range" min="0.5" max="1.5" step="0.05"
                  value={voiceSettings.speechRate}
                  onChange={e => setVoiceSettings(prev => ({ ...prev, speechRate: parseFloat(e.target.value) }))}
                  className="w-full accent-[var(--text-muted)]"
                />
              </div>

              {/* Pitch */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Speech pitch</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {voiceSettings.speechPitch.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range" min="0.5" max="1.5" step="0.05"
                  value={voiceSettings.speechPitch}
                  onChange={e => setVoiceSettings(prev => ({ ...prev, speechPitch: parseFloat(e.target.value) }))}
                  className="w-full accent-[var(--text-muted)]"
                />
              </div>

              {/* Voice selector */}
              {voices.length > 0 && (
                <div>
                  <label className="caesar-label">Preferred voice</label>
                  <select
                    className="caesar-select mt-1"
                    value={voiceSettings.preferredVoice}
                    onChange={e => setVoiceSettings(prev => ({ ...prev, preferredVoice: e.target.value }))}
                  >
                    <option value="">Auto (best available)</option>
                    {voices.filter(v => v.lang.startsWith('en')).map(v => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Test voice button */}
              <button
                onClick={() => speak('Online and ready, Reed.')}
                className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Test Voice
              </button>

              {/* Safari note */}
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                Voice commands require Chrome or Edge. Safari has limited Speech Recognition support.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Microphone permission modal (first use) ───────────────────────── */}
      {permissionOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          style={{ backgroundColor: 'var(--bg-elevated)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl animate-fade-in p-6 text-center"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
            >
              <Mic size={24} style={{ color: 'var(--text-primary)' }} />
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Microphone Access
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              LITEHOUSE needs microphone access for voice commands. Your audio is never sent
              anywhere — it's processed entirely on your device.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPermissionOpen(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Not now
              </button>
              <button
                onClick={grantPermission}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg)' }}
              >
                Allow Access
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ─── Utility: human-readable intent label ─────────────────────────────────────

function intentLabel(intent: VoiceIntent): string {
  const labels: Record<string, string> = {
    navigate: `Navigate → ${intent.params.section ?? ''}`,
    'time.log': 'Log time block',
    'time.start': 'Start timer',
    'time.stop': 'Stop timer',
    'time.today': "Today's time log",
    'time.week': 'Weekly hours',
    'task.add': `Add task: ${intent.params.name ?? ''}`,
    'task.complete': 'Complete task',
    'task.list': "Today's tasks",
    'goal.add': `Add goal: ${intent.params.title ?? ''}`,
    'project.status': `Project status: ${intent.params.name ?? ''}`,
    'project.update': 'Update next action',
    'project.filter': 'Filter active projects',
    'contact.add': `Add contact: ${intent.params.name ?? ''}`,
    'contact.last': `Last contacted: ${intent.params.name ?? ''}`,
    'contact.followup': `Flag follow-up: ${intent.params.name ?? ''}`,
    'academic.due': 'Upcoming assignments',
    'academic.grade': `Grade: ${intent.params.course ?? ''}`,
    'academic.add': 'Add assignment',
    'finance.venture': `Spending: ${intent.params.venture ?? ''}`,
    'finance.net': 'Net this month',
    'finance.tithe': 'Tithe total',
    'finance.import': 'Import transactions',
    'note.add': 'Save note',
    'note.pinned': 'Pinned notes',
    'reading.add': `Add to reading list: ${intent.params.title ?? ''}`,
    'reading.current': 'Currently reading',
    'reading.complete': `Mark complete: ${intent.params.title ?? ''}`,
    'habit.check': `Check habit: ${intent.params.habit ?? ''}`,
    'habit.streak': `Habit streak: ${intent.params.habit ?? ''}`,
    'system.time': 'Current time & date',
    'system.brief': 'Morning brief',
    'system.mute': 'Mute voice',
    'system.unmute': 'Unmute voice',
    'system.help': 'Help',
    unknown: 'Unrecognized',
  };
  return labels[intent.type] ?? intent.type;
}
