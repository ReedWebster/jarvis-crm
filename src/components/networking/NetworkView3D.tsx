import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { Zap, ZapOff, Search, Maximize2, Minimize2, Link2, X } from 'lucide-react';
import type {
  Contact,
  Project,
  ContactMapData,
  NetworkingMapState,
  NetworkManualConnection,
  ContactTag,
  NetworkOrg,
} from '../../types';
import { generateId } from '../../utils';
import {
  defaultContactMapData,
  buildAutoEdges,
  isFollowUpPending,
} from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GalaxyNode {
  id: string;
  name: string;
  isOrg?: boolean;
  contact?: Contact;
  mapData?: ContactMapData;
  val: number;
  color: string;
  orgColor?: string;
  dimmed: boolean;
  collapsed?: boolean;
  memberCount?: number;
  hasPending?: boolean;
  // d3-force fixed positions
  fx?: number;
  fy?: number;
  fz?: number;
  // runtime positions (set by force-graph)
  x?: number;
  y?: number;
  z?: number;
}

interface GalaxyLink {
  source: string;
  target: string;
  isOrgLink?: boolean;
  isManual?: boolean;
  isAuto?: boolean;
  connId?: string;
  label?: string;
}

// ─── ORG COLOR PALETTE ───────────────────────────────────────────────────────

const ORG_PALETTE = [
  '#a8d8ff', '#ffd580', '#b8ffc8', '#ffb3c6', '#d4b3ff',
  '#ffe0b2', '#b3e5fc', '#f8bbd0', '#c8e6c9', '#fff9c4',
  '#e1bee7', '#b2dfdb', '#ffccbc', '#cfd8dc', '#f0f4c3',
];

function hashOrgColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return ORG_PALETTE[h % ORG_PALETTE.length];
}

// ─── GLOW TEXTURE CACHE ──────────────────────────────────────────────────────

const glowCache = new Map<string, THREE.CanvasTexture>();

function makeGlowTexture(hexColor: string, radius = 64): THREE.CanvasTexture {
  const key = `${hexColor}-${radius}`;
  if (glowCache.has(key)) return glowCache.get(key)!;
  const size = radius * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, hexColor + 'ff');
  grad.addColorStop(0.35, hexColor + 'cc');
  grad.addColorStop(0.7, hexColor + '44');
  grad.addColorStop(1, hexColor + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  glowCache.set(key, tex);
  return tex;
}

// ─── GRAPH BUILDER ───────────────────────────────────────────────────────────

const STRENGTH_COLORS: Record<string, string> = {
  hot:      '#ff6b6b',
  warm:     '#ffd93d',
  cold:     '#4ecdc4',
  personal: '#a8d8ff',
};

