import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import type {
  Contact, Project, Client, Candidate, Goal, FinancialEntry, Note, NetworkingMapState,
} from '../../types';
import type { NexusNode, NexusFilters, NexusLinkType } from '../../types/nexus';
import { DEFAULT_NEXUS_FILTERS } from '../../types/nexus';
import { useNexusGraph, useFindPath } from './useNexusGraph';
import { NexusToolbar } from './NexusToolbar';
import { NexusDetailPanel } from './NexusDetailPanel';
import { NexusMinimap } from './NexusMinimap';
import { NODE_COLORS, LINK_COLOR, LINK_HIGHLIGHT_COLOR, BG_COLOR } from './nexusColors';
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

// ─── SHARED GEOMETRY + MATERIAL POOLS ──────────────────────────────────────
// Reuse geometries across all nodes to reduce GC pressure and GPU memory
const SHARED_CORE_GEO = new THREE.SphereGeometry(1, 20, 14);
const SHARED_SHELL_GEO = new THREE.SphereGeometry(1, 16, 10);

// Material caches — store templates, clone on use.
// Clones are disposed when their parent Group is removed by the graph library.
const coreMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getCoreMaterial(color: string, emissiveIntensity = 2.0): THREE.MeshStandardMaterial {
  const key = color;
  if (!coreMaterialCache.has(key)) {
    const c = new THREE.Color(color);
    coreMaterialCache.set(key, new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity,
      roughness: 0.2, metalness: 0.6,
    }));
  }
  const clone = coreMaterialCache.get(key)!.clone();
  clone.emissiveIntensity = emissiveIntensity;
  return clone;
}

const shellMaterialCache = new Map<string, THREE.MeshPhongMaterial>();
function getShellMaterial(color: string, opacity = 0.12): THREE.MeshPhongMaterial {
  if (!shellMaterialCache.has(color)) {
    shellMaterialCache.set(color, new THREE.MeshPhongMaterial({
      color: new THREE.Color(color), transparent: true, opacity,
      side: THREE.DoubleSide, shininess: 80,
    }));
  }
  const clone = shellMaterialCache.get(color)!.clone();
  clone.opacity = opacity;
  return clone;
}

