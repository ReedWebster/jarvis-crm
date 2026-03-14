/**
 * NetworkView3D — Phase 4 City: White/Ice-Blue Architectural Aesthetic + Contact Sorting.
 * Same layout, districts, and interactions as Phase 3.
 * New: Custom gradient sky, white/ice-blue palette, building registry, NPC-building binding.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from 'postprocessing';
import { Search, X } from 'lucide-react';
import type {
  Contact,
  Project,
  ContactMapData,
  NetworkingMapState,
  NetworkManualConnection,
  NetworkOrg,
  RelationshipStrength,
  CityBuilding,
  CityBuildingArchetype,
} from '../../types';
import { defaultContactMapData, isFollowUpPending } from '../../utils/networkingMap';
import { ContactMapPopup } from './ContactMapPopup';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// ─── ISOMETRIC CAMERA DEFAULTS ────────────────────────────────────────────────
const ISO_RADIUS_DEFAULT = 180;
const ISO_RADIUS_MIN     = 50;
const ISO_RADIUS_MAX     = 380;
const ISO_PHI            = 1.08;   // ~62° from zenith — matches reference image
const NPC_LOOK_DIST      = 80;     // NPCs turn to face camera (large for iso view)
const NPC_FADE_DIST      = 120;    // NPC label fade distance

// ─── SOLAR / WEATHER ──────────────────────────────────────────────────────────
const RAIN_TOGGLE_INTERVAL = 300; // seconds between weather changes
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
  w: number; d: number;
  mmColor: string;
}

const DISTRICTS: DistrictDef[] = [
  // Core districts (original 6, repositioned for larger world)
  { id: 'byu',          name: 'BYU District',     cx:   0, cz: -90,  w: 80,  d: 70,  mmColor: '#9B9EC8' },
  { id: 'vanta',        name: 'Vanta HQ',          cx:  95, cz:   0,  w: 80,  d: 70,  mmColor: '#7B9EC8' },
  { id: 'rockcanyonai', name: 'Rock Canyon AI',    cx:  75, cz:  95,  w: 80,  d: 70,  mmColor: '#9BBCD8' },
  { id: 'neighborhood', name: 'Neighborhood',      cx: -95, cz:   0,  w: 80,  d: 70,  mmColor: '#B8C8D8' },
  { id: 'chapel',       name: 'Chapel District',   cx: -75, cz: -80,  w: 70,  d: 60,  mmColor: '#C8D8E8' },
  { id: 'outskirts',    name: 'Outskirts',          cx:   0, cz:  95,  w: 90,  d: 70,  mmColor: '#A8B8C8' },
  // New districts filling the expanded world
  { id: 'financial',    name: 'Financial District', cx:  40, cz: -190, w: 80,  d: 60,  mmColor: '#8AB0C8' },
  { id: 'port',         name: 'Harbor & Port',      cx: -40, cz: -270, w: 100, d: 60,  mmColor: '#7098B8' },
  { id: 'arts',         name: 'Arts District',      cx: -95, cz:  95,  w: 80,  d: 70,  mmColor: '#B8A8C8' },
  { id: 'techcampus',   name: 'Tech Campus',        cx:  95, cz: -90,  w: 80,  d: 70,  mmColor: '#88B8C8' },
  { id: 'suburbs',      name: 'Suburbs',            cx: -200, cz: 50,  w: 100, d: 80,  mmColor: '#C8D8C8' },
  { id: 'midtown',      name: 'Midtown',            cx:   0, cz:   0,  w: 60,  d: 60,  mmColor: '#D0D8E8' },
];

function assignDistrict(c: Contact): string {
  const co   = (c.company      ?? '').toLowerCase();
  const rel  = (c.relationship ?? '').toLowerCase();
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
  if (co.includes('finance') || co.includes('bank') || co.includes('invest') || tags.includes('Investor'))
    return 'financial';
  if (co.includes('port') || co.includes('ship') || co.includes('logistics') || co.includes('warehouse'))
    return 'port';
  if (co.includes('art') || co.includes('design') || co.includes('creative') || tags.includes('Creative'))
    return 'arts';
  if (co.includes('startup') || co.includes('venture') || rel.includes('mentor') || tags.includes('Mentor'))
    return 'techcampus';
  if (rel.includes('neighbor') || tags.includes('Neighbor') || tags.includes('Local'))
    return 'suburbs';
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
  buildings?:              CityBuilding[];
  onBuildingsReady?:       (buildings: CityBuilding[]) => void;
  onUpdateBuildings?:      (buildings: CityBuilding[]) => void;
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
  const poleMat = new THREE.MeshStandardMaterial({ color: '#8899AA', metalness: 0.7, roughness: 0.3 });
  const pole = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), poleMat);
  pole.castShadow = true;
  g.add(pole);

  // Horizontal arm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.07, 0.07),
    new THREE.MeshStandardMaterial({ color: '#8899AA', metalness: 0.7, roughness: 0.3 })
  );
  arm.position.set(0.42, 3.88, 0);
  g.add(arm);

  // Globe
  const headMat = new THREE.MeshStandardMaterial({
    color: '#E8F0FF', emissive: '#C8DCFF', emissiveIntensity: 0
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
    new THREE.MeshStandardMaterial({ color: '#B8C8D8', roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const colors = ['#D0DDE8', '#C8D8E8', '#D8E4EE'];
  void distId; // district no longer affects tree color in white aesthetic

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

const CAR_COLORS = ['#E8EEF4', '#D8E4EE', '#E0E8F0', '#D0DCE8', '#EAF0F6'];

function makeCar(x: number, z: number, rotY: number, colorIdx: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: CAR_COLORS[colorIdx % 5], metalness: 0.5, roughness: 0.35
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 1.1), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.52, 0.95),
    new THREE.MeshStandardMaterial({ color: '#C8D8EC', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 })
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

// ─── BUILDING ARCHETYPES (Phase 4) ────────────────────────────────────────────

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

/** Place n windows across a facade row. cx/cz = face center in group-local space. */
function addWindowRow(
  g: THREE.Group, y: number, facadeW: number, n: number,
  cx: number, faceZ: number, winMat: THREE.MeshStandardMaterial,
) {
  const step = facadeW / (n + 1);
  for (let i = 1; i <= n; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), winMat.clone());
    win.position.set(cx + (i - (n + 1) / 2) * step, y, faceZ + 0.02);
    g.add(win);
  }
}

function createTower(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 7, d = 7;
  const base = archBox(w + 2, 0.8, d + 2, mats.trim.clone());
  base.position.set(0, 0.4, 0);
  g.add(base);
  const shaft = archBox(w, h, d, mats.main.clone());
  shaft.position.set(0, 0.8 + h / 2, 0);
  g.add(shaft); collidables.push(shaft);
  let topY = 0.8 + h;
  if (h > 8) {
    const s1H = h * 0.3;
    const s1 = archBox(w - 2, s1H, d - 2, mats.main.clone());
    s1.position.set(0, topY + s1H / 2, 0); g.add(s1); topY += s1H;
    const s2H = s1H * 0.6;
    const s2 = archBox(w - 4, s2H, d - 4, mats.main.clone());
    s2.position.set(0, topY + s2H / 2, 0); g.add(s2); topY += s2H;
  }
  const trim = archBox(w + 0.4, 0.3, d + 0.4, mats.trim.clone());
  trim.position.set(0, 0.8 + h + 0.15, 0); g.add(trim);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), mats.trim.clone());
  ant.castShadow = true; ant.position.set(0, topY + 1.1, 0); g.add(ant);
  const rows = Math.floor(h / 1.6);
  for (let r = 0; r < rows; r++) addWindowRow(g, 0.8 + 1.0 + r * 1.6, w, 3, 0, d / 2, mats.glass);
  return { group: g, height: topY };
}

function createMidrise(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(4, Math.min(h, 9));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 10, d = 9;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body); collidables.push(body);
  const trim = archBox(w + 0.3, 0.35, d + 0.3, mats.trim.clone());
  trim.position.set(0, h + 0.175, 0); g.add(trim);
  const ac = archBox(2.5, 0.6, 1.8, mats.alt.clone());
  ac.position.set(-2, h + 0.6, 1); g.add(ac);
  const rows = Math.floor(h / 1.7);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.7, w, 4, 0, d / 2, mats.glass);
  return { group: g, height: h };
}

function createSlab(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(3, Math.min(h, 6));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 16, d = 7;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body); collidables.push(body);
  const edge = archBox(w + 0.3, 0.25, d + 0.3, mats.trim.clone());
  edge.position.set(0, h + 0.125, 0); g.add(edge);
  const bandRows = Math.floor(h / 2);
  for (let r = 0; r < bandRows; r++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 0.9), mats.glass.clone());
    band.position.set(0, 1.2 + r * 2, d / 2 + 0.02); g.add(band);
  }
  return { group: g, height: h };
}

