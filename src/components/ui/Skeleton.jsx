import React from 'react';

/**
 * Shimmer skeleton placeholder. Reads the theme skeleton color from the CSS variable
 * so it works in both dark and light mode without props.
 *
 * Props: width, height, borderRadius, style
 */
export default function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  );
}

/** Convenience: a card-shaped skeleton block */
export function SkeletonCard({ height = 80, style }) {
  return <Skeleton height={height} borderRadius={12} style={{ marginBottom: 12, ...style }} />;
}

/** Stack of N skeleton rows with optional label-width first row */
export function SkeletonRows({ rows = 3, gap = 10 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? '60%' : `${85 - i * 8}%`} height={12} />
      ))}
    </div>
  );
}