// ─── GLOW TEXTURE CACHE ─────────────────────────────────────────────────────
const glowTextureCache = new Map<string, THREE.Texture>();
function getGlowTexture(color: string): THREE.Texture {
  if (glowTextureCache.has(color)) return glowTextureCache.get(color)!;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.3, color + '99');
  grad.addColorStop(0.6, color + '33');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  glowTextureCache.set(color, tex);
  return tex;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const bloomAdded = useRef(false);

  // ─── ANIMATION REF ARRAYS (replaces scene.traverse) ──────────────────────
  const pulsingCores = useRef<THREE.Mesh[]>([]);
  const rotatingShells = useRef<THREE.Mesh[]>([]);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (fullscreen) {
      // In fullscreen, use window dimensions and listen for resize
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
      window.addEventListener('resize', onResize);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('resize', onResize);
        document.body.style.overflow = '';
      };
    }
    // Normal mode: use container dimensions
    const el = containerRef.current;
    if (!el) return;
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fullscreen]);

  const { nodes, links, clusters, adjacency, dateRange } = useNexusGraph({
    contacts, projects, clients, candidates, goals,
    financialEntries, notes, mapState, filters,
  });

  const findPath = useFindPath(adjacency);

  // ─── PATH FINDING ──────────────────────────────────────────────────────────
  const activePath = useMemo(() => {
    if (!pathFrom || !pathTo) return null;
    return findPath(pathFrom, pathTo);
  }, [pathFrom, pathTo, findPath]);

  const pathNodeSet = useMemo(() => {
    if (!activePath) return new Set<string>();
    return new Set(activePath.nodeIds);
  }, [activePath]);

  // ─── BLOOM POST-PROCESSING (soft glow, added once) ──────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg || bloomAdded.current) return;
      try {
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(dimensions.width, dimensions.height),
          0.8,   // strength — subtle glow, not overwhelming
          0.3,   // radius — tighter bloom spread
          0.35,  // threshold — only brightest elements bloom
        );
        fg.postProcessingComposer().addPass(bloom);
        bloomAdded.current = true;
      } catch (e) {
        console.warn('Bloom pass failed:', e);
      }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── FORCE CONFIGURATION ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') charge.strength(-40);
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') link.distance(28);
      fg.d3ReheatSimulation();
    }, 100);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // ─── AUTO-ROTATE ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const controls = fgRef.current?.controls() as any;
        if (controls) { controls.autoRotate = true; controls.autoRotateSpeed = 0.3; }
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // Clear animation refs when graph changes
  useEffect(() => {
    pulsingCores.current = [];
    rotatingShells.current = [];
  }, [nodes.length, links.length]);

  // Build neighbor set for hover highlighting
  const highlightNodes = useMemo(() => {
    const set = new Set<string>();
    if (!hoveredNode) return set;
    set.add(hoveredNode.id);
    for (const l of links) {
      const src = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (src === hoveredNode.id) set.add(tgt);
      if (tgt === hoveredNode.id) set.add(src);
    }
    return set;
  }, [hoveredNode, links]);

  // ─── NODE RENDERING: shared geo + LOD labels ────────────────────────────
  // NOTE: Do NOT add highlightNodes to deps — it changes on every hover and
  // would rebuild ALL 3D objects, causing massive stutter. Labels use size-based
  // LOD + path membership only. Hover highlighting is handled via link styling.
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const r = Math.max(n.size * 0.6, 2);

    // Dim nodes not on active path
    const onPath = pathNodeSet.size === 0 || pathNodeSet.has(n.id);
    const dimFactor = onPath ? 1.0 : 0.2;

    // Layer 1: Core (shared geometry, scaled)
    const coreEmissive = onPath ? 1.8 : 0.3;
    const core = new THREE.Mesh(SHARED_CORE_GEO, getCoreMaterial(n.color, coreEmissive));
    const baseScale = r * 0.5;
    core.scale.set(baseScale, baseScale, baseScale);
    core.userData = { isPulsingCore: true, phase: Math.random() * Math.PI * 2, baseScale };
    group.add(core);
    pulsingCores.current.push(core);

    // Layer 2: Shell (shared geometry, scaled)
    const shellOpacity = onPath ? 0.1 : 0.03;
    const shell = new THREE.Mesh(SHARED_SHELL_GEO, getShellMaterial(n.color, shellOpacity));
    shell.scale.set(r, r, r);
    shell.userData = { isRotatingShell: true };
    group.add(shell);
    rotatingShells.current.push(shell);

    // Layer 3: Sprite glow (tighter radius for cleaner look)
    const spriteMat = new THREE.SpriteMaterial({
      map: getGlowTexture(n.color),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.35 * dimFactor,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(r * 3.5, r * 3.5, 1);
    group.add(sprite);

    // Label (LOD: show for nodes with size >= 3 or on active path)
    const showLabel = n.size >= 3 || pathNodeSet.has(n.id);
    if (showLabel) {
      const label = new SpriteText(n.label, 1.8, n.color);
      label.fontWeight = '600';
      label.fontFace = 'system-ui, -apple-system, sans-serif';
      label.backgroundColor = 'rgba(6,6,11,0.7)';
      label.padding = 0.8;
      label.borderRadius = 1.5;
      label.position.set(0, -(r + 3), 0);
      label.material.opacity = dimFactor;
      group.add(label as unknown as THREE.Object3D);

      // Sublabel only for larger nodes
      if (n.sublabel && n.size >= 5) {
        const sub = new SpriteText(n.sublabel, 1.1, 'rgba(255,255,255,0.4)');
        sub.fontFace = 'system-ui, -apple-system, sans-serif';
        sub.backgroundColor = 'transparent';
        sub.position.set(0, -(r + 5), 0);
        sub.material.opacity = dimFactor;
        group.add(sub as unknown as THREE.Object3D);
      }
    }

    return group;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathNodeSet]);

  // ─── ANIMATION TICK: direct array iteration (no scene.traverse!) ──────
  const onEngineTick = useCallback(() => {
    const time = performance.now() * 0.001;
    // Filter out disposed meshes lazily (avoids building new arrays each frame)
    let needsCleanup = false;
    for (const obj of pulsingCores.current) {
      if (!obj.parent) { needsCleanup = true; continue; }
      const base = obj.userData.baseScale as number;
      const s = base * (1 + 0.08 * Math.sin(time * 1.8 + obj.userData.phase));
      obj.scale.set(s, s, s);
    }
    for (const obj of rotatingShells.current) {
      if (!obj.parent) { needsCleanup = true; continue; }
      obj.rotation.y += 0.002;
      obj.rotation.x += 0.0007;
    }
    // Periodically clean up disposed refs
    if (needsCleanup) {
      pulsingCores.current = pulsingCores.current.filter(o => o.parent);
      rotatingShells.current = rotatingShells.current.filter(o => o.parent);
    }
  }, []);

  // Link styling
  const linkColor = useCallback((link: any) => {
    // Highlight path links
    if (activePath && activePath.nodeIds.length > 1) {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      const srcIdx = activePath.nodeIds.indexOf(src);
      const tgtIdx = activePath.nodeIds.indexOf(tgt);
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return '#FFD700';
    }
    if (!hoveredNode) return LINK_COLOR;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return LINK_HIGHLIGHT_COLOR;
    return 'rgba(255,255,255,0.04)';
  }, [hoveredNode, activePath]);

  const linkWidth = useCallback((link: any) => {
    // Thicken path links
    if (activePath && activePath.nodeIds.length > 1) {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      const srcIdx = activePath.nodeIds.indexOf(src);
      const tgtIdx = activePath.nodeIds.indexOf(tgt);
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return 3.5;
    }
    if (!hoveredNode) return 0.5;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return 2.5;
    return 0.15;
  }, [hoveredNode, activePath]);

  // ─── CONDITIONAL PARTICLES: only on hovered/selected node links ──────
  const linkParticles = useCallback((link: any) => {
    if (!hoveredNode && !selectedNode) return 0;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const activeId = hoveredNode?.id || selectedNode?.id;
    if (src === activeId || tgt === activeId) return 3;
    // Path links get particles too
    if (activePath) {
      const srcIdx = activePath.nodeIds.indexOf(src);
      const tgtIdx = activePath.nodeIds.indexOf(tgt);
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return 3;
    }
    return 0;
  }, [hoveredNode, selectedNode, activePath]);

  const particleSpeed = useCallback(() => 0.003 + Math.random() * 0.005, []);

  // ─── CLICK: zoom + path mode support ──────────────────────────────────
  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;

    // If in path mode and we have a from but no to, set this as destination
    if (pathFrom && !pathTo && n.id !== pathFrom) {
      setPathTo(n.id);
      setSelectedNode(n);
    } else {
      setSelectedNode(prev => prev?.id === n.id ? null : n);
    }

    const fg = fgRef.current;
    if (fg && node.x !== undefined) {
      const dist = 40 + (n.size * 3);
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0.001);
      fg.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 },
        1000,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathFrom, pathTo]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? (node as NexusNode) : null);
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handleCenter = useCallback(() => {
    fgRef.current?.zoomToFit(600, 40);
  }, []);

  const handleDoubleClick = useCallback((node: any) => {
    const map: Record<string, string> = {
      contact: 'contacts', project: 'projects', client: 'recruitment',
      candidate: 'recruitment', goal: 'goals', financial: 'financial', note: 'notes',
    };
    const section = map[(node as NexusNode).type];
    if (section) onNavigateToSection(section);
  }, [onNavigateToSection]);

  // Pause auto-rotate while dragging
  const handleDrag = useCallback(() => {
    try {
      const controls = fgRef.current?.controls() as any;
      if (controls) controls.autoRotate = false;
    } catch {}
  }, []);

  const handleDragEnd = useCallback(() => {
    setTimeout(() => {
      try {
        const controls = fgRef.current?.controls() as any;
        if (controls) { controls.autoRotate = true; controls.autoRotateSpeed = 0.3; }
      } catch {}
    }, 2000);
  }, []);

  // ─── EXPORT SCREENSHOT ────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const renderer = fg.renderer() as THREE.WebGLRenderer;
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `nexus-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      console.warn('Export failed:', e);
    }
  }, []);

  // ─── EXPORT GRAPH DATA ────────────────────────────────────────────────────
  const handleExportData = useCallback(() => {
    const data = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, label: n.label, sublabel: n.sublabel, size: n.size })),
      links: links.map(l => ({ source: typeof l.source === 'object' ? (l.source as any).id : l.source, target: typeof l.target === 'object' ? (l.target as any).id : l.target, type: l.type })),
      clusters: clusters.map(c => ({ id: c.id, label: c.label, nodeCount: c.nodeIds.length })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [nodes, links, clusters]);

  // ─── ZOOM CONTROLS ──────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const cam = fg.camera();
    const pos = cam.position;
    fg.cameraPosition(
      { x: pos.x * 0.7, y: pos.y * 0.7, z: pos.z * 0.7 },
      undefined, 400,
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const cam = fg.camera();
    const pos = cam.position;
    fg.cameraPosition(
      { x: pos.x * 1.4, y: pos.y * 1.4, z: pos.z * 1.4 },
      undefined, 400,
    );
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === 'Escape') {
        if (fullscreen) { setFullscreen(false); return; }
        setSelectedNode(null);
        setPathFrom(null);
        setPathTo(null);
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        setFullscreen(v => !v);
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        containerRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        handleCenter();
      }
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, handleCenter, handleZoomIn, handleZoomOut]);

  // Zoom to fit on load
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 40), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fullscreen ? 'fixed inset-0 z-50' : ''}`}
      style={{ height: fullscreen ? '100vh' : '100%', backgroundColor: BG_COLOR }}
    >
      <NexusToolbar
        filters={filters}
        onFiltersChange={setFilters}
        is3D={is3D}
        onToggle3D={() => setIs3D(v => !v)}
        onCenter={handleCenter}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen(v => !v)}
        nodeCount={nodes.length}
        linkCount={links.length}
        clusterCount={clusters.length}
        dateRange={dateRange}
        onExportScreenshot={handleExport}
        onExportData={handleExportData}
        pathMode={pathFrom !== null}
        onTogglePathMode={() => {
          if (pathFrom !== null) { setPathFrom(null); setPathTo(null); }
          else setPathFrom(selectedNode?.id ?? null);
        }}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes: nodes as any[], links: links as any[] }}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={BG_COLOR}
        showNavInfo={false}

        // Nodes
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}

        // Links — conditional particles
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}
        linkCurvature={0.08}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={particleSpeed}
        linkDirectionalParticleColor={() => '#ffffff'}

        // Physics — higher decay = faster settling = less jitter
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.028}
        d3VelocityDecay={0.4}
        warmupTicks={40}
        cooldownTicks={200}

        // Animation
        onEngineTick={onEngineTick}

        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleDoubleClick}
        onNodeDrag={handleDrag}
        onNodeDragEnd={handleDragEnd}
        onBackgroundClick={() => { setSelectedNode(null); if (!pathFrom) { setPathFrom(null); setPathTo(null); } }}
        enableNodeDrag={true}
        enableNavigationControls={true}
      />

      {/* Hover tooltip — hidden on touch devices */}
      {hoveredNode && (
        <div
          className="absolute z-30 pointer-events-none px-2.5 py-1.5 rounded-lg hidden sm:block"
          style={{
            left: 12, bottom: 160,
            backgroundColor: 'rgba(10,10,15,0.9)',
            border: `1px solid ${hoveredNode.color}44`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
            <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{hoveredNode.label}</span>
          </div>
          {hoveredNode.sublabel && (
            <p className="text-[10px] mt-0.5 ml-4" style={{ color: 'rgba(255,255,255,0.4)' }}>{hoveredNode.sublabel}</p>
          )}
          <p className="text-[9px] mt-0.5 ml-4 font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {hoveredNode.type} · {highlightNodes.size - 1} connections
          </p>
        </div>
      )}

      {/* Minimap — hide on mobile to save space */}
      <div className="hidden sm:block">
        <NexusMinimap nodes={nodes} links={links} clusters={clusters} selectedNodeId={selectedNode?.id ?? null} />
      </div>

      {/* Path mode indicator */}
      {pathFrom && (
        <div
          className="absolute bottom-3 sm:bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-medium flex items-center justify-between sm:justify-start gap-3"
          style={{ backgroundColor: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}
        >
          <span>Path: {pathTo ? `${activePath?.distance ?? '?'} hops` : 'tap destination'}</span>
          <button
            onClick={() => { setPathFrom(null); setPathTo(null); }}
            className="px-2 py-0.5 rounded-lg text-[10px] flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,215,0,0.2)' }}
          >
            Exit
          </button>
        </div>
      )}

      {selectedNode && (
        <NexusDetailPanel
          node={selectedNode}
          nodes={nodes}
          adjacency={adjacency}
          activePath={activePath}
          pathFrom={pathFrom}
          onClose={() => setSelectedNode(null)}
          onNavigateToSection={onNavigateToSection}
          onStartPath={(fromId) => { setPathFrom(fromId); setPathTo(null); }}
          onSetPathTarget={(toId) => setPathTo(toId)}
        />
      )}
    </div>
  );
}
