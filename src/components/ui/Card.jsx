import React from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, style, glass = false, hover = false, onClick, className }) {
  const base = {
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(255,255,255,0.06)',
    background: glass ? undefined : '#18181B',
    overflow: 'hidden',
    ...style,
  };
  if (hover) {
    return (
      <motion.div
        className={glass ? `glass ${className || ''}` : className}
        style={base}
        whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <div className={glass ? `glass ${className || ''}` : className} style={base} onClick={onClick}>
      {children}
    </div>
  );
}
