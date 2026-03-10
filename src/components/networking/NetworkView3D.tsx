import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { X, Zap, ZapOff, UserPlus, Link2, Link2Off, Search, Maximize2, Minimize2 } from 'lucide-react';
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

  const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const graphSearchLower = graphSearch.trim().toLowerCase();

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
        color: dimmed ? '#151525' : getContactStrengthColor(md.strength ?? 'cold'),
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
  }, [contacts, mapState, filteredIds, graphSearchLower, contactMap]);

  // ─── NODE RENDERING ──────────────────────────────────────────────────────────

  const nodeThreeObject = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GraphNode;
    const sprite = new SpriteText(node.name);
    sprite.color = node.dimmed ? '#2a2a4a' : 'rgba(255,255,255,0.92)';
    sprite.textHeight = Math.max(2.5, node.val * 0.55);
    sprite.fontWeight = '600';
    sprite.backgroundColor = node.dimmed ? 'transparent' : 'rgba(5,5,18,0.65)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    return sprite;
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
        nodeResolution={20}
        nodeOpacity={0.92}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend
        linkColor={(l: object) => (l as GraphLink).isAuto ? 'rgba(59,130,246,0.35)' : 'rgba(251,191,36,0.55)'}
        linkWidth={(l: object) => (l as GraphLink).isAuto ? 0.4 : 1.2}
        linkDirectionalParticles={(l: object) => (l as GraphLink).isAuto ? 2 : 0}
        linkDirectionalParticleWidth={0.8}
        linkDirectionalParticleColor={() => 'rgba(59,130,246,0.8)'}
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
        style={{ backgroundColor: 'rgba(10,10,24,0.75)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', color: 'rgba(255,255,255,0.45)' }}>
        {[
          { color: '#dc2626', label: 'Hot' },
          { color: '#d97706', label: 'Warm' },
          { color: '#3b82f6', label: 'Cold' },
          { color: '#8b5cf6', label: 'Personal' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
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
