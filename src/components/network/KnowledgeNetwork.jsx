import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { getQuotes } from '../../api.js';
import { buildNetworkData, severityColor, stanceColor } from '../../utils/networkGraph.js';

const imgCache = {};
function getImg(src) {
  if (!src) return null;
  if (!imgCache[src]) {
    const img = new Image();
    img.src = src;
    imgCache[src] = img;
  }
  return imgCache[src];
}

// ---------------------------------------------------------------------------
// Force simulation — lightweight custom spring physics (no d3-force dependency)
// ---------------------------------------------------------------------------

function anchorFor(node, w, h) {
  if (node.type === 'agent' && node.refId === 'axiom') return { x: w / 2, y: h / 2 };
  if (node.type === 'agent') {
    const idx = ['rex', 'nova', 'sage', 'atlas', 'vega', 'zen'].indexOf(node.refId);
    const n = idx >= 0 ? idx : 0;
    const angle = (n / 6) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(w, h) * 0.32;
    return { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r };
  }
  if (node.type === 'holding') {
    const r = Math.min(w, h) * 0.46;
    // spread deterministically by ticker hash so layout is stable across renders
    const hash = [...node.refId].reduce((a, c) => a + c.charCodeAt(0), 0);
    const angle = (hash % 360) * (Math.PI / 180);
    return { x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r };
  }
  return { x: w / 2 + (Math.random() - 0.5) * w * 0.5, y: h / 2 + (Math.random() - 0.5) * h * 0.5 };
}

function stepSimulation(nodesRef, edges, w, h, dt) {
  const list = [...nodesRef.values()];
  const REPULSE = 1800;
  const CENTER_PULL = 0.0025;
  const DAMPING = 0.86;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    let fx = 0, fy = 0;

    // Repulsion between all node pairs
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const b = list[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      const d = Math.sqrt(d2);
      const force = REPULSE / d2;
      fx += (dx / d) * force;
      fy += (dy / d) * force;
    }

    // Gentle pull toward type-based anchor point (keeps layout organized + stable)
    const anchor = a.anchor || { x: w / 2, y: h / 2 };
    fx += (anchor.x - a.x) * CENTER_PULL * 40;
    fy += (anchor.y - a.y) * CENTER_PULL * 40;

    a.fx = fx; a.fy = fy;
  }

  // Spring attraction along edges
  edges.forEach(e => {
    const s = nodesRef.get(e.source), t = nodesRef.get(e.target);
    if (!s || !t) return;
    const dx = t.x - s.x, dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetLen = 90 + (1 - (e.strength || 0.3)) * 90;
    const k = 0.02 * (e.strength || 0.3);
    const f = (dist - targetLen) * k;
    const fx = (dx / dist) * f, fy = (dy / dist) * f;
    s.fx += fx; s.fy += fy;
    t.fx -= fx; t.fy -= fy;
  });

  list.forEach(n => {
    n.vx = (n.vx + n.fx * dt) * DAMPING;
    n.vy = (n.vy + n.fy * dt) * DAMPING;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    // gentle organic drift so the network never looks frozen
    n.driftPhase = (n.driftPhase || Math.random() * 1000) + dt * 0.4;
    n.x += Math.sin(n.driftPhase) * 0.04;
    n.y += Math.cos(n.driftPhase * 0.8) * 0.04;
  });
}