function createResidential(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(3, Math.min(h, 6));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 8, d = 8;
  const body = archBox(w, h, d, mats.alt.clone());
  body.position.set(0, h / 2, 0); g.add(body); collidables.push(body);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#C8D4DE', roughness: 0.85 });
  const lSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, d / 2 + 0.5), roofMat);
  lSlope.position.set(0, h + 1.4, -d / 4 + 0.2); lSlope.rotation.x = -0.36;
  lSlope.castShadow = true; g.add(lSlope);
  const rSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.22, d / 2 + 0.5), roofMat.clone());
  rSlope.position.set(0, h + 1.4, d / 4 - 0.2); rSlope.rotation.x = 0.36;
  rSlope.castShadow = true; g.add(rSlope);
  const rows = Math.floor(h / 1.8);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.8, w, 2, 0, d / 2, mats.glass);
  return { group: g, height: h + 2 };
}

function createWarehouse(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(3, Math.min(h, 5));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 18, d = 12;
  const body = archBox(w, h, d, mats.alt.clone());
  body.position.set(0, h / 2, 0); g.add(body); collidables.push(body);
  const vaultMat = new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.85 });
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 16, 1, false, 0, Math.PI), vaultMat);
  vault.rotation.z = Math.PI / 2; vault.position.set(0, h + d * 0.25, 0);
  vault.castShadow = true; g.add(vault);
  for (let wy = 0.6; wy < h - 0.2; wy += 1.2) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.1, 0.05), mats.trim.clone());
    rib.position.set(0, wy, d / 2 + 0.03); g.add(rib);
  }
  return { group: g, height: h + d * 0.5 };
}

function createCampus(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(4, Math.min(h, 8));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const vols = [
    { ox: 0,   oz: 0,  w: 10, d: 9, fh: h },
    { ox: -8,  oz: -3, w: 6,  d: 7, fh: h * 0.65 },
    { ox:  8,  oz:  3, w: 6,  d: 7, fh: h * 0.80 },
  ];
  for (const v of vols) {
    const b = archBox(v.w, v.fh, v.d, mats.main.clone());
    b.position.set(v.ox, v.fh / 2, v.oz); g.add(b);
    if (v.ox === 0) collidables.push(b);
    const trim = archBox(v.w + 0.2, 0.25, v.d + 0.2, mats.trim.clone());
    trim.position.set(v.ox, v.fh + 0.125, v.oz); g.add(trim);
    const rows = Math.floor(v.fh / 1.7);
    for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.7, v.w, 3, v.ox, v.oz + v.d / 2, mats.glass);
  }
  return { group: g, height: h };
}

function createSpire(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(5, Math.min(h, 10));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const w = 7, d = 7;
  const body = archBox(w, h, d, mats.main.clone());
  body.position.set(0, h / 2, 0); g.add(body); collidables.push(body);
  const towerH = 5;
  const tower = archBox(3.5, towerH, 3.5, mats.main.clone());
  tower.position.set(0, h + towerH / 2, 0); g.add(tower);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 3, 8), mats.trim.clone());
  cyl.position.set(0, h + towerH + 1.5, 0); cyl.castShadow = true; g.add(cyl);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 8), new THREE.MeshStandardMaterial({ color: '#C8D8EC', roughness: 0.5 }));
  cone.position.set(0, h + towerH + 3 + 2, 0); cone.castShadow = true; g.add(cone);
  const rows = Math.floor(h / 1.8);
  for (let r = 0; r < rows; r++) addWindowRow(g, 1.0 + r * 1.8, w, 2, 0, d / 2, mats.glass);
  return { group: g, height: h + towerH + 5 };
}

function createPodiumTower(x: number, z: number, h: number, mats: ArchMats, collidables: THREE.Object3D[]): { group: THREE.Group; height: number } {
  h = Math.max(6, Math.min(h, 16));
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const podH = 3;
  const pod = archBox(14, podH, 12, mats.trim.clone());
  pod.position.set(0, podH / 2, 0); g.add(pod); collidables.push(pod);
  const towerH = h;
  const tower = archBox(8, towerH, 7, mats.main.clone());
  tower.position.set(0, podH + towerH / 2, 0); g.add(tower); collidables.push(tower);
  const setH = towerH * 0.25;
  const setback = archBox(5.5, setH, 4.5, mats.main.clone());
  setback.position.set(0, podH + towerH + setH / 2, 0); g.add(setback);
  const topTrim = archBox(8.4, 0.3, 7.4, mats.trim.clone());
  topTrim.position.set(0, podH + towerH + 0.15, 0); g.add(topTrim);
  for (const [ex, ez] of [[3.8, 3.3], [-3.8, 3.3], [3.8, -3.3], [-3.8, -3.3]] as [number, number][]) {
    const strip = archBox(0.12, towerH, 0.12, mats.trim.clone());
    strip.position.set(ex, podH + towerH / 2, ez); g.add(strip);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3, 6), mats.trim.clone());
  ant.castShadow = true; ant.position.set(0, podH + towerH + setH + 1.5, 0); g.add(ant);
  const rows = Math.floor(towerH / 1.6);
  for (let r = 0; r < rows; r++) addWindowRow(g, podH + 1.0 + r * 1.6, 8, 3, 0, 3.5, mats.glass);
  return { group: g, height: podH + towerH + setH };
}

function buildArchetype(
  archetype: CityBuildingArchetype,
  x: number, z: number, contactCount: number,
  mats: ArchMats, collidables: THREE.Object3D[],
): { group: THREE.Group; height: number } {
  const h = Math.max(4, 3 + contactCount * 0.6);
  switch (archetype) {
    case 'tower':       return createTower(x, z, Math.min(h, 18), mats, collidables);
    case 'midrise':     return createMidrise(x, z, h, mats, collidables);
    case 'slab':        return createSlab(x, z, h, mats, collidables);
    case 'residential': return createResidential(x, z, h, mats, collidables);
    case 'warehouse':   return createWarehouse(x, z, h, mats, collidables);
    case 'campus':      return createCampus(x, z, h, mats, collidables);
    case 'spire':       return createSpire(x, z, Math.min(h, 10), mats, collidables);
    case 'podiumTower': return createPodiumTower(x, z, Math.min(h, 16), mats, collidables);
  }
}

