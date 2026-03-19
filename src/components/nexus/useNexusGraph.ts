import { useMemo } from 'react';
import type { Contact, Project, Client, Candidate, Goal, FinancialEntry, Note, NetworkingMapState } from '../../types';
import type { NexusNode, NexusLink, NexusFilters } from '../../types/nexus';
import { NODE_COLORS } from './nexusColors';

// ─── SIZING HELPERS ─────────────────────────────────────────────────────────

function contactSize(c: Contact): number {
  let s = 2.5;
  s += Math.min(c.interactions.length * 0.3, 2);
  s += Math.min(c.linkedProjects.length * 0.8, 2);
  if (c.followUpNeeded) s += 0.5;
  return s;
}

function projectSize(p: Project): number {
  let s = 3.5;
  s += Math.min(p.keyContacts.length * 0.5, 2);
  s += Math.min((p.meetingNotes?.length ?? 0) * 0.3, 1.5);
  if (p.status === 'active') s += 1;
  if (p.health === 'red') s += 0.5;
  return s;
}

function clientSize(c: Client): number {
  let s = 3;
  if (c.contractValue > 0) s += Math.min(Math.log10(c.contractValue / 100), 2.5);
  if (c.status === 'active') s += 1;
  return s;
}

function goalSize(g: Goal): number {
  let s = 2;
  s += g.progress / 50;
  if (g.status === 'in-progress') s += 0.5;
  return s;
}

// ─── HOOK ───────────────────────────────────────────────────────────────────

interface UseNexusGraphArgs {
  contacts: Contact[];
  projects: Project[];
  clients: Client[];
  candidates: Candidate[];
  goals: Goal[];
  financialEntries: FinancialEntry[];
  notes: Note[];
  mapState: NetworkingMapState;
  filters: NexusFilters;
}

