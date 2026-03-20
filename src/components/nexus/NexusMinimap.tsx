import React, { useMemo } from 'react';
import type { NexusNode, NexusLink, NexusCluster } from '../../types/nexus';

interface Props {
  nodes: NexusNode[];
  links: NexusLink[];
  clusters: NexusCluster[];
  selectedNodeId: string | null;
}

const SIZE = 140;
const PADDING = 10;

export function NexusMinimap({ nodes, links, clusters, selectedNodeId }: Props) {
  const projected = useMemo(() => {
    if (nodes.length === 0) return { pts: [], lns: [] };

    // Project 3D positions to 2D (use x,y ignoring z)
    const positions = nodes.map(n => {
      const raw = n as any;
      return { id: n.id, x: raw.x ?? 0, y: raw.y ?? 0, color: n.color, size: n.size };
    });

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const usable = SIZE - PADDING * 2;

    const pts = positions.map(p => ({
      id: p.id,
      x: PADDING + ((p.x - minX) / rangeX) * usable,
      y: PADDING + ((p.y - minY) / rangeY) * usable,
      color: p.color,
      r: Math.max(p.size * 0.3, 1),
    }));

    const posMap = new Map(pts.map(p => [p.id, p]));
    const lns = links
      .map(l => {
        const src = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const tgt = typeof l.target === 'object' ? (l.target as any).id : l.target;
        const a = posMap.get(src);
        const b = posMap.get(tgt);
        if (!a || !b) return null;
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      })
      .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number }[];

    return { pts, lns };
  }, [nodes, links]);

  if (nodes.length === 0) return null;

  return (
    <div
      className="absolute bottom-3 left-3 z-20 rounded-xl overflow-hidden"
      style={{ backgroundColor: 'rgba(10,10,15,0.8)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Links */}
        {projected.lns.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        ))}
        {/* Nodes */}
        {projected.pts.map(p => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.id === selectedNodeId ? p.r + 1.5 : p.r}
            fill={p.color}
            opacity={p.id === selectedNodeId ? 1 : 0.6}
            stroke={p.id === selectedNodeId ? '#ffffff' : 'none'}
            strokeWidth={p.id === selectedNodeId ? 1 : 0}
          />
        ))}
      </svg>
      <div className="text-center text-[8px] pb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
        minimap
      </div>
    </div>
  );
}
