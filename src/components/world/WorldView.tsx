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
// postprocessing removed — its sideEffects:false + circular deps cause
// TDZ errors in Rollup production builds. Bloom was barely visible (0.20).
import { WorldDataPanel } from './WorldDataPanel';
import type { WorldViewAppData } from './WorldDataPanel';
import { WorldBlockDataCard, findLinkedProject } from './WorldBlockDataCard';

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
    glass: new THREE.MeshStandardMaterial({ color: '#B8D4EC', roughness: 0.03, metalness: 0.35, transparent: true, opacity: 0.58 }),
  };
}

function makeBuildingTexture(type: 'curtain' | 'strip' | 'residential' | 'warehouse' | 'campus'): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  if (type === 'curtain') {
    // Modern glass curtain wall — dark blue glass with steel mullions
    ctx.fillStyle = '#0A1420'; ctx.fillRect(0, 0, W, H);
    const panelW = 64, panelH = 80;
    const cols = Math.floor(W / panelW), rows = Math.floor(H / panelH);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * panelW, py = row * panelH;
        // Steel mullion frame
        ctx.fillStyle = '#1C2830'; ctx.fillRect(px, py, panelW, panelH);
        // Glass pane (inset)
        const lit = Math.random();
        if (lit < 0.3) {
          // Warm interior light visible
          const warmth = Math.floor(180 + Math.random() * 60);
          ctx.fillStyle = `rgba(${warmth},${warmth - 40},${warmth - 100},${0.08 + Math.random() * 0.15})`;
        } else {
          // Dark/reflective glass
          const b = 12 + Math.floor(Math.random() * 25);
          ctx.fillStyle = `rgb(${b},${b + 8},${b + 20})`;
        }
        ctx.fillRect(px + 3, py + 3, panelW - 6, panelH - 6);
        // Subtle sky reflection gradient on some panels
        if (Math.random() < 0.15) {
          const grad = ctx.createLinearGradient(px, py, px, py + panelH);
          grad.addColorStop(0, 'rgba(60,100,140,0.12)');
          grad.addColorStop(1, 'rgba(30,50,70,0.04)');
          ctx.fillStyle = grad; ctx.fillRect(px + 3, py + 3, panelW - 6, panelH - 6);
        }
      }
    }
    // Horizontal mullion lines
    ctx.fillStyle = '#2A3848';
    for (let y = 0; y <= H; y += panelH) ctx.fillRect(0, y - 1, W, 3);
    // Vertical mullion lines
    for (let x = 0; x <= W; x += panelW) ctx.fillRect(x - 1, 0, 3, H);

  } else if (type === 'strip') {
    // Concrete/stone facade with strip windows
    ctx.fillStyle = '#BEB4A4'; ctx.fillRect(0, 0, W, H);
    // Concrete texture noise
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random()*0.03})`;
      ctx.fillRect(Math.random()*W, Math.random()*H, 2+Math.random()*3, 1+Math.random());
    }
    // Weathering stains (vertical streaks from rain)
    for (let i = 0; i < 15; i++) {
      const sx = Math.random() * W;
      ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random()*0.03})`;
      ctx.fillRect(sx, 0, 1 + Math.random() * 2, H);
    }
    // Horizontal strip windows with individual panes
    const floorH = 85;
    for (let y = 28; y < H; y += floorH) {
      // Window band
      ctx.fillStyle = '#141E2C'; ctx.fillRect(16, y, W - 32, 44);
      // Individual panes within the band
      const paneW = 48;
      for (let x = 16; x < W - 32; x += paneW) {
        ctx.strokeStyle = '#2A3A4A'; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, paneW, 44);
        // Some panes lit
        if (Math.random() < 0.25) {
          ctx.fillStyle = `rgba(200,180,140,${0.06 + Math.random()*0.12})`;
          ctx.fillRect(x + 2, y + 2, paneW - 4, 40);
        }
      }
      // Spandrel panel below window
      ctx.fillStyle = '#9A9080'; ctx.fillRect(16, y + 44, W - 32, 8);
    }

  } else if (type === 'residential') {
    // Brick/stucco residential with individual windows, sills, and shutters
    ctx.fillStyle = '#C8B898'; ctx.fillRect(0, 0, W, H);
    // Brick texture
    const brickH = 8, brickW = 16;
    for (let by = 0; by < H; by += brickH) {
      const offset = (Math.floor(by / brickH) % 2) * (brickW / 2);
      for (let bx = -brickW; bx < W + brickW; bx += brickW) {
        const r = 180 + Math.floor(Math.random() * 25), g2 = 160 + Math.floor(Math.random() * 20), b = 120 + Math.floor(Math.random() * 15);
        ctx.fillStyle = `rgb(${r},${g2},${b})`;
        ctx.fillRect(bx + offset + 1, by + 1, brickW - 2, brickH - 2);
      }
    }
    // Mortar lines
    ctx.fillStyle = '#B0A888';
    for (let by = 0; by <= H; by += brickH) ctx.fillRect(0, by - 0.5, W, 1);
    // Windows with sills, lintels, and varied interior
    const winCols = 5, winRows = 10;
    const winW = 36, winH = 52;
    for (let wr = 0; wr < winRows; wr++) {
      for (let wc = 0; wc < winCols; wc++) {
        const wx = wc * (W / winCols) + (W / winCols - winW) / 2;
        const wy = wr * (H / winRows) + 20;
        // Lintel (header)
        ctx.fillStyle = '#A09070'; ctx.fillRect(wx - 4, wy - 6, winW + 8, 6);
        // Window opening
        ctx.fillStyle = '#101820'; ctx.fillRect(wx, wy, winW, winH);
        // Interior variation
        const lit = Math.random();
        if (lit < 0.2) {
          ctx.fillStyle = `rgba(220,190,130,${0.1 + Math.random()*0.2})`;
          ctx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);
        } else if (lit < 0.4) {
          // Curtain/blind (partial coverage)
          ctx.fillStyle = '#D8D0C0'; ctx.fillRect(wx + 2, wy + 2, winW - 4, winH * 0.4);
        }
        // Cross-bar (muntin)
        ctx.fillStyle = '#808070'; ctx.fillRect(wx + winW/2 - 1, wy, 2, winH);
        ctx.fillRect(wx, wy + winH/2 - 1, winW, 2);
        // Sill
        ctx.fillStyle = '#B0A080'; ctx.fillRect(wx - 3, wy + winH, winW + 6, 5);
      }
    }

  } else if (type === 'warehouse') {
    // Corrugated metal siding with roll-up doors
    ctx.fillStyle = '#7A8088'; ctx.fillRect(0, 0, W, H);
    // Corrugation ridges
    for (let x = 0; x < W; x += 12) {
      ctx.fillStyle = x % 24 === 0 ? '#6A7078' : '#8A9098';
      ctx.fillRect(x, 0, 6, H);
    }
    // Rust/weathering patches
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(120,60,30,${0.04 + Math.random()*0.06})`;
      const rx = Math.random() * W, ry = Math.random() * H;
      ctx.beginPath(); ctx.ellipse(rx, ry, 8+Math.random()*20, 4+Math.random()*10, 0, 0, Math.PI*2); ctx.fill();
    }
    // Roll-up door
    ctx.fillStyle = '#4A5258'; ctx.fillRect(W*0.15, H - 260, W*0.35, 250);
    for (let y = H - 260; y < H - 10; y += 20) { ctx.fillStyle = '#3A4248'; ctx.fillRect(W*0.15, y, W*0.35, 3); }
    // Personnel door
    ctx.fillStyle = '#384048'; ctx.fillRect(W*0.65, H - 140, 50, 130);
    ctx.fillStyle = '#505860'; ctx.fillRect(W*0.65 + 40, H - 80, 6, 6);
    // High windows
    for (let x = W*0.1; x < W*0.9; x += 80) {
      ctx.fillStyle = '#B8C0C8'; ctx.globalAlpha = 0.4;
      ctx.fillRect(x, H*0.15, 55, 30); ctx.globalAlpha = 1.0;
      ctx.strokeStyle = '#5A6268'; ctx.lineWidth = 2; ctx.strokeRect(x, H*0.15, 55, 30);
    }

  } else {
    // Modern campus/office — dark glass grid
    ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, W, H);
    const panelW = 44, panelH = 64;
    for (let y = 0; y < H; y += panelH) {
      for (let x = 0; x < W; x += panelW) {
        // Mullion grid
        ctx.strokeStyle = '#2A3C4E'; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, panelW, panelH);
        // Glass variation
        const b = 15 + Math.floor(Math.random() * 20);
        ctx.fillStyle = `rgb(${b},${b + 10},${b + 25})`;
        ctx.fillRect(x + 2, y + 2, panelW - 4, panelH - 4);
        // Some lit offices
        if (Math.random() < 0.2) {
          ctx.fillStyle = `rgba(180,160,120,${0.05 + Math.random()*0.1})`;
          ctx.fillRect(x + 2, y + 2, panelW - 4, panelH - 4);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ─── BUILDING COLOR PALETTES ──────────────────────────────────────────────────
// Returns { main, alt, trim } hex strings — deterministic per block position
function buildingColorPalette(col: number, row: number, zone: string, arch: string): { main: string; alt: string; trim: string } | null {
  // Glass-dominant arches keep their texture-based color; palette tints don't apply
  if (arch === 'tower' || arch === 'spire' || arch === 'podiumTower') {
    const rng = seededRandom(`pal-${col}-${row}`);
    // 50% get cold glass (default), 50% get dark steel
    if (rng() < 0.5) return null; // keep default cold glass
    return { main: '#606870', alt: '#505860', trim: '#384048' }; // dark steel
  }
  if (zone === 'downtown') return null; // downtown non-tower keeps texture defaults

  const rng = seededRandom(`pal-${col}-${row}`);
  const palettes = [
    { main: '#DDD4C4', alt: '#C8BEA8', trim: '#B8A898' }, // warm stone
    { main: '#B8BCC4', alt: '#A8ACB4', trim: '#989CA4' }, // concrete
    { main: '#C8907C', alt: '#B87C68', trim: '#D4A090' }, // terracotta
    { main: '#E4D8C0', alt: '#D4C8A8', trim: '#C8B898' }, // cream brick
    { main: '#D8CC9C', alt: '#C8BC8C', trim: '#B8AA7C' }, // sandstone
  ];
  // Residential/low/mixed lean toward warmer palettes; midrise/campus are neutral
  const warmWeight = (zone === 'residential' || zone === 'low' || zone === 'mixed') ? 0.6 : 0.3;
  const idx = rng() < warmWeight
    ? Math.floor(rng() * 3) + 2  // terracotta, cream brick, sandstone
    : Math.floor(rng() * 2);     // warm stone, concrete
  return palettes[Math.min(idx, palettes.length - 1)];
}

function makeArchSpecificMats(arch: string): ArchMats {
  const base = makeArchMats();
  switch (arch) {
    case 'tower': case 'spire': case 'podiumTower': {
      const tex = getCachedArchTex('curtain'); tex.repeat.set(0.6, 1.2);
      base.main  = new THREE.MeshStandardMaterial({ map: tex, color: '#C8DCF0', roughness: 0.22, metalness: 0.38 });
      base.glass = new THREE.MeshStandardMaterial({ color: '#88C0E8', roughness: 0.02, metalness: 0.45, transparent: true, opacity: 0.65 });
      break;
    }
    case 'slab': {
      const tex = getCachedArchTex('strip'); tex.repeat.set(0.5, 0.8);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.90 });
      break;
    }
    case 'residential': {
      const tex = getCachedArchTex('residential'); tex.repeat.set(0.5, 0.8);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      base.alt  = new THREE.MeshStandardMaterial({ map: tex, color: '#E8DCBC', roughness: 0.90 });
      break;
    }
    case 'warehouse': {
      const tex = getCachedArchTex('warehouse'); tex.repeat.set(1, 0.6);
      base.main = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0.18 });
      base.alt  = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0.18 });
      break;
    }
    case 'midrise': case 'campus': {
      const tex = getCachedArchTex('campus'); tex.repeat.set(0.5, 1.0);
      base.main = new THREE.MeshStandardMaterial({ map: tex, color: '#BED4EE', roughness: 0.40, metalness: 0.22 });
      break;
    }
  }
  return base;
}

// Module-level texture cache — 5 types, created once and shared across all buildings
const ARCH_TEX_CACHE = new Map<string, THREE.CanvasTexture>();
function getCachedArchTex(type: 'curtain' | 'strip' | 'residential' | 'warehouse' | 'campus'): THREE.CanvasTexture {
  if (!ARCH_TEX_CACHE.has(type)) ARCH_TEX_CACHE.set(type, makeBuildingTexture(type));
  return ARCH_TEX_CACHE.get(type)!;
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
    const winClone = winMat.clone();
    // ~25% of windows get a subtle warm "lights on" glow
    if (Math.random() < 0.25) {
      winClone.emissive = new THREE.Color('#FFE8B0');
      winClone.emissiveIntensity = 0.15 + Math.random() * 0.20;
    }
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), winClone);
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
  h = Math.max(8, Math.min(h, 28));
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
  h = Math.max(6, Math.min(h, 18));
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
  h = Math.max(5, Math.min(h, 14));
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
  h = Math.max(5, Math.min(h, 10));
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
  h = Math.max(8, Math.min(h, 22));
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
  h = Math.max(12, Math.min(h, 40));
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
  h = Math.max(16, Math.min(h, 80));
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

function createMoatShieldTower(cx: number, cz: number, logoTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);

  // ── Materials ──
  const glassMat = () => new THREE.MeshStandardMaterial({
    color: '#0A1828', roughness: 0.02, metalness: 0.75, transparent: true, opacity: 0.88,
  });
  const steelMat = () => new THREE.MeshStandardMaterial({ color: '#7A8A9C', roughness: 0.18, metalness: 0.92 });
  const darkSteelMat = () => new THREE.MeshStandardMaterial({ color: '#2E3C4E', roughness: 0.12, metalness: 0.94 });
  const brushedSteelMat = () => new THREE.MeshStandardMaterial({ color: '#5A6878', roughness: 0.25, metalness: 0.88 });
  const concreteMat = () => new THREE.MeshStandardMaterial({ color: '#4A5058', roughness: 0.92, metalness: 0.02 });
  const accentMat = () => new THREE.MeshStandardMaterial({ color: '#2890D8', emissive: '#2890D8', emissiveIntensity: 0.35 });
  const warmGlowMat = () => new THREE.MeshStandardMaterial({ color: '#FFE8C0', emissive: '#FFD090', emissiveIntensity: 0.3 });
  const mullionMat = () => new THREE.MeshStandardMaterial({ color: '#1C2838', roughness: 0.15, metalness: 0.65 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#2A3440', roughness: 0.7, metalness: 0.35 });

  // ── Helper: box shorthand ──
  const box = (w: number, h: number, d: number, mat: THREE.MeshStandardMaterial, px = 0, py = 0, pz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };

  // ── Helper: curtain-wall glass section with mullion grid ──
  const glassSection = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    // Main glass volume
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);

    const mm = mullionMat();
    // Horizontal mullions (floor lines)
    const hCount = Math.floor(h / 3.2);
    for (let i = 1; i <= hCount; i++) {
      const ly = y + i * (h / (hCount + 1));
      // Front/back faces
      for (const zSign of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.08, 0.04), mm.clone());
        bar.position.set(x, ly, z + zSign * (d / 2 + 0.02)); g.add(bar);
      }
      // Side faces
      for (const xSign of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, d - 0.1), mm.clone());
        bar.position.set(x + xSign * (w / 2 + 0.02), ly, z); g.add(bar);
      }
    }
    // Vertical mullions
    const vCountW = Math.floor(w / 4);
    for (let i = 1; i <= vCountW; i++) {
      const lx = x - w / 2 + i * (w / (vCountW + 1));
      for (const zSign of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.04), mm.clone());
        bar.position.set(lx, y + h / 2, z + zSign * (d / 2 + 0.02)); g.add(bar);
      }
    }
    const vCountD = Math.floor(d / 4);
    for (let i = 1; i <= vCountD; i++) {
      const lz = z - d / 2 + i * (d / (vCountD + 1));
      for (const xSign of [1, -1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.06), mm.clone());
        bar.position.set(x + xSign * (w / 2 + 0.02), y + h / 2, lz); g.add(bar);
      }
    }
    return mesh;
  };

  // ── Helper: structural corner columns ──
  const cornerColumns = (w: number, d: number, h: number, y: number, z: number) => {
    const colMat = brushedSteelMat();
    const colW = 0.6, colD = 0.6;
    for (const [sx, sz] of [[1,1],[-1,1],[1,-1],[-1,-1]] as [number,number][]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(colW, h, colD), colMat.clone());
      col.position.set(sx * (w / 2 - colW / 2), y + h / 2, z + sz * (d / 2 - colD / 2));
      col.castShadow = true; g.add(col);
    }
  };

  // ── Helper: mechanical floor band (dark louvered strip) ──
  const mechFloor = (w: number, d: number, y: number, z: number) => {
    const mechMat = new THREE.MeshStandardMaterial({ color: '#1A2028', roughness: 0.85, metalness: 0.3 });
    box(w + 0.3, 1.2, d + 0.3, mechMat, 0, y + 0.6, z);
    // Louver lines
    const louverMat = new THREE.MeshStandardMaterial({ color: '#0E1418', roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const ly = y + 0.2 + i * 0.28;
      for (const zs of [1, -1]) {
        const louver = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, 0.08), louverMat.clone());
        louver.position.set(0, ly, z + zs * (d / 2 + 0.16)); g.add(louver);
      }
    }
  };

  // ── Helper: steel trim ledge with drip edge ──
  const ledge = (w: number, d: number, x: number, y: number, z: number) => {
    box(w + 0.6, 0.18, d + 0.6, steelMat(), x, y, z);
    // Drip edge (slight overhang)
    box(w + 1.0, 0.06, d + 1.0, darkSteelMat(), x, y - 0.12, z);
  };

  // ════════════════════════════════════════════════════════════════════════
  // TOWER GEOMETRY — tapering supertall with structural expression
  // ════════════════════════════════════════════════════════════════════════

  // ── 0. GROUND-LEVEL PLAZA & LOBBY ──
  // Stone plaza base
  const plazaMat = new THREE.MeshStandardMaterial({ color: '#B8B0A4', roughness: 0.88 });
  box(44, 0.3, 40, plazaMat, 0, 0.15, 0);
  // Entry steps (front)
  for (let s = 0; s < 3; s++) {
    box(16 - s * 2, 0.15, 1.2, concreteMat(), 0, 0.08 + s * 0.15, 20.5 + s * 1.2);
  }
  // Lobby glass facade (double-height, recessed)
  const lobbyGlass = new THREE.MeshStandardMaterial({
    color: '#0C1828', roughness: 0.02, metalness: 0.6, transparent: true, opacity: 0.7,
  });
  box(30, 5, 0.15, lobbyGlass, 0, 3, 17.02);
  // Lobby warm interior glow (behind glass)
  box(28, 4, 0.1, warmGlowMat(), 0, 2.8, 16.8);
  // Canopy over entrance
  box(18, 0.15, 3, darkSteelMat(), 0, 5.2, 18.5);
  // Canopy support rods
  for (const sx of [-8, 8]) {
    box(0.08, 0.08, 3, steelMat(), sx, 5.1, 18.5);
  }
  // Bollards
  for (let bx = -7; bx <= 7; bx += 2) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), concreteMat());
    bollard.position.set(bx, 0.65, 22.5); bollard.castShadow = true; g.add(bollard);
  }

  // ── 1. BASE SECTION: 0.3→22 — widest ──
  glassSection(36, 22, 34, 0, 0.3, 0);
  cornerColumns(36, 34, 22, 0.3, 0);
  mechFloor(36, 34, 22.3, 0);
  ledge(36, 34, 0, 23.7, 0);

  // ── 2. LOWER-MID: 24→38 ──
  glassSection(30, 14, 28, 0, 24, 0);
  cornerColumns(30, 28, 14, 24, 0);
  mechFloor(30, 28, 38, 0);
  ledge(30, 28, 0, 39.4, 0);

  // ── 3. UPPER-MID: 40→52 ──
  glassSection(22, 12, 20, 0, 40, 0);
  cornerColumns(22, 20, 12, 40, 0);
  ledge(22, 20, 0, 52.2, 0);

  // ── 4. CROWN: 52.5→62 — offset forward ──
  glassSection(14, 9.5, 14, 0, 52.5, 1.5);
  cornerColumns(14, 14, 9.5, 52.5, 1.5);
  ledge(14, 14, 0, 62.2, 1.5);

  // ── 5. CANTILEVER — angled glass wedge ──
  const cantileverGeo = new THREE.BufferGeometry();
  const cv = new Float32Array([
    -6, 52.5, 8,    6, 52.5, 8,    6, 52.5, 17,   -6, 52.5, 17,
    -6, 62, 8,      6, 62, 8,      6, 55, 17,     -6, 55, 17,
  ]);
  const ci = new Uint16Array([
    0,2,1, 0,3,2,  4,5,6, 4,6,7,  3,2,6, 3,6,7,
    0,1,5, 0,5,4,  0,4,7, 0,7,3,  1,2,6, 1,6,5,
  ]);
  cantileverGeo.setAttribute('position', new THREE.BufferAttribute(cv, 3));
  cantileverGeo.setIndex(new THREE.BufferAttribute(ci, 1));
  cantileverGeo.computeVertexNormals();
  const cantilever = new THREE.Mesh(cantileverGeo, glassMat());
  cantilever.castShadow = true; cantilever.receiveShadow = true;
  g.add(cantilever);

  // Structural truss inside cantilever (visible through glass)
  const trussMat = darkSteelMat();
  for (let ty = 53; ty < 61; ty += 2.5) {
    // Diagonal braces
    for (const sx of [-5, 5]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 10), trussMat.clone());
      brace.position.set(sx, ty + 1.25, 12.5);
      brace.rotation.x = Math.atan2(2.5, 9) * (ty % 5 < 2.5 ? 1 : -1);
      g.add(brace);
    }
  }

  // Steel edge framing on cantilever
  const edgeMat = darkSteelMat();
  box(12.5, 0.25, 0.25, edgeMat.clone(), 0, 52.5, 17);
  box(12.5, 0.25, 0.25, edgeMat.clone(), 0, 55, 17);
  box(12.5, 0.25, 0.25, edgeMat.clone(), 0, 62, 8);
  const sideLen = Math.sqrt(81 + 6.25);
  for (const sx of [-6, 6]) {
    const se = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, sideLen), edgeMat.clone());
    se.position.set(sx, 57.25, 12.5);
    se.rotation.x = Math.atan2(7, 9); g.add(se);
  }

  // ── 6. OBSERVATION TERRACE ──
  box(16, 0.35, 10, padMat, 0, 52.5, 14);
  // Glass railing
  const railGlass = new THREE.MeshStandardMaterial({
    color: '#C8DCF0', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.35,
  });
  box(16, 1.1, 0.06, railGlass, 0, 53.1, 19);
  // Steel rail cap
  box(16.2, 0.06, 0.12, steelMat(), 0, 53.7, 19);
  // Railing posts
  for (let rx = -7; rx <= 7; rx += 2) {
    box(0.06, 1.1, 0.06, steelMat(), rx, 53.1, 19);
  }
  // Side railings
  for (const sx of [-8, 8]) {
    box(0.06, 1.1, 10, railGlass.clone(), sx, 53.1, 14);
    box(0.12, 0.06, 10.2, steelMat(), sx, 53.7, 14);
  }
  // Landing pad markings (subtle circle)
  const padCircleMat = new THREE.MeshStandardMaterial({ color: '#3A4450', roughness: 0.8 });
  const padCircle = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.0, 32), padCircleMat);
  padCircle.rotation.x = -Math.PI / 2; padCircle.position.set(0, 52.55, 15); g.add(padCircle);
  const padInner = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 16), padCircleMat.clone());
  padInner.rotation.x = -Math.PI / 2; padInner.position.set(0, 52.55, 15); g.add(padInner);

  // ── 7. SPIRE / ANTENNA ARRAY ──
  // Main mast
  const mastMat = darkSteelMat();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 14, 8), mastMat);
  mast.castShadow = true; mast.position.set(0, 62.2 + 7, 1.5); g.add(mast);
  // Lattice braces on mast
  for (let my = 64; my < 74; my += 2.8) {
    for (const [ax, az] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.8), steelMat());
      arm.position.set(ax * 0.9, my, 1.5 + az * 0.9);
      arm.rotation.y = Math.atan2(ax, az); g.add(arm);
    }
  }
  // Cross-arms with dishes
  for (const my of [66, 70]) {
    box(3.5, 0.1, 0.1, steelMat(), 0, my, 1.5);
    box(0.1, 0.1, 3.5, steelMat(), 0, my, 1.5);
    // Small dish
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4, 0, Math.PI), steelMat());
    dish.position.set(1.8, my, 1.5); dish.rotation.z = Math.PI / 2; g.add(dish);
  }
  // Aviation warning light
  const avLight = new THREE.MeshStandardMaterial({ color: '#FF3020', emissive: '#FF3020', emissiveIntensity: 1.2 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), avLight);
  tip.position.set(0, 76.5, 1.5); g.add(tip);

  // ── 8. STRUCTURAL EXPRESSION — exposed corner braces at setbacks ──
  const braceMat = brushedSteelMat();
  // Base-to-mid diagonal braces (architectural X-braces on each face)
  const braceConfigs: [number, number, number, number, number, string][] = [
    // [w, startY, endY, faceOffset, depth, axis]
    [36, 5, 20, 17.05, 34, 'z'],
    [30, 26, 36, 14.05, 28, 'z'],
  ];
  for (const [bw, by1, by2, faceOff, , axis] of braceConfigs) {
    const bLen = Math.sqrt((by2 - by1) ** 2 + (bw * 0.4) ** 2);
    const bAngle = Math.atan2(by2 - by1, bw * 0.4);
    for (const sign of [1, -1]) {
      if (axis === 'z') {
        // Front/back faces — diagonal from lower-left to upper-right
        const brace = new THREE.Mesh(new THREE.BoxGeometry(bLen, 0.18, 0.18), braceMat.clone());
        brace.position.set(0, (by1 + by2) / 2, sign * faceOff);
        brace.rotation.z = bAngle; g.add(brace);
        const brace2 = new THREE.Mesh(new THREE.BoxGeometry(bLen, 0.18, 0.18), braceMat.clone());
        brace2.position.set(0, (by1 + by2) / 2, sign * faceOff);
        brace2.rotation.z = -bAngle; g.add(brace2);
      }
    }
  }

  // ── 9. LOGO — on upper-mid section face ──
  const logoW = 12, logoPH = 7;
  const logoMat = new THREE.MeshStandardMaterial({
    map: logoTex, transparent: true, alphaTest: 0.05,
    emissive: '#FFFFFF', emissiveIntensity: 0.25,
    roughness: 0.1, metalness: 0.1,
  });
  // Front face of upper-mid section
  const lp1 = new THREE.Mesh(new THREE.PlaneGeometry(logoW, logoPH), logoMat.clone());
  lp1.position.set(0, 46, 10.05); g.add(lp1);
  const lp2 = new THREE.Mesh(new THREE.PlaneGeometry(logoW, logoPH), logoMat.clone());
  lp2.position.set(0, 46, -10.05); lp2.rotation.y = Math.PI; g.add(lp2);
  const lp3 = new THREE.Mesh(new THREE.PlaneGeometry(logoPH, logoPH), logoMat.clone());
  lp3.position.set(11.05, 46, 0); lp3.rotation.y = Math.PI / 2; g.add(lp3);
  const lp4 = new THREE.Mesh(new THREE.PlaneGeometry(logoPH, logoPH), logoMat.clone());
  lp4.position.set(-11.05, 46, 0); lp4.rotation.y = -Math.PI / 2; g.add(lp4);

  // ── 10. SUBTLE ACCENT LIGHTING at ledges (toned down) ──
  for (const [ly, lw, ld] of [[23.7, 36, 34], [39.4, 30, 28], [52.2, 22, 20]] as [number,number,number][]) {
    for (const zs of [1, -1]) {
      const ls = new THREE.Mesh(new THREE.BoxGeometry(lw - 4, 0.08, 0.08), accentMat());
      ls.position.set(0, ly + 0.15, zs * (ld / 2 + 0.35)); g.add(ls);
    }
    for (const xs of [1, -1]) {
      const ls = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, ld - 4), accentMat());
      ls.position.set(xs * (lw / 2 + 0.35), ly + 0.15, 0); g.add(ls);
    }
  }

  // ── 11. GROUND-LEVEL LANDSCAPING ──
  const treeMat = new THREE.MeshStandardMaterial({ color: '#3A6830', roughness: 0.85 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5A4A30', roughness: 0.95 });
  for (const [tx, tz] of [[-18,18],[18,18],[-18,-18],[18,-18],[-8,20],[8,20]] as [number,number][]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2, 6), trunkMat.clone());
    trunk.position.set(tx, 1.3, tz); trunk.castShadow = true; g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), treeMat.clone());
    canopy.position.set(tx, 3, tz); canopy.castShadow = true; g.add(canopy);
  }

  return g;
}

function makeTree(x: number, z: number, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const scale = 1.8 + rng() * 1.8; // 1.8× – 3.6× for realistic 8–15m trees
  g.scale.setScalar(scale);

  const isConifer = rng() < 0.40; // 40% conifers, 60% deciduous

  if (isConifer) {
    // ── Conifer / Evergreen: stacked cones ──
    const trunkH = 1.4 + rng() * 0.4;
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6B4C30', roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, trunkH, 7), trunkMat);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    const coniferColors = ['#2A5C30', '#1E4A24', '#326638', '#284E2A'];
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const r = 1.2 - i * 0.28;
      const h = 1.8 - i * 0.3;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 8),
        new THREE.MeshStandardMaterial({ color: coniferColors[i % coniferColors.length], roughness: 0.85 })
      );
      cone.position.y = trunkH + 0.6 + i * (h * 0.55);
      cone.castShadow = true; cone.receiveShadow = true; g.add(cone);
    }
  } else {
    // ── Deciduous: multi-sphere canopy ──
    const trunkH = 1.6 + rng() * 1.0;
    const trunkColor = rng() < 0.5 ? '#7A6040' : '#8A7050';
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.16, trunkH, 8),
      new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.95 })
    );
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    const leafColors = ['#4A8040', '#5A9448', '#3E7038', '#62A050', '#528840', '#3A6830', '#8AB050', '#A8C040', '#7A9838'];
    const nSpheres = 5 + Math.floor(rng() * 3); // 5–7 spheres
    for (let i = 0; i < nSpheres; i++) {
      const r = 0.75 + rng() * 0.55;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(r, 11, 9),
        new THREE.MeshStandardMaterial({ color: leafColors[Math.floor(rng() * leafColors.length)], roughness: 0.82 })
      );
      const ox = (rng() - 0.5) * 1.1;
      const oy = trunkH + r * 0.65 + (rng() - 0.3) * 0.9;
      const oz = (rng() - 0.5) * 1.1;
      sphere.position.set(ox, oy, oz);
      sphere.castShadow = true; sphere.receiveShadow = true; g.add(sphere);
    }
  }
  return g;
}

// ─── BYU STADIUM ──────────────────────────────────────────────────────────────

function buildFieldTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;

  // Field dimensions in canvas coords:
  // Total canvas = 28 units wide × 15 units tall (game field + end zones)
  // End zones = 3 units each side → 10.7% of width each
  const EZ = Math.round(W * (3 / 28));     // end-zone width in px
  const PLAY_W = W - 2 * EZ;               // playing-field width in px

  // --- Alternating grass stripes (10-yard bands) ---
  const stripeCount = 10; // 10 bands across playing field
  const stripeW = PLAY_W / stripeCount;
  const dark  = '#1E5C28';
  const light = '#2A7034';
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? dark : light;
    ctx.fillRect(EZ + i * stripeW, 0, stripeW, H);
  }

  // --- End zones ---
  ctx.fillStyle = '#0A2240';
  ctx.fillRect(0, 0, EZ, H);
  ctx.fillRect(W - EZ, 0, EZ, H);

  // End-zone diagonal stripes for texture
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  for (let s = -H; s < EZ + H; s += 18) {
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s + H, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - EZ + s, 0); ctx.lineTo(W - EZ + s + H, H); ctx.stroke();
  }
  ctx.restore();

  // End-zone text
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(H * 0.16)}px Arial Black, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // "BYU" – west end zone (left)
  ctx.translate(EZ / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('BYU', 0, 0);
  ctx.restore();
  // "COUGARS" – east end zone (right)
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(H * 0.11)}px Arial Black, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(W - EZ / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('COUGARS', 0, 0);
  ctx.restore();

  // --- Yard lines (every 10 yards = every stripeW) ---
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  for (let i = 0; i <= stripeCount; i++) {
    const lx = EZ + i * stripeW;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
  }
  // End-zone boundary lines (thicker)
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(EZ, 0); ctx.lineTo(EZ, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - EZ, 0); ctx.lineTo(W - EZ, H); ctx.stroke();

  // --- Hash marks (two rows between each yard line) ---
  const hashInset = H * 0.28;   // hash position from top/bottom
  const hashLen   = H * 0.055;
  ctx.lineWidth = 2;
  for (let i = 0; i <= stripeCount; i++) {
    const lx = EZ + i * stripeW;
    // top hash
    ctx.beginPath(); ctx.moveTo(lx - hashLen / 2, hashInset); ctx.lineTo(lx + hashLen / 2, hashInset); ctx.stroke();
    // bottom hash
    ctx.beginPath(); ctx.moveTo(lx - hashLen / 2, H - hashInset); ctx.lineTo(lx + hashLen / 2, H - hashInset); ctx.stroke();
  }

  // --- Field numbers (10, 20, 30, 40, 50, 40, 30, 20, 10) ---
  const nums = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(H * 0.13)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < nums.length; i++) {
    const nx = EZ + (i + 0.5) * stripeW;
    // top number (upside-down for correct orientation when viewed from north)
    ctx.save();
    ctx.translate(nx, H * 0.18);
    ctx.rotate(Math.PI);
    ctx.fillText(String(nums[i]), 0, 0);
    ctx.restore();
    // bottom number
    ctx.fillText(String(nums[i]), nx, H * 0.82);
  }

  // --- BYU "Y" logo at midfield ---
  const cx = W / 2, cy = H / 2;
  const R = H * 0.22;

  // Oval background
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 1.1, R, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#002E5D';
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // Draw "Y" — bold serif block letter
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  const ySize = R * 1.1;
  ctx.font = `900 ${ySize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Y', cx, cy);
  ctx.restore();

  return new THREE.CanvasTexture(cv);
}

function buildSeatTexture(rows = 8): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#002E5D';
  ctx.fillRect(0, 0, 256, 128);
  const rowH = 128 / rows;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  for (let r = 1; r < rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * rowH); ctx.lineTo(256, r * rowH); ctx.stroke();
  }
  // Subtle seat dots
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  const seatW = 16;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 256 / seatW; c++) {
      ctx.fillRect(c * seatW + 2, r * rowH + 2, seatW - 4, rowH - 3);
    }
  }
  return new THREE.CanvasTexture(cv);
}

