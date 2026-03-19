/**
 * CityGrid — generates the entire city: blocks, buildings, parks, roads, trees.
 * This is the main scene graph component that replaces the massive useEffect.
 */
import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { BlockInfo, WorldViewAppData, ZoneType } from '../types';
import { GRID_N, HALF, COL_CENTERS, ROW_CENTERS, GRID_EXTENT, STEP, seededRandom, HEALTH_COLORS } from '../types';
import { getZone, getDistrict, getDistrictLabel, BLOCK_DISTRICT, DISTRICTS } from './districts';
import { Building, getArchetypeForZone } from '../buildings/BuildingFactory';
import { Roads } from './Roads';
import { Creek } from './Creek';
import { Trees } from './Trees';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CityBlockData {
  info: BlockInfo;
  archetype: ReturnType<typeof getArchetypeForZone>;
  palette?: { main: string; alt: string; trim: string };
}

// ─── City Grid Component ─────────────────────────────────────────────────────

interface CityGridProps {
  appData?: WorldViewAppData;
  onBlockHover?: (block: BlockInfo | null) => void;
  onBlockClick?: (block: BlockInfo) => void;
  selectedBlock?: BlockInfo | null;
}

export function CityGrid({ appData, onBlockHover, onBlockClick, selectedBlock }: CityGridProps) {
  // Generate all blocks deterministically
  const cityBlocks = useMemo(() => {
    const blocks: CityBlockData[] = [];
    const rng = seededRandom('litehouse-city-v2');

    for (let row = -HALF; row <= HALF; row++) {
      for (let col = -HALF; col <= HALF; col++) {
        const cx = COL_CENTERS[col + HALF];
        const cz = ROW_CENTERS[row + HALF];
        const zone = getZone(col, row);
        const label = getDistrictLabel(col, row);

        if (zone === 'water' || zone === 'park') {
          blocks.push({
            info: { col, row, cx, cz, zone, label },
            archetype: { archetype: 'residential', height: 0 },
          });
          continue;
        }

        const district = getDistrict(col, row);
        const archetype = getArchetypeForZone(zone, rng);
        const palette = district.palette?.[0];

        blocks.push({
          info: { col, row, cx, cz, zone, label },
          archetype,
          palette,
        });
      }
    }

    return blocks;
  }, []);

  // Build project-to-building health mapping
  const healthMap = useMemo(() => {
    if (!appData) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const project of appData.projects.filter(p => p.status === 'active')) {
      // Map project name to health color for building glow
      map.set(project.name.toLowerCase(), HEALTH_COLORS[project.health] || '#64748b');
    }
    return map;
  }, [appData]);

  // Find linked project health for a block label
  const getBlockHealth = useCallback((label: string): string | null => {
    const lower = label.toLowerCase();
    for (const [name, color] of healthMap) {
      if (lower.includes(name) || name.includes(lower)) return color;
    }
    return null;
  }, [healthMap]);

  return (
    <group>
      {/* Roads */}
      <Roads />

      {/* Creek */}
      <Creek />

      {/* City blocks with buildings */}
      {cityBlocks.map((block) => {
        const { info, archetype, palette } = block;

        if (info.zone === 'water') {
          return (
            <mesh key={`${info.col},${info.row}`} position={[info.cx, -0.08, info.cz]} rotation-x={-Math.PI / 2} receiveShadow>
              <planeGeometry args={[44, 44]} />
              <meshStandardMaterial color="#4A7C9C" roughness={0.15} metalness={0.2} transparent opacity={0.88} />
            </mesh>
          );
        }

        if (info.zone === 'park') {
          return (
            <group key={`${info.col},${info.row}`}>
              <mesh position={[info.cx, 0.02, info.cz]} rotation-x={-Math.PI / 2} receiveShadow>
                <planeGeometry args={[44, 44]} />
                <meshStandardMaterial color="#C8D8C0" roughness={0.95} />
              </mesh>
              <Trees cx={info.cx} cz={info.cz} count={8} seed={`park-${info.col}-${info.row}`} />
            </group>
          );
        }

        const healthGlow = getBlockHealth(info.label);

        return (
          <group key={`${info.col},${info.row}`}>
            <Building
              archetype={archetype.archetype}
              height={archetype.height}
              position={[info.cx, 0, info.cz]}
              palette={palette}
              healthGlow={healthGlow}
            />
            {/* Sidewalk trees for non-downtown blocks */}
            {info.zone !== 'downtown' && (
              <Trees cx={info.cx} cz={info.cz} count={2} seed={`st-${info.col}-${info.row}`} spread={18} />
            )}
          </group>
        );
      })}
    </group>
  );
}

// ─── Export block data for other components ───────────────────────────────────

export function generateBlockInfos(): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  for (let row = -HALF; row <= HALF; row++) {
    for (let col = -HALF; col <= HALF; col++) {
      const cx = COL_CENTERS[col + HALF];
      const cz = ROW_CENTERS[row + HALF];
      const zone = getZone(col, row);
      const label = getDistrictLabel(col, row);
      blocks.push({ col, row, cx, cz, zone, label });
    }
  }
  return blocks;
}
