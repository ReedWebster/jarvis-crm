import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods } from 'react-force-graph-3d';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { GitBranch, Eye, EyeOff, ExternalLink } from 'lucide-react';
import type {
  Contact, Project, Client, Candidate, Goal, FinancialEntry, Note, NetworkingMapState,
} from '../../types';
import type { NexusNode, NexusFilters, NexusLinkType, NexusNodeType } from '../../types/nexus';
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

// ─── SHARED GEOMETRIES (lower tessellation for performance) ─────────────────
const NODE_CORE_GEO: Record<NexusNodeType, THREE.BufferGeometry> = {
  contact:   new THREE.SphereGeometry(1, 14, 10),
  project:   new THREE.BoxGeometry(1.5, 1.5, 1.5),
  client:    new THREE.OctahedronGeometry(1.15),
  candidate: new THREE.DodecahedronGeometry(1.05),
  goal:      new THREE.IcosahedronGeometry(1.1),
  financial: new THREE.TetrahedronGeometry(1.25),
  note:      new THREE.CylinderGeometry(0.85, 0.85, 1.3, 6),
};
const CORE_SCALE: Record<NexusNodeType, number> = {
  contact: 0.5, project: 0.36, client: 0.43, candidate: 0.43,
  goal: 0.43, financial: 0.4, note: 0.43,
};

// ─── MATERIAL CACHE (clone from template) ───────────────────────────────────
const coreMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getCoreMaterial(color: string, emissiveIntensity = 2.0): THREE.MeshStandardMaterial {
  if (!coreMaterialCache.has(color)) {
    const c = new THREE.Color(color);
    coreMaterialCache.set(color, new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity, roughness: 0.25, metalness: 0.5,
    }));
  }
  const clone = coreMaterialCache.get(color)!.clone();
  clone.emissiveIntensity = emissiveIntensity;
  return clone;
}