function buildScoreboardTexture(label: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d')!;
  // Background
  ctx.fillStyle = '#080E18';
  ctx.fillRect(0, 0, 512, 256);
  // Blue header band
  ctx.fillStyle = '#002E5D';
  ctx.fillRect(0, 0, 512, 72);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 36);
  // Score boxes
  ctx.strokeStyle = '#3366AA';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 90, 220, 130);
  ctx.strokeRect(272, 90, 220, 130);
  ctx.fillStyle = '#3366AA';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('HOME', 130, 110);
  ctx.fillText('GUEST', 382, 110);
  ctx.fillStyle = '#FFDD00';
  ctx.font = 'bold 64px Arial Black, sans-serif';
  ctx.fillText('24', 130, 165);
  ctx.fillText('17', 382, 165);
  return new THREE.CanvasTexture(cv);
}

function createStadium(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const seatTex   = buildSeatTexture(9);
  const seatMat   = () => new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.85 });
  const byuBlue   = new THREE.MeshStandardMaterial({ color: '#002E5D', roughness: 0.82 });
  const byuWhite  = new THREE.MeshStandardMaterial({ color: '#E8EEF4', roughness: 0.80 });
  const boardMat  = new THREE.MeshStandardMaterial({ color: '#080E18', roughness: 0.85 });
  const trackMat  = new THREE.MeshStandardMaterial({ color: '#B85030', roughness: 0.88 });
  const glassMat  = new THREE.MeshStandardMaterial({ color: '#1A2A3A', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.82 });
  const concMat   = new THREE.MeshStandardMaterial({ color: '#444A52', roughness: 0.95 });
  const tunnelMat = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.95 });

  const box = (w: number, h: number, d: number, mat: THREE.MeshStandardMaterial, px = 0, py = 0, pz = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(px, py, pz); m.rotation.x = rx; m.rotation.z = rz;
    m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };

  // ── Playing field (canvas texture) ──
  const fieldTex = buildFieldTexture();
  fieldTex.anisotropy = 8;
  const fieldMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 15),
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.85 })
  );
  fieldMesh.rotation.x = -Math.PI / 2;
  fieldMesh.position.y = 0.31;
  fieldMesh.receiveShadow = true;
  g.add(fieldMesh);

  // ── Rubberized track around field ──
  const track = new THREE.Mesh(new THREE.PlaneGeometry(32, 19), trackMat.clone());
  track.rotation.x = -Math.PI / 2; track.position.y = 0.29;
  track.receiveShadow = true; g.add(track);
  // Inner track cutout via separate green apron
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(28.4, 15.4),
    new THREE.MeshStandardMaterial({ color: '#1E5C28', roughness: 0.9 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = 0.295;
  apron.receiveShadow = true; g.add(apron);

  // ── Concrete base under stands ──
  box(48, 0.5, 48, concMat, 0, -0.1, 0);

  // ── Lower seating tiers (4 sides) with seat texture ──
  box(36, 2.5, 4.5, seatMat(),   0,  1.2, -11.5, 0.30,  0);   // north
  box(36, 2.5, 4.5, seatMat(),   0,  1.2,  11.5, -0.30, 0);   // south
  box( 4.5, 2.5, 23, seatMat(),  17.5, 1.2, 0,   0,  0.30);  // east
  box( 4.5, 2.5, 23, seatMat(), -17.5, 1.2, 0,   0, -0.30);  // west

  // ── Upper seating tiers with seat texture ──
  box(38, 3, 5.5, seatMat(),   0, 4.0, -15.5, 0.35,  0);   // north
  box(38, 3, 5.5, seatMat(),   0, 4.0,  15.5, -0.35, 0);   // south
  box( 5.5, 3, 27, seatMat(),  21.5, 4.0, 0,  0,  0.35);  // east
  box( 5.5, 3, 27, seatMat(), -21.5, 4.0, 0,  0, -0.35); // west

  // ── Concourse walkways (under stands, concrete) ──
  box(36, 0.3, 2.5, concMat,  0, 0.25, -9.5);   // north walkway
  box(36, 0.3, 2.5, concMat,  0, 0.25,  9.5);   // south walkway
  box(2.5, 0.3, 23, concMat,  15, 0.25, 0);     // east walkway
  box(2.5, 0.3, 23, concMat, -15, 0.25, 0);     // west walkway

  // ── Tunnel portals (dark openings in lower tier) ──
  for (const tz of [-5, 5]) {
    box(2.5, 1.8, 0.3, tunnelMat,  17.5, 0.9, tz);  // east tunnels
    box(2.5, 1.8, 0.3, tunnelMat, -17.5, 0.9, tz);  // west tunnels
  }
  // End-zone tunnels
  box(3, 1.8, 0.3, tunnelMat, 0, 0.9, -11.4);
  box(3, 1.8, 0.3, tunnelMat, 0, 0.9,  11.4);

  // ── White rim at top of upper tier ──
  box(40, 0.35, 0.5, byuWhite,  0, 5.8, -18.5);
  box(40, 0.35, 0.5, byuWhite,  0, 5.8,  18.5);
  box( 0.5, 0.35, 30, byuWhite,  24, 5.8, 0);
  box( 0.5, 0.35, 30, byuWhite, -24, 5.8, 0);

  // ── Corner concourse fills ──
  for (const [cx2, cz2] of [[-20,-14],[20,-14],[-20,14],[20,14]] as [number,number][]) {
    box(8, 5, 8, byuBlue, cx2, 2.5, cz2);
  }

  // ── Press box (west upper deck, midfield) ──
  box(14, 2.5, 2.2, glassMat, -24.5, 5.8, 0);    // glass front
  box(14, 2.5, 2.2, byuBlue,  -25.8, 5.8, 0);    // back wall
  box(14, 0.3, 2.2, byuWhite, -24.5, 7.2, 0);    // roof
  box(14, 0.3, 2.2, byuWhite, -24.5, 4.45, 0);   // floor
  box(0.3, 2.5, 2.2, byuWhite, -17.65, 5.8, 0);  // left wall
  box(0.3, 2.5, 2.2, byuWhite, -31.35, 5.8, 0);  // right wall

  // ── Light towers (4 corners) — taller, with light cluster ──
  for (const [lx, lz] of [[-23,-17],[23,-17],[-23,17],[23,17]] as [number,number][]) {
    box(0.5, 20, 0.5, byuWhite, lx, 10, lz);      // pole
    box(4.0, 0.4, 0.5, byuWhite, lx, 19.5, lz);   // main arm
    box(0.4, 0.4, 3.0, byuWhite, lx, 19.5, lz);   // cross arm
    // light cluster (bright white boxes)
    for (const [ox, oz] of [[-1,0],[0,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5),
        new THREE.MeshStandardMaterial({ color: '#FFFAE0', emissive: '#FFFAE0', emissiveIntensity: 1.2 }));
      lm.position.set(lx + ox, 20.2, lz + oz);
      lm.castShadow = false; g.add(lm);
    }
  }

  // ── Scoreboards (both ends) with canvas texture ──
  const boardTexN = buildScoreboardTexture('LaVell Edwards Stadium');
  const boardTexS = buildScoreboardTexture('BYU COUGARS');
  // North scoreboard
  box(0.5, 10, 0.5, byuWhite, 0, 5, -20.5);
  const screenN = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5),
    new THREE.MeshStandardMaterial({ map: boardTexN, roughness: 0.5, emissive: '#112244', emissiveIntensity: 0.4 }));
  screenN.position.set(0, 11, -20.2); g.add(screenN);
  box(11.8, 0.4, 0.8, byuWhite,  0, 13.8, -20.5);
  box(11.8, 0.4, 0.8, byuBlue,   0, 8.3,  -20.5);
  // South scoreboard
  box(0.5, 10, 0.5, byuWhite, 0, 5, 20.5);
  const screenS = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5),
    new THREE.MeshStandardMaterial({ map: boardTexS, roughness: 0.5, emissive: '#112244', emissiveIntensity: 0.4 }));
  screenS.position.set(0, 11, 20.2);
  screenS.rotation.y = Math.PI;
  g.add(screenS);
  box(11.8, 0.4, 0.8, byuWhite,  0, 13.8, 20.5);
  box(11.8, 0.4, 0.8, byuBlue,   0, 8.3,  20.5);

  // ── Goal posts (2 end zones) ──
  for (const gpx of [-16, 16]) {
    box(0.2, 4.5, 0.2, byuWhite, gpx, 4.5, 0);     // base pole
    box(5.5, 0.2, 0.2, byuWhite, gpx, 6.8, 0);     // crossbar
    box(0.2, 2.2, 0.2, byuWhite, gpx - 2.5, 7.9, 0); // left upright
    box(0.2, 2.2, 0.2, byuWhite, gpx + 2.5, 7.9, 0); // right upright
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

// ─── STADIUM INTERIOR ─────────────────────────────────────────────────────────

function buildStadiumInterior(
  group: THREE.Group,
  floor: number,
  interiorMeshesRef: { current: THREE.Mesh[] },
): number {
  disposeGroup(group);
  interiorMeshesRef.current = [];

  const byuBlue  = new THREE.MeshStandardMaterial({ color: '#002E5D', roughness: 0.82 });
  const byuWhite = new THREE.MeshStandardMaterial({ color: '#E8EEF4', roughness: 0.80 });
  const trackMat = new THREE.MeshStandardMaterial({ color: '#B85030', roughness: 0.88 });
  const concMat  = new THREE.MeshStandardMaterial({ color: '#444A52', roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1A2A3A', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.82 });
  const tunnelMat = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.95 });

  const seatTex  = buildSeatTexture(9);
  const seatMat  = () => new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.85 });

  const box = (w: number, h: number, d: number, mat: THREE.MeshStandardMaterial, px = 0, py = 0, pz = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(px, py, pz); m.rotation.x = rx; m.rotation.z = rz;
    m.castShadow = m.receiveShadow = true; group.add(m); return m;
  };

  // ── FLOOR 0: Field Level ────────────────────────────────────────────────────
  if (floor === 0) {
    // Concrete base / foundation
    box(56, 0.4, 40, concMat, 0, -0.2, 0);

    // Track ring
    const track = new THREE.Mesh(new THREE.PlaneGeometry(36, 22), trackMat.clone());
    track.rotation.x = -Math.PI / 2; track.position.y = 0.21; track.receiveShadow = true; group.add(track);

    // Green apron between track and field
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(30.5, 16.5),
      new THREE.MeshStandardMaterial({ color: '#1E5C28', roughness: 0.9 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = 0.215; apron.receiveShadow = true; group.add(apron);

    // Playing field with full BYU texture
    const fieldTex = buildFieldTexture();
    fieldTex.anisotropy = 8;
    const fieldMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 15),
      new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.85 })
    );
    fieldMesh.rotation.x = -Math.PI / 2; fieldMesh.position.y = 0.22;
    fieldMesh.receiveShadow = true; group.add(fieldMesh);

    // ── Seating tiers ──────────────────────────────────────────────────────
    // Lower tiers
    box(36, 2.5, 4.5, seatMat(),   0,  1.2, -11.5, 0.30,  0);
    box(36, 2.5, 4.5, seatMat(),   0,  1.2,  11.5, -0.30, 0);
    box( 4.5, 2.5, 23, seatMat(),  17.5, 1.2, 0,   0,  0.30);
    box( 4.5, 2.5, 23, seatMat(), -17.5, 1.2, 0,   0, -0.30);
    // Upper tiers
    box(38, 3, 5.5, seatMat(),   0, 4.0, -15.5, 0.35,  0);
    box(38, 3, 5.5, seatMat(),   0, 4.0,  15.5, -0.35, 0);
    box( 5.5, 3, 27, seatMat(),  21.5, 4.0, 0,  0,  0.35);
    box( 5.5, 3, 27, seatMat(), -21.5, 4.0, 0,  0, -0.35);
    // White rim
    box(40, 0.35, 0.5, byuWhite,  0, 5.8, -18.5);
    box(40, 0.35, 0.5, byuWhite,  0, 5.8,  18.5);
    box( 0.5, 0.35, 30, byuWhite,  24, 5.8, 0);
    box( 0.5, 0.35, 30, byuWhite, -24, 5.8, 0);
    // Corner fills
    for (const [cx2, cz2] of [[-20,-14],[20,-14],[-20,14],[20,14]] as [number,number][]) {
      box(8, 5, 8, byuBlue, cx2, 2.5, cz2);
    }
    // Tunnel portals
    for (const tz of [-5, 5]) {
      box(2.5, 1.8, 0.3, tunnelMat,  17.5, 0.9, tz);
      box(2.5, 1.8, 0.3, tunnelMat, -17.5, 0.9, tz);
    }
    box(3, 1.8, 0.3, tunnelMat, 0, 0.9, -11.4);
    box(3, 1.8, 0.3, tunnelMat, 0, 0.9,  11.4);

    // ── Light towers ───────────────────────────────────────────────────────
    for (const [lx, lz] of [[-23,-17],[23,-17],[-23,17],[23,17]] as [number,number][]) {
      box(0.5, 20, 0.5, byuWhite, lx, 10, lz);
      box(4.0, 0.4, 0.5, byuWhite, lx, 19.5, lz);
      box(0.4, 0.4, 3.0, byuWhite, lx, 19.5, lz);
      for (const [ox, oz] of [[-1,0],[0,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const lm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5),
          new THREE.MeshStandardMaterial({ color: '#FFFAE0', emissive: '#FFFAE0', emissiveIntensity: 1.2 }));
        lm.position.set(lx + ox, 20.2, lz + oz); group.add(lm);
      }
    }

    // ── Scoreboards ────────────────────────────────────────────────────────
    const boardTexN = buildScoreboardTexture('LaVell Edwards Stadium');
    const boardTexS = buildScoreboardTexture('BYU COUGARS');
    box(0.5, 10, 0.5, byuWhite, 0, 5, -20.5);
    const screenN = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5),
      new THREE.MeshStandardMaterial({ map: boardTexN, roughness: 0.5, emissive: '#112244', emissiveIntensity: 0.4 }));
    screenN.position.set(0, 11, -20.2); group.add(screenN);
    box(11.8, 0.4, 0.8, byuWhite,  0, 13.8, -20.5);
    box(11.8, 0.4, 0.8, byuBlue,   0, 8.3,  -20.5);
    box(0.5, 10, 0.5, byuWhite, 0, 5, 20.5);
    const screenS = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5),
      new THREE.MeshStandardMaterial({ map: boardTexS, roughness: 0.5, emissive: '#112244', emissiveIntensity: 0.4 }));
    screenS.position.set(0, 11, 20.2); screenS.rotation.y = Math.PI; group.add(screenS);
    box(11.8, 0.4, 0.8, byuWhite,  0, 13.8, 20.5);
    box(11.8, 0.4, 0.8, byuBlue,   0, 8.3,  20.5);

    // ── Goal posts ─────────────────────────────────────────────────────────
    for (const gpx of [-16, 16]) {
      box(0.2, 4.5, 0.2, byuWhite, gpx, 4.5, 0);
      box(5.5, 0.2, 0.2, byuWhite, gpx, 6.8, 0);
      box(0.2, 2.2, 0.2, byuWhite, gpx - 2.5, 7.9, 0);
      box(0.2, 2.2, 0.2, byuWhite, gpx + 2.5, 7.9, 0);
    }

    // ── Press box (west upper deck, visible from field) ─────────────────
    box(14, 2.5, 2.2, glassMat, -24.5, 5.8, 0);
    box(14, 2.5, 2.2, byuBlue,  -25.8, 5.8, 0);
    box(14, 0.3, 2.2, byuWhite, -24.5, 7.2, 0);
    box(14, 0.3, 2.2, byuWhite, -24.5, 4.45, 0);
    box(0.3, 2.5, 2.2, byuWhite, -17.65, 5.8, 0);
    box(0.3, 2.5, 2.2, byuWhite, -31.35, 5.8, 0);
  }

  // ── FLOOR 1: Upper Concourse / Press Box ────────────────────────────────────
  if (floor === 1) {
    const concFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 14),
      new THREE.MeshStandardMaterial({ color: '#4A5058', roughness: 0.95 }));
    concFloor.rotation.x = -Math.PI / 2; concFloor.position.y = 0; concFloor.receiveShadow = true; group.add(concFloor);

    // Glass rail at the front (south edge, looking toward field)
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(48, 1.2),
      new THREE.MeshStandardMaterial({ color: '#B0CCDC', roughness: 0.04, metalness: 0.18, transparent: true, opacity: 0.5 }));
    rail.position.set(0, 0.6, -6.5); group.add(rail);
    box(48, 0.08, 0.08, byuWhite, 0, 1.25, -6.5); // top rail cap

    // Parapet / back wall
    box(50, 2.0, 0.4, byuBlue, 0, 1.0, 6.5);
    // Outer wall segments (east/west)
    box(0.4, 2.0, 14, byuBlue, -24.8, 1.0, 0);
    box(0.4, 2.0, 14, byuBlue,  24.8, 1.0, 0);

    // Broadcast booth tables + monitors
    const deskMat  = new THREE.MeshStandardMaterial({ color: '#C8D4E0', roughness: 0.7 });
    const monMat   = new THREE.MeshStandardMaterial({ color: '#1C2030', roughness: 0.5 });
    const scrMat   = new THREE.MeshStandardMaterial({ color: '#2060A0', roughness: 0.2, emissive: new THREE.Color('#0840A0'), emissiveIntensity: 0.35 });
    const chairMat = new THREE.MeshStandardMaterial({ color: '#A8B8CC', roughness: 0.85 });

    for (const dx of [-18, -9, 0, 9, 18]) {
      // Desk
      const desk = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.07, 1.0), deskMat.clone());
      desk.position.set(dx, 0.8, -4.0); desk.castShadow = true; group.add(desk);
      desk.userData.interiorElement = { type: 'desk', label: 'Broadcast Booth' };
      interiorMeshesRef.current.push(desk);
      // Legs
      for (const [lx, lz] of [[-2.5,-0.4],[2.5,-0.4],[-2.5,0.4],[2.5,0.4]] as [number,number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), deskMat.clone());
        leg.position.set(dx + lx, 0.4, -4.0 + lz); group.add(leg);
      }
      // Monitor
      const mon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.07), monMat.clone());
      mon.position.set(dx, 1.38, -4.2); group.add(mon);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.88, 0.01), scrMat.clone());
      scr.position.set(dx, 1.38, -4.16); group.add(scr);
      // Chair
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.55), chairMat.clone());
      seat.position.set(dx, 0.46, -3.3); group.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), chairMat.clone());
      back.position.set(dx, 0.76, -3.05); group.add(back);
    }

    // Ceiling light strips
    const lightMat = new THREE.MeshStandardMaterial({
      color: '#D8E8FF', emissive: new THREE.Color('#A8C4F0'), emissiveIntensity: 0.9, roughness: 0.2,
    });
    for (let s = -20; s <= 20; s += 10) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 11), lightMat.clone());
      strip.position.set(s, 3.95, 0); group.add(strip);
    }
    // Ceiling panel
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(50, 14),
      new THREE.MeshStandardMaterial({ color: '#F2F6FF', roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.0; group.add(ceil);

    // City-view backdrop behind glass rail
    const extTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#87CEEB'; c.fillRect(0, 0, 512, 80);
      c.fillStyle = '#5588AA'; c.fillRect(0, 80, 512, 48);
      // Silhouette buildings
      c.fillStyle = '#1A2A3A';
      for (let i = 0; i < 14; i++) {
        const bx = i * 38, bw = 18 + (i % 3) * 8, bh = 30 + (i % 5) * 15;
        c.fillRect(bx, 80 - bh, bw, bh);
      }
      return new THREE.CanvasTexture(cv);
    })();
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(48, 4),
      new THREE.MeshBasicMaterial({ map: extTex, side: THREE.DoubleSide }));
    backdrop.position.set(0, 1.5, -9); group.add(backdrop);
  }

  return 2; // 2 floors: field level + upper concourse
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

  // BYU stadium gets its own interior — not an office
  if (block.col === 2 && block.row === 2) {
    return buildStadiumInterior(group, floor, interiorMeshesRef);
  }

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
  sunColor: string; fillIntensity: number; bloomIntensity: number;
}

