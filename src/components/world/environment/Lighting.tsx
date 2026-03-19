/**
 * Lighting — sun, hemisphere, fill light. Updates from sky config each frame.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SkyConfig } from '../types';

export function Lighting({ skyConfig }: { skyConfig: SkyConfig }) {
  const sunRef = useRef<THREE.DirectionalLight>(null!);
  const hemiRef = useRef<THREE.HemisphereLight>(null!);
  const fillRef = useRef<THREE.DirectionalLight>(null!);

  useFrame(() => {
    if (sunRef.current) {
      sunRef.current.position.set(skyConfig.sunX, skyConfig.sunY, skyConfig.sunZ);
      sunRef.current.intensity = skyConfig.sunIntensity;
      sunRef.current.color.set(skyConfig.sunColor);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = skyConfig.hemiIntensity;
    }
    if (fillRef.current) {
      fillRef.current.intensity = skyConfig.fillIntensity;
    }
  });

  return (
    <>
      <directionalLight
        ref={sunRef}
        color="#ffffff"
        intensity={2.5}
        position={[80, 200, -120]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={1200}
        shadow-camera-left={-320}
        shadow-camera-right={320}
        shadow-camera-top={320}
        shadow-camera-bottom={-320}
        shadow-bias={-0.00015}
        shadow-normalBias={0.02}
      />
      <hemisphereLight
        ref={hemiRef}
        args={['#C8D8F0', '#D8D0C0', 0.65]}
      />
      <directionalLight
        ref={fillRef}
        color="#FFE8D0"
        intensity={0.35}
        position={[-80, 100, 120]}
      />
    </>
  );
}
