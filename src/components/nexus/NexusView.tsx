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

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Set initial dimensions immediately
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

  // ─── SIMPLE node rendering: colored sphere + label ────────────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const r = Math.max(n.size * 0.4, 1.2);

    // Solid glowing sphere
    const geo = new THREE.SphereGeometry(r, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.9 });
    group.add(new THREE.Mesh(geo, mat));

    // Soft outer glow
    const glowGeo = new THREE.SphereGeometry(r * 1.8, 12, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: n.color, transparent: true, opacity: 0.08, side: THREE.BackSide,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    // Name label
    const label = new SpriteText(n.label, 1.5, n.color);
    label.fontWeight = '600';
    label.backgroundColor = 'rgba(6,6,11,0.7)';
    label.padding = 0.8;
    label.borderRadius = 1;
    label.position.set(0, -(r + 2), 0);
    group.add(label as unknown as THREE.Object3D);

    return group;
  }, []);

  // Link styling
  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return LINK_COLOR;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return LINK_HIGHLIGHT_COLOR;
    return 'rgba(255,255,255,0.03)';
  }, [hoveredNode]);

  const linkWidth = useCallback((link: any) => {
    if (!hoveredNode) return 0.5;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return 2;
    return 0.15;
  }, [hoveredNode]);

  const particleSpeed = useCallback(() => 0.003 + Math.random() * 0.004, []);

  // Interactions
  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);
    if (fgRef.current && node.x !== undefined) {
      const dist = 60;
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0);
      fgRef.current.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 },
        800,
      );
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

  // Zoom to fit after simulation settles
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 40), 2000);
    return () => clearTimeout(t);
  }, []);

  // Configure forces after graph mounts
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') {
        charge.strength(-20);
      }
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') {
        link.distance(18);
      }
      fg.d3ReheatSimulation();
    }, 100);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // Auto-rotate
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      try {
        const controls = fg.controls() as any;
        if (controls) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.3;
        }
      } catch {}
    }, 500);
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

        // Links with flowing particles
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.7}
        linkCurvature={0.1}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={1}
        linkDirectionalParticleSpeed={particleSpeed}

        // Physics
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={30}
        cooldownTicks={150}

        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleDoubleClick}
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