// ─── GLOW TEXTURE CACHE ─────────────────────────────────────────────────────
const glowTextureCache = new Map<string, THREE.Texture>();
function getGlowTexture(color: string): THREE.Texture {
  if (glowTextureCache.has(color)) return glowTextureCache.get(color)!;
  const size = 64; // smaller texture = faster
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
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

// ─── COLOR BLENDING (cached) ────────────────────────────────────────────────
const blendCache = new Map<string, string>();
function blendColors(a: string, b: string, alpha: number): string {
  const key = `${a}:${b}:${alpha}`;
  if (blendCache.has(key)) return blendCache.get(key)!;
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  ca.lerp(cb, 0.5);
  const r = Math.round(ca.r * 255);
  const g = Math.round(ca.g * 255);
  const bl = Math.round(ca.b * 255);
  const result = `rgba(${r},${g},${bl},${alpha})`;
  blendCache.set(key, result);
  return result;
}

const TYPE_SECTIONS: Record<string, string> = {
  contact: 'contacts', project: 'projects', client: 'recruitment',
  candidate: 'recruitment', goal: 'goals', financial: 'financial', note: 'notes',
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

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
  const bloomAdded = useRef(false);

  // Animation refs
  const pulsingCores = useRef<THREE.Mesh[]>([]);

  // Performance refs — avoid React re-renders in hot paths
  const hoveredNodeIdRef = useRef<string | null>(null);
  const nodeGroupsRef = useRef(new Map<string, THREE.Group>());
  const ambientParticlesRef = useRef<THREE.Points | null>(null);
  const nebulaSpritesRef = useRef(new Map<number, THREE.Sprite>());
  const rippleTimeRef = useRef(0);
  const rippleNeighborIdsRef = useRef(new Set<string>());
  const frameCountRef = useRef(0);
  const nodesRef = useRef<NexusNode[]>([]);
  const focusIndexRef = useRef(-1);
  const hoverThrottleRef = useRef(0);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (fullscreen) {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      const onResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
      window.addEventListener('resize', onResize);
      document.body.style.overflow = 'hidden';
      return () => { window.removeEventListener('resize', onResize); document.body.style.overflow = ''; };
    }
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
  nodesRef.current = nodes;

  const findPath = useFindPath(adjacency);

  const activePath = useMemo(() => {
    if (!pathFrom || !pathTo) return null;
    return findPath(pathFrom, pathTo);
  }, [pathFrom, pathTo, findPath]);

  const pathNodeSet = useMemo(() => {
    if (!activePath) return new Set<string>();
    return new Set(activePath.nodeIds);
  }, [activePath]);

  // Active path ref for stable callbacks
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  // ─── LINK STRENGTH ────────────────────────────────────────────────────────
  const linkStrengthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of links) {
      const src = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const tgt = typeof link.target === 'object' ? (link.target as any).id : link.target;
      const key = [src, tgt].sort().join('::');
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [links]);
  const linkStrengthRef = useRef(linkStrengthMap);
  linkStrengthRef.current = linkStrengthMap;

  // ─── BLOOM + AMBIENT PARTICLES (once on mount) ────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;

      if (!bloomAdded.current) {
        try {
          const bloom = new UnrealBloomPass(
            new THREE.Vector2(dimensions.width, dimensions.height),
            0.5,   // lower strength
            0.25,
            0.5,   // higher threshold = fewer pixels bloom
          );
          fg.postProcessingComposer().addPass(bloom);
          bloomAdded.current = true;
        } catch (e) { console.warn('Bloom failed:', e); }
      }

      // Ambient star field (100 particles, single draw call)
      if (!ambientParticlesRef.current) {
        const count = 100;
        const positions = new Float32Array(count * 3);
        const spread = 400;
        for (let i = 0; i < count; i++) {
          positions[i * 3]     = (Math.random() - 0.5) * spread;
          positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
          positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
          size: 0.5, color: new THREE.Color('#334488'),
          transparent: true, opacity: 0.25,
          blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        const points = new THREE.Points(geo, mat);
        try { fg.scene().add(points); } catch {}
        ambientParticlesRef.current = points;
      }
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── CLUSTER NEBULAE ──────────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = setTimeout(() => {
      try {
        const scene = fg.scene();
        for (const [, sprite] of nebulaSpritesRef.current) {
          scene.remove(sprite);
          sprite.material.dispose();
        }
        nebulaSpritesRef.current.clear();

        for (const cluster of clusters) {
          if (cluster.nodeIds.length < 3) continue;
          const spriteMat = new THREE.SpriteMaterial({
            map: getGlowTexture(cluster.color),
            blending: THREE.AdditiveBlending,
            transparent: true, opacity: 0.05, depthWrite: false,
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(70, 70, 1);
          scene.add(sprite);
          nebulaSpritesRef.current.set(cluster.id, sprite);
        }
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [clusters]);

  // ─── FORCE CONFIG ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force('charge');
      if (charge && typeof charge.strength === 'function') charge.strength(-35);
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') link.distance(30);
      fg.d3ReheatSimulation();
    }, 100);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // ─── AUTO-ROTATE ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const controls = fgRef.current?.controls() as any;
        if (controls) { controls.autoRotate = true; controls.autoRotateSpeed = 0.25; }
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // Clear animation refs on graph changes
  useEffect(() => {
    pulsingCores.current = [];
    nodeGroupsRef.current.clear();
  }, [nodes.length, links.length]);

  // Neighbor set for tooltip display only (not used in link callbacks)
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

  // ─── NODE RENDERING (no shell layer = half the meshes) ────────────────────
  const nodeThreeObject = useCallback((node: any) => {
    const n = node as NexusNode;
    const group = new THREE.Group();
    const r = Math.max(n.size * 0.6, 2);
    const onPath = pathNodeSet.size === 0 || pathNodeSet.has(n.id);
    const dimFactor = onPath ? 1.0 : 0.2;

    // Core: type-specific geometry
    const baseEmissive = onPath ? 1.6 : 0.3;
    const geo = NODE_CORE_GEO[n.type] || NODE_CORE_GEO.contact;
    const scaleFactor = CORE_SCALE[n.type] || 0.5;
    const core = new THREE.Mesh(geo, getCoreMaterial(n.color, baseEmissive));
    const baseScale = r * scaleFactor;
    core.scale.set(baseScale, baseScale, baseScale);
    core.userData = { isPulsingCore: true, phase: Math.random() * Math.PI * 2, baseScale, baseEmissive, nodeId: n.id };
    group.add(core);
    pulsingCores.current.push(core);

    // Glow sprite
    const spriteMat = new THREE.SpriteMaterial({
      map: getGlowTexture(n.color),
      blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.3 * dimFactor, depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(r * 3, r * 3, 1);
    group.add(sprite);

    // Label (LOD: size >= 2 or on path)
    if (n.size >= 2 || pathNodeSet.has(n.id)) {
      const label = new SpriteText(n.label, 1.8, n.color);
      label.fontWeight = '600';
      label.fontFace = 'system-ui, -apple-system, sans-serif';
      label.backgroundColor = 'rgba(6,6,11,0.7)';
      label.padding = 0.8;
      label.borderRadius = 1.5;
      label.position.set(0, -(r + 3), 0);
      label.material.opacity = dimFactor;
      group.add(label as unknown as THREE.Object3D);

      if (n.sublabel && n.size >= 4) {
        const sub = new SpriteText(n.sublabel, 1.1, 'rgba(255,255,255,0.4)');
        sub.fontFace = 'system-ui, -apple-system, sans-serif';
        sub.backgroundColor = 'transparent';
        sub.position.set(0, -(r + 5), 0);
        sub.material.opacity = dimFactor;
        group.add(sub as unknown as THREE.Object3D);
      }
    }

    group.userData.nodeId = n.id;
    nodeGroupsRef.current.set(n.id, group);
    return group;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathNodeSet]);

  // ─── ANIMATION TICK ────────────────────────────────────────────────────────
  const onEngineTick = useCallback(() => {
    const time = performance.now() * 0.001;
    frameCountRef.current++;
    let needsCleanup = false;

    // Pulsing cores + ripple
    const rippleAge = time - rippleTimeRef.current;
    const doRipple = rippleAge < 1.5;

    for (const obj of pulsingCores.current) {
      if (!obj.parent) { needsCleanup = true; continue; }
      const base = obj.userData.baseScale as number;
      const s = base * (1 + 0.06 * Math.sin(time * 1.5 + obj.userData.phase));
      obj.scale.set(s, s, s);

      // Ripple: reset to base emissive + add decaying boost
      if (doRipple) {
        const nodeId = obj.userData.nodeId as string;
        if (rippleNeighborIdsRef.current.has(nodeId)) {
          const boost = Math.max(0, 1 - rippleAge) * 1.5;
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = (obj.userData.baseEmissive as number) + boost;
        }
      }
    }

    // Hover expansion (smooth lerp, only check when hovering)
    const hovId = hoveredNodeIdRef.current;
    if (hovId || frameCountRef.current % 4 === 0) {
      for (const [nodeId, group] of nodeGroupsRef.current) {
        if (!group.parent) continue;
        const target = nodeId === hovId ? 1.2 : 1.0;
        const cur = group.scale.x;
        if (Math.abs(cur - target) > 0.005) {
          const next = cur + (target - cur) * 0.15;
          group.scale.set(next, next, next);
        }
      }
    }

    // Ambient particles (cheap rotation)
    if (ambientParticlesRef.current) {
      ambientParticlesRef.current.rotation.y = time * 0.012;
    }

    // Cluster nebulae (update centroid every 60 frames)
    if (frameCountRef.current % 60 === 0 && nebulaSpritesRef.current.size > 0) {
      const ns = nodesRef.current;
      for (const [clusterId, sprite] of nebulaSpritesRef.current) {
        let cx = 0, cy = 0, cz = 0, count = 0;
        for (const n of ns) {
          if (n.clusterId !== clusterId) continue;
          const raw = n as any;
          if (raw.x !== undefined) { cx += raw.x; cy += raw.y; cz += raw.z || 0; count++; }
        }
        if (count > 0) sprite.position.set(cx / count, cy / count, cz / count);
      }
    }

    if (needsCleanup) {
      pulsingCores.current = pulsingCores.current.filter(o => o.parent);
    }
  }, []);

  // ─── LINK CALLBACKS (STABLE — no hoveredNode dep, use gradient colors) ────
  // These callbacks do NOT depend on hoveredNode to avoid React re-renders
  // on every mouse move. Hover feedback comes from node expansion + tooltip.
  const linkColor = useCallback((link: any) => {
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;

    // Path highlighting
    const ap = activePathRef.current;
    if (ap && ap.nodeIds.length > 1) {
      const srcIdx = ap.nodeIds.indexOf(src);
      const tgtIdx = ap.nodeIds.indexOf(tgt);
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return '#FFD700';
    }

    // Gradient blend of endpoint colors
    const sc = typeof link.source === 'object' ? link.source.color : undefined;
    const tc = typeof link.target === 'object' ? link.target.color : undefined;
    if (sc && tc) return blendColors(sc, tc, 0.14);
    return LINK_COLOR;
  }, []);

  const linkWidth = useCallback((link: any) => {
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;

    const ap = activePathRef.current;
    if (ap && ap.nodeIds.length > 1) {
      const srcIdx = ap.nodeIds.indexOf(src);
      const tgtIdx = ap.nodeIds.indexOf(tgt);
      if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return 3.5;
    }

    const key = [src, tgt].sort().join('::');
    const strength = Math.min(linkStrengthRef.current.get(key) || 1, 4);
    return 0.3 + strength * 0.25;
  }, []);

  // Particles only on selected node (not hover — avoids re-renders)
  const linkParticles = useCallback((link: any) => {
    const ap = activePathRef.current;
    if (!ap) return 0;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const srcIdx = ap.nodeIds.indexOf(src);
    const tgtIdx = ap.nodeIds.indexOf(tgt);
    if (srcIdx >= 0 && tgtIdx >= 0 && Math.abs(srcIdx - tgtIdx) === 1) return 3;
    return 0;
  }, []);

  const particleSpeed = useCallback(() => 0.003 + Math.random() * 0.005, []);

  const particleColor = useCallback((link: any) => {
    const sc = typeof link.source === 'object' ? link.source.color : undefined;
    const tc = typeof link.target === 'object' ? link.target.color : undefined;
    if (sc && tc) return blendColors(sc, tc, 0.8);
    return '#ffffff';
  }, []);

  // ─── NODE CLICK ───────────────────────────────────────────────────────────
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

  // Compute ripple neighbors on selection change
  useEffect(() => {
    if (!selectedNode) { rippleNeighborIdsRef.current.clear(); return; }
    const neighbors = new Set<string>([selectedNode.id]);
    for (const l of links) {
      const src = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as any).id : l.target;
      if (src === selectedNode.id) neighbors.add(tgt);
      if (tgt === selectedNode.id) neighbors.add(src);
    }
    rippleNeighborIdsRef.current = neighbors;
    rippleTimeRef.current = performance.now() * 0.001;
  }, [selectedNode, links]);

  // ─── HOVER (throttled to avoid React re-render spam) ──────────────────────
  const handleNodeHover = useCallback((node: any) => {
    const n = node ? (node as NexusNode) : null;
    hoveredNodeIdRef.current = n?.id ?? null;
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';

    // Throttle React state updates to max 10/sec
    const now = Date.now();
    if (now - hoverThrottleRef.current < 100) return;
    hoverThrottleRef.current = now;
    setHoveredNode(n);
  }, []);

  // ─── RIGHT-CLICK CONTEXT MENU ─────────────────────────────────────────────
  const handleRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault();
    const n = node as NexusNode;
    const rect = containerRef.current?.getBoundingClientRect();
    setContextMenu({
      node: n,
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }, []);

  // ─── CAMERA CONTROLS ─────────────────────────────────────────────────────
  const handleCenter = useCallback(() => { fgRef.current?.zoomToFit(600, 40); }, []);
  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current; if (!fg) return;
    const pos = fg.camera().position;
    fg.cameraPosition({ x: pos.x * 0.7, y: pos.y * 0.7, z: pos.z * 0.7 }, undefined, 400);
  }, []);
  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current; if (!fg) return;
    const pos = fg.camera().position;
    fg.cameraPosition({ x: pos.x * 1.4, y: pos.y * 1.4, z: pos.z * 1.4 }, undefined, 400);
  }, []);

  const handleFlyToNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId) as any;
    if (!node || node.x === undefined) return;
    setSelectedNode(node as NexusNode);
    const fg = fgRef.current;
    if (fg) {
      const dist = 40 + ((node as NexusNode).size * 3);
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z || 0.001);
      fg.cameraPosition(
        { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
        { x: node.x, y: node.y, z: node.z || 0 },
        1200,
      );
    }
  }, []);

  const handleFocusMostConnected = useCallback(() => {
    let maxConn = 0;
    let bestId: string | null = null;
    for (const [nodeId, neighbors] of adjacency) {
      if (neighbors.length > maxConn) { maxConn = neighbors.length; bestId = nodeId; }
    }
    if (bestId) handleFlyToNode(bestId);
  }, [adjacency, handleFlyToNode]);

  const handleFocusIsolated = useCallback(() => {
    const isolatedIds = nodes.filter(n => !adjacency.has(n.id) || (adjacency.get(n.id)?.length ?? 0) === 0);
    if (isolatedIds.length === 0) return;
    fgRef.current?.zoomToFit(800, 100);
    if (isolatedIds[0]) handleFlyToNode(isolatedIds[0].id);
  }, [nodes, adjacency, handleFlyToNode]);

  const focusNeighborhood = useCallback((nodeId: string) => {
    const fg = fgRef.current;
    if (!fg) return;
    const neighbors = adjacency.get(nodeId) ?? [];
    const ids = new Set([nodeId, ...neighbors.map(n => n.neighbor)]);
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (const n of nodesRef.current) {
      if (!ids.has(n.id)) continue;
      const raw = n as any;
      if (raw.x !== undefined) { sx += raw.x; sy += raw.y; sz += raw.z || 0; count++; }
    }
    if (count > 0) {
      fg.cameraPosition(
        { x: sx / count + 30, y: sy / count + 30, z: sz / count + 30 },
        { x: sx / count, y: sy / count, z: sz / count },
        1200,
      );
    }
  }, [adjacency]);

  const handleDrag = useCallback(() => {
    try { const c = fgRef.current?.controls() as any; if (c) c.autoRotate = false; } catch {}
  }, []);
  const handleDragEnd = useCallback(() => {
    setTimeout(() => {
      try { const c = fgRef.current?.controls() as any; if (c) { c.autoRotate = true; c.autoRotateSpeed = 0.25; } } catch {}
    }, 2000);
  }, []);

  const handleExport = useCallback(() => {
    const fg = fgRef.current; if (!fg) return;
    try {
      const renderer = fg.renderer() as THREE.WebGLRenderer;
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl; a.download = `nexus-${new Date().toISOString().slice(0, 10)}.png`; a.click();
    } catch (e) { console.warn('Export failed:', e); }
  }, []);

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
    a.download = `nexus-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  }, [nodes, links, clusters]);

  // ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') {
        if (contextMenu) { setContextMenu(null); return; }
        if (fullscreen) { setFullscreen(false); return; }
        setSelectedNode(null); setPathFrom(null); setPathTo(null);
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) setFullscreen(v => !v);
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        containerRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) handleCenter();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === 'Tab') {
        e.preventDefault();
        const ns = nodesRef.current;
        if (ns.length === 0) return;
        const dir = e.shiftKey ? -1 : 1;
        focusIndexRef.current = (focusIndexRef.current + dir + ns.length) % ns.length;
        handleFlyToNode(ns[focusIndexRef.current].id);
      }
      if (['ArrowRight', 'ArrowDown'].includes(e.key) && selectedNode) {
        e.preventDefault();
        const neighbors = adjacency.get(selectedNode.id) ?? [];
        if (neighbors.length > 0) {
          const idx = (focusIndexRef.current + 1) % neighbors.length;
          focusIndexRef.current = idx;
          handleFlyToNode(neighbors[idx].neighbor);
        }
      }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key) && selectedNode) {
        e.preventDefault();
        const neighbors = adjacency.get(selectedNode.id) ?? [];
        if (neighbors.length > 0) {
          const idx = ((focusIndexRef.current - 1) + neighbors.length) % neighbors.length;
          focusIndexRef.current = idx;
          handleFlyToNode(neighbors[idx].neighbor);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, contextMenu, selectedNode, adjacency, handleCenter, handleZoomIn, handleZoomOut, handleFlyToNode]);

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(600, 40), 2000);
    return () => clearTimeout(t);
  }, []);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fullscreen ? 'fixed inset-0 z-50' : ''}`}
      style={{ height: fullscreen ? '100vh' : '100%', backgroundColor: BG_COLOR }}
      onClick={() => setContextMenu(null)}
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
        nodes={nodes}
        onFlyToNode={handleFlyToNode}
        onFocusMostConnected={handleFocusMostConnected}
        onFocusIsolated={handleFocusIsolated}
      />

      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes: nodes as any[], links: links as any[] }}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={BG_COLOR}
        showNavInfo={false}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}
        linkCurvature={0.06}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={particleSpeed}
        linkDirectionalParticleColor={particleColor}
        numDimensions={is3D ? 3 : 2}
        d3AlphaDecay={0.035}
        d3VelocityDecay={0.5}
        warmupTicks={50}
        cooldownTicks={120}
        onEngineTick={onEngineTick}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-40 rounded-xl py-1.5 min-w-[180px] animate-fade-in"
          style={{
            left: Math.min(contextMenu.x, dimensions.width - 200),
            top: Math.min(contextMenu.y, dimensions.height - 200),
            backgroundColor: 'rgba(10,10,15,0.95)',
            border: `1px solid ${contextMenu.node.color}33`,
            backdropFilter: 'blur(12px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold flex items-center gap-2" style={{ color: contextMenu.node.color }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: contextMenu.node.color }} />
            {contextMenu.node.label}
          </div>
          <div className="h-px mx-2 my-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <button onClick={() => { setSelectedNode(contextMenu.node); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Eye size={12} /> Select & inspect
          </button>
          <button onClick={() => { setPathFrom(contextMenu.node.id); setPathTo(null); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: '#FFD700' }}>
            <GitBranch size={12} /> Find paths from here
          </button>
          <button onClick={() => { focusNeighborhood(contextMenu.node.id); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}>
            <Eye size={12} /> Focus neighborhood
          </button>
          <button onClick={() => { setFilters(f => ({ ...f, visibleTypes: { ...f.visibleTypes, [contextMenu.node.type]: false } })); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <EyeOff size={12} /> Hide {contextMenu.node.type}s
          </button>
          <div className="h-px mx-2 my-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <button onClick={() => { const section = TYPE_SECTIONS[contextMenu.node.type]; if (section) onNavigateToSection(section); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors" style={{ color: contextMenu.node.color }}>
            <ExternalLink size={12} /> Open in {TYPE_SECTIONS[contextMenu.node.type]}
          </button>
        </div>
      )}

      {/* Minimap */}
      <div className="hidden sm:block">
        <NexusMinimap nodes={nodes} links={links} clusters={clusters} selectedNodeId={selectedNode?.id ?? null} />
      </div>

      {/* Path indicator */}
      {pathFrom && (
        <div
          className="absolute bottom-3 sm:bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-20 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-medium flex items-center justify-between sm:justify-start gap-3"
          style={{ backgroundColor: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}
        >
          <span>Path: {pathTo ? `${activePath?.distance ?? '?'} hops` : 'tap destination'}</span>
          <button onClick={() => { setPathFrom(null); setPathTo(null); }} className="px-2 py-0.5 rounded-lg text-[10px] flex-shrink-0" style={{ backgroundColor: 'rgba(255,215,0,0.2)' }}>Exit</button>
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
