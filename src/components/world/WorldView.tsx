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

function makeBuildingTexture(type: 'curtain' | 'strip' | 'residential' | 'warehouse' | 'campus'): THREE.CanvasTexture {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  if (type === 'curtain') {
    ctx.fillStyle = '#0E1820'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#28384E'; ctx.lineWidth = 1.5;
    for (let x = 0; x <= W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let y = 2; y < H; y += 20) for (let x = 2; x < W; x += 16) {
      ctx.fillStyle = `rgba(80,140,210,${0.04 + Math.random() * 0.10})`; ctx.fillRect(x, y, 12, 16);
    }
  } else if (type === 'strip') {
    ctx.fillStyle = '#C2B8A8'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.04})`; ctx.fillRect(Math.random()*W, Math.random()*H, 2, 1); }
    for (let y = 14; y < H; y += 22) {
      ctx.fillStyle = '#18243A'; ctx.fillRect(8, y, W - 16, 12);
      ctx.fillStyle = '#243448';
      for (let x = 8; x < W - 16; x += 20) ctx.fillRect(x + 18, y, 2, 12);
    }
  } else if (type === 'residential') {
    ctx.fillStyle = '#D0C49C'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.03})`; ctx.fillRect(Math.random()*W, Math.random()*H, 3, 2); }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) {
      const wx = col * 40 + 12, wy = row * 34 + 12;
      ctx.fillStyle = '#141C28'; ctx.fillRect(wx, wy, 18, 22);
      ctx.strokeStyle = '#C0B088'; ctx.lineWidth = 1.5; ctx.strokeRect(wx - 2, wy - 2, 22, 26);
      ctx.fillStyle = '#B09870'; ctx.fillRect(wx - 3, wy + 21, 24, 3);
    }
  } else if (type === 'warehouse') {
    ctx.fillStyle = '#8C9298'; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 6) { ctx.fillStyle = x % 12 === 0 ? '#788088' : '#929A9E'; ctx.fillRect(x, 0, 3, H); }
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(90,50,30,0.12)'; ctx.fillRect(Math.random()*W, 0, 2, H); }
    ctx.fillStyle = '#606870'; ctx.fillRect(28, H - 68, 46, 66);
    for (let y = H - 68; y < H; y += 10) { ctx.fillStyle = '#4A5058'; ctx.fillRect(28, y, 46, 2); }
  } else {
    ctx.fillStyle = '#141E2E'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2A3C54'; ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let y = 2; y < H; y += 16) for (let x = 2; x < W; x += 22) {
      ctx.fillStyle = `rgba(50,110,170,${0.06 + Math.random() * 0.12})`; ctx.fillRect(x, y, 18, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeArchSpecificMats(arch: string): ArchMats {
  const base = makeArchMats();
  switch (arch) {
    case 'tower': case 'spire': case 'podiumTower': {
      const tex = makeBuildingTexture('curtain'); tex.repeat.set(0.6, 1.2);
      base.main  = new THREE.MeshStandardMaterial({ map: tex, color: '#C8DCF0', roughness: 0.22, metalness: 0.38 });
      base.glass = new THREE.MeshStandardMaterial({ color: '#88C0E8', roughness: 0.02, metalness: 0.45, transparent: true, opacity: 0.65 });
      break;
    }
    case 'slab': {
      const tex = makeBuildingTexture('strip'); tex.repeat.set(0.5, 0.8);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.90 });
      break;
    }
    case 'residential': {
      const tex = makeBuildingTexture('residential'); tex.repeat.set(0.5, 0.8);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      base.alt  = new THREE.MeshStandardMaterial({ map: tex, color: '#E8DCBC', roughness: 0.90 });
      break;
    }
    case 'warehouse': {
      const tex = makeBuildingTexture('warehouse'); tex.repeat.set(1, 0.6);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0.18 });
      base.alt  = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0.18 });
      break;
    }
    case 'midrise': case 'campus': {
      const tex = makeBuildingTexture('campus'); tex.repeat.set(0.5, 1.0);
      base.main = new THREE.MeshStandardMaterial({ map: tex, color: '#BED4EE', roughness: 0.40, metalness: 0.22 });
      break;
    }
  }
  return base;
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

// ─── BYU STADIUM ──────────────────────────────────────────────────────────────

