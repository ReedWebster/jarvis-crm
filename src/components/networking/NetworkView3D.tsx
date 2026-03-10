import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { X, Zap, ZapOff, UserPlus, Link2, Link2Off, Search, Maximize2, Minimize2, Layers, AlertCircle } from 'lucide-react';
import type {
  Contact,
  Project,
  ContactMapData,
  NetworkingMapState,
  NetworkManualConnection,
  ContactTag,
} from '../../types';
import { generateId } from '../../utils';
import {
  getContactStrengthColor,
  buildAutoEdges,
  defaultContactMapData,
  isFollowUpPending,
  getFollowUpUrgency,
} from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  color: string;
  val: number;
  dimmed: boolean;
  hasPending: boolean;
  urgency: 'overdue' | 'today' | 'upcoming' | null;
  contact: Contact;
  mapData: ContactMapData;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  isAuto: boolean;
  connId?: string;
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
  projects: Project[];
  mapState: NetworkingMapState;
  filteredIds: Set<string>;
  onUpdateMapData: (contactId: string, data: Partial<ContactMapData>) => void;
  onUpdateContact: (updated: Contact) => void;
  onToggleAutoConnections: () => void;
  onSaveManualConnection: (conn: NetworkManualConnection) => void;
  onDeleteManualConnection: (id: string) => void;
  onUpdateNodePositions: (updates: Record<string, ContactMapData>) => void;
  onNavigateToCRM: () => void;
  onAddContact: (contact: Contact) => void;
}

// ─── ALL TAGS ─────────────────────────────────────────────────────────────────

const ALL_TAGS: ContactTag[] = [
  'Investor', 'Professor', 'Resident', 'Partner', 'Friend',
  'Recruit', 'Mentor', 'Client', 'Colleague', 'Family', 'Other',
];

// ─── GROUP COLORS ─────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  Investor: '#10b981', Professor: '#8b5cf6', Resident: '#f59e0b',
  Partner: '#ec4899', Friend: '#06b6d4', Recruit: '#f97316',
  Mentor: '#a78bfa', Client: '#34d399', Colleague: '#60a5fa',
  Family: '#fb7185', Other: '#6b7280',
};
const STRENGTH_COLORS: Record<string, string> = {
  hot: '#dc2626', warm: '#d97706', cold: '#3b82f6', personal: '#8b5cf6',
};
const FOLLOWUP_COLORS: Record<string, string> = {
  overdue: '#ef4444', today: '#f97316', upcoming: '#fbbf24', ok: '#3b82f6',
};
const AUTO_PALETTE = [
  '#06b6d4','#10b981','#f59e0b','#ec4899','#8b5cf6','#f97316',
  '#a78bfa','#34d399','#60a5fa','#fb7185','#fbbf24','#4ade80',
  '#38bdf8','#c084fc','#f472b6','#fb923c','#a3e635','#2dd4bf',
  '#818cf8','#e879f9',
];

// ─── CONNECTION LABEL MODAL ───────────────────────────────────────────────────

function ConnectionModal({
  sourceName, targetName, onSave, onClose,
}: { sourceName: string; targetName: string; onSave: (label: string) => void; onClose: () => void }) {
  const [label, setLabel] = useState('');
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl border shadow-2xl w-80 p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Connection Label</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sourceName} → {targetName}</div>
        <div>
          <div className="caesar-label">Connection Type</div>
          <input className="caesar-input" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Introduced by, Co-founder, Classmate..." autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSave(label); }} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSave(label)} className="caesar-btn-primary flex-1">Save Connection</button>
          <button onClick={onClose} className="caesar-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD CONTACT MODAL ────────────────────────────────────────────────────────