// Time-of-day keyframes — interpolated by fractional hour
const SKY_KEYFRAMES: { hour: number; cfg: SkyConfig }[] = [
  { hour: 0,    cfg: { zenith: '#0A0E1A', horizon: '#1A2030', fogColor: 0x0A0E1A, fogDensity: 0, sunIntensity: 0.08, hemiIntensity: 0.12, sunX: -80, sunY: -50, sunZ: -120, sunColor: '#8090B0', fillIntensity: 0.05, bloomIntensity: 1.8 } },
  { hour: 5,    cfg: { zenith: '#1A2040', horizon: '#3A3050', fogColor: 0x1A2040, fogDensity: 0, sunIntensity: 0.15, hemiIntensity: 0.18, sunX: -60, sunY: 10, sunZ: -120, sunColor: '#9080A0', fillIntensity: 0.08, bloomIntensity: 1.4 } },
  { hour: 6,    cfg: { zenith: '#4A6888', horizon: '#E8A870', fogColor: 0xD8B898, fogDensity: 0, sunIntensity: 1.0, hemiIntensity: 0.35, sunX: -40, sunY: 30, sunZ: -120, sunColor: '#FFB870', fillIntensity: 0.15, bloomIntensity: 0.6 } },
  { hour: 7.5,  cfg: { zenith: '#5A98C0', horizon: '#F0D8B0', fogColor: 0xF0E0C8, fogDensity: 0, sunIntensity: 1.8, hemiIntensity: 0.50, sunX: 20, sunY: 100, sunZ: -120, sunColor: '#FFE8C8', fillIntensity: 0.25, bloomIntensity: 0.2 } },
  { hour: 10,   cfg: { zenith: '#6AA8CC', horizon: '#EEE8DC', fogColor: 0xEEE8DC, fogDensity: 0, sunIntensity: 2.6, hemiIntensity: 0.65, sunX: 80, sunY: 200, sunZ: -120, sunColor: '#FFFFFF', fillIntensity: 0.35, bloomIntensity: 0.12 } },
  { hour: 14,   cfg: { zenith: '#6AA8CC', horizon: '#EEE8DC', fogColor: 0xEEE8DC, fogDensity: 0, sunIntensity: 2.6, hemiIntensity: 0.65, sunX: 80, sunY: 200, sunZ: -120, sunColor: '#FFFFFF', fillIntensity: 0.35, bloomIntensity: 0.12 } },
  { hour: 17,   cfg: { zenith: '#5898B8', horizon: '#F0D0A0', fogColor: 0xF0D8B0, fogDensity: 0, sunIntensity: 2.0, hemiIntensity: 0.55, sunX: 40, sunY: 80, sunZ: 120, sunColor: '#FFD8A0', fillIntensity: 0.20, bloomIntensity: 0.3 } },
  { hour: 18.5, cfg: { zenith: '#3A5878', horizon: '#E8A058', fogColor: 0xD8A070, fogDensity: 0, sunIntensity: 1.2, hemiIntensity: 0.35, sunX: 20, sunY: 25, sunZ: 120, sunColor: '#FF9050', fillIntensity: 0.12, bloomIntensity: 0.7 } },
  { hour: 19.5, cfg: { zenith: '#1C2848', horizon: '#6A4060', fogColor: 0x2A2040, fogDensity: 0, sunIntensity: 0.3, hemiIntensity: 0.20, sunX: 10, sunY: 5, sunZ: 120, sunColor: '#C06848', fillIntensity: 0.08, bloomIntensity: 1.2 } },
  { hour: 20.5, cfg: { zenith: '#0C1424', horizon: '#1A2438', fogColor: 0x0C1424, fogDensity: 0, sunIntensity: 0.08, hemiIntensity: 0.12, sunX: -80, sunY: -50, sunZ: 120, sunColor: '#8090B0', fillIntensity: 0.05, bloomIntensity: 1.8 } },
  { hour: 24,   cfg: { zenith: '#0A0E1A', horizon: '#1A2030', fogColor: 0x0A0E1A, fogDensity: 0, sunIntensity: 0.08, hemiIntensity: 0.12, sunX: -80, sunY: -50, sunZ: -120, sunColor: '#8090B0', fillIntensity: 0.05, bloomIntensity: 1.8 } },
];

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const r = Math.round(((pa >> 16) & 0xff) * (1 - t) + ((pb >> 16) & 0xff) * t);
  const g = Math.round(((pa >> 8) & 0xff) * (1 - t) + ((pb >> 8) & 0xff) * t);
  const bl = Math.round((pa & 0xff) * (1 - t) + (pb & 0xff) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

function lerpFogColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar * (1 - t) + br * t);
  const g = Math.round(ag * (1 - t) + bg * t);
  const bl = Math.round(ab * (1 - t) + bb * t);
  return (r << 16) | (g << 8) | bl;
}