function buildGalaxyGraph(
  contacts: Contact[],
  mapState: NetworkingMapState,
  filteredIds: Set<string>,
  searchLower: string,
  collapsedOrgs: Set<string>,
): { nodes: GalaxyNode[]; links: GalaxyLink[] } {
  const nodes: GalaxyNode[] = [];
  const links: GalaxyLink[] = [];

  // ── Derive org nodes from contact.company ──
  const companyMap = new Map<string, Contact[]>();
  for (const c of contacts) {
    const key = c.company?.trim() || '__independent__';
    if (!companyMap.has(key)) companyMap.set(key, []);
    companyMap.get(key)!.push(c);
  }

  // Also include manual orgs from mapState.orgs
  const manualOrgIds = new Set<string>((mapState.orgs ?? []).map(o => o.id));
  for (const org of (mapState.orgs ?? [])) {
    if (!companyMap.has(org.name)) {
      companyMap.set(org.name, []);
    }
  }

  // Build org node map: company name → node id
  const orgNodeId = new Map<string, string>();
  for (const [company] of companyMap) {
    const id = company === '__independent__' ? 'org::__independent__' : `org::${company}`;
    orgNodeId.set(company, id);
  }

  // Create org nodes
  for (const [company, members] of companyMap) {
    const id = orgNodeId.get(company)!;
    const displayName = company === '__independent__' ? 'Independent' : company;
    const color = hashOrgColor(displayName);
    const collapsed = collapsedOrgs.has(id);
    nodes.push({
      id,
      name: displayName,
      isOrg: true,
      val: 20 + Math.min(members.length * 2, 20),
      color,
      orgColor: color,
      dimmed: false,
      collapsed,
      memberCount: members.length,
    });
  }

  // Create contact nodes
  for (const c of contacts) {
    const mapData = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
    const strength = mapData.strength ?? 'cold';
    const color = STRENGTH_COLORS[strength] ?? '#4ecdc4';

    // Dimmed if not in filteredIds, or if search doesn't match
    let dimmed = !filteredIds.has(c.id);
    if (!dimmed && searchLower) {
      const matches =
        c.name.toLowerCase().includes(searchLower) ||
        (c.company ?? '').toLowerCase().includes(searchLower) ||
        (c.relationship ?? '').toLowerCase().includes(searchLower);
      if (!matches) dimmed = true;
    }

    const orgKey = c.company?.trim() || '__independent__';
    const orgId = orgNodeId.get(orgKey)!;
    const collapsed = collapsedOrgs.has(orgId);

    // Skip contact if its org is collapsed
    if (collapsed) continue;

    const hasPending = isFollowUpPending(c);

    // Fixed position from saved data
    const fx = mapData.nodeX !== undefined ? mapData.nodeX : undefined;
    const fy = mapData.nodeY !== undefined ? mapData.nodeY : undefined;
    const fz = mapData.nodeZ !== undefined ? mapData.nodeZ : undefined;

    nodes.push({
      id: c.id,
      name: c.name,
      contact: c,
      mapData,
      val: 6 + Math.min((c.interactions?.length ?? 0) * 0.5, 8),
      color,
      dimmed,
      hasPending,
      fx,
      fy,
      fz,
    });

    // Contact → org link
    links.push({
      source: c.id,
      target: orgId,
      isOrgLink: true,
    });
  }

  // Auto contact→contact links
  if (mapState.showAutoConnections) {
    const autoEdges = buildAutoEdges(contacts);
    for (const e of autoEdges) {
      // Only include if both ends are visible (not collapsed)
      const srcVisible = nodes.some(n => n.id === e.source);
      const tgtVisible = nodes.some(n => n.id === e.target);
      if (srcVisible && tgtVisible) {
        links.push({
          source: e.source as string,
          target: e.target as string,
          isAuto: true,
          label: e.label as string,
        });
      }
    }
  }

  // Manual connections
  for (const conn of (mapState.manualConnections ?? [])) {
    const srcVisible = nodes.some(n => n.id === conn.sourceContactId);
    const tgtVisible = nodes.some(n => n.id === conn.targetContactId);
    if (srcVisible && tgtVisible) {
      links.push({
        source: conn.sourceContactId,
        target: conn.targetContactId,
        isManual: true,
        connId: conn.id,
      });
    }
  }

  return { nodes, links };
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

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
  onUpdateOrgs: (orgs: NetworkOrg[]) => void;
}

// ─── TAG OPTIONS ─────────────────────────────────────────────────────────────