function AddContactModal({ onSave, onClose }: { onSave: (c: Contact) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [tag, setTag] = useState<ContactTag>('Other');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: generateId(), name: name.trim(), email: email.trim() || undefined,
      relationship: relationship.trim(), tags: [tag],
      lastContacted: new Date().toISOString().slice(0, 10),
      followUpNeeded: false, notes: '', interactions: [], linkedProjects: [],
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl border shadow-2xl w-80 p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Add Contact</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="caesar-label">Name *</label>
            <input className="caesar-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
          </div>
          <div>
            <label className="caesar-label">Email</label>
            <input className="caesar-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label className="caesar-label">Relationship</label>
            <input className="caesar-input" value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Business contact" />
          </div>
          <div>
            <label className="caesar-label">Type</label>
            <select className="caesar-select" value={tag} onChange={e => setTag(e.target.value as ContactTag)}>
              {ALL_TAGS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!name.trim()} className="caesar-btn-primary flex-1">Add Contact</button>
          <button onClick={onClose} className="caesar-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── CMD+K MODAL ──────────────────────────────────────────────────────────────

function CmdKModal({
  contacts,
  onSelect,
  onClose,
}: { contacts: Contact[]; onSelect: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const results = useMemo(() => {
    if (!q.trim()) return contacts.slice(0, 8);
    const lower = q.toLowerCase();
    return contacts
      .filter(c =>
        c.name.toLowerCase().includes(lower) ||
        (c.company ?? '').toLowerCase().includes(lower) ||
        c.tags.some(t => t.toLowerCase().includes(lower))
      )
      .slice(0, 8);
  }, [q, contacts]);

  useEffect(() => { setActiveIdx(0); }, [results]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) onSelect(results[activeIdx].id);
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-[480px] rounded-xl border shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#0a0a18', borderColor: 'rgba(255,255,255,0.12)' }}
        onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <Search size={14} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'rgba(255,255,255,0.9)' }}
            placeholder="Fly to contact…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>ESC</kbd>
        </div>
        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No contacts found</div>
          ) : results.map((c, i) => (
            <button
              key={c.id}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                backgroundColor: i === activeIdx ? 'rgba(139,92,246,0.15)' : 'transparent',
                borderLeft: i === activeIdx ? '2px solid #8b5cf6' : '2px solid transparent',
              }}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onSelect(c.id)}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: TAG_COLORS[c.tags[0]] ?? '#6b7280' }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{c.name}</div>
                {c.company && <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.company}</div>}
              </div>
              <div className="ml-auto flex-shrink-0">
                {c.tags[0] && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${TAG_COLORS[c.tags[0]] ?? '#6b7280'}22`, color: TAG_COLORS[c.tags[0]] ?? '#6b7280' }}>
                    {c.tags[0]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t flex items-center gap-4 text-xs" style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}>
          <span>↑↓ navigate</span><span>↵ fly to</span><span>ESC close</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function NetworkView3D({
  contacts,
  projects,
  mapState,
  filteredIds,
  onUpdateMapData,
  onUpdateContact,
  onToggleAutoConnections,
  onSaveManualConnection,
  onDeleteManualConnection,
  onNavigateToCRM,
  onAddContact,
}: Props) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Track container size so ForceGraph3D fills it exactly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setDims({ w: Math.floor(width), h: Math.floor(height) });
    return () => obs.disconnect();
  }, []);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedMapData, setSelectedMapData] = useState<ContactMapData | null>(null);
  const [graphSearch, setGraphSearch] = useState('');
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [pendingConn, setPendingConn] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  type GroupBy = 'none' | 'tag' | 'strength' | 'company' | 'followup';
  const [groupBy, setGroupBy] = useState<GroupBy>('tag');
  const clusterLabelsRef = useRef<SpriteText[]>([]);
  const graphDataNodesRef = useRef<any[]>([]);
  // Map from node id → pulse ring mesh, for animation
  const pulseRingsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const pulseRAFRef = useRef<number>(0);
  // Starfield Three.js Points object
  const starfieldRef = useRef<THREE.Points | null>(null);
  // Glow texture cache by color hex
  const glowTextureCache = useRef<Map<string, THREE.Texture>>(new Map());
  // Double-click detection
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen(o => !o);
        return;
      }
      if (e.key === 'Escape') {
        if (cmdkOpen) { setCmdkOpen(false); return; }
        if (focusedNodeId) { setFocusedNodeId(null); return; }
        if (fullscreen) setFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cmdkOpen, focusedNodeId, fullscreen]);

  // Track mouse for tooltip positioning
  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // ─── PULSE + STARFIELD ANIMATION ─────────────────────────────────────────

  useEffect(() => {
    const animate = () => {
      const t = Date.now() / 1000;
      // Pulse rings
      pulseRingsRef.current.forEach(ring => {
        const scale = 1 + 0.3 * Math.sin(t * 2.2 + (ring.userData.phase ?? 0));
        ring.scale.setScalar(scale);
        (ring.material as THREE.MeshBasicMaterial).opacity =
          0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2 + (ring.userData.phase ?? 0)));
      });
      // Slowly rotate starfield
      if (starfieldRef.current) {
        starfieldRef.current.rotation.y += 0.00008;
        starfieldRef.current.rotation.x += 0.00003;
      }
      pulseRAFRef.current = requestAnimationFrame(animate);
    };
    pulseRAFRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(pulseRAFRef.current);
  }, []);

  // ─── STARFIELD ────────────────────────────────────────────────────────────

  useEffect(() => {
    let stars: THREE.Points | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;

    const timer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      try {
        const scene = fg.scene();
        if (!scene) return;

        const COUNT = 2200;
        const positions = new Float32Array(COUNT * 3);
        const opacities = new Float32Array(COUNT);

        for (let i = 0; i < COUNT; i++) {
          // Uniform distribution on a sphere shell between radius 500–900
          const r = 500 + Math.random() * 400;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          positions[i * 3 + 2] = r * Math.cos(phi);
          opacities[i] = 0.3 + Math.random() * 0.7;
        }

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        material = new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.9,
          transparent: true,
          opacity: 0.55,
          sizeAttenuation: true,
          depthWrite: false,
        });

        stars = new THREE.Points(geometry, material);
        stars.userData.isStarfield = true;
        scene.add(stars);
        starfieldRef.current = stars;
      } catch { /* scene not ready */ }
    }, 600);

    return () => {
      clearTimeout(timer);
      if (stars && fgRef.current) {
        try { fgRef.current.scene()?.remove(stars); } catch { /* ignore */ }
      }
      geometry?.dispose();
      material?.dispose();
      starfieldRef.current = null;
    };
  }, []);

  // Keep dims in sync when fullscreen toggles
  useEffect(() => {
    if (fullscreen) {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    } else {
      const el = containerRef.current;
      if (el) {
        const { width, height } = el.getBoundingClientRect();
        if (width > 0 && height > 0) setDims({ w: Math.floor(width), h: Math.floor(height) });
      }
    }
  }, [fullscreen]);

  // Fit camera after engine settles
  const doZoomToFit = useCallback(() => {
    fgRef.current?.zoomToFit(800, 80);
  }, []);

  useEffect(() => {
    const t = setTimeout(doZoomToFit, 2000);
    return () => clearTimeout(t);
  }, [doZoomToFit]);

  // Fly camera to a contact node
  const flyToContact = useCallback((contactId: string) => {
    const node = graphDataNodesRef.current.find(n => n.id === contactId);
    if (!node || !fgRef.current) return;
    const x = node.x ?? 0, y = node.y ?? 0, z = node.z ?? 0;
    fgRef.current.cameraPosition(
      { x: x + 80, y: y + 40, z: z + 80 },
      { x, y, z },
      1200,
    );
    setCmdkOpen(false);
  }, []);

  const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const graphSearchLower = graphSearch.trim().toLowerCase();

  // ─── CLUSTER INFO ───────────────────────────────────────────────────────────

  interface ClusterInfo {
    nodeGroups: Record<string, string>;
    nodeColors: Record<string, string>;
    centroids: Record<string, { x: number; y: number; z: number }>;
    groupColors: Record<string, string>;
    groupList: string[];
  }

  const clusterInfo = useMemo((): ClusterInfo | null => {
    if (groupBy === 'none') return null;

    const getGroupName = (c: Contact): string => {
      if (groupBy === 'tag') return c.tags[0] ?? 'Other';
      if (groupBy === 'strength') {
        const md = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
        return md.strength ?? 'cold';
      }
      if (groupBy === 'company') return c.company?.trim() || 'Unknown';
      if (groupBy === 'followup') {
        const urgency = getFollowUpUrgency(c);
        return urgency ?? 'ok';
      }
      return 'All';
    };

    const rawGroups: Record<string, string> = {};
    contacts.forEach(c => { rawGroups[c.id] = getGroupName(c); });

    let nodeGroups = rawGroups;
    if (groupBy === 'company') {
      const counts: Record<string, number> = {};
      Object.values(rawGroups).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
      const topSet = new Set(
        Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(e => e[0])
      );
      nodeGroups = {};
      Object.entries(rawGroups).forEach(([id, g]) => {
        nodeGroups[id] = topSet.has(g) ? g : 'Other';
      });
    }

    const groupList = Array.from(new Set(Object.values(nodeGroups))).sort();

    const groupColors: Record<string, string> = {};
    groupList.forEach((g, i) => {
      if (groupBy === 'tag') groupColors[g] = TAG_COLORS[g] ?? AUTO_PALETTE[i % AUTO_PALETTE.length];
      else if (groupBy === 'strength') groupColors[g] = STRENGTH_COLORS[g] ?? AUTO_PALETTE[i % AUTO_PALETTE.length];
      else if (groupBy === 'followup') groupColors[g] = FOLLOWUP_COLORS[g] ?? AUTO_PALETTE[i % AUTO_PALETTE.length];
      else groupColors[g] = AUTO_PALETTE[i % AUTO_PALETTE.length];
    });

    const RADIUS = Math.max(120, groupList.length * 18);
    const centroids: Record<string, { x: number; y: number; z: number }> = {};
    groupList.forEach((g, i) => {
      const angle = (i / groupList.length) * Math.PI * 2;
      centroids[g] = { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS, z: 0 };
    });

    const nodeColors: Record<string, string> = {};
    Object.entries(nodeGroups).forEach(([id, g]) => { nodeColors[id] = groupColors[g]; });

    return { nodeGroups, nodeColors, centroids, groupColors, groupList };
  }, [groupBy, contacts, mapState]);

  // ─── FOCUS MODE — compute 1st-degree connected set ───────────────────────

  const focusConnectedIds = useMemo((): Set<string> | null => {
    if (!focusedNodeId) return null;
    const ids = new Set<string>([focusedNodeId]);
    if (mapState.showAutoConnections) {
      buildAutoEdges(contacts).forEach(e => {
        if (e.source === focusedNodeId) ids.add(String(e.target));
        if (e.target === focusedNodeId) ids.add(String(e.source));
      });
    }
    mapState.manualConnections.forEach(conn => {
      if (conn.sourceContactId === focusedNodeId) ids.add(conn.targetContactId);
      if (conn.targetContactId === focusedNodeId) ids.add(conn.sourceContactId);
    });
    return ids;
  }, [focusedNodeId, contacts, mapState]);

  // ─── GRAPH DATA ─────────────────────────────────────────────────────────────

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = contacts.map(c => {
      const md = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
      const matchesSearch = !graphSearchLower
        || c.name.toLowerCase().includes(graphSearchLower)
        || (c.company ?? '').toLowerCase().includes(graphSearchLower)
        || c.tags.some(t => t.toLowerCase().includes(graphSearchLower));

      const dimmed = focusConnectedIds
        ? !focusConnectedIds.has(c.id)
        : (filteredIds.size > 0 && !filteredIds.has(c.id))
          || (graphSearchLower.length > 0 && !matchesSearch);

      const baseColor = clusterInfo?.nodeColors[c.id] ?? getContactStrengthColor(md.strength ?? 'cold');
      const urgency = getFollowUpUrgency(c);

      return {
        id: c.id,
        name: c.name,
        color: dimmed ? '#151525' : baseColor,
        val: Math.max(4, 3 + c.interactions.length * 0.5),
        dimmed,
        hasPending: isFollowUpPending(c),
        urgency,
        contact: c,
        mapData: md,
      };
    });

    const autoLinks: GraphLink[] = mapState.showAutoConnections
      ? buildAutoEdges(contacts).map(e => ({
          source: e.source, target: e.target, label: String(e.label ?? ''), isAuto: true,
        }))
      : [];

    const manualLinks: GraphLink[] = mapState.manualConnections
      .filter(c => contactMap.has(c.sourceContactId) && contactMap.has(c.targetContactId))
      .map(conn => ({
        source: conn.sourceContactId, target: conn.targetContactId,
        label: conn.label ?? '', isAuto: false, connId: conn.id,
      }));

    return { nodes, links: [...autoLinks, ...manualLinks] };
  }, [contacts, mapState, filteredIds, graphSearchLower, contactMap, clusterInfo, focusConnectedIds]);

  // Keep nodes ref in sync
  useEffect(() => { graphDataNodesRef.current = graphData.nodes as any[]; }, [graphData]);

  // ─── CLUSTER FORCE ───────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      if (!clusterInfo) {
        fg.d3Force('cluster', null);
        fg.d3ReheatSimulation();
        return;
      }
      const { nodeGroups, centroids } = clusterInfo;
      const clusterForce = (alpha: number) => {
        graphDataNodesRef.current.forEach(node => {
          const group = nodeGroups[node.id];
          const centroid = centroids[group];
          if (!centroid) return;
          const k = alpha * 0.06;
          node.vx = (node.vx || 0) + (centroid.x - (node.x || 0)) * k;
          node.vy = (node.vy || 0) + (centroid.y - (node.y || 0)) * k;
          node.vz = (node.vz || 0) + (centroid.z - (node.z || 0)) * k;
        });
      };
      fg.d3Force('cluster', clusterForce);
      fg.d3ReheatSimulation();
    }, 500);
    return () => clearTimeout(timer);
  }, [clusterInfo]);

  // ─── CLUSTER SCENE LABELS ────────────────────────────────────────────────────

  useEffect(() => {
    const fg = fgRef.current;
    const cleanupLabels = () => {
      if (!fg) return;
      try {
        const scene = fg.scene();
        clusterLabelsRef.current.forEach(s => scene.remove(s));
      } catch { /* scene may not be ready */ }
      clusterLabelsRef.current = [];
    };
    cleanupLabels();
    if (!clusterInfo || !fg) return;
    const addLabels = () => {
      try {
        const scene = fg.scene();
        if (!scene) return;
        Object.entries(clusterInfo.centroids).forEach(([groupName, pos]) => {
          const sprite = new SpriteText(groupName.toUpperCase());
          sprite.color = clusterInfo.groupColors[groupName] ?? 'rgba(255,255,255,0.9)';
          sprite.textHeight = 9;
          sprite.fontWeight = 'bold';
          sprite.backgroundColor = 'rgba(5,5,18,0.75)';
          sprite.padding = 4;
          sprite.borderRadius = 4;
          (sprite as any).position.set(pos.x, pos.y + 60, pos.z);
          scene.add(sprite);
          clusterLabelsRef.current.push(sprite);
        });
      } catch { /* scene may not be ready */ }
    };
    const timer = setTimeout(addLabels, 250);
    return () => { clearTimeout(timer); cleanupLabels(); };
  }, [clusterInfo]);

  // ─── GLOW TEXTURE FACTORY ────────────────────────────────────────────────

  const makeGlowTexture = useCallback((hex: string): THREE.Texture => {
    const cached = glowTextureCache.current.get(hex);
    if (cached) return cached;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const cx = size / 2, cy = size / 2, r = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   hex + 'cc'); // centre ~80%
    grad.addColorStop(0.25, hex + '88');
    grad.addColorStop(0.6,  hex + '33');
    grad.addColorStop(1,    hex + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    glowTextureCache.current.set(hex, tex);
    return tex;
  }, []);

  // ─── NODE RENDERING ──────────────────────────────────────────────────────────

  const nodeThreeObject = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GraphNode;
    const group = new THREE.Group();

    // ── Glow sprite (behind node sphere) ──────────────────────────────────
    if (!node.dimmed) {
      // Convert node.color (could be "rgba(...)" or "#rrggbb") to a hex for the texture key
      const hexColor = node.color.startsWith('#') ? node.color : '#ffffff';
      const glowTex = makeGlowTexture(hexColor);
      const glowSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: node.mapData.strength === 'hot' ? 0.9 : 0.65,
        }),
      );
      const glowSize = node.val * 7;
      glowSprite.scale.set(glowSize, glowSize, 1);
      (glowSprite as any).position.set(0, 0, -0.5); // slightly behind
      group.add(glowSprite);
    }

    // ── Text label ────────────────────────────────────────────────────────
    const sprite = new SpriteText(node.name);
    sprite.color = node.dimmed ? '#2a2a4a' : 'rgba(255,255,255,0.92)';
    sprite.textHeight = Math.max(2.5, node.val * 0.55);
    sprite.fontWeight = '600';
    sprite.backgroundColor = node.dimmed ? 'transparent' : 'rgba(5,5,18,0.65)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    group.add(sprite as unknown as THREE.Object3D);

    // ── Pulse ring for hot/warm/overdue nodes ─────────────────────────────
    if (!node.dimmed && (node.mapData.strength === 'hot' || node.mapData.strength === 'warm' || node.hasPending)) {
      const ringColor = node.hasPending
        ? '#ef4444'
        : node.mapData.strength === 'hot' ? '#dc2626' : '#d97706';
      const size = node.val * 2.2;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.85, size, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(ringColor),
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.userData.phase = Math.random() * Math.PI * 2;
      pulseRingsRef.current.set(node.id, ring);
      group.add(ring);
    } else {
      pulseRingsRef.current.delete(node.id);
    }

    return group;
  }, [makeGlowTexture]);

  // ─── INTERACTIONS ────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GraphNode;

    if (connectMode) {
      if (!connectSource) {
        setConnectSource(node.id);
      } else if (connectSource !== node.id) {
        setPendingConn({ sourceId: connectSource, targetId: node.id });
        setConnectSource(null);
        setConnectMode(false);
      }
      return;
    }

    // Double-click detection → toggle focus mode
    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.id === node.id && now - last.time < 350) {
      lastClickRef.current = null;
      setFocusedNodeId(prev => prev === node.id ? null : node.id);
      return;
    }
    lastClickRef.current = { id: node.id, time: now };

    setSelectedContact(node.contact);
    setSelectedMapData(node.mapData);
  }, [connectMode, connectSource]);

  const handleNodeHover = useCallback((nodeRaw: object | null) => {
    setHoveredNode(nodeRaw ? (nodeRaw as GraphNode) : null);
  }, []);

  const handleSaveConnection = (label: string) => {
    if (!pendingConn) return;
    onSaveManualConnection({
      id: generateId(),
      sourceContactId: pendingConn.sourceId,
      targetContactId: pendingConn.targetId,
      label,
    });
    setPendingConn(null);
  };

  const handleLinkClick = useCallback((linkRaw: object) => {
    const link = linkRaw as GraphLink;
    if (!link.isAuto && link.connId) {
      if (confirm('Delete this connection?')) onDeleteManualConnection(link.connId);
    }
  }, [onDeleteManualConnection]);

  const cancelConnect = () => { setConnectMode(false); setConnectSource(null); };

  // ─── LEGEND ITEMS ────────────────────────────────────────────────────────────

  const legendItems = useMemo(() => {
    if (clusterInfo) {
      return clusterInfo.groupList.map(g => ({ color: clusterInfo.groupColors[g], label: g }));
    }
    if (groupBy === 'followup') {
      return [
        { color: FOLLOWUP_COLORS.overdue, label: 'Overdue' },
        { color: FOLLOWUP_COLORS.today, label: 'Due Today' },
        { color: FOLLOWUP_COLORS.upcoming, label: 'Upcoming' },
        { color: FOLLOWUP_COLORS.ok, label: 'No Follow-up' },
      ];
    }
    return [
      { color: '#dc2626', label: 'Hot' },
      { color: '#d97706', label: 'Warm' },
      { color: '#3b82f6', label: 'Cold' },
      { color: '#8b5cf6', label: 'Personal' },
    ];
  }, [clusterInfo, groupBy]);

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        background: '#050510',
        ...(fullscreen ? { position: 'fixed', inset: 0, zIndex: 9000, width: '100vw', height: '100vh' } : {}),
      }}
    >
      <ForceGraph3D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graphData}
        nodeId="id"
        nodeColor={(n: object) => (n as GraphNode).color}
        nodeVal={(n: object) => (n as GraphNode).val}
        nodeResolution={8}
        nodeOpacity={0.95}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend
        linkColor={(l: object) => (l as GraphLink).isAuto ? 'rgba(59,130,246,0.4)' : 'rgba(251,191,36,0.6)'}
        linkWidth={(l: object) => (l as GraphLink).isAuto ? 0.5 : 1.5}
        linkDirectionalParticles={0}
        linkCurvature={0.1}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onLinkClick={handleLinkClick}
        onEngineStop={doZoomToFit}
        backgroundColor="#050510"
        showNavInfo={false}
        enableNodeDrag
        enableNavigationControls
      />

      {/* ── Hover tooltip ───────────────────────────────────────────────── */}
      {hoveredNode && !hoveredNode.dimmed && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border shadow-xl px-3 py-2.5 text-xs"
          style={{
            left: mousePos.x + 14,
            top: mousePos.y - 10,
            backgroundColor: 'rgba(8,8,22,0.95)',
            borderColor: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
            maxWidth: 220,
            transform: mousePos.x > window.innerWidth - 240 ? 'translateX(-110%)' : undefined,
          }}
        >
          <div className="font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.95)' }}>{hoveredNode.name}</div>
          {hoveredNode.contact.company && (
            <div className="mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{hoveredNode.contact.company}</div>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {hoveredNode.contact.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: `${TAG_COLORS[tag] ?? '#6b7280'}22`, color: TAG_COLORS[tag] ?? '#6b7280' }}>
                {tag}
              </span>
            ))}
            <span className="px-1.5 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: `${STRENGTH_COLORS[hoveredNode.mapData.strength ?? 'cold']}22`, color: STRENGTH_COLORS[hoveredNode.mapData.strength ?? 'cold'] }}>
              {hoveredNode.mapData.strength ?? 'cold'}
            </span>
          </div>
          {hoveredNode.contact.lastContacted && (
            <div className="mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Last contact: {hoveredNode.contact.lastContacted}
            </div>
          )}
          {hoveredNode.hasPending && (
            <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
              <AlertCircle size={10} /> Follow-up needed
            </div>
          )}
          <div className="mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Double-click to focus · Click to open
          </div>
        </div>
      )}

      {/* ── Search box (top-left) ───────────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-lg"
        style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
        <Search size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
        <input
          className="bg-transparent outline-none text-xs w-36"
          style={{ color: 'rgba(255,255,255,0.9)' }}
          placeholder="Search nodes…"
          value={graphSearch}
          onChange={e => setGraphSearch(e.target.value)}
        />
        {graphSearch && (
          <button onClick={() => setGraphSearch('')} style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* ── Cmd+K hint (top-left, below search) ─────────────────────────── */}
      <button
        onClick={() => setCmdkOpen(true)}
        className="absolute top-12 left-3 z-10 flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs"
        style={{ backgroundColor: 'rgba(10,10,24,0.7)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)' }}
        title="Fly to contact (⌘K)"
      >
        <Search size={10} />
        <span className="hidden sm:inline">Fly to contact</span>
        <kbd className="hidden sm:inline ml-1 px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>⌘K</kbd>
      </button>

      {/* ── Toolbar (top-right) ─────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 flex-wrap justify-end">

        {/* Group By selector */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: groupBy !== 'none' ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          <Layers size={12} style={{ color: groupBy !== 'none' ? '#a78bfa' : 'rgba(255,255,255,0.55)' }} />
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
            className="bg-transparent outline-none text-xs cursor-pointer max-w-[90px] sm:max-w-none"
            style={{ color: groupBy !== 'none' ? '#a78bfa' : 'rgba(255,255,255,0.7)' }}
          >
            <option value="none">No Grouping</option>
            <option value="tag">By Tag</option>
            <option value="strength">By Strength</option>
            <option value="company">By Company</option>
            <option value="followup">Follow-up Heat</option>
          </select>
        </div>

        <button onClick={() => setFullscreen(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          <span className="hidden sm:inline">{fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
        <button onClick={() => setShowAddContact(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title="Add Contact">
          <UserPlus size={12} />
          <span className="hidden sm:inline">Add Contact</span>
        </button>
        <button
          onClick={connectMode ? cancelConnect : () => setConnectMode(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{
            backgroundColor: connectMode ? 'rgba(251,191,36,0.15)' : 'rgba(10,10,24,0.85)',
            borderColor: connectMode ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.1)',
            color: connectMode ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(8px)',
          }}
          title={connectMode ? 'Cancel connect' : 'Connect nodes'}>
          {connectMode ? <Link2Off size={12} /> : <Link2 size={12} />}
          <span className="hidden sm:inline">
            {connectMode ? (connectSource ? 'Now click target…' : 'Click source…') : 'Connect'}
          </span>
        </button>
        <button onClick={onToggleAutoConnections}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title={mapState.showAutoConnections ? 'Auto-Links On' : 'Auto-Links Off'}>
          {mapState.showAutoConnections ? <Zap size={12} /> : <ZapOff size={12} />}
          <span className="hidden sm:inline">{mapState.showAutoConnections ? 'Auto-Links On' : 'Auto-Links Off'}</span>
        </button>
      </div>

      {/* ── Focus mode banner ────────────────────────────────────────────── */}
      {focusedNodeId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: 'rgba(167,139,250,0.9)', backdropFilter: 'blur(8px)' }}>
          <span>Focused: <strong>{contactMap.get(focusedNodeId)?.name}</strong></span>
          <button onClick={() => setFocusedNodeId(null)} style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Connect mode source indicator ───────────────────────────────── */}
      {connectMode && connectSource && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: 'rgba(251,191,36,0.9)', backdropFilter: 'blur(8px)' }}>
          Source: <strong>{contactMap.get(connectSource)?.name ?? connectSource}</strong> — now click the target node
        </div>
      )}

      {/* ── Legend (bottom-left) ────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
        style={{ backgroundColor: 'rgba(10,10,24,0.75)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.45)', maxWidth: 'calc(100vw - 24px)', flexWrap: 'wrap' }}>
        {legendItems.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="ml-1" style={{ borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: 8 }}>
          Drag to orbit · Scroll to zoom · Double-click to focus
        </span>
      </div>

      {/* ── Contact popup ────────────────────────────────────────────────── */}
      {selectedContact && selectedMapData && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-80" style={{ maxWidth: 'calc(100vw - 24px)' }}>
          <ContactMapPopup
            contact={selectedContact}
            mapData={selectedMapData}
            onClose={() => { setSelectedContact(null); setSelectedMapData(null); }}
            onUpdateMapData={data => {
              onUpdateMapData(selectedContact.id, data);
              setSelectedMapData(prev => prev ? { ...prev, ...data } : prev);
            }}
            onUpdateContact={updated => { onUpdateContact(updated); setSelectedContact(updated); }}
            onEditInCRM={onNavigateToCRM}
          />
        </div>
      )}

      {/* ── Connection label modal ───────────────────────────────────────── */}
      {pendingConn && (
        <ConnectionModal
          sourceName={contactMap.get(pendingConn.sourceId)?.name ?? ''}
          targetName={contactMap.get(pendingConn.targetId)?.name ?? ''}
          onSave={handleSaveConnection}
          onClose={() => setPendingConn(null)}
        />
      )}

      {/* ── Add contact modal ────────────────────────────────────────────── */}
      {showAddContact && (
        <AddContactModal
          onSave={contact => { onAddContact(contact); setShowAddContact(false); }}
          onClose={() => setShowAddContact(false)}
        />
      )}

      {/* ── Cmd+K modal ──────────────────────────────────────────────────── */}
      {cmdkOpen && (
        <CmdKModal
          contacts={contacts}
          onSelect={flyToContact}
          onClose={() => setCmdkOpen(false)}
        />
      )}
    </div>
  );
}
