/**
 * NetworkView3D — Phase 2 City: Live NPCs, Relationship Strength, Real-time CRM Sync.
 * Every contact is a living NPC in their district. Colors reflect relationship strength.
 * Uses ContactMapPopup for the full CRM profile panel.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Search, X, MapPin } from 'lucide-react';
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

function makeLamp(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.6, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), poleMat);
  pole.position.y = 2.1;
  pole.castShadow = true;
  g.add(pole);
  const headMat = new THREE.MeshStandardMaterial({ color: '#ffffcc', emissive: '#ffffaa', emissiveIntensity: 0 });
  const head    = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), headMat);
  head.position.y = 4.3;
  g.add(head);
  const light = new THREE.PointLight('#ffeeaa', 0, 18, 1.5);
  light.position.y = 4.3;
  g.add(light);
  g.userData.lampHead  = head;
  g.userData.lampLight = light;
  return g;
}

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

  // Load photo onto head sphere if available
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

  // Visual indicators
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

  // Two-line CSS2D label
  const labelDiv = document.createElement('div');
  const nameEl   = document.createElement('div');
  nameEl.textContent = contact.name;
  nameEl.style.cssText = 'color:#e2e8f0;font-size:11px;font-weight:600;line-height:1.3;';
  labelDiv.appendChild(nameEl);
  const sub = contact.company || contact.relationship;
  if (sub) {
    const subEl = document.createElement('div');
    subEl.textContent    = sub;
    subEl.style.cssText  = 'color:#94a3b8;font-size:9px;line-height:1.3;';
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

  g.userData.bobOffset  = seededRandom(contact.id + 'bob')();
  g.userData.strength   = strength;
  g.userData.labelDiv   = labelDiv;
  g.userData.spawnTime  = Date.now();
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

  // Refs for animation loop access (no re-render cost)
  const filteredRef        = useRef(filteredIds);
  const searchRef          = useRef('');
  const districtFilterRef  = useRef('all');
  const isRainingRef       = useRef(false);
  const isLockedRef        = useRef(false);
  const nearbyRef          = useRef<Contact | null>(null);
  const selectedRef        = useRef<Contact | null>(null);
  const npcMeshesRef       = useRef<Map<string, NpcEntry>>(new Map());

  // Exposed scene refs for sync effects
  const sceneRef           = useRef<THREE.Scene | null>(null);
  const connLinesRef       = useRef<THREE.Group | null>(null);
  const syncNPCsRef        = useRef<((cs: Contact[], cd: Record<string, ContactMapData>) => void) | null>(null);
  const updateConnLinesRef = useRef<((c: Contact | null) => void) | null>(null);
  const nightLevelRef      = useRef(0);
  const nameplateMapRef    = useRef<Map<string, THREE.Sprite>>(new Map());

  // Keep refs current
  useEffect(() => { filteredRef.current       = filteredIds;       }, [filteredIds]);
  useEffect(() => { searchRef.current         = search;            }, [search]);
  useEffect(() => { districtFilterRef.current = districtFilter;    }, [districtFilter]);
  useEffect(() => { isRainingRef.current      = isRaining;         }, [isRaining]);

  // E key / Escape
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

  // Shown count
  useEffect(() => {
    const q = search.toLowerCase();
    const shown = contacts.filter(c => {
      const nm = !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q);
      const dm = districtFilter === 'all' || assignDistrict(c) === districtFilter;
      return nm && dm;
    }).length;
    setShownCount(shown);
  }, [contacts, search, districtFilter]);

  // Real-time NPC sync (contacts/mapData changed → diff scene)
  useEffect(() => {
    syncNPCsRef.current?.(contacts, mapState.contactData);
  }, [contacts, mapState.contactData]);

  // Connection lines (selected contact changed)
  useEffect(() => {
    updateConnLinesRef.current?.(selectedContact);
    selectedRef.current = selectedContact;
  }, [selectedContact]);

  // ── MAIN THREE.JS SETUP ────────────────────────────────────────────────────
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
    renderer.toneMappingExposure = 1.0;

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

    // ── Sky ──
    const skyMat  = new THREE.MeshBasicMaterial({ color: '#87ceeb', side: THREE.BackSide });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(290, 16, 16), skyMat);
    scene.add(skyMesh);

    // ── Lighting ──
    const ambient = new THREE.AmbientLight('#ffffff', 0.4);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top  = 160; sun.shadow.camera.bottom = -160;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight('#87ceeb', '#3d5a3e', 0.4));

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 550);
    camera.position.set(0, PLAYER_HEIGHT, 5);

    // ── Ground ──
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: '#3a5c2a', roughness: 1 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ── Roads ──
    const roadMat  = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.9 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8 });

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
        scene.add(sw);
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

    // ── Central Plaza ──
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: '#b8b4ae', roughness: 0.7 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.02, 0);
    plaza.receiveShadow = true;
    scene.add(plaza);

    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 9, 8),
      new THREE.MeshStandardMaterial({ color: '#c8a86b', emissive: '#c8a86b', emissiveIntensity: 0.2, roughness: 0.4 }));
    obelisk.position.set(0, 4.5, 0);
    obelisk.castShadow = true;
    scene.add(obelisk);

    const benchMat = new THREE.MeshStandardMaterial({ color: '#7a5c1e', roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.7), benchMat);
      bench.position.set(Math.cos(a) * 9, 0.17, Math.sin(a) * 9);
      bench.rotation.y = a + Math.PI / 2;
      bench.castShadow = true;
      scene.add(bench);
    }

    // Plaza lamps
    const lampGroups: THREE.Group[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lamp = makeLamp(Math.cos(a) * 13, Math.sin(a) * 13);
      scene.add(lamp);
      lampGroups.push(lamp);
    }

    // ── Districts + Buildings ──
    const collidables: THREE.Object3D[] = [];
    const windows:     THREE.Mesh[]     = [];

    const distContactMap = new Map<string, Contact[]>();
    for (const d of DISTRICTS) distContactMap.set(d.id, []);
    for (const c of contacts) distContactMap.get(assignDistrict(c))?.push(c);

    for (const dist of DISTRICTS) {
      const dcs = distContactMap.get(dist.id) ?? [];
      const mainH = Math.max(4, 2 + dcs.length * 0.5);

      // Ground patch
      const dGround = new THREE.Mesh(new THREE.PlaneGeometry(dist.w, dist.d),
        new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.9 }));
      dGround.rotation.x = -Math.PI / 2;
      dGround.position.set(dist.cx, 0.015, dist.cz);
      dGround.receiveShadow = true;
      scene.add(dGround);

      // Main building
      const mainMat  = new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.55, metalness: 0.05 });
      const mainBld  = new THREE.Mesh(new THREE.BoxGeometry(12, mainH, 12), mainMat);
      mainBld.position.set(dist.cx, mainH / 2, dist.cz);
      mainBld.castShadow    = true;
      mainBld.receiveShadow = true;
      mainBld.userData.districtId = dist.id;
      scene.add(mainBld);
      collidables.push(mainBld);

      // Roof trim
      const trimMat = new THREE.MeshStandardMaterial({ color: dist.trim, roughness: 0.4, metalness: 0.3 });
      const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.4, 13.2), trimMat);
      trimMesh.position.set(dist.cx, mainH + 0.2, dist.cz);
      scene.add(trimMesh);

      // Windows
      const winMat = new THREE.MeshStandardMaterial({ color: '#ffe8aa', emissive: '#ffcc44', emissiveIntensity: 0 });
      for (let wy = 1; wy < mainH - 0.5; wy += 1.6) {
        for (let wx = -4; wx <= 4; wx += 2.5) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), winMat.clone());
          win.position.set(dist.cx + wx, wy, dist.cz + 6.02);
          scene.add(win);
          windows.push(win);
        }
      }

      // Invisible building entrance trigger zone
      const entranceTrigger = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ visible: false }));
      entranceTrigger.rotation.x = -Math.PI / 2;
      entranceTrigger.position.set(dist.cx, 0.1, dist.cz + 8);
      entranceTrigger.userData.isBuildingEntrance = true;
      entranceTrigger.userData.districtId         = dist.id;
      entranceTrigger.userData.districtName       = dist.name;
      scene.add(entranceTrigger);
      collidables.push(entranceTrigger);

      // Nameplate sprite
      const sprite = makeDistrictSprite(dist, dcs.length);
      sprite.position.set(dist.cx, mainH + 4, dist.cz);
      scene.add(sprite);
      nameplateMapRef.current.set(dist.id, sprite);

      // Small surrounding buildings
      const offsets: [number, number][] = [[-15, -12], [15, -12], [-15, 12], [15, 12], [0, -18]];
      const numSmall = Math.min(5, 2 + Math.floor(dcs.length / 4));
      for (let bi = 0; bi < numSmall; bi++) {
        const [bx, bz] = offsets[bi];
        const bH = 2 + Math.random() * 4;
        const bW = 5 + Math.random() * 4;
        const b = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bW),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(dist.color).lerp(new THREE.Color('#ffffff'), 0.2), roughness: 0.7
          }));
        b.position.set(dist.cx + bx, bH / 2, dist.cz + bz);
        b.castShadow = b.receiveShadow = true;
        scene.add(b);
        collidables.push(b);
      }

      // District lamps
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
    }

    // ── Initial NPC placement ──────────────────────────────────────────────────
    const npcMap = npcMeshesRef.current;
    for (const c of contacts) {
      const dist    = DISTRICTS.find(d => d.id === assignDistrict(c))!;
      const mapData = mapState.contactData[c.id] ?? defaultContactMapData(c.id);
      const entry   = spawnNPC(c, mapData, dist, scene);
      entry.group.scale.setScalar(1); // no spawn animation on first load
      delete entry.group.userData.targetScale;
      npcMap.set(c.id, entry);
    }

    // ── Connection lines group ────────────────────────────────────────────────
    const connGroup = new THREE.Group();
    scene.add(connGroup);
    connLinesRef.current = connGroup;

    // ── Rain ──────────────────────────────────────────────────────────────────
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3]     = (Math.random() - 0.5) * 200;
      rainPos[i * 3 + 1] = Math.random() * 50;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat  = new THREE.PointsMaterial({ color: '#aaccff', size: 0.12, transparent: true, opacity: 0 });
    scene.add(new THREE.Points(rainGeo, rainMat));

    // ── Player state ──────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    let yaw = 0, pitch = 0, headBobT = 0, isMoving = false;

    // ── Pointer lock ──────────────────────────────────────────────────────────
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
      if (selectedRef.current) return; // pause mouse look when panel open
      yaw   -= e.movementX * MOUSE_SENS;
      pitch -= e.movementY * MOUSE_SENS;
      pitch  = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, pitch));
    };
    document.addEventListener('mousemove', onMouseMove);

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
    const onKeyUp   = (e: KeyboardEvent) => { keys[e.code] = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ── Collision ─────────────────────────────────────────────────────────────
    const collRay = new THREE.Raycaster();
    collRay.far   = PLAYER_RADIUS + 0.4;
    function blocked(pos: THREE.Vector3, dir: THREE.Vector3): boolean {
      collRay.set(new THREE.Vector3(pos.x, PLAYER_HEIGHT * 0.5, pos.z), dir.normalize());
      return collRay.intersectObjects(collidables).some(h => !h.object.userData.isBuildingEntrance);
    }

    // ── Interaction raycaster ─────────────────────────────────────────────────
    const interactRay = new THREE.Raycaster();
    interactRay.far   = 4;
    const interactDir = new THREE.Vector3(0, 0, -1);

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      css2d.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas);

    // ── Minimap ───────────────────────────────────────────────────────────────
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

    // ── NPC Sync function (exposed via ref) ───────────────────────────────────
    syncNPCsRef.current = (newContacts: Contact[], contactData: Record<string, ContactMapData>) => {
      const map = npcMeshesRef.current;
      const existing = new Set(map.keys());

      // Update or add
      for (const c of newContacts) {
        const distDef = DISTRICTS.find(d => d.id === assignDistrict(c))!;
        const md      = contactData[c.id] ?? defaultContactMapData(c.id);

        if (map.has(c.id)) {
          // Update existing NPC
          const entry = map.get(c.id)!;
          // Refresh name label
          const nameEl = entry.labelDiv.firstElementChild as HTMLElement | null;
          if (nameEl) nameEl.textContent = c.name;
          // Update strength color if changed
          const newStr = deriveStrength(c, md);
          if (newStr !== entry.group.userData.strength) {
            const nc = STRENGTH_BODY[newStr];
            const ne = STRENGTH_EMISSIVE[newStr];
            const ni = STRENGTH_EMIT_INT[newStr];
            entry.bodyMat.color.set(nc);
            entry.bodyMat.emissive.set(ne);
            entry.bodyMat.emissiveIntensity = ni;
            entry.headMat.color.set(nc);
            entry.headMat.emissive.set(ne);
            entry.headMat.emissiveIntensity = ni;
            entry.group.userData.strength = newStr;
          }
          existing.delete(c.id);
        } else {
          // New contact — spawn with animation
          const entry = spawnNPC(c, md, distDef, scene);
          map.set(c.id, entry);
          existing.delete(c.id);
          // Update nameplate
          updateNameplate(distDef, newContacts);
        }
      }

      // Remove deleted contacts
      for (const deletedId of existing) {
        const entry = map.get(deletedId);
        if (entry) {
          entry.group.userData.targetScale = 0; // tween out
        }
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

    // ── Connection lines function (exposed via ref) ───────────────────────────
    updateConnLinesRef.current = (selectedC: Contact | null) => {
      // Clear old lines
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
        const line = new THREE.Line(geo, lineMat);
        connGroup.add(line);
      }
    };

    // ── Day/night ─────────────────────────────────────────────────────────────
    let dayTime = 0.35;
    let weatherTimer = (3 + Math.random() * 5) * 60;
    let fogDensity   = 0.008;
    let prevLampI    = 0;

    function updateDayNight(t: number, dt: number) {
      let skyC: THREE.Color, sunC: THREE.Color;
      let sunI: number, ambI: number, lampI: number;

      if (t < 0.2) {
        skyC = new THREE.Color('#050510'); sunC = new THREE.Color('#000015');
        sunI = 0; ambI = 0.07; lampI = 2.2;
      } else if (t < 0.3) {
        const tt = (t - 0.2) / 0.1;
        skyC = lerpColor(new THREE.Color('#050510'), new THREE.Color('#ff9060'), tt);
        sunC = new THREE.Color('#FDB97D');
        sunI = tt * 0.9; ambI = lerpN(0.07, 0.28, tt); lampI = lerpN(2.2, 0, tt);
      } else if (t < 0.5) {
        const tt = (t - 0.3) / 0.2;
        skyC = lerpColor(new THREE.Color('#ff9060'), new THREE.Color('#4ca8db'), tt);
        sunC = lerpColor(new THREE.Color('#FDB97D'), new THREE.Color('#ffffff'), tt);
        sunI = lerpN(0.9, 1.8, tt); ambI = lerpN(0.28, 0.48, tt); lampI = 0;
      } else if (t < 0.65) {
        const tt = (t - 0.5) / 0.15;
        skyC = lerpColor(new THREE.Color('#4ca8db'), new THREE.Color('#5bbae0'), tt);
        sunC = lerpColor(new THREE.Color('#ffffff'), new THREE.Color('#ffe0b0'), tt);
        sunI = lerpN(1.8, 1.4, tt); ambI = 0.45; lampI = 0;
      } else if (t < 0.8) {
        const tt = (t - 0.65) / 0.15;
        skyC = lerpColor(new THREE.Color('#5bbae0'), new THREE.Color('#ff4020'), tt);
        sunC = lerpColor(new THREE.Color('#ffe0b0'), new THREE.Color('#FF6B35'), tt);
        sunI = lerpN(1.4, 0.2, tt); ambI = lerpN(0.45, 0.1, tt); lampI = lerpN(0, 2.2, tt);
      } else {
        const tt = (t - 0.8) / 0.2;
        skyC = lerpColor(new THREE.Color('#ff4020'), new THREE.Color('#050510'), tt);
        sunC = new THREE.Color('#000015');
        sunI = lerpN(0.2, 0, tt); ambI = lerpN(0.1, 0.07, tt); lampI = 2.2;
      }

      skyMat.color = skyC;
      (scene.fog as THREE.FogExp2).color = skyC;
      sun.color = sunC;
      sun.intensity = sunI;
      ambient.intensity = ambI;
      const sA = (t - 0.5) * Math.PI;
      sun.position.set(Math.cos(sA) * 120, Math.sin(sA) * 120 + 20, 50);

      for (const lamp of lampGroups) {
        const lh = lamp.userData.lampHead  as THREE.Mesh;
        const ll = lamp.userData.lampLight as THREE.PointLight;
        const on = lampI > 0.5;
        if (lh?.material instanceof THREE.MeshStandardMaterial)
          lh.material.emissiveIntensity = on ? 1.0 : 0;
        if (ll) ll.intensity = lampI;
      }

      const winOn = lampI > 0.5;
      for (const w of windows) {
        if (w.material instanceof THREE.MeshStandardMaterial)
          w.material.emissiveIntensity = winOn ? 0.7 : 0;
      }

      const targetFog = isRainingRef.current ? 0.018 : 0.008;
      fogDensity = lerpN(fogDensity, targetFog, dt * 0.5);
      (scene.fog as THREE.FogExp2).density = fogDensity;

      // Night NPC emissive boost (only update when level changes significantly)
      nightLevelRef.current = lampI;
      if (Math.abs(lampI - prevLampI) > 0.1) {
        prevLampI = lampI;
        for (const [, entry] of npcMeshesRef.current) {
          const str = entry.group.userData.strength as RelationshipStrength;
          const base = STRENGTH_EMIT_INT[str];
          const boost = lampI > 0.5 ? base * 2 : base;
          entry.bodyMat.emissiveIntensity = boost;
          entry.headMat.emissiveIntensity = boost;
        }
      }
    }

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId    = 0;
    let lastTime = performance.now();

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

      // Player movement
      if (isLockedRef.current) {
        const spd   = (keys['ShiftLeft'] || keys['ShiftRight']) ? PLAYER_SPEED * PLAYER_RUN : PLAYER_SPEED;
        const mv    = new THREE.Vector3();
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

      // Interaction raycasting
      interactDir.set(0, 0, -1).applyEuler(camera.rotation);
      interactRay.set(camera.position, interactDir);
      const rayHits = interactRay.intersectObjects([...collidables, ...Array.from(npcMeshesRef.current.values()).map(e => e.group)], true);

      // NPC loop
      let closestDist    = Infinity;
      let closestContact: Contact | null = null;
      let nearBuilding:   string | null  = null;
      const q      = searchRef.current.toLowerCase();
      const dFilt  = districtFilterRef.current;
      const filt   = filteredRef.current;

      for (const [, entry] of npcMeshesRef.current) {
        const g = entry.group;

        // Scale tween (spawn/despawn)
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
          continue; // skip other updates while tweening
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
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < NPC_LOOK_DIST) g.rotation.y = Math.atan2(dx, dz);

        // Label distance fade + night glow
        const fade = Math.max(0, Math.min(1, 1 - (dist - 8) / (NPC_FADE_DIST - 8)));
        entry.labelDiv.style.opacity = String(fade);
        if (nightLevelRef.current > 0.5) {
          const str = entry.group.userData.strength as RelationshipStrength;
          const clr  = STRENGTH_BODY[str];
          entry.labelDiv.style.textShadow = `0 0 6px ${clr}`;
        } else {
          entry.labelDiv.style.textShadow = '';
        }

        // Visibility from filters
        const nm  = !q || entry.contact.name.toLowerCase().includes(q) ||
                    (entry.contact.company ?? '').toLowerCase().includes(q);
        const dm  = dFilt === 'all' || entry.districtId === dFilt;
        const fin = filt.has(entry.contact.id);
        g.visible = nm && dm;

        // Highlight ring (search)
        const hasRing = !!g.userData.highlightRing;
        const wantsRing = nm && dm && q.length > 0;
        if (wantsRing && !hasRing) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.06, 8, 16),
            new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.8 })
          );
          ring.rotation.x  = -Math.PI / 2;
          ring.position.y  = 0.05;
          ring.userData.isHighlightRing = true;
          g.add(ring);
          g.userData.highlightRing = ring;
        } else if (!wantsRing && hasRing) {
          g.remove(g.userData.highlightRing);
          delete g.userData.highlightRing;
        }

        // Dim body/head if not in filteredIds or non-matching search
        const opaque = fin && g.visible;
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

      // Building entrance proximity
      if (!closestContact) {
        for (const obj of collidables) {
          if (!obj.userData.isBuildingEntrance) continue;
          const bx = camera.position.x - (obj as THREE.Mesh).position.x;
          const bz = camera.position.z - (obj as THREE.Mesh).position.z;
          const bd = Math.sqrt(bx * bx + bz * bz);
          if (bd < 4) { nearBuilding = obj.userData.districtName as string; break; }
        }
      } else {
        nearBuilding = null;
      }

      nearbyRef.current = closestContact;
      setNearbyContact(closestContact);

      renderer.render(scene, camera);
      css2d.render(scene, camera);
      drawMinimap();
    }

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      resizeObs.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown',   onKeyDown);
      document.removeEventListener('keyup',     onKeyUp);
      if (css2d.domElement.parentNode) css2d.domElement.parentNode.removeChild(css2d.domElement);
      syncNPCsRef.current        = null;
      updateConnLinesRef.current = null;
      sceneRef.current           = null;
      npcMeshesRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once; contacts synced via syncNPCsRef

  // ─── RENDER ───────────────────────────────────────────────────────────────

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
            background: 'rgba(10,15,30,0.9)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 14, padding: '22px 40px', color: '#e2e8f0', textAlign: 'center',
            backdropFilter: 'blur(10px)',
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

      {/* Interaction prompts */}
      {isLocked && (nearbyContact || null) && !selectedContact && (
        <div style={{
          position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8, padding: '6px 18px', color: '#e2e8f0', fontSize: 13,
          pointerEvents: 'none', transition: 'opacity 0.15s',
        }}>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>[E]</span> Talk to {nearbyContact?.name}
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

      {/* Contact detail panel — ContactMapPopup */}
      {selectedContact && selectedMapData && (
        <div style={{
          position: 'absolute', top: 50, right: 16, width: 320,
          maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
          zIndex: 20,
          animation: 'slideInRight 0.22s ease-out',
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

      {/* Legend chips (bottom-right) */}
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
        </div>
      )}
    </div>
  );
}
