/**
 * Sky — gradient sky dome with sun specular, time-of-day interpolation.
 * R3F declarative component replacing the raw Three.js shader sphere.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SkyConfig } from '../types';

// ─── Keyframes ───────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerpHex(a: string, b: string, t: number): string {
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
  return (Math.round(ar * (1 - t) + br * t) << 16)
       | (Math.round(ag * (1 - t) + bg * t) << 8)
       | Math.round(ab * (1 - t) + bb * t);
}

export function getSkyConfig(hour: number): SkyConfig {
  hour = ((hour % 24) + 24) % 24;
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
    zenith: lerpHex(a.zenith, b.zenith, t),
    horizon: lerpHex(a.horizon, b.horizon, t),
    fogColor: lerpFogColor(a.fogColor, b.fogColor, t),
    fogDensity: 0,
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    sunX: a.sunX + (b.sunX - a.sunX) * t,
    sunY: a.sunY + (b.sunY - a.sunY) * t,
    sunZ: a.sunZ + (b.sunZ - a.sunZ) * t,
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    fillIntensity: a.fillIntensity + (b.fillIntensity - a.fillIntensity) * t,
    bloomIntensity: a.bloomIntensity + (b.bloomIntensity - a.bloomIntensity) * t,
  };
}

// ─── Sky Shader ──────────────────────────────────────────────────────────────

const skyVertexShader = `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  varying vec3 vWorldPos;
  void main() {
    float t = clamp(normalize(vWorldPos).y * 1.4, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uZenith, t);
    float sun = pow(max(dot(normalize(vWorldPos), uSunDir), 0.0), 120.0) * 2.5;
    sky += vec3(1.0, 0.97, 0.9) * sun;
    gl_FragColor = vec4(sky, 1.0);
  }
`;

// ─── Component ───────────────────────────────────────────────────────────────

export function SkyDome({ skyConfig }: { skyConfig: SkyConfig }) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);

  const uniforms = useMemo(() => ({
    uHorizon: { value: new THREE.Color(skyConfig.horizon) },
    uZenith: { value: new THREE.Color(skyConfig.zenith) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.65, -0.62).normalize() },
  }), []);

  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uHorizon.value.set(skyConfig.horizon);
    matRef.current.uniforms.uZenith.value.set(skyConfig.zenith);
    matRef.current.uniforms.uSunDir.value.set(skyConfig.sunX, skyConfig.sunY, skyConfig.sunZ).normalize();
  });

  return (
    <mesh>
      <sphereGeometry args={[1500, 32, 16]} />
      <shaderMaterial
        ref={matRef}
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
      />
    </mesh>
  );
}
