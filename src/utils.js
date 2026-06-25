export function extractJSON(text) {
  if (!text) return null;

  // Strip markdown code fences so reasoning models don't trip us up
  let s = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Find the first balanced top-level { } object — ignores prose before or after
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Retry once on the raw original text (in case stripping mangled something)
    try {
      const f = text.indexOf('{'), l = text.lastIndexOf('}');
      if (f !== -1 && l > f) return JSON.parse(text.slice(f, l + 1));
    } catch {}
    return null;
  }
}
