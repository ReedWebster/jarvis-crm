/**
 * WorldView — Standalone interactive 3D city.
 * No contact data, no props. Pure Three.js procedural city.
 *
 * Controls:
 *   Left-drag   → rotate azimuth
 *   Right-drag  → pan
 *   Scroll      → zoom
 *   Click       → select building (shows name)
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

// ─── ZONE TYPES ───────────────────────────────────────────────────────────────

type ZoneType = 'downtown' | 'midrise' | 'mixed' | 'low' | 'park' | 'water';

const ZONE_COLORS: Record<ZoneType, string> = {
  downtown: '#7B9EC8',
  midrise:  '#9BBCD8',
  mixed:    '#B8C8D8',
  low:      '#C8D8C8',
  park:     '#A8C8A0',
  water:    '#7098B8',
};

interface BlockInfo {
  col: number; row: number;  // grid coords
  cx:  number; cz: number;   // world center
  zone: ZoneType;
  label: string;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function WorldView() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null);

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
    // NW sun angle (matches reference image cast shadows going SE)
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
    const orbitPhi  = 1.08; // ~62° from zenith

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
    scene.add(ground);

    // ── Materials (shared, cloned per building) ───────────────────────────────
    const mats = makeArchMats();

    // ── City grid parameters ───────────────────────────────────────────────────
    // 9x9 grid of blocks, each block 60x60 units, separated by 8-unit roads
    const GRID_N    = 9;        // 9 columns and rows
    const BLOCK_SIZE = 58;      // buildable inner area per block
    const STEP       = 66;      // block center-to-center (58 + 8 road)
    const HALF       = Math.floor(GRID_N / 2); // 4 — grid goes -4..+4

    // Road materials
    const roadMat  = new THREE.MeshStandardMaterial({ color: '#1C1C1E', roughness: 0.97 });
    const swalkMat = new THREE.MeshStandardMaterial({ color: '#D8DDE3', roughness: 0.90 });
    const dashMat  = new THREE.MeshStandardMaterial({ color: '#F5E642', roughness: 0.60 });

    const ROAD_W = 8;
    const GRID_EXTENT = HALF * STEP + STEP / 2;

    // N-S avenues
    for (let col = -HALF; col <= HALF; col++) {
      const x = col * STEP;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, GRID_EXTENT * 2 + ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.01, 0);
      road.receiveShadow = true;
      scene.add(road);
      // Sidewalks
      for (const s of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, GRID_EXTENT * 2), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(x + s * (ROAD_W / 2 + 0.9), 0.015, 0);
        sw.receiveShadow = true;
        scene.add(sw);
      }
      // Center dashes
      for (let z = -GRID_EXTENT + 4; z < GRID_EXTENT; z += 6) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.018, z);
        scene.add(d);
      }
    }
    // E-W streets
    for (let row = -HALF; row <= HALF; row++) {
      const z = row * STEP;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2 + ROAD_W, ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.01, z);
      road.receiveShadow = true;
      scene.add(road);
      for (const s of [-1, 1]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(GRID_EXTENT * 2, 1.8), swalkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(0, 0.015, z + s * (ROAD_W / 2 + 0.9));
        sw.receiveShadow = true;
        scene.add(sw);
      }
      for (let x = -GRID_EXTENT + 4; x < GRID_EXTENT; x += 6) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.18), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.018, z);
        scene.add(d);
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

    // Determine zone by distance from center (in grid units)
    function getZone(col: number, row: number): ZoneType {
      const dist = Math.sqrt(col * col + row * row);
      // Park blocks in specific positions
      if ((col === 2 && row === -2) || (col === -3 && row === 1) || (col === 1 && row === 3)) return 'park';
      // Water on the far north edge
      if (row === -HALF || (row === -HALF + 1 && Math.abs(col) >= 3)) return 'water';
      if (dist <= 1.0) return 'downtown';
      if (dist <= 2.2) return 'midrise';
      if (dist <= 3.2) return 'mixed';
      return 'low';
    }

    // Park material
    const parkMat = new THREE.MeshStandardMaterial({ color: '#C8D8C0', roughness: 0.95 });
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

        // Block ground patch
        const patchMat = zone === 'park'  ? parkMat
                       : zone === 'water' ? waterMat
                       : new THREE.MeshStandardMaterial({ color: '#D8E4EE', roughness: 0.9 });
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK_SIZE - 2, BLOCK_SIZE - 2), patchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(cx, zone === 'water' ? -0.2 : 0.015, cz);
        patch.receiveShadow = true;
        scene.add(patch);

        if (zone === 'park') {
          // Trees only
          const rng = seededRandom(`park-${col}-${row}`);
          for (let t = 0; t < 12; t++) {
            const tx = cx + (rng() - 0.5) * (BLOCK_SIZE - 10);
            const tz = cz + (rng() - 0.5) * (BLOCK_SIZE - 10);
            scene.add(makeTree(tx, tz, seededRandom(`pt-${t}-${col}-${row}`)));
          }
          continue;
        }
        if (zone === 'water') {
          continue; // just water plane
        }

        // ── Place buildings in the block ──────────────────────────────────────
        const rng = seededRandom(`block-${col}-${row}`);
        const BUILD_AREA = BLOCK_SIZE - 8; // leave 4 unit margin from roads

        // Choose building layout based on zone
        type Arch = 'tower' | 'podiumTower' | 'midrise' | 'slab' | 'campus' | 'spire' | 'residential' | 'warehouse';

        type PlacementDef = { ox: number; oz: number; arch: Arch; hMult: number };
        let placements: PlacementDef[] = [];

        if (zone === 'downtown') {
          // Dense towers: 1 landmark center + 6-8 surrounding
          placements = [
            { ox: 0,            oz: 0,           arch: rng() > 0.5 ? 'podiumTower' : 'spire', hMult: 1.0 },
            { ox: -16,          oz: -12,          arch: 'tower',       hMult: 0.75 },
            { ox:  16,          oz: -12,          arch: 'tower',       hMult: 0.80 },
            { ox: -16,          oz:  12,          arch: 'tower',       hMult: 0.70 },
            { ox:  16,          oz:  12,          arch: 'midrise',     hMult: 0.65 },
            { ox:  0,           oz: -22,          arch: 'midrise',     hMult: 0.60 },
            { ox:  0,           oz:  22,          arch: 'midrise',     hMult: 0.55 },
            { ox: -22,          oz:   0,          arch: 'slab',        hMult: 0.50 },
            { ox:  22,          oz:   0,          arch: 'midrise',     hMult: 0.55 },
          ];
        } else if (zone === 'midrise') {
          placements = [
            { ox:  0, oz:  0,  arch: 'midrise', hMult: 0.85 },
            { ox: -14, oz: -10, arch: 'slab',   hMult: 0.70 },
            { ox:  14, oz: -10, arch: 'midrise', hMult: 0.75 },
            { ox: -14, oz:  12, arch: 'midrise', hMult: 0.65 },
            { ox:  14, oz:  12, arch: rng() > 0.5 ? 'campus' : 'midrise', hMult: 0.60 },
            { ox:  0, oz: -20,  arch: 'slab',   hMult: 0.55 },
            { ox:  0, oz:  20,  arch: 'midrise', hMult: 0.50 },
          ];
        } else if (zone === 'mixed') {
          placements = [
            { ox:  0, oz:  0,   arch: rng() > 0.5 ? 'campus' : 'midrise', hMult: 0.60 },
            { ox: -14, oz: -10, arch: 'residential', hMult: 0.55 },
            { ox:  14, oz: -10, arch: 'midrise',     hMult: 0.50 },
            { ox: -14, oz:  10, arch: 'residential', hMult: 0.45 },
            { ox:  14, oz:  10, arch: 'residential', hMult: 0.45 },
            { ox:  0,  oz: -20, arch: 'slab',        hMult: 0.40 },
          ];
        } else { // low
          placements = [
            { ox:   0, oz:   0, arch: 'residential', hMult: 0.40 },
            { ox: -14, oz: -10, arch: 'residential', hMult: 0.35 },
            { ox:  14, oz: -10, arch: 'residential', hMult: 0.35 },
            { ox:  -6, oz:  14, arch: rng() > 0.6 ? 'warehouse' : 'residential', hMult: 0.30 },
            { ox:  12, oz:  14, arch: 'residential', hMult: 0.30 },
          ];
        }

        // Height ranges per zone
        const H_RANGES: Record<ZoneType, [number, number]> = {
          downtown: [20, 48],
          midrise:  [8, 18],
          mixed:    [4, 11],
          low:      [3, 7],
          park:     [0, 0],
          water:    [0, 0],
        };
        const [hMin, hMax] = H_RANGES[zone];

        for (const p of placements) {
          // Add small seeded jitter so grid doesn't look machine-stamped
          const jx = (rng() - 0.5) * 4;
          const jz = (rng() - 0.5) * 4;
          const wx = cx + p.ox + jx;
          const wz = cz + p.oz + jz;

          // Keep within block bounds
          const halfBA = BUILD_AREA / 2;
          if (Math.abs(wx - cx) > halfBA - 6 || Math.abs(wz - cz) > halfBA - 6) continue;

          const h = hMin + (hMax - hMin) * rng() * p.hMult;
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
          // Tag every mesh in this group with block info for raycasting
          group.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.blockInfo = info;
              allBuildingMeshes.push(obj);
              blockMeshMap.set(obj, info);
            }
          });
          scene.add(group);
        }

        // A few trees on the sidewalk edges
        const treeRng = seededRandom(`trees-${col}-${row}`);
        for (let t = 0; t < 3; t++) {
          const edge = BUILD_AREA / 2 + 2;
          const side = treeRng() > 0.5 ? 1 : -1;
          const tx = cx + (treeRng() - 0.5) * BLOCK_SIZE * 0.7;
          const tz = cz + side * edge * 0.8;
          scene.add(makeTree(tx, tz, seededRandom(`st-${t}-${col}-${row}`)));
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
      if (isPanning) {
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
      // Raycast
      const rect = canvas.getBoundingClientRect();
      clickPt.set(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(clickPt, camera);
      const hits = raycaster.intersectObjects(allBuildingMeshes, false);
      if (hits.length > 0) {
        const info = blockMeshMap.get(hits[0].object as THREE.Mesh) ?? null;
        selectedBlockState = info;
        setSelectedBlock(info);
      } else {
        selectedBlockState = null;
        setSelectedBlock(null);
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRadius = Math.max(60, Math.min(500, orbitRadius + e.deltaY * 0.35));
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
        orbitRadius = Math.max(60, Math.min(500, orbitRadius - (dist - lastTouchDist) * 0.5));
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
    const MM_SCALE = 72 / (HALF * STEP + STEP / 2); // fits grid into 72px radius

    function drawMinimap() {
      if (!mmCtx) return;
      mmCtx.clearRect(0, 0, 160, 160);
      // Background circle
      mmCtx.beginPath(); mmCtx.arc(80, 80, 78, 0, Math.PI * 2);
      mmCtx.fillStyle = 'rgba(0,0,0,0.7)'; mmCtx.fill();
      mmCtx.strokeStyle = 'rgba(100,180,255,0.4)'; mmCtx.lineWidth = 2; mmCtx.stroke();
      mmCtx.save(); mmCtx.beginPath(); mmCtx.arc(80, 80, 78, 0, Math.PI * 2); mmCtx.clip();
      // Draw blocks
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
      // Viewport crosshair
      const vx = 80 + orbitTarget.x * MM_SCALE;
      const vz = 80 + orbitTarget.z * MM_SCALE;
      mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 1.5;
      mmCtx.beginPath(); mmCtx.moveTo(vx - 5, vz); mmCtx.lineTo(vx + 5, vz); mmCtx.stroke();
      mmCtx.beginPath(); mmCtx.moveTo(vx, vz - 5); mmCtx.lineTo(vx, vz + 5); mmCtx.stroke();
      // N label
      mmCtx.fillStyle = 'rgba(255,255,255,0.65)';
      mmCtx.font = 'bold 9px system-ui'; mmCtx.textAlign = 'center';
      mmCtx.fillText('N', 80, 12);
      mmCtx.restore();
    }

    // ── Animate ───────────────────────────────────────────────────────────────
    let rafId = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      composer.render();
      drawMinimap();
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
          backdropFilter: 'blur(12px)', minWidth: 180,
          animation: 'fadeIn 0.15s ease-out',
        }}>
          <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{selectedBlock.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2, flexShrink: 0,
              background: ZONE_COLORS[selectedBlock.zone],
            }} />
            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>
              {selectedBlock.zone} zone
            </span>
          </div>
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
    </div>
  );
}
