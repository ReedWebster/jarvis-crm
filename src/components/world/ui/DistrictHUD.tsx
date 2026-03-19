/**
 * DistrictHUD — shows current district name, search, and legend.
 */
import { useState, useCallback, useMemo } from 'react';
import type { BlockInfo } from '../types';

interface DistrictHUDProps {
  districtLabel: string | null;
  blocks: BlockInfo[];
  onTeleport: (x: number, z: number) => void;
}

export function DistrictHUD({ districtLabel, blocks, onTeleport }: DistrictHUDProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const seen = new Set<string>();
    return blocks.filter(b => {
      if (b.zone === 'water') return false;
      if (seen.has(b.label)) return false;
      seen.add(b.label);
      return b.label.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [searchQuery, blocks]);

  const handleSelect = useCallback((block: BlockInfo) => {
    onTeleport(block.cx, block.cz);
    setSearchOpen(false);
    setSearchQuery('');
  }, [onTeleport]);

  return (
    <>
      {/* District label pill */}
      {districtLabel && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: 'rgba(10,15,30,0.80)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20, padding: '6px 18px', color: '#c0d0e8', fontSize: 12,
          fontWeight: 600, letterSpacing: '0.04em', backdropFilter: 'blur(8px)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          animation: 'slideUp 0.35s ease-out',
        }}>
          {districtLabel}
        </div>
      )}

      {/* Search button */}
      <button
        onClick={() => setSearchOpen(o => !o)}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 25,
          background: searchOpen ? 'rgba(60,120,220,0.22)' : 'rgba(8,12,24,0.82)',
          border: `1px solid ${searchOpen ? 'rgba(100,160,240,0.35)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8, padding: '7px 11px', cursor: 'pointer',
          color: searchOpen ? '#7EB8F8' : '#8899B4', fontSize: 11, fontWeight: 600,
          backdropFilter: 'blur(10px)', letterSpacing: '0.04em',
        }}
      >
        {searchOpen ? '✕' : '⌕ Search'}
      </button>

      {/* Search dropdown */}
      {searchOpen && (
        <div style={{
          position: 'absolute', top: 52, right: 16, zIndex: 25, width: 240,
          background: 'rgba(8,12,24,0.94)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10, padding: 10, backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search districts..."
            autoFocus
            onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '6px 10px', color: '#e2e8f0', fontSize: 12,
              outline: 'none',
            }}
          />
          {filteredBlocks.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
              {filteredBlocks.map((b, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(b)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', padding: '5px 8px',
                    color: '#c0d0e8', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(60,120,220,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {b.label}
                  <span style={{ fontSize: 9, color: '#475569', marginLeft: 6 }}>{b.zone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
