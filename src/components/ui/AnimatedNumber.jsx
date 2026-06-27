import React, { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';

export default function AnimatedNumber({ value, format = v => v.toLocaleString(), duration = 1.2, style, className }) {
  const ref = useRef(null);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number(value) || 0;
    prevRef.current = to;
    if (!ref.current) return;
    const ctrl = animate(from, to, {
      duration,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate(v) { if (ref.current) ref.current.textContent = format(v); },
    });
    return () => ctrl.stop();
  }, [value]);

  return <span ref={ref} style={style} className={className}>{format(Number(value) || 0)}</span>;
}
