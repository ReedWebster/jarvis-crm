import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { GitBranch, Eye, EyeOff, ExternalLink } from 'lucide-react';
import type {
  Contact, Project, Client, Candidate, Goal, FinancialEntry, Note, NetworkingMapState,
} from '../../types';
import type { NexusNode, NexusFilters, NexusLinkType } from '../../types/nexus';
import { DEFAULT_NEXUS_FILTERS } from '../../types/nexus';
import { useNexusGraph, useFindPath } from './useNexusGraph';
import { NexusToolbar } from './NexusToolbar';
import { NexusDetailPanel } from './NexusDetailPanel';
import { NexusMinimap } from './NexusMinimap';
import { NODE_COLORS, LINK_COLOR, BG_COLOR } from './nexusColors';
import { useSupabaseStorage } from '../../hooks/useSupabaseStorage';
import { defaultMapState } from '../../utils/networkingMap';

interface Props {
  contacts: Contact[];
  projects: Project[];
  clients: Client[];
  candidates: Candidate[];
  goals: Goal[];
  financialEntries: FinancialEntry[];
  notes: Note[];
  onNavigateToSection: (section: string) => void;
}

const TYPE_SECTIONS: Record<string, string> = {
  contact: 'contacts', project: 'projects', client: 'recruitment',
  candidate: 'recruitment', goal: 'goals', financial: 'financial', note: 'notes',
};

// Stable color blend cache (no THREE.Color allocation in hot paths)
const _blendCache = new Map<string, string>();
function blendHex(a: string, b: string, opacity: number): string {
  const k = `${a}|${b}|${opacity}`;
  if (_blendCache.has(k)) return _blendCache.get(k)!;
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  ca.lerp(cb, 0.5);
  const result = `rgba(${ca.r * 255 | 0},${ca.g * 255 | 0},${ca.b * 255 | 0},${opacity})`;
  _blendCache.set(k, result);
  return result;
}

