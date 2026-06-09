export function extractJSON(text) {
  if (!text) return null;
  let m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  let c = m ? m[1] : null;
  if (!c) { const f = text.indexOf('{'); const l = text.lastIndexOf('}'); if (f !== -1 && l > f) c = text.slice(f, l + 1); }
  if (!c) return null;
  try { return JSON.parse(c.trim()); } catch { return null; }
}
