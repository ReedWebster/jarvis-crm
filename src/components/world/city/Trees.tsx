/**
 * Trees — procedural trees with shape variety for parks and sidewalks.
 * Shapes: sphere (deciduous), cone (evergreen), double-sphere (broad deciduous).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { seededRandom } from '../types';

type TreeShape = 'sphere' | 'cone' | 'double';

interface TreeItem {
  px: number;
  pz: number;
  trunkH: number;
  trunkR: number;
  canopyR: number;
  canopyY: number;
  shade: number;
  shape: TreeShape;
  autumn: boolean;
}

interface TreesProps {
  cx: number;
  cz: number;
  count: number;
  seed: string;
  spread?: number;
  /** Enable autumn colors for some trees */
  autumn?: boolean;
}

const GREEN_COLORS = ['#3A7830', '#4A8840', '#5A9848', '#3B8838', '#4E9240'];
const AUTUMN_COLORS = ['#B8882C', '#C06830', '#8B6830', '#D4A030', '#A85828'];

export function Trees({ cx, cz, count, seed, spread = 16, autumn = false }: TreesProps) {
  const trees = useMemo(() => {
    const rng = seededRandom(seed);
    const items: TreeItem[] = [];
    for (let i = 0; i < count; i++) {
      const px = cx + (rng() - 0.5) * spread;
      const pz = cz + (rng() - 0.5) * spread;
      const trunkH = 2 + rng() * 3;
      const canopyR = 1.5 + rng() * 2;

      // Shape selection: 50% sphere, 30% cone, 20% double
      const shapeRoll = rng();
      const shape: TreeShape = shapeRoll < 0.5 ? 'sphere' : shapeRoll < 0.8 ? 'cone' : 'double';

      items.push({
        px, pz, trunkH, canopyR,
        trunkR: 0.12 + rng() * 0.08,
        canopyY: trunkH + canopyR * 0.6,
        shade: rng(),
        shape,
        autumn: autumn && rng() < 0.15,
      });
    }
    return items;
  }, [cx, cz, count, seed, spread, autumn]);

  return (
    <group>
      {trees.map((t, i) => {
        const trunkColor = t.shade > 0.5 ? '#5C4830' : '#6A5438';
        const colors = t.autumn ? AUTUMN_COLORS : GREEN_COLORS;
        const canopyColor = colors[Math.floor(t.shade * colors.length) % colors.length];

        return (
          <group key={i}>
            {/* Trunk */}
            <mesh position={[t.px, t.trunkH / 2, t.pz]} castShadow>
              <cylinderGeometry args={[t.trunkR * 0.7, t.trunkR, t.trunkH, 6]} />
              <meshStandardMaterial color={trunkColor} roughness={0.92} />
            </mesh>

            {/* Canopy */}
            {t.shape === 'sphere' && (
              <mesh position={[t.px, t.canopyY, t.pz]} castShadow>
                <sphereGeometry args={[t.canopyR, 8, 6]} />
                <meshStandardMaterial color={canopyColor} roughness={0.88} />
              </mesh>
            )}

            {t.shape === 'cone' && (
              <mesh position={[t.px, t.canopyY - t.canopyR * 0.2, t.pz]} castShadow>
                <coneGeometry args={[t.canopyR * 0.8, t.canopyR * 2.5, 8]} />
                <meshStandardMaterial color={canopyColor} roughness={0.88} />
              </mesh>
            )}

            {t.shape === 'double' && (
              <>
                <mesh position={[t.px, t.canopyY - t.canopyR * 0.3, t.pz]} castShadow>
                  <sphereGeometry args={[t.canopyR * 0.9, 8, 6]} />
                  <meshStandardMaterial color={canopyColor} roughness={0.88} />
                </mesh>
                <mesh position={[t.px + t.canopyR * 0.4, t.canopyY + t.canopyR * 0.3, t.pz - t.canopyR * 0.2]} castShadow>
                  <sphereGeometry args={[t.canopyR * 0.7, 8, 6]} />
                  <meshStandardMaterial color={canopyColor} roughness={0.88} />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