export function NexusView({
  contacts, projects, clients, candidates, goals,
  financialEntries, notes, onNavigateToSection,
}: Props) {
  const [mapState] = useSupabaseStorage<NetworkingMapState>('jarvis:networkingMap', defaultMapState());
  const [filters, setFilters] = useState<NexusFilters>(DEFAULT_NEXUS_FILTERS);
  const [selectedNode, setSelectedNode] = useState<NexusNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NexusNode | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [pathTo, setPathTo] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: NexusNode; x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const nodesRef = useRef<NexusNode[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const hoverThrottleRef = useRef(0);
  const focusIdxRef = useRef(-1);

  // Refs for stable callbacks (avoid re-renders)
  const activePathRef = useRef<ReturnType<typeof useFindPath> extends (a: string, b: string) => infer R ? R : never>(null);
  const linkStrengthRef = useRef(new Map<string, number>());

  // ─── DIMENSIONS ───────────────────────────────────────────────────────────
  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (fullscreen) {
      setDims({ w: window.innerWidth, h: window.innerHeight });
      const fn = () => setDims({ w: window.innerWidth, h: window.innerHeight });
      window.addEventListener('resize', fn);
      document.body.style.overflow = 'hidden';
      return () => { window.removeEventListener('resize', fn); document.body.style.overflow = ''; };
    }
    const el = containerRef.current;
    if (!el) return;
    setDims({ w: el.clientWidth, h: el.clientHeight });
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fullscreen]);

  // ─── GRAPH DATA ───────────────────────────────────────────────────────────
  const { nodes, links, clusters, adjacency, dateRange } = useNexusGraph({
    contacts, projects, clients, candidates, goals,
    financialEntries, notes, mapState, filters,
  });
  nodesRef.current = nodes;

  const findPath = useFindPath(adjacency);

  const activePath = useMemo(() => {
    if (!pathFrom || !pathTo) return null;
    return findPath(pathFrom, pathTo);
  }, [pathFrom, pathTo, findPath]);
  activePathRef.current = activePath;

  const pathNodeSet = useMemo(() => {
    if (!activePath) return new Set<string>();
    return new Set(activePath.nodeIds);
  }, [activePath]);

  // Link strength (multi-edge pairs)
  const linkStrengthMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      const k = s < t ? `${s}::${t}` : `${t}::${s}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [links]);
  linkStrengthRef.current = linkStrengthMap;

  // Hover neighbor set (for tooltip only)
  const hoverNeighborCount = useMemo(() => {
    if (!hoveredNode) return 0;
    let c = 0;
    for (const l of links) {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (s === hoveredNode.id || t === hoveredNode.id) c++;
    }
    return c;
  }, [hoveredNode, links]);

  // ─── FORCE CONFIG + AUTO-ROTATE ───────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') charge.strength(-35);
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') link.distance(30);
      try {
        const c = fg.controls() as any;
        if (c) { c.autoRotate = true; c.autoRotateSpeed = 0.25; }
      } catch {}
      fg.d3ReheatSimulation();
    }, 200);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // Zoom to fit on load
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 40), 2000);
    return () => clearTimeout(t);
  }, []);

  // ─── NODE RENDERING ───────────────────────────────────────────────────────
  // Use built-in sphere rendering (nodeColor + nodeVal) for performance.
  // Only EXTEND with a label sprite for larger nodes — no custom geometry.
  const nodeColor = useCallback((node: any) => {
    const n = node as NexusNode;
    if (pathNodeSet.size > 0 && !pathNodeSet.has(n.id)) {
      // Dim non-path nodes
      return `${n.color}44`;
    }
    return n.color;
  }, [pathNodeSet]);

  const nodeVal = useCallback((node: any) => {
    return Math.max((node as NexusNode).size, 1.5);
  }, []);

  // Label sprites only for large nodes (extend mode = add on top of built-in sphere)
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    if (n.size < 2.5 && !pathNodeSet.has(n.id)) return undefined as any;
    const label = new SpriteText(n.label, 1.6, n.color);
    label.fontWeight = '600';
    label.fontFace = 'system-ui, -apple-system, sans-serif';
    label.backgroundColor = 'rgba(6,6,11,0.6)';
    label.padding = 0.6;
    label.borderRadius = 1;
    const r = Math.max(n.size * 0.6, 2);
    label.position.set(0, -(r + 2.5), 0);
    if (pathNodeSet.size > 0 && !pathNodeSet.has(n.id)) {
      label.material.opacity = 0.2;
    }
    return label as unknown as THREE.Object3D;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathNodeSet]);

  // ─── LINK CALLBACKS (fully stable — no state deps) ────────────────────────
  const linkColor = useCallback((link: any) => {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    const ap = activePathRef.current;
    if (ap && ap.nodeIds.length > 1) {
      const si = ap.nodeIds.indexOf(s), ti = ap.nodeIds.indexOf(t);
      if (si >= 0 && ti >= 0 && Math.abs(si - ti) === 1) return '#FFD700';
    }
    const sc = typeof link.source === 'object' ? link.source.color : undefined;
    const tc = typeof link.target === 'object' ? link.target.color : undefined;
    if (sc && tc) return blendHex(sc, tc, 0.14);
    return LINK_COLOR;
  }, []);

  const linkWidth = useCallback((link: any) => {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    const ap = activePathRef.current;
    if (ap && ap.nodeIds.length > 1) {
      const si = ap.nodeIds.indexOf(s), ti = ap.nodeIds.indexOf(t);
      if (si >= 0 && ti >= 0 && Math.abs(si - ti) === 1) return 3;
    }
    const k = s < t ? `${s}::${t}` : `${t}::${s}`;
    const str = Math.min(linkStrengthRef.current.get(k) || 1, 4);
    return 0.3 + str * 0.2;
  }, []);

  const linkParticles = useCallback((link: any) => {
    const ap = activePathRef.current;
    if (!ap) return 0;
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    const si = ap.nodeIds.indexOf(s), ti = ap.nodeIds.indexOf(t);
    if (si >= 0 && ti >= 0 && Math.abs(si - ti) === 1) return 3;
    return 0;
  }, []);

  // ─── INTERACTIONS ─────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setContextMenu(null);
    if (pathFrom && !pathTo && n.id !== pathFrom) {
      setPathTo(n.id);
      setSelectedNode(n);
    } else {
      setSelectedNode(prev => prev?.id === n.id ? null : n);
    }
    const fg = fgRef.current;
    if (fg && node.x !== undefined) {
      const dist = 40 + n.size * 3;
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0.001);
      fg.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 }, 800,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathFrom, pathTo]);

  const handleNodeHover = useCallback((node: any) => {
    const n = node ? (node as NexusNode) : null;
    hoveredIdRef.current = n?.id ?? null;
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
    const now = Date.now();
    if (now - hoverThrottleRef.current < 80) return;
    hoverThrottleRef.current = now;
    setHoveredNode(n);
  }, []);

  const handleRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    setContextMenu({
      node: node as NexusNode,
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }, []);

  const handleDrag = useCallback(() => {
    try { const c = fgRef.current?.controls() as any; if (c) c.autoRotate = false; } catch {}
  }, []);
  const handleDragEnd = useCallback(() => {
    setTimeout(() => {
      try { const c = fgRef.current?.controls() as any; if (c) { c.autoRotate = true; c.autoRotateSpeed = 0.25; } } catch {}
    }, 2000);
  }, []);

  // ─── CAMERA ───────────────────────────────────────────────────────────────
  const handleCenter = useCallback(() => fgRef.current?.zoomToFit(600, 40), []);
  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current; if (!fg) return;
    const p = fg.camera().position;
    fg.cameraPosition({ x: p.x * 0.7, y: p.y * 0.7, z: p.z * 0.7 }, undefined, 400);
  }, []);
  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current; if (!fg) return;
    const p = fg.camera().position;
    fg.cameraPosition({ x: p.x * 1.4, y: p.y * 1.4, z: p.z * 1.4 }, undefined, 400);
  }, []);
  const handleFlyToNode = useCallback((id: string) => {
    const node = nodesRef.current.find(n => n.id === id) as any;
    if (!node || node.x === undefined) return;
    setSelectedNode(node as NexusNode);
    const fg = fgRef.current;
    if (fg) {
      const dist = 40 + (node as NexusNode).size * 3;
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0.001);
      fg.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 }, 1000,
      );
    }
  }, []);
  const handleFocusMostConnected = useCallback(() => {
    let best: string | null = null, max = 0;
    for (const [id, n] of adjacency) { if (n.length > max) { max = n.length; best = id; } }
    if (best) handleFlyToNode(best);
  }, [adjacency, handleFlyToNode]);
  const handleFocusIsolated = useCallback(() => {
    const iso = nodes.filter(n => !adjacency.has(n.id) || (adjacency.get(n.id)?.length ?? 0) === 0);
    if (iso.length > 0) { fgRef.current?.zoomToFit(800, 100); handleFlyToNode(iso[0].id); }
  }, [nodes, adjacency, handleFlyToNode]);
  const focusNeighborhood = useCallback((id: string) => {
    const fg = fgRef.current; if (!fg) return;
    const nbrs = adjacency.get(id) ?? [];
    const ids = new Set([id, ...nbrs.map(n => n.neighbor)]);
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (const n of nodesRef.current) {
      if (!ids.has(n.id)) continue;
      const r = n as any;
      if (r.x !== undefined) { sx += r.x; sy += r.y; sz += r.z || 0; c++; }
    }
    if (c > 0) fg.cameraPosition({ x: sx / c + 30, y: sy / c + 30, z: sz / c + 30 }, { x: sx / c, y: sy / c, z: sz / c }, 1000);
  }, [adjacency]);

  // ─── EXPORT ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    try {
      const r = fgRef.current?.renderer() as THREE.WebGLRenderer;
      const url = r.domElement.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = `nexus-${new Date().toISOString().slice(0, 10)}.png`; a.click();
    } catch {}
  }, []);
  const handleExportData = useCallback(() => {
    const d = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, sublabel: n.sublabel, size: n.size })),
      links: links.map(l => ({ source: typeof l.source === 'object' ? (l.source as any).id : l.source, target: typeof l.target === 'object' ? (l.target as any).id : l.target, type: l.type })),
      clusters: clusters.map(c => ({ id: c.id, label: c.label, nodeCount: c.nodeIds.length })),
    };
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nexus-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }, [nodes, links, clusters]);

  // ─── KEYBOARD ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return; }
      if (e.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return; }
        if (fullscreen) { setFullscreen(false); return; }
        setSelectedNode(null); setPathFrom(null); setPathTo(null);
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) setFullscreen(v => !v);
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); containerRef.current?.querySelector('input')?.focus(); }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) handleCenter();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'Tab') {
        e.preventDefault();
        const ns = nodesRef.current; if (!ns.length) return;
        focusIdxRef.current = (focusIdxRef.current + (e.shiftKey ? -1 : 1) + ns.length) % ns.length;
        handleFlyToNode(ns[focusIdxRef.current].id);
      }
      if (['ArrowRight', 'ArrowDown'].includes(e.key) && selectedNode) {
        e.preventDefault();
        const nbrs = adjacency.get(selectedNode.id) ?? [];
        if (nbrs.length) { focusIdxRef.current = (focusIdxRef.current + 1) % nbrs.length; handleFlyToNode(nbrs[focusIdxRef.current].neighbor); }
      }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key) && selectedNode) {
        e.preventDefault();
        const nbrs = adjacency.get(selectedNode.id) ?? [];
        if (nbrs.length) { focusIdxRef.current = ((focusIdxRef.current - 1) + nbrs.length) % nbrs.length; handleFlyToNode(nbrs[focusIdxRef.current].neighbor); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, contextMenu, selectedNode, adjacency, handleCenter, handleZoomIn, handleZoomOut, handleFlyToNode]);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fullscreen ? 'fixed inset-0 z-50' : ''}`}
      style={{ height: fullscreen ? '100vh' : '100%', backgroundColor: BG_COLOR }}
      onClick={() => setContextMenu(null)}
    >
      <NexusToolbar
        filters={filters} onFiltersChange={setFilters}
        is3D={is3D} onToggle3D={() => setIs3D(v => !v)}
        onCenter={handleCenter} fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen(v => !v)}
        nodeCount={nodes.length} linkCount={links.length} clusterCount={clusters.length}
        dateRange={dateRange} onExportScreenshot={handleExport} onExportData={handleExportData}
        pathMode={pathFrom !== null}
        onTogglePathMode={() => { if (pathFrom !== null) { setPathFrom(null); setPathTo(null); } else setPathFrom(selectedNode?.id ?? null); }}
        onZoomIn={handleZoomIn} onZoomOut={handleZoomOut}
        nodes={nodes} onFlyToNode={handleFlyToNode}
        onFocusMostConnected={handleFocusMostConnected} onFocusIsolated={handleFocusIsolated}
      />

      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes: nodes as any[], links: links as any[] }}
        width={dims.w} height={dims.h}
        backgroundColor={BG_COLOR}
        showNavInfo={false}
        // Built-in node rendering (fast instanced spheres)
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        nodeResolution={8}
        nodeOpacity={0.9}
        // Label sprites only for large nodes (extend = add on top of built-in sphere)
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={true}
        // Links
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.7}
        linkCurvature={0.05}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => '#FFD700'}
        // Physics
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.55}
        warmupTicks={60}
        cooldownTicks={100}
        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleRightClick}
        onNodeDrag={handleDrag}
        onNodeDragEnd={handleDragEnd}
        onBackgroundClick={() => { setSelectedNode(null); setContextMenu(null); if (!pathFrom) { setPathFrom(null); setPathTo(null); } }}
        enableNodeDrag={true}
        enableNavigationControls={true}
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute z-30 pointer-events-none px-2.5 py-1.5 rounded-lg hidden sm:block" style={{ left: 12, bottom: 160, backgroundColor: 'rgba(10,10,15,0.9)', border: `1px solid ${hoveredNode.color}44`, backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
            <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{hoveredNode.label}</span>
          </div>
          {hoveredNode.sublabel && <p className="text-[10px] mt-0.5 ml-4" style={{ color: 'rgba(255,255,255,0.4)' }}>{hoveredNode.sublabel}</p>}
          <p className="text-[9px] mt-0.5 ml-4 font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{hoveredNode.type} · {hoverNeighborCount} connections</p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="absolute z-40 rounded-xl py-1.5 min-w-[180px] animate-fade-in" style={{ left: Math.min(contextMenu.x, dims.w - 200), top: Math.min(contextMenu.y, dims.h - 200), backgroundColor: 'rgba(10,10,15,0.95)', border: `1px solid ${contextMenu.node.color}33`, backdropFilter: 'blur(12px)' }} onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 text-xs font-semibold flex items-center gap-2" style={{ color: contextMenu.node.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: contextMenu.node.color }} />
            {contextMenu.node.label}
          </div>
          <div className="h-px mx-2 my-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <button onClick={() => { setSelectedNode(contextMenu.node); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.7)' }}><Eye size={12} /> Select & inspect</button>
          <button onClick={() => { setPathFrom(contextMenu.node.id); setPathTo(null); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5" style={{ color: '#FFD700' }}><GitBranch size={12} /> Find paths from here</button>
          <button onClick={() => { focusNeighborhood(contextMenu.node.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.7)' }}><Eye size={12} /> Focus neighborhood</button>
          <button onClick={() => { setFilters(f => ({ ...f, visibleTypes: { ...f.visibleTypes, [contextMenu.node.type]: false } })); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.5)' }}><EyeOff size={12} /> Hide {contextMenu.node.type}s</button>
          <div className="h-px mx-2 my-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <button onClick={() => { const s = TYPE_SECTIONS[contextMenu.node.type]; if (s) onNavigateToSection(s); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5" style={{ color: contextMenu.node.color }}><ExternalLink size={12} /> Open in {TYPE_SECTIONS[contextMenu.node.type]}</button>
        </div>
      )}

      {/* Minimap */}
      <div className="hidden sm:block">
        <NexusMinimap nodes={nodes} links={links} clusters={clusters} selectedNodeId={selectedNode?.id ?? null} />
      </div>

      {/* Path indicator */}
      {pathFrom && (
        <div className="absolute bottom-3 sm:bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-medium flex items-center justify-between sm:justify-start gap-3" style={{ backgroundColor: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}>
          <span>Path: {pathTo ? `${activePath?.distance ?? '?'} hops` : 'tap destination'}</span>
          <button onClick={() => { setPathFrom(null); setPathTo(null); }} className="px-2 py-0.5 rounded-lg text-[10px] flex-shrink-0" style={{ backgroundColor: 'rgba(255,215,0,0.2)' }}>Exit</button>
        </div>
      )}

      {selectedNode && (
        <NexusDetailPanel
          node={selectedNode} nodes={nodes} adjacency={adjacency}
          activePath={activePath} pathFrom={pathFrom}
          onClose={() => setSelectedNode(null)} onNavigateToSection={onNavigateToSection}
          onStartPath={id => { setPathFrom(id); setPathTo(null); }} onSetPathTarget={id => setPathTo(id)}
        />
      )}
    </div>
  );
}