export function useNexusGraph({
  contacts, projects, clients, candidates, goals,
  financialEntries, notes, mapState, filters,
}: UseNexusGraphArgs): { nodes: NexusNode[]; links: NexusLink[] } {
  return useMemo(() => {
    const nodes: NexusNode[] = [];
    const links: NexusLink[] = [];
    const nodeIds = new Set<string>();
    const linkSet = new Set<string>(); // dedupe edges

    const addLink = (source: string, target: string, type: NexusLink['type'], label?: string) => {
      const key = [source, target].sort().join('::') + '::' + type;
      if (linkSet.has(key)) return;
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      linkSet.add(key);
      links.push({ source, target, type, label });
    };

    // ── Build nodes (filtered by type visibility + search) ──

    const q = filters.search.toLowerCase();
    const matchesSearch = (label: string, sublabel?: string) => {
      if (!q) return true;
      return label.toLowerCase().includes(q) || (sublabel?.toLowerCase().includes(q) ?? false);
    };

    // Contacts
    if (filters.visibleTypes.contact) {
      for (const c of contacts) {
        if (!matchesSearch(c.name, c.company)) continue;
        nodeIds.add(c.id);
        nodes.push({
          id: c.id, type: 'contact', label: c.name,
          sublabel: c.company || c.relationship,
          color: NODE_COLORS.contact, size: contactSize(c), rawData: c,
        });
      }
    }

    // Projects
    if (filters.visibleTypes.project) {
      for (const p of projects) {
        if (!matchesSearch(p.name, p.status)) continue;
        nodeIds.add(p.id);
        nodes.push({
          id: p.id, type: 'project', label: p.name,
          sublabel: `${p.status} · ${p.health}`,
          color: NODE_COLORS.project, size: projectSize(p), rawData: p,
        });
      }
    }

    // Clients
    if (filters.visibleTypes.client) {
      for (const c of clients) {
        if (!matchesSearch(c.name, c.company)) continue;
        nodeIds.add(c.id);
        nodes.push({
          id: c.id, type: 'client', label: c.name,
          sublabel: c.company,
          color: NODE_COLORS.client, size: clientSize(c), rawData: c,
        });
      }
    }

    // Candidates
    if (filters.visibleTypes.candidate) {
      for (const c of candidates) {
        if (!matchesSearch(c.name, c.role)) continue;
        nodeIds.add(c.id);
        nodes.push({
          id: c.id, type: 'candidate', label: c.name,
          sublabel: c.role,
          color: NODE_COLORS.candidate, size: 4, rawData: c,
        });
      }
    }

    // Goals
    if (filters.visibleTypes.goal) {
      for (const g of goals) {
        if (!matchesSearch(g.title, g.area)) continue;
        nodeIds.add(g.id);
        nodes.push({
          id: g.id, type: 'goal', label: g.title,
          sublabel: `${g.progress}% · ${g.area}`,
          color: NODE_COLORS.goal, size: goalSize(g), rawData: g,
        });
      }
    }

    // Financial (aggregate by ventureId — show unique ventures as nodes)
    if (filters.visibleTypes.financial) {
      const ventureMap = new Map<string, FinancialEntry[]>();
      for (const e of financialEntries) {
        const key = e.ventureId || '_personal';
        if (!ventureMap.has(key)) ventureMap.set(key, []);
        ventureMap.get(key)!.push(e);
      }
      for (const [ventureId, entries] of ventureMap) {
        const nodeId = `fin_${ventureId}`;
        const total = entries.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
        const label = ventureId === '_personal' ? 'Personal Finance' : entries[0]?.category || ventureId;
        if (!matchesSearch(label)) continue;
        nodeIds.add(nodeId);
        nodes.push({
          id: nodeId, type: 'financial', label,
          sublabel: `$${Math.abs(total).toLocaleString()}`,
          color: NODE_COLORS.financial, size: 3 + Math.min(Math.log10(Math.abs(total) + 1), 3),
          rawData: entries[0],
        });
      }
    }

    // Notes
    if (filters.visibleTypes.note) {
      for (const n of notes) {
        if (!matchesSearch(n.title, n.tags.join(' '))) continue;
        nodeIds.add(n.id);
        nodes.push({
          id: n.id, type: 'note', label: n.title,
          sublabel: n.tags.slice(0, 3).join(', ') || undefined,
          color: NODE_COLORS.note, size: 2 + (n.pinned ? 2 : 0), rawData: n,
        });
      }
    }

    // ── Build edges ──

    // Contact ↔ Project (via linkedProjects)
    for (const c of contacts) {
      for (const pid of c.linkedProjects) {
        addLink(c.id, pid, 'contact-project');
      }
    }

    // Contact ↔ Contact (manual connections from map state)
    for (const conn of mapState.manualConnections) {
      addLink(conn.sourceContactId, conn.targetContactId, 'contact-contact', conn.label);
    }

    // Contact ↔ Contact (shared projects — auto connections)
    if (mapState.showAutoConnections) {
      const projectContacts = new Map<string, string[]>();
      for (const c of contacts) {
        for (const pid of c.linkedProjects) {
          if (!projectContacts.has(pid)) projectContacts.set(pid, []);
          projectContacts.get(pid)!.push(c.id);
        }
      }
      for (const members of projectContacts.values()) {
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            addLink(members[i], members[j], 'contact-contact');
          }
        }
      }
    }

    // Client ↔ Contact (company name match)
    for (const cl of clients) {
      if (!cl.company) continue;
      const companyLower = cl.company.toLowerCase();
      for (const c of contacts) {
        if (c.company?.toLowerCase() === companyLower) {
          addLink(cl.id, c.id, 'client-contact');
        }
      }
    }

    // Client ↔ Project
    for (const cl of clients) {
      if (cl.linkedProjectId) {
        addLink(cl.id, cl.linkedProjectId, 'client-project');
      }
    }

    // Candidate ↔ Project (via linkedVentureId matching project id)
    for (const ca of candidates) {
      if (ca.linkedVentureId) {
        addLink(ca.id, ca.linkedVentureId, 'candidate-project');
      }
    }

    // Goal ↔ Project
    for (const g of goals) {
      if (g.linkedProjectId) {
        addLink(g.id, g.linkedProjectId, 'goal-project');
      }
    }

    // Note ↔ Contact / Project / Goal
    for (const n of notes) {
      if (n.linkedContactId) addLink(n.id, n.linkedContactId, 'note-contact');
      if (n.linkedProjectId) addLink(n.id, n.linkedProjectId, 'note-project');
      if (n.linkedGoalId) addLink(n.id, n.linkedGoalId, 'note-goal');
    }

    return { nodes, links };
  }, [contacts, projects, clients, candidates, goals, financialEntries, notes, mapState, filters]);
}
