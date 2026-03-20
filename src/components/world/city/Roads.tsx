/**
 * Roads — segment-based road network that follows jittered block positions.
 * Roads curve between blocks instead of running in perfectly straight lines.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID_N, HALF, COL_CENTERS, ROW_CENTERS, GRID_EXTENT, getJitteredBlockCenter, seededRandom } from '../types';
import { getZone } from './districts';

// ─── Road texture ────────────────────────────────────────────────────────────

function makeRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1E1E20'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const b = 20 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${b},${b},${b + Math.floor(Math.random() * 5)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 1.5, 1 + Math.random());
  }
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoadSegment {
  mx: number; mz: number; // midpoint
  len: number;
  angle: number; // rotation around Y
  width: number;
}

interface DashData { x: number; z: number; angle: number }
interface LampData { x: number; z: number; angle: number }

// ─── Component ───────────────────────────────────────────────────────────────

export function Roads() {
  const roadData = useMemo(() => {
    const segments: RoadSegment[] = [];
    const intersections: { x: number; z: number; size: number }[] = [];
    const dashes: DashData[] = [];
    const lamps: LampData[] = [];
    const rng = seededRandom('roads-v2');

    // Build a lookup of jittered block centers
    const blockAt = (col: number, row: number) => {
      if (col < -HALF || col > HALF || row < -HALF || row > HALF) return null;
      const zone = getZone(col, row);
      return getJitteredBlockCenter(col, row, zone);
    };

    // --- Vertical roads (between adjacent column pairs) ---
    for (let ci = 0; ci < GRID_N - 1; ci++) {
      const colL = ci - HALF;
      const colR = colL + 1;
      const baseGap = COL_CENTERS[ci + 1] - COL_CENTERS[ci];
      const roadW = baseGap > 60 ? 5.5 + rng() * 1 : 3.5 + rng() * 1;

      // Control points: one per row
      const points: { x: number; z: number }[] = [];

      // Add a point above the grid
      const topL = blockAt(colL, -HALF);
      const topR = blockAt(colR, -HALF);
      if (topL && topR) {
        points.push({ x: (topL.cx + topR.cx) / 2, z: Math.min(topL.cz, topR.cz) - 30 });
      }

      for (let ri = -HALF; ri <= HALF; ri++) {
        const bL = blockAt(colL, ri);
        const bR = blockAt(colR, ri);
        if (bL && bR) {
          points.push({ x: (bL.cx + bR.cx) / 2, z: (bL.cz + bR.cz) / 2 });
        }
      }

      // Add a point below the grid
      const botL = blockAt(colL, HALF);
      const botR = blockAt(colR, HALF);
      if (botL && botR) {
        points.push({ x: (botL.cx + botR.cx) / 2, z: Math.max(botL.cz, botR.cz) + 30 });
      }

      // Create segments between consecutive points
      for (let pi = 0; pi < points.length - 1; pi++) {
        const p0 = points[pi], p1 = points[pi + 1];
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);
        segments.push({ mx: (p0.x + p1.x) / 2, mz: (p0.z + p1.z) / 2, len, angle, width: roadW });

        // Lane dashes along this segment
        const dashSpacing = 6;
        const numDashes = Math.floor(len / dashSpacing);
        for (let di = 1; di < numDashes; di++) {
          const t = di / numDashes;
          dashes.push({
            x: p0.x + dx * t,
            z: p0.z + dz * t,
            angle,
          });
        }
      }

      // Lamp posts along the road (skip outermost columns)
      if (ci > 1 && ci < GRID_N - 3) {
        for (let pi = 1; pi < points.length - 1; pi++) {
          const p = points[pi];
          const prevAngle = pi > 0 ? Math.atan2(points[pi].x - points[pi - 1].x, points[pi].z - points[pi - 1].z) : 0;
          const perpX = Math.cos(prevAngle);
          const perpZ = -Math.sin(prevAngle);
          lamps.push({ x: p.x + perpX * (roadW / 2 + 1.5), z: p.z + perpZ * (roadW / 2 + 1.5), angle: prevAngle });
          lamps.push({ x: p.x - perpX * (roadW / 2 + 1.5), z: p.z - perpZ * (roadW / 2 + 1.5), angle: prevAngle });
        }
      }
    }

    // --- Horizontal roads (between adjacent row pairs) ---
    for (let ri = 0; ri < GRID_N - 1; ri++) {
      const rowT = ri - HALF;
      const rowB = rowT + 1;
      const baseGap = ROW_CENTERS[ri + 1] - ROW_CENTERS[ri];
      const roadW = baseGap > 60 ? 5.5 + rng() * 1 : 3.5 + rng() * 1;

      const points: { x: number; z: number }[] = [];

      // Left extension
      const leftT = blockAt(-HALF, rowT);
      const leftB = blockAt(-HALF, rowB);
      if (leftT && leftB) {
        points.push({ x: Math.min(leftT.cx, leftB.cx) - 30, z: (leftT.cz + leftB.cz) / 2 });
      }

      for (let ci = -HALF; ci <= HALF; ci++) {
        const bT = blockAt(ci, rowT);
        const bB = blockAt(ci, rowB);
        if (bT && bB) {
          points.push({ x: (bT.cx + bB.cx) / 2, z: (bT.cz + bB.cz) / 2 });
        }
      }

      // Right extension
      const rightT = blockAt(HALF, rowT);
      const rightB = blockAt(HALF, rowB);
      if (rightT && rightB) {
        points.push({ x: Math.max(rightT.cx, rightB.cx) + 30, z: (rightT.cz + rightB.cz) / 2 });
      }

      for (let pi = 0; pi < points.length - 1; pi++) {
        const p0 = points[pi], p1 = points[pi + 1];
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);
        segments.push({ mx: (p0.x + p1.x) / 2, mz: (p0.z + p1.z) / 2, len, angle, width: roadW });

        const dashSpacing = 6;
        const numDashes = Math.floor(len / dashSpacing);
        for (let di = 1; di < numDashes; di++) {
          const t = di / numDashes;
          dashes.push({
            x: p0.x + dx * t,
            z: p0.z + dz * t,
            angle,
          });
        }
      }
    }

    // Perimeter roads (simple straight lines at grid edges)
    const perimW = 4;
    // Top & bottom
    segments.push({ mx: 0, mz: -(GRID_EXTENT - 2), len: GRID_EXTENT * 2, angle: 0, width: perimW });
    segments.push({ mx: 0, mz: GRID_EXTENT - 2, len: GRID_EXTENT * 2, angle: 0, width: perimW });
    // Left & right
    segments.push({ mx: -(GRID_EXTENT - 2), mz: 0, len: GRID_EXTENT * 2, angle: Math.PI / 2, width: perimW });
    segments.push({ mx: GRID_EXTENT - 2, mz: 0, len: GRID_EXTENT * 2, angle: Math.PI / 2, width: perimW });

    return { segments, dashes, lamps };
  }, []);

  const roadTex = useMemo(() => makeRoadTexture(), []);

  return (
    <group>
      {/* Road segments */}
      {roadData.segments.map((seg, i) => (
        <mesh
          key={`rs-${i}`}
          position={[seg.mx, 0.04, seg.mz]}
          rotation={[-Math.PI / 2, 0, -seg.angle]}
          receiveShadow
        >
          <planeGeometry args={[seg.width, seg.len]} />
          <meshStandardMaterial map={roadTex} color="#1C1C1E" roughness={0.97} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}

      {/* Lane dashes */}
      {roadData.dashes.map((d, i) => (
        <mesh key={`d-${i}`} position={[d.x, 0.07, d.z]} rotation={[-Math.PI / 2, 0, -d.angle]}>
          <planeGeometry args={[0.18, 2.2]} />
          <meshStandardMaterial color="#F5E642" roughness={0.60} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
        </mesh>
      ))}

      {/* Lamp posts */}
      {roadData.lamps.map((lamp, i) => (
        <group key={`lamp-${i}`}>
          <mesh position={[lamp.x, 1.75, lamp.z]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3.5, 6]} />
            <meshStandardMaterial color="#505860" roughness={0.8} />
          </mesh>
          <mesh position={[lamp.x, 3.625, lamp.z]}>
            <boxGeometry args={[0.6, 0.25, 0.25]} />
            <meshStandardMaterial color="#FFF8E0" emissive="#FFF8E0" emissiveIntensity={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
