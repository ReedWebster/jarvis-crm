/**
 * WorldView — Interactive 3D city visualization for the Litehouse CRM.
 *
 * Rebuilt with React Three Fiber for modular architecture.
 * Same prop interface as the original for drop-in replacement.
 *
 * Controls:
 *   Left-drag   → rotate azimuth
 *   Right-drag  → pan (city)
 *   Scroll      → zoom
 *   Click       → select building
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BlockInfo, WorldViewProps, SkyConfig } from './types';
import { generateBlockInfos } from './city/CityGrid';
import { CityGrid } from './city/CityGrid';
import { SkyDome, getSkyConfig } from './environment/Sky';
import { Ocean } from './environment/Ocean';
import { Lighting } from './environment/Lighting';
import { useOrbitCamera } from './hooks/useOrbitCamera';
import { WorldDataPanel } from './WorldDataPanel';
import { Minimap } from './ui/Minimap';
import { DistrictHUD } from './ui/DistrictHUD';
import { BuildingCard } from './ui/BuildingCard';

// ─── Scene Content (inside Canvas) ───────────────────────────────────────────

interface SceneProps {
  skyConfig: SkyConfig;
  appData?: WorldViewProps['appData'];
  onCameraMove?: (x: number, z: number) => void;
  onTeleportRef?: React.MutableRefObject<((x: number, z: number) => void) | null>;
}

function Scene({ skyConfig, appData, onCameraMove, onTeleportRef }: SceneProps) {
  const { camera, scene } = useThree();
  const { teleportTo, getTarget } = useOrbitCamera();

  // Expose teleport function to parent
  useEffect(() => {
    if (onTeleportRef) onTeleportRef.current = teleportTo;
  }, [teleportTo, onTeleportRef]);

  // Update fog from sky config
  useFrame(() => {
    scene.fog = new THREE.Fog(skyConfig.fogColor, 250, 900);
    const target = getTarget();
    onCameraMove?.(target.x, target.z);
  });

  return (
    <>
      <SkyDome skyConfig={skyConfig} />
      <Lighting skyConfig={skyConfig} />
      <Ocean />
      <CityGrid appData={appData} />
    </>
  );
}

// ─── Main WorldView Component ────────────────────────────────────────────────

export function WorldView({
  contactTags,
  districtTagMap,
  onDistrictTagMapChange,
  appData,
  onNavigateToSection,
}: WorldViewProps = {}) {
  // UI state
  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null);
  const [districtLabel, setDistrictLabel] = useState<string | null>(null);
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 0 });

  // Teleport function ref (bridging Canvas → HTML)
  const teleportRef = useRef<((x: number, z: number) => void) | null>(null);

  // Generate block infos for minimap and search
  const blocks = useMemo(() => generateBlockInfos(), []);

  // Sky config — updates every minute
  const [skyConfig, setSkyConfig] = useState<SkyConfig>(() => {
    const now = new Date();
    return getSkyConfig(now.getHours() + now.getMinutes() / 60);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setSkyConfig(getSkyConfig(now.getHours() + now.getMinutes() / 60));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Camera move handler — update district label
  const handleCameraMove = useCallback((x: number, z: number) => {
    setCameraPos({ x, z });
    // Find nearest block to camera target for district label
    let minDist = Infinity;
    let nearest: BlockInfo | null = null;
    for (const block of blocks) {
      const dx = block.cx - x, dz = block.cz - z;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) { minDist = dist; nearest = block; }
    }
    if (nearest && minDist < 3000) {
      setDistrictLabel(nearest.label);
    } else {
      setDistrictLabel(null);
    }
  }, [blocks]);

  // Teleport handler
  const handleTeleport = useCallback((x: number, z: number) => {
    teleportRef.current?.(x, z);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0A0E1A', overflow: 'hidden' }}>
      {/* 3D Canvas */}
      <Canvas
        camera={{ fov: 45, near: 0.5, far: 2000, position: [200, 200, 200] }}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: 6, // THREE.ACESFilmicToneMapping
          toneMappingExposure: 1.0,
          outputColorSpace: 'srgb', // THREE.SRGBColorSpace
        }}
        dpr={Math.min(window.devicePixelRatio, 1.5)}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene
          skyConfig={skyConfig}
          appData={appData}
          onCameraMove={handleCameraMove}
          onTeleportRef={teleportRef}
        />
      </Canvas>

      {/* HTML Overlays */}

      {/* Data Command Panel */}
      {appData && <WorldDataPanel appData={appData} />}

      {/* District HUD */}
      <DistrictHUD
        districtLabel={districtLabel}
        blocks={blocks}
        onTeleport={handleTeleport}
      />

      {/* Building Selection Card */}
      {selectedBlock && appData && (
        <BuildingCard
          block={selectedBlock}
          appData={appData}
          onClose={() => setSelectedBlock(null)}
          onNavigate={onNavigateToSection}
        />
      )}

      {/* Minimap */}
      <Minimap
        blocks={blocks}
        cameraX={cameraPos.x}
        cameraZ={cameraPos.z}
        onTeleport={handleTeleport}
      />

      {/* Controls hint */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, padding: '5px 14px', color: '#64748b', fontSize: 11,
        pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
      }}>
        Drag to orbit · Right-drag to pan · Scroll to zoom · Click to select
      </div>

      {/* Fade overlay for transitions */}
      <div style={{
        position: 'absolute', inset: 0, background: '#080C18',
        opacity: 0, pointerEvents: 'none', transition: 'opacity 0.3s ease',
        zIndex: 30,
      }} />

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