const TAG_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Tags' },
  { value: 'investor', label: 'Investor' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'partner', label: 'Partner' },
  { value: 'customer', label: 'Customer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'team', label: 'Team' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function NetworkView3D({
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
  onUpdateOrgs,
}: Props) {
  // ── State ──
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GalaxyNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());
  const [graphSearch, setGraphSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [fullscreen, setFullscreen] = useState(false);
  const [graphSearchLower, setGraphSearchLower] = useState('');

  // ── Refs ──
  const fgRef = useRef<any>(undefined);
  const isInteractingRef = useRef(false);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotationAnimRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setGraphSearchLower(graphSearch.toLowerCase()), 280);
    return () => clearTimeout(t);
  }, [graphSearch]);

  // ── Graph data ──
  const graphData = useMemo(() => {
    // Apply tag filter on top of filteredIds
    let effectiveFilteredIds = filteredIds;
    if (tagFilter !== 'all') {
      effectiveFilteredIds = new Set(
        contacts
          .filter(c => c.tags.includes(tagFilter as ContactTag) && filteredIds.has(c.id))
          .map(c => c.id)
      );
    }
    return buildGalaxyGraph(contacts, mapState, effectiveFilteredIds, graphSearchLower, collapsedOrgs);
  }, [contacts, mapState, filteredIds, graphSearchLower, collapsedOrgs, tagFilter]);

  // ── Starfield ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const scene = fg.scene?.();
    if (!scene) return;

    const count = 2500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 4000;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.55,
    });
    const stars = new THREE.Points(geo, mat);
    stars.name = 'galaxy-starfield';
    scene.add(stars);

    return () => {
      scene.remove(stars);
      geo.dispose();
      mat.dispose();
    };
  }, []);

  // ── Auto-rotation ──
  useEffect(() => {
    let angle = 0;

    function markInteracting() {
      isInteractingRef.current = true;
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = setTimeout(() => {
        isInteractingRef.current = false;
      }, 3000);
    }

    const el = containerRef.current;
    if (el) {
      el.addEventListener('mousedown', markInteracting);
      el.addEventListener('touchstart', markInteracting);
      el.addEventListener('wheel', markInteracting);
    }

    function animate() {
      rotationAnimRef.current = requestAnimationFrame(animate);
      if (isInteractingRef.current) return;
      const fg = fgRef.current;
      if (!fg) return;
      angle += 0.0004;
      const distance = 500;
      fg.cameraPosition({
        x: Math.sin(angle) * distance,
        z: Math.cos(angle) * distance,
      });
    }

    rotationAnimRef.current = requestAnimationFrame(animate);

    return () => {
      if (rotationAnimRef.current) cancelAnimationFrame(rotationAnimRef.current);
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
      if (el) {
        el.removeEventListener('mousedown', markInteracting);
        el.removeEventListener('touchstart', markInteracting);
        el.removeEventListener('wheel', markInteracting);
      }
    };
  }, []);

  // ── d3 force tuning after graph loads ──
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = setTimeout(() => {
      try {
        fg.d3Force('charge')?.strength((node: GalaxyNode) =>
          node.isOrg ? -3000 : -600
        );
        fg.d3Force('link')?.distance((link: GalaxyLink) =>
          link.isOrgLink ? 80 : 140
        );
      } catch {}
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mouse tracking for tooltip ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // ── nodeThreeObject ──
  const nodeThreeObject = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GalaxyNode;

    if (node.isOrg) {
      // Star system: Group with sphere + glow sprite + label
      const group = new THREE.Group();
      const color = node.orgColor ?? '#a8d8ff';

      // Core sphere
      const geo = new THREE.SphereGeometry(7, 20, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.92,
      });
      const sphere = new THREE.Mesh(geo, mat);
      group.add(sphere);

      // Outer glow sprite
      const glowTex = makeGlowTexture(color, 80);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: node.collapsed ? 0.5 : 0.75,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(50, 50, 1);
      group.add(glow);

      // Label
      const label = new SpriteText(
        node.collapsed
          ? `${node.name} (${node.memberCount ?? 0})`
          : node.name
      );
      label.color = color;
      label.textHeight = 3.5;
      label.backgroundColor = 'rgba(0,0,0,0.55)';
      label.padding = 1.5;
      label.position.set(0, -14, 0);
      group.add(label as unknown as THREE.Object3D);

      return group;
    }

    // Contact node: glow sprite
    const color = node.dimmed ? '#334155' : (node.color ?? '#4ecdc4');
    const tex = makeGlowTexture(color, 48);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: node.dimmed ? 0.12 : (node.hasPending ? 1.0 : 0.85),
    });
    const sprite = new THREE.Sprite(mat);
    const size = (node.val ?? 6) * 2.2;
    sprite.scale.set(size, size, 1);
    return sprite;
  }, []);

  // ── Link color / width ──
  const linkColor = useCallback((linkRaw: object) => {
    const link = linkRaw as GalaxyLink;
    if (link.isOrgLink)  return 'rgba(100, 180, 255, 0.15)';
    if (link.isManual)   return 'rgba(251, 191, 36, 0.55)';
    return 'rgba(0, 212, 255, 0.25)';
  }, []);

  const linkWidth = useCallback((linkRaw: object) => {
    const link = linkRaw as GalaxyLink;
    if (link.isManual) return 1.2;
    if (link.isOrgLink) return 0.4;
    return 0.5;
  }, []);

  // ── Click handlers ──
  const handleNodeClick = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GalaxyNode;

    if (node.isOrg) {
      setCollapsedOrgs(prev => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }

    if (connectMode) {
      if (!connectSource) {
        setConnectSource(node.id);
        return;
      }
      if (node.id !== connectSource) {
        const conn: NetworkManualConnection = {
          id: generateId(),
          sourceContactId: connectSource,
          targetContactId: node.id,
          label: '',
        };
        onSaveManualConnection(conn);
      }
      setConnectSource(null);
      setConnectMode(false);
      return;
    }

    if (node.contact) {
      setSelectedContact(node.contact);
    }
  }, [connectMode, connectSource, onSaveManualConnection]);

  const handleLinkClick = useCallback((linkRaw: object) => {
    const link = linkRaw as GalaxyLink;
    if (link.isManual && link.connId) {
      onDeleteManualConnection(link.connId);
    }
  }, [onDeleteManualConnection]);

  const handleNodeHover = useCallback((nodeRaw: object | null) => {
    setHoveredNode(nodeRaw ? (nodeRaw as GalaxyNode) : null);
  }, []);

  const handleNodeDragEnd = useCallback((nodeRaw: object) => {
    const node = nodeRaw as GalaxyNode & { x?: number; y?: number; z?: number };
    if (node.isOrg || !node.contact) return;
    const updates: Record<string, ContactMapData> = {};
    updates[node.id] = {
      ...(node.mapData ?? defaultContactMapData(node.id)),
      nodeX: Math.round(node.x ?? 0),
      nodeY: Math.round(node.y ?? 0),
      nodeZ: Math.round(node.z ?? 0),
    };
    onUpdateNodePositions(updates);
  }, [onUpdateNodePositions]);

  // ── Keyboard shortcut: Escape closes popup ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedContact(null);
        setConnectMode(false);
        setConnectSource(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Selected contact map data ──
  const selectedMapData = useMemo(() => {
    if (!selectedContact) return null;
    return mapState.contactData[selectedContact.id] ?? defaultContactMapData(selectedContact.id);
  }, [selectedContact, mapState.contactData]);

  // ── Render ──
  return (
    <div
      ref={containerRef}
      style={{
        position: fullscreen ? 'fixed' : 'relative',
        inset: fullscreen ? 0 : undefined,
        width: '100%',
        height: fullscreen ? '100vh' : '100%',
        background: '#000000',
        zIndex: fullscreen ? 9999 : undefined,
        overflow: 'hidden',
      }}
    >
      {/* Force Graph */}
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#000000"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={1}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        onNodeHover={handleNodeHover}
        onNodeDragEnd={handleNodeDragEnd}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTime={12000}
        onEngineStop={() => {}}
        enableNavigationControls
        showNavInfo={false}
      />

      {/* Toolbar — top right */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 10,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(0,0,0,0.72)',
          border: '1px solid rgba(100,180,255,0.25)',
          borderRadius: 8,
          padding: '5px 10px',
          backdropFilter: 'blur(8px)',
        }}>
          <Search size={13} color="#64b5f6" />
          <input
            value={graphSearch}
            onChange={e => setGraphSearch(e.target.value)}
            placeholder="Search nodes…"
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: 12,
              width: 140,
            }}
          />
          {graphSearch && (
            <button onClick={() => setGraphSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={11} color="#94a3b8" />
            </button>
          )}
        </div>

        {/* Tag filter */}
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          style={{
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(100,180,255,0.25)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 12,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
          }}
        >
          {TAG_OPTIONS.map(t => (
            <option key={t.value} value={t.value} style={{ background: '#0f172a' }}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Button row */}
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Auto-connections toggle */}
          <button
            onClick={onToggleAutoConnections}
            title={mapState.showAutoConnections ? 'Hide auto-connections' : 'Show auto-connections'}
            style={{
              background: mapState.showAutoConnections ? 'rgba(0,212,255,0.18)' : 'rgba(0,0,0,0.72)',
              border: `1px solid ${mapState.showAutoConnections ? 'rgba(0,212,255,0.5)' : 'rgba(100,180,255,0.25)'}`,
              borderRadius: 8,
              color: mapState.showAutoConnections ? '#00d4ff' : '#94a3b8',
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              backdropFilter: 'blur(8px)',
            }}
          >
            {mapState.showAutoConnections ? <Zap size={13} /> : <ZapOff size={13} />}
            <span>Auto</span>
          </button>

          {/* Connect mode toggle */}
          <button
            onClick={() => {
              setConnectMode(m => !m);
              setConnectSource(null);
            }}
            title="Connect two contacts"
            style={{
              background: connectMode ? 'rgba(251,191,36,0.18)' : 'rgba(0,0,0,0.72)',
              border: `1px solid ${connectMode ? 'rgba(251,191,36,0.5)' : 'rgba(100,180,255,0.25)'}`,
              borderRadius: 8,
              color: connectMode ? '#fbbf24' : '#94a3b8',
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              backdropFilter: 'blur(8px)',
            }}
          >
            <Link2 size={13} />
            <span>Connect</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              background: 'rgba(0,0,0,0.72)',
              border: '1px solid rgba(100,180,255,0.25)',
              borderRadius: 8,
              color: '#94a3b8',
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Connect mode banner */}
      {connectMode && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(251,191,36,0.15)',
          border: '1px solid rgba(251,191,36,0.5)',
          borderRadius: 8,
          color: '#fbbf24',
          padding: '6px 16px',
          fontSize: 12,
          zIndex: 10,
          backdropFilter: 'blur(8px)',
          pointerEvents: 'none',
        }}>
          {connectSource
            ? 'Now click the second contact to connect'
            : 'Click a contact node to start connecting'}
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredNode && !hoveredNode.isOrg && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top: mousePos.y - 10,
          background: 'rgba(0,0,0,0.88)',
          border: '1px solid rgba(100,180,255,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 9999,
          maxWidth: 220,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hoveredNode.name}</div>
          {hoveredNode.contact?.company && (
            <div style={{ color: '#94a3b8', marginBottom: 2 }}>{hoveredNode.contact.company}</div>
          )}
          {hoveredNode.mapData?.strength && (
            <div style={{ color: hoveredNode.color, fontSize: 11 }}>
              {hoveredNode.mapData.strength.charAt(0).toUpperCase() + hoveredNode.mapData.strength.slice(1)}
            </div>
          )}
          {hoveredNode.contact?.lastContacted && (
            <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
              Last: {hoveredNode.contact.lastContacted}
            </div>
          )}
          {hoveredNode.hasPending && (
            <div style={{ color: '#f59e0b', fontSize: 10 }}>⚡ Follow-up pending</div>
          )}
        </div>
      )}
      {hoveredNode?.isOrg && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top: mousePos.y - 10,
          background: 'rgba(0,0,0,0.88)',
          border: `1px solid ${hoveredNode.orgColor ?? 'rgba(100,180,255,0.3)'}55`,
          borderRadius: 8,
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 9999,
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontWeight: 600, color: hoveredNode.orgColor }}>{hoveredNode.name}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            {hoveredNode.memberCount} member{hoveredNode.memberCount !== 1 ? 's' : ''}
            {hoveredNode.collapsed ? ' (collapsed)' : ''}
          </div>
          <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
            Click to {hoveredNode.collapsed ? 'expand' : 'collapse'}
          </div>
        </div>
      )}

      {/* Legend — bottom left */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 10,
        background: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(100,180,255,0.15)',
        borderRadius: 8,
        padding: '8px 12px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ color: '#475569', fontSize: 10, marginBottom: 2, fontWeight: 600, letterSpacing: 0.5 }}>
          RELATIONSHIP
        </div>
        {[
          { key: 'hot',      color: '#ff6b6b', label: 'Hot Lead' },
          { key: 'warm',     color: '#ffd93d', label: 'Warm' },
          { key: 'cold',     color: '#4ecdc4', label: 'Cold' },
          { key: 'personal', color: '#a8d8ff', label: 'Personal' },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: item.color,
              boxShadow: `0 0 6px ${item.color}`,
            }} />
            <span style={{ color: '#94a3b8' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px #f59e0b' }} />
          <span style={{ color: '#94a3b8' }}>Follow-up due</span>
        </div>
      </div>

      {/* Contact popup overlay */}
      {selectedContact && selectedMapData && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 20,
          width: 320,
          maxHeight: 'calc(100% - 24px)',
          overflowY: 'auto',
        }}>
          <ContactMapPopup
            contact={selectedContact}
            mapData={selectedMapData}
            onClose={() => setSelectedContact(null)}
            onUpdateMapData={(data) => {
              onUpdateMapData(selectedContact.id, data);
              setSelectedContact(prev =>
                prev ? { ...prev, ...data } : null
              );
            }}
            onUpdateContact={(updated) => {
              onUpdateContact(updated);
              setSelectedContact(updated);
            }}
            onEditInCRM={onNavigateToCRM}
            orgs={mapState.orgs ?? []}
            onUpdateOrgs={onUpdateOrgs}
          />
        </div>
      )}
    </div>
  );
}
