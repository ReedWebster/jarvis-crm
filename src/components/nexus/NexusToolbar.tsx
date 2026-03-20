import React, { useState } from 'react';
import { Search, Maximize2, Minimize2, RotateCcw, Box, Grid3x3, Download, Camera, GitBranch, ChevronDown, Calendar } from 'lucide-react';
import type { NexusNodeType, NexusFilters, NexusLinkType } from '../../types/nexus';
import { ALL_LINK_TYPES, LINK_TYPE_LABELS } from '../../types/nexus';
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
  clusterCount: number;
  dateRange: { min: string; max: string };
  onExportScreenshot: () => void;
  onExportData: () => void;
  pathMode: boolean;
  onTogglePathMode: () => void;
}

const NODE_TYPES: NexusNodeType[] = ['contact', 'project', 'client', 'candidate', 'goal', 'financial', 'note'];

export function NexusToolbar({
  filters, onFiltersChange, is3D, onToggle3D, onCenter,
  fullscreen, onToggleFullscreen, nodeCount, linkCount, clusterCount,
  dateRange, onExportScreenshot, onExportData, pathMode, onTogglePathMode,
}: Props) {
  const [showEdgeFilters, setShowEdgeFilters] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const toggleType = (t: NexusNodeType) => {
    onFiltersChange({
      ...filters,
      visibleTypes: { ...filters.visibleTypes, [t]: !filters.visibleTypes[t] },
    });
  };

  const toggleLinkType = (t: NexusLinkType) => {
    onFiltersChange({
      ...filters,
      visibleLinkTypes: { ...filters.visibleLinkTypes, [t]: !filters.visibleLinkTypes[t] },
    });
  };

  const toggleAllLinks = (visible: boolean) => {
    const updated = Object.fromEntries(ALL_LINK_TYPES.map(t => [t, visible])) as Record<NexusLinkType, boolean>;
    onFiltersChange({ ...filters, visibleLinkTypes: updated });
  };

  const activeLinkCount = ALL_LINK_TYPES.filter(t => filters.visibleLinkTypes[t]).length;

  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2">
      {/* Main bar */}
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md"
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

        {/* Divider */}
        <div className="w-px h-5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

        {/* Edge filter dropdown toggle */}
        <button
          onClick={() => { setShowEdgeFilters(v => !v); setShowTimeline(false); setShowExportMenu(false); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: showEdgeFilters ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
            color: activeLinkCount < ALL_LINK_TYPES.length ? '#FFD700' : 'rgba(255,255,255,0.5)',
          }}
          title="Filter edge types"
        >
          Edges {activeLinkCount < ALL_LINK_TYPES.length ? `(${activeLinkCount})` : ''}
          <ChevronDown size={10} style={{ transform: showEdgeFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {/* Timeline toggle */}
        <button
          onClick={() => { setShowTimeline(v => !v); setShowEdgeFilters(false); setShowExportMenu(false); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: showTimeline ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
            color: (filters.timelineStart || filters.timelineEnd) ? '#00D4FF' : 'rgba(255,255,255,0.5)',
          }}
          title="Timeline filter"
        >
          <Calendar size={11} />
          Timeline
        </button>

        {/* Path mode */}
        <button
          onClick={onTogglePathMode}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: pathMode ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
            color: pathMode ? '#FFD700' : 'rgba(255,255,255,0.5)',
            border: pathMode ? '1px solid rgba(255,215,0,0.3)' : '1px solid transparent',
          }}
          title="Find path between nodes"
        >
          <GitBranch size={11} />
          Path
        </button>

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
          <button onClick={onToggle3D} className="p-1.5 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }} title={is3D ? 'Switch to 2D' : 'Switch to 3D'}>
            {is3D ? <Grid3x3 size={14} /> : <Box size={14} />}
          </button>
          <button onClick={onCenter} className="p-1.5 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }} title="Re-center">
            <RotateCcw size={14} />
          </button>
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowExportMenu(v => !v); setShowEdgeFilters(false); setShowTimeline(false); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }}
              title="Export"
            >
              <Download size={14} />
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg py-1 min-w-[140px]"
                style={{ backgroundColor: 'rgba(10,10,15,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <button
                  onClick={() => { onExportScreenshot(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  <Camera size={12} /> Screenshot (PNG)
                </button>
                <button
                  onClick={() => { onExportData(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  <Download size={12} /> Graph data (JSON)
                </button>
              </div>
            )}
          </div>
          <button onClick={onToggleFullscreen} className="p-1.5 rounded-lg transition-colors" style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)' }} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* Stats */}
        <div className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {nodeCount} nodes · {linkCount} edges · {clusterCount} clusters
        </div>
      </div>

      {/* Edge type filter dropdown */}
      {showEdgeFilters && (
        <div
          className="rounded-xl px-3 py-2.5 backdrop-blur-md animate-fade-in"
          style={{ backgroundColor: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Edge Types</span>
            <div className="flex gap-2">
              <button onClick={() => toggleAllLinks(true)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#00D4FF', backgroundColor: 'rgba(0,212,255,0.1)' }}>All</button>
              <button onClick={() => toggleAllLinks(false)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#FF3366', backgroundColor: 'rgba(255,51,102,0.1)' }}>None</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_LINK_TYPES.map(t => (
              <button
                key={t}
                onClick={() => toggleLinkType(t)}
                className="px-2 py-0.5 rounded-full text-[10px] transition-all"
                style={{
                  backgroundColor: filters.visibleLinkTypes[t] ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                  color: filters.visibleLinkTypes[t] ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                  border: `1px solid ${filters.visibleLinkTypes[t] ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                {LINK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timeline slider */}
      {showTimeline && (
        <div
          className="rounded-xl px-4 py-3 backdrop-blur-md animate-fade-in"
          style={{ backgroundColor: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Timeline Filter</span>
            {(filters.timelineStart || filters.timelineEnd) && (
              <button
                onClick={() => onFiltersChange({ ...filters, timelineStart: null, timelineEnd: null })}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: '#FF3366', backgroundColor: 'rgba(255,51,102,0.1)' }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>From</span>
              <input
                type="date"
                value={filters.timelineStart ?? ''}
                min={dateRange.min}
                max={filters.timelineEnd ?? dateRange.max}
                onChange={e => onFiltersChange({ ...filters, timelineStart: e.target.value || null })}
                className="bg-transparent rounded-lg px-2 py-1 text-[11px] outline-none"
                style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>To</span>
              <input
                type="date"
                value={filters.timelineEnd ?? ''}
                min={filters.timelineStart ?? dateRange.min}
                max={dateRange.max}
                onChange={e => onFiltersChange({ ...filters, timelineEnd: e.target.value || null })}
                className="bg-transparent rounded-lg px-2 py-1 text-[11px] outline-none"
                style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
          <div className="mt-1.5 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Data range: {dateRange.min} — {dateRange.max}
          </div>
        </div>
      )}
    </div>
  );
}
