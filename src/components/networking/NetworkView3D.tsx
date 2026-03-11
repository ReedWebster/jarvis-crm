/**
 * NetworkView3D — Phase 3 City: Photorealistic Visual Overhaul.
 * Same layout, districts, and interactions as Phase 2.
 * New: Sky shader, post-processing, detailed buildings, trees, cars, fountain, traffic signals.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, NoiseEffect } from 'postprocessing';
import { Search, X } from 'lucide-react';
import type {
  Contact,
  Project,
  ContactMapData,
  NetworkingMapState,
  NetworkManualConnection,
  NetworkOrg,
  RelationshipStrength,
} from '../../types';
import { defaultContactMapData, isFollowUpPending } from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PLAYER_HEIGHT  = 1.8;
const PLAYER_SPEED   = 10;
const PLAYER_RUN     = 1.6;
const PLAYER_RADIUS  = 0.5;
const MOUSE_SENS     = 0.0018;
const NPC_INTERACT   = 2.8;
const NPC_LOOK_DIST  = 10;
const NPC_FADE_DIST  = 15;
const HEAD_BOB_SPEED = 5;
const HEAD_BOB_AMP   = 0.06;
const DAY_CYCLE      = 600;
const RAIN_COUNT     = 2500;
const FOUNTAIN_COUNT = 140;

// ─── STRENGTH SYSTEM ──────────────────────────────────────────────────────────

const STRENGTH_BODY: Record<RelationshipStrength, string> = {
  hot:      '#FFD700',
  warm:     '#4A90D9',
  cold:     '#888888',
  personal: '#9B59B6',
};
const STRENGTH_EMISSIVE: Record<RelationshipStrength, string> = {
  hot:      '#FF8C00',
  warm:     '#2060AA',
  cold:     '#333333',
  personal: '#6C3483',
};
const STRENGTH_EMIT_INT: Record<RelationshipStrength, number> = {
  hot: 0.35, warm: 0.2, cold: 0.0, personal: 0.2,
};

function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  try { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000); }
  catch { return 9999; }
}

function deriveStrength(c: Contact, mapData?: ContactMapData): RelationshipStrength {
  if (mapData?.strength) return mapData.strength;
  const d = daysSince(c.lastContacted);
  if (d <= 7)  return 'hot';
  if (d <= 30) return 'warm';
  return 'cold';
}

// ─── DISTRICTS ────────────────────────────────────────────────────────────────

interface DistrictDef {
  id: string; name: string;
  cx: number; cz: number;
  color: string; trim: string;
  w: number; d: number;
  mmColor: string;
}

const DISTRICTS: DistrictDef[] = [
  { id: 'byu',          name: 'BYU District',   cx:   0, cz: -80, color: '#8B4513', trim: '#D2691E', w: 60, d: 50, mmColor: '#9B5523' },
  { id: 'vanta',        name: 'Vanta HQ',        cx:  80, cz:   0, color: '#1a1a2e', trim: '#0066ff', w: 60, d: 50, mmColor: '#2244aa' },
  { id: 'rockcanyonai', name: 'Rock Canyon AI',  cx:  60, cz:  80, color: '#d8d8e8', trim: '#00d4ff', w: 60, d: 50, mmColor: '#99ccdd' },
  { id: 'neighborhood', name: 'Neighborhood',    cx: -80, cz:   0, color: '#D2B48C', trim: '#8B7355', w: 60, d: 50, mmColor: '#D2B48C' },
  { id: 'chapel',       name: 'Chapel District', cx: -60, cz: -70, color: '#F0EEE8', trim: '#B8B8B0', w: 50, d: 40, mmColor: '#DDDDD5' },
  { id: 'outskirts',    name: 'Outskirts',        cx:   0, cz:  80, color: '#909090', trim: '#606060', w: 70, d: 55, mmColor: '#808080' },
];

function assignDistrict(c: Contact): string {
  const co  = (c.company      ?? '').toLowerCase();
  const rel = (c.relationship ?? '').toLowerCase();
  const tags = c.tags as string[];
  if (co.includes('byu') || co.includes('brigham') || rel.includes('school') || rel.includes('university'))
    return 'byu';
  if (co.includes('vanta') || co.includes('marketing') || tags.includes('Client'))
    return 'vanta';
  if (co.includes('rock canyon') || co.includes('ai') || co.includes('tech') || co.includes('software') ||
      tags.includes('Colleague') || tags.includes('Partner'))
    return 'rockcanyonai';
  if (tags.includes('Family') || rel.includes('family') || rel.includes('parent') || rel.includes('sibling'))
    return 'neighborhood';
  if (tags.includes('church') || rel.includes('church') || rel.includes('lds') || rel.includes('bishop') ||
      co.includes('church') || co.includes('lds'))
    return 'chapel';
  return 'outskirts';
}

// ─── SEEDED RANDOM ────────────────────────────────────────────────────────────

function seededRandom(seed: string): () => number {
  let h = 0;
  for (const ch of seed) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return () => {
    h = (Math.imul(2654435761, h ^ (h >>> 16))) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface NpcEntry {
  group:      THREE.Group;
  contact:    Contact;
  districtId: string;
  labelDiv:   HTMLDivElement;
  bodyMat:    THREE.MeshStandardMaterial;
  headMat:    THREE.MeshStandardMaterial;
}

interface TrafficSignal {
  redMat:    THREE.MeshStandardMaterial;
  yellowMat: THREE.MeshStandardMaterial;
  greenMat:  THREE.MeshStandardMaterial;
  light:     THREE.PointLight;
  timer:     number;
  state:     0 | 1 | 2; // 0=green, 1=yellow, 2=red
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  contacts:                Contact[];
  projects:                Project[];
  mapState:                NetworkingMapState;
  filteredIds:             Set<string>;
  onUpdateMapData:         (contactId: string, data: Partial<ContactMapData>) => void;
  onUpdateContact:         (updated: Contact) => void;
  onToggleAutoConnections: () => void;
  onSaveManualConnection:  (conn: NetworkManualConnection) => void;
  onDeleteManualConnection:(id: string) => void;
  onUpdateNodePositions:   (updates: Record<string, ContactMapData>) => void;
  onNavigateToCRM:         () => void;
  onAddContact:            (contact: Contact) => void;
  onUpdateOrgs:            (orgs: NetworkOrg[]) => void;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function lerpN(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpColor(a: THREE.Color, b: THREE.Color, t: number) {
  return new THREE.Color(lerpN(a.r, b.r, t), lerpN(a.g, b.g, t), lerpN(a.b, b.b, t));
}

// ─── LAMP POST (Phase 3 — LatheGeometry) ─────────────────────────────────────

function makeLamp(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Tapered LatheGeometry pole
  const pts = [
    new THREE.Vector2(0.10, 0),
    new THREE.Vector2(0.07, 0.5),
    new THREE.Vector2(0.05, 3.5),
    new THREE.Vector2(0.055, 3.9),
  ];
  const poleMat = new THREE.MeshStandardMaterial({ color: '#444444', metalness: 0.7, roughness: 0.3 });
  const pole = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), poleMat);
  pole.castShadow = true;
  g.add(pole);

  // Horizontal arm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.07, 0.07),
    new THREE.MeshStandardMaterial({ color: '#444444', metalness: 0.7, roughness: 0.3 })
  );
  arm.position.set(0.42, 3.88, 0);
  g.add(arm);

  // Globe
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fffbe6', emissive: '#ffffaa', emissiveIntensity: 0
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), headMat);
  head.position.set(0.86, 3.88, 0);
  g.add(head);

  const light = new THREE.PointLight('#ffeeaa', 0, 18, 1.5);
  light.position.set(0.86, 3.88, 0);
  g.add(light);

  g.userData.lampHead  = head;
  g.userData.lampLight = light;
  return g;
}

// ─── TREE ─────────────────────────────────────────────────────────────────────

function makeTree(x: number, z: number, rng: () => number, distId: string): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const trunkH = 1.8 + rng() * 0.8;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.16, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: '#5c3d1e', roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const byuDist = distId === 'byu';
  const colors = byuDist
    ? ['#5a7a2a', '#6b8c2a', '#7a9c30']
    : ['#2d6a2d', '#3a7a30', '#4a8f3f'];

  for (let i = 0; i < 3; i++) {
    const r = 0.9 + rng() * 0.5;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 8),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.8 })
    );
    canopy.position.set(
      (rng() - 0.5) * 0.6,
      trunkH + r * 0.7 + i * 0.25,
      (rng() - 0.5) * 0.6
    );
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    g.add(canopy);
  }
  return g;
}

// ─── PARKED CAR ───────────────────────────────────────────────────────────────

const CAR_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400'];

function makeCar(x: number, z: number, rotY: number, colorIdx: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: CAR_COLORS[colorIdx % 5], metalness: 0.6, roughness: 0.3
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 1.1), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.52, 0.95),
    new THREE.MeshStandardMaterial({ color: '#1a2a3a', roughness: 0.05, metalness: 0.8 })
  );
  cabin.position.set(0.1, 0.98, 0);
  cabin.castShadow = true;
  g.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 });
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.20, 12);
  const wheelPositions: [number, number, number][] = [
    [ 0.72, 0.26,  0.58], [ 0.72, 0.26, -0.58],
    [-0.72, 0.26,  0.58], [-0.72, 0.26, -0.58],
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    g.add(w);
  }

  const hlMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0 });
  const tlMat = new THREE.MeshStandardMaterial({ color: '#ff1100', emissive: '#ff1100', emissiveIntensity: 0 });
  for (const side of [-0.35, 0.35] as const) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), hlMat.clone());
    hl.position.set(1.13, 0.5, side);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), tlMat.clone());
    tl.position.set(-1.13, 0.5, side);
    g.add(tl);
  }

  g.userData.hlMat = hlMat;
  g.userData.tlMat = tlMat;
  return g;
}

// ─── TRAFFIC SIGNAL ───────────────────────────────────────────────────────────

function makeTrafficSignal(x: number, z: number, rot: number): { group: THREE.Group; signal: TrafficSignal } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 3.8, 8),
    new THREE.MeshStandardMaterial({ color: '#333333', metalness: 0.6, roughness: 0.4 })
  );
  pole.position.y = 1.9;
  pole.castShadow = true;
  g.add(pole);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.85, 0.28),
    new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.7 })
  );
  box.position.y = 3.8;
  g.add(box);

  const rMat = new THREE.MeshStandardMaterial({ color: '#cc1111', emissive: '#cc1111', emissiveIntensity: 0.05 });
  const yMat = new THREE.MeshStandardMaterial({ color: '#ccaa00', emissive: '#ccaa00', emissiveIntensity: 0.05 });
  const gMat = new THREE.MeshStandardMaterial({ color: '#00aa22', emissive: '#00cc33', emissiveIntensity: 1.0 });

  const discGeo = new THREE.SphereGeometry(0.09, 10, 10);
  const redDisc    = new THREE.Mesh(discGeo, rMat); redDisc.position.set(0, 4.1, 0.16);    g.add(redDisc);
  const yellowDisc = new THREE.Mesh(discGeo, yMat); yellowDisc.position.set(0, 3.8, 0.16); g.add(yellowDisc);
  const greenDisc  = new THREE.Mesh(discGeo, gMat); greenDisc.position.set(0, 3.5, 0.16);  g.add(greenDisc);

  const signalLight = new THREE.PointLight('#00cc33', 0.35, 5, 2);
  signalLight.position.set(0, 3.5, 0.3);
  g.add(signalLight);

  const signal: TrafficSignal = { redMat: rMat, yellowMat: yMat, greenMat: gMat, light: signalLight, timer: 0, state: 0 };
  return { group: g, signal };
}

// ─── DISTRICT BUILDINGS (Phase 3) ─────────────────────────────────────────────

function buildDistrictBuildings(
  dist: DistrictDef,
  contactCount: number,
  scene: THREE.Scene,
  collidables: THREE.Object3D[],
  windows: THREE.Mesh[],
  specialMats: THREE.MeshStandardMaterial[]
): void {
  const mainH = Math.max(4, 2 + contactCount * 0.5);
  const rng   = seededRandom(dist.id + 'blds3');

  // Ground patch
  const dGround = new THREE.Mesh(
    new THREE.PlaneGeometry(dist.w, dist.d),
    new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.9 })
  );
  dGround.rotation.x = -Math.PI / 2;
  dGround.position.set(dist.cx, 0.015, dist.cz);
  dGround.receiveShadow = true;
  scene.add(dGround);

  // Per-district material
  let mainMat: THREE.MeshStandardMaterial;
  switch (dist.id) {
    case 'vanta':
      mainMat = new THREE.MeshStandardMaterial({ color: '#0a0a1a', roughness: 0.05, metalness: 0.9 });
      break;
    case 'rockcanyonai':
      mainMat = new THREE.MeshStandardMaterial({ color: '#f0f0f5', roughness: 0.3, metalness: 0.05 });
      break;
    case 'chapel':
      mainMat = new THREE.MeshStandardMaterial({ color: '#F0EEE8', roughness: 0.7, metalness: 0 });
      break;
    case 'outskirts':
      mainMat = new THREE.MeshStandardMaterial({ color: '#7a7a7a', roughness: 0.8, metalness: 0.4 });
      break;
    default:
      mainMat = new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.85, metalness: 0.0 });
  }

  // Base slab
  const baseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dist.color).lerp(new THREE.Color('#aaaaaa'), 0.3), roughness: 0.9
  });
  const base = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.6, 13.4), baseMat);
  base.position.set(dist.cx, 0.3, dist.cz);
  base.castShadow = true; base.receiveShadow = true;
  scene.add(base);

  // Main tower (same footprint as Phase 1 for collision compatibility)
  const mainBld = new THREE.Mesh(new THREE.BoxGeometry(12, mainH, 12), mainMat);
  mainBld.position.set(dist.cx, mainH / 2 + 0.6, dist.cz);
  mainBld.castShadow = true; mainBld.receiveShadow = true;
  mainBld.userData.districtId = dist.id;
  scene.add(mainBld);
  collidables.push(mainBld);

  // Setback floors for tall buildings
  if (mainH > 6) {
    const setH = Math.min(mainH * 0.35, 4.5);
    const set1 = new THREE.Mesh(new THREE.BoxGeometry(9, setH, 9), mainMat.clone());
    set1.position.set(dist.cx, mainH + 0.6 + setH / 2, dist.cz);
    set1.castShadow = true;
    scene.add(set1);
    if (mainH > 10) {
      const set2H = setH * 0.65;
      const set2 = new THREE.Mesh(new THREE.BoxGeometry(6, set2H, 6), mainMat.clone());
      set2.position.set(dist.cx, mainH + 0.6 + setH + set2H / 2, dist.cz);
      set2.castShadow = true;
      scene.add(set2);
    }
  }

  // Roof cap
  const trimMat = new THREE.MeshStandardMaterial({ color: dist.trim, roughness: 0.4, metalness: 0.3 });
  const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.35, 12.8), trimMat);
  trimMesh.position.set(dist.cx, mainH + 0.6 + 0.175, dist.cz);
  scene.add(trimMesh);

  // Roof details: AC units
  for (let i = 0; i < 3; i++) {
    const acH = 0.55 + rng() * 0.35;
    const acW = 1.6 + rng() * 0.6;
    const ac = new THREE.Mesh(
      new THREE.BoxGeometry(acW, acH, 1.1),
      new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.7, metalness: 0.3 })
    );
    ac.position.set(dist.cx + (i - 1) * 3.8, mainH + 0.6 + 0.35 + acH / 2, dist.cz + 3);
    scene.add(ac);
  }

  // Antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.8, roughness: 0.2 })
  );
  antenna.position.set(dist.cx + 2.5, mainH + 0.6 + 0.35 + 1.2, dist.cz - 2.5);
  scene.add(antenna);

  // Windows on main building
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffe8aa', emissive: '#ffcc44', emissiveIntensity: 0 });
  for (let wy = 1; wy < mainH - 0.5; wy += 1.6) {
    for (let wx = -4; wx <= 4; wx += 2.5) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), winMat.clone());
      win.position.set(dist.cx + wx, wy + 0.6, dist.cz + 6.02);
      scene.add(win);
      windows.push(win);
    }
  }

  // Invisible entrance trigger (same as Phase 1/2)
  const entranceTrigger = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  entranceTrigger.rotation.x = -Math.PI / 2;
  entranceTrigger.position.set(dist.cx, 0.1, dist.cz + 8);
  entranceTrigger.userData.isBuildingEntrance = true;
  entranceTrigger.userData.districtId         = dist.id;
  entranceTrigger.userData.districtName       = dist.name;
  scene.add(entranceTrigger);
  collidables.push(entranceTrigger);

  // ── District-specific extras ──────────────────────────────────────────────

  if (dist.id === 'vanta') {
    // Blue LED strips along building vertical edges
    const ledMat = new THREE.MeshStandardMaterial({ color: '#1e40af', emissive: '#1e40af', emissiveIntensity: 0 });
    for (const [ex, ez] of [[5.88, 5.88], [-5.88, 5.88], [5.88, -5.88], [-5.88, -5.88]] as [number,number][]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, mainH + 0.4, 0.12), ledMat.clone());
      strip.position.set(dist.cx + ex, mainH / 2 + 0.6, dist.cz + ez);
      scene.add(strip);
      specialMats.push(strip.material as THREE.MeshStandardMaterial);
    }
    // Dark granite base
    const granite = new THREE.Mesh(
      new THREE.BoxGeometry(14, 1.2, 14),
      new THREE.MeshStandardMaterial({ color: '#050510', roughness: 0.2, metalness: 0.8 })
    );
    granite.position.set(dist.cx, 0.6, dist.cz);
    scene.add(granite);
  }

  if (dist.id === 'chapel') {
    // Bell tower + steeple on main building
    const towerMat = mainMat.clone();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5.5, 3.5), towerMat);
    tower.position.set(dist.cx, mainH + 0.6 + 2.75, dist.cz - 2);
    tower.castShadow = true;
    scene.add(tower);

    const steeple = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.72, 5.5, 8),
      towerMat.clone()
    );
    steeple.position.set(dist.cx, mainH + 0.6 + 5.5 + 2.75, dist.cz - 2);
    steeple.castShadow = true;
    scene.add(steeple);

    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: '#d8d6d2', roughness: 0.5 })
    );
    spire.position.set(dist.cx, mainH + 0.6 + 5.5 + 5.5 + 1.6, dist.cz - 2);
    spire.castShadow = true;
    scene.add(spire);
  }

  if (dist.id === 'neighborhood') {
    // Pitched roof — two angled planes forming a ridge
    const roofMat = new THREE.MeshStandardMaterial({ color: '#6b4c30', roughness: 0.85 });
    const slopeZ  = 3.8;
    const pitch   = 0.30;
    const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 7.5), roofMat);
    leftSlope.position.set(dist.cx, mainH + 0.6 + 0.35 + 1.7, dist.cz - slopeZ + 0.6);
    leftSlope.rotation.x = -pitch;
    scene.add(leftSlope);
    const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 7.5), roofMat.clone());
    rightSlope.position.set(dist.cx, mainH + 0.6 + 0.35 + 1.7, dist.cz + slopeZ - 0.6);
    rightSlope.rotation.x = pitch;
    scene.add(rightSlope);
  }

  if (dist.id === 'rockcanyonai') {
    // Flat rooftop green garden
    const garden = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.28, 10.5),
      new THREE.MeshStandardMaterial({ color: '#3a6e3a', roughness: 0.8 })
    );
    garden.position.set(dist.cx, mainH + 0.6 + 0.35 + 0.14, dist.cz);
    scene.add(garden);
    // Horizontal window bands (wider windows)
    for (let wy = 1.5; wy < mainH - 0.5; wy += 2.2) {
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(10.5, 0.85),
        new THREE.MeshStandardMaterial({ color: '#cce8ff', emissive: '#88bbff', emissiveIntensity: 0, roughness: 0.1, metalness: 0.5 })
      );
      band.position.set(dist.cx, wy + 0.6, dist.cz + 6.03);
      scene.add(band);
      windows.push(band);
    }
  }

  if (dist.id === 'outskirts') {
    // Corrugated metal-look horizontal ribs on building
    for (let wy = 1; wy < mainH - 0.5; wy += 1.2) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(12.3, 0.12, 0.05),
        new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.5, roughness: 0.7 })
      );
      rib.position.set(dist.cx, wy + 0.6, dist.cz + 6.04);
      scene.add(rib);
    }
  }

  // ── Small surrounding buildings ───────────────────────────────────────────
  const offsets: [number, number][] = [[-15, -12], [15, -12], [-15, 12], [15, 12], [0, -18]];
  const numSmall = Math.min(5, 2 + Math.floor(contactCount / 4));
  for (let bi = 0; bi < numSmall; bi++) {
    const [bx, bz] = offsets[bi];
    const bH = 2 + rng() * 4;
    const bW = 5 + rng() * 4;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(bW, bH, bW),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(dist.color).lerp(new THREE.Color('#ffffff'), 0.2), roughness: 0.7
      })
    );
    b.position.set(dist.cx + bx, bH / 2 + 0.6, dist.cz + bz);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
    collidables.push(b);

    // Windows on small buildings
    for (let wy = 1; wy < bH - 0.5; wy += 1.6) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshStandardMaterial({ color: '#ffe8aa', emissive: '#ffcc44', emissiveIntensity: 0 })
      );
      win.position.set(dist.cx + bx, wy + 0.6, dist.cz + bz + bW / 2 + 0.01);
      scene.add(win);
      windows.push(win);
    }
  }
}

// ─── DISTRICT SPRITE ──────────────────────────────────────────────────────────

function makeDistrictSprite(dist: DistrictDef, count: number): THREE.Sprite {
  const nc    = document.createElement('canvas');
  nc.width     = 256; nc.height = 64;
  const ctx   = nc.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  (ctx as any).roundRect?.(0, 0, 256, 64, 8);
  ctx.fill();
  ctx.fillStyle = dist.trim;
  ctx.font      = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(dist.name, 128, 26);
  ctx.fillStyle = '#aaaaaa';
  ctx.font      = '13px system-ui';
  ctx.fillText(`${count} contact${count !== 1 ? 's' : ''}`, 128, 50);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), transparent: true }));
  sprite.scale.set(16, 4, 1);
  return sprite;
}

// ─── SPAWN NPC (unchanged from Phase 2) ─────────────────────────────────────

function spawnNPC(
  contact: Contact,
  mapData: ContactMapData,
  dist: DistrictDef,
  scene: THREE.Scene,
): NpcEntry {
  const rng      = seededRandom(contact.id);
  const angle    = rng() * Math.PI * 2;
  const radius   = 6 + rng() * 8;
  const x        = dist.cx + Math.cos(angle) * radius;
  const z        = dist.cz + Math.sin(angle) * radius;

  const g       = new THREE.Group();
  g.position.set(x, 0, z);

  const strength  = deriveStrength(contact, mapData);
  const bodyColor = STRENGTH_BODY[strength];
  const emissive  = STRENGTH_EMISSIVE[strength];
  const emitInt   = STRENGTH_EMIT_INT[strength];

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8, emissive: emissive, emissiveIntensity: emitInt });
  const headMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, emissive: emissive, emissiveIntensity: emitInt });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.1, 10), bodyMat);
  body.position.y = 0.7;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), headMat);
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);

  if (mapData.photo) {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 80; cv.height = 80;
      const c2 = cv.getContext('2d')!;
      c2.beginPath();
      c2.arc(40, 40, 40, 0, Math.PI * 2);
      c2.clip();
      c2.drawImage(img, 0, 0, 80, 80);
      headMat.map   = new THREE.CanvasTexture(cv);
      headMat.color.set('#ffffff');
      headMat.needsUpdate = true;
    };
    img.src = mapData.photo;
  }

  const days = daysSince(contact.lastContacted);
  if (days >= 30 && days < 9999) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.05, 8, 16),
      new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.8 })
    );
    ring.rotation.x     = -Math.PI / 2;
    ring.position.y     = 0.05;
    ring.userData.pulse = true;
    g.add(ring);
  }
  if (days <= 7) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.04, 8, 16),
      new THREE.MeshStandardMaterial({ color: '#FFD700', emissive: '#FFD700', emissiveIntensity: 0.8 })
    );
    halo.rotation.x     = -Math.PI / 2;
    halo.position.y     = 0.05;
    halo.userData.pulse = true;
    g.add(halo);
  }
  if (isFollowUpPending(contact)) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 1.0 })
    );
    orb.userData.isOrb = true;
    g.add(orb);
  }

  const labelDiv = document.createElement('div');
  const nameEl   = document.createElement('div');
  nameEl.textContent = contact.name;
  nameEl.style.cssText = 'color:#e2e8f0;font-size:11px;font-weight:600;line-height:1.3;';
  labelDiv.appendChild(nameEl);
  const sub = contact.company || contact.relationship;
  if (sub) {
    const subEl = document.createElement('div');
    subEl.textContent   = sub;
    subEl.style.cssText = 'color:#94a3b8;font-size:9px;line-height:1.3;';
    labelDiv.appendChild(subEl);
  }
  Object.assign(labelDiv.style, {
    background: 'rgba(0,0,0,0.75)', padding: '3px 8px', borderRadius: '10px',
    fontFamily: 'system-ui,sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap',
    border: '1px solid rgba(255,255,255,0.12)', userSelect: 'none', textAlign: 'center',
  });
  const label = new CSS2DObject(labelDiv);
  label.position.set(0, 2.5, 0);
  g.add(label);

  g.userData.bobOffset   = seededRandom(contact.id + 'bob')();
  g.userData.strength    = strength;
  g.userData.labelDiv    = labelDiv;
  g.userData.spawnTime   = Date.now();
  g.scale.setScalar(0);
  g.userData.targetScale = 1;

  scene.add(g);
  return { group: g, contact, districtId: assignDistrict(contact), labelDiv, bodyMat, headMat };
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function NetworkView3D({
  contacts,
  mapState,
  filteredIds,
  onUpdateMapData,
  onUpdateContact,
  onNavigateToCRM,
  onUpdateOrgs,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [isLocked,        setIsLocked]        = useState(false);
  const [nearbyContact,   setNearbyContact]   = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search,          setSearch]          = useState('');
  const [districtFilter,  setDistrictFilter]  = useState('all');
  const [isRaining,       setIsRaining]       = useState(false);
  const [shownCount,      setShownCount]      = useState(0);
  const [quality,         setQuality]         = useState<'low' | 'medium' | 'high'>('medium');

  const filteredRef        = useRef(filteredIds);
  const searchRef          = useRef('');
  const districtFilterRef  = useRef('all');
  const isRainingRef       = useRef(false);
  const isLockedRef        = useRef(false);
  const nearbyRef          = useRef<Contact | null>(null);
  const selectedRef        = useRef<Contact | null>(null);
  const npcMeshesRef       = useRef<Map<string, NpcEntry>>(new Map());

  const sceneRef           = useRef<THREE.Scene | null>(null);
  const connLinesRef       = useRef<THREE.Group | null>(null);
  const syncNPCsRef        = useRef<((cs: Contact[], cd: Record<string, ContactMapData>) => void) | null>(null);
  const updateConnLinesRef = useRef<((c: Contact | null) => void) | null>(null);
  const updateQualityRef   = useRef<((q: 'low' | 'medium' | 'high') => void) | null>(null);
  const nightLevelRef      = useRef(0);
  const nameplateMapRef    = useRef<Map<string, THREE.Sprite>>(new Map());

  useEffect(() => { filteredRef.current       = filteredIds;    }, [filteredIds]);
  useEffect(() => { searchRef.current         = search;         }, [search]);
  useEffect(() => { districtFilterRef.current = districtFilter; }, [districtFilter]);
  useEffect(() => { isRainingRef.current      = isRaining;      }, [isRaining]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !selectedRef.current && nearbyRef.current) {
        setSelectedContact(nearbyRef.current);
        selectedRef.current = nearbyRef.current;
      }
      if (e.code === 'Escape') {
        setSelectedContact(null);
        selectedRef.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    const shown = contacts.filter(c => {
      const nm = !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q);
      const dm = districtFilter === 'all' || assignDistrict(c) === districtFilter;
      return nm && dm;
    }).length;
    setShownCount(shown);
  }, [contacts, search, districtFilter]);

  useEffect(() => {
    syncNPCsRef.current?.(contacts, mapState.contactData);
  }, [contacts, mapState.contactData]);

  useEffect(() => {
    updateConnLinesRef.current?.(selectedContact);
    selectedRef.current = selectedContact;
  }, [selectedContact]);

  // ── MAIN THREE.JS SETUP ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas   = canvasRef.current!;
    const labelDiv = labelRef.current!;
    const mmCanvas = minimapRef.current!;
    if (!canvas || !labelDiv || !mmCanvas) return;

    const W = canvas.clientWidth  || 800;
    const H = canvas.clientHeight || 600;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace  = THREE.SRGBColorSpace;

    // ── CSS2D ──
    const css2d = new CSS2DRenderer();
    css2d.setSize(W, H);
    Object.assign(css2d.domElement.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none',
    });
    labelDiv.appendChild(css2d.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);

    // ── Sky shader ──
    const sky = new Sky();
    sky.scale.setScalar(450);
    scene.add(sky);
    const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity'].value        = 8;
    skyUniforms['rayleigh'].value         = 2;
    skyUniforms['mieCoefficient'].value   = 0.005;
    skyUniforms['mieDirectionalG'].value  = 0.8;
    const sunVec = new THREE.Vector3();

    // ── Stars ──
    const starPositions = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const phi   = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      starPositions[i * 3]     = 275 * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = 275 * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = 275 * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.6, color: '#ffffff', transparent: true, opacity: 0, sizeAttenuation: true });
    const stars   = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

    // ── Lighting ──
    const ambient = new THREE.AmbientLight('#ffffff', 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 400;
    sun.shadow.camera.left   = -140;
    sun.shadow.camera.right  = 140;
    sun.shadow.camera.top    = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.bias = -0.0003;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight('#87ceeb', '#3d5a3e', 0.4);
    scene.add(hemi);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 550);
    camera.position.set(0, PLAYER_HEIGHT, 5);

    // ── Post-processing ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomEffect   = new BloomEffect({ intensity: 0.7, luminanceThreshold: 0.82, luminanceSmoothing: 0.04, mipmapBlur: true });
    const vignetteEffect = new VignetteEffect({ darkness: 0.38, offset: 0.4 });
    const noiseEffect    = new NoiseEffect({ premultiply: true });
    noiseEffect.blendMode.opacity.value = 0;

    const bloomPass  = new EffectPass(camera, bloomEffect);
    const visualPass = new EffectPass(camera, vignetteEffect, noiseEffect);
    composer.addPass(bloomPass);
    composer.addPass(visualPass);

    updateQualityRef.current = (q: 'low' | 'medium' | 'high') => {
      bloomPass.enabled = q !== 'low';
      noiseEffect.blendMode.opacity.value = q === 'high' ? 0.035 : 0;
    };

    // ── Ground ──
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#2e4e1e', roughness: 1.0 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ── Roads ──
    const roadMat  = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.95, metalness: 0.02 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.85 });

    function addRoad(cx: number, cz: number, width: number, length: number, rotY = 0) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(width, length), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = rotY;
      road.position.set(cx, 0.01, cz);
      road.receiveShadow = true;
      scene.add(road);
      for (const side of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, length), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.rotation.z = rotY;
        const off = (width / 2 + 0.75) * side;
        sw.position.set(cx + Math.cos(rotY) * off, 0.02, cz + Math.sin(rotY) * off);
        sw.receiveShadow = true;
        scene.add(sw);
        // Curb
        const curbW = Math.abs(Math.cos(rotY)) > 0.7 ? 0.2 : length;
        const curbL = Math.abs(Math.cos(rotY)) > 0.7 ? length : 0.2;
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(curbW, 0.14, curbL),
          new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.9 })
        );
        const curbOff = (width / 2 + 0.05) * side;
        curb.position.set(cx + Math.cos(rotY) * curbOff, 0.07, cz + Math.sin(rotY) * curbOff);
        scene.add(curb);
      }
    }

    addRoad(0, 0, 8, 260);
    addRoad(0, 0, 260, 8, Math.PI / 2);
    addRoad(0,   -44, 6, 50);
    addRoad(0,    44, 6, 50);
    addRoad( 44,   0, 6, 50, Math.PI / 2);
    addRoad(-44,   0, 6, 50, Math.PI / 2);
    addRoad(-32, -38, 5, 80, Math.PI * 0.22);
    addRoad( 32,  38, 5, 80, Math.PI * 0.22);

    // ── Road markings ──
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#e8c100', roughness: 0.9 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.9 });

    // N-S center dashes
    for (let z = -128; z < 128; z += 5) {
      if (Math.abs(z) < 18) continue;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.4), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(0, 0.015, z);
      scene.add(d);
    }
    // E-W center dashes
    for (let x = -128; x < 128; x += 5) {
      if (Math.abs(x) < 18) continue;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.015, 0);
      scene.add(d);
    }
    // Crosswalk stripes at center intersection
    for (let i = -3; i <= 3; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 0.48), whiteMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.016, 5.5 + i * 0.72);
      scene.add(stripe);
    }

    // ── Central Plaza ──
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: '#b0a898', roughness: 0.75 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.02, 0);
    plaza.receiveShadow = true;
    scene.add(plaza);

    // Fountain basin (LatheGeometry)
    const basinPts = [
      new THREE.Vector2(0,    0),
      new THREE.Vector2(2.8,  0),
      new THREE.Vector2(3.0,  0.15),
      new THREE.Vector2(2.8,  0.72),
      new THREE.Vector2(0.14, 0.76),
    ];
    const basin = new THREE.Mesh(
      new THREE.LatheGeometry(basinPts, 20),
      new THREE.MeshStandardMaterial({ color: '#888c90', roughness: 0.6, metalness: 0.1 })
    );
    basin.position.set(0, 0.02, 0);
    basin.castShadow = true;
    scene.add(basin);

    // Fountain center pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.8, 10),
      new THREE.MeshStandardMaterial({ color: '#aaaaaa', roughness: 0.6 })
    );
    pillar.position.set(0, 1.1, 0);
    pillar.castShadow = true;
    scene.add(pillar);

    // Water surface with canvas ripple texture
    const wCv = document.createElement('canvas');
    wCv.width = wCv.height = 128;
    const wCtx = wCv.getContext('2d')!;
    wCtx.fillStyle = '#1a5a7a';
    wCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 12; i++) {
      const grd = wCtx.createRadialGradient(
        Math.random() * 128, Math.random() * 128, 2,
        Math.random() * 128, Math.random() * 128, 18
      );
      grd.addColorStop(0, 'rgba(80,160,220,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      wCtx.fillStyle = grd;
      wCtx.fillRect(0, 0, 128, 128);
    }
    const waterTex = new THREE.CanvasTexture(wCv);
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(3, 3);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#1a6090', map: waterTex, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88
    });
    const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), waterMat);
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(0, 0.79, 0);
    scene.add(waterSurface);

    // Fountain night light
    const fountainLight = new THREE.PointLight('#4488cc', 0, 9, 2);
    fountainLight.position.set(0, 1.5, 0);
    scene.add(fountainLight);

    // Fountain particles
    const fountainPos = new Float32Array(FOUNTAIN_COUNT * 3);
    const fountainVel = new Float32Array(FOUNTAIN_COUNT * 3);
    for (let i = 0; i < FOUNTAIN_COUNT; i++) {
      fountainPos[i * 3]     = (Math.random() - 0.5) * 0.3;
      fountainPos[i * 3 + 1] = 0.8 + Math.random() * 0.4;
      fountainPos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      fountainVel[i * 3]     = (Math.random() - 0.5) * 0.45;
      fountainVel[i * 3 + 1] = 1.4 + Math.random() * 1.0;
      fountainVel[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
    }
    const fountainGeo = new THREE.BufferGeometry();
    fountainGeo.setAttribute('position', new THREE.BufferAttribute(fountainPos, 3));
    const fountainMat  = new THREE.PointsMaterial({ color: '#80c8ff', size: 0.09, transparent: true, opacity: 0.75 });
    const fountainPts  = new THREE.Points(fountainGeo, fountainMat);
    scene.add(fountainPts);

    // Plaza benches
    const benchMat = new THREE.MeshStandardMaterial({ color: '#7a5c1e', roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.7), benchMat);
      bench.position.set(Math.cos(a) * 9, 0.16, Math.sin(a) * 9);
      bench.rotation.y = a + Math.PI / 2;
      bench.castShadow = true;
      scene.add(bench);
    }

    // Plaza lamps
    const lampGroups: THREE.Group[] = [];
    for (let i = 0; i < 8; i++) {
      const a    = (i / 8) * Math.PI * 2;
      const lamp = makeLamp(Math.cos(a) * 13, Math.sin(a) * 13);
      scene.add(lamp);
      lampGroups.push(lamp);
    }

    // ── Districts + Buildings ──
    const collidables:  THREE.Object3D[] = [];
    const windows:      THREE.Mesh[]     = [];
    const specialMats:  THREE.MeshStandardMaterial[] = []; // Vanta LED strips, etc.
    const vantaLedMats: THREE.MeshStandardMaterial[] = specialMats;

    const distContactMap = new Map<string, Contact[]>();
    for (const d of DISTRICTS) distContactMap.set(d.id, []);
    for (const c of contacts)  distContactMap.get(assignDistrict(c))?.push(c);

    for (const dist of DISTRICTS) {
      const dcs = distContactMap.get(dist.id) ?? [];
      buildDistrictBuildings(dist, dcs.length, scene, collidables, windows, vantaLedMats);

      // District building height for sprite position
      const mainH = Math.max(4, 2 + dcs.length * 0.5);

      // District nameplate sprite
      const sprite = makeDistrictSprite(dist, dcs.length);
      sprite.position.set(dist.cx, mainH + 5, dist.cz);
      scene.add(sprite);
      nameplateMapRef.current.set(dist.id, sprite);

      // District lamps at corners
      const corners: [number, number][] = [
        [dist.cx - dist.w / 2 + 3, dist.cz - dist.d / 2 + 3],
        [dist.cx + dist.w / 2 - 3, dist.cz - dist.d / 2 + 3],
        [dist.cx - dist.w / 2 + 3, dist.cz + dist.d / 2 - 3],
        [dist.cx + dist.w / 2 - 3, dist.cz + dist.d / 2 - 3],
      ];
      for (const [lx, lz] of corners) {
        const lamp = makeLamp(lx, lz);
        scene.add(lamp);
        lampGroups.push(lamp);
      }

      // Every 3rd lamp casts shadows
      for (let i = lampGroups.length - corners.length; i < lampGroups.length; i += 3) {
        const ll = lampGroups[i].userData.lampLight as THREE.PointLight;
        if (ll) { ll.castShadow = true; ll.shadow.mapSize.set(512, 512); }
      }

      // Trees per district
      const treeRng = seededRandom('trees-' + dist.id);
      const treeCount = 4 + Math.floor(treeRng() * 3);
      for (let ti = 0; ti < treeCount; ti++) {
        const angle = treeRng() * Math.PI * 2;
        const r     = dist.w * 0.32 + treeRng() * dist.w * 0.14;
        const tx    = dist.cx + Math.cos(angle) * r;
        const tz    = dist.cz + Math.sin(angle) * r;
        if (Math.abs(tx - dist.cx) < 8 && Math.abs(tz - dist.cz) < 8) continue;
        const tree = makeTree(tx, tz, seededRandom('tree-' + dist.id + ti), dist.id);
        scene.add(tree);
      }
    }

    // ── Parked Cars ──
    const carGroups: THREE.Group[] = [];
    let carColorIdx = 0;
    const nsZ = [-100, -80, -65, -50, -30, 30, 50, 65, 80, 100];
    for (const z of nsZ) {
      if (Math.abs(z) < 20) continue;
      for (const side of [-1, 1] as const) {
        const car = makeCar(side * 6.6, z, 0, carColorIdx++ % 5);
        scene.add(car); carGroups.push(car);
      }
    }
    const ewX = [-100, -80, -65, 65, 80, 100];
    for (const x of ewX) {
      for (const side of [-1, 1] as const) {
        const car = makeCar(x, side * 6.6, Math.PI / 2, carColorIdx++ % 5);
        scene.add(car); carGroups.push(car);
      }
    }

    // ── Traffic Signals ──
    const trafficSignals: TrafficSignal[] = [];
    const signalDefs: [number, number, number][] = [
      [ 5,  5, 0],         [-5,  5, Math.PI],
      [ 5, -5, 0],         [-5, -5, Math.PI],
    ];
    signalDefs.forEach(([sx, sz, rot], i) => {
      const { group: sg, signal } = makeTrafficSignal(sx, sz, rot);
      signal.timer = i * 4.5;
      scene.add(sg);
      trafficSignals.push(signal);
    });

    // ── Initial NPC placement ──
    const npcMap = npcMeshesRef.current;
    for (const c of contacts) {
      const dist    = DISTRICTS.find(d => d.id === assignDistrict(c))!;
      const mapData = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
      const entry   = spawnNPC(c, mapData, dist, scene);
      entry.group.scale.setScalar(1);
      delete entry.group.userData.targetScale;
      npcMap.set(c.id, entry);
    }

    // ── Connection lines group ──
    const connGroup = new THREE.Group();
    scene.add(connGroup);
    connLinesRef.current = connGroup;

    // ── Rain ──
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3]     = (Math.random() - 0.5) * 200;
      rainPos[i * 3 + 1] = Math.random() * 50;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: '#aaccff', size: 0.12, transparent: true, opacity: 0 });
    scene.add(new THREE.Points(rainGeo, rainMat));

    // ── Player state ──
    const keys: Record<string, boolean> = {};
    let yaw = 0, pitch = 0, headBobT = 0, isMoving = false;

    // ── Pointer lock ──
    const onCanvasClick = () => { if (!isLockedRef.current) canvas.requestPointerLock(); };
    canvas.addEventListener('click', onCanvasClick);

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      isLockedRef.current = locked;
      setIsLocked(locked);
    };
    document.addEventListener('pointerlockchange', onLockChange);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (selectedRef.current) return;
      yaw   -= e.movementX * MOUSE_SENS;
      pitch -= e.movementY * MOUSE_SENS;
      pitch  = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, pitch));
    };
    document.addEventListener('mousemove', onMouseMove);

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
    const onKeyUp   = (e: KeyboardEvent) => { keys[e.code] = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ── Collision ──
    const collRay = new THREE.Raycaster();
    collRay.far   = PLAYER_RADIUS + 0.4;
    function blocked(pos: THREE.Vector3, dir: THREE.Vector3): boolean {
      collRay.set(new THREE.Vector3(pos.x, PLAYER_HEIGHT * 0.5, pos.z), dir.normalize());
      return collRay.intersectObjects(collidables).some(h => !h.object.userData.isBuildingEntrance);
    }


    // ── Resize ──
    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      css2d.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas);

    // ── Minimap ──
    mmCanvas.width = 180; mmCanvas.height = 180;
    const mmCtx     = mmCanvas.getContext('2d')!;
    const WORLD_SCL = 90 / 180;

    function drawMinimap() {
      mmCtx.clearRect(0, 0, 180, 180);
      mmCtx.beginPath();
      mmCtx.arc(90, 90, 88, 0, Math.PI * 2);
      mmCtx.fillStyle = 'rgba(0,0,0,0.75)';
      mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(100,180,255,0.4)';
      mmCtx.lineWidth   = 2;
      mmCtx.stroke();
      mmCtx.save();
      mmCtx.beginPath();
      mmCtx.arc(90, 90, 88, 0, Math.PI * 2);
      mmCtx.clip();
      mmCtx.strokeStyle = '#444'; mmCtx.lineWidth = 2;
      mmCtx.beginPath(); mmCtx.moveTo(90, 2);   mmCtx.lineTo(90, 178); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(2, 90);   mmCtx.lineTo(178, 90); mmCtx.stroke();
      for (const d of DISTRICTS) {
        const mx = 90 + d.cx * WORLD_SCL, mz = 90 + d.cz * WORLD_SCL;
        const rw = d.w * WORLD_SCL, rd = d.d * WORLD_SCL;
        mmCtx.fillStyle   = d.mmColor + '90';
        mmCtx.strokeStyle = d.mmColor;
        mmCtx.lineWidth   = 1;
        mmCtx.beginPath();
        mmCtx.rect(mx - rw / 2, mz - rd / 2, rw, rd);
        mmCtx.fill(); mmCtx.stroke();
      }
      const px = 90 + camera.position.x * WORLD_SCL;
      const pz = 90 + camera.position.z * WORLD_SCL;
      mmCtx.save();
      mmCtx.translate(px, pz);
      mmCtx.rotate(-yaw);
      mmCtx.fillStyle = '#ffffff';
      mmCtx.beginPath();
      mmCtx.moveTo(0, -7); mmCtx.lineTo(4, 5); mmCtx.lineTo(0, 2); mmCtx.lineTo(-4, 5);
      mmCtx.closePath(); mmCtx.fill();
      mmCtx.restore();
      mmCtx.fillStyle = 'rgba(255,255,255,0.7)';
      mmCtx.font = 'bold 10px system-ui'; mmCtx.textAlign = 'center';
      mmCtx.fillText('N', 90, 13);
      mmCtx.restore();
    }

    // ── NPC sync function ──
    syncNPCsRef.current = (newContacts: Contact[], contactData: Record<string, ContactMapData>) => {
      const map      = npcMeshesRef.current;
      const existing = new Set(map.keys());

      for (const c of newContacts) {
        const distDef = DISTRICTS.find(d => d.id === assignDistrict(c))!;
        const md      = contactData[c.id] ?? defaultContactMapData(c.id);

        if (map.has(c.id)) {
          const entry  = map.get(c.id)!;
          const nameEl = entry.labelDiv.firstElementChild as HTMLElement | null;
          if (nameEl) nameEl.textContent = c.name;
          const newStr = deriveStrength(c, md);
          if (newStr !== entry.group.userData.strength) {
            const nc = STRENGTH_BODY[newStr];
            const ne = STRENGTH_EMISSIVE[newStr];
            const ni = STRENGTH_EMIT_INT[newStr];
            entry.bodyMat.color.set(nc); entry.bodyMat.emissive.set(ne); entry.bodyMat.emissiveIntensity = ni;
            entry.headMat.color.set(nc); entry.headMat.emissive.set(ne); entry.headMat.emissiveIntensity = ni;
            entry.group.userData.strength = newStr;
          }
          existing.delete(c.id);
        } else {
          const entry = spawnNPC(c, md, distDef, scene);
          map.set(c.id, entry);
          existing.delete(c.id);
          updateNameplate(distDef, newContacts);
        }
      }
      for (const deletedId of existing) {
        const entry = map.get(deletedId);
        if (entry) entry.group.userData.targetScale = 0;
      }
    };

    function updateNameplate(dist: DistrictDef, allContacts: Contact[]) {
      const oldSprite = nameplateMapRef.current.get(dist.id);
      if (!oldSprite) return;
      const count     = allContacts.filter(c => assignDistrict(c) === dist.id).length;
      const newSprite = makeDistrictSprite(dist, count);
      newSprite.position.copy(oldSprite.position);
      scene.remove(oldSprite);
      scene.add(newSprite);
      nameplateMapRef.current.set(dist.id, newSprite);
    }

    // ── Connection lines function ──
    updateConnLinesRef.current = (selectedC: Contact | null) => {
      while (connGroup.children.length > 0) connGroup.remove(connGroup.children[0]);
      if (!selectedC) return;
      const selEntry = npcMeshesRef.current.get(selectedC.id);
      if (!selEntry) return;
      const lineMat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.45 });
      for (const [id, entry] of npcMeshesRef.current) {
        if (id === selectedC.id) continue;
        const shared = entry.contact.linkedProjects.some(p => selectedC.linkedProjects.includes(p));
        if (!shared) continue;
        const pts = [
          selEntry.group.position.clone().setY(PLAYER_HEIGHT * 0.8),
          entry.group.position.clone().setY(PLAYER_HEIGHT * 0.8),
        ];
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        connGroup.add(new THREE.Line(geo, lineMat));
      }
    };

    // ── Day/night ──
    let dayTime      = 0.35;
    let weatherTimer = (3 + Math.random() * 5) * 60;
    let fogDensity   = 0.008;
    let prevLampI    = 0;

    function updateDayNight(t: number, dt: number) {
      let sunC: THREE.Color;
      let sunI: number, ambI: number, lampI: number;
      let fogC: THREE.Color;

      // Sun elevation for Sky shader
      let sunElevation: number;
      if (t < 0.2)       sunElevation = -0.5;
      else if (t < 0.5)  sunElevation = lerpN(-0.5, 1.05, (t - 0.2) / 0.3);
      else if (t < 0.65) sunElevation = lerpN(1.05, 0.7,  (t - 0.5) / 0.15);
      else if (t < 0.8)  sunElevation = lerpN(0.7, -0.5,  (t - 0.65) / 0.15);
      else               sunElevation = -0.5;

      sunVec.setFromSphericalCoords(1, Math.PI / 2 - sunElevation, 1.5);
      skyUniforms['sunPosition'].value.copy(sunVec);

      // Compute light values for current time
      if (t < 0.2) {
        sunC = new THREE.Color('#000015'); sunI = 0; ambI = 0.07; lampI = 2.2;
        fogC = new THREE.Color('#050510');
        hemi.color.set('#0a0a2a'); hemi.groundColor.set('#0a1a0a'); hemi.intensity = 0.1;
      } else if (t < 0.3) {
        const tt = (t - 0.2) / 0.1;
        sunC = new THREE.Color('#FDB97D');
        sunI = tt * 0.9; ambI = lerpN(0.07, 0.28, tt); lampI = lerpN(2.2, 0, tt);
        fogC = lerpColor(new THREE.Color('#050510'), new THREE.Color('#ff8050'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#0a0a2a'), new THREE.Color('#ff9060'), tt));
        hemi.groundColor.set(lerpColor(new THREE.Color('#0a1a0a'), new THREE.Color('#5c3a20'), tt));
        hemi.intensity = lerpN(0.1, 0.3, tt);
      } else if (t < 0.5) {
        const tt = (t - 0.3) / 0.2;
        sunC = lerpColor(new THREE.Color('#FDB97D'), new THREE.Color('#ffffff'), tt);
        sunI = lerpN(0.9, 1.8, tt); ambI = lerpN(0.28, 0.48, tt); lampI = 0;
        fogC = lerpColor(new THREE.Color('#ff8050'), new THREE.Color('#87ceeb'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#ff9060'), new THREE.Color('#87ceeb'), tt));
        hemi.groundColor.set('#3d5a3e'); hemi.intensity = lerpN(0.3, 0.5, tt);
      } else if (t < 0.65) {
        const tt = (t - 0.5) / 0.15;
        sunC = lerpColor(new THREE.Color('#ffffff'), new THREE.Color('#ffe0b0'), tt);
        sunI = lerpN(1.8, 1.4, tt); ambI = 0.45; lampI = 0;
        fogC = lerpColor(new THREE.Color('#87ceeb'), new THREE.Color('#5bbae0'), tt);
        hemi.color.set('#87ceeb'); hemi.groundColor.set('#3d5a3e'); hemi.intensity = 0.5;
      } else if (t < 0.8) {
        const tt = (t - 0.65) / 0.15;
        sunC = lerpColor(new THREE.Color('#ffe0b0'), new THREE.Color('#FF6B35'), tt);
        sunI = lerpN(1.4, 0.2, tt); ambI = lerpN(0.45, 0.1, tt); lampI = lerpN(0, 2.2, tt);
        fogC = lerpColor(new THREE.Color('#5bbae0'), new THREE.Color('#ff4020'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#87ceeb'), new THREE.Color('#ff9060'), tt));
        hemi.groundColor.set(lerpColor(new THREE.Color('#3d5a3e'), new THREE.Color('#5c3a20'), tt));
        hemi.intensity = lerpN(0.5, 0.1, tt);
      } else {
        const tt = (t - 0.8) / 0.2;
        sunC = new THREE.Color('#000015');
        sunI = lerpN(0.2, 0, tt); ambI = lerpN(0.1, 0.07, tt); lampI = 2.2;
        fogC = lerpColor(new THREE.Color('#ff4020'), new THREE.Color('#050510'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#ff9060'), new THREE.Color('#0a0a2a'), tt));
        hemi.groundColor.set(lerpColor(new THREE.Color('#5c3a20'), new THREE.Color('#0a1a0a'), tt));
        hemi.intensity = lerpN(0.3, 0.1, tt);
      }

      (scene.fog as THREE.FogExp2).color = fogC;
      sun.color = sunC;
      sun.intensity = sunI;
      ambient.intensity = ambI;

      // Sun direction light position (matches sky shader)
      sun.position.set(sunVec.x * 120, sunVec.y * 120, sunVec.z * 120);

      // Lamps
      for (const lamp of lampGroups) {
        const lh = lamp.userData.lampHead  as THREE.Mesh;
        const ll = lamp.userData.lampLight as THREE.PointLight;
        const on = lampI > 0.5;
        if (lh?.material instanceof THREE.MeshStandardMaterial)
          lh.material.emissiveIntensity = on ? 1.0 : 0;
        if (ll) ll.intensity = lampI;
      }

      // Windows
      const winOn = lampI > 0.5;
      for (const w of windows) {
        if (w.material instanceof THREE.MeshStandardMaterial)
          w.material.emissiveIntensity = winOn ? 0.7 : 0;
      }

      // Vanta LED strips
      const ledI = lampI > 0.5 ? 0.85 : 0;
      for (const mat of vantaLedMats) mat.emissiveIntensity = ledI;

      // Car lights
      const carOn = lampI > 0.5;
      for (const car of carGroups) {
        const hlMat = car.userData.hlMat as THREE.MeshStandardMaterial | undefined;
        const tlMat = car.userData.tlMat as THREE.MeshStandardMaterial | undefined;
        if (hlMat) hlMat.emissiveIntensity = carOn ? 0.9 : 0;
        if (tlMat) tlMat.emissiveIntensity = carOn ? 0.8 : 0;
      }

      // Fountain night light
      fountainLight.intensity = lampI > 0.5 ? 1.3 : 0;

      // Stars
      starMat.opacity = lerpN(starMat.opacity, lampI > 1.0 ? 0.88 : 0, dt * 0.8);

      // Fog density
      const fogTarget = isRainingRef.current ? 0.016
        : lampI > 1.5 ? 0.010
        : lampI > 0.3 ? 0.006
        : 0.003;
      fogDensity = lerpN(fogDensity, fogTarget, dt * 0.5);
      (scene.fog as THREE.FogExp2).density = fogDensity;

      // NPC emissive boost at night
      nightLevelRef.current = lampI;
      if (Math.abs(lampI - prevLampI) > 0.1) {
        prevLampI = lampI;
        for (const [, entry] of npcMeshesRef.current) {
          const str  = entry.group.userData.strength as RelationshipStrength;
          const base  = STRENGTH_EMIT_INT[str];
          const boost = lampI > 0.5 ? base * 2 : base;
          entry.bodyMat.emissiveIntensity = boost;
          entry.headMat.emissiveIntensity = boost;
        }
      }
    }

    // ── Animation loop ──
    let rafId    = 0;
    let lastTime = performance.now();

    // Traffic signal state durations (seconds)
    const SIGNAL_PHASES = [8, 2, 8]; // green, yellow, red

    function animate() {
      rafId = requestAnimationFrame(animate);
      const now   = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime    = now;

      // Day/night
      dayTime = (dayTime + delta / DAY_CYCLE) % 1;
      updateDayNight(dayTime, delta);

      // Weather
      weatherTimer -= delta;
      if (weatherTimer <= 0) {
        const next = !isRainingRef.current;
        setIsRaining(next); isRainingRef.current = next;
        weatherTimer = (3 + Math.random() * 5) * 60;
      }

      // Rain
      const tgtOp = isRainingRef.current ? 0.55 : 0;
      rainMat.opacity = lerpN(rainMat.opacity, tgtOp, delta * 2);
      if (rainMat.opacity > 0.01) {
        const buf = rainGeo.attributes.position as THREE.BufferAttribute;
        const arr = buf.array as Float32Array;
        for (let i = 0; i < RAIN_COUNT; i++) {
          arr[i * 3 + 1] -= delta * 26;
          arr[i * 3]     += delta * 3;
          if (arr[i * 3 + 1] < 0) {
            arr[i * 3 + 1] = 50;
            arr[i * 3]     = camera.position.x + (Math.random() - 0.5) * 200;
            arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 200;
          }
        }
        buf.needsUpdate = true;
      }

      // Fountain particles
      const fb = fountainGeo.attributes.position as THREE.BufferAttribute;
      const fa = fb.array as Float32Array;
      for (let i = 0; i < FOUNTAIN_COUNT; i++) {
        fa[i * 3]     += fountainVel[i * 3]     * delta;
        fa[i * 3 + 1] += fountainVel[i * 3 + 1] * delta;
        fa[i * 3 + 2] += fountainVel[i * 3 + 2] * delta;
        fountainVel[i * 3 + 1] -= 3.5 * delta; // gravity
        if (fa[i * 3 + 1] < 0.76) {
          fa[i * 3]     = (Math.random() - 0.5) * 0.3;
          fa[i * 3 + 1] = 0.8 + Math.random() * 0.35;
          fa[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
          fountainVel[i * 3]     = (Math.random() - 0.5) * 0.45;
          fountainVel[i * 3 + 1] = 1.4 + Math.random() * 1.0;
          fountainVel[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
        }
      }
      fb.needsUpdate = true;

      // Water UV scroll
      waterTex.offset.x += delta * 0.04;
      waterTex.offset.y += delta * 0.015;

      // Traffic signals
      for (const sig of trafficSignals) {
        sig.timer += delta;
        if (sig.timer >= SIGNAL_PHASES[sig.state]) {
          sig.timer = 0;
          sig.state = ((sig.state + 1) % 3) as 0 | 1 | 2;
          sig.greenMat.emissiveIntensity  = sig.state === 0 ? 1.0 : 0.05;
          sig.yellowMat.emissiveIntensity = sig.state === 1 ? 1.0 : 0.05;
          sig.redMat.emissiveIntensity    = sig.state === 2 ? 1.0 : 0.05;
          const sigColors = ['#00cc33', '#ccaa00', '#cc1111'];
          sig.light.color.set(sigColors[sig.state]);
        }
      }

      // Player movement
      if (isLockedRef.current) {
        const spd  = (keys['ShiftLeft'] || keys['ShiftRight']) ? PLAYER_SPEED * PLAYER_RUN : PLAYER_SPEED;
        const mv   = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp'])    mv.z -= 1;
        if (keys['KeyS'] || keys['ArrowDown'])  mv.z += 1;
        if (keys['KeyA'] || keys['ArrowLeft'])  mv.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mv.x += 1;
        isMoving = mv.lengthSq() > 0;
        if (isMoving) {
          mv.normalize().applyEuler(new THREE.Euler(0, yaw, 0));
          const mxDir = new THREE.Vector3(Math.sign(mv.x), 0, 0);
          const mzDir = new THREE.Vector3(0, 0, Math.sign(mv.z));
          if (Math.abs(mv.x) > 0.01 && !blocked(camera.position, mxDir))
            camera.position.x += mv.x * spd * delta;
          if (Math.abs(mv.z) > 0.01 && !blocked(camera.position, mzDir))
            camera.position.z += mv.z * spd * delta;
          camera.position.x = Math.max(-180, Math.min(180, camera.position.x));
          camera.position.z = Math.max(-180, Math.min(180, camera.position.z));
        }
      } else { isMoving = false; }

      camera.rotation.order = 'YXZ';
      camera.rotation.y     = yaw;
      camera.rotation.x     = pitch;

      if (isMoving && isLockedRef.current) {
        headBobT += delta * HEAD_BOB_SPEED;
        camera.position.y = PLAYER_HEIGHT + Math.sin(headBobT) * HEAD_BOB_AMP;
      } else {
        camera.position.y = lerpN(camera.position.y, PLAYER_HEIGHT, delta * 8);
      }

      // NPC loop
      let closestDist    = Infinity;
      let closestContact: Contact | null = null;
      const q     = searchRef.current.toLowerCase();
      const dFilt = districtFilterRef.current;
      const filt  = filteredRef.current;

      for (const [, entry] of npcMeshesRef.current) {
        const g = entry.group;

        // Scale tween
        if (g.userData.targetScale !== undefined) {
          const cur = g.scale.x;
          const tgt = g.userData.targetScale as number;
          if (Math.abs(cur - tgt) > 0.005) {
            g.scale.setScalar(lerpN(cur, tgt, delta * 8));
          } else {
            g.scale.setScalar(tgt);
            if (tgt === 0) {
              scene.remove(g);
              npcMeshesRef.current.delete(entry.contact.id);
            }
            delete g.userData.targetScale;
          }
          continue;
        }

        // Idle bob
        const bobOff = g.userData.bobOffset as number;
        const bobY   = Math.sin(now * 0.0009 + bobOff) * 0.07;
        g.children.forEach((ch, idx) => {
          if (idx < 2 && ch instanceof THREE.Mesh) {
            ch.position.y = (idx === 0 ? 0.7 : 1.65) + bobY;
          }
        });

        // Orbiting follow-up sphere
        const orb = g.children.find(ch => ch.userData.isOrb) as THREE.Mesh | undefined;
        if (orb) {
          const orbAngle = now * 0.002 + bobOff;
          orb.position.set(Math.cos(orbAngle) * 0.55, 1.8, Math.sin(orbAngle) * 0.55);
        }

        // Pulse rings
        g.children.forEach(ch => {
          if (ch.userData.pulse && ch instanceof THREE.Mesh) {
            const pulsed = 0.85 + Math.sin(now * 0.004 + bobOff) * 0.15;
            ch.scale.set(pulsed, 1, pulsed);
            if (ch.material instanceof THREE.MeshStandardMaterial)
              ch.material.emissiveIntensity = 0.5 + Math.sin(now * 0.004) * 0.3;
          }
        });

        // Billboard
        const dx   = camera.position.x - g.position.x;
        const dz   = camera.position.z - g.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < NPC_LOOK_DIST) g.rotation.y = Math.atan2(dx, dz);

        // Label fade + night glow
        const fade = Math.max(0, Math.min(1, 1 - (dist - 8) / (NPC_FADE_DIST - 8)));
        entry.labelDiv.style.opacity = String(fade);
        if (nightLevelRef.current > 0.5) {
          const str  = entry.group.userData.strength as RelationshipStrength;
          entry.labelDiv.style.textShadow = `0 0 6px ${STRENGTH_BODY[str]}`;
        } else {
          entry.labelDiv.style.textShadow = '';
        }

        // Visibility from filters
        const nm  = !q || entry.contact.name.toLowerCase().includes(q) ||
                    (entry.contact.company ?? '').toLowerCase().includes(q);
        const dm  = dFilt === 'all' || entry.districtId === dFilt;
        const fin = filt.has(entry.contact.id);
        g.visible = nm && dm;

        // Search highlight ring
        const hasRing   = !!g.userData.highlightRing;
        const wantsRing = nm && dm && q.length > 0;
        if (wantsRing && !hasRing) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.06, 8, 16),
            new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.8 })
          );
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
          g.add(ring); g.userData.highlightRing = ring;
        } else if (!wantsRing && hasRing) {
          g.remove(g.userData.highlightRing);
          delete g.userData.highlightRing;
        }

        // Dim body/head
        const opaque   = fin && g.visible;
        const targetOp = opaque ? 1 : 0.15;
        if (Math.abs(entry.bodyMat.opacity - targetOp) > 0.02) {
          entry.bodyMat.opacity     = lerpN(entry.bodyMat.opacity, targetOp, delta * 5);
          entry.headMat.opacity     = entry.bodyMat.opacity;
          entry.bodyMat.transparent = targetOp < 1;
          entry.headMat.transparent = targetOp < 1;
        }

        // Proximity for interaction
        if (g.visible && dist < NPC_INTERACT && dist < closestDist) {
          closestDist    = dist;
          closestContact = entry.contact;
        }
      }

      nearbyRef.current = closestContact;
      setNearbyContact(closestContact);

      // Render via EffectComposer (bloom, vignette, noise)
      composer.render(delta);
      css2d.render(scene, camera);
      drawMinimap();
    }

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      composer.dispose();
      resizeObs.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      if (css2d.domElement.parentNode) css2d.domElement.parentNode.removeChild(css2d.domElement);
      syncNPCsRef.current        = null;
      updateConnLinesRef.current = null;
      updateQualityRef.current   = null;
      sceneRef.current           = null;
      npcMeshesRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  const selectedMapData = selectedContact
    ? (mapState.contactData[selectedContact.id] ?? defaultContactMapData(selectedContact.id))
    : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={labelRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Click-to-explore overlay */}
      {!isLocked && !selectedContact && (
        <div
          onClick={() => canvasRef.current?.requestPointerLock()}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', cursor: 'pointer',
          }}
        >
          <div style={{
            background: 'rgba(10,15,30,0.92)', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 14, padding: '22px 40px', color: '#e2e8f0', textAlign: 'center',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏙️</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Click to Explore</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
              <b style={{ color: '#e2e8f0' }}>WASD</b> move &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Mouse</b> look &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Shift</b> run<br />
              <b style={{ color: '#e2e8f0' }}>E</b> talk to contacts &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Esc</b> exit
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 12, justifyContent: 'center', fontSize: 11 }}>
              {[['hot','#FFD700','Hot'], ['warm','#4A90D9','Warm'], ['cold','#888','Cold'], ['personal','#9B59B6','Personal']].map(([, color, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Crosshair */}
      {isLocked && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 18, height: 2, background: 'rgba(255,255,255,0.7)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
          <div style={{ position: 'absolute', width: 2, height: 18, background: 'rgba(255,255,255,0.7)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
        </div>
      )}

      {/* Interaction prompt */}
      {isLocked && nearbyContact && !selectedContact && (
        <div style={{
          position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8, padding: '6px 18px', color: '#e2e8f0', fontSize: 13,
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>[E]</span> Talk to {nearbyContact.name}
        </div>
      )}

      {/* Top search/filter bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 12px',
        background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 240,
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8, padding: '4px 10px',
        }}>
          <Search size={13} color="#64b5f6" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12, width: '100%' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
              <X size={11} />
            </button>
          )}
        </div>

        <select
          value={districtFilter}
          onChange={e => setDistrictFilter(e.target.value)}
          style={{
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 8, color: '#e2e8f0', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
          }}
        >
          <option value="all" style={{ background: '#0f172a' }}>All Districts</option>
          {DISTRICTS.map(d => (
            <option key={d.id} value={d.id} style={{ background: '#0f172a' }}>{d.name}</option>
          ))}
        </select>

        {(search || districtFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDistrictFilter('all'); }}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8, color: '#94a3b8', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
            }}
          >Reset</button>
        )}

        <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {shownCount} of {contacts.length}
        </span>

        <button
          onClick={() => setIsRaining(r => { isRainingRef.current = !r; return !r; })}
          title={isRaining ? 'Clear weather' : 'Make it rain'}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 14,
          }}
        >
          {isRaining ? '🌧' : '☀️'}
        </button>
      </div>

      {/* Minimap */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, borderRadius: '50%', overflow: 'hidden',
        boxShadow: '0 0 0 2px rgba(100,180,255,0.35)', zIndex: 10,
      }}>
        <canvas ref={minimapRef} width={180} height={180} style={{ display: 'block' }} />
      </div>

      {/* Contact detail panel */}
      {selectedContact && selectedMapData && (
        <div style={{
          position: 'absolute', top: 50, right: 16, width: 320,
          maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
          zIndex: 20, animation: 'slideInRight 0.22s ease-out',
        }}>
          <style>{`@keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }`}</style>
          <ContactMapPopup
            contact={selectedContact}
            mapData={selectedMapData}
            onClose={() => { setSelectedContact(null); selectedRef.current = null; }}
            onUpdateMapData={(data) => onUpdateMapData(selectedContact.id, data)}
            onUpdateContact={(updated) => {
              onUpdateContact(updated);
              setSelectedContact(updated);
              selectedRef.current = updated;
            }}
            onEditInCRM={() => {
              setSelectedContact(null);
              selectedRef.current = null;
              onNavigateToCRM();
            }}
            orgs={mapState.orgs ?? []}
            onUpdateOrgs={onUpdateOrgs}
          />
        </div>
      )}

      {/* Legend + quality toggle (bottom-right) */}
      {isLocked && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 5,
          background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '8px 12px', zIndex: 10, backdropFilter: 'blur(8px)',
        }}>
          {([['hot','#FFD700','Hot — ≤7 days'], ['warm','#4A90D9','Warm — ≤30 days'], ['cold','#888888','Cold'], ['personal','#9B59B6','Personal']] as [string, string, string][]).map(([, color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 2, paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #ef4444', flexShrink: 0 }} />
              Overdue (30+ days)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
              Follow-up pending
            </div>
          </div>
          {/* Quality toggle */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 2, paddingTop: 6 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Quality</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['low', 'medium', 'high'] as const).map(q => (
                <button
                  key={q}
                  onClick={() => { setQuality(q); updateQualityRef.current?.(q); }}
                  style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                    background: quality === q ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.07)',
                    border: quality === q ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.14)',
                    color: quality === q ? '#e0e7ff' : '#94a3b8',
                  }}
                >
                  {q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
