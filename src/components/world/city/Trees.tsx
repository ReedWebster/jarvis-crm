/**
 * Trees — procedural trees for parks and sidewalks.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { seededRandom } from '../types';

interface TreesProps {
  cx: number;
  cz: number;
  count: number;
  seed: string;
  spread?: number;
}

export function Trees({ cx, cz, count, seed, spread = 16 }: TreesProps) {
  const trees = useMemo(() => {
    const rng = seededRandom(seed);
    const items: { px: number; pz: number; trunkH: number; canopyR: number; canopyY: number; shade: number }[] = [];
    for (let i = 0; i < count; i++) {
      const px = cx + (rng() - 0.5) * spread;
      const pz = cz + (rng() - 0.5) * spread;
      const trunkH = 2 + rng() * 3;
      const canopyR = 1.5 + rng() * 2;
      items.push({
        px, pz, trunkH, canopyR,
        canopyY: trunkH + canopyR * 0.6,
        shade: rng(),
      });
    }
    return items;
  }, [cx, cz, count, seed, spread]);

  return (
    <group>
      {trees.map((t, i) => (
        <group key={i}>
          {/* Trunk */}
          <mesh position={[t.px, t.trunkH / 2, t.pz]} castShadow>
            <cylinderGeometry args={[0.12, 0.18, t.trunkH, 6]} />
            <meshStandardMaterial color={t.shade > 0.5 ? '#5C4830' : '#6A5438'} roughness={0.92} />
          </mesh>
          {/* Canopy */}
          <mesh position={[t.px, t.canopyY, t.pz]} castShadow>
            <sphereGeometry args={[t.canopyR, 8, 6]} />
            <meshStandardMaterial
              color={t.shade > 0.6 ? '#3A7830' : t.shade > 0.3 ? '#4A8840' : '#5A9848'}
              roughness={0.88}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
