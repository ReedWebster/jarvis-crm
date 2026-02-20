import type { NavSection } from '../components/layout/Sidebar';

// ─── Intent types ─────────────────────────────────────────────────────────────

export type VoiceIntentType =
  | 'navigate'
  | 'time.log' | 'time.start' | 'time.stop' | 'time.today' | 'time.week'
  | 'task.add' | 'task.complete' | 'task.list'
  | 'goal.add'
  | 'project.status' | 'project.update' | 'project.filter'
  | 'contact.add' | 'contact.last' | 'contact.followup'
  | 'academic.due' | 'academic.grade' | 'academic.add'
  | 'finance.venture' | 'finance.net' | 'finance.tithe' | 'finance.import'
  | 'note.add' | 'note.pinned'
  | 'reading.add' | 'reading.current' | 'reading.complete'
  | 'habit.check' | 'habit.streak'
  | 'system.time' | 'system.brief' | 'system.mute' | 'system.unmute' | 'system.help'
  | 'unknown';

export interface VoiceIntent {
  type: VoiceIntentType;
  params: Record<string, string>;
  confidence: number; // 0–1
  raw: string;
}

// ─── Section keyword map ──────────────────────────────────────────────────────

const SECTION_MAP: Record<string, NavSection> = {
  'dashboard': 'command', 'command': 'command', 'command brief': 'command',
  'daily brief': 'command', 'home': 'command', 'brief': 'command', 'main': 'command',
  'identity': 'identity', 'core identity': 'identity', 'profile': 'identity', 'about me': 'identity',
  'projects': 'projects', 'project': 'projects', 'ventures': 'projects', 'venture': 'projects',
  'time': 'time', 'time tracker': 'time', 'time tracking': 'time',
  'timer': 'time', 'time log': 'time', 'time blocks': 'time',
  'contacts': 'contacts', 'contact': 'contacts', 'crm': 'contacts', 'people': 'contacts', 'network': 'contacts',
  'academic': 'academic', 'academics': 'academic', 'school': 'academic',
  'classes': 'academic', 'courses': 'academic', 'class': 'academic', 'course': 'academic', 'studying': 'academic',
  'financial': 'financial', 'finances': 'financial', 'finance': 'financial',
  'money': 'financial', 'budget': 'financial', 'banking': 'financial', 'spending': 'financial',
  'goals': 'goals', 'goal': 'goals', 'goal hierarchy': 'goals', 'objectives': 'goals',
  'reading': 'reading', 'reading pipeline': 'reading', 'books': 'reading', 'read': 'reading', 'reading list': 'reading',
  'recruitment': 'recruitment', 'recruiting': 'recruitment', 'candidates': 'recruitment', 'hiring': 'recruitment', 'recruit': 'recruitment',
  'notes': 'notes', 'note': 'notes', 'intel': 'notes', 'intelligence': 'notes',
};

// ─── Spoken number map ───────────────────────────────────────────────────────

const WORD_NUMS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, 'half': 0.5, 'a': 1, 'an': 1,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
}

function mapSection(spoken: string): NavSection | null {
  const s = norm(spoken);
  if (SECTION_MAP[s]) return SECTION_MAP[s];
  // Partial prefix / containment match
  for (const [k, v] of Object.entries(SECTION_MAP)) {
    if (s.includes(k) || k.startsWith(s) || s.startsWith(k)) return v;
  }
  return null;
}

function parseNum(word: string): number | null {
  const lower = word.toLowerCase().trim();
  if (WORD_NUMS[lower] !== undefined) return WORD_NUMS[lower];
  const n = parseFloat(lower);
  return isNaN(n) ? null : n;
}

// ─── Main intent parser ───────────────────────────────────────────────────────

