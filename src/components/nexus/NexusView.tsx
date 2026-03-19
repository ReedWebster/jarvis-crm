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

export function NexusView({
  contacts, projects, clients, candidates, goals,
  financialEntries, notes, onNavigateToSection,
}: Props) {
  // Read-only access to networking map state for manual connections
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

  // Build a set of neighbor node IDs for the hovered node
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

  // Custom node rendering: sphere + text label
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();

    // Sphere
    const geometry = new THREE.SphereGeometry(n.size * 0.6, 16, 12);
    const material = new THREE.MeshLambertMaterial({
      color: n.color,
      transparent: true,
      opacity: 0.85,
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Glow ring
    const ringGeo = new THREE.RingGeometry(n.size * 0.7, n.size * 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: n.color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.lookAt(0, 0, 1);
    group.add(ring);

    // Label
    const sprite = new SpriteText(n.label, 2.2, n.color);
    sprite.fontWeight = '600';
    sprite.backgroundColor = 'rgba(0,0,0,0.5)';
    sprite.padding = 1.2;
    sprite.borderRadius = 2;
    sprite.position.set(0, -(n.size * 0.6 + 3), 0);
    group.add(sprite as unknown as THREE.Object3D);

    return group;
  }, []);

  // Node color: dim non-highlighted nodes on hover
  const nodeOpacity = useCallback((node: any) => {
    if (!hoveredNode) return 0.85;
    return highlightNodes.has(node.id) ? 1 : 0.12;
  }, [hoveredNode, highlightNodes]);

  // Link color: highlight connected links
  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return LINK_COLOR;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return LINK_HIGHLIGHT_COLOR;
    return 'rgba(255,255,255,0.02)';
  }, [hoveredNode]);

  const linkWidth = useCallback((link: any) => {
    if (!hoveredNode) return 0.3;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode.id || tgt === hoveredNode.id) return 1.2;
    return 0.1;
  }, [hoveredNode]);

  const handleNodeClick = useCallback((node: any) => {
    const n = node as NexusNode;
    setSelectedNode(prev => prev?.id === n.id ? null : n);

    // Animate camera to clicked node
    if (fgRef.current && node.x !== undefined) {
      const distance = 120;
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
    fgRef.current?.zoomToFit(600, 60);
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
      fgRef.current?.zoomToFit(800, 80);
    }, 1500);
    return () => clearTimeout(timer);
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

        // Node rendering
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeOpacity={nodeOpacity as any}

        // Link rendering
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}

        // Force simulation
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={50}
        cooldownTicks={200}

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