const BUILDING_DEFS: Record<string, Array<{ id: string; offsetX: number; offsetZ: number; archetype: CityBuildingArchetype; name: string }>> = {
  byu: [
    { id: 'byu-0',  offsetX:   0, offsetZ:   0,  archetype: 'campus',      name: 'BYU Main' },
    { id: 'byu-1',  offsetX: -18, offsetZ:  -3,  archetype: 'midrise',     name: 'Richards Hall' },
    { id: 'byu-2',  offsetX:  18, offsetZ:  -3,  archetype: 'midrise',     name: 'Tanner Building' },
    { id: 'byu-3',  offsetX:   5, offsetZ: -18,  archetype: 'spire',       name: 'Bell Tower' },
    { id: 'byu-4',  offsetX:  -7, offsetZ:  18,  archetype: 'midrise',     name: 'Kimball Tower' },
    { id: 'byu-5',  offsetX:   8, offsetZ:  18,  archetype: 'residential', name: 'Heritage Halls' },
    { id: 'byu-6',  offsetX: -18, offsetZ: -18,  archetype: 'midrise',     name: 'JFSB' },
    { id: 'byu-7',  offsetX:  18, offsetZ: -18,  archetype: 'midrise',     name: 'Maeser Building' },
    { id: 'byu-8',  offsetX: -30, offsetZ:   0,  archetype: 'campus',      name: 'Engineering' },
    { id: 'byu-9',  offsetX:  30, offsetZ:   0,  archetype: 'midrise',     name: 'Business Center' },
    { id: 'byu-10', offsetX:   0, offsetZ:  28,  archetype: 'residential', name: 'Dorms A' },
    { id: 'byu-11', offsetX: -16, offsetZ:  28,  archetype: 'residential', name: 'Dorms B' },
    { id: 'byu-12', offsetX:  16, offsetZ:  28,  archetype: 'residential', name: 'Dorms C' },
    { id: 'byu-13', offsetX: -30, offsetZ: -18,  archetype: 'midrise',     name: 'Library' },
    { id: 'byu-14', offsetX:  30, offsetZ: -18,  archetype: 'midrise',     name: 'Science Hall' },
  ],
  vanta: [
    { id: 'vanta-0',  offsetX:   0, offsetZ:   0,  archetype: 'podiumTower', name: 'Vanta HQ' },
    { id: 'vanta-1',  offsetX: -18, offsetZ:  -5,  archetype: 'tower',       name: 'North Tower' },
    { id: 'vanta-2',  offsetX:  18, offsetZ:   5,  archetype: 'tower',       name: 'East Tower' },
    { id: 'vanta-3',  offsetX:   0, offsetZ: -18,  archetype: 'midrise',     name: 'Annex' },
    { id: 'vanta-4',  offsetX: -18, offsetZ:  18,  archetype: 'slab',        name: 'Operations Center' },
    { id: 'vanta-5',  offsetX:  18, offsetZ: -18,  archetype: 'midrise',     name: 'Partner Hub' },
    { id: 'vanta-6',  offsetX:  18, offsetZ:  18,  archetype: 'midrise',     name: 'Investor Suite' },
    { id: 'vanta-7',  offsetX: -32, offsetZ:   0,  archetype: 'tower',       name: 'West Tower' },
    { id: 'vanta-8',  offsetX:  32, offsetZ:   0,  archetype: 'midrise',     name: 'Client Center' },
    { id: 'vanta-9',  offsetX:   0, offsetZ:  28,  archetype: 'slab',        name: 'Conference Block' },
    { id: 'vanta-10', offsetX: -32, offsetZ: -18,  archetype: 'midrise',     name: 'Sales Floor' },
    { id: 'vanta-11', offsetX:  32, offsetZ: -18,  archetype: 'tower',       name: 'Finance Tower' },
    { id: 'vanta-12', offsetX: -18, offsetZ: -28,  archetype: 'midrise',     name: 'HR Building' },
    { id: 'vanta-13', offsetX:  18, offsetZ: -28,  archetype: 'midrise',     name: 'Legal Suite' },
  ],
  rockcanyonai: [
    { id: 'rcai-0',  offsetX:   0, offsetZ:   0,  archetype: 'slab',    name: 'Tech Campus' },
    { id: 'rcai-1',  offsetX: -18, offsetZ:  -5,  archetype: 'midrise', name: 'Innovation Hall' },
    { id: 'rcai-2',  offsetX:  18, offsetZ:  -5,  archetype: 'campus',  name: 'Research Lab' },
    { id: 'rcai-3',  offsetX:   0, offsetZ: -18,  archetype: 'tower',   name: 'AI Tower' },
    { id: 'rcai-4',  offsetX: -18, offsetZ:  16,  archetype: 'midrise', name: 'Dev Studio' },
    { id: 'rcai-5',  offsetX:  18, offsetZ:  16,  archetype: 'midrise', name: 'Data Center' },
    { id: 'rcai-6',  offsetX: -18, offsetZ: -18,  archetype: 'midrise', name: 'Robotics Lab' },
    { id: 'rcai-7',  offsetX:  32, offsetZ:   0,  archetype: 'tower',   name: 'Cloud Tower' },
    { id: 'rcai-8',  offsetX: -32, offsetZ:   0,  archetype: 'slab',    name: 'Server Farm' },
    { id: 'rcai-9',  offsetX:   0, offsetZ:  28,  archetype: 'campus',  name: 'AI Park' },
    { id: 'rcai-10', offsetX:  18, offsetZ: -28,  archetype: 'midrise', name: 'GPU Lab' },
    { id: 'rcai-11', offsetX: -18, offsetZ: -28,  archetype: 'midrise', name: 'ML Center' },
    { id: 'rcai-12', offsetX:  32, offsetZ:  16,  archetype: 'midrise', name: 'Incubator' },
    { id: 'rcai-13', offsetX: -32, offsetZ:  16,  archetype: 'midrise', name: 'Accelerator' },
  ],
  neighborhood: [
    { id: 'nb-0',  offsetX:   0, offsetZ: -14,  archetype: 'residential', name: 'Oak House' },
    { id: 'nb-1',  offsetX: -14, offsetZ: -14,  archetype: 'residential', name: 'Maple Cottage' },
    { id: 'nb-2',  offsetX:  14, offsetZ: -14,  archetype: 'residential', name: 'Cedar Home' },
    { id: 'nb-3',  offsetX:   0, offsetZ:   2,  archetype: 'midrise',     name: 'Park Lofts' },
    { id: 'nb-4',  offsetX: -14, offsetZ:  14,  archetype: 'residential', name: 'Birch House' },
    { id: 'nb-5',  offsetX:  14, offsetZ:  14,  archetype: 'residential', name: 'Elm Place' },
    { id: 'nb-6',  offsetX: -14, offsetZ:   2,  archetype: 'residential', name: 'Aspen Flat' },
    { id: 'nb-7',  offsetX:  14, offsetZ:   2,  archetype: 'residential', name: 'Pine Ave' },
    { id: 'nb-8',  offsetX: -28, offsetZ: -14,  archetype: 'residential', name: 'Walnut St' },
    { id: 'nb-9',  offsetX:  28, offsetZ: -14,  archetype: 'residential', name: 'Chestnut Row' },
    { id: 'nb-10', offsetX:   0, offsetZ: -28,  archetype: 'residential', name: 'Sycamore Lane' },
    { id: 'nb-11', offsetX: -28, offsetZ:  14,  archetype: 'residential', name: 'Willow Way' },
    { id: 'nb-12', offsetX:  28, offsetZ:  14,  archetype: 'residential', name: 'Poplar Path' },
    { id: 'nb-13', offsetX: -28, offsetZ:   2,  archetype: 'residential', name: 'Grove House' },
    { id: 'nb-14', offsetX:  28, offsetZ:   2,  archetype: 'residential', name: 'Meadow View' },
  ],
  chapel: [
    { id: 'ch-0',  offsetX:   0, offsetZ:   0,  archetype: 'spire',       name: 'Chapel' },
    { id: 'ch-1',  offsetX: -16, offsetZ:  -5,  archetype: 'midrise',     name: 'Parish Hall' },
    { id: 'ch-2',  offsetX:  16, offsetZ:  -5,  archetype: 'midrise',     name: 'Community Center' },
    { id: 'ch-3',  offsetX:   0, offsetZ: -18,  archetype: 'campus',      name: 'Rec Center' },
    { id: 'ch-4',  offsetX: -14, offsetZ:  16,  archetype: 'residential', name: 'Clergy House' },
    { id: 'ch-5',  offsetX:  16, offsetZ:  16,  archetype: 'midrise',     name: 'Youth Hall' },
    { id: 'ch-6',  offsetX: -28, offsetZ:   0,  archetype: 'residential', name: 'Bishop Residence' },
    { id: 'ch-7',  offsetX:  28, offsetZ:   0,  archetype: 'midrise',     name: 'Meetinghouse' },
    { id: 'ch-8',  offsetX:   0, offsetZ:  24,  archetype: 'campus',      name: 'Family Center' },
    { id: 'ch-9',  offsetX: -16, offsetZ: -18,  archetype: 'midrise',     name: 'Relief Society' },
    { id: 'ch-10', offsetX:  16, offsetZ: -18,  archetype: 'residential', name: 'Mission Home' },
  ],
  outskirts: [
    { id: 'os-0',  offsetX:   0, offsetZ:   5,  archetype: 'warehouse', name: 'Warehouse A' },
    { id: 'os-1',  offsetX:  24, offsetZ:   5,  archetype: 'warehouse', name: 'Warehouse B' },
    { id: 'os-2',  offsetX: -24, offsetZ:   5,  archetype: 'warehouse', name: 'Warehouse C' },
    { id: 'os-3',  offsetX:   0, offsetZ: -16,  archetype: 'slab',      name: 'Industrial Slab' },
    { id: 'os-4',  offsetX:  24, offsetZ: -16,  archetype: 'midrise',   name: 'Office Block' },
    { id: 'os-5',  offsetX: -24, offsetZ: -16,  archetype: 'midrise',   name: 'Depot Office' },
    { id: 'os-6',  offsetX:   0, offsetZ:  25,  archetype: 'warehouse', name: 'Cold Storage' },
    { id: 'os-7',  offsetX:  24, offsetZ:  25,  archetype: 'midrise',   name: 'Distribution' },
    { id: 'os-8',  offsetX: -24, offsetZ:  25,  archetype: 'warehouse', name: 'Freight Hub' },
    { id: 'os-9',  offsetX:  38, offsetZ:   0,  archetype: 'midrise',   name: 'East Block' },
    { id: 'os-10', offsetX: -38, offsetZ:   0,  archetype: 'midrise',   name: 'West Block' },
  ],
  // ── New districts ──────────────────────────────────────────────────────────
  financial: [
    { id: 'fin-0',  offsetX:   0, offsetZ:   0,  archetype: 'podiumTower', name: 'Exchange Tower' },
    { id: 'fin-1',  offsetX: -18, offsetZ:  -4,  archetype: 'tower',       name: 'Capital One' },
    { id: 'fin-2',  offsetX:  18, offsetZ:   4,  archetype: 'tower',       name: 'Meridian Bank' },
    { id: 'fin-3',  offsetX:   0, offsetZ: -16,  archetype: 'tower',       name: 'Reserve Plaza' },
    { id: 'fin-4',  offsetX: -18, offsetZ:  16,  archetype: 'midrise',     name: 'Brokerage Row' },
    { id: 'fin-5',  offsetX:  18, offsetZ: -16,  archetype: 'midrise',     name: 'Securities Bldg' },
    { id: 'fin-6',  offsetX:  18, offsetZ:  16,  archetype: 'slab',        name: 'Trading Floor' },
    { id: 'fin-7',  offsetX: -32, offsetZ:   0,  archetype: 'tower',       name: 'Vault Tower' },
    { id: 'fin-8',  offsetX:  32, offsetZ:   0,  archetype: 'midrise',     name: 'Compliance Wing' },
    { id: 'fin-9',  offsetX:   0, offsetZ:  24,  archetype: 'midrise',     name: 'Wealth Mgmt' },
    { id: 'fin-10', offsetX: -18, offsetZ: -24,  archetype: 'tower',       name: 'Central Tower' },
    { id: 'fin-11', offsetX:  18, offsetZ: -24,  archetype: 'midrise',     name: 'Advisory Suite' },
  ],
  port: [
    { id: 'port-0', offsetX:   0, offsetZ:  10,  archetype: 'warehouse', name: 'Terminal A' },
    { id: 'port-1', offsetX:  28, offsetZ:  10,  archetype: 'warehouse', name: 'Terminal B' },
    { id: 'port-2', offsetX: -28, offsetZ:  10,  archetype: 'warehouse', name: 'Terminal C' },
    { id: 'port-3', offsetX:   0, offsetZ: -10,  archetype: 'slab',      name: 'Port Authority' },
    { id: 'port-4', offsetX:  28, offsetZ: -10,  archetype: 'midrise',   name: 'Customs Office' },
    { id: 'port-5', offsetX: -28, offsetZ: -10,  archetype: 'warehouse', name: 'Container Yard' },
    { id: 'port-6', offsetX:  44, offsetZ:   0,  archetype: 'warehouse', name: 'Dry Dock' },
    { id: 'port-7', offsetX: -44, offsetZ:   0,  archetype: 'warehouse', name: 'Cargo Hub' },
    { id: 'port-8', offsetX:  14, offsetZ:  24,  archetype: 'midrise',   name: 'Harbor Master' },
    { id: 'port-9', offsetX: -14, offsetZ:  24,  archetype: 'warehouse', name: 'Ship Supplies' },
  ],
  arts: [
    { id: 'arts-0',  offsetX:   0, offsetZ:   0,  archetype: 'spire',       name: 'Art Museum' },
    { id: 'arts-1',  offsetX: -18, offsetZ:  -4,  archetype: 'slab',        name: 'Gallery Row' },
    { id: 'arts-2',  offsetX:  18, offsetZ:  -4,  archetype: 'campus',      name: 'Design School' },
    { id: 'arts-3',  offsetX:   0, offsetZ: -16,  archetype: 'midrise',     name: 'Studio Complex' },
    { id: 'arts-4',  offsetX: -18, offsetZ:  16,  archetype: 'residential', name: 'Artist Lofts' },
    { id: 'arts-5',  offsetX:  18, offsetZ:  16,  archetype: 'midrise',     name: 'Theater Hall' },
    { id: 'arts-6',  offsetX: -30, offsetZ:   0,  archetype: 'midrise',     name: 'Music Conservatory' },
    { id: 'arts-7',  offsetX:  30, offsetZ:   0,  archetype: 'slab',        name: 'Cinema Block' },
    { id: 'arts-8',  offsetX:   0, offsetZ:  26,  archetype: 'residential', name: 'Bohemian Row' },
    { id: 'arts-9',  offsetX: -18, offsetZ: -22,  archetype: 'midrise',     name: 'Workshop Hub' },
    { id: 'arts-10', offsetX:  18, offsetZ: -22,  archetype: 'campus',      name: 'Innovation Lab' },
  ],
  techcampus: [
    { id: 'tc-0',  offsetX:   0, offsetZ:   0,  archetype: 'slab',        name: 'HQ Building' },
    { id: 'tc-1',  offsetX: -18, offsetZ:  -5,  archetype: 'campus',      name: 'R&D Center' },
    { id: 'tc-2',  offsetX:  18, offsetZ:  -5,  archetype: 'tower',       name: 'Product Tower' },
    { id: 'tc-3',  offsetX:   0, offsetZ: -18,  archetype: 'midrise',     name: 'Coworking Space' },
    { id: 'tc-4',  offsetX: -18, offsetZ:  18,  archetype: 'slab',        name: 'Maker Space' },
    { id: 'tc-5',  offsetX:  18, offsetZ:  18,  archetype: 'midrise',     name: 'Pitch Deck HQ' },
    { id: 'tc-6',  offsetX: -32, offsetZ:   0,  archetype: 'campus',      name: 'Accelerator' },
    { id: 'tc-7',  offsetX:  32, offsetZ:   0,  archetype: 'midrise',     name: 'VC Office' },
    { id: 'tc-8',  offsetX:   0, offsetZ:  28,  archetype: 'slab',        name: 'Demo Day Hall' },
    { id: 'tc-9',  offsetX:  18, offsetZ: -28,  archetype: 'midrise',     name: 'Tech Hub' },
    { id: 'tc-10', offsetX: -18, offsetZ: -28,  archetype: 'midrise',     name: 'Startup Row' },
  ],
  suburbs: [
    { id: 'sub-0',  offsetX:   0, offsetZ: -20,  archetype: 'residential', name: 'Elm Drive' },
    { id: 'sub-1',  offsetX: -16, offsetZ: -20,  archetype: 'residential', name: 'Oak Lane' },
    { id: 'sub-2',  offsetX:  16, offsetZ: -20,  archetype: 'residential', name: 'Pine Court' },
    { id: 'sub-3',  offsetX:   0, offsetZ:   0,  archetype: 'midrise',     name: 'Town Square' },
    { id: 'sub-4',  offsetX: -16, offsetZ:   0,  archetype: 'residential', name: 'Maple Circle' },
    { id: 'sub-5',  offsetX:  16, offsetZ:   0,  archetype: 'residential', name: 'Birch Road' },
    { id: 'sub-6',  offsetX:   0, offsetZ:  20,  archetype: 'residential', name: 'Cedar View' },
    { id: 'sub-7',  offsetX: -16, offsetZ:  20,  archetype: 'residential', name: 'Willow Bend' },
    { id: 'sub-8',  offsetX:  16, offsetZ:  20,  archetype: 'residential', name: 'Aspen Hill' },
    { id: 'sub-9',  offsetX: -32, offsetZ: -10,  archetype: 'residential', name: 'Valley Home' },
    { id: 'sub-10', offsetX:  32, offsetZ: -10,  archetype: 'residential', name: 'Summit House' },
    { id: 'sub-11', offsetX: -32, offsetZ:  10,  archetype: 'residential', name: 'River Cottage' },
    { id: 'sub-12', offsetX:  32, offsetZ:  10,  archetype: 'residential', name: 'Canyon Retreat' },
    { id: 'sub-13', offsetX:   0, offsetZ: -35,  archetype: 'residential', name: 'Country Club' },
  ],
  midtown: [
    { id: 'mt-0',  offsetX:   0, offsetZ:   0,  archetype: 'podiumTower', name: 'Central Plaza' },
    { id: 'mt-1',  offsetX: -16, offsetZ:  -4,  archetype: 'tower',       name: 'North Spire' },
    { id: 'mt-2',  offsetX:  16, offsetZ:   4,  archetype: 'tower',       name: 'South Spire' },
    { id: 'mt-3',  offsetX:   0, offsetZ: -16,  archetype: 'midrise',     name: 'Civic Block' },
    { id: 'mt-4',  offsetX: -16, offsetZ:  16,  archetype: 'slab',        name: 'Transit Hub' },
    { id: 'mt-5',  offsetX:  16, offsetZ: -16,  archetype: 'midrise',     name: 'Hotel Row' },
    { id: 'mt-6',  offsetX:  16, offsetZ:  16,  archetype: 'midrise',     name: 'Retail Block' },
    { id: 'mt-7',  offsetX: -24, offsetZ:   0,  archetype: 'tower',       name: 'West Anchor' },
    { id: 'mt-8',  offsetX:  24, offsetZ:   0,  archetype: 'tower',       name: 'East Anchor' },
  ],
};

