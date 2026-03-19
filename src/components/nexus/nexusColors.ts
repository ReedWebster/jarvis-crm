import type { NexusNodeType } from '../../types/nexus';

export const NODE_COLORS: Record<NexusNodeType, string> = {
  contact:   '#00D4FF', // electric cyan
  project:   '#00FF88', // neon green
  client:    '#FFB800', // bright amber
  candidate: '#B366FF', // vivid purple
  goal:      '#FF3366', // hot pink
  financial: '#00FFCC', // neon teal
  note:      '#8899AA', // muted steel
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
