import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { X, Zap, ZapOff, UserPlus, Link2, Link2Off, Search, Maximize2, Minimize2, Layers } from 'lucide-react';
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
const AUTO_PALETTE = [
  '#06b6d4','#10b981','#f59e0b','#ec4899','#8b5cf6','#f97316',
  '#a78bfa','#34d399','#60a5fa','#fb7185','#fbbf24','#4ade80',
  '#38bdf8','#c084fc','#f472b6','#fb923c','#a3e635','#2dd4bf',
  '#818cf8','#e879f9',
];

// ─── CONNECTION LABEL MODAL ───────────────────────────────────────────────────

function ConnectionModal({
  sourceName,
  targetName,
  onSave,
  onClose,
}: {
  sourceName: string;
  targetName: string;
  onSave: (label: string) => void;
  onClose: () => void;
}) {
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
          <input
            className="caesar-input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Introduced by, Co-founder, Classmate..."
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSave(label); }}
          />
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
      id: generateId(),
      name: name.trim(),
      email: email.trim() || undefined,
      relationship: relationship.trim(),
      tags: [tag],
      lastContacted: new Date().toISOString().slice(0, 10),
      followUpNeeded: false,
      notes: '',
      interactions: [],
      linkedProjects: [],
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
    // Set initial size
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

  type GroupBy = 'none' | 'tag' | 'strength' | 'company';
  const [groupBy, setGroupBy] = useState<GroupBy>('tag');
  const clusterLabelsRef = useRef<SpriteText[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const graphDataNodesRef = useRef<any[]>([]);

  // Escape key closes fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

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

  // Auto-fit camera on first load
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(1200, 100), 1800);
    return () => clearTimeout(t);
  }, []);

  // Pulse animation loop — runs every frame, updates halo opacity/scale
  useEffect(() => {
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const t = Date.now() * 0.001;
      graphDataNodesRef.current.forEach(node => {
        if (!node._halo) return;
        const pulse = (Math.sin(t * 1.8 + (node._haloOffset ?? 0)) + 1) * 0.5;
        node._halo.scale.setScalar(1 + pulse * 0.3);
        (node._halo.material as THREE.MeshBasicMaterial).opacity = 0.04 + pulse * 0.18;
      });
    };
    animate();
    return () => { if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current); };
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
      return 'All';
    };

    const rawGroups: Record<string, string> = {};
    contacts.forEach(c => { rawGroups[c.id] = getGroupName(c); });

    // For company, cap at top 15 by count, rest → 'Other'
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
      else groupColors[g] = AUTO_PALETTE[i % AUTO_PALETTE.length];
    });

    const RADIUS = Math.max(280, groupList.length * 40);
    const centroids: Record<string, { x: number; y: number; z: number }> = {};
    groupList.forEach((g, i) => {
      const angle = (i / groupList.length) * Math.PI * 2;
      centroids[g] = { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS, z: 0 };
    });

    const nodeColors: Record<string, string> = {};
    Object.entries(nodeGroups).forEach(([id, g]) => { nodeColors[id] = groupColors[g]; });

    return { nodeGroups, nodeColors, centroids, groupColors, groupList };
  }, [groupBy, contacts, mapState]);

  // ─── GRAPH DATA ─────────────────────────────────────────────────────────────

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = contacts.map(c => {
      const md = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
      const matchesSearch = !graphSearchLower
        || c.name.toLowerCase().includes(graphSearchLower)
        || (c.company ?? '').toLowerCase().includes(graphSearchLower)
        || c.tags.some(t => t.toLowerCase().includes(graphSearchLower));
      const dimmed = (filteredIds.size > 0 && !filteredIds.has(c.id))
        || (graphSearchLower.length > 0 && !matchesSearch);

      return {
        id: c.id,
        name: c.name,
        color: dimmed ? '#151525' : (clusterInfo?.nodeColors[c.id] ?? getContactStrengthColor(md.strength ?? 'cold')),
        val: Math.max(4, 3 + c.interactions.length * 0.5),
        dimmed,
        hasPending: isFollowUpPending(c),
        contact: c,
        mapData: md,
      };
    });

    const autoLinks: GraphLink[] = mapState.showAutoConnections
      ? buildAutoEdges(contacts).map(e => ({
          source: e.source,
          target: e.target,
          label: String(e.label ?? ''),
          isAuto: true,
        }))
      : [];

    const manualLinks: GraphLink[] = mapState.manualConnections
      .filter(c => contactMap.has(c.sourceContactId) && contactMap.has(c.targetContactId))
      .map(conn => ({
        source: conn.sourceContactId,
        target: conn.targetContactId,
        label: conn.label ?? '',
        isAuto: false,
        connId: conn.id,
      }));

    return { nodes, links: [...autoLinks, ...manualLinks] };
  }, [contacts, mapState, filteredIds, graphSearchLower, contactMap, clusterInfo]);

  // Keep nodes ref in sync for the animation loop (avoids calling fgRef.graphData() in RAF)
  useEffect(() => { graphDataNodesRef.current = graphData.nodes as any[]; }, [graphData]);

  // ─── CLUSTER FORCE ───────────────────────────────────────────────────────────

  useEffect(() => {
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
        const k = alpha * 0.22;
        node.vx = (node.vx || 0) + (centroid.x - (node.x || 0)) * k;
        node.vy = (node.vy || 0) + (centroid.y - (node.y || 0)) * k;
        node.vz = (node.vz || 0) + (centroid.z - (node.z || 0)) * k;
      });
    };
    fg.d3Force('cluster', clusterForce);
    fg.d3ReheatSimulation();
    const fitTimer = setTimeout(() => fgRef.current?.zoomToFit(1200, 80), 2500);
    return () => clearTimeout(fitTimer);
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

  // ─── NODE RENDERING ──────────────────────────────────────────────────────────

  const nodeThreeObject = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GraphNode;
    const group = new THREE.Group();
    const r = Math.max(2, node.val * 0.6);

    // Pulsing halo (library renders the core sphere via nodeThreeObjectExtend)
    if (!node.dimmed) {
      const colorInt = parseInt((node.color || '#3b82f6').replace('#', ''), 16);
      const haloMat = new THREE.MeshBasicMaterial({ color: colorInt, transparent: true, opacity: 0.12 });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 8, 8), haloMat);
      group.add(halo);
      (nodeRaw as any)._halo = halo;
      (nodeRaw as any)._haloOffset = Math.random() * Math.PI * 2;
    } else {
      (nodeRaw as any)._halo = null;
    }

    // Label above sphere
    const sprite = new SpriteText(node.name);
    sprite.color = node.dimmed ? '#2a2a4a' : 'rgba(255,255,255,0.92)';
    sprite.textHeight = Math.max(2.5, node.val * 0.55);
    sprite.fontWeight = '600';
    sprite.backgroundColor = node.dimmed ? 'transparent' : 'rgba(5,5,18,0.65)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    (sprite as any).position.set(0, r + 3, 0);
    group.add(sprite);

    return group;
  }, []);

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

    setSelectedContact(node.contact);
    setSelectedMapData(node.mapData);
  }, [connectMode, connectSource]);

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
      if (confirm('Delete this connection?')) {
        onDeleteManualConnection(link.connId);
      }
    }
  }, [onDeleteManualConnection]);

  const cancelConnect = () => {
    setConnectMode(false);
    setConnectSource(null);
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{
        background: '#050510',
        ...(fullscreen ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          width: '100vw',
          height: '100vh',
        } : {}),
      }}
    >
      <ForceGraph3D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graphData}
        nodeId="id"
        nodeLabel="name"
        nodeColor={(n: object) => (n as GraphNode).color}
        nodeVal={(n: object) => (n as GraphNode).val}
        nodeResolution={8}
        nodeOpacity={0.92}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend
        linkColor={(l: object) => (l as GraphLink).isAuto ? 'rgba(59,130,246,0.35)' : 'rgba(251,191,36,0.55)'}
        linkWidth={(l: object) => (l as GraphLink).isAuto ? 0.4 : 1.2}
        linkDirectionalParticles={0}
        linkCurvature={0.1}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        backgroundColor="#050510"
        showNavInfo={false}
        enableNodeDrag
        enableNavigationControls
        dagMode={undefined}
      />

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

      {/* ── Toolbar (top-right) ─────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 flex-wrap justify-end">

        {/* Group By selector */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: groupBy !== 'none' ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          <Layers size={12} style={{ color: groupBy !== 'none' ? '#a78bfa' : 'rgba(255,255,255,0.55)' }} />
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
            className="bg-transparent outline-none text-xs cursor-pointer"
            style={{ color: groupBy !== 'none' ? '#a78bfa' : 'rgba(255,255,255,0.7)' }}
          >
            <option value="none">No Grouping</option>
            <option value="tag">Group by Tag</option>
            <option value="strength">Group by Strength</option>
            <option value="company">Group by Company</option>
          </select>
        </div>

        <button
          onClick={() => setFullscreen(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button
          onClick={() => setShowAddContact(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title="Add a new contact"
        >
          <UserPlus size={12} /> Add Contact
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
          title={connectMode ? 'Cancel — click two nodes to connect them' : 'Connect two nodes'}
        >
          {connectMode ? <Link2Off size={12} /> : <Link2 size={12} />}
          {connectMode
            ? (connectSource ? 'Now click target…' : 'Click source node…')
            : 'Connect'}
        </button>

        <button
          onClick={onToggleAutoConnections}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-lg"
          style={{ backgroundColor: 'rgba(10,10,24,0.85)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
          title="Toggle auto-connections from shared projects"
        >
          {mapState.showAutoConnections ? <Zap size={12} /> : <ZapOff size={12} />}
          {mapState.showAutoConnections ? 'Auto-Links On' : 'Auto-Links Off'}
        </button>
      </div>

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
        {clusterInfo
          ? clusterInfo.groupList.map(g => (
              <span key={g} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: clusterInfo.groupColors[g] }} />
                {g}
              </span>
            ))
          : [
              { color: '#dc2626', label: 'Hot' },
              { color: '#d97706', label: 'Warm' },
              { color: '#3b82f6', label: 'Cold' },
              { color: '#8b5cf6', label: 'Personal' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))
        }
        <span className="ml-1" style={{ borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: 8 }}>
          Drag to orbit · Scroll to zoom · Click node to view
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
            onUpdateContact={updated => {
              onUpdateContact(updated);
              setSelectedContact(updated);
            }}
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
    </div>
  );
}