function createStadium(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const byuBlue  = new THREE.MeshStandardMaterial({ color: '#002E5D', roughness: 0.82 });
  const byuWhite = new THREE.MeshStandardMaterial({ color: '#E8EEF4', roughness: 0.80 });
  const fieldMat = new THREE.MeshStandardMaterial({ color: '#2A6630', roughness: 0.90 });
  const ezMat    = new THREE.MeshStandardMaterial({ color: '#1A3E70', roughness: 0.90 });
  const boardMat = new THREE.MeshStandardMaterial({ color: '#080E18', roughness: 0.85 });

  const box = (w: number, h: number, d: number, mat: THREE.MeshStandardMaterial, px = 0, py = 0, pz = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(px, py, pz); m.rotation.x = rx; m.rotation.z = rz;
    m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };

  // Playing field
  const field = new THREE.Mesh(new THREE.PlaneGeometry(28, 15), fieldMat);
  field.rotation.x = -Math.PI / 2; field.position.y = 0.3;
  field.receiveShadow = true; g.add(field);
  // Yard lines
  for (let i = -12; i <= 12; i += 2.33) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 15),
      new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7 }));
    ln.rotation.x = -Math.PI / 2; ln.position.set(i, 0.32, 0); g.add(ln);
  }
  // End zones
  const ez1 = new THREE.Mesh(new THREE.PlaneGeometry(3, 15), ezMat);
  ez1.rotation.x = -Math.PI / 2; ez1.position.set(-14.5, 0.31, 0); g.add(ez1);
  const ez2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 15), ezMat.clone());
  ez2.rotation.x = -Math.PI / 2; ez2.position.set(14.5, 0.31, 0); g.add(ez2);

  // Lower seating tiers (4 sides, angled toward field)
  box(36, 2.5, 4.5, byuBlue,   0,  1.2, -11.5, 0.30,  0);   // north
  box(36, 2.5, 4.5, byuBlue,   0,  1.2,  11.5, -0.30, 0);   // south
  box( 4.5, 2.5, 23, byuBlue,  17.5, 1.2, 0,   0,  0.30);  // east
  box( 4.5, 2.5, 23, byuBlue, -17.5, 1.2, 0,   0, -0.30);  // west

  // Upper seating tiers
  box(38, 3, 5.5, byuBlue,   0, 4.0, -15.5, 0.35,  0);   // north
  box(38, 3, 5.5, byuBlue,   0, 4.0,  15.5, -0.35, 0);   // south
  box( 5.5, 3, 27, byuBlue,  21.5, 4.0, 0,  0,  0.35);  // east
  box( 5.5, 3, 27, byuBlue, -21.5, 4.0, 0,  0, -0.35); // west

  // White rim at top of upper tier
  box(40, 0.35, 0.5, byuWhite,  0, 5.8, -18.5); // north rim
  box(40, 0.35, 0.5, byuWhite,  0, 5.8,  18.5); // south rim
  box( 0.5, 0.35, 30, byuWhite,  24, 5.8, 0);   // east rim
  box( 0.5, 0.35, 30, byuWhite, -24, 5.8, 0);   // west rim

  // Corner concourse fills (plug the gaps between stands)
  for (const [cx2, cz2] of [[-20,-14],[20,-14],[-20,14],[20,14]] as [number,number][]) {
    box(8, 5, 8, byuBlue, cx2, 2.5, cz2);
  }

  // Light towers (4 corners)
  for (const [lx, lz] of [[-23,-17],[23,-17],[-23,17],[23,17]] as [number,number][]) {
    box(0.5, 16, 0.5, byuWhite, lx, 8,  lz); // pole
    box(3.0, 0.4, 0.4, byuWhite, lx, 15.5, lz); // arm
  }

  // Scoreboard (north end, behind end zone)
  box(0.5, 10, 0.5, byuWhite, 0, 5, -20); // pole
  box(9, 4.5, 0.6, boardMat,  0, 10, -20); // screen
  box(9.6, 0.4, 0.8, byuWhite, 0, 12.5, -20); // top trim

  // Goal posts (2 end zones)
  for (const gpx of [-16, 16]) {
    box(0.2, 4, 0.2, byuWhite, gpx, 4.5, 0);
    box(5.5, 0.2, 0.2, byuWhite, gpx, 6.5, 0);
    box(0.2, 1.8, 0.2, byuWhite, gpx - 2.5, 5.6, 0);
    box(0.2, 1.8, 0.2, byuWhite, gpx + 2.5, 5.6, 0);
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

// ─── TIME OF DAY ──────────────────────────────────────────────────────────────

interface SkyConfig {
  zenith: string; horizon: string; fogColor: number; fogDensity: number;
  sunIntensity: number; hemiIntensity: number;
  sunX: number; sunY: number; sunZ: number;
}

function getSkyConfig(_hour: number): SkyConfig {
  // Always bright midday
  return {
    zenith: '#7BB8D4', horizon: '#E8F0F8',
    fogColor: 0xE8F0F8, fogDensity: 0.0014,
    sunIntensity: 2.6, hemiIntensity: 0.65,
    sunX: 0, sunY: 200, sunZ: -120,
  };
}

// ─── FLOOR PLAN DIAGRAM ───────────────────────────────────────────────────────

function drawFloorPlan(ctx: CanvasRenderingContext2D, arch: string, zoneColor: string) {
  const W = 158, H = 80;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#080E1A'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = zoneColor + '99'; ctx.lineWidth = 1.5;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.strokeStyle = zoneColor + '55'; ctx.lineWidth = 1;
  if (arch === 'tower' || arch === 'spire') {
    // Central elevator core
    const cw = W * 0.28, ch = H * 0.38;
    ctx.strokeRect((W - cw) / 2, (H - ch) / 2, cw, ch);
    // Corner rooms
    ctx.strokeRect(3, 3, W*0.3, H*0.35);
    ctx.strokeRect(W - W*0.3 - 3, 3, W*0.3, H*0.35);
    ctx.strokeRect(3, H - H*0.35 - 3, W*0.3, H*0.35);
    ctx.strokeRect(W - W*0.3 - 3, H - H*0.35 - 3, W*0.3, H*0.35);
  } else if (arch === 'slab') {
    // Long row of offices with central corridor
    ctx.beginPath(); ctx.moveTo(3, H/2); ctx.lineTo(W-3, H/2); ctx.stroke();
    for (let i = 1; i < 5; i++) { const x = 3 + (W-6) * i / 5; ctx.beginPath(); ctx.moveTo(x, 3); ctx.lineTo(x, H-3); ctx.stroke(); }
  } else if (arch === 'warehouse') {
    // 2 large bays + loading dock
    ctx.beginPath(); ctx.moveTo(W/2, 3); ctx.lineTo(W/2, H-3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, H-20); ctx.lineTo(W-3, H-20); ctx.stroke();
    for (let i = 0; i < 4; i++) { const x = 3 + (W-6) * i / 4; ctx.strokeRect(x + 2, H-18, (W-6)/4 - 4, 14); }
  } else if (arch === 'residential') {
    // 2x2 unit grid
    ctx.beginPath(); ctx.moveTo(W/2, 3); ctx.lineTo(W/2, H-3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, H/2); ctx.lineTo(W-3, H/2); ctx.stroke();
    // Small windows in each unit
    [[W*0.25-4, H*0.25-3],[W*0.75-4, H*0.25-3],[W*0.25-4, H*0.75-3],[W*0.75-4, H*0.75-3]].forEach(([x,y]) => ctx.strokeRect(x, y, 8, 6));
  } else if (arch === 'campus') {
    // 3 buildings
    ctx.strokeRect(3, 3, W*0.3, H-6);
    ctx.strokeRect(W*0.35, 3, W*0.3, H*0.55);
    ctx.strokeRect(W*0.7, 3, W*0.27, H-6);
  } else {
    // midrise / default: 2 rooms + corridor
    ctx.beginPath(); ctx.moveTo(3, H*0.45); ctx.lineTo(W-3, H*0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, H*0.55); ctx.lineTo(W-3, H*0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2, 3); ctx.lineTo(W/2, H*0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2, H*0.55); ctx.lineTo(W/2, H-3); ctx.stroke();
  }
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface WorldViewProps {
  contactTags?: Array<{ name: string; color: string }>;
  districtTagMap?: Record<string, string>;
  onDistrictTagMapChange?: (map: Record<string, string>) => void;
}

export function WorldView({ contactTags, districtTagMap, onDistrictTagMapChange }: WorldViewProps = {}) {
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

  // Time-of-day baseline (so exiting interior restores correct values)
  const cityLightRef   = useRef({ sunI: 2.5, hemiI: 0.5, fogColor: 0xe8f0f8, fogDensity: 0.0014 });
  // Minimap teleport target (lerped each frame)
  const minimapPanRef  = useRef<THREE.Vector3 | null>(null);
  // Minimap pulse on teleport click
  const mmPulseRef     = useRef<{ px: number; pz: number; t: number } | null>(null);
  // Bird's eye fly-to target
  const birdEyeTargetRef = useRef<{ phi: number; radius: number } | null>(null);
  // Floor plan canvas ref (building info card)
  const floorPlanRef   = useRef<HTMLCanvasElement>(null);

  // District HUD
  const [districtLabel, setDistrictLabel] = useState<string | null>(null);
  const districtLabelRef = useRef<string | null>(null);

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

    // Night light meshes (populated during building loop)
    const nightLightMeshes: THREE.Mesh[] = [];
    const nightAmbient = new THREE.PointLight('#FF9030', 0, 700);
    nightAmbient.position.set(0, 50, 0);
    scene.add(nightAmbient);

    // ── Time of day ───────────────────────────────────────────────────────────
    function applyTimeOfDay() {
      const now = new Date();
      const cfg = getSkyConfig(now.getHours() + now.getMinutes() / 60);
      skyMat.uniforms.uHorizon.value.set(cfg.horizon);
      skyMat.uniforms.uZenith.value.set(cfg.zenith);
      skyMat.uniforms.uSunDir.value.set(cfg.sunX, cfg.sunY, cfg.sunZ).normalize();
      sun.position.set(cfg.sunX, cfg.sunY, cfg.sunZ);
      sun.intensity  = cfg.sunIntensity;
      hemi.intensity = cfg.hemiIntensity;
      scene.fog      = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
      cityLightRef.current = { sunI: cfg.sunIntensity, hemiI: cfg.hemiIntensity, fogColor: cfg.fogColor, fogDensity: cfg.fogDensity };
      // Night lights always off (always daytime)
      for (const m of nightLightMeshes) m.visible = false;
      nightAmbient.intensity = 0;
    }
    applyTimeOfDay();
    const todInterval = setInterval(applyTimeOfDay, 60_000);

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

    // ── Materials (shared, cloned per building) ───────────────────────────────
    const mats = makeArchMats();

    // ── City grid parameters ───────────────────────────────────────────────────
    const GRID_N    = 13;
    const BLOCK_SIZE = 50;
    const STEP       = 58;
    const HALF       = Math.floor(GRID_N / 2);

    // Road: asphalt grain canvas texture
    const roadCanvas = document.createElement('canvas'); roadCanvas.width = roadCanvas.height = 128;
    const rCtx = roadCanvas.getContext('2d')!;
    rCtx.fillStyle = '#1A1A1C'; rCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1200; i++) { rCtx.fillStyle = `rgba(255,255,255,${Math.random()*0.04})`; rCtx.fillRect(Math.random()*128, Math.random()*128, 1+Math.random(), 1); }
    for (let i = 0; i < 200; i++)  { rCtx.fillStyle = `rgba(0,0,0,${Math.random()*0.08})`; rCtx.fillRect(Math.random()*128, Math.random()*128, 3, 2); }
    const roadTex = new THREE.CanvasTexture(roadCanvas); roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(4, 4);
    const roadMat  = new THREE.MeshStandardMaterial({ map: roadTex, color: '#1C1C1E', roughness: 0.97 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#D8DDE3', roughness: 0.90 });
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#F5E642', roughness: 0.60 });

    const ROAD_W = 6;
    const GRID_EXTENT = HALF * STEP + STEP / 2;

    // ── Island terrain (ocean → beach → foam → city ground) ──────────────────
    // Water shader (declared early so ocean can reuse it; same ref used for city water blocks below)
    const waterShaderMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main() {
          float w = sin(vUv.x*8.0 + uTime*0.9) * sin(vUv.y*6.0 + uTime*0.7) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.22,0.44,0.62), vec3(0.35,0.62,0.80), w);
          gl_FragColor = vec4(c, 0.82 + w*0.06);
        }`,
    });

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), waterShaderMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.2;
    cityGroup.add(ocean);

    const beachMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float n = noise(vUv*18.0)*0.5 + noise(vUv*42.0)*0.25 + noise(vUv*90.0)*0.15;
          vec3 sand = mix(vec3(0.72,0.58,0.34), vec3(0.84,0.72,0.48), n);
          gl_FragColor = vec4(sand, 1.0);
        }`,
    });
    const beach = new THREE.Mesh(new THREE.RingGeometry(GRID_EXTENT - 24, GRID_EXTENT + 130, 80), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = -0.05;
    beach.receiveShadow = true;
    cityGroup.add(beach);

    const foamMat = new THREE.MeshStandardMaterial({ color: '#F0EEE8', roughness: 0.9, transparent: true, opacity: 0.65 });
    const foam = new THREE.Mesh(new THREE.RingGeometry(GRID_EXTENT + 118, GRID_EXTENT + 132, 80), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = -0.04;
    cityGroup.add(foam);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(GRID_EXTENT + 12, 80),
      new THREE.MeshStandardMaterial({ color: '#D0C8B8', roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    // ── Roads (connected: segmented sidewalks, clean intersections) ───────────
    const roadXs: number[] = [];
    const roadZs: number[] = [];
    for (let i = 0; i <= GRID_N; i++) {
      roadXs.push((-HALF - 0.5 + i) * STEP);
      roadZs.push((-HALF - 0.5 + i) * STEP);
    }

    // Vertical roads
    for (const xPos of roadXs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, GRID_EXTENT * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(xPos, 0.01, 0);
      road.receiveShadow = true;
      cityGroup.add(road);
      // Segmented sidewalks between intersections
      for (let s = 0; s < roadZs.length - 1; s++) {
        const zStart = roadZs[s]   + ROAD_W / 2 + 0.15;
        const zEnd   = roadZs[s+1] - ROAD_W / 2 - 0.15;
        const segLen = zEnd - zStart;
        if (segLen <= 0) continue;
        const zMid = (zStart + zEnd) / 2;
        for (const side of [-1, 1]) {
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, segLen), swalkMat);
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(xPos + side * (ROAD_W / 2 + 0.8), 0.012, zMid);
          sw.receiveShadow = true;
          cityGroup.add(sw);
        }
      }
      // Dashes — skip near intersections
      for (let dz = -GRID_EXTENT + 3; dz < GRID_EXTENT; dz += 6) {
        if (roadZs.some(rz => Math.abs(dz - rz) < ROAD_W)) continue;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(xPos, 0.016, dz);
        cityGroup.add(d);
      }
    }

    // Horizontal roads
    for (const zPos of roadZs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, zPos);
      road.receiveShadow = true;
      cityGroup.add(road);
      // Segmented sidewalks between intersections
      for (let s = 0; s < roadXs.length - 1; s++) {
        const xStart = roadXs[s]   + ROAD_W / 2 + 0.15;
        const xEnd   = roadXs[s+1] - ROAD_W / 2 - 0.15;
        const segLen = xEnd - xStart;
        if (segLen <= 0) continue;
        const xMid = (xStart + xEnd) / 2;
        for (const side of [-1, 1]) {
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(segLen, 1.6), swalkMat);
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(xMid, 0.012, zPos + side * (ROAD_W / 2 + 0.8));
          sw.receiveShadow = true;
          cityGroup.add(sw);
        }
      }
      // Dashes — skip near intersections
      for (let dx = -GRID_EXTENT + 3; dx < GRID_EXTENT; dx += 6) {
        if (roadXs.some(rx => Math.abs(dx - rx) < ROAD_W)) continue;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(dx, 0.016, zPos);
        cityGroup.add(d);
      }
    }

    // Intersection fill squares (clean asphalt at every crossing)
    for (const xPos of roadXs) {
      for (const zPos of roadZs) {
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_W), roadMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(xPos, 0.013, zPos);
        cityGroup.add(fill);
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
    const waterMat = waterShaderMat;  // reuse the shared animated shader

    for (let row = -HALF; row <= HALF; row++) {
      for (let col = -HALF; col <= HALF; col++) {
        const cx = col * STEP;
        const cz = row * STEP;
        const zone = getZone(col, row);
        const isBYU = col === 2 && row === 2;
        const labelPool = ZONE_LABELS[zone];
        const labelIdx  = ((Math.abs(col) * 7 + Math.abs(row) * 13) ^ (col < 0 ? 3 : 5)) % labelPool.length;
        const label = isBYU ? 'BYU Campus' : labelPool[labelIdx];
        const info: BlockInfo = { col, row, cx, cz, zone, label };
        blocks.push(info);

        const patchMat = isBYU        ? new THREE.MeshStandardMaterial({ color: '#2A5C30', roughness: 0.90 })
                       : zone === 'park'  ? parkMat
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

        // BYU Campus — spawn stadium instead of regular buildings
        if (isBYU) {
          const stadium = createStadium(cx, cz);
          stadium.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
            }
          });
          cityGroup.add(stadium);
          continue;
        }

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
          const am = makeArchSpecificMats(p.arch);
          switch (p.arch) {
            case 'tower':       group = createTower(wx, wz, h, am); break;
            case 'podiumTower': group = createPodiumTower(wx, wz, h, am); break;
            case 'midrise':     group = createMidrise(wx, wz, h, am); break;
            case 'slab':        group = createSlab(wx, wz, h, am); break;
            case 'campus':      group = createCampus(wx, wz, h, am); break;
            case 'spire':       group = createSpire(wx, wz, h, am); break;
            case 'residential': group = createResidential(wx, wz, h, am); break;
            case 'warehouse':   group = createWarehouse(wx, wz, h, am); break;
          }
          group.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
            }
          });
          cityGroup.add(group);

          // Night window lights (NYC-style scattered lit windows)
          const archH = blockArchetypeMapRef.current.get(`${col},${row}`)?.height ?? 6;
          const nlW = p.arch === 'slab' ? 16 : p.arch === 'warehouse' ? 18 : 8;
          const nlD = p.arch === 'slab' ? 7  : p.arch === 'warehouse' ? 12 : 8;
          const nlRng = seededRandom(`nl-${p.arch}-${col}-${row}`);
          const nlN = 8 + Math.floor(nlRng() * 14);
          const nlColors = ['#FFE88A', '#FFD060', '#FFF0B0', '#FFE0A0', '#E8F0FF', '#FFDCA0'];
          for (let li = 0; li < nlN; li++) {
            const side = Math.floor(nlRng() * 4);
            const wy = 0.8 + nlRng() * Math.max(1, archH - 1.5);
            let wx = 0, wz = 0, rotY = 0;
            if (side === 0) { wx = (nlRng()-0.5)*nlW*0.8; wz = nlD/2+0.06; rotY = 0; }
            else if (side === 1) { wx = (nlRng()-0.5)*nlW*0.8; wz = -nlD/2-0.06; rotY = Math.PI; }
            else if (side === 2) { wx = nlW/2+0.06; wz = (nlRng()-0.5)*nlD*0.8; rotY = Math.PI/2; }
            else { wx = -nlW/2-0.06; wz = (nlRng()-0.5)*nlD*0.8; rotY = -Math.PI/2; }
            const nlM = new THREE.Mesh(
              new THREE.PlaneGeometry(0.52, 0.42),
              new THREE.MeshBasicMaterial({ color: nlColors[Math.floor(nlRng()*nlColors.length)], transparent: true, opacity: 0.88 })
            );
            nlM.position.set(cx + wx, wy, cz + wz);
            nlM.rotation.y = rotY;
            nlM.visible = false;
            cityGroup.add(nlM);
            nightLightMeshes.push(nlM);
          }
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

    // Night lights always off (always daytime)
    for (const m of nightLightMeshes) m.visible = false;
    nightAmbient.intensity = 0;

    // ── Orbit + Pan + Zoom ────────────────────────────────────────────────────
    let isDragging = false, isPanning = false;
    let lastX = 0, lastY = 0, clickStartX = 0, clickStartY = 0;
    const clickPt  = new THREE.Vector2();
    const raycaster     = new THREE.Raycaster();
    const hoverRaycaster = new THREE.Raycaster();
    const zoomRaycaster  = new THREE.Raycaster();
    const zoomPlane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let selectedBlockState: BlockInfo | null = null;
    let hoveredBlock: BlockInfo | null = null;
    const hoveredMeshes: THREE.Mesh[] = [];
    let zoomVelocity = 0;

    const onMouseDown = (e: MouseEvent) => {
      lastX = e.clientX; lastY = e.clientY;
      clickStartX = e.clientX; clickStartY = e.clientY;
      isDragging = true;
      isPanning  = e.button === 2 || e.button === 1;
    };
    canvas.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
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
      } else if (viewModeRef.current === 'city') {
        // Hover highlight
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        hoverRaycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const hits = hoverRaycaster.intersectObjects(allBuildingMeshes, false);
        const newBlock = hits.length > 0 ? (blockMeshMap.get(hits[0].object as THREE.Mesh) ?? null) : null;
        if (newBlock !== hoveredBlock) {
          for (const m of hoveredMeshes) (m.material as THREE.MeshStandardMaterial).emissive?.setHex(0x000000);
          hoveredMeshes.length = 0;
          hoveredBlock = newBlock;
          if (newBlock) {
            for (const [mesh, info] of blockMeshMap) {
              if (info === newBlock) {
                (mesh.material as THREE.MeshStandardMaterial).emissive?.setHex(0x1A2A3A);
                hoveredMeshes.push(mesh);
              }
            }
          }
        }
        canvas.style.cursor = newBlock ? 'pointer' : 'default';
      }
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
        updateCameraOrbit();
      } else {
        // Smooth zoom easing via velocity
        zoomVelocity += e.deltaY * 0.35;
        // Zoom-to-cursor: move orbit target toward world point under mouse
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width * 2 - 1;
        const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        zoomRaycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
        const worldPt = new THREE.Vector3();
        if (zoomRaycaster.ray.intersectPlane(zoomPlane, worldPt)) {
          const t = Math.abs(e.deltaY * 0.35) / Math.max(orbitRadius, 1) * 0.55;
          orbitTarget.lerp(worldPt, e.deltaY < 0 ? t : -t * 0.3);
          orbitTarget.y = 0;
        }
      }
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
      // Pulse ring on teleport
      const pulse = mmPulseRef.current;
      if (pulse) {
        const pr = (1 - pulse.t) * 32;
        mmCtx.beginPath(); mmCtx.arc(pulse.px, pulse.pz, pr, 0, Math.PI * 2);
        mmCtx.strokeStyle = `rgba(255,255,255,${pulse.t * 0.9})`; mmCtx.lineWidth = 1.5; mmCtx.stroke();
        pulse.t -= 0.04;
        if (pulse.t <= 0) mmPulseRef.current = null;
      }
      mmCtx.restore();
    }

    // ── Minimap click-to-teleport ─────────────────────────────────────────────
    const onMinimapClick = (e: MouseEvent) => {
      if (viewModeRef.current !== 'city') return;
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const wx = (e.clientX - rect.left - 80) / MM_SCALE;
      const wz = (e.clientY - rect.top  - 80) / MM_SCALE;
      const bound = HALF * STEP + 10;
      minimapPanRef.current = new THREE.Vector3(
        Math.max(-bound, Math.min(bound, wx)),
        0,
        Math.max(-bound, Math.min(bound, wz)),
      );
      // Pulse ring at clicked pixel
      mmPulseRef.current = { px: e.clientX - rect.left, pz: e.clientY - rect.top, t: 1.0 };
    };
    mmCanvas?.addEventListener('click', onMinimapClick);

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
        const bHeight = archData?.height ?? 10;
        sun.intensity  = onRoof ? 1.8 : 0.3;
        hemi.intensity = onRoof ? 2.0 : 1.4;
        if (onRoof) {
          cityGroup.visible = true;
          interiorGroupRef.current.position.set(block.cx, bHeight, block.cz);
          orbitRadius = 60;
          orbitPhi    = 1.05;
          orbitTarget.set(block.cx, bHeight + 1.5, block.cz);
          scene.fog = new THREE.FogExp2(0xe8f0f8, 0.0014);
        } else {
          cityGroup.visible = false;
          interiorGroupRef.current.position.set(0, 0, 0);
          orbitRadius = 18;
          orbitPhi    = 1.25;
          orbitTarget.set(0, 2.0, 0);
          scene.fog = null;
        }
        updateCameraOrbit();
      }
      setCurrentFloor(floor);
      setInteriorSelection(null);
    };

    // ── Animate ───────────────────────────────────────────────────────────────
    let rafId = 0;
    let frameCount = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      frameCount++;

      // Bloom intensity by time of day (update every ~45s; bloom is always initialized here)
      if (frameCount % 2700 === 1) {
        const hr = new Date().getHours() + new Date().getMinutes() / 60;
        bloom.intensity = hr < 6 || hr >= 18 ? 1.2 : 0.12;
      }

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
            const block = interiorBuildingRef.current!;
            const archData = blockArchetypeMapRef.current.get(`${block.col},${block.row}`);
            const nFloors = buildInteriorScene(
              interiorGroup, block,
              archData?.arch ?? 'midrise', archData?.height ?? 10,
              currentFloorRef.current, allInteriorMeshesRef
            );
            setTotalFloors(nFloors);
            const isRoof = currentFloorRef.current === nFloors - 1;
            const bHeight = archData?.height ?? 10;
            sun.intensity  = isRoof ? 1.8 : 0.3;
            hemi.intensity = isRoof ? 2.0 : 1.4;
            if (isRoof) {
              // Rooftop: show real city below, position garden on top of building
              cityGroup.visible = true;
              interiorGroup.visible = true;
              interiorGroup.position.set(block.cx, bHeight, block.cz);
              orbitRadius = 60;
              orbitPhi    = 1.05;
              orbitTarget.set(block.cx, bHeight + 1.5, block.cz);
              scene.fog = new THREE.FogExp2(0xe8f0f8, 0.0014);
            } else {
              cityGroup.visible = false;
              interiorGroup.visible = true;
              interiorGroup.position.set(0, 0, 0);
              orbitRadius = 18;
              orbitPhi    = 1.25;
              orbitTarget.set(0, 2.0, 0);
              scene.fog = null;
            }
          } else {
            // Restore city
            cityGroup.visible = true;
            interiorGroup.visible = false;
            interiorGroup.position.set(0, 0, 0);
            const saved = savedCityCameraRef.current;
            orbitRadius = saved.radius;
            orbitTheta  = saved.theta;
            orbitPhi    = 1.08;
            orbitTarget.copy(saved.target);
            sun.intensity  = cityLightRef.current.sunI;
            hemi.intensity = cityLightRef.current.hemiI;
            scene.fog      = new THREE.FogExp2(cityLightRef.current.fogColor, cityLightRef.current.fogDensity);
          }
          updateCameraOrbit();
          tr.direction = -1;
        } else if (tr.direction === -1 && tr.alpha <= 0) {
          tr.alpha = 0;
          tr.active = false;
          if (fadeOverlayRef.current) fadeOverlayRef.current.style.opacity = '0';
        }
      }

      // Minimap teleport pan
      if (minimapPanRef.current && viewModeRef.current === 'city') {
        orbitTarget.lerp(minimapPanRef.current, 0.10);
        if (orbitTarget.distanceTo(minimapPanRef.current) < 0.8) {
          orbitTarget.copy(minimapPanRef.current);
          minimapPanRef.current = null;
        }
        updateCameraOrbit();
      }

      // Smooth zoom easing (city only)
      if (viewModeRef.current === 'city' && Math.abs(zoomVelocity) > 0.05) {
        const prev = orbitRadius;
        orbitRadius = Math.max(60, Math.min(500, orbitRadius + zoomVelocity));
        if (orbitRadius === prev) zoomVelocity = 0;
        zoomVelocity *= 0.82;
        updateCameraOrbit();
      }

      // Bird's eye fly-to
      if (birdEyeTargetRef.current && viewModeRef.current === 'city') {
        orbitPhi    = orbitPhi    * 0.88 + birdEyeTargetRef.current.phi    * 0.12;
        orbitRadius = orbitRadius * 0.88 + birdEyeTargetRef.current.radius * 0.12;
        if (Math.abs(orbitPhi - birdEyeTargetRef.current.phi) < 0.002 &&
            Math.abs(orbitRadius - birdEyeTargetRef.current.radius) < 0.5) {
          orbitPhi    = birdEyeTargetRef.current.phi;
          orbitRadius = birdEyeTargetRef.current.radius;
          birdEyeTargetRef.current = null;
        }
        updateCameraOrbit();
      }

      // Water animation
      waterShaderMat.uniforms.uTime.value += 0.012;

      // District name HUD (every 45 frames)
      if (frameCount % 45 === 0 && viewModeRef.current === 'city') {
        let nearest: BlockInfo | null = null, minD = Infinity;
        for (const b of blocks) {
          const d = Math.hypot(b.cx - orbitTarget.x, b.cz - orbitTarget.z);
          if (d < minD) { minD = d; nearest = b; }
        }
        const lbl = nearest ? nearest.label : null;
        if (lbl !== districtLabelRef.current) {
          districtLabelRef.current = lbl;
          setDistrictLabel(lbl);
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
      mmCanvas?.removeEventListener('click', onMinimapClick);
      clearInterval(todInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw floor plan when selected building changes
  useEffect(() => {
    if (!selectedBlock || !floorPlanRef.current) return;
    const ctx = floorPlanRef.current.getContext('2d');
    if (!ctx) return;
    const archData = blockArchetypeMapRef.current.get(`${selectedBlock.col},${selectedBlock.row}`);
    drawFloorPlan(ctx, archData?.arch ?? 'midrise', ZONE_COLORS[selectedBlock.zone]);
  }, [selectedBlock]);

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
          <style>{`
            @keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
            @keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
            .wv-btn:hover { background: rgba(80,140,220,0.32) !important; border-color: rgba(120,180,255,0.6) !important; }
            .wv-top-btn:hover { background: rgba(30,40,60,0.95) !important; color: #cbd5e1 !important; }
          `}</style>

          {/* District name HUD — pill */}
          {districtLabel && (
            <div key={districtLabel} style={{
              position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(8,12,24,0.72)', border: '1px solid rgba(100,160,255,0.18)',
              borderRadius: 20, padding: '5px 16px',
              color: 'rgba(200,220,255,0.90)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              backdropFilter: 'blur(10px)',
              animation: 'slideUp 0.35s ease-out', pointerEvents: 'none', zIndex: 10,
              whiteSpace: 'nowrap',
            }}>{districtLabel}</div>
          )}

          {/* Top-right controls: Bird's eye */}
          <button
            className="wv-top-btn"
            onClick={() => { birdEyeTargetRef.current = { phi: 0.06, radius: 220 }; }}
            title="Bird's eye view"
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 10,
              background: 'rgba(8,12,24,0.80)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '6px 11px', color: '#8899B4',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              backdropFilter: 'blur(10px)', letterSpacing: '0.04em',
              transition: 'background 0.15s, color 0.15s',
            }}
          >↑ Top</button>

          {/* Controls hint */}
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 20, padding: '4px 14px', color: '#4A5568', fontSize: 10,
            pointerEvents: 'none', whiteSpace: 'nowrap', letterSpacing: '0.04em',
          }}>
            Drag · Scroll · Right-drag to pan · Click to inspect
          </div>

          {/* Selected block info card */}
          {selectedBlock && (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(8,12,26,0.94)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12, overflow: 'hidden', color: '#e2e8f0',
              backdropFilter: 'blur(16px)', minWidth: 200, width: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
              animation: 'fadeIn 0.15s ease-out',
            }}>
              {/* Zone color accent bar */}
              <div style={{ height: 3, background: ZONE_COLORS[selectedBlock.zone], opacity: 0.85 }} />
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, letterSpacing: '0.01em' }}>{selectedBlock.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, flexShrink: 0, background: ZONE_COLORS[selectedBlock.zone] }} />
                  <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {selectedBlock.zone} zone
                  </span>
                </div>
                <canvas ref={floorPlanRef} width={172} height={80} style={{ display: 'block', marginBottom: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.07)', width: '100%' }} />
                {/* Tag assignment */}
                {contactTags && contactTags.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 }}>Linked Tag</div>
                    <select
                      value={districtTagMap?.[selectedBlock.label] ?? ''}
                      onChange={e => onDistrictTagMapChange?.({ ...(districtTagMap ?? {}), [selectedBlock.label]: e.target.value })}
                      style={{
                        width: '100%', background: 'rgba(6,10,20,0.9)',
                        border: `1px solid ${contactTags.find(t => t.name === (districtTagMap?.[selectedBlock.label] ?? ''))?.color ?? 'rgba(255,255,255,0.10)'}`,
                        borderRadius: 6, padding: '5px 8px', color: '#cbd5e1', fontSize: 11,
                        cursor: 'pointer', outline: 'none',
                      }}
                    >
                      <option value="">— No Tag —</option>
                      {contactTags.map(tag => (
                        <option key={tag.name} value={tag.name}>{tag.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  className="wv-btn"
                  onClick={() => enterBuildingCallbackRef.current?.(selectedBlock)}
                  style={{
                    width: '100%', padding: '8px 0',
                    background: 'rgba(60,120,220,0.16)', border: '1px solid rgba(80,140,240,0.30)',
                    borderRadius: 7, color: '#7EB8F8', cursor: 'pointer', fontSize: 11,
                    fontWeight: 600, letterSpacing: '0.04em',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  Enter Building →
                </button>
              </div>
              <button
                onClick={() => setSelectedBlock(null)}
                style={{
                  position: 'absolute', top: 7, right: 9, background: 'none', border: 'none',
                  color: '#475569', cursor: 'pointer', fontSize: 15, lineHeight: 1,
                  padding: '2px 4px', borderRadius: 4, transition: 'color 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              >×</button>
            </div>
          )}

          {/* Minimap */}
          <div
            title="Click to teleport"
            style={{
              position: 'absolute', bottom: 14, left: 14, borderRadius: '50%', overflow: 'hidden',
              boxShadow: '0 0 0 1.5px rgba(80,140,220,0.35), 0 4px 20px rgba(0,0,0,0.5)',
              zIndex: 10, cursor: 'crosshair',
            }}>
            <canvas ref={minimapRef} width={160} height={160} style={{ display: 'block' }} />
          </div>

          {/* Zone legend */}
          <div style={{
            position: 'absolute', top: 14, left: 14,
            background: 'rgba(6,10,20,0.82)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 12px', zIndex: 10, backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}>
            {(['downtown','midrise','mixed','low','park','water'] as const).map(zone => (
              <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[zone], flexShrink: 0, boxShadow: `0 0 4px ${ZONE_COLORS[zone]}80` }} />
                <span style={{ fontSize: 10, color: '#6B7A8D', textTransform: 'capitalize', letterSpacing: '0.04em' }}>{zone}</span>
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
