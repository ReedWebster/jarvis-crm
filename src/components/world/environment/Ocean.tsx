/**
 * Ocean — animated water shader with Fresnel, sun specular, and foam ring.
 * Also includes the beach ring with sand gradient + rocks + driftwood + grass.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GRID_EXTENT, seededRandom } from '../types';

// ─── Water Shader ────────────────────────────────────────────────────────────

const waterVertexShader = `
  varying vec2 vUv; varying vec3 vWorldPos;
  void main() {
    vUv = uv; vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

const waterFragmentShader = `
  uniform float uTime; uniform vec3 uSunDir;
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
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vec3(0,1,0)), 0.0), 3.0);
    col = mix(col, vec3(0.7, 0.85, 0.95), fresnel * 0.4);
    float spec = pow(max(dot(reflect(-uSunDir, vec3(0,1,0)), viewDir), 0.0), 64.0);
    col += vec3(1.0, 0.95, 0.85) * spec * 0.3;
    gl_FragColor = vec4(col, 0.78 + fresnel * 0.15);
  }
`;

// ─── Foam Shader ─────────────────────────────────────────────────────────────

const foamFragmentShader = `
  uniform float uTime; uniform float uInnerR;
  varying vec3 vWorldPos;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main(){
    float dist = length(vWorldPos.xz);
    float angle = atan(vWorldPos.z, vWorldPos.x);
    float wave1 = sin(dist*0.12 + uTime*0.8 + angle*2.0)*0.5+0.5;
    float wave2 = sin(dist*0.15 + uTime*0.6 - angle*1.5)*0.5+0.5;
    float n = noise(vWorldPos.xz*0.3 + uTime*0.1);
    float foam = wave1 * 0.6 + wave2 * 0.4;
    foam *= smoothstep(uInnerR - 5.0, uInnerR + 8.0, dist) * smoothstep(uInnerR + 35.0, uInnerR + 15.0, dist);
    foam += n * 0.2 * smoothstep(uInnerR, uInnerR + 20.0, dist);
    gl_FragColor = vec4(0.95, 0.96, 0.94, foam * 0.7);
  }
`;

const foamVertexShader = `
  varying vec3 vWorldPos;
  void main(){ vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;

// ─── Beach Shader ────────────────────────────────────────────────────────────

const beachFragmentShader = `
  uniform float uInnerR; uniform float uOuterR;
  varying vec3 vWorldPos;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main(){
    float dist = length(vWorldPos.xz);
    float t = clamp((dist - uInnerR) / (uOuterR - uInnerR), 0.0, 1.0);
    float n = noise(vWorldPos.xz*0.12)*0.5 + noise(vWorldPos.xz*0.35)*0.25 + noise(vWorldPos.xz*0.8)*0.15 + noise(vWorldPos.xz*2.0)*0.06;
    vec3 drySand = vec3(0.88,0.78,0.55) + vec3(n*0.08, n*0.06, n*0.02);
    vec3 wetSand = vec3(0.52,0.44,0.30) + vec3(n*0.04, n*0.03, n*0.01);
    vec3 sand = mix(drySand, wetSand, smoothstep(0.5, 0.95, t));
    float streak = noise(vWorldPos.xz * vec2(0.03, 0.15)) * noise(vWorldPos.xz * vec2(0.15, 0.04));
    sand -= vec3(streak * 0.08);
    float wetSheen = smoothstep(0.75, 0.95, t) * 0.15;
    sand += vec3(wetSheen * 0.5, wetSheen * 0.6, wetSheen * 0.8);
    gl_FragColor = vec4(sand, 1.0);
  }
`;

const beachVertexShader = `
  varying vec2 vUv; varying vec3 vWorldPos;
  void main(){ vUv=uv; vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;

// ─── Ground Shader ───────────────────────────────────────────────────────────

const groundFragmentShader = `
  uniform vec3 uBaseColor; varying vec3 vWorldPos;
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main() {
    float n = noise(vWorldPos.xz * 0.08) * 0.06;
    vec3 col = uBaseColor + vec3(n, n*0.8, n*0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const groundVertexShader = `
  varying vec3 vWorldPos;
  void main() { vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

// ─── Beach Props (rocks, driftwood, grass) ───────────────────────────────────

function BeachProps() {
  const meshes = useMemo(() => {
    const rng = seededRandom('beach-rocks');
    const items: { type: 'rock' | 'drift' | 'grass'; pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number]; dark: boolean; size: number }[] = [];

    // Rocks
    for (let i = 0; i < 120; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = GRID_EXTENT + 20 + rng() * 95;
      const s = 0.3 + rng() * 1.8;
      items.push({
        type: 'rock', dark: rng() > 0.5, size: s,
        pos: [Math.cos(angle) * dist, -0.05 + s * 0.25, Math.sin(angle) * dist],
        rot: [rng() * Math.PI, rng() * Math.PI, 0],
        scale: [1, 0.4 + rng() * 0.4, 1 + rng() * 0.5],
      });
    }

    // Driftwood
    for (let i = 0; i < 30; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = GRID_EXTENT + 60 + rng() * 55;
      const len = 1.5 + rng() * 4;
      items.push({
        type: 'drift', dark: false, size: len,
        pos: [Math.cos(angle) * dist, -0.02, Math.sin(angle) * dist],
        rot: [0, rng() * Math.PI, Math.PI / 2 + (rng() - 0.5) * 0.3],
        scale: [1, 1, 1],
      });
    }

    return items;
  }, []);

  return (
    <group>
      {meshes.map((item, i) => {
        if (item.type === 'rock') {
          return (
            <mesh key={i} position={item.pos} rotation={item.rot} scale={item.scale} castShadow receiveShadow>
              <dodecahedronGeometry args={[item.size, 0]} />
              <meshStandardMaterial color={item.dark ? '#4A4640' : '#6E6860'} roughness={0.92} metalness={0.02} />
            </mesh>
          );
        }
        if (item.type === 'drift') {
          return (
            <mesh key={i} position={item.pos} rotation={item.rot} castShadow>
              <cylinderGeometry args={[0.12, 0.04, item.size, 5]} />
              <meshStandardMaterial color="#9E8E70" roughness={0.95} />
            </mesh>
          );
        }
        return null;
      })}
    </group>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function Ocean() {
  const waterRef = useRef<THREE.ShaderMaterial>(null!);
  const foamRef = useRef<THREE.ShaderMaterial>(null!);

  const waterUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.65, -0.62).normalize() },
  }), []);

  const foamUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uInnerR: { value: GRID_EXTENT + 105 },
  }), []);

  const beachUniforms = useMemo(() => ({
    uInnerR: { value: GRID_EXTENT - 24 },
    uOuterR: { value: GRID_EXTENT + 130 },
  }), []);

  const groundUniforms = useMemo(() => ({
    uBaseColor: { value: new THREE.Color('#D0C8B8') },
  }), []);

  useFrame((_, delta) => {
    if (waterRef.current) waterRef.current.uniforms.uTime.value += delta;
    if (foamRef.current) foamRef.current.uniforms.uTime.value += delta;
  });

  return (
    <group>
      {/* Ocean water */}
      <mesh rotation-x={-Math.PI / 2} position-y={-1.2}>
        <planeGeometry args={[2800, 2800]} />
        <shaderMaterial
          ref={waterRef}
          transparent
          uniforms={waterUniforms}
          vertexShader={waterVertexShader}
          fragmentShader={waterFragmentShader}
        />
      </mesh>

      {/* Beach ring */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <ringGeometry args={[GRID_EXTENT - 24, GRID_EXTENT + 130, 96]} />
        <shaderMaterial
          uniforms={beachUniforms}
          vertexShader={beachVertexShader}
          fragmentShader={beachFragmentShader}
        />
      </mesh>

      {/* Foam ring */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <ringGeometry args={[GRID_EXTENT + 90, GRID_EXTENT + 140, 96]} />
        <shaderMaterial
          ref={foamRef}
          transparent
          uniforms={foamUniforms}
          vertexShader={foamVertexShader}
          fragmentShader={foamFragmentShader}
        />
      </mesh>

      {/* City ground */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <circleGeometry args={[GRID_EXTENT + 12, 80]} />
        <shaderMaterial
          uniforms={groundUniforms}
          vertexShader={groundVertexShader}
          fragmentShader={groundFragmentShader}
        />
      </mesh>

      {/* Beach props */}
      <BeachProps />
    </group>
  );
}
