function getETDate(now) {
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function getNthWeekday(year, month, n, weekday) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getMonth() !== month - 1) break;
    if (dt.getDay() === weekday && ++count === n) return d;
  }
  return 1;
}

function getLastWeekday(year, month, weekday) {
  for (let d = 31; d >= 1; d--) {
    const dt = new Date(year, month - 1, d);
    if (dt.getMonth() !== month - 1) continue;
    if (dt.getDay() === weekday) return d;
  }
  return 1;
}

function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function observed(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (d.getDay() === 6) return new Date(year, month - 1, day - 1);
  if (d.getDay() === 0) return new Date(year, month - 1, day + 1);
  return d;
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getHolidays(year) {
  const h = new Set();
  h.add(iso(observed(year, 1,  1)));   // New Year's
  h.add(iso(new Date(year, 0, getNthWeekday(year, 1, 3, 1))));   // MLK
  h.add(iso(new Date(year, 1, getNthWeekday(year, 2, 3, 1))));   // Presidents
  const easter = getEaster(year);
  h.add(iso(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2))); // Good Friday
  h.add(iso(new Date(year, 4, getLastWeekday(year, 5, 1))));     // Memorial Day
  h.add(iso(observed(year, 6,  19)));  // Juneteenth
  h.add(iso(observed(year, 7,   4)));  // Independence Day
  h.add(iso(new Date(year, 8, getNthWeekday(year, 9,  1, 1)))); // Labor Day
  h.add(iso(new Date(year, 10, getNthWeekday(year, 11, 4, 4)))); // Thanksgiving
  h.add(iso(observed(year, 12, 25)));  // Christmas
  return h;
}

export function getMarketState(now) {
  const et  = getETDate(now);
  const dow = et.getDay();
  if (dow === 0 || dow === 6) return 'weekend';
  if (getHolidays(et.getFullYear()).has(iso(et))) return 'weekend';
  const h = et.getHours() + et.getMinutes() / 60;
  if (h <  4)   return 'overnight';
  if (h <  9.5) return 'premarket';
  if (h < 16)   return 'open';
  if (h < 20)   return 'afterhours';
  return 'evening';
}

export function getTimeToNextOpen(now) {
  const et = getETDate(now);
  const etOffsetMs = now.getTime() - et.getTime();
  for (let i = 0; i <= 7; i++) {
    const candidate = new Date(et.getFullYear(), et.getMonth(), et.getDate() + i, 9, 30, 0, 0);
    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) continue;
    if (getHolidays(candidate.getFullYear()).has(iso(candidate))) continue;
    const utcOpen = candidate.getTime() + etOffsetMs;
    if (utcOpen > now.getTime()) return utcOpen - now.getTime();
  }
  return 0;
}
