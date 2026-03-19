/**
 * Creek — winding waterway cutting through the city.
 */
import { useMemo } from 'react';
import { STEP } from '../types';

const WAYPOINTS: [number, number][] = [
  [-3.6 * STEP, -2.2 * STEP],
  [-2.4 * STEP, -0.8 * STEP],
  [-1.0 * STEP, 0.6 * STEP],
  [0.6 * STEP, 1.4 * STEP],
  [1.8 * STEP, 2.8 * STEP],
];

const CREEK_W = 5.5;
const BANK_W = 2.2;

export function Creek() {
  const segments = useMemo(() => {
    const segs: { mx: number; mz: number; len: number; angle: number }[] = [];
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const [x0, z0] = WAYPOINTS[i];
      const [x1, z1] = WAYPOINTS[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      segs.push({
        mx: (x0 + x1) / 2,
        mz: (z0 + z1) / 2,
        len: Math.sqrt(dx * dx + dz * dz),
        angle: Math.atan2(dx, dz),
      });
    }
    return segs;
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
            <planeGeometry args={[CREEK_W, seg.len]} />
            <meshStandardMaterial color="#4A7C9C" roughness={0.15} metalness={0.2} transparent opacity={0.88} />
          </mesh>
          {/* Banks */}
          {[-1, 1].map(side => (
            <mesh
              key={side}
              position={[
                seg.mx + side * Math.cos(seg.angle) * (CREEK_W / 2 + BANK_W / 2),
                0.003,
                seg.mz + side * Math.sin(seg.angle) * (CREEK_W / 2 + BANK_W / 2),
              ]}
              rotation={[-Math.PI / 2, 0, -seg.angle]}
              receiveShadow
            >
              <planeGeometry args={[BANK_W, seg.len]} />
              <meshStandardMaterial color="#3A7030" roughness={0.92} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
