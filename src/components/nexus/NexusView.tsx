import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
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
import { LINK_COLOR, LINK_HIGHLIGHT_COLOR, BG_COLOR } from './nexusColors';
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

// ─── ANIMATION STATE ────────────────────────────────────────────────────────

interface NodeMeshRefs {
  group: THREE.Group;
  sphere: THREE.Mesh;
  outerGlow: THREE.Mesh;
  innerGlow: THREE.Mesh;
  ring: THREE.Mesh;
  phaseOffset: number;
  nodeId: string;
}

const meshCache = new Map<string, NodeMeshRefs>();

// Track hovered node ID at module level so the animation loop can access it
// without needing a React ref that re-renders
let _hoveredId: string | null = null;
let _highlightSet: Set<string> = new Set();

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

  // Track container size
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { nodes, links } = useNexusGraph({
    contacts, projects, clients, candidates, goals,
    financialEntries, notes, mapState, filters,
  });

  // ─── Tighten force simulation ─────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force('charge');
    if (charge && typeof charge.strength === 'function') {
      charge.strength(-15);
      charge.distanceMax(100);
    }
    const link = fg.d3Force('link');
    if (link && typeof link.distance === 'function') {
      link.distance(14);
    }
    const center = fg.d3Force('center');
    if (center && typeof center.strength === 'function') {
      center.strength(1.2);
    }
    fg.d3ReheatSimulation();
  }, [nodes.length]);

  // ─── Sync hover state to module-level for animation loop ──────────────────
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

  // Keep module-level refs in sync
  useEffect(() => {
    _hoveredId = hoveredNode?.id ?? null;
    _highlightSet = highlightNodes;
  }, [hoveredNode, highlightNodes]);

  // ─── Breathing animation + hover dimming in one rAF loop ──────────────────
  useEffect(() => {
    let frame: number;
    const animate = () => {
      const t = performance.now() * 0.001;
      meshCache.forEach((refs) => {
        const breath = Math.sin(t * 1.8 + refs.phaseOffset) * 0.5 + 0.5;

        // Pulse sphere scale
        refs.sphere.scale.setScalar(1 + breath * 0.08);

        // Breathe glow opacity
        (refs.outerGlow.material as THREE.MeshBasicMaterial).opacity = 0.04 + breath * 0.08;
        refs.innerGlow.scale.setScalar(1 + breath * 0.15);
        (refs.innerGlow.material as THREE.MeshBasicMaterial).opacity = 0.12 + breath * 0.12;

        // Ring rotation
        refs.ring.rotation.z = t * 0.3 + refs.phaseOffset;
        (refs.ring.material as THREE.MeshBasicMaterial).opacity = 0.08 + breath * 0.1;

        // Hover dimming — done here instead of nodeOpacity prop
        if (_hoveredId) {
          const highlighted = _highlightSet.has(refs.nodeId);
          const targetOpacity = highlighted ? 0.95 : 0.1;
          const currentOpacity = (refs.sphere.material as THREE.MeshStandardMaterial).opacity;
          // Smooth lerp
          const newOpacity = currentOpacity + (targetOpacity - currentOpacity) * 0.15;
          (refs.sphere.material as THREE.MeshStandardMaterial).opacity = newOpacity;
          refs.group.visible = newOpacity > 0.05;
        } else {
          (refs.sphere.material as THREE.MeshStandardMaterial).opacity = 0.95;
          refs.group.visible = true;
        }
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ─── Slow auto-rotation ───────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls() as any;
    if (controls && typeof controls.autoRotate !== 'undefined') {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
    }
  }, []);

  // ─── Custom node rendering ────────────────────────────────────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const color = new THREE.Color(n.color);
    const r = Math.max(n.size * 0.4, 1);

    // Core sphere
    const sphereGeo = new THREE.SphereGeometry(r, 20, 14);
    const sphereMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.95,
      roughness: 0.15,
      metalness: 0.1,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    // Inner glow
    const innerGlowGeo = new THREE.SphereGeometry(r * 1.3, 12, 8);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.2, side: THREE.BackSide,
    });
    const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
    group.add(innerGlow);

    // Outer halo
    const outerGlowGeo = new THREE.SphereGeometry(r * 2, 10, 6);
    const outerGlowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.05, side: THREE.BackSide,
    });
    const outerGlow = new THREE.Mesh(outerGlowGeo, outerGlowMat);
    group.add(outerGlow);

    // Orbiting ring
    const ringGeo = new THREE.TorusGeometry(r * 1.4, 0.08, 6, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.14,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.5;
    group.add(ring);

    // Label
    const sprite = new SpriteText(n.label, 1.4, n.color);
    sprite.fontWeight = '600';
    sprite.fontFace = 'system-ui, -apple-system, sans-serif';
    sprite.backgroundColor = 'rgba(6,6,11,0.7)';
    sprite.padding = 0.7;
    sprite.borderRadius = 1;
    sprite.position.set(0, -(r + 1.8), 0);
    group.add(sprite as unknown as THREE.Object3D);

    // Cache for animation loop
    meshCache.set(n.id, {
      group, sphere, outerGlow, innerGlow, ring,
      phaseOffset: Math.random() * Math.PI * 2,
      nodeId: n.id,
    });

    return group;
  }, []);

  // Link color
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

  const particleSpeed = useCallback(() => 0.004 + Math.random() * 0.005, []);

  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);
    if (fgRef.current && node.x !== undefined) {
      const distance = 50;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z || 0);
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: (node.z || 0) * distRatio },
        { x: node.x, y: node.y, z: node.z || 0 },
        800,
      );
    }
  }, []);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? (node as NexusNode) : null);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleCenter = useCallback(() => {
    fgRef.current?.zoomToFit(600, 20);
  }, []);

  const handleDoubleClick = useCallback((node: any) => {
    const sectionMap: Record<string, string> = {
      contact: 'contacts', project: 'projects', client: 'recruitment',
      candidate: 'recruitment', goal: 'goals', financial: 'financial', note: 'notes',
    };
    const section = sectionMap[(node as NexusNode).type];
    if (section) onNavigateToSection(section);
  }, [onNavigateToSection]);

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

  // Zoom-to-fit on first render
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(800, 20);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Clean up mesh cache
  useEffect(() => {
    const currentIds = new Set(nodes.map(n => n.id));
    meshCache.forEach((_, key) => {
      if (!currentIds.has(key)) meshCache.delete(key);
    });
  }, [nodes]);

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

        // Node rendering — NO nodeOpacity (it's a number prop, not a function)
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}

        // Links — alive with flowing particles
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.8}
        linkCurvature={0.12}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleSpeed={particleSpeed}
        linkDirectionalParticleColor={linkColor}

        // Force simulation — dense
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.018}
        d3VelocityDecay={0.28}
        warmupTicks={60}
        cooldownTicks={250}
        cooldownTime={6000}

        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleDoubleClick}
        onBackgroundClick={handleBackgroundClick}
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
