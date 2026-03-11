/**
 * NetworkView3D — First-person 3D city built in Three.js.
 * Your CRM contacts live here as NPCs, grouped into districts by company/relationship.
 * WASD to walk, mouse to look (pointer lock), E to view a contact, Escape to exit.
 */
import React, { useEffect, useRef, useState } from 'react';
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
} from '../../types';
import { defaultContactMapData } from '../../utils/networkingMap';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PLAYER_HEIGHT    = 1.8;
const PLAYER_SPEED     = 10;
const PLAYER_RUN       = 1.6;
const PLAYER_RADIUS    = 0.5;
const MOUSE_SENS       = 0.0018;
const NPC_INTERACT     = 3.2;
const NPC_LOOK_DIST    = 10;
const HEAD_BOB_SPEED   = 5;
const HEAD_BOB_AMP     = 0.06;
const DAY_CYCLE        = 600;   // 10 real minutes
const RAIN_COUNT       = 2500;

// ─── DISTRICT CONFIG ──────────────────────────────────────────────────────────

interface DistrictDef {
  id: string; name: string;
  cx: number; cz: number;
  color: string; trim: string;
  w: number; d: number;
  mmColor: string; // minimap color
}

const DISTRICTS: DistrictDef[] = [
  { id: 'byu',          name: 'BYU District',    cx:   0, cz: -80, color: '#8B4513', trim: '#D2691E', w: 60, d: 50, mmColor: '#9B5523' },
  { id: 'vanta',        name: 'Vanta HQ',         cx:  80, cz:   0, color: '#1a1a2e', trim: '#0066ff', w: 60, d: 50, mmColor: '#2244aa' },
  { id: 'rockcanyonai', name: 'Rock Canyon AI',   cx:  60, cz:  80, color: '#d8d8e8', trim: '#00d4ff', w: 60, d: 50, mmColor: '#99ccdd' },
  { id: 'neighborhood', name: 'Neighborhood',     cx: -80, cz:   0, color: '#D2B48C', trim: '#8B7355', w: 60, d: 50, mmColor: '#D2B48C' },
  { id: 'chapel',       name: 'Chapel District',  cx: -60, cz: -70, color: '#F0EEE8', trim: '#B8B8B0', w: 50, d: 40, mmColor: '#DDDDD5' },
  { id: 'outskirts',    name: 'Outskirts',         cx:   0, cz:  80, color: '#909090', trim: '#606060', w: 70, d: 55, mmColor: '#808080' },
];

function assignDistrict(c: Contact): string {
  const co  = (c.company      ?? '').toLowerCase();
  const rel = (c.relationship ?? '').toLowerCase();
  const tags = c.tags as string[];

  if (co.includes('byu') || co.includes('brigham') || rel.includes('school') || rel.includes('university'))
    return 'byu';
  if (co.includes('vanta') || co.includes('marketing'))
    return 'vanta';
  if (co.includes('rock canyon') || co.includes('ai') || co.includes('tech') || co.includes('software'))
    return 'rockcanyonai';
  if (tags.includes('family') || rel.includes('family') || rel.includes('parent') || rel.includes('sibling'))
    return 'neighborhood';
  if (tags.includes('church') || rel.includes('church') || rel.includes('lds') || rel.includes('bishop') ||
      co.includes('church') || co.includes('lds'))
    return 'chapel';
  return 'outskirts';
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  contacts: Contact[];
  projects: Project[];
  mapState: NetworkingMapState;
  filteredIds: Set<string>;
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

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(lerpN(a.r, b.r, t), lerpN(a.g, b.g, t), lerpN(a.b, b.b, t));
}

function makeLamp(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const poleMat = new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.6, roughness: 0.4 });
  const pole    = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), poleMat);
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

