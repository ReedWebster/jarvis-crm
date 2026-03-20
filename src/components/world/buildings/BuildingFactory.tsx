/**
 * BuildingFactory — procedural building generation for R3F.
 * Each archetype is a declarative component returning a <group>.
 * Uses instanced geometry where possible for performance.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ZoneType, BuildingArchetype } from '../types';
import { seededRandom } from '../types';

// ─── Shared Materials ────────────────────────────────────────────────────────

const MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();

function getMat(key: string, props: ConstructorParameters<typeof THREE.MeshStandardMaterial>[0]): THREE.MeshStandardMaterial {
  if (!MAT_CACHE.has(key)) MAT_CACHE.set(key, new THREE.MeshStandardMaterial(props));
  return MAT_CACHE.get(key)!.clone();
}

// ─── Window Row (imperative helper) ──────────────────────────────────────────

function createWindowMeshes(
  parent: THREE.Group,
  y: number, bw: number, count: number,
  ox: number, faceZ: number,
  glassMat: THREE.MeshStandardMaterial,
) {
  const spacing = (bw - 1) / Math.max(count, 1);
  const ww = spacing * 0.55, wh = 1.2;
  for (let i = 0; i < count; i++) {
    const wx = ox - bw / 2 + 0.5 + i * spacing + spacing / 2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
    win.position.set(wx, y + wh / 2, faceZ + 0.02);
    parent.add(win);
  }
}

// ─── Building Texture Generator ──────────────────────────────────────────────

function makeBuildingTexture(type: 'curtain' | 'strip' | 'residential' | 'warehouse' | 'campus'): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  if (type === 'curtain') {
    ctx.fillStyle = '#0A1420'; ctx.fillRect(0, 0, W, H);
    const panelW = 64, panelH = 80;
    const cols = Math.floor(W / panelW), rows = Math.floor(H / panelH);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * panelW, py = row * panelH;
        ctx.fillStyle = '#1C2830'; ctx.fillRect(px, py, panelW, panelH);
        const lit = Math.random();
        if (lit < 0.3) {
          const warmth = Math.floor(180 + Math.random() * 60);
          ctx.fillStyle = `rgba(${warmth},${warmth - 40},${warmth - 100},${0.08 + Math.random() * 0.15})`;
        } else {
          const b = 12 + Math.floor(Math.random() * 25);
          ctx.fillStyle = `rgb(${b},${b + 8},${b + 20})`;
        }
        ctx.fillRect(px + 3, py + 3, panelW - 6, panelH - 6);
      }
    }
    ctx.fillStyle = '#2A3848';
    for (let y = 0; y <= H; y += panelH) ctx.fillRect(0, y - 1, W, 3);
    for (let x = 0; x <= W; x += panelW) ctx.fillRect(x - 1, 0, 3, H);
  } else if (type === 'strip') {
    ctx.fillStyle = '#BEB4A4'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 1 + Math.random());
    }
    const stripH = 24;
    for (let sy = stripH; sy < H; sy += 48) {
      ctx.fillStyle = '#1A2830';
      ctx.fillRect(8, sy, W - 16, stripH);
      ctx.fillStyle = `rgba(80,140,200,${0.08 + Math.random() * 0.06})`;
      ctx.fillRect(10, sy + 2, W - 20, stripH - 4);
    }
  } else if (type === 'residential') {
    ctx.fillStyle = '#D8D0C0'; ctx.fillRect(0, 0, W, H);
    const winW = 28, winH = 36;
    for (let wy = 40; wy < H - 40; wy += 60) {
      for (let wx = 30; wx < W - 30; wx += 64) {
        ctx.fillStyle = '#404850'; ctx.fillRect(wx, wy, winW, winH);
        if (Math.random() < 0.4) {
          const warmth = Math.floor(200 + Math.random() * 55);
          ctx.fillStyle = `rgba(${warmth},${warmth - 30},${warmth - 80},${0.15 + Math.random() * 0.2})`;
          ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);
        }
      }
    }
  } else if (type === 'warehouse') {
    ctx.fillStyle = '#8A8480'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 2);
    }
  } else {
    ctx.fillStyle = '#D0D8E0'; ctx.fillRect(0, 0, W, H);
    const stripH = 20;
    for (let sy = 30; sy < H; sy += 40) {
      ctx.fillStyle = '#2A3848';
      ctx.fillRect(12, sy, W - 24, stripH);
      ctx.fillStyle = `rgba(100,160,220,${0.1 + Math.random() * 0.08})`;
      ctx.fillRect(14, sy + 2, W - 28, stripH - 4);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Archetype: Curtain Tower ────────────────────────────────────────────────

function CurtainTower({ height, palette }: { height: number; palette?: { main: string; alt: string; trim: string } }) {
  const h = Math.max(10, Math.min(height, 50));
  const w = 9, d = 9;
  const mainColor = palette?.main || '#F2F6FF';
  const trimColor = palette?.trim || '#C8DCEF';

  const tex = useMemo(() => makeBuildingTexture('curtain'), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial map={tex} color={mainColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, h + 0.175, 0]}>
        <boxGeometry args={[w + 0.3, 0.35, d + 0.3]} />
        <meshStandardMaterial color={trimColor} roughness={0.75} metalness={0.05} />
      </mesh>
      {/* AC unit */}
      <mesh position={[-2, h + 0.6, 1]}>
        <boxGeometry args={[2.5, 0.6, 1.8]} />
        <meshStandardMaterial color="#D8E8F8" roughness={0.80} />
      </mesh>
    </group>
  );
}