// ─── DISTRICT SPRITE ──────────────────────────────────────────────────────────

function makeDistrictSprite(dist: DistrictDef, count: number): THREE.Sprite {
  const nc    = document.createElement('canvas');
  nc.width     = 256; nc.height = 64;
  const ctx   = nc.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  (ctx as any).roundRect?.(0, 0, 256, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#C8DCEF';
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
  g.userData.contactId   = contact.id;   // for raycaster click-to-select
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
  buildings,
  onBuildingsReady,
  onUpdateBuildings,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search,          setSearch]          = useState('');
  const [districtFilter,  setDistrictFilter]  = useState('all');
  const [isRaining,       setIsRaining]       = useState(false);
  const [shownCount,      setShownCount]      = useState(0);
  const [quality,         setQuality]         = useState<'low' | 'medium' | 'high'>('medium');
  const [tabOverlayOpen,  setTabOverlayOpen]  = useState(false);
  const [tabNearestBldId, setTabNearestBldId] = useState<string | null>(null);
  const [solarInfo,       setSolarInfo]       = useState<string>('');  // e.g. "14:23 · 42° elevation"

  const filteredRef        = useRef(filteredIds);
  const searchRef          = useRef('');
  const districtFilterRef  = useRef('all');
  const isRainingRef       = useRef(false);
  const selectedRef        = useRef<Contact | null>(null);
  const npcMeshesRef       = useRef<Map<string, NpcEntry>>(new Map());

  const sceneRef           = useRef<THREE.Scene | null>(null);
  const connLinesRef       = useRef<THREE.Group | null>(null);
  const syncNPCsRef        = useRef<((cs: Contact[], cd: Record<string, ContactMapData>) => void) | null>(null);
  const updateConnLinesRef = useRef<((c: Contact | null) => void) | null>(null);
  const updateQualityRef   = useRef<((q: 'low' | 'medium' | 'high') => void) | null>(null);
  const nightLevelRef      = useRef(0);
  const nameplateMapRef    = useRef<Map<string, THREE.Sprite>>(new Map());
  const buildingLabelRef   = useRef<Array<{ group: THREE.Group; div: HTMLDivElement; id: string }>>([]);
  const buildingsRef       = useRef(buildings);
  const matsRef            = useRef<ArchMats | null>(null);
  const onUpdateMapDataRef    = useRef(onUpdateMapData);
  const onUpdateBuildingsRef  = useRef(onUpdateBuildings);
  const tabNearestBldRef      = useRef<string | null>(null);
  const [tabToast, setTabToast] = useState<string | null>(null);

  useEffect(() => { filteredRef.current       = filteredIds;    }, [filteredIds]);
  useEffect(() => { searchRef.current         = search;         }, [search]);
  useEffect(() => { districtFilterRef.current = districtFilter; }, [districtFilter]);
  useEffect(() => { isRainingRef.current      = isRaining;      }, [isRaining]);
  useEffect(() => { buildingsRef.current       = buildings;         }, [buildings]);
  useEffect(() => { onUpdateMapDataRef.current   = onUpdateMapData;   }, [onUpdateMapData]);
  useEffect(() => { onUpdateBuildingsRef.current = onUpdateBuildings; }, [onUpdateBuildings]);

  // Dynamically spawn buildings added after initial mount (user-created buildings)
  useEffect(() => {
    const scene = sceneRef.current;
    const mats  = matsRef.current;
    if (!scene || !mats || !buildings) return;
    const existingIds = new Set(buildingLabelRef.current.map(e => e.id));
    for (const b of buildings) {
      if (existingIds.has(b.id)) continue;
      const contactShare = b.contactIds.length;
      const result = buildArchetype(b.archetype, b.position.x, b.position.z, contactShare, mats, []);
      result.group.userData.buildingId   = b.id;
      result.group.userData.districtId   = b.districtId;
      result.group.userData.buildingName = b.name;
      scene.add(result.group);
      // Label
      const bLabelDiv = document.createElement('div');
      bLabelDiv.style.cssText = [
        'color:#D4AF37', 'font-size:10px', 'font-family:system-ui,sans-serif',
        'white-space:nowrap', 'pointer-events:none',
        'text-shadow:0 1px 3px rgba(255,255,255,0.9)', 'opacity:0', 'transition:opacity 0.3s',
      ].join(';');
      bLabelDiv.textContent = b.name;
      const bLabelObj = new CSS2DObject(bLabelDiv);
      bLabelObj.position.set(0, result.height + 1.8, 0);
      result.group.add(bLabelObj);
      buildingLabelRef.current.push({ group: result.group, div: bLabelDiv, id: b.id });
    }
  }, [buildings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setSelectedContact(null);
        selectedRef.current = null;
        setTabOverlayOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
    if (!canvas || !labelDiv) return;
    const mmCanvas = minimapRef.current;

    const W = canvas.clientWidth  || 800;
    const H = canvas.clientHeight || 600;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
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
    scene.fog = new THREE.FogExp2(0xe4eaf0, 0.0012); // lighter fog for large world

    // ── Custom gradient sky (architectural model look) ──
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uHorizon: { value: new THREE.Color('#E8F0F8') },
        uZenith:  { value: new THREE.Color('#7BB8D4') },
        uSunDir:  { value: new THREE.Vector3(0, 1, 0) },
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
          float t = clamp(normalize(vWorldPos).y * 1.4, 0.0, 1.0);
          vec3 sky = mix(uHorizon, uZenith, t);
          float sun = pow(max(dot(normalize(vWorldPos), uSunDir), 0.0), 180.0) * 2.0;
          sky += vec3(1.0, 0.97, 0.9) * sun;
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);
    const sunVec = new THREE.Vector3();

    // ── Stars ──
    const starPositions = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const phi   = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      starPositions[i * 3]     = 700 * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = 700 * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = 700 * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.5, color: '#d0e0f0', transparent: true, opacity: 0, sizeAttenuation: true });
    const stars   = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

    // ── Lighting — strong directional sun + cool hemi fill only ──
    const sun = new THREE.DirectionalLight('#ffffff', 2.5);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(8192, 8192);
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 900;
    sun.shadow.camera.left   = -400;
    sun.shadow.camera.right  = 400;
    sun.shadow.camera.top    = 400;
    sun.shadow.camera.bottom = -400;
    sun.shadow.bias = -0.0003;
    (sun.shadow as THREE.DirectionalLightShadow & { radius?: number }).radius = 3;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight('#C8D8F0', '#E0E8F0', 0.4);
    scene.add(hemi);

    // ── Camera — isometric orbit ──
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1200);

    // ── Solar position helper ──
    function calcSunPosition(lat: number, lng: number, date: Date): { elevation: number; azimuth: number } {
      void lng;
      const doy    = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
      const decl   = -23.45 * Math.cos((2 * Math.PI / 365) * (doy + 10)) * (Math.PI / 180);
      const hour   = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
      const ha     = (hour - 12) * 15 * (Math.PI / 180);
      const latR   = lat * (Math.PI / 180);
      const sinEl  = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
      const el     = Math.asin(Math.max(-1, Math.min(1, sinEl))) * (180 / Math.PI);
      const cosAz  = (Math.sin(decl) - Math.sin(latR) * sinEl) / (Math.cos(latR) * Math.cos(Math.max(0.001, Math.abs(el)) * Math.PI / 180));
      const az     = (hour >= 12 ? 1 : -1) * Math.acos(Math.max(-1, Math.min(1, cosAz))) * (180 / Math.PI);
      return { elevation: el, azimuth: az };
    }

    // Geolocation — default to Utah (BYU area)
    let userLat = 40.25, userLng = -111.65;
    navigator.geolocation?.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
    });

    // ── Orbit state ──
    let orbitTarget = new THREE.Vector3(0, 0, 0);
    let orbitRadius = ISO_RADIUS_DEFAULT;
    let orbitTheta  = Math.PI / 4;   // azimuth — 45° NW angle like reference image
    const orbitPhi  = ISO_PHI;       // fixed elevation

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

    // ── Post-processing ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Subtle bloom only — no vignette/noise for the clean model look
    const bloomEffect = new BloomEffect({ intensity: 0.2, luminanceThreshold: 0.95, luminanceSmoothing: 0.02, mipmapBlur: true });
    const bloomPass   = new EffectPass(camera, bloomEffect);
    composer.addPass(bloomPass);

    updateQualityRef.current = (q: 'low' | 'medium' | 'high') => {
      bloomPass.enabled = q !== 'low';
    };

    // ── Ground (expanded world) ──
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({ color: '#E4EAF0', roughness: 0.95, metalness: 0 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ── Harbor / Water body (north edge) ──
    const harborMat = new THREE.MeshStandardMaterial({
      color: '#4A90C8', roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.82,
    });
    const harborMesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 280), harborMat);
    harborMesh.rotation.x = -Math.PI / 2;
    harborMesh.position.set(0, -0.3, -470);
    scene.add(harborMesh);

    // Harbor seawall
    const seawallMat = new THREE.MeshStandardMaterial({ color: '#C8CEDD', roughness: 0.85 });
    const seawall = new THREE.Mesh(new THREE.BoxGeometry(800, 1.2, 2.5), seawallMat);
    seawall.position.set(0, 0.6, -330);
    seawall.castShadow = true;
    scene.add(seawall);

    // Animate harbor wave UV
    const harborTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const ctx2 = cv.getContext('2d')!;
      ctx2.fillStyle = '#4A90C8';
      ctx2.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 20; i++) {
        const grd = ctx2.createRadialGradient(
          Math.random() * 256, Math.random() * 256, 4,
          Math.random() * 256, Math.random() * 256, 40
        );
        grd.addColorStop(0, 'rgba(180,220,255,0.18)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx2.fillStyle = grd;
        ctx2.fillRect(0, 0, 256, 256);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 2);
      return t;
    })();
    harborMat.map = harborTex;

    // ── Manhattan-style street grid ──
    const roadMat  = new THREE.MeshStandardMaterial({ color: '#1C1C1E', roughness: 0.97, metalness: 0 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#D8DDE3', roughness: 0.9 });
    const curbMat  = new THREE.MeshStandardMaterial({ color: '#C8CDD3', roughness: 0.85 });
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#F5E642', roughness: 0.6 });

    // Major avenues (N-S, wide, every 50 units)
    const MAJOR_AVENUES_X  = [-200, -150, -100, -50, 0, 50, 100, 150, 200];
    const MINOR_STREETS_X  = [-175, -125, -75, -25, 25, 75, 125, 175];
    // Major cross streets (E-W)
    const MAJOR_STREETS_Z  = [-250, -200, -150, -100, -50, 0, 50, 100, 150];
    const MINOR_STREETS_Z  = [-225, -175, -125, -75, -25, 25, 75, 125];

    const GRID_EXTENT = 300; // how far roads extend

    function addGridRoad(cx: number, cz: number, width: number, length: number, isNS: boolean) {
      const geo = new THREE.PlaneGeometry(isNS ? width : length, isNS ? length : width);
      const road = new THREE.Mesh(geo, roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(cx, 0.01, cz);
      road.receiveShadow = true;
      scene.add(road);
      // Sidewalks on each side
      for (const side of [-1, 1]) {
        const swOff = (width / 2 + 1.2) * side;
        const sw = new THREE.Mesh(
          new THREE.PlaneGeometry(isNS ? 2.0 : length, isNS ? length : 2.0),
          swalkMat
        );
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(isNS ? cx + swOff : cx, 0.02, isNS ? cz : cz + swOff);
        sw.receiveShadow = true;
        scene.add(sw);
        // Curb strip
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(isNS ? 0.22 : length, 0.12, isNS ? length : 0.22),
          curbMat
        );
        curb.position.set(isNS ? cx + (width / 2 + 0.08) * side : cx, 0.06,
                          isNS ? cz : cz + (width / 2 + 0.08) * side);
        scene.add(curb);
      }
      // Center dash markings on major roads
      if (width >= 8) {
        const step = 5, dashLen = 2.2;
        const lineCount = Math.floor(length / step);
        for (let i = 0; i < lineCount; i++) {
          const offset = -length / 2 + i * step + step / 2;
          const d = new THREE.Mesh(
            new THREE.PlaneGeometry(isNS ? 0.2 : dashLen, isNS ? dashLen : 0.2),
            dashMat
          );
          d.rotation.x = -Math.PI / 2;
          d.position.set(isNS ? cx : cx + offset, 0.015, isNS ? cz + offset : cz);
          scene.add(d);
        }
      }
    }

    for (const x of MAJOR_AVENUES_X)  addGridRoad(x, -GRID_EXTENT / 2, 9, GRID_EXTENT, true);
    for (const x of MINOR_STREETS_X)  addGridRoad(x, -GRID_EXTENT / 2, 5, GRID_EXTENT, true);
    for (const z of MAJOR_STREETS_Z)  addGridRoad(0, z, 9, GRID_EXTENT * 2, false);
    for (const z of MINOR_STREETS_Z)  addGridRoad(0, z, 5, GRID_EXTENT * 2, false);

    // ── Parks & Green Spaces ──
    const parkGroundMat = new THREE.MeshStandardMaterial({ color: '#C8D8C0', roughness: 0.95 });
    const darkGrassMat  = new THREE.MeshStandardMaterial({ color: '#B8CCAC', roughness: 0.95 });

    function addPark(cx: number, cz: number, w: number, d: number, mat = parkGroundMat) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(cx, 0.02, cz);
      p.receiveShadow = true;
      scene.add(p);
      // Scatter trees
      const rng = seededRandom(`park-${cx}-${cz}`);
      const treeCount = Math.floor((w * d) / 120);
      for (let i = 0; i < treeCount; i++) {
        const tx = cx + (rng() - 0.5) * (w - 6);
        const tz = cz + (rng() - 0.5) * (d - 6);
        const tree = makeTree(tx, tz, seededRandom(`ptree-${i}-${cx}`), 'park');
        scene.add(tree);
      }
    }

    // Central Park (large, between midtown and BYU district)
    addPark(0, -40, 50, 30, darkGrassMat);
    // Waterfront park (along harbor)
    addPark(-80, -310, 120, 30, parkGroundMat);
    addPark(80,  -310, 120, 30, parkGroundMat);
    // Arts district plaza
    addPark(-95, 130, 40, 25, darkGrassMat);
    // Neighborhood park
    addPark(-110, 20, 30, 20, parkGroundMat);
    // Suburb green
    addPark(-200, 80, 50, 35, parkGroundMat);

    // ── Tree-lined major avenues ──
    const avenueTreeRng = seededRandom('avenue-trees');
    for (const x of [-100, 0, 100]) {
      for (let z = -260; z < 160; z += 12) {
        if (Math.abs(z) < 20) continue; // skip plaza area
        for (const side of [-1, 1]) {
          const tree = makeTree(x + side * 7.5, z + avenueTreeRng() * 3 - 1.5, seededRandom(`avtree-${x}-${z}-${side}`), 'avenue');
          scene.add(tree);
        }
      }
    }

    // ── Central Plaza ──
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: '#D8E0E8', roughness: 0.8 })
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
      new THREE.MeshStandardMaterial({ color: '#C8D4DE', roughness: 0.6, metalness: 0.05 })
    );
    basin.position.set(0, 0.02, 0);
    basin.castShadow = true;
    scene.add(basin);

    // Fountain center pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.8, 10),
      new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.6 })
    );
    pillar.position.set(0, 1.1, 0);
    pillar.castShadow = true;
    scene.add(pillar);

    // Water surface with canvas ripple texture
    const wCv = document.createElement('canvas');
    wCv.width = wCv.height = 128;
    const wCtx = wCv.getContext('2d')!;
    wCtx.fillStyle = '#C8DCF0';
    wCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 12; i++) {
      const grd = wCtx.createRadialGradient(
        Math.random() * 128, Math.random() * 128, 2,
        Math.random() * 128, Math.random() * 128, 18
      );
      grd.addColorStop(0, 'rgba(160,200,240,0.28)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      wCtx.fillStyle = grd;
      wCtx.fillRect(0, 0, 128, 128);
    }
    const waterTex = new THREE.CanvasTexture(wCv);
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(3, 3);
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#A8C8E8', map: waterTex, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85
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
    const benchMat = new THREE.MeshStandardMaterial({ color: '#C8D4DE', roughness: 0.8 });
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

    const autoCityBuildings: CityBuilding[] = [];

    // Shared arch materials — stored in matsRef for dynamic building spawn
    const mats = makeArchMats();
    matsRef.current = mats;

    for (const dist of DISTRICTS) {
      const dcs = distContactMap.get(dist.id) ?? [];
      const defs = BUILDING_DEFS[dist.id] ?? [];

      // District ground patch
      const dGround = new THREE.Mesh(
        new THREE.PlaneGeometry(dist.w, dist.d),
        new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.9 })
      );
      dGround.rotation.x = -Math.PI / 2;
      dGround.position.set(dist.cx, 0.015, dist.cz);
      dGround.receiveShadow = true;
      scene.add(dGround);

      // Build each defined building using its archetype
      let tallestH = 4;
      for (let bi = 0; bi < defs.length; bi++) {
        const def = defs[bi];
        const wx = dist.cx + def.offsetX;
        const wz = dist.cz + def.offsetZ;
        const contactShare = Math.ceil(dcs.length / Math.max(defs.length, 1));
        const stored = (buildings ?? []).find(b => b.id === def.id);
        const result = buildArchetype(def.archetype, wx, wz, contactShare, mats, collidables);
        result.group.userData.buildingId  = def.id;
        result.group.userData.districtId  = dist.id;
        result.group.userData.buildingName = def.name;
        scene.add(result.group);
        if (result.height > tallestH) tallestH = result.height;

        // Building nameplate (CSS2DObject — fades by distance)
        const bLabelDiv = document.createElement('div');
        bLabelDiv.style.cssText = [
          'color:#8899AA',
          'font-size:10px',
          'font-family:system-ui,sans-serif',
          'white-space:nowrap',
          'pointer-events:none',
          'text-shadow:0 1px 3px rgba(255,255,255,0.9)',
          'opacity:0',
          'transition:opacity 0.3s',
        ].join(';');
        bLabelDiv.textContent = stored?.name ?? def.name;
        const bLabelObj = new CSS2DObject(bLabelDiv);
        bLabelObj.position.set(0, result.height + 1.8, 0);
        result.group.add(bLabelObj);
        buildingLabelRef.current.push({ group: result.group, div: bLabelDiv, id: def.id });

        // Entrance trigger for main building (first def)
        if (bi === 0) {
          const trigger = new THREE.Mesh(
            new THREE.PlaneGeometry(8, 4),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          trigger.rotation.x = -Math.PI / 2;
          trigger.position.set(wx, 0.1, wz + 9);
          trigger.userData.isBuildingEntrance = true;
          trigger.userData.districtId   = dist.id;
          trigger.userData.districtName = dist.name;
          scene.add(trigger);
          collidables.push(trigger);
        }

        // Register building in CityBuilding list (use stored name if available)
        autoCityBuildings.push({
          id:         def.id,
          districtId: dist.id,
          name:       stored?.name ?? def.name,
          archetype:  def.archetype,
          position:   { x: wx, z: wz },
          contactIds: stored?.contactIds ?? [],
        });
      }

      // District building height for sprite position
      const mainH = tallestH;

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

    // Fire building registry callback once on mount
    onBuildingsReady?.(autoCityBuildings);

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

    // ── Orbit + Pan + Zoom mouse controls ──
    let isDragging   = false;
    let isPanning    = false;
    let lastMouseX   = 0, lastMouseY = 0;
    const clickPointer = new THREE.Vector2();
    const raycaster    = new THREE.Raycaster();

    const onMouseDown = (e: MouseEvent) => {
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      if (e.button === 2 || e.button === 1) { isDragging = true; isPanning = e.button === 1; }
      else if (e.button === 0) { isDragging = true; isPanning = false; }
    };
    canvas.addEventListener('mousedown', onMouseDown);

    const onMouseMoveOrbit = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      if (isPanning || e.button === 1) {
        // Pan — move orbit target in camera-local XZ plane
        const panSpeed = orbitRadius * 0.0012;
        const rightVec = new THREE.Vector3();
        const upVec    = new THREE.Vector3(0, 1, 0);
        rightVec.crossVectors(camera.getWorldDirection(new THREE.Vector3()), upVec).normalize();
        const fwdFlat = new THREE.Vector3(-Math.sin(orbitTheta), 0, -Math.cos(orbitTheta));
        orbitTarget.addScaledVector(rightVec, -dx * panSpeed);
        orbitTarget.addScaledVector(fwdFlat,   dy * panSpeed);
        orbitTarget.y = 0;
      } else {
        // Rotate azimuth only (pitch locked to ISO_PHI)
        orbitTheta += dx * 0.005;
      }
      updateCameraOrbit();
    };
    document.addEventListener('mousemove', onMouseMoveOrbit);

    const onMouseUp = (e: MouseEvent) => {
      // Only register click if not dragging
      const totalDelta = Math.abs(e.clientX - lastMouseX) + Math.abs(e.clientY - lastMouseY);
      isDragging = false; isPanning = false;
      if (e.button !== 0 || totalDelta > 4) return;
      if (selectedRef.current) return;
      // Raycast to NPCs
      const rect = canvas.getBoundingClientRect();
      clickPointer.set(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(clickPointer, camera);
      const npcObjects: THREE.Object3D[] = [];
      for (const [, entry] of npcMeshesRef.current) {
        if (entry.group.visible) entry.group.traverse(ch => { if (ch instanceof THREE.Mesh) npcObjects.push(ch); });
      }
      const hits = raycaster.intersectObjects(npcObjects, false);
      if (hits.length > 0) {
        // Walk up to find NPC group
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.contactId) { obj = obj.parent; }
        const contactId = obj?.userData.contactId as string | undefined;
        if (contactId) {
          const entry = npcMeshesRef.current.get(contactId);
          if (entry) {
            setSelectedContact(entry.contact);
            selectedRef.current = entry.contact;
          }
        }
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRadius = Math.max(ISO_RADIUS_MIN, Math.min(ISO_RADIUS_MAX, orbitRadius + e.deltaY * 0.3));
      updateCameraOrbit();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch support (pinch-zoom + one-finger pan)
    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        orbitRadius = Math.max(ISO_RADIUS_MIN, Math.min(ISO_RADIUS_MAX, orbitRadius - (dist - lastTouchDist) * 0.5));
        lastTouchDist = dist;
        updateCameraOrbit();
      } else if (e.touches.length === 1) {
        const ddx = e.touches[0].clientX - lastMouseX;
        const ddy = e.touches[0].clientY - lastMouseY;
        lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
        orbitTheta += ddx * 0.005;
        updateCameraOrbit();
      }
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });


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
    if (mmCanvas) { mmCanvas.width = 180; mmCanvas.height = 180; }
    const mmCtx     = mmCanvas?.getContext('2d') ?? null;
    const WORLD_SCL = 90 / 180;

    function drawMinimap() {
      if (!mmCtx) return;
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
      // Draw orbit target crosshair (where the camera is looking)
      const tx = 90 + orbitTarget.x * WORLD_SCL;
      const tz = 90 + orbitTarget.z * WORLD_SCL;
      mmCtx.strokeStyle = '#ffffff';
      mmCtx.lineWidth   = 2;
      mmCtx.beginPath(); mmCtx.moveTo(tx - 5, tz); mmCtx.lineTo(tx + 5, tz); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(tx, tz - 5); mmCtx.lineTo(tx, tz + 5); mmCtx.stroke();
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

        // Snap NPC to assigned building position
        const entry = map.get(c.id)!;
        if (md.buildingId) {
          const bld = buildingsRef.current?.find(b => b.id === md.buildingId);
          if (bld) {
            const rng = seededRandom(c.id + 'bpos');
            entry.group.position.set(bld.position.x + (rng() - 0.5) * 5, 0, bld.position.z + (rng() - 0.5) * 5);
          }
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
          selEntry.group.position.clone().setY(2.0),
          entry.group.position.clone().setY(2.0),
        ];
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        connGroup.add(new THREE.Line(geo, lineMat));
      }
    };

    // ── Real-time solar lighting ──
    let fogDensity   = 0.002;
    let prevLampI    = 0;
    let weatherTimer = (3 + Math.random() * 5) * RAIN_TOGGLE_INTERVAL;
    let lastSolarUpdate = -60; // force immediate update

    function updateSolarLighting(dt: number) {
      const now = new Date();
      const elapsed = now.getTime() / 1000;

      // Recalculate sun position once per minute (or on first frame)
      let sunC: THREE.Color;
      let sunI: number, lampI: number;
      let fogC: THREE.Color;

      if (elapsed - lastSolarUpdate >= 60) {
        lastSolarUpdate = elapsed;
        const { elevation, azimuth } = calcSunPosition(userLat, userLng, now);

        // Convert solar elevation + azimuth to Three.js directional light position
        const elRad = elevation * (Math.PI / 180);
        const azRad = azimuth   * (Math.PI / 180);
        const lx = Math.cos(elRad) * Math.sin(azRad);
        const ly = Math.sin(elRad);
        const lz = Math.cos(elRad) * Math.cos(azRad);
        sunVec.set(lx, ly, lz).normalize();
        sun.position.set(lx * 200, ly * 200, lz * 200);
        skyMat.uniforms.uSunDir.value.copy(sunVec);

        // Update solar info display
        const h   = now.getHours().toString().padStart(2, '0');
        const m   = now.getMinutes().toString().padStart(2, '0');
        setSolarInfo(`${h}:${m} · ${Math.round(elevation)}° el`);
      }

      // Derive lighting values from current sun elevation
      const elDeg = Math.asin(Math.max(-1, Math.min(1, sunVec.y))) * (180 / Math.PI);

      if (elDeg < -5) {
        // Night
        sunC = new THREE.Color('#000820'); sunI = 0; lampI = 2.2;
        fogC = new THREE.Color('#0a0e18');
        hemi.color.set('#0a0e2a'); hemi.groundColor.set('#0e1418'); hemi.intensity = 0.12;
        skyMat.uniforms.uHorizon.value.set('#1a2030');
        skyMat.uniforms.uZenith.value.set('#0a0e1a');
      } else if (elDeg < 10) {
        // Sunrise / sunset (golden hour)
        const tt = (elDeg + 5) / 15;
        sunC = lerpColor(new THREE.Color('#000820'), new THREE.Color('#FFB060'), tt);
        sunI = lerpN(0, 1.4, tt); lampI = lerpN(2.2, 0, tt);
        fogC = lerpColor(new THREE.Color('#0a0e18'), new THREE.Color('#D0C8A8'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#0a0e2a'), new THREE.Color('#E8C898'), tt));
        hemi.groundColor.set(lerpColor(new THREE.Color('#0e1418'), new THREE.Color('#D8B888'), tt));
        hemi.intensity = lerpN(0.12, 0.35, tt);
        skyMat.uniforms.uHorizon.value.copy(lerpColor(new THREE.Color('#1a1010'), new THREE.Color('#FFB878'), tt));
        skyMat.uniforms.uZenith.value.copy(lerpColor(new THREE.Color('#0a0e1a'), new THREE.Color('#6898C8'), tt));
      } else if (elDeg < 30) {
        // Morning / late afternoon
        const tt = (elDeg - 10) / 20;
        sunC = lerpColor(new THREE.Color('#FFB060'), new THREE.Color('#FFF8E8'), tt);
        sunI = lerpN(1.4, 2.2, tt); lampI = 0;
        fogC = lerpColor(new THREE.Color('#D0C8A8'), new THREE.Color('#E4EAF0'), tt);
        hemi.color.set(lerpColor(new THREE.Color('#E8C898'), new THREE.Color('#C8D8F0'), tt));
        hemi.groundColor.set(lerpColor(new THREE.Color('#D8B888'), new THREE.Color('#E0E8F0'), tt));
        hemi.intensity = lerpN(0.35, 0.4, tt);
        skyMat.uniforms.uHorizon.value.copy(lerpColor(new THREE.Color('#FFB878'), new THREE.Color('#E8F0F8'), tt));
        skyMat.uniforms.uZenith.value.copy(lerpColor(new THREE.Color('#6898C8'), new THREE.Color('#7BB8D4'), tt));
      } else {
        // Full daytime (elevation ≥ 30°)
        sunC = new THREE.Color('#ffffff'); sunI = 2.5; lampI = 0;
        fogC = new THREE.Color('#E4EAF0');
        hemi.color.set('#C8D8F0'); hemi.groundColor.set('#E0E8F0'); hemi.intensity = 0.4;
        skyMat.uniforms.uHorizon.value.set('#E8F0F8');
        skyMat.uniforms.uZenith.value.set('#7BB8D4');
      }

      (scene.fog as THREE.FogExp2).color = fogC;
      sun.color    = sunC;
      sun.intensity = sunI;

      void windows; void vantaLedMats;

      // Lamps on at night
      for (const lamp of lampGroups) {
        const lh = lamp.userData.lampHead  as THREE.Mesh;
        const ll = lamp.userData.lampLight as THREE.PointLight;
        const on = lampI > 0.5;
        if (lh?.material instanceof THREE.MeshStandardMaterial)
          lh.material.emissiveIntensity = on ? 1.0 : 0;
        if (ll) ll.intensity = lampI;
      }

      // Car lights at night
      const carOn = lampI > 0.5;
      for (const car of carGroups) {
        const hlMat = car.userData.hlMat as THREE.MeshStandardMaterial | undefined;
        const tlMat = car.userData.tlMat as THREE.MeshStandardMaterial | undefined;
        if (hlMat) hlMat.emissiveIntensity = carOn ? 0.9 : 0;
        if (tlMat) tlMat.emissiveIntensity = carOn ? 0.8 : 0;
      }

      fountainLight.intensity = lampI > 0.5 ? 0.8 : 0;
      starMat.opacity = lerpN(starMat.opacity, lampI > 1.0 ? 0.6 : 0, dt * 0.8);

      const fogTarget = isRainingRef.current ? 0.010
        : lampI > 1.5 ? 0.006
        : lampI > 0.3 ? 0.004
        : 0.002;
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

      // Solar lighting (real-time)
      updateSolarLighting(delta);

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
      // Harbor UV scroll
      harborTex.offset.x += delta * 0.008;
      harborTex.offset.y += delta * 0.004;

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

      // NPC loop
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

      }

      // Track nearest building for Tab overlay (not used in isometric mode but keep for data)
      let nearestBldId: string | null = null;
      let nearestBldDist = Infinity;
      for (const entry of buildingLabelRef.current) {
        const bx = entry.group.position.x - camera.position.x;
        const bz = entry.group.position.z - camera.position.z;
        const bd = Math.sqrt(bx * bx + bz * bz);
        if (bd < 8 && bd < nearestBldDist) { nearestBldDist = bd; nearestBldId = entry.id; }
      }
      tabNearestBldRef.current = nearestBldId;

      // Building nameplate distance fade
      for (const entry of buildingLabelRef.current) {
        const bx = entry.group.position.x - camera.position.x;
        const bz = entry.group.position.z - camera.position.z;
        const bdist = Math.sqrt(bx * bx + bz * bz);
        const bStoredBuilding = buildingsRef.current?.find(b => b.id === entry.id);
        const hasContacts = (bStoredBuilding?.contactIds.length ?? 0) > 0;
        const targetOp = bdist < 35 ? 1 : bdist < 50 ? (50 - bdist) / 15 : 0;
        entry.div.style.opacity = String(Math.round(targetOp * 100) / 100);
        entry.div.style.color = hasContacts ? '#D4AF37' : '#8899AA';
      }

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
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMoveOrbit);
      document.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
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

      {/* Isometric controls hint — shown briefly, fades */}
      {!selectedContact && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '5px 14px', color: '#64748b', fontSize: 11,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          Drag to rotate · Scroll to zoom · Right-drag to pan · Click contact to select
        </div>
      )}

      {/* Tab toast confirmation */}
      {tabToast && (
        <div style={{
          position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(16,185,129,0.92)', borderRadius: 8, padding: '6px 18px',
          color: '#fff', fontSize: 12, fontWeight: 600, pointerEvents: 'none', zIndex: 50,
        }}>{tabToast}</div>
      )}

      {/* Tab hint when near a building */}
      {tabNearestBldRef.current && !tabOverlayOpen && !selectedContact && (
        <div style={{
          position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 8, padding: '5px 16px', color: '#e2e8f0', fontSize: 12,
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>[Tab]</span> Assign contacts to{' '}
          {buildingsRef.current?.find(b => b.id === tabNearestBldRef.current)?.name ?? 'building'}
        </div>
      )}

      {/* Tab overlay — in-city contact assignment (Mode B) */}
      {tabOverlayOpen && tabNearestBldId && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(15,20,35,0.96)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: 20, width: 340, maxHeight: '70vh', overflowY: 'auto',
          zIndex: 40, color: '#e2e8f0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Assign to{' '}
              <span style={{ color: '#D4AF37' }}>
                {buildingsRef.current?.find(b => b.id === tabNearestBldId)?.name ?? tabNearestBldId}
              </span>
            </div>
            <button
              onClick={() => setTabOverlayOpen(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
            Unassigned contacts — click to place at this building
          </div>
          {contacts
            .filter(c => !(mapState.contactData[c.id]?.buildingId))
            .slice(0, 10)
            .map(c => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}>
                <span style={{ fontSize: 13 }}>{c.name}{c.company ? ` · ${c.company}` : ''}</span>
                <button
                  onClick={() => {
                    onUpdateMapDataRef.current(c.id, { buildingId: tabNearestBldId });
                    // Sync buildings.contactIds
                    const prev = buildingsRef.current ?? [];
                    const prevBldId = mapState.contactData[c.id]?.buildingId;
                    const updated = prev.map(b => {
                      let ids = b.contactIds.filter(id => id !== c.id);
                      if (b.id === tabNearestBldId) ids = [...ids, c.id];
                      return { ...b, contactIds: ids };
                    });
                    onUpdateBuildingsRef.current?.(updated);
                    void prevBldId;
                    // Toast + auto-close
                    const bldName = buildingsRef.current?.find(b => b.id === tabNearestBldId)?.name ?? 'building';
                    setTabToast(`✓ ${c.name} → ${bldName}`);
                    setTimeout(() => setTabToast(null), 1800);
                    const remaining = contacts.filter(cx => !mapState.contactData[cx.id]?.buildingId && cx.id !== c.id).length;
                    if (remaining === 0) setTabOverlayOpen(false);
                  }}
                  style={{
                    background: '#1d4ed8', border: 'none', borderRadius: 6,
                    color: '#fff', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                  }}
                >Place here</button>
              </div>
            ))}
          {contacts.filter(c => !(mapState.contactData[c.id]?.buildingId)).length === 0 && (
            <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
              All contacts are already assigned.
            </div>
          )}
        </div>
      )}

      {/* Top search/filter bar */}
      {<div style={{
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

        {solarInfo && (
          <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4, whiteSpace: 'nowrap' }}>
            {solarInfo}
          </span>
        )}
      </div>}

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
            buildings={buildingsRef.current}
          />
        </div>
      )}

      {/* Legend + quality toggle (bottom-right) */}
      {(
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
