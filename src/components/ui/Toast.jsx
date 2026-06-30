import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { subscribe, dismiss } from '../../utils/toast.js';

const CONFIG = {
  success: { bg: 'rgba(34,197,94,0.15)',  border: '#22C55E40', icon: CheckCircle2, color: '#22C55E' },
  error:   { bg: 'rgba(239,68,68,0.15)',  border: '#EF444440', icon: XCircle,     color: '#EF4444' },
  info:    { bg: 'rgba(59,130,246,0.15)', border: '#3B82F640', icon: Info,         color: '#3B82F6' },
};

const FONT = { fontFamily: "ui-monospace,'SF Mono',monospace" };

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribe(event => {
      if (event.dismiss) {
        setToasts(prev => prev.filter(t => t.id !== event.id));
      } else {
        setToasts(prev => [event, ...prev].slice(0, 3)); // newest on top, max 3
      }
    });
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8,
      width: 'min(90vw, 380px)',
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const cfg = CONFIG[t.type] || CONFIG.info;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: 12,
                padding: '12px 14px',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                pointerEvents: 'all',
              }}
            >
              <Icon size={16} style={{ color: cfg.color, flexShrink: 0 }} />
              <span style={{ ...FONT, fontSize: 13, color: '#FAFAFA', flex: 1, lineHeight: 1.4 }}>
                {t.message}
              </span>
              <button
                onClick={() => dismiss(t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
