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

// ─── BREATHING ANIMATION ────────────────────────────────────────────────────
// Each node stores refs to its meshes so the tick loop can pulse them

interface NodeMeshRefs {
  sphere: THREE.Mesh;
  outerGlow: THREE.Mesh;
  innerGlow: THREE.Mesh;
  ring: THREE.Mesh;
  phaseOffset: number; // per-node phase so they don't all breathe in sync
}

const meshCache = new Map<string, NodeMeshRefs>();

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

  // ─── Tighten force simulation for dense clustering ────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Very tight clustering — nodes packed together like a neural network
    const charge = fg.d3Force('charge');
    if (charge && typeof charge.strength === 'function') {
      charge.strength(-12); // minimal repulsion = very tight
      charge.distanceMax(80);
    }
    // Ultra-short link distances
    const link = fg.d3Force('link');
    if (link && typeof link.distance === 'function') {
      link.distance(12); // nodes nearly touching
    }
    // Strong center gravity
    const center = fg.d3Force('center');
    if (center && typeof center.strength === 'function') {
      center.strength(1.5);
    }
    fg.d3ReheatSimulation();
  }, [nodes.length]);

  // ─── Breathing animation tick ─────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    let frame: number;
    const animate = () => {
      const t = performance.now() * 0.001; // seconds
      meshCache.forEach((refs) => {
        const breath = Math.sin(t * 1.8 + refs.phaseOffset) * 0.5 + 0.5; // 0→1
        // Pulse sphere scale
        const s = 1 + breath * 0.08;
        refs.sphere.scale.setScalar(s);
        // Breathe outer glow opacity
        (refs.outerGlow.material as THREE.MeshBasicMaterial).opacity = 0.04 + breath * 0.08;
        // Inner glow pulse
        const ig = 1 + breath * 0.15;
        refs.innerGlow.scale.setScalar(ig);
        (refs.innerGlow.material as THREE.MeshBasicMaterial).opacity = 0.12 + breath * 0.12;
        // Ring rotation
        refs.ring.rotation.z = t * 0.3 + refs.phaseOffset;
        (refs.ring.material as THREE.MeshBasicMaterial).opacity = 0.08 + breath * 0.1;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ─── Slow auto-rotation for organic feel ──────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls() as any;
    if (controls && typeof controls.autoRotate !== 'undefined') {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

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

  // ─── Custom node rendering: glowing orb + halo + ring + label ─────────────
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const color = new THREE.Color(n.color);
    const r = Math.max(n.size * 0.35, 0.9); // compact radii

    // Core sphere — emissive for self-lit glow
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

    // Inner glow — tight halo
    const innerGlowGeo = new THREE.SphereGeometry(r * 1.3, 12, 8);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    });
    const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
    group.add(innerGlow);

    // Outer halo — compact
    const outerGlowGeo = new THREE.SphereGeometry(r * 2, 10, 6);
    const outerGlowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
    });
    const outerGlow = new THREE.Mesh(outerGlowGeo, outerGlowMat);
    group.add(outerGlow);

    // Orbiting ring — tighter
    const ringGeo = new THREE.TorusGeometry(r * 1.4, 0.08, 6, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.5;
    group.add(ring);

    // Label — smaller, tucked close
    const sprite = new SpriteText(n.label, 1.3, n.color);
    sprite.fontWeight = '600';
    sprite.fontFace = 'system-ui, -apple-system, sans-serif';
    sprite.backgroundColor = 'rgba(6,6,11,0.75)';
    sprite.padding = 0.6;
    sprite.borderRadius = 1;
    sprite.position.set(0, -(r + 1.6), 0);
    group.add(sprite as unknown as THREE.Object3D);

    // Cache refs for animation
    meshCache.set(n.id, {
      sphere, outerGlow, innerGlow, ring,
      phaseOffset: Math.random() * Math.PI * 2,
    });

    return group;
  }, []);

  // Dim non-highlighted nodes
  const nodeOpacity = useCallback((node: any) => {
    if (!hoveredNode) return 0.92;
    return highlightNodes.has(node.id) ? 1 : 0.08;
  }, [hoveredNode, highlightNodes]);

  // Link color — brighter default, glow on hover
  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return LINK_COLOR;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return LINK_HIGHLIGHT_COLOR;
    return 'rgba(255,255,255,0.02)';
  }, [hoveredNode]);

  const linkWidth = useCallback((link: any) => {
    if (!hoveredNode) return 0.6;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return 2.5;
    return 0.15;
  }, [hoveredNode]);

  // Particle speed varies per link for organic feel
  const particleSpeed = useCallback(() => 0.004 + Math.random() * 0.006, []);

  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);
    if (fgRef.current && node.x !== undefined) {
      const distance = 40; // tight zoom on click
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
    fgRef.current?.zoomToFit(600, 10);
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
      fgRef.current?.zoomToFit(800, 10);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Clean up mesh cache when nodes change
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

        // Node rendering
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeOpacity={nodeOpacity as any}

        // Link rendering — alive with flowing particles
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.8}
        linkCurvature={0.15}
        linkDirectionalParticles={4}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={particleSpeed}
        linkDirectionalParticleColor={linkColor}

        // Force simulation — tight and dense
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.25}
        warmupTicks={80}
        cooldownTicks={300}
        cooldownTime={8000}

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
