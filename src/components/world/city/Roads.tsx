/**
 * Roads — grid road network with sidewalks, curbs, lane markings, lamp posts.
 * Also includes diagonal Broadway avenue and crosswalks.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID_N, COL_CENTERS, ROW_CENTERS, GRID_EXTENT } from '../types';

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

// ─── Component ───────────────────────────────────────────────────────────────

export function Roads() {
  const roadData = useMemo(() => {
    // Compute road positions from midpoints
    const roadXs: { pos: number; w: number }[] = [];
    for (let i = 0; i < GRID_N - 1; i++) {
      const gap = COL_CENTERS[i + 1] - COL_CENTERS[i];
      roadXs.push({ pos: (COL_CENTERS[i] + COL_CENTERS[i + 1]) / 2, w: gap > 60 ? 6 : 4 });
    }
    roadXs.unshift({ pos: COL_CENTERS[0] - 27, w: 4 });
    roadXs.push({ pos: COL_CENTERS[GRID_N - 1] + 27, w: 4 });

    const roadZs: { pos: number; w: number }[] = [];
    for (let i = 0; i < GRID_N - 1; i++) {
      const gap = ROW_CENTERS[i + 1] - ROW_CENTERS[i];
      roadZs.push({ pos: (ROW_CENTERS[i] + ROW_CENTERS[i + 1]) / 2, w: gap > 60 ? 6 : 4 });
    }
    roadZs.unshift({ pos: ROW_CENTERS[0] - 27, w: 4 });
    roadZs.push({ pos: ROW_CENTERS[GRID_N - 1] + 27, w: 4 });

    // Generate dash positions (center lane markings)
    const roadXposArr = roadXs.map(r => r.pos);
    const roadZposArr = roadZs.map(r => r.pos);

    const vDashes: { x: number; z: number }[] = [];
    for (const { pos: xPos } of roadXs) {
      for (let dz = -GRID_EXTENT + 3; dz < GRID_EXTENT; dz += 6) {
        if (roadZposArr.some(rz => Math.abs(dz - rz) < 4)) continue;
        vDashes.push({ x: xPos, z: dz });
      }
    }

    const hDashes: { x: number; z: number }[] = [];
    for (const { pos: zPos } of roadZs) {
      for (let dx = -GRID_EXTENT + 3; dx < GRID_EXTENT; dx += 6) {
        if (roadXposArr.some(rx => Math.abs(dx - rx) < 4)) continue;
        hDashes.push({ x: dx, z: zPos });
      }
    }

    // Lamp posts
    const lamps: { x: number; z: number }[] = [];
    for (const { pos: xPos, w: rw } of roadXs) {
      if (Math.abs(xPos) > 200) continue;
      for (let s = 0; s < roadZs.length - 1; s++) {
        const zStart = roadZs[s].pos + roadZs[s].w / 2 + 0.15;
        const zEnd = roadZs[s + 1].pos - roadZs[s + 1].w / 2 - 0.15;
        for (let lz = zStart + 4; lz <= zEnd - 4; lz += 12) {
          lamps.push({ x: xPos + (rw / 2 + 1.5), z: lz });
          lamps.push({ x: xPos - (rw / 2 + 1.5), z: lz });
        }
      }
    }

    return { roadXs, roadZs, vDashes, hDashes, lamps };
  }, []);

  const roadTex = useMemo(() => makeRoadTexture(), []);

  return (
    <group>
      {/* Vertical roads */}
      {roadData.roadXs.map((r, i) => (
        <mesh key={`vr-${i}`} position={[r.pos, 0.04, 0]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[r.w, GRID_EXTENT * 2]} />
          <meshStandardMaterial map={roadTex} color="#1C1C1E" roughness={0.97} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}

      {/* Horizontal roads */}
      {roadData.roadZs.map((r, i) => (
        <mesh key={`hr-${i}`} position={[0, 0.04, r.pos]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[GRID_EXTENT * 2, r.w]} />
          <meshStandardMaterial map={roadTex} color="#1C1C1E" roughness={0.97} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}

      {/* Intersection fills */}
      {roadData.roadXs.flatMap((rx, i) =>
        roadData.roadZs.map((rz, j) => {
          const iw = Math.max(rx.w, rz.w) + 0.5;
          return (
            <mesh key={`int-${i}-${j}`} position={[rx.pos, 0.045, rz.pos]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[iw, iw]} />
              <meshStandardMaterial map={roadTex} color="#1C1C1E" roughness={0.97} />
            </mesh>
          );
        })
      )}

      {/* Vertical lane dashes */}
      {roadData.vDashes.map((d, i) => (
        <mesh key={`vd-${i}`} position={[d.x, 0.07, d.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.18, 2.2]} />
          <meshStandardMaterial color="#F5E642" roughness={0.60} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
        </mesh>
      ))}

      {/* Horizontal lane dashes */}
      {roadData.hDashes.map((d, i) => (
        <mesh key={`hd-${i}`} position={[d.x, 0.07, d.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.2, 0.18]} />
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
