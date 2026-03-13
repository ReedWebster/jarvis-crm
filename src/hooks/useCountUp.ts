import { useState, useEffect, useRef } from 'react';

/** Animates a number from its previous value to `target` over `duration` ms (ease-out). */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);
  const frameRef = useRef<number>();

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;

    let startTime: number | undefined;

    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3; // ease-out cubic
      setValue(Math.round(start + diff * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return value;
}
