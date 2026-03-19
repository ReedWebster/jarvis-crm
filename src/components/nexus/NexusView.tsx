import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import type {
  Contact, Project, Client, Candidate, Goal, FinancialEntry, Note, NetworkingMapState,
} from '../../types';
import type { NexusNode, NexusFilters } from '../../types/nexus';
import { DEFAULT_NEXUS_FILTERS } from '../../types/nexus';
import { useNexusGraph } from './useNexusGraph';
import { NexusToolbar } from './NexusToolbar';
import { NexusDetailPanel } from './NexusDetailPanel';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const bloomAdded = useRef(false);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { nodes, links } = useNexusGraph({
    contacts, projects, clients, candidates, goals,
    financialEntries, notes, mapState, filters,
  });

  // ─── BLOOM POST-PROCESSING ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg || bloomAdded.current) return;
      try {
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(dimensions.width, dimensions.height),
          1.8,   // strength
          0.6,   // radius
          0.15,  // threshold
        );
        fg.postProcessingComposer().addPass(bloom);
        bloomAdded.current = true;
      } catch (e) {
        console.warn('Bloom pass failed:', e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [dimensions.width, dimensions.height]);

  // ─── FORCE CONFIGURATION ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') {
        charge.strength(-30);
      }
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') {
        link.distance(22);
      }
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

  // Build neighbor set
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

  // ─── NODE RENDERING: core + shell + sprite glow + label ───────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const r = Math.max(n.size * 0.6, 2); // BIGGER base radius
    const color = new THREE.Color(n.color);

    // Layer 1: Bright emissive inner core (drives bloom)
    const coreGeo = new THREE.SphereGeometry(r * 0.5, 24, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.6,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.userData = { isPulsingCore: true, phase: Math.random() * Math.PI * 2 };
    group.add(core);

    // Layer 2: Semi-transparent outer shell
    const shellGeo = new THREE.SphereGeometry(r, 20, 14);
    const shellMat = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      shininess: 80,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.userData = { isRotatingShell: true };
    group.add(shell);

    // Layer 3: Sprite-based glow halo (additive blending = neon glow)
    const spriteMat = new THREE.SpriteMaterial({
      map: getGlowTexture(n.color),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(r * 5, r * 5, 1);
    group.add(sprite);

    // Label
    const label = new SpriteText(n.label, 1.8, n.color);
    label.fontWeight = '600';
    label.fontFace = 'system-ui, -apple-system, sans-serif';
    label.backgroundColor = 'rgba(6,6,11,0.65)';
    label.padding = 0.8;
    label.borderRadius = 1.5;
    label.position.set(0, -(r + 3), 0);
    group.add(label as unknown as THREE.Object3D);

    // Sublabel
    if (n.sublabel) {
      const sub = new SpriteText(n.sublabel, 1.1, 'rgba(255,255,255,0.35)');
      sub.fontFace = 'system-ui, -apple-system, sans-serif';
      sub.backgroundColor = 'transparent';
      sub.position.set(0, -(r + 5), 0);
      group.add(sub as unknown as THREE.Object3D);
    }

    return group;
  }, []);

  // ─── ANIMATION TICK: pulsing cores + rotating shells ──────────────────────
  const onEngineTick = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const time = performance.now() * 0.001;
    fg.scene().traverse((obj: THREE.Object3D) => {
      if (obj.userData?.isPulsingCore) {
        const s = 1 + 0.12 * Math.sin(time * 2.2 + obj.userData.phase);
        obj.scale.set(s, s, s);
      }
      if (obj.userData?.isRotatingShell) {
        obj.rotation.y += 0.003;
        obj.rotation.x += 0.001;
      }
    });
  }, []);

  // Link styling
  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return LINK_COLOR;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return LINK_HIGHLIGHT_COLOR;
    return 'rgba(255,255,255,0.02)';
  }, [hoveredNode]);

  const linkWidth = useCallback((link: any) => {
    if (!hoveredNode) return 0.5;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return 2.5;
    return 0.15;
  }, [hoveredNode]);

  const particleSpeed = useCallback(() => 0.003 + Math.random() * 0.005, []);

  // Click — zoom + emit particles on connected links
  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);
    const fg = fgRef.current;
    if (fg && node.x !== undefined) {
      const dist = 40 + (n.size * 3);
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0.001);
      fg.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 },
        1000,
      );
      // Emit particle bursts on connected links
      const graphLinks = (fg as any).graphData().links as any[];
      for (const link of graphLinks) {
        const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (src === n.id || tgt === n.id) {
          fg.emitParticle(link);
        }
      }
    }
  }, []);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNode(null);
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        containerRef.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Zoom to fit
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
      />

      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes: nodes as any[], links: links as any[] }}
        width={fullscreen ? window.innerWidth : dimensions.width}
        height={fullscreen ? window.innerHeight : dimensions.height}
        backgroundColor={BG_COLOR}
        showNavInfo={false}

        // Nodes
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}

        // Links — neon particles flowing
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.7}
        linkCurvature={0.12}
        linkDirectionalParticles={4}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={particleSpeed}
        linkDirectionalParticleColor={() => '#ffffff'}

        // Physics
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={30}
        cooldownTicks={150}

        // Animation
        onEngineTick={onEngineTick}

        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleDoubleClick}
        onNodeDrag={handleDrag}
        onNodeDragEnd={handleDragEnd}
        onBackgroundClick={() => setSelectedNode(null)}
        enableNodeDrag={true}
        enableNavigationControls={true}
      />

      {selectedNode && (
        <NexusDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onNavigateToSection={onNavigateToSection}
        />
      )}
    </div>
  );
}
