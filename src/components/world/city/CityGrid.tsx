/**
 * CityGrid — generates the entire city: blocks, buildings, parks, roads, trees.
 * This is the main scene graph component that replaces the massive useEffect.
 */
import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { BlockInfo, WorldViewAppData, ZoneType } from '../types';
import { GRID_N, HALF, COL_CENTERS, ROW_CENTERS, GRID_EXTENT, STEP, seededRandom, HEALTH_COLORS, getJitteredBlockCenter } from '../types';
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
  rotationY: number;
  offsetX: number;
  offsetZ: number;
  // Multi-building blocks: optional second building
  secondary?: { archetype: ReturnType<typeof getArchetypeForZone>; offsetX: number; offsetZ: number; rotationY: number };
  isCourtyardBlock: boolean;
}

// ─── Street Furniture ────────────────────────────────────────────────────────

function StreetFurniture({ cx, cz, seed }: { cx: number; cz: number; seed: string }) {
  const items = useMemo(() => {
    const rng = seededRandom(seed);
    const count = Math.floor(rng() * 3); // 0-2 items
    const result: { type: 'bench' | 'planter'; px: number; pz: number; rot: number }[] = [];
    for (let i = 0; i < count; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      const axis = rng() > 0.5 ? 'x' : 'z';
      result.push({
        type: rng() > 0.5 ? 'bench' : 'planter',
        px: cx + (axis === 'x' ? side * (18 + rng() * 4) : (rng() - 0.5) * 20),
        pz: cz + (axis === 'z' ? side * (18 + rng() * 4) : (rng() - 0.5) * 20),
        rot: rng() * Math.PI * 2,
      });
    }
    return result;
  }, [cx, cz, seed]);

  return (
    <group>
      {items.map((item, i) => {
        if (item.type === 'bench') {
          return (
            <group key={i} position={[item.px, 0.2, item.pz]} rotation={[0, item.rot, 0]}>
              <mesh castShadow>
                <boxGeometry args={[2, 0.4, 0.6]} />
                <meshStandardMaterial color="#4A4A4A" roughness={0.9} />
              </mesh>
              {/* Legs */}
              {[-0.7, 0.7].map(lx => (
                <mesh key={lx} position={[lx, -0.2, 0]}>
                  <boxGeometry args={[0.1, 0.4, 0.5]} />
                  <meshStandardMaterial color="#3A3A3A" roughness={0.85} />
                </mesh>
              ))}
            </group>
          );
        }
        return (
          <group key={i} position={[item.px, 0.4, item.pz]}>
            <mesh castShadow>
              <boxGeometry args={[1, 0.8, 1]} />
              <meshStandardMaterial color="#A06840" roughness={0.92} />
            </mesh>
            <mesh position={[0, 0.7, 0]} castShadow>
              <sphereGeometry args={[0.5, 8, 6]} />
              <meshStandardMaterial color="#4A8840" roughness={0.88} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
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
        const zone = getZone(col, row);
        const { cx, cz } = getJitteredBlockCenter(col, row, zone);
        const label = getDistrictLabel(col, row);

        if (zone === 'water' || zone === 'park') {
          blocks.push({
            info: { col, row, cx, cz, zone, label },
            archetype: { archetype: 'residential', height: 0 },
            rotationY: 0, offsetX: 0, offsetZ: 0,
            isCourtyardBlock: false,
          });
          continue;
        }

        const district = getDistrict(col, row);
        const archetype = getArchetypeForZone(zone, rng);
        const palette = district.palette?.[0];

        // Building rotation: pick from cardinal + small perturbation
        const cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
        const baseRot = cardinals[Math.floor(rng() * 4)];
        const rotationY = baseRot + (rng() - 0.5) * 0.16;

        // Building offset within block
        const offsetX = (rng() - 0.5) * 8;
        const offsetZ = (rng() - 0.5) * 8;

        // Multi-building blocks: 30% chance for low/mixed zones
        let secondary: CityBlockData['secondary'];
        const isCourtyardBlock = (zone === 'mixed' || zone === 'low') && rng() < 0.15;

        if (!isCourtyardBlock && (zone === 'low' || zone === 'mixed') && rng() < 0.3) {
          const secArch = getArchetypeForZone(zone, rng);
          secondary = {
            archetype: { archetype: secArch.archetype, height: secArch.height * 0.6 },
            offsetX: (rng() > 0.5 ? 1 : -1) * (6 + rng() * 4),
            offsetZ: (rng() > 0.5 ? 1 : -1) * (4 + rng() * 4),
            rotationY: cardinals[Math.floor(rng() * 4)] + (rng() - 0.5) * 0.16,
          };
        }

        blocks.push({
          info: { col, row, cx, cz, zone, label },
          archetype: isCourtyardBlock ? { archetype: archetype.archetype, height: archetype.height * 0.5 } : archetype,
          palette,
          rotationY,
          offsetX: isCourtyardBlock ? 0 : offsetX,
          offsetZ: isCourtyardBlock ? 0 : offsetZ,
          secondary,
          isCourtyardBlock,
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
        const { info, archetype, palette, rotationY, offsetX, offsetZ, secondary, isCourtyardBlock } = block;

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
              <Trees cx={info.cx} cz={info.cz} count={12} seed={`park-${info.col}-${info.row}`} />
            </group>
          );
        }

        const healthGlow = getBlockHealth(info.label);

        return (
          <group key={`${info.col},${info.row}`}>
            {/* Courtyard ground */}
            {isCourtyardBlock && (
              <mesh position={[info.cx, 0.03, info.cz]} rotation-x={-Math.PI / 2} receiveShadow>
                <planeGeometry args={[36, 36]} />
                <meshStandardMaterial color="#D8D0C0" roughness={0.95} />
              </mesh>
            )}

            {/* Primary building */}
            <Building
              archetype={archetype.archetype}
              height={archetype.height}
              position={[info.cx + offsetX, 0, info.cz + offsetZ]}
              rotation={[0, rotationY, 0]}
              palette={palette}
              healthGlow={healthGlow}
            />

            {/* Secondary building (multi-building blocks) */}
            {secondary && (
              <Building
                archetype={secondary.archetype.archetype}
                height={secondary.archetype.height}
                position={[info.cx + secondary.offsetX, 0, info.cz + secondary.offsetZ]}
                rotation={[0, secondary.rotationY, 0]}
              />
            )}

            {/* Courtyard trees */}
            {isCourtyardBlock && (
              <Trees cx={info.cx} cz={info.cz} count={6} seed={`court-${info.col}-${info.row}`} spread={14} />
            )}

            {/* Sidewalk trees */}
            {info.zone !== 'downtown' && !isCourtyardBlock && (
              <Trees cx={info.cx} cz={info.cz} count={4} seed={`st-${info.col}-${info.row}`} spread={18} />
            )}
            {/* Downtown gets 1 tree */}
            {info.zone === 'downtown' && (
              <Trees cx={info.cx} cz={info.cz} count={1} seed={`dt-${info.col}-${info.row}`} spread={20} />
            )}

            {/* Street furniture */}
            <StreetFurniture cx={info.cx} cz={info.cz} seed={`furn-${info.col}-${info.row}`} />
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
      const zone = getZone(col, row);
      const { cx, cz } = getJitteredBlockCenter(col, row, zone);
      const label = getDistrictLabel(col, row);
      blocks.push({ col, row, cx, cz, zone, label });
    }
  }
  return blocks;
}
