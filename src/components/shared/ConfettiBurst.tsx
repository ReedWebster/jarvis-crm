import React, { useEffect, useRef, useState } from 'react';

const COLORS = ['#d97706', '#f59e0b', '#6366f1', '#22c55e', '#ef4444', '#3b82f6', '#ec4899'];
const COUNT = 14;

interface Particle {
  id: number;
  color: string;
  tx: number;
  ty: number;
  rot: number;
  delay: number;
  size: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    tx: (Math.random() - 0.5) * 140,
    ty: -(Math.random() * 90 + 30),
    rot: Math.random() * 540 - 270,
    delay: Math.random() * 80,
    size: Math.random() * 5 + 4,
  }));
}

/** Drop this anywhere you want a confetti burst. Pass `trigger` as a boolean that flips to `true` to fire. */
export function ConfettiBurst({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const prevTrigger = useRef(false);

  useEffect(() => {
    if (trigger && !prevTrigger.current) {
      setParticles(makeParticles());
      const t = setTimeout(() => setParticles([]), 900);
      return () => clearTimeout(t);
    }
    prevTrigger.current = trigger;
  }, [trigger]);

  if (!particles.length) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 50, overflow: 'visible' }}
    >
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: '50%',
            top: '40%',
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            backgroundColor: p.color,
            animation: `confettiParticle 0.75s ease-out forwards`,
            animationDelay: `${p.delay}ms`,
            // CSS custom props for keyframe targets
            ['--tx' as string]: `${p.tx}px`,
            ['--ty' as string]: `${p.ty}px`,
            ['--rot' as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
