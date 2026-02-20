import { format, parseISO, differenceInDays, isToday, isThisWeek } from 'date-fns';
import { type TimeBlock, type TimeCategory, type Contact } from '../types';

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string): string {
  // HH:MM -> 12hr format
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  } catch {
    return timeStr;
  }
}

export function calcDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return Math.max(0, (endMins - startMins) / 60);
}

export function getDayTimeBlocks(blocks: TimeBlock[], date: string): TimeBlock[] {
  return blocks.filter((b) => b.date === date);
}

export function getCategoryColor(categoryId: string, categories: TimeCategory[]): string {
  return categories.find((c) => c.id === categoryId)?.color ?? '#6b7280';
}

export function getCategoryName(categoryId: string, categories: TimeCategory[]): string {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Unknown';
}

export function aggregateTimeByCategory(
  blocks: TimeBlock[],
  categories: TimeCategory[]
): { name: string; hours: number; color: string; categoryId: string }[] {
  const map = new Map<string, number>();
  blocks.forEach((b) => {
    const hours = calcDurationHours(b.startTime, b.endTime);
    map.set(b.categoryId, (map.get(b.categoryId) ?? 0) + hours);
  });

  return Array.from(map.entries())
    .map(([id, hours]) => ({
      categoryId: id,
      name: getCategoryName(id, categories),
      hours: Math.round(hours * 10) / 10,
      color: getCategoryColor(id, categories),
    }))
    .sort((a, b) => b.hours - a.hours);
}

export function calcRelationshipHealth(lastContacted: string): number {
  try {
    const days = differenceInDays(new Date(), parseISO(lastContacted));
    if (days <= 7) return 100;
    if (days <= 14) return 80;
    if (days <= 30) return 60;
    if (days <= 60) return 40;
    if (days <= 90) return 20;
    return 5;
  } catch {
    return 50;
  }
}

export function getHealthColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

export function calcWeightedGPA(grades: { grade: number; credits: number }[]): number {
  const totalCredits = grades.reduce((s, g) => s + g.credits, 0);
  if (totalCredits === 0) return 0;
  const weighted = grades.reduce((s, g) => s + g.grade * g.credits, 0);
  return Math.round((weighted / totalCredits) * 100) / 100;
}

export function gradeToGPA(percent: number): number {
  if (percent >= 93) return 4.0;
  if (percent >= 90) return 3.7;
  if (percent >= 87) return 3.3;
  if (percent >= 83) return 3.0;
  if (percent >= 80) return 2.7;
  if (percent >= 77) return 2.3;
  if (percent >= 73) return 2.0;
  if (percent >= 70) return 1.7;
  if (percent >= 67) return 1.3;
  if (percent >= 63) return 1.0;
  if (percent >= 60) return 0.7;
  return 0.0;
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowStr(): string {
  return format(new Date(), 'HH:mm');
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function daysUntil(dateStr: string): number {
  try {
    return differenceInDays(parseISO(dateStr), new Date());
  } catch {
    return 0;
  }
}

export function isOverdue(dateStr: string): boolean {
  return daysUntil(dateStr) < 0;
}

export const LEADERSHIP_QUOTES = [
  { quote: "The two most powerful warriors are patience and time.", author: "Leo Tolstoy" },
  { quote: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { quote: "It is not death that a man should fear, but he should fear never beginning to live.", author: "Marcus Aurelius" },
  { quote: "Do not pray for an easy life, pray for the strength to endure a difficult one.", author: "Bruce Lee" },
  { quote: "He who has a why to live can bear almost any how.", author: "Nietzsche" },
  { quote: "The obstacle is the way.", author: "Marcus Aurelius" },
  { quote: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { quote: "Every morning we are born again. What we do today matters most.", author: "Buddha" },
  { quote: "The most important single thing is to focus obsessively on the customer.", author: "Jeff Bezos" },
  { quote: "If you are not willing to risk the unusual, you will have to settle for the ordinary.", author: "Jim Rohn" },
  { quote: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
  { quote: "Be still and know that I am God.", author: "Psalms 46:10" },
  { quote: "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.", author: "2 Timothy 1:7" },
  { quote: "I can do all things through Christ which strengtheneth me.", author: "Philippians 4:13" },
  { quote: "The price of excellence is discipline. The cost of mediocrity is disappointment.", author: "William Arthur Ward" },
  { quote: "What you do speaks so loudly that I cannot hear what you say.", author: "Ralph Waldo Emerson" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "Amateurs sit and wait for inspiration; the rest of us just get up and go to work.", author: "Stephen King" },
  { quote: "Discipline equals freedom.", author: "Jocko Willink" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  // Seed data quotes
  { quote: "The best armor is staying out of range.", author: "Italian Proverb" },
  { quote: "It is not the mountain we conquer, but ourselves.", author: "Edmund Hillary" },
  { quote: "An idea not coupled with action will never get any bigger than the brain cell it occupied.", author: "Arnold Glasow" },
  { quote: "Work like there is someone working 24 hours a day to take it all away from you.", author: "Mark Cuban" },
  { quote: "By failing to prepare, you are preparing to fail.", author: "Benjamin Franklin" },
  { quote: "The quality of a person's life is in direct proportion to their commitment to excellence.", author: "Vince Lombardi" },
  { quote: "Do not pray for easy lives. Pray to be stronger men.", author: "JFK" },
  { quote: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { quote: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey" },
  { quote: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali" },
];

export function getDailyQuote(): { quote: string; author: string } {
  const idx = new Date().getDate() % LEADERSHIP_QUOTES.length;
  return LEADERSHIP_QUOTES[idx];
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function classNames(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
