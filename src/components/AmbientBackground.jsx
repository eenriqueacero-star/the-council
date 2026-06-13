/**
 * AmbientBackground — canvas-based atmospheric scene layer.
 * Position: fixed, z-index 0, pointer-events none. No external deps.
 * Props:
 *   marketState  — 'premarket'|'open'|'afterhours'|'overnight'|'evening'|'weekend'
 *   portfolioDirection — 'up'|'down'|'flat'
 */
import { useEffect, useRef } from 'react';

// ─── math utils ──────────────────────────────────────────────────────────────
function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── background gradient ──────────────────────────────────────────────────────
function paintBg(ctx, W, H, ms) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (ms === 'premarket') {
    g.addColorStop(0,   '#04081e');
    g.addColorStop(0.4, '#0e1a3a');
    g.addColorStop(0.6, '#6b2010');
    g.addColorStop(0.8, '#c06028');
    g.addColorStop(1,   '#d48840');
  } else if (ms === 'open') {
    g.addColorStop(0, '#070a0c');
    g.addColorStop(1, '#0c1318');
  } else if (ms === 'afterhours') {
    g.addColorStop(0,   '#08041a');
    g.addColorStop(0.3, '#2a0e58');
    g.addColorStop(0.55,'#7a1848');
    g.addColorStop(0.75,'#c04828');
    g.addColorStop(1,   '#d07030');
  } else if (ms === 'overnight' || ms === 'evening') {
    g.addColorStop(0,   '#01030b');
    g.addColorStop(0.5, '#040910');
    g.addColorStop(1,   '#08101e');
  } else {
    // closed / weekend
    g.addColorStop(0, '#0c0d0f');
    g.addColorStop(1, '#12141a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ─── sun helper ──────────────────────────────────────────────────────────────
function paintSun(ctx, W, H, x, y, r, glowInner, glowOuter, glowR, midCol) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  glow.addColorStop(0, glowInner);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const disc = ctx.createRadialGradient(x, y, 0, x, y, r);
  disc.addColorStop(0,   '#fffce8');
  disc.addColorStop(0.5, midCol);
  disc.addColorStop(1,   '#cc3800');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ─── premarket sunrise ────────────────────────────────────────────────────────
function drawPremarket(ctx, W, H, t, ent) {
  paintBg(ctx, W, H, 'premarket');

  const sunY    = H * 0.63 - Math.sin(t * 0.035) * H * 0.025;
  const horizon = H * 0.72;

  // crepuscular rays
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + (i - 3) * 0.19;
    const g = ctx.createLinearGradient(W / 2, sunY, W / 2 + Math.cos(ang) * W * 2, sunY + Math.sin(ang) * H * 2);
    g.addColorStop(0, 'rgba(255,185,70,0.09)');
    g.addColorStop(1, 'rgba(255,185,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(W / 2, sunY);
    ctx.lineTo(W / 2 + Math.cos(ang - 0.065) * W * 2, sunY + Math.sin(ang - 0.065) * H * 2);
    ctx.lineTo(W / 2 + Math.cos(ang + 0.065) * W * 2, sunY + Math.sin(ang + 0.065) * H * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  paintSun(ctx, W, H, W / 2, sunY, 25, 'rgba(255,210,90,0.32)', '#ffa020', 130, '#ffa020');

  // ground bar
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, '#180900');
  ground.addColorStop(1, '#080300');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);

  // clouds
  ent.clouds.forEach(c => {
    ctx.save();
    ctx.globalAlpha = c.a;
    ctx.fillStyle = '#ddc090';
    ctx.beginPath();
    ctx.ellipse(c.x * W, c.y * H, c.rw, c.rh,  0, 0, Math.PI * 2);
    ctx.ellipse(c.x * W - c.rw * .38, c.y * H + c.rh * .32, c.rw * .42, c.rh * .55, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x * W + c.rw * .38, c.y * H + c.rh * .32, c.rw * .42, c.rh * .55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── market open — portfolio particles ───────────────────────────────────────
function drawOpen(ctx, W, H, _t, pd, ent) {
  paintBg(ctx, W, H, 'open');

  // directional glow
  const gc = pd === 'up'   ? 'rgba(0,200,5,0.055)'
           : pd === 'down' ? 'rgba(255,59,48,0.055)'
                           : 'rgba(56,224,212,0.035)';
  const r = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.75);
  r.addColorStop(0, gc);
  r.addColorStop(1, 'transparent');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);

  // particles
  ent.particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── after-hours — sunset beach ───────────────────────────────────────────────
function drawAfterHours(ctx, W, H, t, ent) {
  paintBg(ctx, W, H, 'afterhours');

  const sunY    = H * 0.57 + t * H * 0.003;
  const horizon = H * 0.66;

  if (sunY < horizon + 12)
    paintSun(ctx, W, H, W / 2, sunY, 19, 'rgba(255,155,45,0.26)', '#ffac30', 110, '#ffac30');

  // ocean
  const ocean = ctx.createLinearGradient(0, horizon, 0, H);
  ocean.addColorStop(0, '#130a28');
  ocean.addColorStop(1, '#060210');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, horizon, W, H - horizon);

  // shimmer lines
  for (let i = 0; i < 5; i++) {
    const sy  = horizon + (i + 1) * (H - horizon) / 6.5;
    const sx  = W / 2 + Math.sin(t * 0.72 + i * 1.3) * W * 0.11;
    const amp = 0.037 + 0.018 * Math.sin(t * 1.1 + i);
    ctx.save();
    ctx.globalAlpha = amp;
    ctx.strokeStyle = '#ff9028';
    ctx.lineWidth   = 1.1;
    ctx.beginPath();
    ctx.moveTo(sx - W * 0.07, sy);
    ctx.lineTo(sx + W * 0.07, sy);
    ctx.stroke();
    ctx.restore();
  }

  // horizon glow line
  ctx.save();
  ctx.globalAlpha = 0.18;
  const hl = ctx.createLinearGradient(0, 0, W, 0);
  hl.addColorStop(0,   'transparent');
  hl.addColorStop(0.4, '#ff7820');
  hl.addColorStop(0.6, '#ff7820');
  hl.addColorStop(1,   'transparent');
  ctx.strokeStyle = hl;
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(W, horizon);
  ctx.stroke();
  ctx.restore();

  // birds
  ent.birds.forEach(b => {
    const bx = b.x * W, by = b.y * H;
    const fl = Math.sin(b.fp) * b.sz * 0.9;
    ctx.save();
    ctx.globalAlpha  = 0.42;
    ctx.strokeStyle  = '#1a0828';
    ctx.lineWidth    = 1.1;
    ctx.beginPath();
    ctx.moveTo(bx - b.sz, by - fl);
    ctx.quadraticCurveTo(bx, by, bx + b.sz, by - fl);
    ctx.stroke();
    ctx.restore();
  });
}

// ─── overnight / evening — night sky ──────────────────────────────────────────
function drawOvernight(ctx, W, H, t, ent) {
  paintBg(ctx, W, H, 'overnight');

  // subtle nebula
  ctx.save();
  ctx.globalAlpha = 0.038;
  const nb = ctx.createRadialGradient(W * 0.3, H * 0.22, 0, W * 0.3, H * 0.22, W * 0.44);
  nb.addColorStop(0, '#5520c0');
  nb.addColorStop(1, 'transparent');
  ctx.fillStyle = nb;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // stars
  ent.stars.forEach(s => {
    const tw = 0.55 + 0.45 * Math.sin(t * s.ts + s.tp);
    ctx.save();
    ctx.globalAlpha = s.a * tw;
    ctx.fillStyle   = s.col;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // moon
  const mx = W * 0.78, my = H * 0.14;
  ctx.save();
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 52);
  mg.addColorStop(0, 'rgba(195,210,255,0.10)');
  mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ccd6f4';
  ctx.beginPath();
  ctx.arc(mx, my, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#02050d';   // crescent shadow
  ctx.beginPath();
  ctx.arc(mx + 6, my - 2, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // shooting star
  if (ent.ss) {
    const ss = ent.ss;
    ctx.save();
    ctx.globalAlpha = ss.a;
    const trail = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.dx * 55, ss.y - ss.dy * 55);
    trail.addColorStop(0, 'rgba(255,255,255,0.88)');
    trail.addColorStop(1, 'transparent');
    ctx.strokeStyle = trail;
    ctx.lineWidth   = 1.3;
    ctx.beginPath();
    ctx.moveTo(ss.x, ss.y);
    ctx.lineTo(ss.x - ss.dx * 55, ss.y - ss.dy * 55);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── entity factories ─────────────────────────────────────────────────────────
function mkParticle(pd, W, H) {
  const x = rnd(0, W);
  const y = pd === 'up' ? H + rnd(0, 15) : pd === 'down' ? -rnd(0, 15) : rnd(0, H);
  if (pd === 'up')
    return { x, y, vx: rnd(-.22, .22), vy: rnd(-.55, -1.4), r: rnd(2, 5.5),
             col: `rgb(${rnd(0,40)|0},${rnd(180,218)|0},${rnd(0,20)|0})`, a: rnd(.28, .75) };
  if (pd === 'down')
    return { x, y, vx: rnd(-.28, .28), vy: rnd(.3, 1.1), r: rnd(1.5, 4.5),
             col: `rgb(${rnd(210,255)|0},${rnd(20,58)|0},${rnd(20,52)|0})`, a: rnd(.24, .68) };
  return { x, y, vx: rnd(-.14, .14), vy: rnd(-.14, .14), r: rnd(1.5, 3.5),
           col: '#6e6e7e', a: rnd(.10, .32), ph: rnd(0, Math.PI * 2) };
}

function mkCloud(i, m) {
  return { x: rnd(0, 1), y: .22 + i * .13 + rnd(-.05, .05),
           rw: rnd(m ? 75 : 115, m ? 170 : 260), rh: rnd(26, 65),
           spd: rnd(4.5e-5, 1.1e-4), a: rnd(.07, .15) };
}

function mkBird() {
  return { x: rnd(-.1, 1.1), y: rnd(.12, .54), spd: rnd(7e-5, 1.9e-4),
           sz: rnd(4, 9), fp: rnd(0, Math.PI * 2), fs: rnd(2, 4) };
}

function mkStar() {
  return { x: rnd(0, 1), y: rnd(0, .88), r: rnd(.5, 2.1),
           a: rnd(.38, 1), col: ['#ffffff','#eaf0ff','#fff9ef','#ccd8ff'][Math.floor(rnd(0, 4))],
           ts: rnd(.5, 2.5), tp: rnd(0, Math.PI * 2) };
}

function mkShootingStar(W, H) {
  const ang = rnd(.32, .82);
  return { x: rnd(.08, .65) * W, y: rnd(.04, .38) * H,
           dx: Math.cos(ang), dy: Math.sin(ang),
           spd: rnd(4.2, 8.5), a: 0, ph: 0, alive: true };
}

function initEntities(pd, mobile) {
  const pc = mobile ? 16 : 40;
  const sc = mobile ? 24 : 50;
  const cc = mobile ? 2 : 4;
  const bc = mobile ? 3 : 6;
  return {
    particles: Array.from({ length: pc }, () => mkParticle(pd, 1920, 1080)),
    clouds:    Array.from({ length: cc }, (_, i) => mkCloud(i, mobile)),
    birds:     Array.from({ length: bc }, () => mkBird()),
    stars:     Array.from({ length: sc }, () => mkStar()),
    ss:        null,
    ssCd:      rnd(3, 9),
  };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function AmbientBackground({ marketState, portfolioDirection }) {
  const canvasRef  = useRef(null);
  const stateRef   = useRef({ marketState, portfolioDirection });
  const entRef     = useRef(null);
  const rafRef     = useRef(null);

  // keep stateRef current on every render (no re-mount needed)
  useEffect(() => { stateRef.current = { marketState, portfolioDirection }; }, [marketState, portfolioDirection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile  = window.innerWidth < 768 || (navigator.hardwareConcurrency || 4) <= 2;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);

    // ── reduced-motion: static gradient, repaint on resize only ─────────────
    if (reduced) {
      ro.disconnect();
      const ro2 = new ResizeObserver(() => {
        resize();
        paintBg(ctx, canvas.width, canvas.height, stateRef.current.marketState);
      });
      ro2.observe(document.documentElement);
      paintBg(ctx, canvas.width, canvas.height, marketState);
      return () => ro2.disconnect();
    }

    // ── animated loop ────────────────────────────────────────────────────────
    entRef.current = initEntities(portfolioDirection, mobile);
    let t = 0, last = performance.now(), prevPd = portfolioDirection;

    function frame(now) {
      rafRef.current = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t   += dt;

      const { marketState: ms, portfolioDirection: pd } = stateRef.current;
      const ent = entRef.current;
      const W   = canvas.width, H = canvas.height;

      // re-init particles when direction flips
      if (pd !== prevPd) {
        ent.particles = Array.from({ length: ent.particles.length }, () => mkParticle(pd, W, H));
        prevPd = pd;
      }

      ctx.clearRect(0, 0, W, H);

      // draw
      if      (ms === 'premarket')                         drawPremarket(ctx, W, H, t, ent);
      else if (ms === 'open')                              drawOpen(ctx, W, H, t, pd, ent);
      else if (ms === 'afterhours')                        drawAfterHours(ctx, W, H, t, ent);
      else if (ms === 'overnight' || ms === 'evening')     drawOvernight(ctx, W, H, t, ent);
      else                                                 { paintBg(ctx, W, H, 'closed'); }

      // update — open particles
      if (ms === 'open') {
        ent.particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (pd === 'flat') {
            p.vx = clamp(p.vx + rnd(-.04, .04), -.3, .3);
            p.vy = clamp(p.vy + rnd(-.04, .04), -.3, .3);
          }
          if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20)
            Object.assign(p, mkParticle(pd, W, H));
        });
      }

      // update — clouds (premarket)
      if (ms === 'premarket')
        ent.clouds.forEach(c => { c.x += c.spd; if (c.x > 1.3) c.x = -.3; });

      // update — birds (afterhours)
      if (ms === 'afterhours')
        ent.birds.forEach(b => {
          b.x  += b.spd;
          b.fp += b.fs * dt;
          if (b.x > 1.2) { b.x = -.1; b.y = rnd(.12, .54); }
        });

      // update — shooting star (overnight/evening)
      if (ms === 'overnight' || ms === 'evening') {
        ent.ssCd -= dt;
        if (ent.ssCd <= 0 && !ent.ss) { ent.ss = mkShootingStar(W, H); ent.ssCd = rnd(4, 9); }
        if (ent.ss) {
          ent.ss.x  += ent.ss.dx * ent.ss.spd;
          ent.ss.y  += ent.ss.dy * ent.ss.spd;
          ent.ss.ph += dt * 2.2;
          ent.ss.a   = clamp(Math.sin(ent.ss.ph * Math.PI), 0, 1);
          if (ent.ss.ph >= 1) ent.ss = null;
        }
      }
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: 0, pointerEvents: 'none', display: 'block',
      }}
    />
  );
}