function getSkyConfig(hour: number): SkyConfig {
  // Clamp to 0-24 range
  hour = ((hour % 24) + 24) % 24;

  // Find surrounding keyframes and interpolate
  let lo = SKY_KEYFRAMES[0], hi = SKY_KEYFRAMES[1];
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    if (hour >= SKY_KEYFRAMES[i].hour && hour < SKY_KEYFRAMES[i + 1].hour) {
      lo = SKY_KEYFRAMES[i];
      hi = SKY_KEYFRAMES[i + 1];
      break;
    }
  }

  const span = hi.hour - lo.hour;
  const t = span > 0 ? (hour - lo.hour) / span : 0;
  const a = lo.cfg, b = hi.cfg;

  return {
    zenith: lerpColor(a.zenith, b.zenith, t),
    horizon: lerpColor(a.horizon, b.horizon, t),
    fogColor: lerpFogColor(a.fogColor, b.fogColor, t),
    fogDensity: 0,
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    sunX: a.sunX + (b.sunX - a.sunX) * t,
    sunY: a.sunY + (b.sunY - a.sunY) * t,
    sunZ: a.sunZ + (b.sunZ - a.sunZ) * t,
    sunColor: lerpColor(a.sunColor, b.sunColor, t),
    fillIntensity: a.fillIntensity + (b.fillIntensity - a.fillIntensity) * t,
    bloomIntensity: a.bloomIntensity + (b.bloomIntensity - a.bloomIntensity) * t,
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
  if (arch === 'stadium') {
    // Outer bowl outline
    ctx.strokeStyle = '#E8EEF4AA'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    // Seating sections
    ctx.fillStyle = '#002E5D55';
    ctx.fillRect(3, 3, W - 6, H * 0.18);           // north stands
    ctx.fillRect(3, H - H * 0.18 - 3, W - 6, H * 0.18); // south stands
    ctx.fillRect(3, H * 0.18, W * 0.12, H * 0.64); // west stands
    ctx.fillRect(W - W * 0.12 - 3, H * 0.18, W * 0.12, H * 0.64); // east stands
    // Track ring
    ctx.strokeStyle = '#B8503066'; ctx.lineWidth = 3;
    const tx = W * 0.12 + 3, ty = H * 0.18 + 3, tw = W * 0.76 - 6, th = H * 0.64 - 6;
    ctx.strokeRect(tx, ty, tw, th);
    // Playing field (green)
    const fx = tx + tw * 0.06, fy = ty + th * 0.08, fw = tw * 0.88, fh = th * 0.84;
    ctx.fillStyle = '#2A703488'; ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = '#FFFFFF55'; ctx.lineWidth = 1;
    ctx.strokeRect(fx, fy, fw, fh);
    // Yard lines
    for (let i = 1; i < 10; i++) {
      const lx = fx + fw * i / 10;
      ctx.beginPath(); ctx.moveTo(lx, fy); ctx.lineTo(lx, fy + fh); ctx.stroke();
    }
    // "50" at midfield
    ctx.fillStyle = '#FFFFFFCC'; ctx.font = `bold ${Math.round(H * 0.16)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('50', W / 2, H / 2);
  } else if (arch === 'tower' || arch === 'spire') {
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
  appData?: WorldViewAppData;
  onNavigateToSection?: (section: string) => void;
}

export function WorldView({ contactTags, districtTagMap, onDistrictTagMapChange, appData, onNavigateToSection }: WorldViewProps = {}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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

  // Data-driven city refs
  const districtBuildingMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const districtIndicatorsRef = useRef<Map<string, THREE.Group>>(new Map());
  const originalMaterialsRef = useRef<Map<THREE.Mesh, { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }>>(new Map());
  const healthEmissiveRef = useRef<Map<string, { color: number; intensity: number }>>(new Map());
  const appDataRef = useRef(appData);
  appDataRef.current = appData;
  const treeGroupsRef = useRef<THREE.Group[]>([]);
  const parkBlockInfosRef = useRef<{ cx: number; cz: number }[]>([]);
  const goalIndicatorsRef = useRef<Map<string, THREE.Group>>(new Map());
  const financialBillboardRef = useRef<{ mesh: THREE.Mesh; texture: THREE.CanvasTexture } | null>(null);
  const courseIndicatorsRef = useRef<THREE.Group | null>(null);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const blocksRef = useRef<BlockInfo[]>([]);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
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
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
    scene.add(skyMesh);

    // ── Lighting ──────────────────────────────────────────────────────────────
    const sun = new THREE.DirectionalLight('#ffffff', 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 1200;
    sun.shadow.camera.left   = -320;
    sun.shadow.camera.right  = 320;
    sun.shadow.camera.top    = 320;
    sun.shadow.camera.bottom = -320;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.02;
    (sun.shadow as THREE.DirectionalLightShadow & { radius?: number }).radius = 3;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight('#C8D8F0', '#D8D0C0', 0.65);
    scene.add(hemi);

    // Warm fill light from opposite direction for warm/cool contrast
    const fillLight = new THREE.DirectionalLight('#FFE8D0', 0.35);
    fillLight.position.set(-80, 100, 120);
    scene.add(fillLight);

    // Night lights removed — always daytime, no night light meshes needed

    // ── Time of day ───────────────────────────────────────────────────────────
    function applyTimeOfDay() {
      const now = new Date();
      const cfg = getSkyConfig(now.getHours() + now.getMinutes() / 60);
      skyMat.uniforms.uHorizon.value.set(cfg.horizon);
      skyMat.uniforms.uZenith.value.set(cfg.zenith);
      skyMat.uniforms.uSunDir.value.set(cfg.sunX, cfg.sunY, cfg.sunZ).normalize();
      sun.position.set(cfg.sunX, cfg.sunY, cfg.sunZ);
      sun.intensity  = cfg.sunIntensity;
      sun.color.set(cfg.sunColor);
      hemi.intensity = cfg.hemiIntensity;
      fillLight.intensity = cfg.fillIntensity;
      scene.fog      = new THREE.Fog(cfg.fogColor, 250, 900);
      cityLightRef.current = { sunI: cfg.sunIntensity, hemiI: cfg.hemiIntensity, fogColor: cfg.fogColor, fogDensity: 0 };
    }
    applyTimeOfDay();
    const todInterval = setInterval(applyTimeOfDay, 60_000);

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 2000);

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
    // Direct rendering (no postprocessing composer)

    // ── Materials (shared, cloned per building) ───────────────────────────────
    // Generate PMREM env map from sky for glass reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileCubemapShader();
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat.clone()));
    const envRT = pmremGenerator.fromScene(envScene, 0, 0.1, 1600);
    const envMap = envRT.texture;
    pmremGenerator.dispose();

    const mats = makeArchMats();
    mats.glass.envMap = envMap;
    mats.glass.envMapIntensity = 0.8;

    // ── City grid parameters ───────────────────────────────────────────────────
    const GRID_N    = 13;
    const BLOCK_SIZE = 50;
    const HALF       = Math.floor(GRID_N / 2);
    const STEP       = 54; // average spacing reference

    // Non-uniform block center positions — varying gaps create avenues vs side streets
    //            col: -6    -5    -4    -3    -2    -1     0     1     2     3     4     5     6
    const COL_CENTERS = [-350, -292, -232, -174, -118, -58,   0,   60, 122, 180, 242, 298, 356];
    const ROW_CENTERS = [-350, -290, -230, -172, -116, -58,   0,   58, 118, 176, 236, 294, 354];

    // Road: asphalt grain canvas texture with aggregate and wear
    const roadCanvas = document.createElement('canvas'); roadCanvas.width = roadCanvas.height = 256;
    const rCtx = roadCanvas.getContext('2d')!;
    // Base asphalt
    rCtx.fillStyle = '#1E1E20'; rCtx.fillRect(0, 0, 256, 256);
    // Aggregate particles (fine gravel texture)
    for (let i = 0; i < 4000; i++) {
      const brightness = 20 + Math.floor(Math.random() * 30);
      rCtx.fillStyle = `rgb(${brightness},${brightness},${brightness + Math.floor(Math.random()*5)})`;
      rCtx.fillRect(Math.random()*256, Math.random()*256, 1+Math.random()*1.5, 1+Math.random());
    }
    // Lighter aggregate flecks
    for (let i = 0; i < 800; i++) {
      rCtx.fillStyle = `rgba(255,255,255,${0.02 + Math.random()*0.04})`;
      rCtx.fillRect(Math.random()*256, Math.random()*256, 1+Math.random()*2, 1);
    }
    // Dark patches (oil stains, wear)
    for (let i = 0; i < 30; i++) {
      rCtx.fillStyle = `rgba(0,0,0,${0.04 + Math.random()*0.06})`;
      const px = Math.random()*256, py = Math.random()*256;
      rCtx.beginPath(); rCtx.ellipse(px, py, 3+Math.random()*8, 2+Math.random()*5, Math.random()*Math.PI, 0, Math.PI*2);
      rCtx.fill();
    }
    // Subtle crack lines
    for (let i = 0; i < 6; i++) {
      rCtx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random()*0.1})`;
      rCtx.lineWidth = 0.5 + Math.random();
      rCtx.beginPath();
      let cx = Math.random()*256, cy = Math.random()*256;
      rCtx.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (Math.random()-0.5)*40; cy += (Math.random()-0.5)*40;
        rCtx.lineTo(cx, cy);
      }
      rCtx.stroke();
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas); roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(4, 4);
    const roadMat  = new THREE.MeshStandardMaterial({ map: roadTex, color: '#1C1C1E', roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#D8DDE3', roughness: 0.90, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#F5E642', roughness: 0.60, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

    // White edge line material for road shoulders
    const edgeLineMat = new THREE.MeshStandardMaterial({ color: '#E8E8E4', roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

    const ROAD_W = 4;
    const GRID_EXTENT = Math.max(Math.abs(COL_CENTERS[0]), COL_CENTERS[GRID_N - 1]) + BLOCK_SIZE / 2 + 4;

    // ── Island terrain (ocean → beach → foam → city ground) ──────────────────
    // Water shader (declared early so ocean can reuse it; same ref used for city water blocks below)
    const waterShaderMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.45, 0.65, -0.62).normalize() } },
      vertexShader: `varying vec2 vUv; varying vec3 vWorldPos;
        void main() { vUv = uv; vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uSunDir;
        varying vec2 vUv; varying vec3 vWorldPos;
        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main() {
          vec2 uv = vUv * 12.0;
          float w1 = noise(uv + uTime * 0.15);
          float w2 = noise(uv * 2.3 - uTime * 0.22) * 0.5;
          float w3 = noise(uv * 5.0 + uTime * 0.08) * 0.25;
          float waves = w1 + w2 + w3;
          vec3 deepCol = vec3(0.12, 0.30, 0.50);
          vec3 shallowCol = vec3(0.28, 0.55, 0.72);
          vec3 col = mix(deepCol, shallowCol, waves);
          // Fresnel approximation
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, vec3(0,1,0)), 0.0), 3.0);
          col = mix(col, vec3(0.7, 0.85, 0.95), fresnel * 0.4);
          // Sun specular
          float spec = pow(max(dot(reflect(-uSunDir, vec3(0,1,0)), viewDir), 0.0), 64.0);
          col += vec3(1.0, 0.95, 0.85) * spec * 0.3;
          gl_FragColor = vec4(col, 0.78 + fresnel * 0.15);
        }`,
    });

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), waterShaderMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.2;
    cityGroup.add(ocean);

    // ── Beach: wet/dry sand gradient with noise detail ──
    const beachMat = new THREE.ShaderMaterial({
      uniforms: { uInnerR: { value: GRID_EXTENT - 24 }, uOuterR: { value: GRID_EXTENT + 130 } },
      vertexShader: `varying vec2 vUv; varying vec3 vWorldPos;
        void main(){ vUv=uv; vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uInnerR; uniform float uOuterR;
        varying vec2 vUv; varying vec3 vWorldPos;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float dist = length(vWorldPos.xz);
          float t = clamp((dist - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);
          // Multi-octave sand noise
          float n = noise(vWorldPos.xz*0.12)*0.5 + noise(vWorldPos.xz*0.35)*0.25 + noise(vWorldPos.xz*0.8)*0.15 + noise(vWorldPos.xz*2.0)*0.06;
          // Dry sand (warm beige) → wet sand (dark tan near water)
          vec3 drySand = vec3(0.88,0.78,0.55) + vec3(n*0.08, n*0.06, n*0.02);
          vec3 wetSand = vec3(0.52,0.44,0.30) + vec3(n*0.04, n*0.03, n*0.01);
          vec3 sand = mix(drySand, wetSand, smoothstep(0.5, 0.95, t));
          // Dark debris streaks
          float streak = noise(vWorldPos.xz * vec2(0.03, 0.15)) * noise(vWorldPos.xz * vec2(0.15, 0.04));
          sand -= vec3(streak * 0.08);
          // Subtle wet sheen near water
          float wetSheen = smoothstep(0.75, 0.95, t) * 0.15;
          sand += vec3(wetSheen * 0.5, wetSheen * 0.6, wetSheen * 0.8);
          gl_FragColor = vec4(sand, 1.0);
        }`,
    });
    const beach = new THREE.Mesh(new THREE.RingGeometry(GRID_EXTENT - 24, GRID_EXTENT + 130, 96), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = -0.05;
    beach.receiveShadow = true;
    cityGroup.add(beach);

    // ── Animated foam lines (3 concentric, animated opacity) ──
    const foamShaderMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uInnerR: { value: GRID_EXTENT + 105 } },
      vertexShader: `varying vec3 vWorldPos;
        void main(){ vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uInnerR;
        varying vec3 vWorldPos;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float dist = length(vWorldPos.xz);
          float angle = atan(vWorldPos.z, vWorldPos.x);
          // 3 foam lines at different distances, animated
          float wave1 = sin(dist*0.12 + uTime*0.8 + angle*2.0)*0.5+0.5;
          float wave2 = sin(dist*0.15 + uTime*0.6 - angle*1.5)*0.5+0.5;
          float n = noise(vWorldPos.xz*0.3 + uTime*0.1);
          float foam = wave1 * 0.6 + wave2 * 0.4;
          foam *= smoothstep(uInnerR - 5.0, uInnerR + 8.0, dist) * smoothstep(uInnerR + 35.0, uInnerR + 15.0, dist);
          foam += n * 0.2 * smoothstep(uInnerR, uInnerR + 20.0, dist);
          vec3 col = vec3(0.95, 0.96, 0.94);
          gl_FragColor = vec4(col, foam * 0.7);
        }`,
    });
    const foam = new THREE.Mesh(new THREE.RingGeometry(GRID_EXTENT + 90, GRID_EXTENT + 140, 96), foamShaderMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = -0.03;
    cityGroup.add(foam);

    // ── Beach rocks ──
    const rockMat = new THREE.MeshStandardMaterial({ color: '#6E6860', roughness: 0.92, metalness: 0.02 });
    const darkRockMat = new THREE.MeshStandardMaterial({ color: '#4A4640', roughness: 0.95, metalness: 0.02 });
    const beachRng = seededRandom('beach-rocks');
    for (let i = 0; i < 120; i++) {
      const angle = beachRng() * Math.PI * 2;
      const dist = GRID_EXTENT + 20 + beachRng() * 95;
      const rx = Math.cos(angle) * dist;
      const rz = Math.sin(angle) * dist;
      const scale = 0.3 + beachRng() * 1.8;
      const mat = beachRng() > 0.5 ? rockMat : darkRockMat;
      const geo = beachRng() > 0.4
        ? new THREE.DodecahedronGeometry(scale, 0)
        : new THREE.SphereGeometry(scale, 5, 4);
      const rock = new THREE.Mesh(geo, mat.clone());
      rock.position.set(rx, -0.05 + scale * 0.25, rz);
      rock.rotation.set(beachRng() * Math.PI, beachRng() * Math.PI, 0);
      rock.scale.set(1, 0.4 + beachRng() * 0.4, 1 + beachRng() * 0.5);
      rock.castShadow = true; rock.receiveShadow = true;
      cityGroup.add(rock);
    }

    // ── Driftwood ──
    const driftMat = new THREE.MeshStandardMaterial({ color: '#9E8E70', roughness: 0.95 });
    for (let i = 0; i < 30; i++) {
      const angle = beachRng() * Math.PI * 2;
      const dist = GRID_EXTENT + 60 + beachRng() * 55;
      const dx = Math.cos(angle) * dist;
      const dz = Math.sin(angle) * dist;
      const len = 1.5 + beachRng() * 4;
      const drift = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08 + beachRng() * 0.12, 0.04, len, 5),
        driftMat.clone()
      );
      drift.position.set(dx, -0.02, dz);
      drift.rotation.set(0, beachRng() * Math.PI, Math.PI / 2 + (beachRng() - 0.5) * 0.3);
      drift.castShadow = true;
      cityGroup.add(drift);
    }

    // ── Beach grass tufts near city edge ──
    const grassBladeMat = new THREE.MeshStandardMaterial({ color: '#7A9848', roughness: 0.85, side: THREE.DoubleSide });
    const darkGrassMat = new THREE.MeshStandardMaterial({ color: '#5A7830', roughness: 0.88, side: THREE.DoubleSide });
    for (let i = 0; i < 80; i++) {
      const angle = beachRng() * Math.PI * 2;
      const dist = GRID_EXTENT - 10 + beachRng() * 40;
      const gx = Math.cos(angle) * dist;
      const gz = Math.sin(angle) * dist;
      const clump = new THREE.Group();
      clump.position.set(gx, 0, gz);
      const nBlades = 4 + Math.floor(beachRng() * 6);
      for (let b = 0; b < nBlades; b++) {
        const blade = new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, 0.8 + beachRng() * 0.6),
          beachRng() > 0.4 ? grassBladeMat : darkGrassMat
        );
        blade.position.set((beachRng() - 0.5) * 0.5, 0.35, (beachRng() - 0.5) * 0.5);
        blade.rotation.set(-0.2 + beachRng() * 0.15, beachRng() * Math.PI, 0);
        clump.add(blade);
      }
      cityGroup.add(clump);
    }

    const groundShaderMat = new THREE.ShaderMaterial({
      uniforms: { uBaseColor: { value: new THREE.Color('#D0C8B8') } },
      vertexShader: `varying vec2 vUv; varying vec3 vWorldPos;
        void main() { vUv = uv; vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uBaseColor; varying vec3 vWorldPos;
        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main() {
          float n = noise(vWorldPos.xz * 0.08) * 0.06;
          vec3 col = uBaseColor + vec3(n, n*0.8, n*0.5);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(GRID_EXTENT + 12, 80),
      groundShaderMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    // ── Roads (non-uniform spacing, segmented sidewalks, clean intersections) ──
    // Compute road positions from midpoints between adjacent block centers
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

    // Flat arrays for intersection / dash checks
    const roadXposArr = roadXs.map(r => r.pos);
    const roadZposArr = roadZs.map(r => r.pos);

    // Lamp post materials (shared across all posts)
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: '#505860', roughness: 0.8 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#FFF8E0', emissive: new THREE.Color('#FFF8E0'), emissiveIntensity: 0.6, roughness: 0.4 });
    const lampPoleGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.5, 6);
    const lampHeadGeo = new THREE.BoxGeometry(0.6, 0.25, 0.25);

    // Vertical roads
    for (const { pos: xPos, w: rw } of roadXs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(rw, GRID_EXTENT * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(xPos, 0.04, 0);
      road.receiveShadow = true;
      cityGroup.add(road);
      // White edge lines on both sides
      for (const side of [-1, 1]) {
        const edgeLine = new THREE.Mesh(new THREE.PlaneGeometry(0.12, GRID_EXTENT * 2), edgeLineMat);
        edgeLine.rotation.x = -Math.PI / 2;
        edgeLine.position.set(xPos + side * (rw / 2 - 0.15), 0.06, 0);
        cityGroup.add(edgeLine);
      }
      const curbMat = new THREE.MeshStandardMaterial({ color: '#C8D0D4', roughness: 0.92 });
      for (let s = 0; s < roadZs.length - 1; s++) {
        const zStart = roadZs[s].pos   + roadZs[s].w / 2 + 0.15;
        const zEnd   = roadZs[s+1].pos - roadZs[s+1].w / 2 - 0.15;
        const segLen = zEnd - zStart;
        if (segLen <= 0) continue;
        const zMid = (zStart + zEnd) / 2;
        for (const side of [-1, 1]) {
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, segLen), swalkMat);
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(xPos + side * (rw / 2 + 0.8), 0.05, zMid);
          sw.receiveShadow = true;
          cityGroup.add(sw);
          const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, segLen), curbMat.clone());
          curb.position.set(xPos + side * (rw / 2 + 0.11), 0.08, zMid);
          curb.receiveShadow = true; curb.castShadow = true;
          cityGroup.add(curb);
          if (Math.abs(xPos) <= 200) {
            for (let lz = zStart + 4; lz <= zEnd - 4; lz += 12) {
              const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
              pole.position.set(xPos + side * (rw / 2 + 1.5), 1.75, lz);
              pole.castShadow = true;
              cityGroup.add(pole);
              const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
              head.position.set(xPos + side * (rw / 2 + 1.5), 3.625, lz);
              cityGroup.add(head);
            }
          }
        }
      }
      for (let dz = -GRID_EXTENT + 3; dz < GRID_EXTENT; dz += 6) {
        if (roadZposArr.some(rz => Math.abs(dz - rz) < ROAD_W)) continue;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(xPos, 0.07, dz);
        cityGroup.add(d);
      }
    }

    // Horizontal roads
    for (const { pos: zPos, w: rw } of roadZs) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, rw), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.04, zPos);
      road.receiveShadow = true;
      cityGroup.add(road);
      // White edge lines on both sides
      for (const side of [-1, 1]) {
        const edgeLine = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, 0.12), edgeLineMat);
        edgeLine.rotation.x = -Math.PI / 2;
        edgeLine.position.set(0, 0.06, zPos + side * (rw / 2 - 0.15));
        cityGroup.add(edgeLine);
      }
      const hCurbMat = new THREE.MeshStandardMaterial({ color: '#C8D0D4', roughness: 0.92 });
      for (let s = 0; s < roadXs.length - 1; s++) {
        const xStart = roadXs[s].pos   + roadXs[s].w / 2 + 0.15;
        const xEnd   = roadXs[s+1].pos - roadXs[s+1].w / 2 - 0.15;
        const segLen = xEnd - xStart;
        if (segLen <= 0) continue;
        const xMid = (xStart + xEnd) / 2;
        for (const side of [-1, 1]) {
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(segLen, 1.6), swalkMat);
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(xMid, 0.05, zPos + side * (rw / 2 + 0.8));
          sw.receiveShadow = true;
          cityGroup.add(sw);
          const curb = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.14, 0.22), hCurbMat.clone());
          curb.position.set(xMid, 0.08, zPos + side * (rw / 2 + 0.11));
          curb.receiveShadow = true; curb.castShadow = true;
          cityGroup.add(curb);
          if (Math.abs(zPos) <= 200) {
            for (let lx = xStart + 4; lx <= xEnd - 4; lx += 12) {
              const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
              pole.position.set(lx, 1.75, zPos + side * (rw / 2 + 1.5));
              pole.castShadow = true;
              cityGroup.add(pole);
              const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
              head.position.set(lx, 3.625, zPos + side * (rw / 2 + 1.5));
              cityGroup.add(head);
            }
          }
        }
      }
      for (let dx = -GRID_EXTENT + 3; dx < GRID_EXTENT; dx += 6) {
        if (roadXposArr.some(rx => Math.abs(dx - rx) < ROAD_W)) continue;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(dx, 0.07, zPos);
        cityGroup.add(d);
      }
    }

    // Intersection fill squares (clean asphalt at every crossing)
    for (const { pos: xPos, w: xw } of roadXs) {
      for (const { pos: zPos, w: zw } of roadZs) {
        const iw = Math.max(xw, zw) + 0.5;
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(iw, iw), roadMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(xPos, 0.045, zPos);
        cityGroup.add(fill);
      }
    }

    // ── Crosswalk markings at downtown/midrise intersections ──────────────────
    {
      const cwCanvas = document.createElement('canvas');
      cwCanvas.width = 64; cwCanvas.height = 128;
      const cwCtx = cwCanvas.getContext('2d')!;
      cwCtx.fillStyle = '#222222'; cwCtx.fillRect(0, 0, 64, 128);
      for (let s = 0; s < 5; s++) {
        cwCtx.fillStyle = '#E8E8E8';
        cwCtx.fillRect(4, 8 + s * 23, 56, 13);
      }
      const cwTex = new THREE.CanvasTexture(cwCanvas);
      const cwMat = new THREE.MeshStandardMaterial({ map: cwTex, roughness: 0.95, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      for (const { pos: xPos, w: xw } of roadXs) {
        for (const { pos: zPos, w: zw } of roadZs) {
          // Only at downtown + midrise intersections
          if (Math.abs(xPos) > 200 || Math.abs(zPos) > 200) continue;
          const halfRx = xw / 2;
          const halfRz = zw / 2;
          // 4 approaches: N, S, E, W
          const cwW = Math.min(xw, zw) - 1.5;
          const cwLen = 3.5;
          // North approach
          const cwN = new THREE.Mesh(new THREE.PlaneGeometry(cwW, cwLen), cwMat);
          cwN.rotation.x = -Math.PI / 2;
          cwN.position.set(xPos, 0.08,zPos - halfRz - cwLen / 2 - 0.1);
          cityGroup.add(cwN);
          // South approach
          const cwS = new THREE.Mesh(new THREE.PlaneGeometry(cwW, cwLen), cwMat);
          cwS.rotation.x = -Math.PI / 2;
          cwS.position.set(xPos, 0.08,zPos + halfRz + cwLen / 2 + 0.1);
          cityGroup.add(cwS);
          // West approach (rotated 90°)
          const cwW2 = new THREE.Mesh(new THREE.PlaneGeometry(cwLen, cwW), cwMat);
          cwW2.rotation.x = -Math.PI / 2;
          cwW2.position.set(xPos - halfRx - cwLen / 2 - 0.1, 0.08,zPos);
          cityGroup.add(cwW2);
          // East approach
          const cwE = new THREE.Mesh(new THREE.PlaneGeometry(cwLen, cwW), cwMat);
          cwE.rotation.x = -Math.PI / 2;
          cwE.position.set(xPos + halfRx + cwLen / 2 + 0.1, 0.08,zPos);
          cityGroup.add(cwE);
        }
      }
    }

    // ── Diagonal "Broadway" avenue ──────────────────────────────────────────────
    interface DiagAvenue { points: [number, number][]; width: number; name: string; }
    const DIAGONALS: DiagAvenue[] = [{
      points: [
        [COL_CENTERS[1],  ROW_CENTERS[0]],
        [COL_CENTERS[4],  ROW_CENTERS[3]],
        [COL_CENTERS[7],  ROW_CENTERS[6]],
        [COL_CENTERS[10], ROW_CENTERS[10]],
        [COL_CENTERS[12], ROW_CENTERS[12]],
      ],
      width: 7,
      name: 'Broadway',
    }];

    // Helper: perpendicular distance from point (px,pz) to line segment (a→b)
    function ptSegDist(px: number, pz: number, a: [number, number], b: [number, number]): number {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const lenSq = dx * dx + dz * dz;
      if (lenSq === 0) return Math.hypot(px - a[0], pz - a[1]);
      let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
    }

    // Render diagonal road segments
    for (const diag of DIAGONALS) {
      for (let i = 0; i < diag.points.length - 1; i++) {
        const [ax, az] = diag.points[i];
        const [bx, bz] = diag.points[i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;

        // Road surface (above grid roads)
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(diag.width, len + 2), roadMat);
        seg.rotation.x = -Math.PI / 2;
        seg.rotation.z = angle;
        seg.position.set(mx, 0.06, mz);
        seg.receiveShadow = true;
        cityGroup.add(seg);

        // Sidewalks on each side
        for (const side of [-1, 1]) {
          const offX = Math.cos(angle) * side * (diag.width / 2 + 0.8);
          const offZ = -Math.sin(angle) * side * (diag.width / 2 + 0.8);
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len + 2), swalkMat);
          sw.rotation.x = -Math.PI / 2;
          sw.rotation.z = angle;
          sw.position.set(mx + offX, 0.065, mz + offZ);
          sw.receiveShadow = true;
          cityGroup.add(sw);
        }

        // Center dashes along diagonal
        const dashStep = 6;
        for (let d = dashStep; d < len - dashStep; d += dashStep) {
          const t = d / len;
          const dpx = ax + t * dx, dpz = az + t * dz;
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
          dash.rotation.x = -Math.PI / 2;
          dash.rotation.z = angle;
          dash.position.set(dpx, 0.08, dpz);
          cityGroup.add(dash);
        }
      }
    }

    // ── Creek system ────────────────────────────────────────────────────────────
    // A winding waterway cutting through the city from NW to SE
    {
      const creekMat = new THREE.MeshStandardMaterial({
        color: '#4A7C9C', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88,
      });
      const bankMat  = new THREE.MeshStandardMaterial({ color: '#3A7030', roughness: 0.92 });
      const creekW   = 5.5;
      const bankW    = 2.2;
      const waypoints: [number, number][] = [
        [-3.6 * STEP, -2.2 * STEP],
        [-2.4 * STEP, -0.8 * STEP],
        [-1.0 * STEP,  0.6 * STEP],
        [ 0.6 * STEP,  1.4 * STEP],
        [ 1.8 * STEP,  2.8 * STEP],
      ];
      for (let i = 0; i < waypoints.length - 1; i++) {
        const [x0, z0] = waypoints[i];
        const [x1, z1] = waypoints[i + 1];
        const dx = x1 - x0, dz = z1 - z0;
        const segLen = Math.sqrt(dx * dx + dz * dz);
        const angle  = Math.atan2(dx, dz);
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        // Creek water
        const creek = new THREE.Mesh(new THREE.PlaneGeometry(creekW, segLen), creekMat.clone());
        creek.rotation.x = -Math.PI / 2; creek.rotation.z = -angle;
        creek.position.set(mx, -0.06, mz);
        creek.receiveShadow = true; cityGroup.add(creek);
        // Banks (left & right)
        for (const side of [-1, 1]) {
          const bank = new THREE.Mesh(new THREE.PlaneGeometry(bankW, segLen), bankMat.clone());
          bank.rotation.x = -Math.PI / 2; bank.rotation.z = -angle;
          const offX = side * Math.cos(angle) * (creekW / 2 + bankW / 2);
          const offZ = side * Math.sin(angle) * (creekW / 2 + bankW / 2);
          bank.position.set(mx + offX, 0.003, mz + offZ);
          bank.receiveShadow = true; cityGroup.add(bank);
        }
      }
    }

    // ── District & Zone system ─────────────────────────────────────────────────
    interface DistrictDef {
      name: string;
      zone: ZoneType;
      color: string;
      palette?: { main: string; alt: string; trim: string }[];
    }
    const DISTRICTS: Record<string, DistrictDef> = {
      'financial-core':    { name: 'Financial Core',    zone: 'downtown', color: '#C8C4BC' },
      'central-tower':     { name: 'Central Tower',     zone: 'downtown', color: '#C4C0B8' },
      'capital-row':       { name: 'Capital Row',       zone: 'downtown', color: '#C6C2BA' },
      'commerce-plaza':    { name: 'Commerce Plaza',    zone: 'downtown', color: '#CAC6BE' },
      'exchange-sq':       { name: 'Exchange Square',   zone: 'downtown', color: '#C8C4BC' },
      'skyline-block':     { name: 'Skyline Block',     zone: 'downtown', color: '#C2BEB6' },
      'civic-hub':         { name: 'Civic Hub',         zone: 'downtown', color: '#C8C4BC' },
      'crown-heights':     { name: 'Crown Heights',     zone: 'downtown', color: '#C4C0B8' },
      'moat-shield':       { name: 'Moat & Shield AI',  zone: 'downtown', color: '#BCC4CC',
                             palette: [{ main: '#0C1E3A', alt: '#1A3050', trim: '#40B0FF' }] },
      'midtown-west':      { name: 'Midtown West',      zone: 'midrise',  color: '#CCCCBC' },
      'uptown-east':       { name: 'Uptown East',       zone: 'midrise',  color: '#CCC8BC' },
      'park-ave':          { name: 'Park Avenue',       zone: 'midrise',  color: '#C8CCBC' },
      'gallery-row':       { name: 'Gallery Row',       zone: 'midrise',  color: '#D0CCB8',
                             palette: [{ main: '#E8DCC8', alt: '#D8CCB0', trim: '#B8A888' }] },
      'the-arcade':        { name: 'The Arcade',        zone: 'midrise',  color: '#CCCCBC' },
      'merchant-row':      { name: 'Merchant Row',      zone: 'midrise',  color: '#CCC8B8' },
      'harbor-gate':       { name: 'Harbor Gate',       zone: 'midrise',  color: '#C0C8D0' },
      'river-bend':        { name: 'River Bend',        zone: 'midrise',  color: '#C4CCC8' },
      'lakeside':          { name: 'Lakeside',          zone: 'midrise',  color: '#C8D0CC' },
      'arts-quarter':      { name: 'Arts Quarter',      zone: 'mixed',    color: '#D0C8B4',
                             palette: [{ main: '#D8C4A8', alt: '#C8B898', trim: '#E0D4BC' }] },
      'innovation-mile':   { name: 'Innovation Mile',   zone: 'mixed',    color: '#C8C0A8',
                             palette: [{ main: '#E0E8EC', alt: '#C8D8E0', trim: '#A8C0D0' }] },
      'market-street':     { name: 'Market Street',     zone: 'mixed',    color: '#CCC4AC' },
      'craft-district':    { name: 'Craft District',    zone: 'mixed',    color: '#D0C8B0' },
      'bricktown':         { name: 'Bricktown',         zone: 'mixed',    color: '#D4C0A8',
                             palette: [{ main: '#B87850', alt: '#A06840', trim: '#C8A080' }] },
      'the-yards':         { name: 'The Yards',         zone: 'mixed',    color: '#C8C0A8' },
      'riverside':         { name: 'Riverside',         zone: 'mixed',    color: '#C8CCC0' },
      'garden-block':      { name: 'Garden Block',      zone: 'mixed',    color: '#C8D0BC' },
      'university-row':    { name: 'University Row',    zone: 'mixed',    color: '#C8C4B0' },
      'oak-st':            { name: 'Oak Street',        zone: 'low',      color: '#D0C8B4' },
      'maple-ave':         { name: 'Maple Avenue',      zone: 'low',      color: '#D4CCB8' },
      'pine-court':        { name: 'Pine Court',        zone: 'low',      color: '#CCC8B4' },
      'birch-lane':        { name: 'Birch Lane',        zone: 'low',      color: '#D0CCB8' },
      'cedar-row':         { name: 'Cedar Row',         zone: 'low',      color: '#D4D0BC' },
      'elm-park':          { name: 'Elm Park',          zone: 'low',      color: '#CCC8B0' },
      'chestnut-way':      { name: 'Chestnut Way',      zone: 'low',      color: '#D0C8B4' },
      'aspen-hill':        { name: 'Aspen Hill',        zone: 'low',      color: '#D4D0BC' },
      'valley-view':       { name: 'Valley View',       zone: 'low',      color: '#D0CCB8' },
      'byu-campus':        { name: 'BYU Campus',        zone: 'midrise',  color: '#2A5C30' },
      'city-park':         { name: 'City Park',         zone: 'park',     color: '#C8D8C0' },
      'memorial-green':    { name: 'Memorial Green',    zone: 'park',     color: '#C8D8C0' },
      'botanical-garden':  { name: 'Botanical Garden',  zone: 'park',     color: '#C8D8C0' },
      'riverside-park':    { name: 'Riverside Park',    zone: 'park',     color: '#C8D8C0' },
      'central-commons':   { name: 'Central Commons',   zone: 'park',     color: '#C8D8C0' },
      'harbor':            { name: 'Harbor',            zone: 'water',    color: '#406080' },
      'bay-front':         { name: 'Bay Front',         zone: 'water',    color: '#406080' },
      'marina':            { name: 'Marina',            zone: 'water',    color: '#406080' },
    };
    const DEFAULT_DISTRICT: DistrictDef = { name: 'Suburbs', zone: 'low', color: '#D0C8B4' };

    // Map every (col,row) → district id. Unmapped blocks fall back to distance-based.
    const BLOCK_DISTRICT: Record<string, string> = {
      // ── Downtown core ──
      '0,0':   'financial-core',   '1,0':   'central-tower',    '0,1':  'commerce-plaza',
      '0,-1':  'exchange-sq',      '-1,0':  'moat-shield',      '1,1':  'byu-campus',
      '-1,1':  'capital-row',      '1,-1':  'skyline-block',    '-1,-1':'civic-hub',
      '2,0':   'crown-heights',    '0,2':   'capital-row',      '-2,0': 'commerce-plaza',
      '0,-2':  'exchange-sq',      '2,1':   'skyline-block',    '-2,1': 'civic-hub',
      '2,-1':  'central-tower',    '-2,-1': 'financial-core',
      // ── Midrise ring ──
      '2,2':   'midtown-west',     '-2,2':  'uptown-east',      '3,0':  'park-ave',
      '-3,0':  'gallery-row',      '3,1':   'the-arcade',       '-3,-1':'merchant-row',
      '3,-1':  'harbor-gate',      '-3,1':  'central-commons',  '3,-2': 'river-bend',
      '-3,-2': 'lakeside',         '2,-2':  'city-park',        '3,-3': 'memorial-green',
      '-2,-2': 'midtown-west',     '1,2':   'uptown-east',      '-1,2': 'park-ave',
      '1,-2':  'the-arcade',       '2,-3':  'botanical-garden', '3,-4': 'riverside-park',
      '2,3':   'harbor-gate',      '-2,3':  'river-bend',
      '3,2':   'lakeside',         '-3,2':  'merchant-row',     '3,3':  'the-arcade',
      '-3,3':  'park-ave',
      // ── Mixed ring ──
      '4,0':   'arts-quarter',     '-4,0':  'innovation-mile',  '4,1':  'market-street',
      '-4,1':  'craft-district',   '4,-1':  'bricktown',        '-4,-1':'the-yards',
      '4,2':   'riverside',        '-4,2':  'garden-block',     '4,-2': 'university-row',
      '-4,-2': 'arts-quarter',     '0,4':   'innovation-mile',  '0,-4': 'market-street',
      '1,4':   'craft-district',   '-1,4':  'bricktown',        '1,-4': 'the-yards',
      '-1,-4': 'riverside',        '2,4':   'garden-block',     '-2,4': 'university-row',
      '1,3':   'arts-quarter',     '-1,3':  'market-street',    '3,4':  'craft-district',
      '-3,4':  'riverside',        '4,3':   'bricktown',        '-4,3': 'garden-block',
      '4,-3':  'the-yards',        '-4,-3': 'university-row',   '-1,-3':'innovation-mile',
      '1,-3':  'arts-quarter',     '-2,-3': 'market-street',    '2,-4': 'craft-district',
      '-2,-4': 'the-yards',
      // ── Water row ──
      '-3,-6': 'harbor',    '-4,-6': 'harbor',    '-5,-6': 'harbor',    '-6,-6': 'harbor',
      '3,-6':  'bay-front', '4,-6':  'bay-front', '5,-6':  'bay-front', '6,-6':  'bay-front',
      '-2,-6': 'marina',    '-1,-6': 'marina',    '0,-6':  'marina',    '1,-6':  'marina',    '2,-6': 'marina',
      '-3,-5': 'harbor',    '3,-5':  'bay-front', '4,-5':  'bay-front', '5,-5':  'bay-front', '6,-5': 'bay-front',
      '-4,-5': 'harbor',    '-5,-5': 'harbor',    '-6,-5': 'harbor',
    };

    function getDistrict(col: number, row: number): DistrictDef {
      const key = `${col},${row}`;
      const id = BLOCK_DISTRICT[key];
      if (id && DISTRICTS[id]) return DISTRICTS[id];
      return DEFAULT_DISTRICT;
    }

    function getZone(col: number, row: number): ZoneType {
      const key = `${col},${row}`;
      const id = BLOCK_DISTRICT[key];
      if (id && DISTRICTS[id]) return DISTRICTS[id].zone;
      // Fallback: distance-based for unmapped blocks
      const dist = Math.sqrt(col * col + row * row);
      if (
        (col === 2 && row === -2) || (col === 3 && row === -2) ||
        (col === 2 && row === -3) || (col === 3 && row === -3) ||
        (col === -3 && row === 1)
      ) return 'park';
      if (row === -HALF || (row === -HALF + 1 && Math.abs(col) >= 3)) return 'water';
      if (dist <= 2.0) return 'downtown';
      if (dist <= 3.5) return 'midrise';
      if (dist <= 4.8) return 'mixed';
      return 'low';
    }

    // Keep label pools for fallback on unmapped blocks
    const ZONE_LABELS: Record<ZoneType, string[]> = {
      downtown: ['Financial Core','Central Tower','Commerce Plaza','Exchange Sq','Skyline Block','Capital Row','Civic Hub','Crown Heights'],
      midrise:  ['Midtown West','Uptown East','Park Ave','Gallery Row','The Arcade','Merchant Row','Harbor Gate','River Bend','Lakeside'],
      mixed:    ['Arts Quarter','University Row','Market Street','Innovation Mile','Craft District','Bricktown','The Yards','Riverside','Garden Block'],
      low:      ['Oak St','Maple Ave','Pine Court','Birch Lane','Cedar Row','Elm Park','Chestnut Way','Aspen Hill','Valley View'],
      park:     ['City Park','Memorial Green','Botanical Garden','Riverside Park','Central Commons'],
      water:    ['Harbor','Bay Front','Marina','River District'],
    };

    const blocks: BlockInfo[] = [];
    const allBuildingMeshes: THREE.Mesh[] = [];
    const blockMeshMap = new Map<THREE.Mesh, BlockInfo>();
    const blockInfoToMeshes = new Map<BlockInfo, THREE.Mesh[]>();
    const treeGroups: THREE.Group[] = [];

    const moatShieldLogoTex = new THREE.TextureLoader().load('/moat-and-shield-ai.png');

    const parkMat  = new THREE.MeshStandardMaterial({ color: '#C8D8C0', roughness: 0.95 });
    const waterMat = waterShaderMat;  // reuse the shared animated shader

    for (let row = -HALF; row <= HALF; row++) {
      for (let col = -HALF; col <= HALF; col++) {
        const cx = COL_CENTERS[col + HALF];
        const cz = ROW_CENTERS[row + HALF];
        const zone = getZone(col, row);
        const district = getDistrict(col, row);
        const isBYU = col === 1 && row === 1;
        const isMoatShield = col === -1 && row === 0;

        // District-driven label (fallback to hash-based pool for unmapped blocks)
        let label: string;
        if (isBYU) label = 'BYU Campus';
        else if (isMoatShield) label = 'Moat & Shield AI';
        else if (BLOCK_DISTRICT[`${col},${row}`]) label = district.name;
        else {
          const labelPool = ZONE_LABELS[zone];
          const labelIdx = ((Math.abs(col) * 7 + Math.abs(row) * 13) ^ (col < 0 ? 3 : 5)) % labelPool.length;
          label = labelPool[labelIdx];
        }

        const info: BlockInfo = { col, row, cx, cz, zone, label };
        blocks.push(info);

        // District-driven ground color
        const patchMat = isBYU        ? new THREE.MeshStandardMaterial({ color: '#2A5C30', roughness: 0.90 })
                       : zone === 'park'  ? parkMat
                       : zone === 'water' ? waterMat
                       : new THREE.MeshStandardMaterial({ color: district.color, roughness: 0.9 });
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), patchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(cx, zone === 'water' ? -0.2 : 0.01, cz);
        patch.receiveShadow = true;
        cityGroup.add(patch);

        if (zone === 'park') {
          const rng = seededRandom(`park-${col}-${row}`);

          // ── Multi-tone grass base ──
          const grassDark = new THREE.MeshStandardMaterial({ color: '#3A7030', roughness: 0.95 });
          const grassLight = new THREE.MeshStandardMaterial({ color: '#4A8840', roughness: 0.95 });
          const grass = new THREE.Mesh(
            new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), grassDark
          );
          grass.rotation.x = -Math.PI / 2; grass.position.set(cx, 0.005, cz);
          grass.receiveShadow = true; cityGroup.add(grass);
          // Lighter grass patches for variation
          for (let gp = 0; gp < 6; gp++) {
            const pw = 6 + rng() * 10, pd = 6 + rng() * 10;
            const gpx = cx + (rng() - 0.5) * (BLOCK_SIZE - 16);
            const gpz = cz + (rng() - 0.5) * (BLOCK_SIZE - 16);
            const patch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), grassLight.clone());
            patch.rotation.x = -Math.PI / 2; patch.position.set(gpx, 0.006, gpz);
            patch.receiveShadow = true; cityGroup.add(patch);
          }

          // ── Winding gravel paths (cross + curved) ──
          const gravelMat = new THREE.MeshStandardMaterial({ color: '#B0A890', roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
          const gravelEdgeMat = new THREE.MeshStandardMaterial({ color: '#9A9078', roughness: 0.95 });
          // Main cross-paths
          for (const [pw, pd, px, pz] of [
            [BLOCK_SIZE - 4, 2.2, cx, cz] as const,
            [2.2, BLOCK_SIZE - 4, cx, cz] as const,
          ]) {
            const path = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), gravelMat.clone());
            path.rotation.x = -Math.PI / 2; path.position.set(px, 0.008, pz);
            path.receiveShadow = true; cityGroup.add(path);
          }
          // Diagonal path
          const diagLen = BLOCK_SIZE * 0.65;
          const diagPath = new THREE.Mesh(new THREE.PlaneGeometry(1.8, diagLen), gravelMat.clone());
          diagPath.rotation.x = -Math.PI / 2; diagPath.rotation.z = Math.PI / 4;
          diagPath.position.set(cx + 5, 0.008, cz - 5); cityGroup.add(diagPath);

          // ── Benches (6, along paths) ──
          const benchMat = new THREE.MeshStandardMaterial({ color: '#7A5838', roughness: 0.85 });
          const legMat   = new THREE.MeshStandardMaterial({ color: '#505050', roughness: 0.9 });
          for (const [bx, bz] of [[-7,-7],[7,7],[-7,7],[7,-7],[-14,0],[14,0]] as [number,number][]) {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.65), benchMat.clone());
            seat.position.set(cx + bx, 0.47, cz + bz); seat.castShadow = true; cityGroup.add(seat);
            const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.08), benchMat.clone());
            back.position.set(cx + bx, 0.75, cz + bz - 0.28); back.castShadow = true; cityGroup.add(back);
            for (const lx of [-1.0, 1.0]) {
              const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.55), legMat.clone());
              leg.position.set(cx + bx + lx, 0.22, cz + bz); cityGroup.add(leg);
            }
          }

          // ── Fountain (improved, with tiered basin) ──
          if (row % 2 === 0) {
            const fMat = new THREE.MeshStandardMaterial({ color: '#808890', roughness: 0.65, metalness: 0.1 });
            // Lower basin
            const base = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.3, 0.5, 20), fMat.clone());
            base.position.set(cx, 0.25, cz); base.castShadow = true; cityGroup.add(base);
            // Water
            const waterMat2 = new THREE.MeshStandardMaterial({ color: '#4888B8', roughness: 0.15, transparent: true, opacity: 0.7 });
            const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 20), waterMat2);
            basin.position.set(cx, 0.52, cz); cityGroup.add(basin);
            // Upper tier
            const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.0, 12), fMat.clone());
            mid.position.set(cx, 1.0, cz); mid.castShadow = true; cityGroup.add(mid);
            const upperBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 12), waterMat2.clone());
            upperBasin.position.set(cx, 1.52, cz); cityGroup.add(upperBasin);
            // Spout
            const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), fMat.clone());
            spout.position.set(cx, 1.9, cz); cityGroup.add(spout);
          }

          // ── Flower beds ──
          const flowerColors = ['#D44060', '#E86840', '#D0A020', '#8848A0', '#E878A0', '#F0C040'];
          const bedEdgeMat = new THREE.MeshStandardMaterial({ color: '#6A5A40', roughness: 0.9 });
          const soilMat = new THREE.MeshStandardMaterial({ color: '#5A4A30', roughness: 0.95 });
          for (let fb = 0; fb < 4; fb++) {
            const fbx = cx + (fb < 2 ? -1 : 1) * (8 + rng() * 6);
            const fbz = cz + (fb % 2 === 0 ? -1 : 1) * (8 + rng() * 6);
            const fbw = 3 + rng() * 3, fbd = 2 + rng() * 2;
            // Raised bed edge
            const edge = new THREE.Mesh(new THREE.BoxGeometry(fbw + 0.3, 0.25, fbd + 0.3), bedEdgeMat.clone());
            edge.position.set(fbx, 0.12, fbz); edge.castShadow = true; cityGroup.add(edge);
            // Soil
            const soil = new THREE.Mesh(new THREE.PlaneGeometry(fbw, fbd), soilMat.clone());
            soil.rotation.x = -Math.PI / 2; soil.position.set(fbx, 0.26, fbz); cityGroup.add(soil);
            // Flowers (small colored spheres)
            for (let f = 0; f < 8 + Math.floor(rng() * 6); f++) {
              const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
              const flower = new THREE.Mesh(
                new THREE.SphereGeometry(0.12 + rng() * 0.1, 5, 4),
                new THREE.MeshStandardMaterial({ color: fc, roughness: 0.7 })
              );
              flower.position.set(fbx + (rng()-0.5)*fbw*0.8, 0.35, fbz + (rng()-0.5)*fbd*0.8);
              cityGroup.add(flower);
            }
          }

          // ── Lamp posts along paths ──
          const parkLampMat = new THREE.MeshStandardMaterial({ color: '#3A3A3A', roughness: 0.8 });
          const parkLampGlow = new THREE.MeshStandardMaterial({ color: '#FFE8C0', emissive: '#FFD090', emissiveIntensity: 0.5, roughness: 0.4 });
          for (const [lpx, lpz] of [[12,1],[-12,1],[1,12],[1,-12],[-10,-10],[10,10]] as [number,number][]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), parkLampMat.clone());
            pole.position.set(cx + lpx, 1.6, cz + lpz); pole.castShadow = true; cityGroup.add(pole);
            // Curved arm
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), parkLampMat.clone());
            arm.position.set(cx + lpx + 0.35, 3.2, cz + lpz); cityGroup.add(arm);
            // Lantern
            const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), parkLampGlow.clone());
            lantern.position.set(cx + lpx + 0.7, 3.1, cz + lpz); cityGroup.add(lantern);
          }

          // ── Gazebo (odd-row parks) ──
          if (row % 2 !== 0) {
            const gazeboMat = new THREE.MeshStandardMaterial({ color: '#E8DCD0', roughness: 0.8 });
            const roofMat = new THREE.MeshStandardMaterial({ color: '#6A5848', roughness: 0.85 });
            // Floor
            const gFloor = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.2, 8), gazeboMat.clone());
            gFloor.position.set(cx, 0.1, cz); gFloor.receiveShadow = true; cityGroup.add(gFloor);
            // Step
            const gStep = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.1, 8), gazeboMat.clone());
            gStep.position.set(cx, 0.02, cz); gStep.receiveShadow = true; cityGroup.add(gStep);
            // Pillars (6)
            for (let pi = 0; pi < 6; pi++) {
              const a = (pi / 6) * Math.PI * 2;
              const px2 = cx + Math.cos(a) * 3.0, pz2 = cz + Math.sin(a) * 3.0;
              const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.0, 8), gazeboMat.clone());
              pillar.position.set(px2, 1.7, pz2); pillar.castShadow = true; cityGroup.add(pillar);
            }
            // Roof (cone)
            const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 8), roofMat);
            roof.position.set(cx, 4.1, cz); roof.castShadow = true; cityGroup.add(roof);
            // Finial
            const finial = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), gazeboMat.clone());
            finial.position.set(cx, 5.05, cz); cityGroup.add(finial);
          }

          // ── Big trees (8 large statement trees + 20 regular) ──
          for (let t = 0; t < 8; t++) {
            const tx = cx + (rng() - 0.5) * (BLOCK_SIZE - 16);
            const tz = cz + (rng() - 0.5) * (BLOCK_SIZE - 16);
            const bigTree = makeTree(tx, tz, seededRandom(`bpt-${t}-${col}-${row}`));
            bigTree.scale.setScalar(1.8 + rng() * 1.0); // 1.8x-2.8x normal size
            treeGroups.push(bigTree); cityGroup.add(bigTree);
          }
          // Regular trees
          for (let t = 0; t < 20; t++) {
            const tx = cx + (rng() - 0.5) * (BLOCK_SIZE - 10);
            const tz = cz + (rng() - 0.5) * (BLOCK_SIZE - 10);
            const tree = makeTree(tx, tz, seededRandom(`pt-${t}-${col}-${row}`));
            treeGroups.push(tree); cityGroup.add(tree);
          }
          continue;
        }
        if (zone === 'water') continue;

        // ── Plaza blocks (open public squares, no buildings) ──────────────────
        const isPlaza = (col === -1 && row === 2);
        if (isPlaza) {
          const plazaRng  = seededRandom(`plaza-${col}-${row}`);
          const stoneMat  = new THREE.MeshStandardMaterial({ color: '#BBAA98', roughness: 0.88 });
          const tileMat   = new THREE.MeshStandardMaterial({ color: '#A89880', roughness: 0.90 });
          const obeliskMat = new THREE.MeshStandardMaterial({ color: '#484038', roughness: 0.72 });
          const benchMat2 = new THREE.MeshStandardMaterial({ color: '#8A7048', roughness: 0.85 });
          const legMat2   = new THREE.MeshStandardMaterial({ color: '#606060', roughness: 0.9 });
          // Stone floor
          const pFloor = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), stoneMat);
          pFloor.rotation.x = -Math.PI / 2; pFloor.position.set(cx, 0.006, cz);
          pFloor.receiveShadow = true; cityGroup.add(pFloor);
          // Tile grid lines
          const tileSpacing = 6;
          for (let gi = -3; gi <= 3; gi++) {
            const lh = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 4, 0.12), tileMat.clone());
            lh.rotation.x = -Math.PI / 2; lh.position.set(cx, 0.008, cz + gi * tileSpacing);
            cityGroup.add(lh);
            const lv = new THREE.Mesh(new THREE.PlaneGeometry(0.12, BLOCK_SIZE - 4), tileMat.clone());
            lv.rotation.x = -Math.PI / 2; lv.position.set(cx + gi * tileSpacing, 0.008, cz);
            cityGroup.add(lv);
          }
          // Central obelisk
          const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.75, 9, 6), obeliskMat);
          obelisk.position.set(cx, 4.5, cz); obelisk.castShadow = true; cityGroup.add(obelisk);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 6), obeliskMat.clone());
          cap.position.set(cx, 9.6, cz); cityGroup.add(cap);
          // 4 benches
          for (const [bx2, bz2] of [[-8,0],[8,0],[0,-8],[0,8]] as [number,number][]) {
            const seat2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.6), benchMat2.clone());
            seat2.position.set(cx + bx2, 0.47, cz + bz2); seat2.castShadow = true; cityGroup.add(seat2);
            const back2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.08), benchMat2.clone());
            back2.position.set(cx + bx2, 0.75, cz + bz2 - 0.26); back2.castShadow = true; cityGroup.add(back2);
            for (const lx2 of [-0.9, 0.9]) {
              const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), legMat2.clone());
              leg2.position.set(cx + bx2 + lx2, 0.22, cz + bz2); cityGroup.add(leg2);
            }
          }
          // Perimeter trees
          const pts: [number, number][] = [[-18,-18],[-18,0],[-18,18],[0,-18],[0,18],[18,-18],[18,0],[18,18]];
          pts.forEach(([tx2,tz2], ti) => {
            const tree = makeTree(cx + tx2 + (plazaRng()-0.5)*3, cz + tz2 + (plazaRng()-0.5)*3,
              seededRandom(`plz-${ti}-${col}-${row}`));
            treeGroups.push(tree); cityGroup.add(tree);
          });
          continue;
        }

        // BYU Campus — spawn stadium instead of regular buildings
        if (isBYU) {
          const stadium = createStadium(cx, cz);
          const byuMeshes: THREE.Mesh[] = [];
          stadium.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
              byuMeshes.push(obj);
            }
          });
          blockInfoToMeshes.set(info, byuMeshes);
          districtBuildingMeshesRef.current.set(info.label, byuMeshes);
          cityGroup.add(stadium);
          continue;
        }

        if (isMoatShield) {
          const tower = createMoatShieldTower(cx, cz, moatShieldLogoTex);
          const mshmMeshes: THREE.Mesh[] = [];
          tower.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
              mshmMeshes.push(obj);
              const mat = obj.material as THREE.MeshStandardMaterial;
              if (mat.color) {
                originalMaterialsRef.current.set(obj, {
                  color: mat.color.clone(),
                  emissive: mat.emissive?.clone() ?? new THREE.Color(0),
                  emissiveIntensity: mat.emissiveIntensity ?? 0,
                });
              }
            }
          });
          blockInfoToMeshes.set(info, mshmMeshes);
          districtBuildingMeshesRef.current.set(info.label, mshmMeshes);
          blockArchetypeMapRef.current.set(`${col},${row}`, { arch: 'podiumTower', height: 72 });
          cityGroup.add(tower);
          continue;
        }

        const rng = seededRandom(`block-${col}-${row}`);
        const BUILD_AREA = BLOCK_SIZE - 4;

        type Arch = 'tower' | 'podiumTower' | 'midrise' | 'slab' | 'campus' | 'spire' | 'residential' | 'warehouse';
        type PlacementDef = { ox: number; oz: number; arch: Arch; hMult: number };
        let placements: PlacementDef[] = [];

        if (zone === 'downtown') {
          placements = [
            { ox: 0,   oz: 0,   arch: rng() > 0.5 ? 'podiumTower' : 'spire', hMult: 1.0 },
            { ox: -16, oz: -14, arch: 'tower',       hMult: 0.85 },
            { ox:  16, oz: -14, arch: 'tower',       hMult: 0.90 },
            { ox: -16, oz:  14, arch: 'tower',       hMult: 0.80 },
            { ox:  16, oz:  14, arch: 'podiumTower', hMult: 0.75 },
            { ox:  0,  oz: -20, arch: 'midrise',     hMult: 0.70 },
            { ox:  0,  oz:  20, arch: 'midrise',     hMult: 0.65 },
            { ox: -20, oz:   0, arch: 'slab',        hMult: 0.60 },
            { ox:  20, oz:   0, arch: 'midrise',     hMult: 0.65 },
            { ox: -10, oz: -20, arch: 'tower',       hMult: 0.55 },
            { ox:  10, oz:  20, arch: 'tower',       hMult: 0.55 },
            { ox: -20, oz: -14, arch: 'midrise',     hMult: 0.50 },
            { ox:  20, oz:  14, arch: 'midrise',     hMult: 0.50 },
          ];
        } else if (zone === 'midrise') {
          placements = [
            { ox:   0, oz:   0, arch: 'midrise',  hMult: 0.90 },
            { ox: -14, oz: -12, arch: 'slab',     hMult: 0.80 },
            { ox:  14, oz: -12, arch: 'midrise',  hMult: 0.85 },
            { ox: -14, oz:  12, arch: 'midrise',  hMult: 0.75 },
            { ox:  14, oz:  12, arch: rng() > 0.5 ? 'tower' : 'midrise', hMult: 0.70 },
            { ox:   0, oz: -20, arch: 'slab',     hMult: 0.65 },
            { ox:   0, oz:  20, arch: 'midrise',  hMult: 0.60 },
            { ox: -20, oz:   0, arch: 'slab',     hMult: 0.55 },
            { ox:  20, oz:   0, arch: 'midrise',  hMult: 0.55 },
            { ox: -10, oz: -20, arch: 'residential', hMult: 0.50 },
            { ox:  10, oz:  20, arch: 'residential', hMult: 0.50 },
          ];
        } else if (zone === 'mixed') {
          placements = [
            { ox:   0, oz:   0, arch: rng() > 0.5 ? 'campus' : 'midrise', hMult: 0.75 },
            { ox: -14, oz: -12, arch: 'residential', hMult: 0.65 },
            { ox:  14, oz: -12, arch: 'midrise',     hMult: 0.60 },
            { ox: -14, oz:  12, arch: 'residential', hMult: 0.55 },
            { ox:  14, oz:  12, arch: 'residential', hMult: 0.55 },
            { ox:   0, oz: -20, arch: 'slab',        hMult: 0.50 },
            { ox:   0, oz:  20, arch: 'slab',        hMult: 0.45 },
            { ox: -20, oz:   0, arch: 'residential', hMult: 0.45 },
            { ox:  20, oz:   0, arch: 'residential', hMult: 0.45 },
          ];
        } else {
          placements = [
            { ox:   0, oz:   0, arch: 'residential', hMult: 0.55 },
            { ox: -14, oz: -12, arch: 'residential', hMult: 0.50 },
            { ox:  14, oz: -12, arch: 'residential', hMult: 0.45 },
            { ox: -14, oz:  12, arch: rng() > 0.6 ? 'warehouse' : 'residential', hMult: 0.40 },
            { ox:  14, oz:  12, arch: 'residential', hMult: 0.40 },
            { ox:   0, oz: -20, arch: 'residential', hMult: 0.35 },
            { ox:   0, oz:  20, arch: 'residential', hMult: 0.35 },
            { ox: -20, oz:   0, arch: rng() > 0.5 ? 'warehouse' : 'residential', hMult: 0.30 },
          ];
        }

        const H_RANGES: Record<ZoneType, [number, number]> = {
          downtown: [50, 120], midrise: [20, 50], mixed: [10, 28], low: [6, 15], park: [0, 0], water: [0, 0],
        };
        const [hMin, hMax] = H_RANGES[zone];

        for (const p of placements) {
          const jx = (rng() - 0.5) * 2;
          const jz = (rng() - 0.5) * 2;
          const wx = cx + p.ox + jx;
          const wz = cz + p.oz + jz;
          const halfBA = BUILD_AREA / 2;
          if (Math.abs(wx - cx) > halfBA - 3 || Math.abs(wz - cz) > halfBA - 3) continue;

          // Cull buildings that fall within the diagonal avenue corridor
          let nearDiag = false;
          for (const diag of DIAGONALS) {
            for (let di = 0; di < diag.points.length - 1; di++) {
              if (ptSegDist(wx, wz, diag.points[di], diag.points[di + 1]) < diag.width / 2 + 8) {
                nearDiag = true; break;
              }
            }
            if (nearDiag) break;
          }
          if (nearDiag) continue;

          const h = hMin + (hMax - hMin) * rng() * p.hMult;

          // Store first placement's archetype for interior generation
          if (!blockArchetypeMapRef.current.has(`${col},${row}`)) {
            blockArchetypeMapRef.current.set(`${col},${row}`, { arch: p.arch, height: h });
          }

          let group: THREE.Group;
          const am = makeArchSpecificMats(p.arch);
          // Apply per-block color palette tint to non-glass buildings
          // District palette takes priority over procedural palette
          const distPal = district.palette;
          const pal = distPal
            ? distPal[Math.floor(rng() * distPal.length)]
            : buildingColorPalette(col, row, zone, p.arch);
          if (pal) {
            am.main  = new THREE.MeshStandardMaterial({ color: pal.main, roughness: am.main.roughness, metalness: am.main.metalness, map: am.main.map ?? undefined });
            am.alt   = new THREE.MeshStandardMaterial({ color: pal.alt,  roughness: am.alt.roughness,  metalness: am.alt.metalness  });
            am.trim  = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: am.trim.roughness, metalness: am.trim.metalness });
          }
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
              const arr = blockInfoToMeshes.get(info);
              if (arr) arr.push(obj);
              else blockInfoToMeshes.set(info, [obj]);
              // Snapshot original material for health-reactive reset
              const mat = obj.material as THREE.MeshStandardMaterial;
              if (mat.color) {
                originalMaterialsRef.current.set(obj, {
                  color: mat.color.clone(),
                  emissive: mat.emissive?.clone() ?? new THREE.Color(0),
                  emissiveIntensity: mat.emissiveIntensity ?? 0,
                });
              }
            }
          });
          // Register meshes by district label for data-driven visuals
          const distMeshes = districtBuildingMeshesRef.current.get(info.label) ?? [];
          const newMeshes = blockInfoToMeshes.get(info) ?? [];
          districtBuildingMeshesRef.current.set(info.label, [...distMeshes, ...newMeshes]);
          cityGroup.add(group);

        }

        const treeRng = seededRandom(`trees-${col}-${row}`);
        for (let t = 0; t < 1; t++) {
          const edge = BUILD_AREA / 2 + 2;
          const side = treeRng() > 0.5 ? 1 : -1;
          const tx = cx + (treeRng() - 0.5) * BLOCK_SIZE * 0.7;
          const tz = cz + side * edge * 0.8;
          const tree = makeTree(tx, tz, seededRandom(`st-${t}-${col}-${row}`));
          treeGroups.push(tree); cityGroup.add(tree);
        }
      }
    }

    // Sync tree groups, park blocks, and block info to refs for data-driven effects
    treeGroupsRef.current = treeGroups;
    blocksRef.current = blocks;
    parkBlockInfosRef.current = blocks.filter(b => b.zone === 'park').map(b => ({ cx: b.cx, cz: b.cz }));

    // ── AO contact shadows at building bases ──
    const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false });
    for (const b of blocks) {
      if (b.zone === 'park' || b.zone === 'water') continue;
      const aoPlane = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE * 0.55, BLOCK_SIZE * 0.55), aoMat);
      aoPlane.rotation.x = -Math.PI / 2;
      aoPlane.position.set(b.cx, 0.02, b.cz);
      cityGroup.add(aoPlane);
    }

    // ── Animated Traffic (InstancedMesh) ────────────────────────────────────────
    const VEHICLE_COUNT = 80;
    const vehicleGeo = new THREE.BoxGeometry(3.5, 1.2, 1.8);
    const vehicleColors = [0x2A3848, 0x404858, 0x505868, 0x3A4858, 0x283040, 0xC8C0B0, 0x8A2020];
    const vehicleMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 });
    const vehicleInstances = new THREE.InstancedMesh(vehicleGeo, vehicleMat, VEHICLE_COUNT);
    vehicleInstances.castShadow = true;
    vehicleInstances.receiveShadow = false;

    // Build route paths along roads
    interface VehicleState { routeType: 'x' | 'z'; roadPos: number; offset: number; speed: number; dir: number; routeMin: number; routeMax: number; }
    const vehicleStates: VehicleState[] = [];
    const roadRng = seededRandom('traffic-routes');
    const GRID_EXTENT_APPROX = HALF * BLOCK_SIZE + 30;
    for (let v = 0; v < VEHICLE_COUNT; v++) {
      const isXRoute = roadRng() > 0.5;
      const routeArr = isXRoute ? roadZs : roadXs;
      const routeIdx = Math.floor(roadRng() * routeArr.length);
      const roadPos = routeArr[routeIdx]?.pos ?? 0;
      const dir = roadRng() > 0.5 ? 1 : -1;
      vehicleStates.push({
        routeType: isXRoute ? 'x' : 'z',
        roadPos,
        offset: (roadRng() - 0.5) * 2 * GRID_EXTENT_APPROX,
        speed: 0.15 + roadRng() * 0.25,
        dir,
        routeMin: -GRID_EXTENT_APPROX,
        routeMax: GRID_EXTENT_APPROX,
      });
      // Assign per-instance color
      vehicleInstances.setColorAt(v, new THREE.Color(vehicleColors[Math.floor(roadRng() * vehicleColors.length)]));
    }
    if (vehicleInstances.instanceColor) vehicleInstances.instanceColor.needsUpdate = true;
    cityGroup.add(vehicleInstances);

    const vehicleDummy = new THREE.Object3D();
    function updateTraffic() {
      for (let v = 0; v < VEHICLE_COUNT; v++) {
        const s = vehicleStates[v];
        s.offset += s.speed * s.dir;
        // Wrap around
        if (s.offset > s.routeMax) s.offset = s.routeMin;
        if (s.offset < s.routeMin) s.offset = s.routeMax;

        if (s.routeType === 'x') {
          vehicleDummy.position.set(s.offset, 0.7, s.roadPos + s.dir * 1.2);
          vehicleDummy.rotation.y = s.dir > 0 ? 0 : Math.PI;
        } else {
          vehicleDummy.position.set(s.roadPos + s.dir * 1.2, 0.7, s.offset);
          vehicleDummy.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        vehicleDummy.updateMatrix();
        vehicleInstances.setMatrixAt(v, vehicleDummy.matrix);
      }
      vehicleInstances.instanceMatrix.needsUpdate = true;
    }
    updateTraffic(); // initial placement

    // ── Orbit + Pan + Zoom ────────────────────────────────────────────────────
    let isDragging = false, isPanning = false;
    let lastX = 0, lastY = 0, clickStartX = 0, clickStartY = 0;
    const clickPt   = new THREE.Vector2();
    const hoverPt   = new THREE.Vector2();
    const raycaster     = new THREE.Raycaster();
    const hoverRaycaster = new THREE.Raycaster();
    const zoomRaycaster  = new THREE.Raycaster();
    const zoomPlane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let selectedBlockState: BlockInfo | null = null;
    let hoveredBlock: BlockInfo | null = null;
    const hoveredMeshes: THREE.Mesh[] = [];
    let zoomVelocity = 0;

    // Pre-allocated vectors for per-event math (avoids GC pressure)
    const _tmpRight = new THREE.Vector3();
    const _tmpFwd   = new THREE.Vector3();
    const _tmpDir   = new THREE.Vector3();
    const _up       = new THREE.Vector3(0, 1, 0);
    const _zoomVec2 = new THREE.Vector2();
    const _zoomVec3 = new THREE.Vector3();
    let lastHoverRaycast = 0;

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
          _tmpDir.set(0, 0, 0);
          _tmpRight.crossVectors(camera.getWorldDirection(_tmpDir), _up).normalize();
          _tmpFwd.set(-Math.sin(orbitTheta), 0, -Math.cos(orbitTheta));
          orbitTarget.addScaledVector(_tmpRight, -dx * panSpeed);
          orbitTarget.addScaledVector(_tmpFwd,    dy * panSpeed);
          orbitTarget.y = 0;
        } else {
          orbitTheta += dx * 0.005;
        }
        minimapDirty = true;
        updateCameraOrbit();
      } else if (viewModeRef.current === 'city') {
        // Hover highlight — throttled to avoid raycasting every mousemove
        const now = performance.now();
        if (now - lastHoverRaycast < 50) {
          // Still update tooltip position even when skipping raycast
          if (tooltipRef.current && hoveredBlock) {
            tooltipRef.current.style.left = `${e.clientX + 14}px`;
            tooltipRef.current.style.top  = `${e.clientY - 10}px`;
          }
          return;
        }
        lastHoverRaycast = now;
        const rect = canvas.getBoundingClientRect();
        hoverPt.set(
          (e.clientX - rect.left) / rect.width * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        hoverRaycaster.setFromCamera(hoverPt, camera);
        const hits = hoverRaycaster.intersectObjects(allBuildingMeshes, false);
        const newBlock = hits.length > 0 ? (blockMeshMap.get(hits[0].object as THREE.Mesh) ?? null) : null;
        if (newBlock !== hoveredBlock) {
          // Restore previous hover meshes — use health emissive if set, else original
          for (const m of hoveredMeshes) {
            const bi = m.userData.blockInfo as BlockInfo | undefined;
            const healthState = bi ? healthEmissiveRef.current.get(bi.label) : undefined;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (healthState) {
              mat.emissive?.setHex(healthState.color);
              mat.emissiveIntensity = healthState.intensity;
            } else {
              const orig = originalMaterialsRef.current.get(m);
              if (orig) { mat.emissive?.copy(orig.emissive); mat.emissiveIntensity = orig.emissiveIntensity; }
              else mat.emissive?.setHex(0x000000);
            }
          }
          hoveredMeshes.length = 0;
          hoveredBlock = newBlock;
          if (newBlock) {
            const meshes = blockInfoToMeshes.get(newBlock) ?? [];
            for (const mesh of meshes) {
              (mesh.material as THREE.MeshStandardMaterial).emissive?.setHex(0x1A2A3A);
              hoveredMeshes.push(mesh);
            }
          }
        }
        canvas.style.cursor = newBlock ? 'pointer' : 'default';

        // Hover tooltip
        if (tooltipRef.current) {
          if (newBlock) {
            const project = appDataRef.current ? findLinkedProject(newBlock.label, appDataRef.current.projects) : null;
            const linkedTodos = project && appDataRef.current
              ? appDataRef.current.todos.filter(t => t.linkedType === 'project' && t.linkedId === project.id && t.status !== 'done')
              : [];
            const healthDot = project ? ({ green: '#4ade80', yellow: '#fbbf24', red: '#ef4444' }[project.health] || '#64748b') : '';

            tooltipRef.current.innerHTML = `
              <div style="font-weight:700;font-size:11px;color:#e2e8f0;margin-bottom:2px">${newBlock.label}</div>
              ${project ? `<div style="display:flex;align-items:center;gap:4px;font-size:10px;color:#94a3b8">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${healthDot}"></span>
                ${project.name} &middot; ${linkedTodos.length} todo${linkedTodos.length !== 1 ? 's' : ''}
              </div>` : `<div style="font-size:10px;color:#475569">${newBlock.zone}</div>`}
            `;
            tooltipRef.current.style.display = 'block';
            tooltipRef.current.style.left = `${e.clientX + 14}px`;
            tooltipRef.current.style.top = `${e.clientY - 10}px`;
          } else {
            tooltipRef.current.style.display = 'none';
          }
        }
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
          minimapDirty = true;
        } else {
          selectedBlockState = null;
          setSelectedBlock(null);
          minimapDirty = true;
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
        _zoomVec2.set(mx, my);
        zoomRaycaster.setFromCamera(_zoomVec2, camera);
        if (zoomRaycaster.ray.intersectPlane(zoomPlane, _zoomVec3)) {
          const t = Math.abs(e.deltaY * 0.35) / Math.max(orbitRadius, 1) * 0.55;
          orbitTarget.lerp(_zoomVec3, e.deltaY < 0 ? t : -t * 0.3);
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
          orbitRadius = Math.max(60, Math.min(800, orbitRadius - (dist - lastTouchDist) * 0.5));
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
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas);

    // ── Minimap ───────────────────────────────────────────────────────────────
    if (mmCanvas) { mmCanvas.width = 160; mmCanvas.height = 160; }
    const mmCtx = mmCanvas?.getContext('2d') ?? null;
    let minimapDirty = true;
    const MM_SCALE = 72 / GRID_EXTENT;

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
      // Health dots on minimap for blocks with linked projects
      if (appDataRef.current) {
        for (const b of blocks) {
          const project = findLinkedProject(b.label, appDataRef.current.projects);
          if (project && project.status === 'active') {
            const dotColor = { green: '#4ade80', yellow: '#fbbf24', red: '#ef4444' }[project.health] || '#64748b';
            const bx = 80 + b.cx * MM_SCALE;
            const bz = 80 + b.cz * MM_SCALE;
            mmCtx.beginPath(); mmCtx.arc(bx, bz, 2.5, 0, Math.PI * 2);
            mmCtx.fillStyle = dotColor; mmCtx.fill();
          }
        }
      }

      // Camera direction cone on minimap
      const dirX = -Math.sin(orbitTheta);
      const dirZ = -Math.cos(orbitTheta);
      const coneTipX = 80 + orbitTarget.x * MM_SCALE + dirX * 12;
      const coneTipZ = 80 + orbitTarget.z * MM_SCALE + dirZ * 12;
      const perpX = -dirZ, perpZ = dirX;
      const coneBaseX = 80 + orbitTarget.x * MM_SCALE;
      const coneBaseZ = 80 + orbitTarget.z * MM_SCALE;
      mmCtx.beginPath();
      mmCtx.moveTo(coneTipX, coneTipZ);
      mmCtx.lineTo(coneBaseX + perpX * 5, coneBaseZ + perpZ * 5);
      mmCtx.lineTo(coneBaseX - perpX * 5, coneBaseZ - perpZ * 5);
      mmCtx.closePath();
      mmCtx.fillStyle = 'rgba(255,255,255,0.15)'; mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(255,255,255,0.3)'; mmCtx.lineWidth = 0.8; mmCtx.stroke();

      const vx = 80 + orbitTarget.x * MM_SCALE;
      const vz = 80 + orbitTarget.z * MM_SCALE;
      mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 1.5;
      mmCtx.beginPath(); mmCtx.moveTo(vx - 5, vz); mmCtx.lineTo(vx + 5, vz); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(vx, vz - 5); mmCtx.lineTo(vx, vz + 5); mmCtx.stroke();
      mmCtx.fillStyle = 'rgba(255,255,255,0.65)';
      mmCtx.font = 'bold 9px system-ui'; mmCtx.textAlign = 'center';
      mmCtx.fillText('N', 80, 12);
      // Diagonal avenue lines on minimap
      for (const diag of DIAGONALS) {
        mmCtx.strokeStyle = 'rgba(180,160,100,0.5)'; mmCtx.lineWidth = 1.2;
        mmCtx.beginPath();
        for (let di = 0; di < diag.points.length; di++) {
          const dpx = 80 + diag.points[di][0] * MM_SCALE;
          const dpz = 80 + diag.points[di][1] * MM_SCALE;
          if (di === 0) mmCtx.moveTo(dpx, dpz);
          else mmCtx.lineTo(dpx, dpz);
        }
        mmCtx.stroke();
      }
      // Pulse ring on teleport
      const pulse = mmPulseRef.current;
      if (pulse) {
        const pr = (1 - pulse.t) * 32;
        mmCtx.beginPath(); mmCtx.arc(pulse.px, pulse.pz, pr, 0, Math.PI * 2);
        mmCtx.strokeStyle = `rgba(255,255,255,${pulse.t * 0.9})`; mmCtx.lineWidth = 1.5; mmCtx.stroke();
        pulse.t -= 0.04;
        if (pulse.t <= 0) mmPulseRef.current = null;
        else minimapDirty = true; // keep redrawing while pulse is active
      }
      mmCtx.restore();
      minimapDirty = false;
    }

    // ── Minimap click-to-teleport ─────────────────────────────────────────────
    const onMinimapClick = (e: MouseEvent) => {
      if (viewModeRef.current !== 'city') return;
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const wx = (e.clientX - rect.left - 80) / MM_SCALE;
      const wz = (e.clientY - rect.top  - 80) / MM_SCALE;
      const bound = GRID_EXTENT;
      minimapPanRef.current = new THREE.Vector3(
        Math.max(-bound, Math.min(bound, wx)),
        0,
        Math.max(-bound, Math.min(bound, wz)),
      );
      // Pulse ring at clicked pixel
      mmPulseRef.current = { px: e.clientX - rect.left, pz: e.clientY - rect.top, t: 1.0 };
      minimapDirty = true;
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
        const isBYUStadium = block.col === 1 && block.row === 1;
        const onRoof = isBYUStadium || floor === nFloors - 1;
        const bHeight = archData?.height ?? 10;
        sun.intensity  = onRoof ? 1.8 : 0.3;
        hemi.intensity = onRoof ? 2.0 : 1.4;
        if (isBYUStadium) {
          // Stadium is always open-air — city hidden so only bowl is visible
          cityGroup.visible = false;
          interiorGroupRef.current.position.set(0, 0, 0);
          scene.fog = null;
          if (floor === 0) {
            // Field level: wide angle to see full bowl
            orbitRadius = 52;
            orbitPhi    = 1.1;
            orbitTarget.set(0, 3.0, 0);
          } else {
            // Upper concourse / press box level
            orbitRadius = 36;
            orbitPhi    = 0.85;
            orbitTarget.set(0, 1.5, 0);
          }
        } else if (onRoof) {
          cityGroup.visible = true;
          interiorGroupRef.current.position.set(block.cx, bHeight, block.cz);
          orbitRadius = 60;
          orbitPhi    = 1.05;
          orbitTarget.set(block.cx, bHeight + 1.5, block.cz);
          scene.fog = new THREE.Fog(0xe8f0f8, 250, 900);
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

      // Bloom intensity is now managed by applyTimeOfDay() via getSkyConfig()

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
              scene.fog = new THREE.Fog(0xe8f0f8, 250, 900);
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
            scene.fog      = new THREE.Fog(cityLightRef.current.fogColor, 180, 700);
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
        minimapDirty = true;
        updateCameraOrbit();
      }

      // Smooth zoom easing (city only)
      if (viewModeRef.current === 'city' && Math.abs(zoomVelocity) > 0.05) {
        const prev = orbitRadius;
        orbitRadius = Math.max(60, Math.min(800, orbitRadius + zoomVelocity));
        if (orbitRadius === prev) zoomVelocity = 0;
        zoomVelocity *= 0.82;
        minimapDirty = true;
        updateCameraOrbit();
      }

      // Dynamic fog density by zoom level — denser when close for street-level atmosphere
      if (viewModeRef.current === 'city' && scene.fog instanceof THREE.Fog) {
        const zoomT = Math.max(0, Math.min(1, (orbitRadius - 60) / (800 - 60))); // 0 = closest, 1 = farthest
        scene.fog.near = 80 + zoomT * 250;   // close: 80, far: 330
        scene.fog.far  = 350 + zoomT * 700;  // close: 350, far: 1050
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
      foamShaderMat.uniforms.uTime.value += 0.012;
      // Update water sun direction from light position
      waterShaderMat.uniforms.uSunDir.value.copy(sun.position).normalize();

      // Animate construction indicators (beacons rotate, scaffolding pulses)
      for (const [, indGroup] of districtIndicatorsRef.current) {
        if (!indGroup.visible) continue;
        for (const child of indGroup.children) {
          if (child.userData.type === 'beacon') {
            child.rotation.y += 0.04;
          } else if (child.userData.type === 'scaffolding') {
            child.scale.x = 1 + Math.sin(frameCount * 0.04) * 0.015;
            child.scale.z = 1 + Math.sin(frameCount * 0.04) * 0.015;
          }
        }
      }

      // Animated traffic (every other frame for performance)
      if (viewModeRef.current === 'city' && frameCount % 2 === 0) {
        updateTraffic();
      }

      // Tree sway (subtle wind)
      if (viewModeRef.current === 'city' && frameCount % 2 === 0) {
        const windTime = performance.now() * 0.001;
        for (let ti = 0; ti < treeGroups.length; ti++) {
          const tg = treeGroups[ti];
          tg.rotation.z = Math.sin(windTime * 0.8 + ti * 0.3) * 0.015;
          tg.rotation.x = Math.cos(windTime * 0.6 + ti * 0.7) * 0.010;
        }
      }

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

      renderer.render(scene, camera);
      if (viewModeRef.current === 'city' && minimapDirty) drawMinimap();
    }
    animate();

    // ── Keyboard Shortcuts ─────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const PAN_SPEED = 15;
      switch (e.key) {
        case 'Escape':
          if (viewModeRef.current === 'interior') {
            setViewMode('city');
          } else {
            selectedBlockState = null;
            setSelectedBlock(null);
          }
          break;
        case 'b': case 'B':
          birdEyeTargetRef.current = { phi: 0.06, radius: 220 };
          break;
        case 'f': case 'F':
          if (selectedBlockState) {
            minimapPanRef.current = new THREE.Vector3(selectedBlockState.cx, 0, selectedBlockState.cz);
          }
          break;
        case 'w': case 'W':
          _tmpFwd.set(-Math.sin(orbitTheta), 0, -Math.cos(orbitTheta));
          orbitTarget.addScaledVector(_tmpFwd, PAN_SPEED);
          orbitTarget.y = 0; minimapDirty = true; updateCameraOrbit();
          break;
        case 's': case 'S':
          _tmpFwd.set(-Math.sin(orbitTheta), 0, -Math.cos(orbitTheta));
          orbitTarget.addScaledVector(_tmpFwd, -PAN_SPEED);
          orbitTarget.y = 0; minimapDirty = true; updateCameraOrbit();
          break;
        case 'a': case 'A':
          _tmpRight.crossVectors(camera.getWorldDirection(_tmpDir.set(0,0,0)), _up).normalize();
          orbitTarget.addScaledVector(_tmpRight, PAN_SPEED);
          orbitTarget.y = 0; minimapDirty = true; updateCameraOrbit();
          break;
        case 'd': case 'D':
          _tmpRight.crossVectors(camera.getWorldDirection(_tmpDir.set(0,0,0)), _up).normalize();
          orbitTarget.addScaledVector(_tmpRight, -PAN_SPEED);
          orbitTarget.y = 0; minimapDirty = true; updateCameraOrbit();
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      // renderer disposed above
      resizeObs.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      mmCanvas?.removeEventListener('click', onMinimapClick);
      document.removeEventListener('keydown', onKeyDown);
      clearInterval(todInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DATA-DRIVEN CITY VISUALS ─────────────────────────────────────────────────
  // React to appData changes: update building materials based on project health,
  // add/remove construction indicators based on todos
  useEffect(() => {
    if (!appData || districtBuildingMeshesRef.current.size === 0 || !cityGroupRef.current) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const HEALTH_CONFIG: Record<string, { emissiveColor: number; emissiveIntensity: number; accentColor: number }> = {
      green:  { emissiveColor: 0xFFE8C0, emissiveIntensity: 0.08, accentColor: 0x4ade80 },
      yellow: { emissiveColor: 0xFFD080, emissiveIntensity: 0.04, accentColor: 0xfbbf24 },
      red:    { emissiveColor: 0x303848, emissiveIntensity: 0.02, accentColor: 0xef4444 },
    };

    for (const [label, meshes] of districtBuildingMeshesRef.current) {
      const project = findLinkedProject(label, appData.projects);

      // ── Reset or remove indicators if no active project ──
      if (!project || project.status !== 'active') {
        // Reset materials to original
        for (const mesh of meshes) {
          const orig = originalMaterialsRef.current.get(mesh);
          if (orig) {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.emissive.copy(orig.emissive);
            mat.emissiveIntensity = orig.emissiveIntensity;
          }
        }
        healthEmissiveRef.current.delete(label);
        // Hide indicators
        const ind = districtIndicatorsRef.current.get(label);
        if (ind) { ind.visible = false; }
        continue;
      }

      // ── Apply health-based emissive to all building meshes ──
      const cfg = HEALTH_CONFIG[project.health];
      if (cfg) {
        for (const mesh of meshes) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!mat.emissive) continue;
          mat.emissive.setHex(cfg.emissiveColor);
          mat.emissiveIntensity = cfg.emissiveIntensity;
        }
        healthEmissiveRef.current.set(label, { color: cfg.emissiveColor, intensity: cfg.emissiveIntensity });
      }

      // ── Construction indicators based on todos ──
      const linkedTodos = appData.todos.filter(
        t => t.linkedType === 'project' && t.linkedId === project.id && t.status !== 'done'
      );
      const overdueTodos = linkedTodos.filter(t => t.dueDate && t.dueDate < todayStr);
      const inProgressTodos = linkedTodos.filter(t => t.status === 'in-progress');

      // Get or create indicator group
      let indGroup = districtIndicatorsRef.current.get(label);
      if (!indGroup) {
        indGroup = new THREE.Group();
        indGroup.userData.districtLabel = label;
        cityGroupRef.current.add(indGroup);
        districtIndicatorsRef.current.set(label, indGroup);
      }
      // Clear old indicators
      while (indGroup.children.length > 0) {
        const child = indGroup.children[0];
        indGroup.remove(child);
        if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
      }
      indGroup.visible = true;

      // Find block center from first mesh
      let blockCx = 0, blockCz = 0;
      if (meshes.length > 0) {
        const bi = meshes[0].userData.blockInfo;
        if (bi) { blockCx = bi.cx; blockCz = bi.cz; }
      }

      // ── Health accent ring at base ──
      if (cfg) {
        const ringMat = new THREE.MeshStandardMaterial({
          color: cfg.accentColor, emissive: cfg.accentColor, emissiveIntensity: 0.4,
          transparent: true, opacity: 0.5, side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(18, 22, 32), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(blockCx, 0.08, blockCz);
        ring.userData.type = 'accent';
        indGroup.add(ring);
      }

      // ── Overdue: red rotating beacon ──
      if (overdueTodos.length > 0) {
        const beaconMat = new THREE.MeshStandardMaterial({
          color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.8,
        });
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.0, 8), beaconMat);
        beacon.position.set(blockCx, 1.5, blockCz + 22);
        beacon.userData.type = 'beacon';
        indGroup.add(beacon);
        // Warning barrier
        const barrierMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.3 });
        for (let bi = 0; bi < Math.min(overdueTodos.length, 4); bi++) {
          const barrier = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.2), barrierMat.clone());
          barrier.position.set(blockCx - 8 + bi * 5, 0.6, blockCz + 24);
          barrier.userData.type = 'barrier';
          indGroup.add(barrier);
        }
      }

      // ── In-progress: yellow scaffolding ──
      if (inProgressTodos.length > 0) {
        const scaffMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', wireframe: true, transparent: true, opacity: 0.5 });
        // Find tallest building mesh for scaffolding height
        let maxH = 10;
        for (const m of meshes) {
          const bbox = new THREE.Box3().setFromObject(m);
          if (bbox.max.y > maxH) maxH = bbox.max.y;
        }
        const scaffH = Math.min(maxH * 0.6, 40);
        const scaffolding = new THREE.Mesh(
          new THREE.BoxGeometry(8, scaffH, 2), scaffMat
        );
        scaffolding.position.set(blockCx + 12, scaffH / 2, blockCz);
        scaffolding.userData.type = 'scaffolding';
        indGroup.add(scaffolding);
        // Cross braces
        const braceMat = new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.4 });
        for (let by = 3; by < scaffH; by += 6) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 0.15), braceMat.clone());
          brace.position.set(blockCx + 12, by, blockCz);
          indGroup.add(brace);
        }
      }
    }

    // ── HABIT COMPLETION → PARK VITALITY ──────────────────────────────────────
    // Modulate park tree colors based on today's habit completion percentage
    const habitPct = (() => {
      if (!appData.habits.length) return 1;
      const todayLog = appData.habitTracker.find(h => h.date === todayStr);
      if (!todayLog) return 0;
      const done = appData.habits.filter(h => todayLog.habits[h.id]).length;
      return done / appData.habits.length;
    })();

    // Interpolate tree colors: vibrant green at 100%, brown/yellow at 0%
    const vibrantLeaf = new THREE.Color('#4A8040');
    const wiltedLeaf  = new THREE.Color('#8A7838');
    const bareLeaf    = new THREE.Color('#6A5A30');
    const vibrantConifer = new THREE.Color('#2A5C30');
    const wiltedConifer  = new THREE.Color('#5A6838');

    for (const tg of treeGroupsRef.current) {
      tg.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (!mat.color) return;
        const hex = '#' + mat.color.getHexString();
        // Only modulate leaf/canopy materials (greens), not trunks (browns)
        const r = mat.color.r, g = mat.color.g, b = mat.color.b;
        if (g > r && g > b) {
          // This is a green material (leaf/canopy)
          const isConifer = hex.startsWith('#1') || hex.startsWith('#2') || hex.startsWith('#3');
          if (isConifer) {
            mat.color.lerpColors(wiltedConifer, vibrantConifer, habitPct);
          } else {
            if (habitPct < 0.3) {
              mat.color.lerpColors(bareLeaf, wiltedLeaf, habitPct / 0.3);
            } else {
              mat.color.lerpColors(wiltedLeaf, vibrantLeaf, (habitPct - 0.3) / 0.7);
            }
          }
          // Scale canopy down when habits are poor (bare trees)
          if (obj.geometry.type === 'SphereGeometry' || obj.geometry.type === 'ConeGeometry') {
            const s = 0.5 + habitPct * 0.5; // 50% to 100% scale
            obj.scale.setScalar(s);
          }
        }
      });
    }

    // Vitality ring around park blocks
    for (const park of parkBlockInfosRef.current) {
      const ringColor = habitPct >= 0.8 ? 0x4ade80 : habitPct >= 0.5 ? 0xfbbf24 : 0xef4444;
      const existingKey = `park-vitality-${park.cx}-${park.cz}`;
      let vRing = districtIndicatorsRef.current.get(existingKey);
      if (!vRing) {
        vRing = new THREE.Group();
        cityGroupRef.current?.add(vRing);
        districtIndicatorsRef.current.set(existingKey, vRing);
      }
      while (vRing.children.length > 0) {
        const c = vRing.children[0]; vRing.remove(c);
        if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      }
      const ringMat = new THREE.MeshStandardMaterial({
        color: ringColor, emissive: ringColor, emissiveIntensity: 0.3,
        transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(20, 23, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(park.cx, 0.06, park.cz);
      vRing.add(ring);
    }

    // ── GOAL PROGRESS → CONSTRUCTION INDICATORS ──────────────────────────────
    const LIFE_AREA_COLORS: Record<string, number> = {
      ventures: 0x3b82f6, academic: 0x8b5cf6, health: 0x22c55e,
      spiritual: 0xeab308, financial: 0x10b981, relationships: 0xec4899,
      personal: 0x0ea5e9,
    };

    // Clear old goal indicators
    for (const [key, group] of goalIndicatorsRef.current) {
      group.traverse(c => { if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); } });
      group.parent?.remove(group);
    }
    goalIndicatorsRef.current.clear();

    const activeGoals = appData.goals.filter(g => g.status === 'in-progress' || g.status === 'completed');
    // Goals linked to projects → show in that project's district
    const linkedGoals = activeGoals.filter(g => g.linkedProjectId);
    for (const goal of linkedGoals) {
      const project = appData.projects.find(p => p.id === goal.linkedProjectId);
      if (!project) continue;
      // Find the district for this project
      let districtCx = 0, districtCz = 0;
      for (const [label, meshes] of districtBuildingMeshesRef.current) {
        const linked = findLinkedProject(label, [project]);
        if (linked && meshes.length > 0) {
          const bi = meshes[0].userData.blockInfo;
          if (bi) { districtCx = bi.cx; districtCz = bi.cz; }
          break;
        }
      }
      if (districtCx === 0 && districtCz === 0) continue;

      const goalGroup = new THREE.Group();
      const areaColor = LIFE_AREA_COLORS[goal.area] ?? 0x64748b;
      const maxH = 15;
      const goalH = Math.max(1, maxH * (goal.progress / 100));

      if (goal.status === 'completed' || goal.progress >= 100) {
        // Completed: solid monument pillar with green glow
        const pillarMat = new THREE.MeshStandardMaterial({ color: areaColor, emissive: 0x4ade80, emissiveIntensity: 0.5 });
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, maxH, 8), pillarMat);
        pillar.position.set(districtCx - 18, maxH / 2, districtCz - 18);
        pillar.castShadow = true;
        goalGroup.add(pillar);
        // Flag on top
        const flagMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x4ade80, emissiveIntensity: 0.8 });
        const flag = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.1), flagMat);
        flag.position.set(districtCx - 17, maxH + 1, districtCz - 18);
        goalGroup.add(flag);
      } else {
        // In-progress: wireframe + solid fill to progress height
        const wireMat = new THREE.MeshBasicMaterial({ color: areaColor, wireframe: true, transparent: true, opacity: 0.3 });
        const wireframe = new THREE.Mesh(new THREE.BoxGeometry(3, maxH, 3), wireMat);
        wireframe.position.set(districtCx - 18, maxH / 2, districtCz - 18);
        goalGroup.add(wireframe);
        // Solid fill to current progress
        const fillMat = new THREE.MeshStandardMaterial({ color: areaColor, emissive: areaColor, emissiveIntensity: 0.2, transparent: true, opacity: 0.7 });
        const fill = new THREE.Mesh(new THREE.BoxGeometry(2.8, goalH, 2.8), fillMat);
        fill.position.set(districtCx - 18, goalH / 2, districtCz - 18);
        fill.castShadow = true;
        goalGroup.add(fill);
      }

      cityGroupRef.current?.add(goalGroup);
      goalIndicatorsRef.current.set(goal.id, goalGroup);
    }

    // Unlinked goals → place in Central Commons park block (col=-3, row=1)
    const unlinkedGoals = activeGoals.filter(g => !g.linkedProjectId);
    if (unlinkedGoals.length > 0) {
      const plazaCx = -3 * 50; // approximate center of col=-3
      const plazaCz = 1 * 50;  // approximate center of row=1
      // Find actual block center from blocks array if available
      let foundCx = plazaCx, foundCz = plazaCz;
      const commonsBlock = districtIndicatorsRef.current.get('Central Commons');
      if (commonsBlock) {
        // Use an approximate position
      }
      // Find from districtBuildingMeshesRef
      for (const [label, meshes] of districtBuildingMeshesRef.current) {
        if (label === 'Central Commons' && meshes.length > 0) {
          const bi = meshes[0].userData.blockInfo;
          if (bi) { foundCx = bi.cx; foundCz = bi.cz; }
          break;
        }
      }

      unlinkedGoals.forEach((goal, i) => {
        const goalGroup = new THREE.Group();
        const areaColor = LIFE_AREA_COLORS[goal.area] ?? 0x64748b;
        const maxH = 12;
        const goalH = Math.max(1, maxH * (goal.progress / 100));
        const offsetX = (i % 4) * 6 - 9;
        const offsetZ = Math.floor(i / 4) * 6 - 6;

        const fillMat = new THREE.MeshStandardMaterial({ color: areaColor, emissive: areaColor, emissiveIntensity: 0.15, transparent: true, opacity: 0.8 });
        const column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, goalH, 8), fillMat);
        column.position.set(foundCx + offsetX, goalH / 2, foundCz + offsetZ);
        column.castShadow = true;
        goalGroup.add(column);

        // Wireframe target height
        const wireMat = new THREE.MeshBasicMaterial({ color: areaColor, wireframe: true, transparent: true, opacity: 0.2 });
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, maxH, 8), wireMat);
        wire.position.set(foundCx + offsetX, maxH / 2, foundCz + offsetZ);
        goalGroup.add(wire);

        cityGroupRef.current?.add(goalGroup);
        goalIndicatorsRef.current.set(goal.id, goalGroup);
      });
    }

    // ── FINANCIAL HEALTH → DOWNTOWN PROSPERITY ───────────────────────────────
    const monthStart = todayStr.slice(0, 7);
    const monthEntries = appData.financialEntries.filter(e => e.date.startsWith(monthStart));
    const monthIncome = monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const monthExpense = monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const monthNet = monthIncome - monthExpense;

    // Update or create financial billboard in Financial Core district
    const finCoreMeshes = districtBuildingMeshesRef.current.get('Financial Core');
    if (finCoreMeshes && finCoreMeshes.length > 0) {
      const bi = finCoreMeshes[0].userData.blockInfo;
      const billboardCx = bi?.cx ?? 0;
      const billboardCz = bi?.cz ?? 0;

      // Remove old billboard
      if (financialBillboardRef.current) {
        financialBillboardRef.current.mesh.geometry.dispose();
        (financialBillboardRef.current.mesh.material as THREE.Material).dispose();
        financialBillboardRef.current.mesh.parent?.remove(financialBillboardRef.current.mesh);
        financialBillboardRef.current.texture.dispose();
        financialBillboardRef.current = null;
      }

      // Create canvas texture for the billboard
      const bbCanvas = document.createElement('canvas');
      bbCanvas.width = 512; bbCanvas.height = 256;
      const bbCtx = bbCanvas.getContext('2d')!;

      // Background
      bbCtx.fillStyle = '#0C1424'; bbCtx.fillRect(0, 0, 512, 256);
      bbCtx.fillStyle = '#1A2838'; bbCtx.fillRect(4, 4, 504, 248);

      // Title
      bbCtx.fillStyle = '#C0D0E8'; bbCtx.font = 'bold 24px Arial'; bbCtx.textAlign = 'center';
      bbCtx.fillText('MONTHLY FINANCE', 256, 36);

      // Bars
      const maxVal = Math.max(monthIncome, monthExpense, 1);
      const barMaxH = 140;

      // Income bar
      const incomeH = (monthIncome / maxVal) * barMaxH;
      bbCtx.fillStyle = '#4ade80';
      bbCtx.fillRect(120, 200 - incomeH, 80, incomeH);
      bbCtx.fillStyle = '#C0D0E8'; bbCtx.font = '16px Arial';
      bbCtx.fillText('Income', 160, 220);
      bbCtx.fillText(`$${Math.round(monthIncome).toLocaleString()}`, 160, 200 - incomeH - 8);

      // Expense bar
      const expenseH = (monthExpense / maxVal) * barMaxH;
      bbCtx.fillStyle = '#ef4444';
      bbCtx.fillRect(312, 200 - expenseH, 80, expenseH);
      bbCtx.fillStyle = '#C0D0E8';
      bbCtx.fillText('Expense', 352, 220);
      bbCtx.fillText(`$${Math.round(monthExpense).toLocaleString()}`, 352, 200 - expenseH - 8);

      // Net indicator
      bbCtx.fillStyle = monthNet >= 0 ? '#4ade80' : '#ef4444';
      bbCtx.font = 'bold 20px Arial';
      bbCtx.fillText(`Net: ${monthNet >= 0 ? '+' : ''}$${Math.round(monthNet).toLocaleString()}`, 256, 250);

      const bbTex = new THREE.CanvasTexture(bbCanvas);
      const bbMat = new THREE.MeshStandardMaterial({
        map: bbTex, emissive: '#FFFFFF', emissiveIntensity: 0.15, emissiveMap: bbTex,
        roughness: 0.1, metalness: 0.1,
      });
      const bbMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), bbMat);
      bbMesh.position.set(billboardCx, 35, billboardCz + 22);
      cityGroupRef.current?.add(bbMesh);
      financialBillboardRef.current = { mesh: bbMesh, texture: bbTex };

      // Modulate downtown building warmth based on net cash flow
      const netWarmth = monthNet >= 0 ? 0.06 : 0.01;
      for (const mesh of finCoreMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat.emissive) continue;
        // Layer financial warmth on top of health emissive
        const existing = healthEmissiveRef.current.get('Financial Core');
        if (existing) {
          mat.emissiveIntensity = existing.intensity + netWarmth;
        }
      }
    }

    // ── CONTACT POPULATION DENSITY ──────────────────────────────────────────
    // Small colored spheres at ground level in districts proportional to linked contacts
    for (const [label, meshes] of districtBuildingMeshesRef.current) {
      const project = findLinkedProject(label, appData.projects);
      if (!project || project.status !== 'active') continue;
      const linkedContacts = appData.contacts.filter(c => c.linkedProjects.includes(project.id));
      if (linkedContacts.length === 0) continue;

      const bi = meshes[0]?.userData.blockInfo;
      if (!bi) continue;

      // Check for existing contact indicators
      const contactKey = `contacts-${label}`;
      let cGroup = districtIndicatorsRef.current.get(contactKey);
      if (!cGroup) {
        cGroup = new THREE.Group();
        cityGroupRef.current?.add(cGroup);
        districtIndicatorsRef.current.set(contactKey, cGroup);
      }
      while (cGroup.children.length > 0) {
        const c = cGroup.children[0]; cGroup.remove(c);
        if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      }

      const pedestrianGeo = new THREE.SphereGeometry(0.4, 6, 4);
      const contactCount = Math.min(linkedContacts.length, 8);
      const cRng = seededRandom(`contacts-${label}`);
      for (let ci = 0; ci < contactCount; ci++) {
        const hasFollowUp = linkedContacts[ci]?.followUpNeeded && linkedContacts[ci]?.followUpDate && linkedContacts[ci].followUpDate! <= todayStr;
        const pColor = hasFollowUp ? 0xfbbf24 : 0x7EB8F8;
        const pMat = new THREE.MeshStandardMaterial({ color: pColor, emissive: pColor, emissiveIntensity: 0.15 });
        const p = new THREE.Mesh(pedestrianGeo, pMat);
        p.position.set(
          bi.cx + (cRng() - 0.5) * 30,
          0.5,
          bi.cz + (cRng() - 0.5) * 30,
        );
        cGroup.add(p);
      }

      // Follow-up flag if any contacts need follow-up
      const followUpCount = linkedContacts.filter(c => c.followUpNeeded && c.followUpDate && c.followUpDate <= todayStr).length;
      if (followUpCount > 0) {
        const flagMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.5 });
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 4), new THREE.MeshStandardMaterial({ color: '#505050' }));
        flagPole.position.set(bi.cx + 22, 1.5, bi.cz + 22);
        cGroup.add(flagPole);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.05), flagMat);
        flag.position.set(bi.cx + 22.8, 2.8, bi.cz + 22);
        cGroup.add(flag);
      }
    }

    // ── CLIENT REVENUE SIGNAGE ───────────────────────────────────────────────
    // Illuminated signs on tallest buildings for districts with linked clients
    for (const [label, meshes] of districtBuildingMeshesRef.current) {
      const project = findLinkedProject(label, appData.projects);
      if (!project || project.status !== 'active') continue;

      // Find clients linked to this project
      const projectClients = appData.clients.filter(c => c.status === 'active' && c.linkedProjectId === project.id);
      if (projectClients.length === 0) continue;

      const bi = meshes[0]?.userData.blockInfo;
      if (!bi) continue;

      // Find tallest building
      let maxBuildingH = 0;
      for (const m of meshes) {
        const bbox = new THREE.Box3().setFromObject(m);
        if (bbox.max.y > maxBuildingH) maxBuildingH = bbox.max.y;
      }
      if (maxBuildingH < 10) continue;

      const signKey = `client-sign-${label}`;
      let sGroup = districtIndicatorsRef.current.get(signKey);
      if (!sGroup) {
        sGroup = new THREE.Group();
        cityGroupRef.current?.add(sGroup);
        districtIndicatorsRef.current.set(signKey, sGroup);
      }
      while (sGroup.children.length > 0) {
        const c = sGroup.children[0]; sGroup.remove(c);
        if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      }

      // Create sign canvas for first client
      const client = projectClients[0];
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256; signCanvas.height = 64;
      const sCtx = signCanvas.getContext('2d')!;
      sCtx.fillStyle = '#0C1424'; sCtx.fillRect(0, 0, 256, 64);
      sCtx.fillStyle = '#E2E8F0'; sCtx.font = 'bold 20px Arial'; sCtx.textAlign = 'center';
      sCtx.fillText(client.company || client.name, 128, 38);

      const signTex = new THREE.CanvasTexture(signCanvas);
      const hasPending = client.payments?.some(p => p.status === 'pending');
      const hasOverdue = client.payments?.some(p => p.status === 'overdue');
      const signColor = hasOverdue ? '#ef4444' : hasPending ? '#fbbf24' : '#4ade80';
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex, emissive: signColor, emissiveIntensity: 0.3,
        emissiveMap: signTex, roughness: 0.1,
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMat);
      sign.position.set(bi.cx, maxBuildingH - 3, bi.cz + 15);
      sGroup.add(sign);
      // Only show on first qualifying district to avoid clutter
      break;
    }

    // ── SCHEDULE/ENERGY → CITY ACTIVITY LEVEL ────────────────────────────────
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const activeBlock = appData.timeBlocks.find(
      b => b.date === todayStr && b.startTime <= hhmm && b.endTime > hhmm
    );
    const currentEnergy = activeBlock?.energy ?? 3;
    // Energy modulates a global ambient boost: 5 = warm bright, 1 = cool dim
    const energyT = (currentEnergy - 1) / 4; // 0 to 1
    // Apply subtle ambient tint — boost hemi sky color warmth based on energy
    // This is a lightweight effect: just tweak fill light intensity
    // (actual fill light is managed by applyTimeOfDay, so we layer on a small delta)
    // We store the energy boost in cityLightRef for the animate loop to pick up
    const energyBoost = energyT * 0.15; // 0 to 0.15 extra intensity
    cityLightRef.current.hemiI += energyBoost;

    // ── COURSES → BYU CAMPUS ENHANCEMENT ─────────────────────────────────────
    if (appData.courses.length > 0 && cityGroupRef.current) {
      // Remove old course indicators
      if (courseIndicatorsRef.current) {
        courseIndicatorsRef.current.traverse(c => {
          if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
        });
        courseIndicatorsRef.current.parent?.remove(courseIndicatorsRef.current);
      }

      const courseGroup = new THREE.Group();

      // BYU Campus is at col=1, row=1 — find its center
      let byuCx = 50, byuCz = 50; // approximate
      for (const [label, meshes] of districtBuildingMeshesRef.current) {
        if (label === 'BYU Campus' && meshes.length > 0) {
          const bi = meshes[0].userData.blockInfo;
          if (bi) { byuCx = bi.cx; byuCz = bi.cz; }
          break;
        }
      }

      const weekAhead = new Date();
      weekAhead.setDate(weekAhead.getDate() + 7);
      const weekStr = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`;

      appData.courses.forEach((course, i) => {
        const angle = (i / appData.courses.length) * Math.PI * 2;
        const radius = 28; // distance from campus center
        const cx = byuCx + Math.cos(angle) * radius;
        const cz = byuCz + Math.sin(angle) * radius;

        // Building sized by credits (3 credits = 8 height, 5 = 14)
        const bH = 4 + course.credits * 2;
        const bW = 5, bD = 4;

        // Grade-based color: meeting target = green glow, below = yellow/red
        const meetingTarget = course.currentGrade >= (course.targetGrade ?? 0);
        const gradeColor = meetingTarget ? 0x4ade80 : course.currentGrade >= 70 ? 0xfbbf24 : 0xef4444;

        const buildingMat = new THREE.MeshStandardMaterial({
          color: course.color || '#6A8AA0',
          roughness: 0.7,
          emissive: gradeColor,
          emissiveIntensity: 0.15,
        });
        const building = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), buildingMat);
        building.position.set(cx, bH / 2, cz);
        building.castShadow = true;
        courseGroup.add(building);

        // Roof trim
        const trimMat = new THREE.MeshStandardMaterial({ color: '#002E5D', roughness: 0.6 });
        const trim = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.3, 0.3, bD + 0.3), trimMat);
        trim.position.set(cx, bH + 0.15, cz);
        courseGroup.add(trim);

        // Check for upcoming exams → beacon
        const hasUpcomingExam = course.examDates.some(
          ex => ex.date >= todayStr && ex.date <= weekStr
        );
        if (hasUpcomingExam) {
          const examBeaconMat = new THREE.MeshStandardMaterial({
            color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.9,
          });
          const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 6), examBeaconMat);
          beacon.position.set(cx, bH + 1.5, cz);
          beacon.userData.type = 'beacon';
          courseGroup.add(beacon);
        }
      });

      cityGroupRef.current.add(courseGroup);
      courseIndicatorsRef.current = courseGroup;
    }

  }, [appData]);

  // Draw floor plan when selected building changes
  useEffect(() => {
    if (!selectedBlock || !floorPlanRef.current) return;
    const ctx = floorPlanRef.current.getContext('2d');
    if (!ctx) return;
    const archData = blockArchetypeMapRef.current.get(`${selectedBlock.col},${selectedBlock.row}`);
    const isBYUBlock = selectedBlock.col === 1 && selectedBlock.row === 1;
    drawFloorPlan(ctx, isBYUBlock ? 'stadium' : (archData?.arch ?? 'midrise'), ZONE_COLORS[selectedBlock.zone]);
  }, [selectedBlock]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={labelRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div
        ref={tooltipRef}
        style={{
          display: 'none', position: 'fixed', zIndex: 60, pointerEvents: 'none',
          background: 'rgba(8,12,24,0.92)', border: '1px solid rgba(100,160,255,0.2)',
          borderRadius: 8, padding: '6px 10px', backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 220,
        }}
      />

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

          {/* Data command panel overlay */}
          {appData && <WorldDataPanel appData={appData} />}

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

          {/* District search */}
          <div style={{
            position: 'absolute', top: 14, right: 14, zIndex: 15,
            display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end',
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {searchOpen && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      const match = blocksRef.current.find(b =>
                        b.label.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                      if (match) {
                        minimapPanRef.current = new THREE.Vector3(match.cx, 0, match.cz);
                        setSearchOpen(false); setSearchQuery('');
                      }
                    }
                  }}
                  placeholder="Search district..."
                  autoFocus
                  style={{
                    background: 'rgba(8,12,24,0.90)', border: '1px solid rgba(100,160,255,0.3)',
                    borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 11,
                    outline: 'none', width: 160, backdropFilter: 'blur(10px)',
                  }}
                />
              )}
              <button
                className="wv-top-btn"
                onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
                title="Search districts"
                style={{
                  background: 'rgba(8,12,24,0.80)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, padding: '7px 11px', color: '#8899B4',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  backdropFilter: 'blur(10px)', transition: 'background 0.15s',
                }}
              >&#x1F50D;</button>
            </div>
            {/* Search results dropdown */}
            {searchOpen && searchQuery.length > 0 && (
              <div style={{
                background: 'rgba(8,12,24,0.95)', border: '1px solid rgba(100,160,255,0.2)',
                borderRadius: 8, maxHeight: 180, overflowY: 'auto', width: 200,
                backdropFilter: 'blur(10px)',
              }}>
                {blocksRef.current
                  .filter(b => b.label.toLowerCase().includes(searchQuery.toLowerCase()))
                  .filter((b, i, arr) => arr.findIndex(x => x.label === b.label) === i)
                  .slice(0, 8)
                  .map((b, i) => (
                    <button
                      key={`${b.col}-${b.row}-${i}`}
                      onClick={() => {
                        minimapPanRef.current = new THREE.Vector3(b.cx, 0, b.cz);
                        setSearchOpen(false); setSearchQuery('');
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: 'none', border: 'none', padding: '6px 10px',
                        color: '#c0d0e8', fontSize: 11, cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,140,220,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span style={{ fontWeight: 600 }}>{b.label}</span>
                      <span style={{ color: '#475569', marginLeft: 6, fontSize: 9, textTransform: 'uppercase' }}>{b.zone}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Bottom-right: Bird's eye button (moved away from info card) */}
          <button
            className="wv-top-btn"
            onClick={() => { birdEyeTargetRef.current = { phi: 0.06, radius: 220 }; }}
            title="Bird's eye view"
            style={{
              position: 'absolute', bottom: 14, right: 14, zIndex: 10,
              background: 'rgba(8,12,24,0.80)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '7px 13px', color: '#8899B4',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              backdropFilter: 'blur(10px)', letterSpacing: '0.04em',
              transition: 'background 0.15s, color 0.15s',
            }}
          >↑ Top</button>

          {/* Legend button */}
          <button
            className="wv-top-btn"
            onClick={() => setLegendOpen(o => !o)}
            title="Data legend"
            style={{
              position: 'absolute', bottom: 14, right: 80, zIndex: 10,
              background: legendOpen ? 'rgba(60,120,220,0.22)' : 'rgba(8,12,24,0.80)',
              border: `1px solid ${legendOpen ? 'rgba(100,160,240,0.35)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, padding: '7px 11px', color: legendOpen ? '#7EB8F8' : '#8899B4',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              backdropFilter: 'blur(10px)', transition: 'background 0.15s',
            }}
          >Legend</button>

          {/* Data legend panel */}
          {legendOpen && (
            <div style={{
              position: 'absolute', bottom: 50, right: 14, zIndex: 15,
              background: 'rgba(8,12,24,0.92)', border: '1px solid rgba(100,160,255,0.2)',
              borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)', width: 220,
              animation: 'fadeIn 0.2s ease-out',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Indicator Legend</div>
              {[
                { color: '#4ade80', label: 'Healthy project' },
                { color: '#fbbf24', label: 'At-risk project / in-progress todos' },
                { color: '#ef4444', label: 'Overdue todos / red health' },
                { color: '#fbbf24', glyph: '▭', label: 'Scaffolding — active work' },
                { color: '#ef4444', glyph: '●', label: 'Beacon — overdue items' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  {item.glyph
                    ? <span style={{ color: item.color, fontSize: 12, width: 10, textAlign: 'center', flexShrink: 0 }}>{item.glyph}</span>
                    : <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0, boxShadow: `0 0 4px ${item.color}55` }} />
                  }
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{item.label}</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 0' }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: '#7EB8F8', marginBottom: 4 }}>Data Integrations</div>
              {[
                { color: '#4ade80', label: 'Park vitality — habit completion %' },
                { color: '#3b82f6', label: 'Goal columns — progress by life area' },
                { color: '#10b981', label: 'Financial billboard — monthly income/expense' },
                { color: '#8b5cf6', label: 'Campus buildings — courses & grades' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Controls hint */}
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 20, padding: '4px 14px', color: '#64748b', fontSize: 10,
            pointerEvents: 'none', whiteSpace: 'nowrap', letterSpacing: '0.04em',
          }}>
            Drag · Scroll · Right-drag/WASD to pan · Click to inspect · B bird's eye · F focus · Esc deselect
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
                {/* Contextual data for linked project */}
                {appData && <WorldBlockDataCard block={selectedBlock} appData={appData} />}

                <button
                  className="wv-btn"
                  onClick={() => enterBuildingCallbackRef.current?.(selectedBlock)}
                  style={{
                    width: '100%', padding: '8px 0', marginTop: 8,
                    background: 'rgba(60,120,220,0.16)', border: '1px solid rgba(80,140,240,0.30)',
                    borderRadius: 7, color: '#7EB8F8', cursor: 'pointer', fontSize: 11,
                    fontWeight: 600, letterSpacing: '0.04em',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  Enter Building →
                </button>

                {/* Navigation buttons — only show when linked project exists */}
                {appData && onNavigateToSection && (() => {
                  const proj = findLinkedProject(selectedBlock.label, appData.projects);
                  if (!proj) return null;
                  return (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button
                        className="wv-btn"
                        onClick={() => onNavigateToSection('projects')}
                        style={{
                          flex: 1, padding: '6px 0',
                          background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.22)',
                          borderRadius: 6, color: '#4ade80', cursor: 'pointer', fontSize: 10,
                          fontWeight: 600, transition: 'background 0.15s',
                        }}
                      >Project</button>
                      <button
                        className="wv-btn"
                        onClick={() => onNavigateToSection('todos')}
                        style={{
                          flex: 1, padding: '6px 0',
                          background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.22)',
                          borderRadius: 6, color: '#fbbf24', cursor: 'pointer', fontSize: 10,
                          fontWeight: 600, transition: 'background 0.15s',
                        }}
                      >Todos</button>
                      <button
                        className="wv-btn"
                        onClick={() => onNavigateToSection('contacts')}
                        style={{
                          flex: 1, padding: '6px 0',
                          background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.22)',
                          borderRadius: 6, color: '#60a5fa', cursor: 'pointer', fontSize: 10,
                          fontWeight: 600, transition: 'background 0.15s',
                        }}
                      >Contacts</button>
                    </div>
                  );
                })()}
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

          {/* Zone legend — compact, no water row */}
          <div style={{
            position: 'absolute', top: 14, left: 14,
            background: 'rgba(6,10,20,0.82)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '8px 10px', zIndex: 10, backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}>
            {(['downtown','midrise','mixed','low','park'] as const).map(zone => (
              <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 7, height: 7, borderRadius: 2, background: ZONE_COLORS[zone], flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: '#6B7A8D', textTransform: 'capitalize', letterSpacing: '0.04em' }}>{zone}</span>
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
                      width: 38, height: 30,
                      background: active ? 'rgba(80,140,220,0.3)' : 'transparent',
                      border: active ? '1px solid rgba(100,160,240,0.5)' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 5, color: active ? '#c8ddff' : '#64748b',
                      fontSize: 11, cursor: 'pointer', fontWeight: active ? 700 : 400,
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
