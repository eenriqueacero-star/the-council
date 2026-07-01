import { motion } from 'framer-motion';
import { theme } from '../../utils/theme.js';

// Horizontal scrollable row of tappable follow-up question chips.
export default function QuickReplies({ options = [], onSelect, dark, disabled }) {
  const T = theme(dark);
  if (!options.length) return null;

  return (
    <div className="no-scrollbar" style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
      {options.map((q, i) => (
        <motion.button
          key={i}
          whileTap={disabled ? {} : { scale: 0.95 }}
          onClick={() => !disabled && onSelect(q)}
          disabled={disabled}
          style={{
            fontFamily: 'var(--font-display)', fontSize: 12, flexShrink: 0,
            padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            border: `1px solid ${T.border}`, color: T.text2, background: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {q}
        </motion.button>
      ))}
    </div>
  );
}
