/**
 * Creek — winding waterway cutting through the city.
 * Uses Catmull-Rom curve interpolation for smooth organic meandering.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { STEP } from '../types';
import { Trees } from './Trees';

// More waypoints with lateral offsets for natural meandering
const WAYPOINTS: [number, number][] = [
  [-4.2 * STEP, -3.0 * STEP],
  [-3.6 * STEP, -2.2 * STEP],
  [-3.0 * STEP, -1.5 * STEP],
  [-2.2 * STEP, -0.7 * STEP],
  [-1.5 * STEP, 0.1 * STEP],
  [-0.6 * STEP, 0.7 * STEP],
  [0.2 * STEP,  1.2 * STEP],
  [0.8 * STEP,  1.6 * STEP],
  [1.5 * STEP,  2.3 * STEP],
  [2.2 * STEP,  3.2 * STEP],
];

const BASE_CREEK_W = 4.5;
const BANK_W = 2.5;
const SAMPLE_COUNT = 60;

export function Creek() {
  const { segments, bankTrees } = useMemo(() => {
    // Build Catmull-Rom curve
    const curvePoints = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.5);
    const points = curve.getSpacedPoints(SAMPLE_COUNT);

    // Generate segments between consecutive sample points
    const segs: {
      mx: number; mz: number; len: number; angle: number;
      creekW: number; bankW: number;
    }[] = [];

    const treeClusters: { cx: number; cz: number; seed: string }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      // Taper: narrower upstream (start), wider downstream (end)
      const t = i / (points.length - 1);
      const creekW = BASE_CREEK_W * (0.7 + 0.6 * t);
      const bankW = BANK_W * (0.8 + 0.4 * t);

      segs.push({
        mx: (p0.x + p1.x) / 2,
        mz: (p0.z + p1.z) / 2,
        len: len + 0.5, // slight overlap to avoid gaps
        angle,
        creekW,
        bankW,
      });

      // Add tree clusters along banks every 3rd segment
      if (i % 3 === 0) {
        const perpX = Math.cos(angle);
        const perpZ = -Math.sin(angle);
        const offset = creekW / 2 + bankW + 2;
        const side = i % 6 === 0 ? 1 : -1;
        treeClusters.push({
          cx: segs[segs.length - 1].mx + perpX * offset * side,
          cz: segs[segs.length - 1].mz + perpZ * offset * side,
          seed: `creek-tree-${i}`,
        });
      }
    }

    return { segments: segs, bankTrees: treeClusters };
  }, []);

  return (
    <group>
      {segments.map((seg, i) => (
        <group key={i}>
          {/* Water */}
          <mesh
            position={[seg.mx, -0.06, seg.mz]}
            rotation={[-Math.PI / 2, 0, -seg.angle]}
            receiveShadow
          >
            <planeGeometry args={[seg.creekW, seg.len]} />
            <meshStandardMaterial color="#4A7C9C" roughness={0.15} metalness={0.2} transparent opacity={0.88} />
          </mesh>
          {/* Banks */}
          {[-1, 1].map(side => (
            <mesh
              key={side}
              position={[
                seg.mx + side * Math.cos(seg.angle) * (seg.creekW / 2 + seg.bankW / 2),
                0.003,
                seg.mz + side * Math.sin(seg.angle) * (seg.creekW / 2 + seg.bankW / 2),
              ]}
              rotation={[-Math.PI / 2, 0, -seg.angle]}
              receiveShadow
            >
              <planeGeometry args={[seg.bankW, seg.len]} />
              <meshStandardMaterial color="#3A7030" roughness={0.92} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Bank vegetation */}
      {bankTrees.map((cluster, i) => (
        <Trees key={i} cx={cluster.cx} cz={cluster.cz} count={2} seed={cluster.seed} spread={5} />
      ))}
    </group>
  );
}