function quadPoint(sx, sy, tx, ty, curve, t) {
  const mx = (sx + tx) / 2 - (ty - sy) * curve;
  const my = (sy + ty) / 2 + (tx - sx) * curve;
  const u = 1 - t;
  return {
    x: u * u * sx + 2 * u * t * mx + t * t * tx,
    y: u * u * sy + 2 * u * t * my + t * t * ty,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgeNetwork({ dark = true, uid, holdings = [], onSelect, height = '46vh' }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const nodesRef = useRef(new Map());   // id -> {x,y,vx,vy,anchor,...data}
  const edgesRef = useRef([]);
  const pulsesRef = useRef([]);         // [{edgeId, start, duration, color, reverse}]
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, moved: false, pinchDist: null });
  const rafRef = useRef(null);
  const seenFeedIds = useRef(new Set());
  const feedInitRef = useRef(false);
  const seenMemory = useRef(new Map()); // id -> last stance value
  const memoryInitRef = useRef(false);
  const seenReportIds = useRef(new Set());
  const reportInitRef = useRef(false);

  const [feedItems, setFeedItems] = useState([]);
  const [memoryDocs, setMemoryDocs] = useState({});
  const [reports, setReports] = useState([]);
  const [agentStats, setAgentStats] = useState({});
  const [quotes, setQuotes] = useState({});
  const [proposalCounts, setProposalCounts] = useState({});
  const [dims, setDims] = useState({ w: 320, h: 320 });

  function queuePulse(edgeId, opts = {}) {
    if (!edgeId) return;
    pulsesRef.current.push({
      edgeId, start: performance.now(), duration: opts.duration || 1000,
      color: opts.color || '#38e0d4', reverse: !!opts.reverse, width: opts.width || 3.5,
    });
  }

  function flashNode(id, ms = 900) {
    const n = nodesRef.current.get(id);
    if (n) n.flashUntil = performance.now() + ms;
  }

  // ---- Firestore subscriptions: agent_feed, agent_memory, council_reports ----
  useEffect(() => {
    if (!uid) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const unsubFeed = onSnapshot(
      query(collection(db, 'users', uid, 'agent_feed'), where('createdAt', '>', sevenDaysAgo), orderBy('createdAt', 'desc'), limit(60)),
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFeedItems(items);

        if (feedInitRef.current) {
          snap.docChanges().forEach(ch => {
            if (ch.type !== 'added') return;
            const item = { id: ch.doc.id, ...ch.doc.data() };
            if (seenFeedIds.current.has(item.id)) return;
            seenFeedIds.current.add(item.id);
            const tickers = item.tickers?.length ? item.tickers : (item.ticker ? [item.ticker] : []);
            if (item.agentId) {
              if (item.agentId === 'axiom') {
                // AXIOM verdict feed item: inbound wave from all agents into AXIOM.
                // The outbound wave to holdings fires separately off the council_reports
                // listener below, once the real report doc (with its insight node ids) lands.
                ['rex', 'nova', 'sage', 'atlas', 'vega', 'zen'].forEach((id, i) => {
                  setTimeout(() => queuePulse(`axiom-${id}`, { reverse: true, color: '#F59E0B', duration: 900 }), i * 80);
                });
                setTimeout(() => flashNode('axiom'), 700);
              } else {
                queuePulse(`agent_${item.agentId}-event_${item.id}`, { color: severityColor(item.severity), duration: 1000 });
                flashNode(`agent_${item.agentId}`, 600);
                tickers.forEach((t, i) => setTimeout(() => queuePulse(`event_${item.id}-holding_${t}`, { color: severityColor(item.severity), duration: 900 }), 200 + i * 100));
              }
            }
          });
        } else {
          items.forEach(i => seenFeedIds.current.add(i.id));
          feedInitRef.current = true;
        }
      },
      () => {}
    );

    const unsubMemory = onSnapshot(
      collection(db, 'users', uid, 'agent_memory'),
      snap => {
        const docs = {};
        snap.docs.forEach(d => { docs[d.id] = { id: d.id, ...d.data() }; });
        setMemoryDocs(docs);

        if (memoryInitRef.current) {
          snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') return;
            const data = ch.doc.data();
            const key = ch.doc.id; // agentId__TICKER
            const [agentId, ticker] = key.split('__');
            const prevStance = seenMemory.current.get(key);
            seenMemory.current.set(key, data.stance);
            if (prevStance === undefined || prevStance === data.stance) return;
            if (ticker === '_GLOBAL') return; // global outlook changes don't map to a holding edge

            const isFlip = (prevStance === 'bullish' && data.stance === 'bearish') || (prevStance === 'bearish' && data.stance === 'bullish');
            const edgeId = `agent_${agentId}-holding_${ticker}`;
            const color = stanceColor(data.stance);
            if (isFlip) {
              flashNode(`agent_${agentId}`, 1000);
              queuePulse(edgeId, { color, duration: 700 });
              setTimeout(() => queuePulse(edgeId, { color, duration: 700 }), 220);
            } else {
              queuePulse(edgeId, { color, duration: 900 });
            }

            // Two agents disagree on the same ticker → crackle between them
            Object.entries(docs).forEach(([k2, d2]) => {
              if (k2 === key || !k2.endsWith(`__${ticker}`)) return;
              const otherAgent = k2.split('__')[0];
              const disagree = (data.stance === 'bullish' && d2.stance === 'bearish') || (data.stance === 'bearish' && d2.stance === 'bullish');
              if (!disagree) return;
              const pairId = [agentId, otherAgent].sort().join('-') + '-agree';
              for (let k = 0; k < 4; k++) {
                setTimeout(() => queuePulse(pairId, { color: '#EF4444', duration: 380, reverse: k % 2 === 1 }), k * 140);
              }
            });
          });
        } else {
          snap.docs.forEach(d => seenMemory.current.set(d.id, d.data().stance));
          memoryInitRef.current = true;
        }
      },
      () => {}
    );

    const unsubReports = onSnapshot(
      query(collection(db, 'users', uid, 'council_reports'), orderBy('createdAt', 'desc'), limit(6)),
      snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setReports(items);

        if (reportInitRef.current) {
          snap.docChanges().forEach(ch => {
            if (ch.type !== 'added' || seenReportIds.current.has(ch.doc.id)) return;
            seenReportIds.current.add(ch.doc.id);
            const report = { id: ch.doc.id, ...ch.doc.data() };
            // AXIOM verdict outbound wave: AXIOM -> each ticker's insight node -> that holding
            Object.keys(report.results || {}).forEach((ticker, i) => {
              const insightId = `insight_${report.id}_${ticker}`;
              setTimeout(() => {
                queuePulse(`axiom-${insightId}`, { color: '#F59E0B', duration: 900 });
                setTimeout(() => queuePulse(`${insightId}-holding_${ticker}`, { color: '#F59E0B', duration: 800 }), 500);
              }, i * 120);
            });
          });
        } else {
          items.forEach(r => seenReportIds.current.add(r.id));
          reportInitRef.current = true;
        }
      },
      () => {}
    );

    const unsubStats = onSnapshot(collection(db, 'users', uid, 'agent_stats'), snap => {
      const out = {};
      snap.docs.forEach(d => { out[d.id] = d.data(); });
      setAgentStats(out);
    }, () => {});

    const unsubProposals = onSnapshot(collection(db, 'users', uid, 'agent_proposals'), snap => {
      const counts = {};
      snap.docs.forEach(d => {
        const p = d.data();
        if (p.status === 'pending') counts[p.agentId] = (counts[p.agentId] || 0) + 1;
      });
      setProposalCounts(counts);
    }, () => {});

    return () => { unsubFeed(); unsubMemory(); unsubReports(); unsubStats(); unsubProposals(); };
  }, [uid]);

  // ---- Quotes for holding nodes ----
  useEffect(() => {
    if (!holdings.length) return;
    getQuotes(holdings).then(setQuotes).catch(() => {});
  }, [holdings.join(',')]);

  // ---- Rebuild graph data whenever inputs change; merge into physics nodesRef ----
  useEffect(() => {
    const { nodes, edges } = buildNetworkData({ feedItems, memoryDocs, agentStats, reports, holdings, quotes, proposalCounts });
    edgesRef.current = edges;

    const { w, h } = dims;
    const nextIds = new Set(nodes.map(n => n.id));
    // Remove stale nodes
    [...nodesRef.current.keys()].forEach(id => { if (!nextIds.has(id)) nodesRef.current.delete(id); });
    // Add/update
    nodes.forEach(n => {
      const anchor = anchorFor(n, w, h);
      const existing = nodesRef.current.get(n.id);
      if (existing) {
        Object.assign(existing, n, { x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, anchor });
      } else {
        nodesRef.current.set(n.id, {
          ...n, anchor,
          x: anchor.x + (Math.random() - 0.5) * 40,
          y: anchor.y + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
        });
      }
    });
  }, [feedItems, memoryDocs, reports, agentStats, quotes, proposalCounts, holdings.join(','), dims.w, dims.h]);

  // ---- Resize observer ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect;
        setDims({ w: Math.max(width, 100), h: Math.max(h, 100) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Draw loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let last = performance.now();

    function draw(now) {
      const dt = Math.min((now - last) / 16.67, 2.5);
      last = now;
      const { w, h } = dims;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = dark ? '#020408' : '#0b0d10';
      ctx.fillRect(0, 0, w, h);

      stepSimulation(nodesRef.current, edgesRef.current, w, h, dt);

      const { zoom, panX, panY } = viewRef.current;
      ctx.save();
      ctx.translate(w / 2 + panX, h / 2 + panY);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);

      // Edges
      edgesRef.current.forEach(e => {
        const s = nodesRef.current.get(e.source), t = nodesRef.current.get(e.target);
        if (!s || !t) return;
        const curve = e.kind === 'hub' ? 0.06 : 0.12;
        ctx.beginPath();
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
          const p = quadPoint(s.x, s.y, t.x, t.y, curve, i / steps);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        const disagreements = e.metadata?.disagreements || 0;
        ctx.strokeStyle = e.color || (disagreements > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)');
        ctx.lineWidth = e.kind === 'stance' ? 1 + (e.metadata?.conviction || 5) / 10 : e.kind === 'agent-agent' ? 0.6 + disagreements * 0.4 : 0.8;
        ctx.globalAlpha = e.kind === 'hub' ? 0.25 : 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Pulses
      const nowT = performance.now();
      pulsesRef.current = pulsesRef.current.filter(p => nowT - p.start < p.duration);
      pulsesRef.current.forEach(p => {
        const e = edgesRef.current.find(ed => ed.id === p.edgeId);
        if (!e) return;
        const s = nodesRef.current.get(e.source), t = nodesRef.current.get(e.target);
        if (!s || !t) return;
        let prog = (nowT - p.start) / p.duration;
        if (p.reverse) prog = 1 - prog;
        const curve = e.kind === 'hub' ? 0.06 : 0.12;
        const pt = quadPoint(s.x, s.y, t.x, t.y, curve, Math.max(0, Math.min(1, prog)));
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 10;
        ctx.arc(pt.x, pt.y, p.width, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Nodes
      [...nodesRef.current.values()].forEach(n => {
        const r = (n.size || 1) * 11;
        const flashing = n.flashUntil && nowT < n.flashUntil;
        if (flashing) {
          const glowR = r + 10 + Math.sin(nowT / 60) * 4;
          ctx.beginPath();
          ctx.fillStyle = (n.color || '#38e0d4') + '55';
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = (n.color || '#71717A') + (n.type === 'event' ? '33' : '22');
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = n.color || '#71717A';
        ctx.stroke();

        if (n.avatar && n.type === 'agent') {
          const img = getImg(n.avatar);
          if (img && img.complete && img.naturalWidth) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, n.x - r, n.y - r, r * 2, r * 2);
            ctx.restore();
          }
        }
        ctx.restore();

        // Label
        if (zoom > 0.55 || n.type === 'agent') {
          ctx.font = n.type === 'agent' ? '600 11px monospace' : '9px monospace';
          ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.75)';
          ctx.textAlign = 'center';
          ctx.fillText(n.label || '', n.x, n.y + r + 12);
        }
      });

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims, dark]);

  // ---- Pointer interaction: pan / tap / pinch-zoom / double-tap reset ----
  const lastTapRef = useRef(0);
  const hitTest = useCallback((screenX, screenY) => {
    const { w, h } = dims;
    const { zoom, panX, panY } = viewRef.current;
    const wx = (screenX - w / 2 - panX) / zoom + w / 2;
    const wy = (screenY - h / 2 - panY) / zoom + h / 2;
    let closest = null, closestD = Infinity;
    nodesRef.current.forEach(n => {
      const r = (n.size || 1) * 11 + 4;
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= r && d < closestD) { closest = n; closestD = d; }
    });
    if (closest) return closest;

    // No node hit — check edges (point-to-segment distance, straight-line approximation)
    const threshold = 8 / zoom;
    let closestEdge = null, closestEdgeD = Infinity;
    edgesRef.current.forEach(e => {
      const s = nodesRef.current.get(e.source), t = nodesRef.current.get(e.target);
      if (!s || !t) return;
      const dx = t.x - s.x, dy = t.y - s.y;
      const lenSq = dx * dx + dy * dy || 1;
      let u = ((wx - s.x) * dx + (wy - s.y) * dy) / lenSq;
      u = Math.max(0, Math.min(1, u));
      const px = s.x + u * dx, py = s.y + u * dy;
      const d = Math.hypot(px - wx, py - wy);
      if (d <= threshold && d < closestEdgeD) { closestEdge = e; closestEdgeD = d; }
    });
    if (closestEdge) {
      const s = nodesRef.current.get(closestEdge.source), t = nodesRef.current.get(closestEdge.target);
      return { id: `edge_${closestEdge.id}`, type: 'connection', edge: closestEdge, source: s, target: t, color: closestEdge.color };
    }
    return null;
  }, [dims]);

  function onPointerDown(e) {
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = { dragging: true, lastX: e.clientX - rect.left, lastY: e.clientY - rect.top, moved: false };
  }
  function onPointerMove(e) {
    if (!dragRef.current.dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - dragRef.current.lastX, dy = y - dragRef.current.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    viewRef.current.panX += dx;
    viewRef.current.panY += dy;
    dragRef.current.lastX = x; dragRef.current.lastY = y;
  }
  function onPointerUp(e) {
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (!dragRef.current.moved) {
      const now = performance.now();
      if (now - lastTapRef.current < 300) {
        viewRef.current.zoom = 1; viewRef.current.panX = 0; viewRef.current.panY = 0;
      } else {
        const hit = hitTest(x, y);
        if (hit) onSelect?.(hit);
        else onSelect?.(null);
      }
      lastTapRef.current = now;
    }
    dragRef.current.dragging = false;
  }
  function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    viewRef.current.zoom = Math.min(3, Math.max(0.4, viewRef.current.zoom + delta));
  }

  // Basic touch pinch
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      dragRef.current.pinchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      dragRef.current.pinchStartZoom = viewRef.current.zoom;
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && dragRef.current.pinchDist) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = d / dragRef.current.pinchDist;
      viewRef.current.zoom = Math.min(3, Math.max(0.4, dragRef.current.pinchStartZoom * ratio));
    }
  }
  function onTouchEnd() { dragRef.current.pinchDist = null; }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height, borderRadius: 16, overflow: 'hidden', background: '#020408', flexShrink: 0, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab' }} />
      <div style={{
        position: 'absolute', bottom: 8, right: 10,
        fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)',
        background: 'rgba(0,0,0,0.5)', padding: '2px 7px', borderRadius: 4,
        pointerEvents: 'none',
      }}>
        {nodesRef.current.size} nodes · drag to pan · pinch/scroll to zoom · tap a node
      </div>
    </div>
  );
}