export function parseIntent(raw: string): VoiceIntent {
  const text = norm(raw);

  // Strip leading activation phrase ("hey jarvis", "jarvis")
  const s = text
    .replace(/^(?:hey\s+)?(?:jarvis|j\.?a\.?r\.?v\.?i\.?s\.?)[,\s]+/, '')
    .trim();

  const intent = (
    type: VoiceIntentType,
    params: Record<string, string>,
    confidence: number,
  ): VoiceIntent => ({ type, params, confidence, raw });

  // ── Navigation ────────────────────────────────────────────────────────────
  {
    const m = s.match(
      /^(?:go\s+to|open(?:\s+up)?|show(?:\s+me)?|navigate(?:\s+to)?|switch\s+to|take\s+me\s+to|pull\s+up|bring\s+up)\s+(?:the\s+)?(.+)/,
    );
    if (m) {
      const sec = mapSection(m[1]);
      if (sec) return intent('navigate', { section: sec }, 0.92);
    }
  }

  // ── Time: log hours ───────────────────────────────────────────────────────
  {
    const m = s.match(/^(?:log|record)\s+(.+?)\s+hours?\s+(?:to|in|for|on)\s+(.+)/);
    if (m) {
      const n = parseNum(m[1]);
      if (n !== null) return intent('time.log', { hours: String(n), category: m[2] }, 0.90);
    }
    const m2 = s.match(/^log(?:\s+(?:some\s+)?time)?\s+(?:to|in|for|on)\s+(.+)/);
    if (m2) return intent('time.log', { category: m2[1], hours: '' }, 0.72);
  }

  // ── Time: start timer ─────────────────────────────────────────────────────
  {
    const m = s.match(/^start(?:\s+a?)?\s+timer(?:\s+for\s+(.+))?/);
    if (m) return intent('time.start', { category: m[1] ?? '' }, 0.88);
  }

  // ── Time: stop timer ──────────────────────────────────────────────────────
  if (/^(?:stop|end|finish|pause)(?:\s+the?)?\s+timer/.test(s)) {
    return intent('time.stop', {}, 0.92);
  }

  // ── Time: today log ───────────────────────────────────────────────────────
  if (
    /what(?:\s+did)?\s+i\s+work(?:ed)?\s+on\s+today/.test(s) ||
    /show(?:\s+me)?(?:\s+today'?s?)?\s+(?:time\s+)?(?:log|blocks?)/.test(s) ||
    /today'?s?\s+(?:time\s+)?(?:log|blocks?)/.test(s)
  ) {
    return intent('time.today', {}, 0.86);
  }

  // ── Time: weekly hours ────────────────────────────────────────────────────
  if (
    /how\s+many\s+hours?\s+(?:have\s+i\s+)?(?:logged?|worked?|tracked?)\s+this\s+week/.test(s) ||
    /weekly\s+(?:total\s+)?hours?/.test(s)
  ) {
    return intent('time.week', {}, 0.86);
  }

  // ── Task: add ─────────────────────────────────────────────────────────────
  {
    // Try raw first to preserve capitalization in task name
    const m = raw.match(/^(?:add|create|make)(?:\s+a)?\s+task[:\s]+(.+)/i);
    if (m) return intent('task.add', { name: m[1].trim() }, 0.90);
  }

  // ── Task: complete ────────────────────────────────────────────────────────
  {
    const m = s.match(/^(?:mark|complete|finish|check\s+off)\s+(.+?)\s+as\s+(?:done|complete|finished)/);
    if (m) return intent('task.complete', { name: m[1] }, 0.84);
  }

  // ── Task: list ────────────────────────────────────────────────────────────
  if (
    /what(?:'s|\s+are)?(?:\s+my)?\s+tasks?(?:\s+(?:for\s+)?today)?/.test(s) ||
    /(?:show|list)(?:\s+me)?(?:\s+(?:my|today'?s?))?\s+tasks?/.test(s)
  ) {
    return intent('task.list', {}, 0.86);
  }

  // ── Goal: add ─────────────────────────────────────────────────────────────
  {
    const m = s.match(/^add(?:\s+a)?\s+goal[:\s]+(.+?)\s+under\s+(.+)/);
    if (m) return intent('goal.add', { title: m[1], area: m[2] }, 0.88);
    const m2 = s.match(/^add(?:\s+a)?\s+goal[:\s]+(.+)/);
    if (m2) return intent('goal.add', { title: m2[1], area: 'personal' }, 0.78);
  }

  // ── Project: status ───────────────────────────────────────────────────────
  {
    const m = s.match(/(?:status\s+of|how(?:'s|\s+is)\s+(?:the\s+)?|tell\s+me\s+about)\s+(?:the\s+)?(.+?)\s*(?:project)?$/);
    if (m && m[1]) return intent('project.status', { name: m[1].trim() }, 0.80);
    const m2 = s.match(/^(?:what'?s?)\s+(?:the\s+)?(?:status\s+of\s+)?(?:the\s+)?(.+?)\s+project/);
    if (m2) return intent('project.status', { name: m2[1] }, 0.80);
  }

  // ── Project: update next action ───────────────────────────────────────────
  {
    const m = s.match(/^update\s+(?:next\s+action(?:\s+for)?|the\s+)?(.+?)\s+(?:next\s+action\s+)?to\s+(.+)/);
    if (m) return intent('project.update', { name: m[1], action: m[2] }, 0.84);
  }

  // ── Project: filter active ────────────────────────────────────────────────
  if (/(?:show|list|filter)(?:\s+me)?(?:\s+all)?\s+active\s+projects?/.test(s) || /^active\s+projects?/.test(s)) {
    return intent('project.filter', { status: 'active' }, 0.88);
  }

  // ── Contact: add ──────────────────────────────────────────────────────────
  {
    const m = raw.match(/^(?:add|create|new)\s+(?:a\s+)?contact[:\s]+(.+)/i);
    if (m) return intent('contact.add', { name: m[1].trim() }, 0.90);
  }

  // ── Contact: last contacted ───────────────────────────────────────────────
  {
    const m = s.match(/^(?:when\s+did\s+i\s+(?:last\s+)?(?:contact|reach\s+out\s+to|talk\s+to)|last\s+contact(?:ed)?)\s+(.+)/);
    if (m) return intent('contact.last', { name: m[1] }, 0.86);
  }

  // ── Contact: flag follow-up ───────────────────────────────────────────────
  {
    const m = s.match(/^(?:flag|mark)\s+(.+?)\s+for\s+follow[\s-]?up/);
    if (m) return intent('contact.followup', { name: m[1] }, 0.88);
    const m2 = s.match(/^(?:follow\s+up\s+(?:with|on)\s+)(.+)/);
    if (m2) return intent('contact.followup', { name: m2[1] }, 0.80);
  }

  // ── Academic: due ─────────────────────────────────────────────────────────
  if (
    /(?:assignments?|homework|work)\s+(?:are\s+)?due(?:\s+this\s+week)?/.test(s) ||
    /what'?s?\s+due(?:\s+this\s+week)?/.test(s) ||
    /due\s+this\s+week/.test(s)
  ) {
    return intent('academic.due', {}, 0.86);
  }

  // ── Academic: grade ───────────────────────────────────────────────────────
  {
    const m = s.match(/^(?:what'?s?\s+(?:my\s+)?grade(?:\s+in)?|grade\s+(?:for|in))\s+(.+)/);
    if (m) return intent('academic.grade', { course: m[1] }, 0.84);
  }

  // ── Academic: add assignment ──────────────────────────────────────────────
  {
    const m = raw.match(/^add\s+(?:an?\s+)?assignment[:\s]+(.+?)\s+for\s+(.+?)\s+due\s+(.+)/i);
    if (m) return intent('academic.add', { title: m[1].trim(), course: m[2].trim(), due: m[3].trim() }, 0.84);
    const m2 = raw.match(/^add\s+(?:an?\s+)?assignment[:\s]+(.+)/i);
    if (m2) return intent('academic.add', { title: m2[1].trim(), course: '', due: '' }, 0.72);
  }

  // ── Finance: venture spending ─────────────────────────────────────────────
  {
    const m = s.match(/(?:how\s+much\s+(?:did\s+i\s+)?spent?|(?:total\s+)?spending)\s+on\s+(.+?)\s+(?:this\s+month|month)/);
    if (m) return intent('finance.venture', { venture: m[1] }, 0.84);
    const m2 = s.match(/(?:what|how\s+much)\s+(?:did\s+i\s+)?spent?\s+on\s+(.+)/);
    if (m2) return intent('finance.venture', { venture: m2[1] }, 0.76);
  }

  // ── Finance: net this month ───────────────────────────────────────────────
  if (
    /(?:what'?s?\s+)?(?:my\s+)?net(?:\s+(?:this\s+)?month)?/.test(s) ||
    /income\s+(?:vs|minus|versus)\s+expenses?/.test(s) ||
    /(?:profit|loss)\s+(?:this\s+)?month/.test(s)
  ) {
    return intent('finance.net', {}, 0.80);
  }

  // ── Finance: tithe ────────────────────────────────────────────────────────
  if (/tithed?(?:\s+this\s+month)?/.test(s) || /how\s+much\s+(?:have\s+i\s+)?tithed?/.test(s)) {
    return intent('finance.tithe', {}, 0.88);
  }

  // ── Finance: import ───────────────────────────────────────────────────────
  if (
    /import\s+(?:transactions?|csv|bank\s+statements?)/.test(s) ||
    /(?:upload|add)\s+(?:my\s+)?(?:bank\s+)?transactions?/.test(s)
  ) {
    return intent('finance.import', {}, 0.88);
  }

  // ── Note: add (keep raw for content) ─────────────────────────────────────
  {
    const m = raw.match(
      /^(?:take\s+a?\s+note|note|note\s+this|jot\s+(?:this\s+)?down|save\s+(?:this\s+)?note|add\s+a?\s+note|write\s+(?:this\s+)?down)[:\s]+(.+)/i,
    );
    if (m) return intent('note.add', { content: m[1].trim() }, 0.90);
  }

  // ── Note: pinned ──────────────────────────────────────────────────────────
  if (/(?:show|list)(?:\s+me)?(?:\s+my)?\s+pinned\s+notes?/.test(s) || /^pinned\s+notes?$/.test(s)) {
    return intent('note.pinned', {}, 0.88);
  }

  // ── Reading: add ──────────────────────────────────────────────────────────
  {
    const m = raw.match(/^add(?:\s+to)?(?:\s+(?:my\s+)?reading(?:\s+list)?)?[:\s]+(.+?)\s+by\s+(.+)/i);
    if (m) return intent('reading.add', { title: m[1].trim(), author: m[2].trim() }, 0.88);
    const m2 = raw.match(/^add(?:\s+to)?(?:\s+(?:my\s+)?reading(?:\s+list)?)[:\s]+(.+)/i);
    if (m2) return intent('reading.add', { title: m2[1].trim(), author: '' }, 0.76);
  }

  // ── Reading: current ──────────────────────────────────────────────────────
  if (
    /what(?:\s+am\s+i|\s+'m\s+i)?\s+(?:currently\s+)?reading/.test(s) ||
    /(?:current(?:ly\s+)?reading|in\s+progress\s+(?:books?|reading))/.test(s)
  ) {
    return intent('reading.current', {}, 0.86);
  }

  // ── Reading: complete ─────────────────────────────────────────────────────
  {
    const m = s.match(/^(?:mark|finished?|completed?)\s+(.+?)\s+as\s+(?:read|complete|done|finished)/);
    if (m) return intent('reading.complete', { title: m[1] }, 0.82);
    const m2 = s.match(/^i\s+(?:just\s+)?(?:finished?|completed?|read)\s+(.+)/);
    if (m2) return intent('reading.complete', { title: m2[1] }, 0.72);
  }

  // ── Habit: check ──────────────────────────────────────────────────────────
  {
    // Must come after task.complete to avoid collision
    const m = s.match(/^(?:mark|check\s+off|log)\s+(.+?)\s+(?:as\s+)?(?:done|complete|finished)?\s*$/);
    if (m && m[1]) return intent('habit.check', { habit: m[1].trim() }, 0.72);
    const m2 = s.match(/^(?:i\s+(?:did|completed?|finished?))\s+(?:my\s+)?(.+?)(?:\s+today)?$/);
    if (m2) return intent('habit.check', { habit: m2[1].trim() }, 0.68);
  }

  // ── Habit: streak ─────────────────────────────────────────────────────────
  {
    const m = s.match(/(?:how'?s?|what'?s?)\s+my\s+streak\s+(?:on|for|with)\s+(.+)/);
    if (m) return intent('habit.streak', { habit: m[1] }, 0.86);
    const m2 = s.match(/streak\s+(?:on|for|with)\s+(.+)/);
    if (m2) return intent('habit.streak', { habit: m2[1] }, 0.82);
  }

  // ── System: time / date ───────────────────────────────────────────────────
  if (
    /what(?:'s|\s+is)?\s+(?:the\s+)?(?:time|date|day)/.test(s) ||
    /what\s+(?:time|day)\s+is\s+it/.test(s) ||
    /^(?:time|date|day)\??$/.test(s)
  ) {
    return intent('system.time', {}, 0.88);
  }

  // ── System: morning brief ─────────────────────────────────────────────────
  if (
    /(?:morning\s+brief|daily\s+briefing|read\s+me\s+my\s+brief|give\s+me\s+my\s+(?:morning\s+)?brief|morning\s+rundown)/.test(s)
  ) {
    return intent('system.brief', {}, 0.90);
  }

  // ── System: mute ──────────────────────────────────────────────────────────
  if (/^(?:mute|silence|quiet|disable\s+(?:voice|responses?|speech|audio|sound))/.test(s)) {
    return intent('system.mute', {}, 0.92);
  }
  if (/^(?:unmute|un-mute|enable\s+(?:voice|responses?|speech|audio)|turn\s+on\s+(?:voice|speech|audio))/.test(s)) {
    return intent('system.unmute', {}, 0.92);
  }

  // ── System: help ──────────────────────────────────────────────────────────
  if (/^(?:help|what\s+can\s+you\s+do|available\s+commands?|commands?\s+list|what\s+(?:commands?|do\s+you\s+know))/.test(s)) {
    return intent('system.help', {}, 0.92);
  }

  return intent('unknown', {}, 0);
}

// ─── Fuzzy name matcher ───────────────────────────────────────────────────────

/** Returns true if the candidate name "fuzzy" matches the spoken name */
export function fuzzyMatch(spoken: string, candidate: string): boolean {
  const a = norm(spoken);
  const b = norm(candidate);
  if (b.includes(a) || a.includes(b)) return true;
  // First-word match (useful for first names)
  const aFirst = a.split(' ')[0];
  const bFirst = b.split(' ')[0];
  return aFirst.length >= 3 && (bFirst.startsWith(aFirst) || aFirst.startsWith(bFirst));
}
