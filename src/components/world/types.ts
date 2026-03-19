// ─── World View Types & Constants ────────────────────────────────────────────
import type {
  Project, TodoItem, Goal, Contact, FinancialEntry,
  Course, Habit, HabitTracker, TimeBlock, TimeCategory, Note, Client,
} from '../../types';

// ─── Zone & District ─────────────────────────────────────────────────────────

export type ZoneType = 'downtown' | 'midrise' | 'mixed' | 'low' | 'park' | 'water';

export interface DistrictDef {
  name: string;
  zone: ZoneType;
  color: string;
  palette?: { main: string; alt: string; trim: string }[];
}

export interface BlockInfo {
  col: number;
  row: number;
  cx: number;
  cz: number;
  zone: ZoneType;
  label: string;
}

// ─── App Data ────────────────────────────────────────────────────────────────

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

// ─── Props ───────────────────────────────────────────────────────────────────

export interface WorldViewProps {
  contactTags?: Array<{ name: string; color: string }>;
  districtTagMap?: Record<string, string>;
  onDistrictTagMapChange?: (map: Record<string, string>) => void;
  appData?: WorldViewAppData;
  onNavigateToSection?: (section: string) => void;
}

// ─── Sky Config ──────────────────────────────────────────────────────────────

export interface SkyConfig {
  zenith: string;
  horizon: string;
  fogColor: number;
  fogDensity: number;
  sunIntensity: number;
  hemiIntensity: number;
  sunX: number;
  sunY: number;
  sunZ: number;
  sunColor: string;
  fillIntensity: number;
  bloomIntensity: number;
}

// ─── Grid Constants ──────────────────────────────────────────────────────────

export const GRID_N = 13;
export const BLOCK_SIZE = 50;
export const HALF = Math.floor(GRID_N / 2);
export const STEP = 54;

export const COL_CENTERS = [-350, -292, -232, -174, -118, -58, 0, 60, 122, 180, 242, 298, 356];
export const ROW_CENTERS = [-350, -290, -230, -172, -116, -58, 0, 58, 118, 176, 236, 294, 354];

export const GRID_EXTENT = Math.max(Math.abs(COL_CENTERS[0]), COL_CENTERS[GRID_N - 1]) + BLOCK_SIZE / 2 + 4;

// ─── Color Constants ─────────────────────────────────────────────────────────

export const HEALTH_COLORS: Record<string, string> = {
  green: '#4ade80',
  yellow: '#fbbf24',
  red: '#ef4444',
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
};

// ─── Zone Colors (for minimap) ───────────────────────────────────────────────

export const ZONE_COLORS: Record<ZoneType, string> = {
  downtown: '#C8C4BC',
  midrise: '#CCCCBC',
  mixed: '#D0C8B0',
  low: '#D4D0BC',
  park: '#A8D8A0',
  water: '#6090B8',
};

// ─── Building Archetype ──────────────────────────────────────────────────────

export type BuildingArchetype = 'curtainTower' | 'slab' | 'residential' | 'warehouse'
  | 'campus' | 'spire' | 'podiumTower' | 'moatShield';

// ─── Seeded Random ───────────────────────────────────────────────────────────

export function seededRandom(seed: string): () => number {
  let h = 0;
  for (const ch of seed) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return () => {
    h = (Math.imul(2654435761, h ^ (h >>> 16))) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}
