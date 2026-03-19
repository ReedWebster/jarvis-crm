import type { NexusNodeType } from '../../types/nexus';

export const NODE_COLORS: Record<NexusNodeType, string> = {
  contact:   '#60A5FA', // ice blue
  project:   '#34D399', // emerald
  client:    '#FBBF24', // amber
  candidate: '#A78BFA', // purple
  goal:      '#FB7185', // rose
  financial: '#2DD4BF', // teal
  note:      '#94A3B8', // slate
};

export const NODE_LABELS: Record<NexusNodeType, string> = {
  contact:   'Contacts',
  project:   'Projects',
  client:    'Clients',
  candidate: 'Candidates',
  goal:      'Goals',
  financial: 'Financial',
  note:      'Notes',
};

export const LINK_COLOR = 'rgba(255,255,255,0.12)';
export const LINK_HIGHLIGHT_COLOR = 'rgba(255,255,255,0.55)';
export const BG_COLOR = '#06060b';
