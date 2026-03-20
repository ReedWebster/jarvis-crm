import type { Contact, Project, Client, Candidate, Goal, FinancialEntry, Note } from './index';

// ─── NODE TYPES ─────────────────────────────────────────────────────────────

export type NexusNodeType = 'contact' | 'project' | 'client' | 'candidate' | 'goal' | 'financial' | 'note';

export interface NexusNode {
  id: string;
  type: NexusNodeType;
  label: string;
  sublabel?: string;
  color: string;
  size: number;
  rawData: Contact | Project | Client | Candidate | Goal | FinancialEntry | Note;
  createdAt?: string; // ISO date for timeline filtering
  clusterId?: number; // assigned by cluster detection
}

// ─── LINK TYPES ─────────────────────────────────────────────────────────────

export type NexusLinkType =
  | 'contact-project'
  | 'contact-contact'
  | 'client-contact'
  | 'client-project'
  | 'candidate-project'
  | 'candidate-contact'
  | 'goal-project'
  | 'goal-goal'
  | 'note-contact'
  | 'note-project'
  | 'note-goal'
  | 'note-note'
  | 'financial-project'
  | 'financial-client'
  | 'project-project';

export const LINK_TYPE_LABELS: Record<NexusLinkType, string> = {
  'contact-project': 'Contact ↔ Project',
  'contact-contact': 'Contact ↔ Contact',
  'client-contact': 'Client ↔ Contact',
  'client-project': 'Client ↔ Project',
  'candidate-project': 'Candidate ↔ Project',
  'candidate-contact': 'Candidate ↔ Contact',
  'goal-project': 'Goal ↔ Project',
  'goal-goal': 'Goal ↔ Goal',
  'note-contact': 'Note ↔ Contact',
  'note-project': 'Note ↔ Project',
  'note-goal': 'Note ↔ Goal',
  'note-note': 'Note ↔ Note',
  'financial-project': 'Financial ↔ Project',
  'financial-client': 'Financial ↔ Client',
  'project-project': 'Project ↔ Project',
};

export interface NexusLink {
  source: string;
  target: string;
  label?: string;
  type: NexusLinkType;
}

// ─── FILTERS ────────────────────────────────────────────────────────────────

export interface NexusFilters {
  visibleTypes: Record<NexusNodeType, boolean>;
  visibleLinkTypes: Record<NexusLinkType, boolean>;
  search: string;
  timelineStart: string | null; // ISO date or null = no filter
  timelineEnd: string | null;
}

export const ALL_LINK_TYPES: NexusLinkType[] = [
  'contact-project', 'contact-contact', 'client-contact', 'client-project',
  'candidate-project', 'candidate-contact', 'goal-project', 'goal-goal',
  'note-contact', 'note-project', 'note-goal', 'note-note',
  'financial-project', 'financial-client', 'project-project',
];

const defaultLinkVisibility = Object.fromEntries(
  ALL_LINK_TYPES.map(t => [t, true])
) as Record<NexusLinkType, boolean>;

export const DEFAULT_NEXUS_FILTERS: NexusFilters = {
  visibleTypes: {
    contact: true,
    project: true,
    client: true,
    candidate: true,
    goal: true,
    financial: true,
    note: true,
  },
  visibleLinkTypes: defaultLinkVisibility,
  search: '',
  timelineStart: null,
  timelineEnd: null,
};

// ─── CLUSTERS ───────────────────────────────────────────────────────────────

export interface NexusCluster {
  id: number;
  nodeIds: string[];
  label: string;
  color: string;
}

// ─── PATH FINDING ───────────────────────────────────────────────────────────

export interface NexusPath {
  nodeIds: string[];
  linkTypes: NexusLinkType[];
  distance: number;
}