function makeNPC(contact: Contact, districtColor: string, x: number, z: number): THREE.Group {
  const g    = new THREE.Group();
  g.position.set(x, 0, z);

  const base  = new THREE.Color(districtColor);
  const body  = base.clone().lerp(new THREE.Color('#ffffff'), 0.3);
  const mat   = new THREE.MeshStandardMaterial({ color: body, roughness: 0.8 });
  const matH  = mat.clone();
  matH.color  = base.clone().lerp(new THREE.Color('#ffddbb'), 0.5);

  const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.1, 10), mat);
  bodyM.position.y = 0.7;
  bodyM.castShadow = true;
  g.add(bodyM);

  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), matH);
  headM.position.y = 1.65;
  headM.castShadow = true;
  g.add(headM);

  // Floating CSS2D label
  const div = document.createElement('div');
  div.textContent = contact.name;
  Object.assign(div.style, {
    background:   'rgba(0,0,0,0.72)',
    color:        '#e2e8f0',
    padding:      '2px 8px',
    borderRadius: '10px',
    fontSize:     '11px',
    fontFamily:   'system-ui,sans-serif',
    pointerEvents:'none',
    whiteSpace:   'nowrap',
    border:       '1px solid rgba(255,255,255,0.12)',
    userSelect:   'none',
  });
  const label = new CSS2DObject(div);
  label.position.set(0, 2.45, 0);
  g.add(label);

  g.userData.contact   = contact;
  g.userData.bobOffset = Math.random() * Math.PI * 2;
  return g;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function NetworkView3D({
  contacts,
  filteredIds,
  onNavigateToCRM,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const labelRef    = useRef<HTMLDivElement>(null);
  const minimapRef  = useRef<HTMLCanvasElement>(null);

  const [isLocked,        setIsLocked]        = useState(false);
  const [nearbyContact,   setNearbyContact]   = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search,          setSearch]          = useState('');
  const [districtFilter,  setDistrictFilter]  = useState('all');
  const [isRaining,       setIsRaining]       = useState(false);
  const [shownCount,      setShownCount]      = useState(0);

  // Refs that the animation loop reads without re-render cost
  const filteredRef       = useRef(filteredIds);
  const searchRef         = useRef('');
  const districtFilterRef = useRef('all');
  const isRainingRef      = useRef(false);
  const isLockedRef       = useRef(false);
  const nearbyRef         = useRef<Contact | null>(null);
  const selectedRef       = useRef<Contact | null>(null);
  const npcMeshesRef      = useRef<{ group: THREE.Group; contact: Contact; districtId: string }[]>([]);

  // Keep refs current
  useEffect(() => { filteredRef.current = filteredIds; }, [filteredIds]);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { districtFilterRef.current = districtFilter; }, [districtFilter]);
  useEffect(() => { isRainingRef.current = isRaining; }, [isRaining]);

  // E key interaction
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
      const nameOk = !q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q);
      const distOk = districtFilter === 'all' || assignDistrict(c) === districtFilter;
      return nameOk && distOk;
    }).length;
    setShownCount(shown);
  }, [contacts, search, districtFilter]);

  // ── MAIN THREE.JS SETUP ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas     = canvasRef.current!;
    const labelDiv   = labelRef.current!;
    const mmCanvas   = minimapRef.current!;
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
    scene.fog   = new THREE.FogExp2(0x87ceeb, 0.008);

    // ── Sky ──
    const skyMat  = new THREE.MeshBasicMaterial({ color: '#87ceeb', side: THREE.BackSide });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(290, 16, 16), skyMat);
    scene.add(skyMesh);

    // ── Lighting ──
    const ambient  = new THREE.AmbientLight('#ffffff', 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 400;
    sun.shadow.camera.left   = -160;
    sun.shadow.camera.right  =  160;
    sun.shadow.camera.top    =  160;
    sun.shadow.camera.bottom = -160;
    scene.add(sun);

    const hemi = new THREE.HemisphereLight('#87ceeb', '#3d5a3e', 0.4);
    scene.add(hemi);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 550);
    camera.position.set(0, PLAYER_HEIGHT, 5);

    // ── Ground ──
    const groundMat  = new THREE.MeshStandardMaterial({ color: '#3a5c2a', roughness: 1 });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
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
      // Sidewalks
      for (const side of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, length), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.rotation.z = rotY;
        const offset = (width / 2 + 0.75) * side;
        sw.position.set(cx + Math.cos(rotY) * offset, 0.02, cz + Math.sin(rotY) * offset);
        scene.add(sw);
      }
    }

    // Main boulevards
    addRoad(0,   0, 8, 260);       // N-S
    addRoad(0,   0, 260, 8, Math.PI / 2); // E-W
    // Secondary connectors
    addRoad(0,   -44, 6, 50);      // to BYU
    addRoad(0,    44, 6, 50);      // to Outskirts
    addRoad( 44,   0, 6, 50, Math.PI / 2); // to Vanta
    addRoad(-44,   0, 6, 50, Math.PI / 2); // to Neighborhood
    addRoad(-32, -38, 5, 80, Math.PI * 0.22); // to Chapel
    addRoad( 32,  38, 5, 80, Math.PI * 0.22); // to Rock Canyon

    // ── Central Plaza ──
    const plazaFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.MeshStandardMaterial({ color: '#b8b4ae', roughness: 0.7 })
    );
    plazaFloor.rotation.x = -Math.PI / 2;
    plazaFloor.position.set(0, 0.02, 0);
    plazaFloor.receiveShadow = true;
    scene.add(plazaFloor);

    // Obelisk
    const obelisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.6, 9, 8),
      new THREE.MeshStandardMaterial({ color: '#c8a86b', emissive: '#c8a86b', emissiveIntensity: 0.2, roughness: 0.4 })
    );
    obelisk.position.set(0, 4.5, 0);
    obelisk.castShadow = true;
    scene.add(obelisk);

    // Plaza benches
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
    const windows: THREE.Mesh[] = [];

    // Group contacts by district
    const distContacts = new Map<string, Contact[]>();
    for (const d of DISTRICTS) distContacts.set(d.id, []);
    for (const c of contacts) distContacts.get(assignDistrict(c))?.push(c);

    for (const dist of DISTRICTS) {
      const dcs  = distContacts.get(dist.id) ?? [];
      const mainH = Math.max(4, 2 + dcs.length * 0.5);

      // District ground patch
      const dGround = new THREE.Mesh(
        new THREE.PlaneGeometry(dist.w, dist.d),
        new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.9 })
      );
      dGround.rotation.x = -Math.PI / 2;
      dGround.position.set(dist.cx, 0.015, dist.cz);
      dGround.receiveShadow = true;
      scene.add(dGround);

      // Main building
      const mainMat = new THREE.MeshStandardMaterial({ color: dist.color, roughness: 0.55, metalness: 0.05 });
      const mainBld = new THREE.Mesh(new THREE.BoxGeometry(12, mainH, 12), mainMat);
      mainBld.position.set(dist.cx, mainH / 2, dist.cz);
      mainBld.castShadow  = true;
      mainBld.receiveShadow = true;
      mainBld.userData.district = dist.id;
      scene.add(mainBld);
      collidables.push(mainBld);

      // Roof trim
      const trimMat = new THREE.MeshStandardMaterial({ color: dist.trim, roughness: 0.4, metalness: 0.3 });
      const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.4, 13.2), trimMat);
      trimMesh.position.set(dist.cx, mainH + 0.2, dist.cz);
      scene.add(trimMesh);

      // Windows (front face)
      const winMat = new THREE.MeshStandardMaterial({
        color: '#ffe8aa', emissive: '#ffcc44', emissiveIntensity: 0,
      });
      for (let wy = 1; wy < mainH - 0.5; wy += 1.6) {
        for (let wx = -4; wx <= 4; wx += 2.5) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), winMat.clone());
          win.position.set(dist.cx + wx, wy, dist.cz + 6.02);
          scene.add(win);
          windows.push(win);
        }
      }

      // Nameplate sprite
      const nc      = document.createElement('canvas');
      nc.width       = 256; nc.height = 64;
      const nctx    = nc.getContext('2d')!;
      nctx.fillStyle = 'rgba(0,0,0,0.65)';
      nctx.beginPath();
      (nctx as any).roundRect?.(0, 0, 256, 64, 8);
      nctx.fill();
      nctx.fillStyle = dist.trim;
      nctx.font      = 'bold 20px system-ui';
      nctx.textAlign = 'center';
      nctx.fillText(dist.name, 128, 26);
      nctx.fillStyle = '#aaaaaa';
      nctx.font      = '13px system-ui';
      nctx.fillText(`${dcs.length} contact${dcs.length !== 1 ? 's' : ''}`, 128, 50);
      const nSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), transparent: true }));
      nSprite.scale.set(16, 4, 1);
      nSprite.position.set(dist.cx, mainH + 4, dist.cz);
      scene.add(nSprite);

      // Smaller surrounding buildings
      const offsets: [number, number][] = [[-15, -12], [15, -12], [-15, 12], [15, 12], [0, -18]];
      const numSmall = Math.min(5, 2 + Math.floor(dcs.length / 4));
      for (let bi = 0; bi < numSmall; bi++) {
        const [bx, bz] = offsets[bi];
        const bH = 2 + Math.random() * 4;
        const bW = 5 + Math.random() * 4;
        const bGeo = new THREE.BoxGeometry(bW, bH, bW);
        const bMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(dist.color).lerp(new THREE.Color('#ffffff'), 0.2),
          roughness: 0.7,
        });
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.set(dist.cx + bx, bH / 2, dist.cz + bz);
        bMesh.castShadow    = true;
        bMesh.receiveShadow = true;
        scene.add(bMesh);
        collidables.push(bMesh);
      }

      // Street lamps at district corners
      const lCorners: [number, number][] = [
        [dist.cx - dist.w / 2 + 3, dist.cz - dist.d / 2 + 3],
        [dist.cx + dist.w / 2 - 3, dist.cz - dist.d / 2 + 3],
        [dist.cx - dist.w / 2 + 3, dist.cz + dist.d / 2 - 3],
        [dist.cx + dist.w / 2 - 3, dist.cz + dist.d / 2 - 3],
      ];
      for (const [lx, lz] of lCorners) {
        const lamp = makeLamp(lx, lz);
        scene.add(lamp);
        lampGroups.push(lamp);
      }
    }

    // ── NPCs ──────────────────────────────────────────────────────────────────
    const npcMeshes: { group: THREE.Group; contact: Contact; districtId: string }[] = [];

    for (const dist of DISTRICTS) {
      const dcs      = distContacts.get(dist.id) ?? [];
      const visible  = dcs.slice(0, 10);
      const distCol  = dist.color;

      for (let ni = 0; ni < visible.length; ni++) {
        const c      = visible[ni];
        const angle  = (ni / Math.max(visible.length, 1)) * Math.PI * 2;
        const radius = 6 + (ni % 3) * 2;
        const nx     = dist.cx + Math.cos(angle) * radius;
        const nz     = dist.cz + Math.sin(angle) * radius;
        const grp    = makeNPC(c, distCol, nx, nz);
        scene.add(grp);
        npcMeshes.push({ group: grp, contact: c, districtId: dist.id });
      }
    }
    npcMeshesRef.current = npcMeshes;

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
    const rainPts  = new THREE.Points(rainGeo, rainMat);
    scene.add(rainPts);

    // ── Player state ──────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    let yaw   = 0;
    let pitch = 0;
    let headBobT = 0;
    let isMoving = false;

    // ── Pointer lock ──────────────────────────────────────────────────────────
    const onCanvasClick = () => {
      if (!isLockedRef.current) canvas.requestPointerLock();
    };
    canvas.addEventListener('click', onCanvasClick);

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      isLockedRef.current = locked;
      setIsLocked(locked);
    };
    document.addEventListener('pointerlockchange', onLockChange);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yaw   -= e.movementX * MOUSE_SENS;
      pitch -= e.movementY * MOUSE_SENS;
      pitch  = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, pitch));
    };
    document.addEventListener('mousemove', onMouseMove);

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
    const onKeyUp   = (e: KeyboardEvent) => { keys[e.code] = false; };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ── Collision raycaster ───────────────────────────────────────────────────
    const collRay = new THREE.Raycaster();
    collRay.far   = PLAYER_RADIUS + 0.4;
    function blocked(pos: THREE.Vector3, dir: THREE.Vector3): boolean {
      collRay.set(new THREE.Vector3(pos.x, PLAYER_HEIGHT * 0.5, pos.z), dir.normalize());
      return collRay.intersectObjects(collidables).length > 0;
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      css2d.setSize(w, h);
    };
    const resizeObs = new ResizeObserver(onResize);
    resizeObs.observe(canvas);

    // ── Minimap ───────────────────────────────────────────────────────────────
    mmCanvas.width  = 180;
    mmCanvas.height = 180;
    const mmCtx = mmCanvas.getContext('2d')!;
    const WORLD_SCALE = 90 / 180; // world ±180 → minimap 0-180

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

      // Roads
      mmCtx.strokeStyle = '#444';
      mmCtx.lineWidth   = 2;
      mmCtx.beginPath(); mmCtx.moveTo(90, 2);   mmCtx.lineTo(90, 178); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(2, 90);   mmCtx.lineTo(178, 90); mmCtx.stroke();

      // Districts
      for (const d of DISTRICTS) {
        const mx = 90 + d.cx * WORLD_SCALE;
        const mz = 90 + d.cz * WORLD_SCALE;
        mmCtx.fillStyle   = d.mmColor + '90';
        mmCtx.strokeStyle = d.mmColor;
        mmCtx.lineWidth   = 1;
        const rw = d.w * WORLD_SCALE;
        const rd = d.d * WORLD_SCALE;
        mmCtx.beginPath();
        mmCtx.rect(mx - rw / 2, mz - rd / 2, rw, rd);
        mmCtx.fill();
        mmCtx.stroke();
      }

      // Player arrow
      const px = 90 + camera.position.x * WORLD_SCALE;
      const pz = 90 + camera.position.z * WORLD_SCALE;
      mmCtx.save();
      mmCtx.translate(px, pz);
      mmCtx.rotate(-yaw);
      mmCtx.fillStyle = '#ffffff';
      mmCtx.beginPath();
      mmCtx.moveTo(0, -7);
      mmCtx.lineTo(4, 5);
      mmCtx.lineTo(0, 2);
      mmCtx.lineTo(-4, 5);
      mmCtx.closePath();
      mmCtx.fill();
      mmCtx.restore();

      // Compass
      mmCtx.fillStyle  = 'rgba(255,255,255,0.7)';
      mmCtx.font       = 'bold 10px system-ui';
      mmCtx.textAlign  = 'center';
      mmCtx.fillText('N', 90, 13);
      mmCtx.restore();
    }

    // ── Day/night ─────────────────────────────────────────────────────────────
    let dayTime = 0.35; // start mid-morning
    let weatherTimer = (3 + Math.random() * 5) * 60;
    let fogDensity = 0.008;

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

      skyMat.color       = skyC;
      (scene.fog as THREE.FogExp2).color = skyC;
      sun.color          = sunC;
      sun.intensity      = sunI;
      ambient.intensity  = ambI;

      const sunAngle = (t - 0.5) * Math.PI;
      sun.position.set(Math.cos(sunAngle) * 120, Math.sin(sunAngle) * 120 + 20, 50);

      for (const lamp of lampGroups) {
        const lh  = lamp.userData.lampHead  as THREE.Mesh;
        const ll  = lamp.userData.lampLight as THREE.PointLight;
        const on  = lampI > 0.5;
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
      fogDensity       = lerpN(fogDensity, targetFog, dt * 0.5);
      (scene.fog as THREE.FogExp2).density = fogDensity;
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

      // Weather scheduler
      weatherTimer -= delta;
      if (weatherTimer <= 0) {
        const next = !isRainingRef.current;
        setIsRaining(next);
        isRainingRef.current = next;
        weatherTimer = (3 + Math.random() * 5) * 60;
      }

      // Rain animation
      const tgtOpacity = isRainingRef.current ? 0.55 : 0;
      rainMat.opacity  = lerpN(rainMat.opacity, tgtOpacity, delta * 2);
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
        const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? PLAYER_SPEED * PLAYER_RUN : PLAYER_SPEED;
        const moveDir = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp'])   moveDir.z -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveDir.z += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveDir.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight'])moveDir.x += 1;

        isMoving = moveDir.lengthSq() > 0;
        if (isMoving) {
          moveDir.normalize().applyEuler(new THREE.Euler(0, yaw, 0));
          // Separate X and Z collision
          const moveX = new THREE.Vector3(Math.sign(moveDir.x), 0, 0);
          const moveZ = new THREE.Vector3(0, 0, Math.sign(moveDir.z));
          const curPos = camera.position.clone();
          if (Math.abs(moveDir.x) > 0.01 && !blocked(curPos, moveX))
            camera.position.x += moveDir.x * speed * delta;
          if (Math.abs(moveDir.z) > 0.01 && !blocked(camera.position, moveZ))
            camera.position.z += moveDir.z * speed * delta;
          // World bounds
          camera.position.x = Math.max(-180, Math.min(180, camera.position.x));
          camera.position.z = Math.max(-180, Math.min(180, camera.position.z));
        }
      } else {
        isMoving = false;
      }

      // Camera rotation
      camera.rotation.order = 'YXZ';
      camera.rotation.y     = yaw;
      camera.rotation.x     = pitch;

      // Head bob
      if (isMoving && isLockedRef.current) {
        headBobT += delta * HEAD_BOB_SPEED;
        camera.position.y = PLAYER_HEIGHT + Math.sin(headBobT) * HEAD_BOB_AMP;
      } else {
        camera.position.y = lerpN(camera.position.y, PLAYER_HEIGHT, delta * 8);
      }

      // NPC updates
      let closestDist    = Infinity;
      let closestContact: Contact | null = null;

      for (const npc of npcMeshesRef.current) {
        const g = npc.group;
        if (!g.parent) continue;

        // Idle bob
        g.children.forEach(ch => {
          if (ch instanceof THREE.Mesh) {
            // don't move the label
          }
        });
        const bobOffset = g.userData.bobOffset as number;
        const bobY = Math.sin(now * 0.0009 + bobOffset) * 0.07;
        // Apply bob to body/head but not label
        g.children.forEach((ch, idx) => {
          if (idx < 2 && ch instanceof THREE.Mesh) {
            ch.position.y = (idx === 0 ? 0.7 : 1.65) + bobY;
          }
        });

        // Billboard (Y-axis)
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        const distP = Math.sqrt(dx * dx + dz * dz);
        if (distP < NPC_LOOK_DIST) {
          g.rotation.y = Math.atan2(dx, dz);
        }

        // Filter visibility
        const q       = searchRef.current.toLowerCase();
        const dFilter = districtFilterRef.current;
        const nm      = !q || npc.contact.name.toLowerCase().includes(q) ||
                        (npc.contact.company ?? '').toLowerCase().includes(q);
        const dm      = dFilter === 'all' || npc.districtId === dFilter;
        const fm      = filteredRef.current.has(npc.contact.id);
        g.visible     = nm && dm;

        // Dim if not in filtered set
        g.children.forEach((ch, idx) => {
          if (idx < 2 && ch instanceof THREE.Mesh) {
            const m = ch.material as THREE.MeshStandardMaterial;
            if (m.transparent !== !fm) {
              m.transparent = !fm;
              m.opacity     = fm ? 1 : 0.25;
              m.needsUpdate = true;
            }
          }
        });

        // Proximity
        if (g.visible && distP < NPC_INTERACT && distP < closestDist) {
          closestDist    = distP;
          closestContact = npc.contact;
        }
      }

      nearbyRef.current = closestContact;
      // Only update React state when value changes (avoid re-renders every frame)
      if (closestContact?.id !== (nearbyRef.current?.id)) {
        setNearbyContact(closestContact);
      }
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: contacts are read via ref; scene built once

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  const selectedDistrict = selectedContact ? DISTRICTS.find(d => d.id === assignDistrict(selectedContact)) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>

      {/* 3D canvas */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* CSS2D label mount */}
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
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
              <b style={{ color: '#e2e8f0' }}>WASD</b> move &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Mouse</b> look &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Shift</b> run<br />
              <b style={{ color: '#e2e8f0' }}>E</b> interact with contacts &nbsp;·&nbsp;
              <b style={{ color: '#e2e8f0' }}>Esc</b> exit
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

      {/* [E] interact prompt */}
      {isLocked && nearbyContact && !selectedContact && (
        <div style={{
          position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8, padding: '6px 18px', color: '#e2e8f0', fontSize: 13,
          pointerEvents: 'none',
        }}>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>[E]</span> View {nearbyContact.name}
        </div>
      )}

      {/* Top search/filter bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flex: 1, maxWidth: 240,
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
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* District filter */}
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

        {/* Reset */}
        {(search || districtFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDistrictFilter('all'); }}
            style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 8, color: '#94a3b8', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
            }}
          >Reset</button>
        )}

        {/* Count */}
        <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          Showing {shownCount} of {contacts.length}
        </span>

        {/* Weather toggle */}
        <button
          onClick={() => setIsRaining(r => { isRainingRef.current = !r; return !r; })}
          title={isRaining ? 'Stop rain' : 'Start rain'}
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
        position: 'absolute', bottom: 16, left: 16,
        borderRadius: '50%', overflow: 'hidden',
        boxShadow: '0 0 0 2px rgba(100,180,255,0.35)',
        zIndex: 10,
      }}>
        <canvas ref={minimapRef} width={180} height={180} style={{ display: 'block' }} />
      </div>

      {/* Contact detail panel */}
      {selectedContact && (
        <div style={{
          position: 'absolute', top: 50, right: 16,
          width: 300, maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
          background: 'rgba(10,15,30,0.95)', border: '1px solid rgba(100,180,255,0.2)',
          borderRadius: 12, padding: 20, zIndex: 20, backdropFilter: 'blur(12px)',
          color: '#e2e8f0',
        }}>
          <button
            onClick={() => { setSelectedContact(null); selectedRef.current = null; }}
            style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
          >
            <X size={16} />
          </button>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: `hsl(${selectedContact.name.charCodeAt(0) * 7 % 360},55%,38%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
            }}>
              {selectedContact.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedContact.name}</div>
              {selectedContact.company && (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>{selectedContact.company}</div>
              )}
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
            {selectedContact.relationship && (
              <div><span style={{ color: '#64748b' }}>Relationship: </span>{selectedContact.relationship}</div>
            )}
            {selectedContact.email && (
              <div>
                <span style={{ color: '#64748b' }}>Email: </span>
                <a href={`mailto:${selectedContact.email}`} style={{ color: '#60a5fa' }}>{selectedContact.email}</a>
              </div>
            )}
            {selectedContact.phone && (
              <div><span style={{ color: '#64748b' }}>Phone: </span>{selectedContact.phone}</div>
            )}
            {selectedContact.lastContacted && (
              <div><span style={{ color: '#64748b' }}>Last contacted: </span>{selectedContact.lastContacted}</div>
            )}
            {selectedContact.notes && (
              <div>
                <span style={{ color: '#64748b' }}>Notes: </span>
                <span style={{ color: '#cbd5e1' }}>{selectedContact.notes}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => { setSelectedContact(null); selectedRef.current = null; onNavigateToCRM(); }}
            style={{
              marginTop: 16, width: '100%',
              background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.4)',
              borderRadius: 8, color: '#60a5fa', padding: 8, cursor: 'pointer', fontSize: 12,
            }}
          >
            Edit in CRM
          </button>

          {/* District badge */}
          {selectedDistrict && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#94a3b8',
              }}>
                <MapPin size={10} />
                {selectedDistrict.name}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
