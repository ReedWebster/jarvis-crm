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

    // ══════════════════════════════════════════════════════════════════════════
    // BUILD EDGES — connect everything that's related
    // ══════════════════════════════════════════════════════════════════════════

    // ── 1. Contact ↔ Project (explicit linkedProjects) ──
    for (const c of contacts) {
      for (const pid of c.linkedProjects) {
        addLink(c.id, pid, 'contact-project');
      }
    }

    // ── 2. Contact ↔ Contact (manual connections from networking map) ──
    for (const conn of mapState.manualConnections) {
      addLink(conn.sourceContactId, conn.targetContactId, 'contact-contact', conn.label);
    }

    // ── 3. Contact ↔ Contact (shared projects) ──
    const projectContactsMap = new Map<string, string[]>();
    for (const c of contacts) {
      for (const pid of c.linkedProjects) {
        if (!projectContactsMap.has(pid)) projectContactsMap.set(pid, []);
        projectContactsMap.get(pid)!.push(c.id);
      }
    }
    for (const members of projectContactsMap.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'contact-contact');
        }
      }
    }

    // ── 4. Contact ↔ Contact (same company) ──
    const companyContacts = new Map<string, string[]>();
    for (const c of contacts) {
      if (!c.company) continue;
      const key = c.company.toLowerCase().trim();
      if (!key) continue;
      if (!companyContacts.has(key)) companyContacts.set(key, []);
      companyContacts.get(key)!.push(c.id);
    }
    for (const members of companyContacts.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'contact-contact');
        }
      }
    }

    // ── 5. Contact ↔ Contact (shared tags — connects people in same circles) ──
    const tagContacts = new Map<string, string[]>();
    for (const c of contacts) {
      for (const tag of c.tags) {
        const key = tag.toLowerCase().trim();
        if (!key) continue;
        if (!tagContacts.has(key)) tagContacts.set(key, []);
        tagContacts.get(key)!.push(c.id);
      }
    }
    for (const members of tagContacts.values()) {
      if (members.length > 15) continue; // skip overly broad tags
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'contact-contact');
        }
      }
    }

    // ── 6. Contact ↔ Contact (met at the same place) ──
    const metAtContacts = new Map<string, string[]>();
    for (const c of contacts) {
      if (!c.metAt) continue;
      const key = c.metAt.toLowerCase().trim();
      if (!key) continue;
      if (!metAtContacts.has(key)) metAtContacts.set(key, []);
      metAtContacts.get(key)!.push(c.id);
    }
    for (const members of metAtContacts.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'contact-contact');
        }
      }
    }

    // ── 7. Project ↔ Contact (keyContacts name match) ──
    const contactNameMap = new Map<string, string>();
    for (const c of contacts) {
      contactNameMap.set(c.name.toLowerCase().trim(), c.id);
    }
    for (const p of projects) {
      for (const name of p.keyContacts) {
        const cid = contactNameMap.get(name.toLowerCase().trim());
        if (cid) addLink(p.id, cid, 'contact-project');
      }
    }

    // ── 8. Project ↔ Project (shared key contacts) ──
    const contactProjects = new Map<string, string[]>();
    for (const p of projects) {
      for (const name of p.keyContacts) {
        const key = name.toLowerCase().trim();
        if (!contactProjects.has(key)) contactProjects.set(key, []);
        contactProjects.get(key)!.push(p.id);
      }
    }
    for (const pids of contactProjects.values()) {
      for (let i = 0; i < pids.length; i++) {
        for (let j = i + 1; j < pids.length; j++) {
          addLink(pids[i], pids[j], 'project-project');
        }
      }
    }

    // ── 9. Client ↔ Contact (company name match) ──
    for (const cl of clients) {
      if (!cl.company) continue;
      const companyLower = cl.company.toLowerCase().trim();
      for (const c of contacts) {
        if (c.company?.toLowerCase().trim() === companyLower) {
          addLink(cl.id, c.id, 'client-contact');
        }
      }
    }

    // ── 10. Client ↔ Project (explicit link) ──
    for (const cl of clients) {
      if (cl.linkedProjectId) {
        addLink(cl.id, cl.linkedProjectId, 'client-project');
      }
    }

    // ── 11. Client ↔ Contact (client name matches a contact name) ──
    for (const cl of clients) {
      const cid = contactNameMap.get(cl.name.toLowerCase().trim());
      if (cid) addLink(cl.id, cid, 'client-contact');
    }

    // ── 12. Candidate ↔ Project (via linkedVentureId) ──
    for (const ca of candidates) {
      if (ca.linkedVentureId) {
        addLink(ca.id, ca.linkedVentureId, 'candidate-project');
      }
    }

    // ── 13. Candidate ↔ Contact (same organization as a contact's company) ──
    for (const ca of candidates) {
      if (!ca.organization) continue;
      const orgLower = ca.organization.toLowerCase().trim();
      for (const c of contacts) {
        if (c.company?.toLowerCase().trim() === orgLower) {
          addLink(ca.id, c.id, 'candidate-contact');
        }
      }
    }

    // ── 14. Candidate ↔ Candidate (same organization) ──
    const orgCandidates = new Map<string, string[]>();
    for (const ca of candidates) {
      if (!ca.organization) continue;
      const key = ca.organization.toLowerCase().trim();
      if (!orgCandidates.has(key)) orgCandidates.set(key, []);
      orgCandidates.get(key)!.push(ca.id);
    }
    for (const members of orgCandidates.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'candidate-contact');
        }
      }
    }

    // ── 15. Goal ↔ Project (explicit link) ──
    for (const g of goals) {
      if (g.linkedProjectId) {
        addLink(g.id, g.linkedProjectId, 'goal-project');
      }
    }

    // ── 16. Goal ↔ Goal (same life area — ventures, academic, health, etc.) ──
    const areaGoals = new Map<string, string[]>();
    for (const g of goals) {
      if (!areaGoals.has(g.area)) areaGoals.set(g.area, []);
      areaGoals.get(g.area)!.push(g.id);
    }
    for (const members of areaGoals.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'goal-goal');
        }
      }
    }

    // ── 17. Goal ↔ Goal (parent-child hierarchy) ──
    for (const g of goals) {
      if (g.parentId) {
        addLink(g.id, g.parentId, 'goal-goal');
      }
    }

    // ── 18. Note ↔ Contact / Project / Goal (explicit links) ──
    for (const n of notes) {
      if (n.linkedContactId) addLink(n.id, n.linkedContactId, 'note-contact');
      if (n.linkedProjectId) addLink(n.id, n.linkedProjectId, 'note-project');
      if (n.linkedGoalId) addLink(n.id, n.linkedGoalId, 'note-goal');
    }

    // ── 19. Note ↔ Note (shared tags) ──
    const tagNotes = new Map<string, string[]>();
    for (const n of notes) {
      for (const tag of n.tags) {
        const key = tag.toLowerCase().trim();
        if (!key) continue;
        if (!tagNotes.has(key)) tagNotes.set(key, []);
        tagNotes.get(key)!.push(n.id);
      }
    }
    for (const members of tagNotes.values()) {
      if (members.length > 10) continue; // skip overly broad
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addLink(members[i], members[j], 'note-note');
        }
      }
    }

    // ── 20. Note ↔ Contact (meeting attendees match contact names) ──
    for (const n of notes) {
      if (!n.isMeetingNote || !n.meetingAttendees) continue;
      const attendees = n.meetingAttendees.toLowerCase().split(/[,;]+/);
      for (const a of attendees) {
        const trimmed = a.trim();
        if (!trimmed) continue;
        const cid = contactNameMap.get(trimmed);
        if (cid) addLink(n.id, cid, 'note-contact');
      }
    }

    // ── 21. Financial ↔ Project (ventureId matches a project name) ──
    const projectNameMap = new Map<string, string>();
    for (const p of projects) {
      projectNameMap.set(p.name.toLowerCase().trim(), p.id);
    }
    for (const e of financialEntries) {
      if (!e.ventureId) continue;
      // Try matching ventureId to project by ID first, then by name
      if (nodeIds.has(e.ventureId)) {
        addLink(`fin_${e.ventureId}`, e.ventureId, 'financial-project');
      }
      const pid = projectNameMap.get(e.ventureId.toLowerCase().trim());
      if (pid) addLink(`fin_${e.ventureId}`, pid, 'financial-project');
    }

    // ── 22. Financial ↔ Client (venture name matches client company) ──
    for (const cl of clients) {
      if (!cl.company) continue;
      const companyLower = cl.company.toLowerCase().trim();
      for (const e of financialEntries) {
        if (!e.ventureId) continue;
        if (e.ventureId.toLowerCase().trim() === companyLower) {
          addLink(`fin_${e.ventureId}`, cl.id, 'financial-client');
        }
      }
    }

    // ── 23. Contact ↔ Project (contact name mentioned in project notes) ──
    for (const p of projects) {
      if (!p.notes) continue;
      const notesLower = p.notes.toLowerCase();
      for (const c of contacts) {
        if (c.name.length < 3) continue; // skip very short names
        if (notesLower.includes(c.name.toLowerCase())) {
          addLink(c.id, p.id, 'contact-project');
        }
      }
    }

    return { nodes, links };
  }, [contacts, projects, clients, candidates, goals, financialEntries, notes, mapState, filters]);
}
