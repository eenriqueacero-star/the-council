import { MONO } from '../../constants/styles.js';
import { theme } from '../../utils/theme.js';

function cellColor(cell, T) {
  const s = String(cell).trim();
  // Substring checks, not word-boundary regex — actual values include "BULLISH"/"BEARISH",
  // which a \bBULL\b-style boundary match would silently fail to color.
  if (/^[+]/.test(s) || /(BULL|BUY|PASS|HOLD|WIN)/i.test(s)) return '#22C55E';
  if (/^-/.test(s) || /(BEAR|SKIP|FAIL|EXIT|LOSS)/i.test(s)) return '#EF4444';
  if (/(CAUTION|WATCH|TRIM|NEUTRAL)/i.test(s)) return '#F59E0B';
  return T.text;
}

// Clean, compact table rendered inside a chat bubble — monospace numbers, color-coded
// values, horizontally scrollable on narrow screens so it never breaks the layout.
export default function ChatDataTable({ headers = [], rows = [], dark }) {
  const T = theme(dark);
  if (!headers.length || !rows.length) return null;

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 6, marginBottom: 2, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: headers.length * 84 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ ...MONO, fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? T.bg : 'transparent' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ ...MONO, fontSize: 12, color: ci === 0 ? T.text : cellColor(cell, T), fontWeight: ci === 0 ? 600 : 500, textAlign: ci === 0 ? 'left' : 'right', padding: '7px 12px', whiteSpace: 'nowrap' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
