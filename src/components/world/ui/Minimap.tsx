/**
 * Minimap — circular minimap showing districts, camera position, click-to-teleport.
 */
import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { BlockInfo } from '../types';
import { HALF, COL_CENTERS, ROW_CENTERS, ZONE_COLORS } from '../types';
import { getZone } from '../city/districts';

interface MinimapProps {
  blocks: BlockInfo[];
  cameraX: number;
  cameraZ: number;
  onTeleport: (x: number, z: number) => void;
}

const SIZE = 160;
const R = SIZE / 2;
const SCALE = R / 400; // map world coords to minimap coords

export function Minimap({ blocks, cameraX, cameraZ, onTeleport }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0A0E1A';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw blocks
    for (const block of blocks) {
      if (block.zone === 'water') continue;
      const mx = R + block.cx * SCALE;
      const mz = R + block.cz * SCALE;
      const s = block.zone === 'park' ? 5 : block.zone === 'downtown' ? 7 : 6;
      ctx.fillStyle = ZONE_COLORS[block.zone] || '#888';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(mx - s / 2, mz - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Camera position indicator
    const camMx = R + cameraX * SCALE;
    const camMz = R + cameraZ * SCALE;
    ctx.beginPath();
    ctx.arc(camMx, camMz, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4ade80';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Border
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [blocks, cameraX, cameraZ]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - R;
    const mz = e.clientY - rect.top - R;
    // Check if inside circle
    if (mx * mx + mz * mz > (R - 2) * (R - 2)) return;
    const worldX = mx / SCALE;
    const worldZ = mz / SCALE;
    onTeleport(worldX, worldZ);
  }, [onTeleport]);

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16, zIndex: 20,
      width: SIZE, height: SIZE, borderRadius: '50%',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
    }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        style={{ cursor: 'pointer', width: SIZE, height: SIZE }}
      />
    </div>
  );
}
