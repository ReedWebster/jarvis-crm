import React from 'react';
import { Search, Maximize2, Minimize2, RotateCcw, Box, Grid3x3 } from 'lucide-react';
import type { NexusNodeType, NexusFilters } from '../../types/nexus';
import { NODE_COLORS, NODE_LABELS } from './nexusColors';

interface Props {
  filters: NexusFilters;
  onFiltersChange: (f: NexusFilters) => void;
  is3D: boolean;
  onToggle3D: () => void;
  onCenter: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  nodeCount: number;
  linkCount: number;
}

const NODE_TYPES: NexusNodeType[] = ['contact', 'project', 'client', 'candidate', 'goal', 'financial', 'note'];

export function NexusToolbar({
  filters, onFiltersChange, is3D, onToggle3D, onCenter,
  fullscreen, onToggleFullscreen, nodeCount, linkCount,
}: Props) {
  const toggleType = (t: NexusNodeType) => {
    onFiltersChange({
      ...filters,
      visibleTypes: { ...filters.visibleTypes, [t]: !filters.visibleTypes[t] },
    });
  };

  return (
    <div
      className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md"
      style={{ backgroundColor: 'rgba(10,10,15,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Entity type toggles */}
      <div className="flex flex-wrap gap-1">
        {NODE_TYPES.map(t => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className="px-2 py-1 rounded-full text-[11px] font-medium transition-all"
            style={{
              backgroundColor: filters.visibleTypes[t] ? NODE_COLORS[t] + '22' : 'rgba(255,255,255,0.04)',
              color: filters.visibleTypes[t] ? NODE_COLORS[t] : 'rgba(255,255,255,0.3)',
              border: `1px solid ${filters.visibleTypes[t] ? NODE_COLORS[t] + '44' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {NODE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <Search size={13} />
        <input
          type="text"
          placeholder="Search..."
          value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          className="bg-transparent border-none outline-none text-xs w-28"
          style={{ color: 'rgba(255,255,255,0.8)' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle3D}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }}
          title={is3D ? 'Switch to 2D' : 'Switch to 3D'}
        >
          {is3D ? <Grid3x3 size={14} /> : <Box size={14} />}
        </button>
        <button
          onClick={onCenter}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }}
          title="Re-center"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Stats */}
      <div className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
        {nodeCount} nodes · {linkCount} edges
      </div>
    </div>
  );
}
