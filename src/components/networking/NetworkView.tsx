import React, { useState, useCallback, useMemo, useRef, memo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Handle,
  Position,
  NodeProps,
  Node,
  Edge,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, LayoutGrid, Zap, ZapOff, UserPlus } from 'lucide-react';
import type { Contact, Project, ContactMapData, NetworkingMapState, NetworkManualConnection, MapFilters, ContactTag } from '../../types';
import { generateId } from '../../utils';
import {
  getContactStrengthColor,
  getContactInitials,
  buildAutoEdges,
  autoLayoutNodes,
  defaultContactMapData,
  isFollowUpPending,
} from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';

// ─── CONTACT NODE ─────────────────────────────────────────────────────────────

interface ContactNodeData {
  contact: Contact;
  mapData: ContactMapData;
  dimmed: boolean;
  hasPending: boolean;
  onSelect: (id: string) => void;
}

const ContactNode = memo(({ data, id }: NodeProps) => {
  const d = data as unknown as ContactNodeData;
  if (!d.contact) return null;
  const color = getContactStrengthColor(d.mapData?.strength ?? 'cold');
  const initials = getContactInitials(d.contact.name);

  return (
    <div
      style={{ opacity: d.dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}
      className="group flex flex-col items-center"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !rounded-full !border-2 !opacity-0 group-hover:!opacity-100 !transition-opacity"
        style={{ backgroundColor: color, borderColor: 'var(--bg-card)' }}
      />
      <div
        onClick={() => d.onSelect(id)}
        className="flex flex-col items-center gap-1 cursor-pointer"
        style={{ userSelect: 'none' }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden text-sm font-bold"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: `3px solid ${color}`,
            color: 'var(--text-primary)',
            boxShadow: d.hasPending
              ? `0 0 0 3px #f97316, 0 0 0 5px rgba(249,115,22,0.3)`
              : `0 2px 8px rgba(0,0,0,0.3)`,
            animation: d.hasPending ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        >
          {d.mapData?.photo
            ? <img src={d.mapData.photo} alt={d.contact.name} className="w-full h-full object-cover" />
            : initials
          }
        </div>
        <div
          className="text-center max-w-[100px]"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 100,
          }}
        >
          {d.contact.name}
        </div>
        {d.contact.tags[0] && (
          <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {d.contact.tags[0]}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !rounded-full !border-2 !opacity-0 group-hover:!opacity-100 !transition-opacity"
        style={{ backgroundColor: color, borderColor: 'var(--bg-card)' }}
      />
    </div>
  );
});
ContactNode.displayName = 'ContactNode';

const nodeTypes = { contact: ContactNode };

// ─── CONNECTION LABEL MODAL ───────────────────────────────────────────────────

function ConnectionModal({
  onSave,
  onClose,
  sourceName,
  targetName,
}: {
  onSave: (label: string) => void;
  onClose: () => void;
  sourceName: string;
  targetName: string;
}) {
  const [label, setLabel] = useState('');
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl border shadow-2xl w-80 p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Connection Label</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sourceName} → {targetName}
        </div>
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

const ALL_TAGS: ContactTag[] = [
  'Investor', 'Professor', 'Resident', 'Partner', 'Friend',
  'Recruit', 'Mentor', 'Client', 'Colleague', 'Family', 'Other',
];

function AddContactModal({
  onSave,
  onClose,
}: {
  onSave: (contact: Contact) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [tag, setTag] = useState<ContactTag>('Other');

  const handleSave = () => {
    if (!name.trim()) return;
    const now = new Date().toISOString().slice(0, 10);
    onSave({
      id: generateId(),
      name: name.trim(),
      email: email.trim() || undefined,
      relationship: relationship.trim(),
      tags: [tag],
      lastContacted: now,
      followUpNeeded: false,
      notes: '',
      interactions: [],
      linkedProjects: [],
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl border shadow-2xl w-80 p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Add Contact to Graph</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="caesar-label">Name *</label>
            <input
              className="caesar-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>
          <div>
            <label className="caesar-label">Email</label>
            <input
              className="caesar-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="caesar-label">Relationship</label>
            <input
              className="caesar-input"
              value={relationship}
              onChange={e => setRelationship(e.target.value)}
              placeholder="e.g. Business contact"
            />
          </div>
          <div>
            <label className="caesar-label">Type</label>
            <select
              className="caesar-select"
              value={tag}
              onChange={e => setTag(e.target.value as ContactTag)}
            >
              {ALL_TAGS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!name.trim()} className="caesar-btn-primary flex-1">Add to Graph</button>
          <button onClick={onClose} className="caesar-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── NETWORK VIEW ─────────────────────────────────────────────────────────────

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

export function NetworkView({
  contacts,
  projects,
  mapState,
  filteredIds,
  onUpdateMapData,
  onUpdateContact,
  onToggleAutoConnections,
  onSaveManualConnection,
  onDeleteManualConnection,
  onUpdateNodePositions,
  onNavigateToCRM,
  onAddContact,
}: Props) {
  const [showAddContact, setShowAddContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{ sourceId: string; targetId: string } | null>(null);

  // Build contact name lookup
  const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

  // Compute which contact IDs are connected to highlightedId
  const connectedIds = useMemo(() => {
    if (!highlightedId) return null;
    const ids = new Set<string>([highlightedId]);
    // auto edges
    if (mapState.showAutoConnections) {
      const autoEdgeList = buildAutoEdges(contacts);
      for (const e of autoEdgeList) {
        if (e.source === highlightedId) ids.add(e.target);
        if (e.target === highlightedId) ids.add(e.source);
      }
    }
    // manual connections
    for (const conn of mapState.manualConnections) {
      if (conn.sourceContactId === highlightedId) ids.add(conn.targetContactId);
      if (conn.targetContactId === highlightedId) ids.add(conn.sourceContactId);
    }
    return ids;
  }, [highlightedId, contacts, mapState.showAutoConnections, mapState.manualConnections]);

  const buildNodes = useCallback((): Node[] => {
    return contacts.map((c, i) => {
      const d = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
      const x = d.nodeX ?? (i % 5) * 180 + 80;
      const y = d.nodeY ?? Math.floor(i / 5) * 160 + 80;
      const dimmed = (filteredIds.size > 0 && !filteredIds.has(c.id))
        || (connectedIds !== null && !connectedIds.has(c.id));

      return {
        id: c.id,
        type: 'contact',
        position: { x, y },
        data: {
          contact: c,
          mapData: d,
          dimmed,
          hasPending: isFollowUpPending(c),
          onSelect: (id: string) => {
            setSelectedContactId(prev => prev === id ? null : id);
            setHighlightedId(prev => prev === id ? null : id);
          },
        } satisfies ContactNodeData,
        draggable: true,
      };
    });
  }, [contacts, mapState.contactData, filteredIds, connectedIds]);

  const buildEdges = useCallback((): Edge[] => {
    const autoEdges: Edge[] = mapState.showAutoConnections ? buildAutoEdges(contacts) : [];

    const manualEdges: Edge[] = mapState.manualConnections
      .filter(conn => contactMap.has(conn.sourceContactId) && contactMap.has(conn.targetContactId))
      .map(conn => ({
        id: `manual-${conn.id}`,
        source: conn.sourceContactId,
        target: conn.targetContactId,
        type: 'smoothstep',
        animated: false,
        label: conn.label,
        style: { stroke: 'var(--border-strong)', strokeWidth: 1.5, strokeDasharray: '4 3' },
        labelStyle: { fontSize: 9, fill: 'var(--text-muted)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border-strong)', width: 12, height: 12 },
        data: { isManual: true, connId: conn.id },
      }));

    return [...autoEdges, ...manualEdges];
  }, [contacts, mapState.showAutoConnections, mapState.manualConnections, contactMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges());

  // Sync nodes/edges when data changes
  React.useEffect(() => { setNodes(buildNodes()); }, [buildNodes, setNodes]);
  React.useEffect(() => { setEdges(buildEdges()); }, [buildEdges, setEdges]);

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || params.source === params.target) return;
    setPendingConnection({ sourceId: params.source, targetId: params.target });
  }, []);

  const handleSaveConnection = (label: string) => {
    if (!pendingConnection) return;
    const conn: NetworkManualConnection = {
      id: generateId(),
      sourceContactId: pendingConnection.sourceId,
      targetContactId: pendingConnection.targetId,
      label,
    };
    onSaveManualConnection(conn);
    setPendingConnection(null);
  };

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.data?.isManual && edge.data?.connId) {
      if (confirm('Delete this connection?')) {
        onDeleteManualConnection(edge.data.connId as string);
      }
    }
  }, [onDeleteManualConnection]);

  const handleEdgeContextMenu = (e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    if (edge.data?.isManual && edge.data?.connId) {
      if (confirm('Delete this connection?')) {
        onDeleteManualConnection(edge.data.connId as string);
      }
    }
  };

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    onUpdateMapData(node.id, { nodeX: node.position.x, nodeY: node.position.y });
  }, [onUpdateMapData]);

  const handleAutoLayout = () => {
    const updated = autoLayoutNodes(contacts, mapState.contactData);
    onUpdateNodePositions(updated);
  };

  const selectedContact = selectedContactId ? contactMap.get(selectedContactId) ?? null : null;
  const selectedMapData = selectedContactId
    ? (mapState.contactData[selectedContactId] ?? defaultContactMapData(selectedContactId))
    : null;

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        connectionRadius={60}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--border)"
        />
        <Controls
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as unknown as ContactNodeData;
            return getContactStrengthColor(d?.mapData?.strength ?? 'cold');
          }}
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.1)"
        />

        {/* Toolbar panel */}
        <Panel position="top-right">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddContact(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Add a new contact to the graph"
            >
              <UserPlus size={12} /> Add Contact
            </button>
            <button
              onClick={handleAutoLayout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Auto-layout nodes by group"
            >
              <LayoutGrid size={12} /> Auto Layout
            </button>
            <button
              onClick={onToggleAutoConnections}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Toggle auto-connections from shared projects"
            >
              {mapState.showAutoConnections ? <Zap size={12} /> : <ZapOff size={12} />}
              {mapState.showAutoConnections ? 'Auto-Links On' : 'Auto-Links Off'}
            </button>
          </div>
        </Panel>

        {/* Hint panel */}
        <Panel position="bottom-left">
          <div className="text-xs px-2 py-1 rounded border"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Hover node to reveal handles · Drag handle to connect · Tap edge to delete
          </div>
        </Panel>
      </ReactFlow>

      {/* Contact popup panel */}
      {selectedContact && selectedMapData && (
        <div className="absolute top-4 left-4 z-50">
          <ContactMapPopup
            contact={selectedContact}
            mapData={selectedMapData}
            onClose={() => { setSelectedContactId(null); setHighlightedId(null); }}
            onUpdateMapData={data => onUpdateMapData(selectedContact.id, data)}
            onUpdateContact={onUpdateContact}
            onEditInCRM={onNavigateToCRM}
          />
        </div>
      )}

      {/* Connection label modal */}
      {pendingConnection && (
        <ConnectionModal
          sourceName={contactMap.get(pendingConnection.sourceId)?.name ?? ''}
          targetName={contactMap.get(pendingConnection.targetId)?.name ?? ''}
          onSave={handleSaveConnection}
          onClose={() => setPendingConnection(null)}
        />
      )}

      {/* Add contact modal */}
      {showAddContact && (
        <AddContactModal
          onSave={(contact) => {
            // Place the new contact at a random position in the visible area
            const x = 100 + Math.random() * 600;
            const y = 100 + Math.random() * 400;
            onAddContact(contact);
            onUpdateMapData(contact.id, { nodeX: x, nodeY: y });
            setShowAddContact(false);
          }}
          onClose={() => setShowAddContact(false)}
        />
      )}

      {/* React Flow base styles override */}
      <style>{`
        .react-flow__node { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .react-flow__controls-button { background: var(--bg-card) !important; border-color: var(--border) !important; color: var(--text-primary) !important; fill: var(--text-primary) !important; }
        .react-flow__controls-button svg { fill: var(--text-primary) !important; }
        .react-flow__edge-label { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>
    </div>
  );
}
