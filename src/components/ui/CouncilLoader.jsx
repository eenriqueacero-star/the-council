import React from 'react';

const AGENT_COLORS = ['#6366F1', '#F59E0B', '#A855F7', '#3B82F6', '#EF4444', '#22C55E'];

const SIZES = {
  sm: { orbit: 22, dot: 3.5, duration: 1.8 },
  md: { orbit: 34, dot: 5,   duration: 2.0 },
  lg: { orbit: 48, dot: 7,   duration: 2.2 },
};

export default function CouncilLoader({ size = 'md', className, style }) {
  const { orbit, dot, duration } = SIZES[size] || SIZES.md;
  const total = orbit * 2 + dot * 2;

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: total, height: total, position: 'relative', ...style }}
    >
      <svg
        width={total}
        height={total}
        viewBox={`0 0 ${total} ${total}`}
        style={{ animation: `council-spin ${duration}s linear infinite`, position: 'absolute', top: 0, left: 0 }}
      >
        {AGENT_COLORS.map((color, i) => {
          const angle = (i / AGENT_COLORS.length) * 2 * Math.PI;
          const cx = total / 2 + orbit * Math.cos(angle);
          const cy = total / 2 + orbit * Math.sin(angle);
          return <circle key={i} cx={cx.toFixed(2)} cy={cy.toFixed(2)} r={dot} fill={color} />;
        })}
      </svg>
      <style>{`@keyframes council-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
