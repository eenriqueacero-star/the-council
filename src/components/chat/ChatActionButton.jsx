import { motion } from 'framer-motion';
import { MONO } from '../../constants/styles.js';
import { theme } from '../../utils/theme.js';

// Full-width, large tap-target action button rendered inside a chat message.
// 48px min height per the mobile tap-target guideline.
export default function ChatActionButton({ label, icon, onClick, dark, disabled, busy }) {
  const T = theme(dark);
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...MONO, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', minHeight: 48, marginTop: 6,
        background: disabled ? T.btnDisabled : `${T.accent}18`,
        color: disabled ? T.btnDisabledText : T.accent,
        border: `1px solid ${disabled ? T.border : T.accent + '40'}`,
        borderRadius: 10, fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ fontSize: 15 }}>{busy ? '⏳' : icon}</span>
      {label}
    </motion.button>
  );
}
