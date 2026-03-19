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

export interface NexusLink {
  source: string;
  target: string;
  label?: string;
  type: NexusLinkType;
}

// ─── FILTERS ────────────────────────────────────────────────────────────────

export interface NexusFilters {
  visibleTypes: Record<NexusNodeType, boolean>;
  search: string;
}

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
  search: '',
};