// ─── Archetype: Slab ─────────────────────────────────────────────────────────

function Slab({ height, palette }: { height: number; palette?: { main: string; alt: string; trim: string } }) {
  const h = Math.max(6, Math.min(height, 18));
  const w = 16, d = 7;
  const mainColor = palette?.main || '#F2F6FF';
  const trimColor = palette?.trim || '#C8DCEF';

  const tex = useMemo(() => makeBuildingTexture('strip'), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial map={tex} color={mainColor} roughness={0.85} />
      </mesh>
      <mesh position={[0, h + 0.125, 0]}>
        <boxGeometry args={[w + 0.3, 0.25, d + 0.3]} />
        <meshStandardMaterial color={trimColor} roughness={0.75} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ─── Archetype: Residential ──────────────────────────────────────────────────

function Residential({ height }: { height: number }) {
  const h = Math.max(5, Math.min(height, 14));
  const w = 8, d = 8;

  const tex = useMemo(() => makeBuildingTexture('residential'), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial map={tex} color="#D8E8F8" roughness={0.80} />
      </mesh>
      {/* Pitched roof */}
      <mesh position={[0, h + 1.4, -d / 4 + 0.2]} rotation-x={-0.36} castShadow>
        <boxGeometry args={[w + 0.4, 0.22, d / 2 + 0.5]} />
        <meshStandardMaterial color="#C8D4DE" roughness={0.85} />
      </mesh>
      <mesh position={[0, h + 1.4, d / 4 - 0.2]} rotation-x={0.36} castShadow>
        <boxGeometry args={[w + 0.4, 0.22, d / 2 + 0.5]} />
        <meshStandardMaterial color="#C8D4DE" roughness={0.85} />
      </mesh>
    </group>
  );
}

// ─── Archetype: Warehouse ────────────────────────────────────────────────────

function Warehouse({ height }: { height: number }) {
  const h = Math.max(5, Math.min(height, 10));
  const w = 18, d = 12;

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#D8E8F8" roughness={0.80} />
      </mesh>
      {/* Barrel vault roof */}
      <mesh position={[0, h + d * 0.25, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[d / 2, d / 2, w, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#D8E4EE" roughness={0.85} />
      </mesh>
    </group>
  );
}

// ─── Archetype: Campus ───────────────────────────────────────────────────────

function Campus({ height, palette }: { height: number; palette?: { main: string; alt: string; trim: string } }) {
  const h = Math.max(8, Math.min(height, 22));
  const mainColor = palette?.main || '#F2F6FF';
  const trimColor = palette?.trim || '#C8DCEF';

  const tex = useMemo(() => makeBuildingTexture('campus'), []);

  const vols = [
    { ox: 0, oz: 0, w: 10, d: 9, fh: h },
    { ox: -8, oz: -3, w: 6, d: 7, fh: h * 0.65 },
    { ox: 8, oz: 3, w: 6, d: 7, fh: h * 0.80 },
  ];

  return (
    <group>
      {vols.map((v, i) => (
        <group key={i}>
          <mesh position={[v.ox, v.fh / 2, v.oz]} castShadow receiveShadow>
            <boxGeometry args={[v.w, v.fh, v.d]} />
            <meshStandardMaterial map={tex} color={mainColor} roughness={0.85} />
          </mesh>
          <mesh position={[v.ox, v.fh + 0.125, v.oz]}>
            <boxGeometry args={[v.w + 0.2, 0.25, v.d + 0.2]} />
            <meshStandardMaterial color={trimColor} roughness={0.75} metalness={0.05} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Archetype: Spire ────────────────────────────────────────────────────────

function Spire({ height }: { height: number }) {
  const h = Math.max(12, Math.min(height, 40));
  const w = 7, d = 7;

  const tex = useMemo(() => makeBuildingTexture('curtain'), []);

  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial map={tex} color="#F2F6FF" roughness={0.85} />
      </mesh>
      {/* Tower */}
      <mesh position={[0, h + 2.5, 0]} castShadow>
        <boxGeometry args={[3.5, 5, 3.5]} />
        <meshStandardMaterial color="#F2F6FF" roughness={0.85} />
      </mesh>
      {/* Cylinder transition */}
      <mesh position={[0, h + 6.5, 0]} castShadow>
        <cylinderGeometry args={[0.7, 1.1, 3, 8]} />
        <meshStandardMaterial color="#C8DCEF" roughness={0.75} metalness={0.05} />
      </mesh>
      {/* Cone spire */}
      <mesh position={[0, h + 10.5, 0]} castShadow>
        <coneGeometry args={[0.55, 5, 8]} />
        <meshStandardMaterial color="#C8D8EC" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ─── Archetype: Podium Tower ─────────────────────────────────────────────────

function PodiumTower({ height }: { height: number }) {
  const h = Math.max(16, Math.min(height, 80));
  const podH = 3;

  const tex = useMemo(() => makeBuildingTexture('curtain'), []);

  return (
    <group>
      {/* Podium */}
      <mesh position={[0, podH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, podH, 12]} />
        <meshStandardMaterial color="#C8DCEF" roughness={0.75} metalness={0.05} />
      </mesh>
      {/* Tower */}
      <mesh position={[0, podH + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, h, 7]} />
        <meshStandardMaterial map={tex} color="#F2F6FF" roughness={0.85} />
      </mesh>
      {/* Setback */}
      <mesh position={[0, podH + h + h * 0.11, 0]} castShadow>
        <boxGeometry args={[5.5, h * 0.22, 4.5]} />
        <meshStandardMaterial color="#F2F6FF" roughness={0.85} />
      </mesh>
      {/* Antenna */}
      <mesh position={[0, podH + h + h * 0.22 + 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 4, 6]} />
        <meshStandardMaterial color="#C8DCEF" roughness={0.75} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ─── Building Component (picks archetype) ────────────────────────────────────

interface BuildingProps {
  archetype: BuildingArchetype;
  height: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  palette?: { main: string; alt: string; trim: string };
  healthGlow?: string | null;
  emissiveIntensity?: number;
}

export function Building({ archetype, height, position, rotation, palette, healthGlow, emissiveIntensity = 0 }: BuildingProps) {
  const groupRef = useRef<THREE.Group>(null!);

  const ArchComponent = useMemo(() => {
    switch (archetype) {
      case 'curtainTower': return CurtainTower;
      case 'slab': return Slab;
      case 'residential': return Residential;
      case 'warehouse': return Warehouse;
      case 'campus': return Campus;
      case 'spire': return Spire;
      case 'podiumTower': return PodiumTower;
      default: return CurtainTower;
    }
  }, [archetype]);

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      <ArchComponent height={height} palette={palette} />
      {/* Health glow indicator — a subtle emissive ring at building base */}
      {healthGlow && (
        <mesh position={[0, 0.15, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[3, 5, 32]} />
          <meshStandardMaterial
            color={healthGlow}
            emissive={healthGlow}
            emissiveIntensity={emissiveIntensity || 0.6}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── Archetype Selection ─────────────────────────────────────────────────────

export function getArchetypeForZone(zone: ZoneType, rng: () => number): { archetype: BuildingArchetype; height: number } {
  switch (zone) {
    case 'downtown': {
      const r = rng();
      if (r < 0.25) return { archetype: 'podiumTower', height: 30 + rng() * 50 };
      if (r < 0.50) return { archetype: 'curtainTower', height: 20 + rng() * 30 };
      if (r < 0.75) return { archetype: 'spire', height: 25 + rng() * 15 };
      return { archetype: 'slab', height: 12 + rng() * 6 };
    }
    case 'midrise': {
      const r = rng();
      if (r < 0.35) return { archetype: 'slab', height: 8 + rng() * 10 };
      if (r < 0.65) return { archetype: 'curtainTower', height: 12 + rng() * 15 };
      if (r < 0.85) return { archetype: 'campus', height: 10 + rng() * 12 };
      return { archetype: 'residential', height: 6 + rng() * 8 };
    }
    case 'mixed': {
      const r = rng();
      if (r < 0.30) return { archetype: 'warehouse', height: 5 + rng() * 5 };
      if (r < 0.55) return { archetype: 'residential', height: 5 + rng() * 9 };
      if (r < 0.80) return { archetype: 'slab', height: 6 + rng() * 8 };
      return { archetype: 'campus', height: 8 + rng() * 8 };
    }
    case 'low': {
      const r = rng();
      if (r < 0.60) return { archetype: 'residential', height: 5 + rng() * 5 };
      if (r < 0.85) return { archetype: 'warehouse', height: 5 + rng() * 3 };
      return { archetype: 'slab', height: 6 + rng() * 4 };
    }
    default:
      return { archetype: 'residential', height: 5 + rng() * 5 };
  }
}
