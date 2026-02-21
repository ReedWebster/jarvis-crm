import type { Contact, Project, ContactMapData, NetworkingMapState, MapFilters, RelationshipStrength } from '../types';
import type { Edge } from '@xyflow/react';
import { differenceInDays, parseISO, isAfter, startOfDay } from 'date-fns';
import { generateId } from './index';

// ─── DEFAULTS ────────────────────────────────────────────────────────────────

export function defaultMapState(): NetworkingMapState {
  return {
    contactData: {},
    manualConnections: [],
    showAutoConnections: true,
    activeView: 'network',
  };
}

export function defaultContactMapData(contactId: string): ContactMapData {
  return {
    contactId,
    mapNotes: '',
    strength: 'cold',
  };
}

// ─── CONTACT QUERIES ─────────────────────────────────────────────────────────

export function getPlacedContacts(contacts: Contact[], contactData: Record<string, ContactMapData>): Contact[] {
  return contacts.filter(c => {
    const d = contactData[c.id];
    return d && d.lat !== undefined && d.lng !== undefined;
  });
}

export function getUnplacedContacts(contacts: Contact[], contactData: Record<string, ContactMapData>): Contact[] {
  return contacts.filter(c => {
    const d = contactData[c.id];
    return !d || d.lat === undefined || d.lng === undefined;
  });
}

export function getContactMapData(contactId: string, contactData: Record<string, ContactMapData>): ContactMapData {
  return contactData[contactId] ?? defaultContactMapData(contactId);
}

// ─── STRENGTH COLORS ─────────────────────────────────────────────────────────

export function getContactStrengthColor(strength: RelationshipStrength): string {
  switch (strength) {
    case 'hot':      return '#dc2626';
    case 'warm':     return '#d97706';
    case 'cold':     return '#3b82f6';
    case 'personal': return '#6b7280';
    default:         return '#6b7280';
  }
}

export function strengthLabel(strength: RelationshipStrength): string {
  switch (strength) {
    case 'hot':      return 'Hot Lead';
    case 'warm':     return 'Warm';
    case 'cold':     return 'Cold';
    case 'personal': return 'Personal';
  }
}

// ─── INITIALS ────────────────────────────────────────────────────────────────

export function getContactInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

// ─── IMAGE COMPRESSION ───────────────────────────────────────────────────────

export function compressImage(file: File, maxPx = 80): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      canvas.width = maxPx;
      canvas.height = maxPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxPx, maxPx);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── AUTO EDGES (React Flow) ──────────────────────────────────────────────────

export function buildAutoEdges(contacts: Contact[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];
      const shared = a.linkedProjects.filter(pid => b.linkedProjects.includes(pid));
      if (shared.length > 0) {
        const key = [a.id, b.id].sort().join('-');
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            id: `auto-${key}`,
            source: a.id,
            target: b.id,
            type: 'smoothstep',
            animated: true,
            label: `${shared.length} shared project${shared.length > 1 ? 's' : ''}`,
            style: {
              strokeWidth: Math.min(1 + shared.length, 4),
              stroke: 'var(--border-strong)',
            },
            labelStyle: { fontSize: 10, fill: 'var(--text-muted)' },
            data: { sharedCount: shared.length, isAuto: true },
          });
        }
      }
    }
  }
  return edges;
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────

export function applyFilters(
  contacts: Contact[],
  projects: Project[],
  mapState: NetworkingMapState,
  filters: MapFilters,
): Set<string> {
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const today = startOfDay(new Date());

  const result = new Set<string>();

  for (const c of contacts) {
    const data = mapState.contactData[c.id];

    // Venture filter — contacts linked to a specific project
    if (filters.ventureId !== 'all') {
      if (!c.linkedProjects.includes(filters.ventureId)) continue;
    }

    // Relationship type filter (tags)
    if (filters.relationshipType !== 'all') {
      if (!c.tags.includes(filters.relationshipType as never)) continue;
    }

    // Location filter
    if (filters.location !== 'all' && filters.location !== '') {
      if (data?.locationLabel !== filters.location) continue;
    }

    // Strength filter
    if (filters.strength !== 'all') {
      if ((data?.strength ?? 'cold') !== filters.strength) continue;
    }

    // Follow-up filter
    if (filters.followUpOnly) {
      if (!c.followUpNeeded) continue;
    }

    // Search filter
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      const matches =
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.relationship ?? '').toLowerCase().includes(q);
      if (!matches) continue;
    }

    result.add(c.id);
  }

  return result;
}

// ─── FOLLOW-UP HELPERS ───────────────────────────────────────────────────────

export type FollowUpUrgency = 'overdue' | 'today' | 'upcoming';

export function getFollowUpUrgency(contact: Contact): FollowUpUrgency | null {
  if (!contact.followUpNeeded || !contact.followUpDate) return null;
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(contact.followUpDate));
  const diff = differenceInDays(due, today);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

export function isFollowUpPending(contact: Contact): boolean {
  if (!contact.followUpNeeded || !contact.followUpDate) return false;
  const today = startOfDay(new Date());
  const due = parseISO(contact.followUpDate);
  return !isAfter(due, today) || differenceInDays(due, today) === 0 || differenceInDays(due, today) < 0;
}

// ─── LAST CONTACTED COLOR ────────────────────────────────────────────────────

export function getLastContactedColor(lastContacted: string): string {
  if (!lastContacted) return '#6b7280';
  const days = differenceInDays(new Date(), parseISO(lastContacted));
  if (days <= 7)  return '#22c55e';
  if (days <= 30) return '#d97706';
  return '#ef4444';
}

// ─── NODE LAYOUT ─────────────────────────────────────────────────────────────

export function autoLayoutNodes(
  contacts: Contact[],
  currentData: Record<string, ContactMapData>,
): Record<string, ContactMapData> {
  const updated = { ...currentData };

  // Group contacts by their first tag (or 'Other')
  const groups: Record<string, Contact[]> = {};
  for (const c of contacts) {
    const group = c.tags[0] ?? 'Other';
    if (!groups[group]) groups[group] = [];
    groups[group].push(c);
  }

  const COL_WIDTH = 200;
  const ROW_HEIGHT = 160;
  const COLS = 4;

  let col = 0;
  let row = 0;

  for (const [, groupContacts] of Object.entries(groups)) {
    for (const c of groupContacts) {
      updated[c.id] = {
        ...(updated[c.id] ?? defaultContactMapData(c.id)),
        nodeX: col * COL_WIDTH + 80,
        nodeY: row * ROW_HEIGHT + 80,
      };
      col++;
      if (col >= COLS) { col = 0; row++; }
    }
    // Add gap between groups
    col = 0;
    row++;
  }

  return updated;
}

// ─── NOMINATIM REVERSE GEOCODE ───────────────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } },
    );
    if (!res.ok) return '';
    const data = await res.json();
    const addr = data.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
    const state = addr.state ?? '';
    return [city, state].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

// ─── GENERATE CONNECTION ID ───────────────────────────────────────────────────

export { generateId };
