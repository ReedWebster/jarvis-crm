/**
 * WorldView — Standalone interactive 3D city.
 * No contact data, no props. Pure Three.js procedural city.
 *
 * Controls:
 *   Left-drag   → rotate azimuth
 *   Right-drag  → pan (city) / look (interior)
 *   Scroll      → zoom
 *   Click       → select building / inspect element
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from 'postprocessing';

// ─── SEEDED RANDOM ────────────────────────────────────────────────────────────
function seededRandom(seed: string): () => number {
  let h = 0;
  for (const ch of seed) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return () => {
    h = (Math.imul(2654435761, h ^ (h >>> 16))) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}

// ─── MATERIALS ────────────────────────────────────────────────────────────────
interface ArchMats {
  main:  THREE.MeshStandardMaterial;
  alt:   THREE.MeshStandardMaterial;
  trim:  THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

function makeArchMats(): ArchMats {
  return {
    main:  new THREE.MeshStandardMaterial({ color: '#F2F6FF', roughness: 0.85, metalness: 0 }),
    alt:   new THREE.MeshStandardMaterial({ color: '#D8E8F8', roughness: 0.80, metalness: 0 }),
    trim:  new THREE.MeshStandardMaterial({ color: '#C8DCEF', roughness: 0.75, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ color: '#B8D4EC', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72 }),
  };
}

function archBox(w: number, h: number, d: number, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function addWindowRow(
  g: THREE.Group, y: number, facadeW: number, n: number,
  cx: number, faceZ: number, winMat: THREE.MeshStandardMaterial,
) {
  const step = facadeW / (n + 1);
  for (let i = 1; i <= n; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), winMat.clone());
    win.position.set(cx + (i - (n + 1) / 2) * step, y, faceZ + 0.02);
    g.add(win);
  }
}

// ─── BUILDING ARCHETYPES ──────────────────────────────────────────────────────

function createTower(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 7, d = 7;
  const base = archBox(w + 2, 0.8, d + 2, mats.trim.clone());
  base.position.set(0, 0.4, 0); g.add(base);
  const shaft = archBox(w, h, d, mats.main.clone());
  shaft.position.set(0, 0.8 + h / 2, 0); g.add(shaft);
  let topY = 0.8 + h;
  if (h > 8) {
    const s1H = h * 0.28;
    const s1 = archBox(w - 1.5, s1H, d - 1.5, mats.main.clone());
    s1.position.set(0, topY + s1H / 2, 0); g.add(s1); topY += s1H;
    const s2H = s1H * 0.55;
    const s2 = archBox(w - 3.5, s2H, d - 3.5, mats.main.clone());
    s2.position.set(0, topY + s2H / 2, 0); g.add(s2); topY += s2H;
  }
  const trim = archBox(w + 0.4, 0.3, d + 0.4, mats.trim.clone());
  trim.position.set(0, 0.8 + h + 0.15, 0); g.add(trim);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), mats.trim.clone());
  ant.castShadow = true; ant.position.set(0, topY + 1.25, 0); g.add(ant);
  const rows = Math.floor(h / 1.6);
  for (let r = 0; r < rows; r++) addWindowRow(g, 0.8 + 1.0 + r * 1.6, w, 3, 0, d / 2, mats.glass);
  return g;
}

function createMidrise(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(4, Math.min(h, 10));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 10, d = 9;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body);
  const trim = archBox(w + 0.3, 0.35, d + 0.3, mats.trim.clone());
  trim.position.set(0, h + 0.175, 0); g.add(trim);
  const ac = archBox(2.5, 0.6, 1.8, mats.alt.clone());
  ac.position.set(-2, h + 0.6, 1); g.add(ac);
  const rows = Math.floor(h / 1.7);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.7, w, 4, 0, d / 2, mats.glass);
  return g;
}

function createSlab(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(3, Math.min(h, 6));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 16, d = 7;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body);
  const edge = archBox(w + 0.3, 0.25, d + 0.3, mats.trim.clone());
  edge.position.set(0, h + 0.125, 0); g.add(edge);
  const bandRows = Math.floor(h / 2);
  for (let r = 0; r < bandRows; r++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 0.9), mats.glass.clone());
    band.position.set(0, 1.2 + r * 2, d / 2 + 0.02); g.add(band);
  }
  return g;
}

function createResidential(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(3, Math.min(h, 6));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 8, d = 8;
  const body = archBox(w, h, d, mats.alt.clone());
  body.position.set(0, h / 2, 0); g.add(body);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#C8D4DE', roughness: 0.85 });
  const lSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, d / 2 + 0.5), roofMat);
  lSlope.position.set(0, h + 1.4, -d / 4 + 0.2); lSlope.rotation.x = -0.36;
  lSlope.castShadow = true; g.add(lSlope);
  const rSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, d / 2 + 0.5), roofMat.clone());
  rSlope.position.set(0, h + 1.4, d / 4 - 0.2); rSlope.rotation.x = 0.36;
  rSlope.castShadow = true; g.add(rSlope);
  const rows = Math.floor(h / 1.8);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.8, w, 2, 0, d / 2, mats.glass);
  return g;
}

function createWarehouse(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(3, Math.min(h, 5));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 18, d = 12;
  const body = archBox(w, h, d, mats.alt.clone());
  body.position.set(0, h / 2, 0); g.add(body);
  const vaultMat = new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.85 });
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI), vaultMat);
  vault.rotation.z = Math.PI / 2; vault.position.set(0, h + d * 0.25, 0);
  vault.castShadow = true; g.add(vault);
  return g;
}

function createCampus(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(4, Math.min(h, 8));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const vols = [
    { ox: 0, oz: 0, w: 10, d: 9, fh: h },
    { ox: -8, oz: -3, w: 6, d: 7, fh: h * 0.65 },
    { ox: 8,  oz:  3, w: 6, d: 7, fh: h * 0.80 },
  ];
  for (const v of vols) {
    const b = archBox(v.w, v.fh, v.d, mats.main.clone());
    b.position.set(v.ox, v.fh / 2, v.oz); g.add(b);
    const trim = archBox(v.w + 0.2, 0.25, v.d + 0.2, mats.trim.clone());
    trim.position.set(v.ox, v.fh + 0.125, v.oz); g.add(trim);
    const rows = Math.floor(v.fh / 1.7);
    for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.7, v.w, 3, v.ox, v.oz + v.d / 2, mats.glass);
  }
  return g;
}

function createSpire(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(6, Math.min(h, 14));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 7, d = 7;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body);
  const towerH = 5;
  const tower = archBox(3.5, towerH, 3.5, mats.main.clone());
  tower.position.set(0, h + towerH / 2, 0); g.add(tower);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 3, 8), mats.trim.clone());
  cyl.position.set(0, h + towerH + 1.5, 0); cyl.castShadow = true; g.add(cyl);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 5, 8), new THREE.MeshStandardMaterial({ color: '#C8D8EC', roughness: 0.5 }));
  cone.position.set(0, h + towerH + 3 + 2.5, 0); cone.castShadow = true; g.add(cone);
  const rows = Math.floor(h / 1.8);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.8, w, 2, 0, d / 2, mats.glass);
  return g;
}

function createPodiumTower(x: number, z: number, h: number, mats: ArchMats): THREE.Group {
  h = Math.max(8, Math.min(h, 40));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const podH = 3;
  const pod = archBox(14, podH, 12, mats.trim.clone());
  pod.position.set(0, podH / 2, 0); g.add(pod);
  const tower = archBox(8, h, 7, mats.main.clone());
  tower.position.set(0, podH + h / 2, 0); g.add(tower);
  const setH = h * 0.22;
  const setback = archBox(5.5, setH, 4.5, mats.main.clone());
  setback.position.set(0, podH + h + setH / 2, 0); g.add(setback);
  const topTrim = archBox(8.4, 0.3, 7.4, mats.trim.clone());
  topTrim.position.set(0, podH + h + 0.15, 0); g.add(topTrim);
  for (const [ex, ez] of [[3.8, 3.3], [-3.8, 3.3], [3.8, -3.3], [-3.8, -3.3]] as [number, number][]) {
    const strip = archBox(0.12, h, 0.12, mats.trim.clone());
    strip.position.set(ex, podH + h / 2, ez); g.add(strip);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4, 6), mats.trim.clone());
  ant.castShadow = true; ant.position.set(0, podH + h + setH + 2, 0); g.add(ant);
  const rows = Math.floor(h / 1.6);
  for (let r = 0; r < rows; r++) addWindowRow(g, podH + 1.0 + r * 1.6, 8, 3, 0, 3.5, mats.glass);
  return g;
}

function makeTree(x: number, z: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkH = 1.8 + rng() * 0.8;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.16, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: '#B8C8D8', roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
  const colors = ['#C8D8C0', '#B8CCAC', '#D0DCC8'];
  for (let i = 0; i < 3; i++) {
    const r = 0.9 + rng() * 0.5;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 8),
      new THREE.MeshStandardMaterial({ color: colors[i % 3], roughness: 0.8 })
    );
    canopy.position.set((rng() - 0.5) * 0.6, trunkH + r * 0.7 + i * 0.25, (rng() - 0.5) * 0.6);
    canopy.castShadow = true; canopy.receiveShadow = true; g.add(canopy);
  }
  return g;
}

// ─── INTERIOR SCENE BUILDER ───────────────────────────────────────────────────

interface BlockInfo {
  col: number; row: number;
  cx:  number; cz: number;
  zone: ZoneType;
  label: string;
}

type ZoneType = 'downtown' | 'midrise' | 'mixed' | 'low' | 'park' | 'water';

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material).dispose();
    }
  });
  group.clear();
}

// ─── EXTERIOR CANVAS TEXTURE ──────────────────────────────────────────────────

function makeExteriorTexture(rng: () => number, elevationFloor: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Ground line shifts higher for higher floors (more sky, rooftop-level view)
  const groundY = Math.max(90, Math.round(215 - elevationFloor * 11));
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0,   '#4A80A8');
  skyGrad.addColorStop(0.5, '#7AAECE');
  skyGrad.addColorStop(1,   '#C0DCF0');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 512, groundY);
  // Horizon haze
  const hazeGrad = ctx.createLinearGradient(0, groundY * 0.65, 0, groundY);
  hazeGrad.addColorStop(0, 'rgba(210,232,248,0)');
  hazeGrad.addColorStop(1, 'rgba(225,242,252,0.6)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, 0, 512, groundY);
  // Far buildings (hazy silhouettes)
  ctx.fillStyle = 'rgba(145,178,205,0.5)';
  const nFar = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < nFar; i++) {
    const bx = rng() * 560 - 25, bw = 16 + rng() * 44, bh = 22 + rng() * 88;
    ctx.fillRect(bx, groundY - bh, bw, bh);
  }
  // Near buildings with lit windows
  const nNear = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < nNear; i++) {
    const bx = rng() * 540 - 15, bw = 26 + rng() * 54, bh = 38 + rng() * 78;
    const r = 100 + Math.floor(rng() * 35), g = 130 + Math.floor(rng() * 35), b = 168 + Math.floor(rng() * 28);
    ctx.fillStyle = `rgba(${r},${g},${b},0.88)`;
    ctx.fillRect(bx, groundY - bh, bw, bh);
    const wCols = Math.max(1, Math.floor(bw / 9)), wRows = Math.max(1, Math.floor(bh / 12));
    ctx.fillStyle = `rgba(${215 + Math.floor(rng()*30)},${230 + Math.floor(rng()*20)},255,${0.4 + rng()*0.35})`;
    for (let wr = 0; wr < wRows; wr++) {
      for (let wc = 0; wc < wCols; wc++) {
        if (rng() > 0.32) ctx.fillRect(bx + wc*(bw/wCols)+1.5, groundY-bh+wr*(bh/wRows)+2.5, bw/wCols-3, bh/wRows-4.5);
      }
    }
  }
  // Ground / street
  if (groundY < 256) {
    const gGrad = ctx.createLinearGradient(0, groundY, 0, 256);
    gGrad.addColorStop(0, '#B0BCC8'); gGrad.addColorStop(1, '#A0ACB8');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundY, 512, 256 - groundY);
  }
  return new THREE.CanvasTexture(canvas);
}

function buildInteriorScene(
  group: THREE.Group,
  block: BlockInfo,
  arch: string,
  buildingHeight: number,
  floor: number,
  interiorMeshesRef: { current: THREE.Mesh[] },
): number {
  disposeGroup(group);
  interiorMeshesRef.current = [];

  const rng = seededRandom(`interior-${block.col}-${block.row}-f${floor}`);

  // Archetype-aware floor dimensions (larger — feels like a real building)
  let iW = 32, iD = 24;
  if (arch === 'tower' || arch === 'spire') { iW = 20; iD = 20; }
  else if (arch === 'podiumTower') { iW = 28; iD = 22; }
  else if (arch === 'slab')        { iW = 40; iD = 18; }
  else if (arch === 'warehouse')   { iW = 42; iD = 28; }
  else if (arch === 'residential') { iW = 20; iD = 16; }
  const iH = 4.0;
  const nRegularFloors = Math.max(1, Math.min(10, Math.floor(buildingHeight / 4.0)));
  const isRooftop = floor === nRegularFloors;

  // ── ROOFTOP ───────────────────────────────────────────────────────────────────
  if (isRooftop) {
    // Concrete pavement
    const paveMat = new THREE.MeshStandardMaterial({ color: '#BEC8D0', roughness: 0.92 });
    const floorR = new THREE.Mesh(new THREE.PlaneGeometry(iW, iD), paveMat);
    floorR.rotation.x = -Math.PI / 2; floorR.receiveShadow = true;
    group.add(floorR);
    // Paving grid (larger tiles)
    const gMatR = new THREE.MeshStandardMaterial({ color: '#A8B4BC', roughness: 0.95 });
    for (let gx = -iW / 2; gx <= iW / 2; gx += 3) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.05, iD), gMatR); l.rotation.x = -Math.PI / 2; l.position.set(gx, 0.003, 0); group.add(l);
    }
    for (let gz = -iD / 2; gz <= iD / 2; gz += 3) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(iW, 0.05), gMatR.clone()); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.003, gz); group.add(l);
    }
    // Parapet walls
    const ppMat = new THREE.MeshStandardMaterial({ color: '#D0D8E0', roughness: 0.85 });
    const ppH = 1.3, ppW = 0.42;
    for (const pz of [-iD / 2 + ppW / 2, iD / 2 - ppW / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(iW, ppH, ppW), ppMat.clone()); p.position.set(0, ppH / 2, pz); p.castShadow = true; group.add(p);
    }
    for (const px of [-iW / 2 + ppW / 2, iW / 2 - ppW / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(ppW, ppH, iD), ppMat.clone()); p.position.set(px, ppH / 2, 0); p.castShadow = true; group.add(p);
    }
    // Panoramic skyline backdrops (4 sides)
    const roofElev = buildingHeight / 4.0;
    const bdH = 22, bdOff = 5;
    const bdCfg: [number, number, number, number][] = [
      [0, -iD/2 - bdOff, 0, iW * 1.7],
      [0,  iD/2 + bdOff, Math.PI, iW * 1.7],
      [-iW/2 - bdOff, 0,  Math.PI/2,  iD * 1.7],
      [ iW/2 + bdOff, 0, -Math.PI/2,  iD * 1.7],
    ];
    for (const [bx, bz, bRot, bW] of bdCfg) {
      const bdR = seededRandom(`roof-${bx.toFixed(0)}-${bz.toFixed(0)}-${block.col}-${block.row}`);
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(bW, bdH), new THREE.MeshBasicMaterial({ map: makeExteriorTexture(bdR, roofElev), side: THREE.DoubleSide }));
      bd.position.set(bx, bdH / 2, bz); bd.rotation.y = bRot; group.add(bd);
    }
    // ── Garden ─────────────────────────────────────────────────────────────────
    const soilMat  = new THREE.MeshStandardMaterial({ color: '#7A8A6C', roughness: 0.95 });
    const bedMat_  = new THREE.MeshStandardMaterial({ color: '#8A9A78', roughness: 0.9 });
    const leafG1   = new THREE.MeshStandardMaterial({ color: '#60984A', roughness: 0.85 });
    const leafG2   = new THREE.MeshStandardMaterial({ color: '#78A858', roughness: 0.85 });
    const benchMt  = new THREE.MeshStandardMaterial({ color: '#9AACB8', roughness: 0.8 });
    const pergoMt  = new THREE.MeshStandardMaterial({ color: '#C8D4DC', roughness: 0.75 });
    const pathMt   = new THREE.MeshStandardMaterial({ color: '#C0B8A8', roughness: 0.92 });
    // Gravel paths
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, iD * 0.62), pathMt); p1.rotation.x = -Math.PI / 2; p1.position.set(iW * 0.08, 0.004, -iD * 0.06); group.add(p1);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(iW * 0.52, 1.8), pathMt.clone()); p2.rotation.x = -Math.PI / 2; p2.position.set(-iW * 0.02, 0.004, iD * 0.14); group.add(p2);
    // Raised planting beds
    const bedDefs: [number, number, number, number][] = [
      [-iW*0.28, -iD*0.26, iW*0.22, iD*0.18],
      [ iW*0.26, -iD*0.28, iW*0.18, iD*0.20],
      [-iW*0.28,  iD*0.22, iW*0.22, iD*0.17],
      [ iW*0.26,  iD*0.22, iW*0.18, iD*0.17],
    ];
    for (const [bx, bz, bw, bd_] of bedDefs) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.3, bd_), bedMat_.clone()); bed.position.set(bx, 0.15, bz); bed.castShadow = true; group.add(bed);
      const soil = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.1, bd_ - 0.1), soilMat.clone()); soil.rotation.x = -Math.PI / 2; soil.position.set(bx, 0.31, bz); group.add(soil);
      const nP = 3 + Math.floor(rng() * 4);
      for (let p = 0; p < nP; p++) {
        const px2 = bx + (rng() - 0.5) * (bw * 0.7), pz2 = bz + (rng() - 0.5) * (bd_ * 0.7);
        const lr = 0.4 + rng() * 0.35;
        const pl = new THREE.Mesh(new THREE.SphereGeometry(lr, 8, 8), (rng() > 0.5 ? leafG1 : leafG2).clone());
        pl.position.set(px2, 0.31 + lr * 0.7, pz2); group.add(pl);
      }
    }
    // Benches
    for (const [bx, bz] of [[iW*0.09+2.2, -iD*0.18], [iW*0.09+2.2, iD*0.06], [-iW*0.14, iD*0.28]] as [number,number][]) {
      const seat_ = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.65), benchMt.clone()); seat_.position.set(bx, 0.44, bz); seat_.castShadow = true; group.add(seat_);
      const back_ = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), benchMt.clone()); back_.position.set(bx, 0.7, bz - 0.3); group.add(back_);
      for (const lx of [-0.85, 0.85]) { const leg_ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.55), benchMt.clone()); leg_.position.set(bx + lx, 0.22, bz); group.add(leg_); }
    }
    // Pergola corner (-x, +z)
    const pgX = -iW * 0.3, pgZ = iD * 0.3, pgW = Math.max(4, iW * 0.16), pgD = Math.max(3, iD * 0.13), cH = 2.8;
    for (const [cx, cz] of [[pgX-pgW/2, pgZ-pgD/2],[pgX+pgW/2, pgZ-pgD/2],[pgX-pgW/2, pgZ+pgD/2],[pgX+pgW/2, pgZ+pgD/2]] as [number,number][]) {
      const c_ = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, cH, 8), pergoMt.clone()); c_.position.set(cx, cH/2, cz); c_.castShadow = true; group.add(c_);
    }
    for (let s = 0; s < 4; s++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(pgW+0.4, 0.1, 0.14), pergoMt.clone()); sl.position.set(pgX, cH, pgZ - pgD/2 + s*(pgD/3)); group.add(sl); }
    for (const bx_ of [pgX-pgW/2+0.2, pgX+pgW/2-0.2]) { const bm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, pgD), pergoMt.clone()); bm.position.set(bx_, cH+0.05, pgZ); group.add(bm); }
    // Path lights
    const orbMat = new THREE.MeshStandardMaterial({ color: '#FFE8C0', emissive: new THREE.Color('#FF9820'), emissiveIntensity: 0.8 });
    for (const [lx, lz] of [[iW*0.08-1.3, -iD*0.3],[iW*0.08-1.3, iD*0.15],[iW*0.08+2.3, iD*0.14]] as [number,number][]) {
      const post_ = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), benchMt.clone()); post_.position.set(lx, 0.5, lz); group.add(post_);
      const orb_ = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), orbMat.clone()); orb_.position.set(lx, 1.08, lz); group.add(orb_);
    }
    return nRegularFloors + 1;
  }

  // ── REGULAR OFFICE FLOOR ─────────────────────────────────────────────────────

  // ── Floor ───────────────────────────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({ color: '#D0D8E8', roughness: 0.85 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(iW, iD), floorMat);
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true;
  group.add(floorMesh);
  // Floor grid lines
  const gridMat = new THREE.MeshStandardMaterial({ color: '#B8C8D8', roughness: 0.9 });
  for (let gx = -iW / 2; gx < iW / 2; gx += 2) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.04, iD), gridMat); l.rotation.x = -Math.PI / 2; l.position.set(gx, 0.002, 0); group.add(l);
  }
  for (let gz = -iD / 2; gz < iD / 2; gz += 2) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(iW, 0.04), gridMat.clone()); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.002, gz); group.add(l);
  }

  // ── Ceiling ─────────────────────────────────────────────────────────────────
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#F2F6FF', roughness: 0.8 });
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(iW, iD), ceilMat);
  ceilMesh.rotation.x = Math.PI / 2; ceilMesh.position.y = iH; group.add(ceilMesh);

  // ── Back + front solid walls ─────────────────────────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({ color: '#E8EEF8', roughness: 0.82 });
  const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(iW, iH), wallMat);
  wallBack.position.set(0, iH / 2, -iD / 2); group.add(wallBack);
  const wallFront = new THREE.Mesh(new THREE.PlaneGeometry(iW, iH), wallMat.clone());
  wallFront.position.set(0, iH / 2, iD / 2); wallFront.rotation.y = Math.PI; group.add(wallFront);

  // ── Windowed left + right walls with exterior backdrop ───────────────────────
  const nWins  = arch === 'warehouse' ? 7 : arch === 'slab' ? 8 : arch === 'tower' || arch === 'spire' ? 4 : 6;
  const winW   = 2.8, winH = 2.2;
  const winY   = iH * 0.52;
  const winZPositions = Array.from({ length: nWins }, (_, i) => -iD / 2 + (i + 1) * (iD / (nWins + 1)));

  const glassMat = new THREE.MeshStandardMaterial({
    color: '#C8DCF0', roughness: 0.04, metalness: 0.08,
    transparent: true, opacity: 0.15,
    emissive: new THREE.Color('#1A3850'), emissiveIntensity: 0.05,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#B0BCC8', roughness: 0.65, metalness: 0.15 });
  const fT = 0.09;

  function buildWindowedWall(wallX: number, wallRotY: number, backdropSign: number) {
    const wMat = wallMat.clone();
    const topH = iH - (winY + winH / 2);
    const botH = winY - winH / 2;
    if (topH > 0.01) {
      const top = new THREE.Mesh(new THREE.PlaneGeometry(iD, topH), wMat);
      top.position.set(wallX, winY + winH / 2 + topH / 2, 0); top.rotation.y = wallRotY; group.add(top);
    }
    if (botH > 0.01) {
      const bot = new THREE.Mesh(new THREE.PlaneGeometry(iD, botH), wMat.clone());
      bot.position.set(wallX, botH / 2, 0); bot.rotation.y = wallRotY; group.add(bot);
    }
    for (let i = 0; i <= winZPositions.length; i++) {
      const segZ0 = i === 0 ? -iD / 2 : winZPositions[i - 1] + winW / 2;
      const segZ1 = i === winZPositions.length ? iD / 2 : winZPositions[i] - winW / 2;
      const segLen = segZ1 - segZ0;
      if (segLen > 0.04) {
        const pier = new THREE.Mesh(new THREE.PlaneGeometry(segLen, winH), wMat.clone());
        pier.position.set(wallX, winY, segZ0 + segLen / 2); pier.rotation.y = wallRotY; group.add(pier);
      }
    }
    const extRng = seededRandom(`ext-${wallX.toFixed(1)}-${block.col}-${block.row}-f${floor}`);
    const extTex = makeExteriorTexture(extRng, floor);
    const bdMat  = new THREE.MeshBasicMaterial({ map: extTex, side: THREE.DoubleSide });
    for (const wz of winZPositions) {
      // Glass pane
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat.clone());
      glass.position.set(wallX - backdropSign * 0.02, winY, wz); glass.rotation.y = wallRotY;
      glass.userData.interiorElement = { type: 'window', label: 'City View' };
      group.add(glass); interiorMeshesRef.current.push(glass);
      // Frame bars (top, bottom, left upright, right upright)
      const tBar = new THREE.Mesh(new THREE.BoxGeometry(fT, fT, winW + fT*2), frameMat.clone()); tBar.position.set(wallX, winY + winH/2 + fT/2, wz); group.add(tBar);
      const bBar = new THREE.Mesh(new THREE.BoxGeometry(fT, fT, winW + fT*2), frameMat.clone()); bBar.position.set(wallX, winY - winH/2 - fT/2, wz); group.add(bBar);
      const lBar = new THREE.Mesh(new THREE.BoxGeometry(fT, winH+fT*2, fT), frameMat.clone()); lBar.position.set(wallX, winY, wz - winW/2 - fT/2); group.add(lBar);
      const rBar = new THREE.Mesh(new THREE.BoxGeometry(fT, winH+fT*2, fT), frameMat.clone()); rBar.position.set(wallX, winY, wz + winW/2 + fT/2); group.add(rBar);
      // Exterior canvas backdrop (outside the wall)
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(winW * 2.2, winH * 2.2), bdMat.clone());
      bd.position.set(wallX + backdropSign * 2.8, winY, wz); bd.rotation.y = wallRotY; group.add(bd);
    }
  }
  buildWindowedWall(-iW / 2,  Math.PI / 2, -1);
  buildWindowedWall( iW / 2, -Math.PI / 2,  1);

  // ── Ceiling light strips ─────────────────────────────────────────────────────
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#D8E8FF', emissive: new THREE.Color('#A8C4F0'), emissiveIntensity: 0.95, roughness: 0.2,
  });
  const nStrips = Math.max(2, Math.floor(iW / 7));
  const stripSpacing = iW / (nStrips + 1);
  for (let s = 1; s <= nStrips; s++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, iD * 0.68), lightMat);
    strip.position.set(-iW / 2 + s * stripSpacing, iH - 0.04, 0); group.add(strip);
  }

  // ── Desks, chairs, monitors ──────────────────────────────────────────────────
  const deskMat    = new THREE.MeshStandardMaterial({ color: '#C8D4E0', roughness: 0.7 });
  const monitorMat = new THREE.MeshStandardMaterial({ color: '#1C2030', roughness: 0.5 });
  const screenMat  = new THREE.MeshStandardMaterial({ color: '#2060A0', roughness: 0.2, emissive: new THREE.Color('#0840A0'), emissiveIntensity: 0.35 });
  const chairMat   = new THREE.MeshStandardMaterial({ color: '#A8B8CC', roughness: 0.85 });

  const deskRows    = block.zone === 'downtown' ? 4 : block.zone === 'midrise' ? 3 : 2;
  const desksPerRow = block.zone === 'downtown' ? 5 : block.zone === 'midrise' ? 4 : 3;
  const deskAreaW   = iW * 0.60, deskAreaD = iD * 0.55;
  const deskStartX  = -deskAreaW / 2 + (rng() - 0.5) * 2.0;
  const deskStartZ  = -deskAreaD / 2 + (rng() - 0.5) * 1.5;

  for (let dr = 0; dr < deskRows; dr++) {
    for (let dc = 0; dc < desksPerRow; dc++) {
      const dx = deskStartX + dc * (deskAreaW / Math.max(1, desksPerRow - 1));
      const dz = deskStartZ + dr * (deskAreaD / Math.max(1, deskRows - 1));
      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.85), deskMat.clone());
      desk.position.set(dx, 0.74, dz); desk.castShadow = true; desk.receiveShadow = true;
      desk.userData.interiorElement = { type: 'desk', label: `Workstation ${dr * desksPerRow + dc + 1}` };
      group.add(desk); interiorMeshesRef.current.push(desk);
      for (const [lx, lz] of [[-0.9,-0.35],[0.9,-0.35],[-0.9,0.35],[0.9,0.35]] as [number,number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), deskMat.clone()); leg.position.set(dx+lx, 0.37, dz+lz); group.add(leg);
      }
      const mox = dx + (rng() - 0.5) * 0.4;
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.05), monitorMat.clone()); mon.position.set(mox, 1.06, dz - 0.24); group.add(mon);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), screenMat.clone()); scr.position.set(mox, 1.06, dz - 0.215); group.add(scr);
      const std = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), monitorMat.clone()); std.position.set(mox, 0.86, dz - 0.24); group.add(std);
      const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.62), chairMat.clone()); seatM.position.set(dx, 0.47, dz + 0.62); group.add(seatM);
      const backM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.06), chairMat.clone()); backM.position.set(dx, 0.74, dz + 0.95); group.add(backM);
      const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), chairMat.clone()); baseM.position.set(dx, 0.03, dz + 0.62); group.add(baseM);
    }
  }

  // ── Glass dividers ───────────────────────────────────────────────────────────
  const dividerMat = new THREE.MeshStandardMaterial({ color: '#B8D0E8', roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.42 });
  if (deskRows > 1) {
    for (let dr = 0; dr < deskRows - 1; dr++) {
      const dz = deskStartZ + (dr + 0.5) * (deskAreaD / Math.max(1, deskRows - 1));
      const div = new THREE.Mesh(new THREE.BoxGeometry(deskAreaW + 1.5, 1.35, 0.04), dividerMat);
      div.position.set(deskStartX + deskAreaW / 2, 0.68, dz); group.add(div);
    }
  }

  // ── Meeting room ─────────────────────────────────────────────────────────────
  const mrW = iW < 22 ? 5.5 : 7.5, mrD = iD < 18 ? 4.5 : 6.0;
  const mrCx = -iW / 2 + mrW / 2, mrCz = iD / 2 - mrD / 2;
  const mrGlassMat = new THREE.MeshStandardMaterial({ color: '#B0CCDC', roughness: 0.04, metalness: 0.18, transparent: true, opacity: 0.38 });
  const mrFront = new THREE.Mesh(new THREE.PlaneGeometry(mrW, iH * 0.88), mrGlassMat.clone());
  mrFront.position.set(mrCx, iH * 0.44, mrCz - mrD / 2);
  mrFront.userData.interiorElement = { type: 'meetingRoom', label: 'Conference Room' };
  group.add(mrFront); interiorMeshesRef.current.push(mrFront);
  const mrSide = new THREE.Mesh(new THREE.PlaneGeometry(mrD, iH * 0.88), mrGlassMat.clone());
  mrSide.position.set(mrCx + mrW / 2, iH * 0.44, mrCz); mrSide.rotation.y = -Math.PI / 2; group.add(mrSide);
  const mrTable = new THREE.Mesh(new THREE.BoxGeometry(mrW * 0.7, 0.08, mrD * 0.55), new THREE.MeshStandardMaterial({ color: '#B8C8D4', roughness: 0.65 }));
  mrTable.position.set(mrCx, 0.75, mrCz); mrTable.castShadow = true; group.add(mrTable);
  for (const [cx, , cz] of [[mrCx-mrW*0.22,0,mrCz-mrD*0.18],[mrCx,0,mrCz-mrD*0.18],[mrCx+mrW*0.22,0,mrCz-mrD*0.18],[mrCx-mrW*0.22,0,mrCz+mrD*0.18],[mrCx,0,mrCz+mrD*0.18]] as [number,number,number][]) {
    const cs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.48), chairMat.clone()); cs.position.set(cx, 0.46, cz); group.add(cs);
  }

  // ── Plants ───────────────────────────────────────────────────────────────────
  const potMat  = new THREE.MeshStandardMaterial({ color: '#C8B8A0', roughness: 0.88 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#70A060', roughness: 0.82 });
  for (const [px, pz] of [[iW/2-1.8, iD/2-1.8],[iW/2-1.8, -iD/2+1.8],[mrCx+mrW/2+0.8, mrCz+0.6]] as [number,number][]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.34, 8), potMat.clone()); pot.position.set(px, 0.17, pz); group.add(pot);
    const lv  = new THREE.Mesh(new THREE.SphereGeometry(0.38+rng()*0.14, 8, 8), leafMat.clone()); lv.position.set(px, 0.62+rng()*0.1, pz); group.add(lv);
  }

  // ── Corner columns ────────────────────────────────────────────────────────────
  const colMat = new THREE.MeshStandardMaterial({ color: '#C8D4E0', roughness: 0.8, metalness: 0.05 });
  for (const [cx, cz] of [[iW/2-0.35, -iD/2+0.35],[-iW/2+0.35, -iD/2+0.35]] as [number,number][]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, iH, 8), colMat.clone()); col.position.set(cx, iH/2, cz); group.add(col);
  }

  return nRegularFloors + 1; // +1 accounts for rooftop
}

// ─── ZONE TYPES ───────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<ZoneType, string> = {
  downtown: '#7B9EC8',
  midrise:  '#9BBCD8',
  mixed:    '#B8C8D8',
  low:      '#C8D8C8',
  park:     '#A8C8A0',
  water:    '#7098B8',
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function WorldView() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  // City view state
  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null);

  // Interior view state
  const [viewMode, setViewMode]               = useState<'city' | 'interior'>('city');
  const [interiorBuilding, setInteriorBuilding] = useState<BlockInfo | null>(null);
  const [currentFloor, setCurrentFloor]       = useState(0);
  const [totalFloors, setTotalFloors]         = useState(1);
  const [interiorSelection, setInteriorSelection] = useState<{ type: string; label: string } | null>(null);

  // Refs that bridge React state → Three.js animation loop
  const viewModeRef          = useRef<'city' | 'interior'>('city');
  const interiorBuildingRef  = useRef<BlockInfo | null>(null);
  const currentFloorRef      = useRef(0);
  const transitionRef        = useRef<{ active: boolean; alpha: number; direction: 1 | -1 }>({ active: false, alpha: 0, direction: 1 });
  const fadeOverlayRef       = useRef<HTMLDivElement>(null);
  const savedCityCameraRef   = useRef<{ radius: number; theta: number; target: THREE.Vector3 }>({
    radius: 280, theta: Math.PI / 4, target: new THREE.Vector3(),
  });
  const cityGroupRef         = useRef<THREE.Group | null>(null);
  const interiorGroupRef     = useRef<THREE.Group | null>(null);
  const allInteriorMeshesRef = useRef<THREE.Mesh[]>([]);
  const blockArchetypeMapRef = useRef<Map<string, { arch: string; height: number }>>(new Map());

  // Callback refs — set inside useEffect so they close over orbit vars
  const enterBuildingCallbackRef = useRef<((block: BlockInfo) => void) | null>(null);
  const exitBuildingCallbackRef  = useRef<(() => void) | null>(null);
  const changeFloorCallbackRef   = useRef<((floor: number) => void) | null>(null);

  useEffect(() => {
    const canvas   = canvasRef.current!;
    const labelDiv = labelRef.current!;
    if (!canvas || !labelDiv) return;
    const mmCanvas = minimapRef.current;

    const W = canvas.clientWidth  || 900;
    const H = canvas.clientHeight || 700;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace  = THREE.SRGBColorSpace;

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xe8f0f8, 0.0014);

    // ── Groups ────────────────────────────────────────────────────────────────
    const cityGroup = new THREE.Group();
    const interiorGroup = new THREE.Group();
    interiorGroup.visible = false;
    scene.add(cityGroup);
    scene.add(interiorGroup);
    cityGroupRef.current = cityGroup;
    interiorGroupRef.current = interiorGroup;
    blockArchetypeMapRef.current = new Map();

    // ── Sky gradient shader ────────────────────────────────────────────────────
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uHorizon: { value: new THREE.Color('#E8F0F8') },
        uZenith:  { value: new THREE.Color('#7BB8D4') },
        uSunDir:  { value: new THREE.Vector3(0.45, 0.65, -0.62).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uSunDir;
        varying vec3 vWorldPos;
        void main() {
          float t   = clamp(normalize(vWorldPos).y * 1.4, 0.0, 1.0);
          vec3 sky  = mix(uHorizon, uZenith, t);
          float sun = pow(max(dot(normalize(vWorldPos), uSunDir), 0.0), 120.0) * 2.5;
          sky += vec3(1.0, 0.97, 0.9) * sun;
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
    scene.add(skyMesh);

    // ── Lighting ──────────────────────────────────────────────────────────────
    const sun = new THREE.DirectionalLight('#ffffff', 2.5);
    sun.position.set(120, 180, -100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 800;
    sun.shadow.camera.left   = -320;
    sun.shadow.camera.right  = 320;
    sun.shadow.camera.top    = 320;
    sun.shadow.camera.bottom = -320;
    sun.shadow.bias = -0.0003;
    (sun.shadow as THREE.DirectionalLightShadow & { radius?: number }).radius = 2;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight('#C8D8F0', '#E8EEE4', 0.5);
    scene.add(hemi);

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 1200);

    let orbitTarget = new THREE.Vector3(0, 0, 0);
    let orbitRadius = 280;
    let orbitTheta  = Math.PI / 4;
    let orbitPhi    = 1.08; // ~62° from zenith

    function updateCameraOrbit() {
      const sinP = Math.sin(orbitPhi), cosP = Math.cos(orbitPhi);
      const sinT = Math.sin(orbitTheta), cosT = Math.cos(orbitTheta);
      camera.position.set(
        orbitTarget.x + orbitRadius * sinP * sinT,
        orbitTarget.y + orbitRadius * cosP,
        orbitTarget.z + orbitRadius * sinP * cosT,
      );
      camera.lookAt(orbitTarget);
    }
    updateCameraOrbit();

    // ── Post-processing ───────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({ intensity: 0.15, luminanceThreshold: 0.92, luminanceSmoothing: 0.02, mipmapBlur: true });
    composer.addPass(new EffectPass(camera, bloom));

    // ── Ground ────────────────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: '#E4EAF0', roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    // ── Materials (shared, cloned per building) ───────────────────────────────
    const mats = makeArchMats();

    // ── City grid parameters ───────────────────────────────────────────────────
    const GRID_N    = 9;
    const BLOCK_SIZE = 58;
    const STEP       = 66;
    const HALF       = Math.floor(GRID_N / 2);

    const roadMat  = new THREE.MeshStandardMaterial({ color: '#1C1C1E', roughness: 0.97 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#D8DDE3', roughness: 0.90 });
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#F5E642', roughness: 0.60 });

    const ROAD_W = 8;
    const GRID_EXTENT = HALF * STEP + STEP / 2;

    for (let i = 0; i <= GRID_N; i++) {
      const x = (-HALF - 0.5 + i) * STEP;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, GRID_EXTENT * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.01, 0);
      road.receiveShadow = true;
      cityGroup.add(road);
      for (const s of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, GRID_EXTENT * 2), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(x + s * (ROAD_W / 2 + 0.9), 0.016, 0);
        sw.receiveShadow = true;
        cityGroup.add(sw);
      }
      for (let z = -GRID_EXTENT + 4; z < GRID_EXTENT; z += 6) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.018, z);
        cityGroup.add(d);
      }
    }
    for (let i = 0; i <= GRID_N; i++) {
      const z = (-HALF - 0.5 + i) * STEP;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, z);
      road.receiveShadow = true;
      cityGroup.add(road);
      for (const s of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, 1.8), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(0, 0.016, z + s * (ROAD_W / 2 + 0.9));
        sw.receiveShadow = true;
        cityGroup.add(sw);
      }
      for (let x = -GRID_EXTENT + 4; x < GRID_EXTENT; x += 6) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.018, z);
        cityGroup.add(d);
      }
    }

    // ── Zone assignment ────────────────────────────────────────────────────────
    const ZONE_LABELS: Record<ZoneType, string[]> = {
      downtown: ['Financial Core','Central Tower','Commerce Plaza','Exchange Sq','Metro Center','Skyline Block','Capital Row','Civic Hub','Crown Heights'],
      midrise:  ['Midtown West','Uptown East','Park Ave','Gallery Row','The Arcade','Merchant Row','Harbor Gate','River Bend','Lakeside'],
      mixed:    ['Arts Quarter','University Row','Market Street','Innovation Mile','Craft District','Bricktown','The Yards','Riverside','Garden Block'],
      low:      ['Oak St','Maple Ave','Pine Court','Birch Lane','Cedar Row','Elm Park','Chestnut Way','Aspen Hill','Valley View'],
      park:     ['City Park','Memorial Green','Botanical Garden','Riverside Park','Central Commons'],
      water:    ['Harbor','Bay Front','Marina','River District'],
    };

    const blocks: BlockInfo[] = [];
    const allBuildingMeshes: THREE.Mesh[] = [];
    const blockMeshMap = new Map<THREE.Mesh, BlockInfo>();

    function getZone(col: number, row: number): ZoneType {
      const dist = Math.sqrt(col * col + row * row);
      if ((col === 2 && row === -2) || (col === -3 && row === 1) || (col === 1 && row === 3)) return 'park';
      if (row === -HALF || (row === -HALF + 1 && Math.abs(col) >= 3)) return 'water';
      if (dist <= 1.0) return 'downtown';
      if (dist <= 2.2) return 'midrise';
      if (dist <= 3.2) return 'mixed';
      return 'low';
    }

    const parkMat  = new THREE.MeshStandardMaterial({ color: '#C8D8C0', roughness: 0.95 });
    const waterMat = new THREE.MeshStandardMaterial({ color: '#4A90C8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82 });

    for (let row = -HALF; row <= HALF; row++) {
      for (let col = -HALF; col <= HALF; col++) {
        const cx = col * STEP;
        const cz = row * STEP;
        const zone = getZone(col, row);
        const labelPool = ZONE_LABELS[zone];
        const labelIdx  = ((Math.abs(col) * 7 + Math.abs(row) * 13) ^ (col < 0 ? 3 : 5)) % labelPool.length;
        const info: BlockInfo = { col, row, cx, cz, zone, label: labelPool[labelIdx] };
        blocks.push(info);

        const patchMat = zone === 'park'  ? parkMat
                       : zone === 'water' ? waterMat
                       : new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.9 });
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), patchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(cx, zone === 'water' ? -0.2 : 0.015, cz);
        patch.receiveShadow = true;
        cityGroup.add(patch);

        if (zone === 'park') {
          const rng = seededRandom(`park-${col}-${row}`);
          for (let t = 0; t < 12; t++) {
            const tx = cx + (rng() - 0.5) * (BLOCK_SIZE - 10);
            const tz = cz + (rng() - 0.5) * (BLOCK_SIZE - 10);
            cityGroup.add(makeTree(tx, tz, seededRandom(`pt-${t}-${col}-${row}`)));
          }
          continue;
        }
        if (zone === 'water') continue;

        const rng = seededRandom(`block-${col}-${row}`);
        const BUILD_AREA = BLOCK_SIZE - 8;

        type Arch = 'tower' | 'podiumTower' | 'midrise' | 'slab' | 'campus' | 'spire' | 'residential' | 'warehouse';
        type PlacementDef = { ox: number; oz: number; arch: Arch; hMult: number };
        let placements: PlacementDef[] = [];

        if (zone === 'downtown') {
          placements = [
            { ox: 0,   oz: 0,   arch: rng() > 0.5 ? 'podiumTower' : 'spire', hMult: 1.0 },
            { ox: -16, oz: -12, arch: 'tower',   hMult: 0.75 },
            { ox:  16, oz: -12, arch: 'tower',   hMult: 0.80 },
            { ox: -16, oz:  12, arch: 'tower',   hMult: 0.70 },
            { ox:  16, oz:  12, arch: 'midrise',  hMult: 0.65 },
            { ox:  0,  oz: -22, arch: 'midrise',  hMult: 0.60 },
            { ox:  0,  oz:  22, arch: 'midrise',  hMult: 0.55 },
            { ox: -22, oz:   0, arch: 'slab',     hMult: 0.50 },
            { ox:  22, oz:   0, arch: 'midrise',  hMult: 0.55 },
          ];
        } else if (zone === 'midrise') {
          placements = [
            { ox:   0, oz:   0, arch: 'midrise',  hMult: 0.85 },
            { ox: -14, oz: -10, arch: 'slab',     hMult: 0.70 },
            { ox:  14, oz: -10, arch: 'midrise',  hMult: 0.75 },
            { ox: -14, oz:  12, arch: 'midrise',  hMult: 0.65 },
            { ox:  14, oz:  12, arch: rng() > 0.5 ? 'campus' : 'midrise', hMult: 0.60 },
            { ox:   0, oz: -20, arch: 'slab',     hMult: 0.55 },
            { ox:   0, oz:  20, arch: 'midrise',  hMult: 0.50 },
          ];
        } else if (zone === 'mixed') {
          placements = [
            { ox:   0, oz:   0, arch: rng() > 0.5 ? 'campus' : 'midrise', hMult: 0.60 },
            { ox: -14, oz: -10, arch: 'residential', hMult: 0.55 },
            { ox:  14, oz: -10, arch: 'midrise',     hMult: 0.50 },
            { ox: -14, oz:  10, arch: 'residential', hMult: 0.45 },
            { ox:  14, oz:  10, arch: 'residential', hMult: 0.45 },
            { ox:   0, oz: -20, arch: 'slab',        hMult: 0.40 },
          ];
        } else {
          placements = [
            { ox:   0, oz:   0, arch: 'residential', hMult: 0.40 },
            { ox: -14, oz: -10, arch: 'residential', hMult: 0.35 },
            { ox:  14, oz: -10, arch: 'residential', hMult: 0.35 },
            { ox:  -6, oz:  14, arch: rng() > 0.6 ? 'warehouse' : 'residential', hMult: 0.30 },
            { ox:  12, oz:  14, arch: 'residential', hMult: 0.30 },
          ];
        }

        const H_RANGES: Record<ZoneType, [number, number]> = {
          downtown: [20, 48], midrise: [8, 18], mixed: [4, 11], low: [3, 7], park: [0, 0], water: [0, 0],
        };
        const [hMin, hMax] = H_RANGES[zone];

        for (const p of placements) {
          const jx = (rng() - 0.5) * 4;
          const jz = (rng() - 0.5) * 4;
          const wx = cx + p.ox + jx;
          const wz = cz + p.oz + jz;
          const halfBA = BUILD_AREA / 2;
          if (Math.abs(wx - cx) > halfBA - 6 || Math.abs(wz - cz) > halfBA - 6) continue;

          const h = hMin + (hMax - hMin) * rng() * p.hMult;

          // Store first placement's archetype for interior generation
          if (!blockArchetypeMapRef.current.has(`${col},${row}`)) {
            blockArchetypeMapRef.current.set(`${col},${row}`, { arch: p.arch, height: h });
          }

          let group: THREE.Group;
          switch (p.arch) {
            case 'tower':       group = createTower(wx, wz, h, mats); break;
            case 'podiumTower': group = createPodiumTower(wx, wz, h, mats); break;
            case 'midrise':     group = createMidrise(wx, wz, h, mats); break;
            case 'slab':        group = createSlab(wx, wz, h, mats); break;
            case 'campus':      group = createCampus(wx, wz, h, mats); break;
            case 'spire':       group = createSpire(wx, wz, h, mats); break;
            case 'residential': group = createResidential(wx, wz, h, mats); break;
            case 'warehouse':   group = createWarehouse(wx, wz, h, mats); break;
          }
          group.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
            }
          });
          cityGroup.add(group);
        }

        const treeRng = seededRandom(`trees-${col}-${row}`);
        for (let t = 0; t < 3; t++) {
          const edge = BUILD_AREA / 2 + 2;
          const side = treeRng() > 0.5 ? 1 : -1;
          const tx = cx + (treeRng() - 0.5) * BLOCK_SIZE * 0.7;
          const tz = cz + side * edge * 0.8;
          cityGroup.add(makeTree(tx, tz, seededRandom(`st-${t}-${col}-${row}`)));
        }
      }
    }

    // ── Orbit + Pan + Zoom ────────────────────────────────────────────────────
    let isDragging = false, isPanning = false;
    let lastX = 0, lastY = 0, clickStartX = 0, clickStartY = 0;
    const clickPt  = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    let selectedBlockState: BlockInfo | null = null;

    const onMouseDown = (e: MouseEvent) => {
      lastX = e.clientX; lastY = e.clientY;
      clickStartX = e.clientX; clickStartY = e.clientY;
      isDragging = true;
      isPanning  = e.button === 2 || e.button === 1;
    };
    canvas.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (isPanning && viewModeRef.current === 'city') {
        const panSpeed = orbitRadius * 0.0012;
        const right = new THREE.Vector3();
        right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0,1,0)).normalize();
        const fwd = new THREE.Vector3(-Math.sin(orbitTheta), 0, -Math.cos(orbitTheta));
        orbitTarget.addScaledVector(right, -dx * panSpeed);
        orbitTarget.addScaledVector(fwd,    dy * panSpeed);
        orbitTarget.y = 0;
      } else {
        orbitTheta += dx * 0.005;
      }
      updateCameraOrbit();
    };
    document.addEventListener('mousemove', onMouseMove);

    const onMouseUp = (e: MouseEvent) => {
      isDragging = false; isPanning = false;
      const moved = Math.abs(e.clientX - clickStartX) + Math.abs(e.clientY - clickStartY);
      if (e.button !== 0 || moved > 5) return;

      const rect = canvas.getBoundingClientRect();
      clickPt.set(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(clickPt, camera);

      if (viewModeRef.current === 'interior') {
        const hits = raycaster.intersectObjects(allInteriorMeshesRef.current, false);
        if (hits.length > 0) {
          const elem = hits[0].object.userData.interiorElement;
          if (elem) setInteriorSelection({ type: elem.type, label: elem.label });
        } else {
          setInteriorSelection(null);
        }
      } else {
        const hits = raycaster.intersectObjects(allBuildingMeshes, false);
        if (hits.length > 0) {
          const info = blockMeshMap.get(hits[0].object as THREE.Mesh) ?? null;
          selectedBlockState = info;
          setSelectedBlock(info);
        } else {
          selectedBlockState = null;
          setSelectedBlock(null);
        }
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (viewModeRef.current === 'interior') {
        orbitRadius = Math.max(4, Math.min(28, orbitRadius + e.deltaY * 0.06));
      } else {
        orbitRadius = Math.max(60, Math.min(500, orbitRadius + e.deltaY * 0.35));
      }
      updateCameraOrbit();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    let lastTouchDist = 0, lastTouchX = 0, lastTouchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx*dx + dy*dy);
      } else {
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (viewModeRef.current === 'interior') {
          orbitRadius = Math.max(4, Math.min(28, orbitRadius - (dist - lastTouchDist) * 0.3));
        } else {
          orbitRadius = Math.max(60, Math.min(500, orbitRadius - (dist - lastTouchDist) * 0.5));
        }
        lastTouchDist = dist;
      } else {
        const ddx = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        orbitTheta += ddx * 0.005;
      }
      void lastTouchY;
      updateCameraOrbit();
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas);

    // ── Minimap ───────────────────────────────────────────────────────────────
    if (mmCanvas) { mmCanvas.width = 160; mmCanvas.height = 160; }
    const mmCtx = mmCanvas?.getContext('2d') ?? null;
    const MM_SCALE = 72 / (HALF * STEP + STEP / 2);

    function drawMinimap() {
      if (!mmCtx) return;
      mmCtx.clearRect(0, 0, 160, 160);
      mmCtx.beginPath(); mmCtx.arc(80, 80, 78, 0, Math.PI * 2);
      mmCtx.fillStyle = 'rgba(0,0,0,0.7)'; mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(100,180,255,0.4)'; mmCtx.lineWidth = 2; mmCtx.stroke();
      mmCtx.save(); mmCtx.beginPath(); mmCtx.arc(80, 80, 78, 0, Math.PI * 2); mmCtx.clip();
      for (const b of blocks) {
        const bx = 80 + b.cx * MM_SCALE;
        const bz = 80 + b.cz * MM_SCALE;
        const bw = (BLOCK_SIZE - 2) * MM_SCALE;
        mmCtx.fillStyle = ZONE_COLORS[b.zone] + (b === selectedBlockState ? 'ff' : '80');
        mmCtx.fillRect(bx - bw / 2, bz - bw / 2, bw, bw);
        if (b === selectedBlockState) {
          mmCtx.strokeStyle = '#ffffff'; mmCtx.lineWidth = 1;
          mmCtx.strokeRect(bx - bw / 2, bz - bw / 2, bw, bw);
        }
      }
      const vx = 80 + orbitTarget.x * MM_SCALE;
      const vz = 80 + orbitTarget.z * MM_SCALE;
      mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 1.5;
      mmCtx.beginPath(); mmCtx.moveTo(vx - 5, vz); mmCtx.lineTo(vx + 5, vz); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(vx, vz - 5); mmCtx.lineTo(vx, vz + 5); mmCtx.stroke();
      mmCtx.fillStyle = 'rgba(255,255,255,0.65)';
      mmCtx.font = 'bold 9px system-ui'; mmCtx.textAlign = 'center';
      mmCtx.fillText('N', 80, 12);
      mmCtx.restore();
    }

    // ── Enter / Exit / Floor callbacks ────────────────────────────────────────
    enterBuildingCallbackRef.current = (block: BlockInfo) => {
      if (transitionRef.current.active) return;
      // Save current city camera before entering
      savedCityCameraRef.current = {
        radius: orbitRadius,
        theta:  orbitTheta,
        target: orbitTarget.clone(),
      };
      interiorBuildingRef.current = block;
      viewModeRef.current = 'interior';
      currentFloorRef.current = 0;
      transitionRef.current = { active: true, alpha: 0, direction: 1 };
      setViewMode('interior');
      setInteriorBuilding(block);
      setCurrentFloor(0);
      setSelectedBlock(null);
      setInteriorSelection(null);
    };

    exitBuildingCallbackRef.current = () => {
      if (transitionRef.current.active) return;
      viewModeRef.current = 'city';
      transitionRef.current = { active: true, alpha: 0, direction: 1 };
      setViewMode('city');
      setInteriorBuilding(null);
      setInteriorSelection(null);
    };

    changeFloorCallbackRef.current = (floor: number) => {
      if (transitionRef.current.active) return;
      currentFloorRef.current = floor;
      const block = interiorBuildingRef.current;
      if (block && interiorGroupRef.current) {
        const archData = blockArchetypeMapRef.current.get(`${block.col},${block.row}`);
        const nFloors = buildInteriorScene(
          interiorGroupRef.current, block,
          archData?.arch ?? 'midrise', archData?.height ?? 10,
          floor, allInteriorMeshesRef
        );
        setTotalFloors(nFloors);
        const onRoof = floor === nFloors - 1;
        sun.intensity  = onRoof ? 1.8 : 0.3;
        hemi.intensity = onRoof ? 2.0 : 1.4;
      }
      setCurrentFloor(floor);
      setInteriorSelection(null);
    };

    // ── Animate ───────────────────────────────────────────────────────────────
    let rafId = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);

      // Fade transition
      const tr = transitionRef.current;
      if (tr.active) {
        tr.alpha = Math.max(0, Math.min(1, tr.alpha + 0.055 * tr.direction));
        if (fadeOverlayRef.current) {
          fadeOverlayRef.current.style.opacity = String(tr.alpha);
        }

        if (tr.direction === 1 && tr.alpha >= 1) {
          tr.alpha = 1;
          if (viewModeRef.current === 'interior') {
            // Switch to interior
            cityGroup.visible = false;
            interiorGroup.visible = true;
            const block = interiorBuildingRef.current!;
            const archData = blockArchetypeMapRef.current.get(`${block.col},${block.row}`);
            const nFloors = buildInteriorScene(
              interiorGroup, block,
              archData?.arch ?? 'midrise', archData?.height ?? 10,
              currentFloorRef.current, allInteriorMeshesRef
            );
            setTotalFloors(nFloors);
            // Interior camera
            orbitRadius = 18;
            orbitPhi    = 1.25;
            orbitTarget.set(0, 2.0, 0);
            const isRoof = currentFloorRef.current === nFloors - 1;
            sun.intensity  = isRoof ? 1.8 : 0.3;
            hemi.intensity = isRoof ? 2.0 : 1.4;
            scene.fog = null;
          } else {
            // Restore city
            cityGroup.visible = true;
            interiorGroup.visible = false;
            const saved = savedCityCameraRef.current;
            orbitRadius = saved.radius;
            orbitTheta  = saved.theta;
            orbitPhi    = 1.08;
            orbitTarget.copy(saved.target);
            sun.intensity  = 2.5;
            hemi.intensity = 0.5;
            scene.fog = new THREE.FogExp2(0xe8f0f8, 0.0014);
          }
          updateCameraOrbit();
          tr.direction = -1;
        } else if (tr.direction === -1 && tr.alpha <= 0) {
          tr.alpha = 0;
          tr.active = false;
          if (fadeOverlayRef.current) fadeOverlayRef.current.style.opacity = '0';
        }
      }

      composer.render();
      if (viewModeRef.current === 'city') drawMinimap();
    }
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      composer.dispose();
      resizeObs.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={labelRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Fade overlay */}
      <div
        ref={fadeOverlayRef}
        style={{ position: 'absolute', inset: 0, background: '#F0F5FF', opacity: 0, pointerEvents: 'none', zIndex: 50 }}
      />

      {/* ── CITY MODE UI ── */}
      {viewMode === 'city' && (
        <>
          {/* Controls hint */}
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '5px 14px', color: '#64748b', fontSize: 11,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Drag to rotate · Scroll to zoom · Right-drag to pan · Click a block to inspect
          </div>

          {/* Selected block info */}
          {selectedBlock && (
            <div style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(10,15,30,0.92)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10, padding: '14px 18px', color: '#e2e8f0',
              backdropFilter: 'blur(12px)', minWidth: 190,
              animation: 'fadeIn 0.15s ease-out',
            }}>
              <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{selectedBlock.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: ZONE_COLORS[selectedBlock.zone] }} />
                <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>
                  {selectedBlock.zone} zone
                </span>
              </div>
              <button
                onClick={() => enterBuildingCallbackRef.current?.(selectedBlock)}
                style={{
                  width: '100%', padding: '7px 0',
                  background: 'rgba(80,140,220,0.18)', border: '1px solid rgba(100,160,240,0.35)',
                  borderRadius: 7, color: '#93c5fd', cursor: 'pointer', fontSize: 11,
                  fontWeight: 600, letterSpacing: '0.02em',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,140,220,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(80,140,220,0.18)')}
              >
                Enter Building →
              </button>
              <button
                onClick={() => setSelectedBlock(null)}
                style={{
                  position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
                  color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}
              >×</button>
            </div>
          )}

          {/* Minimap */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16, borderRadius: '50%', overflow: 'hidden',
            boxShadow: '0 0 0 2px rgba(100,180,255,0.3)', zIndex: 10,
          }}>
            <canvas ref={minimapRef} width={160} height={160} style={{ display: 'block' }} />
          </div>

          {/* Zone legend */}
          <div style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 12px', zIndex: 10, backdropFilter: 'blur(8px)',
          }}>
            {(['downtown','midrise','mixed','low','park','water'] as const).map(zone => (
              <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: ZONE_COLORS[zone], flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{zone}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── INTERIOR MODE UI ── */}
      {viewMode === 'interior' && (
        <>
          {/* Exit button */}
          <button
            onClick={() => exitBuildingCallbackRef.current?.()}
            style={{
              position: 'absolute', top: 16, left: 16, zIndex: 20,
              background: 'rgba(10,15,30,0.85)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, padding: '8px 14px', color: '#e2e8f0',
              cursor: 'pointer', fontSize: 12, backdropFilter: 'blur(8px)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,40,70,0.95)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(10,15,30,0.85)')}
          >
            ← Exit Building
          </button>

          {/* Building + floor label */}
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,15,30,0.75)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 18px', color: '#94a3b8', fontSize: 11,
            backdropFilter: 'blur(8px)', zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#c0d0e8', fontWeight: 600 }}>{interiorBuilding?.label}</span>
            <span style={{ margin: '0 6px' }}>·</span>
            Floor {currentFloor + 1} of {totalFloors}
          </div>

          {/* Floor selector */}
          {totalFloors > 1 && (
            <div style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', flexDirection: 'column', gap: 4, zIndex: 20,
              background: 'rgba(10,15,30,0.85)', borderRadius: 10, padding: '8px 6px',
              border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
              maxHeight: '60vh', overflowY: 'auto',
            }}>
              {Array.from({ length: totalFloors }, (_, i) => {
                const active = i === currentFloor;
                return (
                  <button
                    key={i}
                    onClick={() => changeFloorCallbackRef.current?.(i)}
                    style={{
                      width: 32, height: 26,
                      background: active ? 'rgba(80,140,220,0.3)' : 'transparent',
                      border: active ? '1px solid rgba(100,160,240,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 5, color: active ? '#c8ddff' : '#64748b',
                      fontSize: 10, cursor: 'pointer', fontWeight: active ? 700 : 400,
                    }}
                  >
                    {i === totalFloors - 1 ? 'Roof ⬆' : i + 1}
                  </button>
                );
              })}
            </div>
          )}

          {/* Interior selection tooltip */}
          {interiorSelection && (
            <div style={{
              position: 'absolute', top: 16, right: totalFloors > 1 ? 72 : 16, zIndex: 20,
              background: 'rgba(10,15,30,0.92)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10, padding: '12px 16px', color: '#e2e8f0',
              backdropFilter: 'blur(12px)', minWidth: 160,
              animation: 'fadeIn 0.12s ease-out',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{interiorSelection.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>
                {interiorSelection.type === 'desk'        && 'Workstation'}
                {interiorSelection.type === 'meetingRoom' && 'Meeting Space'}
                {interiorSelection.type === 'window'      && 'Exterior Window'}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                {interiorBuilding?.label} · Floor {currentFloor + 1}
              </div>
              <button
                onClick={() => setInteriorSelection(null)}
                style={{
                  position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
                  color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}
              >×</button>
            </div>
          )}

          {/* Controls hint */}
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '5px 14px', color: '#64748b', fontSize: 11,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Drag to look around · Scroll to zoom · Click to inspect · Use floor buttons to navigate
          </div>
        </>
      )}
    </div>
  );
}
