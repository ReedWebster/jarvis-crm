/**
 * useOrbitCamera — custom orbit camera with smooth pan, zoom, teleport.
 * Replaces the raw pointer event handling from the original WorldView.
 */
import { useRef, useCallback, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OrbitState {
  target: THREE.Vector3;
  radius: number;
  theta: number;
  phi: number;
  isDragging: boolean;
  dragButton: number;
  lastX: number;
  lastY: number;
  zoomVelocity: number;
  panTarget: THREE.Vector3 | null;
}

export function useOrbitCamera() {
  const { camera, gl } = useThree();
  const state = useRef<OrbitState>({
    target: new THREE.Vector3(0, 0, 0),
    radius: 280,
    theta: Math.PI / 4,
    phi: 1.08,
    isDragging: false,
    dragButton: 0,
    lastX: 0,
    lastY: 0,
    zoomVelocity: 0,
    panTarget: null,
  });

  const updateCamera = useCallback(() => {
    const s = state.current;
    const sinP = Math.sin(s.phi), cosP = Math.cos(s.phi);
    const sinT = Math.sin(s.theta), cosT = Math.cos(s.theta);
    camera.position.set(
      s.target.x + s.radius * sinP * sinT,
      s.target.y + s.radius * cosP,
      s.target.z + s.radius * sinP * cosT,
    );
    camera.lookAt(s.target);
  }, [camera]);

  // Pointer events
  useEffect(() => {
    const canvas = gl.domElement;
    const s = state.current;

    const onPointerDown = (e: PointerEvent) => {
      s.isDragging = true;
      s.dragButton = e.button;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!s.isDragging) return;
      const dx = e.clientX - s.lastX;
      const dy = e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;

      if (s.dragButton === 0) {
        // Left drag: orbit
        s.theta -= dx * 0.004;
        s.phi = Math.max(0.2, Math.min(1.5, s.phi + dy * 0.004));
      } else if (s.dragButton === 2) {
        // Right drag: pan
        const panSpeed = s.radius * 0.0015;
        const sinT = Math.sin(s.theta), cosT = Math.cos(s.theta);
        s.target.x -= (dx * cosT + dy * sinT * Math.cos(s.phi)) * panSpeed;
        s.target.z += (dx * sinT - dy * cosT * Math.cos(s.phi)) * panSpeed;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      s.isDragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.zoomVelocity += e.deltaY * 0.15;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl]);

  // Animation loop
  useFrame(() => {
    const s = state.current;

    // Apply zoom velocity with damping
    if (Math.abs(s.zoomVelocity) > 0.01) {
      s.radius = Math.max(30, Math.min(800, s.radius + s.zoomVelocity));
      s.zoomVelocity *= 0.88;
    } else {
      s.zoomVelocity = 0;
    }

    // Smooth pan to target (minimap teleport)
    if (s.panTarget) {
      s.target.lerp(s.panTarget, 0.06);
      if (s.target.distanceTo(s.panTarget) < 1) {
        s.target.copy(s.panTarget);
        s.panTarget = null;
      }
    }

    updateCamera();
  });

  const teleportTo = useCallback((x: number, z: number) => {
    state.current.panTarget = new THREE.Vector3(x, 0, z);
  }, []);

  const getTarget = useCallback(() => state.current.target.clone(), []);
  const getRadius = useCallback(() => state.current.radius, []);

  return { teleportTo, getTarget, getRadius, state };
}
