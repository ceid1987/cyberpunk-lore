"use client";

import { animate } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import layout from "@/data/generated/graph-layout.json";
import { clusterById, clusters, eventById, type ClusterId, type LoreEvent, type Relation } from "@/data";
import { tierAllowed, useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion, type TierLevel } from "@/lib/store";
import { Icon } from "./ui";

// ---------------------------------------------------------------------------
// Relevance map. Rendering is a single <canvas> for performance on mid-range
// phones; positions come from the build-time d3-force layout
// (scripts/layout-graph.ts), so there's no physics running on the device.
//
// Level of detail:
//  * Clusters start collapsed into one labeled bubble each; tap to expand.
//  * Inside expanded clusters, the visible tiers are max(toggle, zoom-tier):
//    zoom in to reveal major, then minor events.
//  * Only nodes and edges inside the viewport are drawn; labels appear by tier
//    as you zoom.
// ---------------------------------------------------------------------------

const NODES = layout.nodes as unknown as Record<string, [number, number]>;
const CLUSTERS = layout.clusters as unknown as Record<string, { x: number; y: number; r: number }>;
const R = { landmark: 11, major: 7, minor: 4.5 } as const;

type T = { k: number; x: number; y: number };

export interface GraphHandle {
  positions(ids?: string[]): Record<string, { x: number; y: number; r: number }>;
}

export const EDGE_STYLE: Record<Relation, { dash: number[]; width: number; arrow: boolean; label: string }> = {
  caused: { dash: [], width: 1.6, arrow: true, label: "Caused" },
  "led-to": { dash: [6, 4], width: 1.4, arrow: true, label: "Led to" },
  "part-of": { dash: [1.5, 3.5], width: 1.4, arrow: false, label: "Part of" },
  involves: { dash: [], width: 0.8, arrow: false, label: "Involves" },
};

const GraphView = forwardRef<GraphHandle, { hidden?: boolean }>(function GraphView({ hidden }, ref) {
  const { state, dispatch } = useStore();
  const filtered = useFilteredEvents();
  const isHidden = useIsHidden();
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 375, h: 600 });
  const [t, setT] = useState<T>({ k: 0.3, x: 187, y: 300 });
  const tRef = useRef(t);
  tRef.current = t;
  const [expanded, setExpanded] = useState<Set<ClusterId>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const fitK = useRef(0.3);

  // ---- sizing
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const activeClusters = useMemo(() => clusters.filter((c) => filtered.some((e) => e.cluster === c.id) && CLUSTERS[c.id]), [filtered]);

  const fitTo = useCallback(
    (box: { x0: number; y0: number; x1: number; y1: number }, animateIt = true) => {
      const pad = 24;
      const k = Math.min((size.w - pad * 2) / (box.x1 - box.x0), (size.h - pad * 2 - 60) / (box.y1 - box.y0));
      const target = { k, x: size.w / 2 - ((box.x0 + box.x1) / 2) * k, y: size.h / 2 - 20 - ((box.y0 + box.y1) / 2) * k };
      if (!animateIt || reduced) return setT(target);
      const from = tRef.current;
      animate(0, 1, { duration: 0.55, ease: [0.2, 0.8, 0.2, 1], onUpdate: (p) => setT({ k: from.k + (target.k - from.k) * p, x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p }) });
    },
    [size, reduced],
  );

  const fitAll = useCallback(
    (animateIt = true) => {
      const cs = activeClusters.map((c) => CLUSTERS[c.id]);
      if (!cs.length) return;
      const box = { x0: Math.min(...cs.map((c) => c.x - c.r)), y0: Math.min(...cs.map((c) => c.y - c.r)), x1: Math.max(...cs.map((c) => c.x + c.r)), y1: Math.max(...cs.map((c) => c.y + c.r)) };
      const k = Math.min((size.w - 48) / (box.x1 - box.x0), (size.h - 108) / (box.y1 - box.y0));
      fitK.current = k;
      fitTo(box, animateIt);
    },
    [activeClusters, fitTo, size],
  );

  const didFit = useRef(false);
  useEffect(() => {
    if (size.w > 0 && !didFit.current) {
      didFit.current = true;
      fitAll(false);
    }
  }, [size, fitAll]);

  // ---- level of detail
  const zoomRel = t.k / fitK.current;
  const zoomTier: TierLevel = zoomRel > 3.4 ? 2 : zoomRel > 1.9 ? 1 : 0;
  const effTier = Math.max(state.tierLevel, zoomTier) as TierLevel;

  const visibleNodes = useMemo(() => filtered.filter((e) => expanded.has(e.cluster) && tierAllowed(e.tier, effTier) && NODES[e.id]), [filtered, expanded, effTier]);
  const visibleSet = useMemo(() => new Set(visibleNodes.map((e) => e.id)), [visibleNodes]);

  // Neighborhood highlight for the selected event.
  const focus = state.selectedId && visibleSet.has(state.selectedId) ? state.selectedId : null;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const r of eventById[focus].related) s.add(r.id);
    for (const e of visibleNodes) if (e.related.some((r) => r.id === focus)) s.add(e.id);
    return s;
  }, [focus, visibleNodes]);

  const edges = useMemo(() => {
    const out: { a: LoreEvent; b: LoreEvent; rel: Relation }[] = [];
    for (const e of visibleNodes)
      for (const r of e.related) {
        if (!visibleSet.has(r.id)) continue;
        out.push({ a: e, b: eventById[r.id], rel: r.relation });
      }
    return out;
  }, [visibleNodes, visibleSet]);

  // Aggregated bubble-to-bubble links for collapsed clusters.
  const bubbleLinks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of filtered)
      for (const r of e.related) {
        const o = eventById[r.id];
        if (!o || o.cluster === e.cluster) continue;
        const k = [e.cluster, o.cluster].sort().join("|");
        m[k] = (m[k] ?? 0) + 1;
      }
    return Object.entries(m).map(([k, n]) => ({ a: k.split("|")[0] as ClusterId, b: k.split("|")[1] as ClusterId, n }));
  }, [filtered]);

  const counts = useMemo(() => {
    const m: Record<string, { all: number; shown: number }> = {};
    for (const e of filtered) {
      m[e.cluster] ??= { all: 0, shown: 0 };
      m[e.cluster].all++;
      if (tierAllowed(e.tier, effTier)) m[e.cluster].shown++;
    }
    return m;
  }, [filtered, effTier]);

  // ---- drawing
  const toScreen = (x: number, y: number, tt = t) => ({ x: x * tt.k + tt.x, y: y * tt.k + tt.y });

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size.w * dpr)) cv.width = Math.round(size.w * dpr);
    if (cv.height !== Math.round(size.h * dpr)) cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // faint grid
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    const g = 80 * t.k < 24 ? 400 : 80;
    const gs = g * t.k;
    for (let x = ((t.x % gs) + gs) % gs; x < size.w; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.h);
      ctx.stroke();
    }
    for (let y = ((t.y % gs) + gs) % gs; y < size.h; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size.w, y);
      ctx.stroke();
    }

    const inView = (x: number, y: number, r: number) => x + r > -40 && x - r < size.w + 40 && y + r > -40 && y - r < size.h + 40;

    // bubble links (only between two collapsed clusters)
    const maxN = Math.max(1, ...bubbleLinks.map((l) => l.n));
    for (const l of bubbleLinks) {
      if (expanded.has(l.a) || expanded.has(l.b)) continue;
      if (!activeClusters.some((c) => c.id === l.a) || !activeClusters.some((c) => c.id === l.b)) continue;
      const A = toScreen(CLUSTERS[l.a].x, CLUSTERS[l.a].y);
      const B = toScreen(CLUSTERS[l.b].x, CLUSTERS[l.b].y);
      ctx.strokeStyle = `rgba(185,195,215,${0.07 + (l.n / maxN) * 0.25})`;
      ctx.lineWidth = 1 + (l.n / maxN) * 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    // expanded cluster halos
    for (const c of activeClusters) {
      if (!expanded.has(c.id)) continue;
      const b = CLUSTERS[c.id];
      const p = toScreen(b.x, b.y);
      const r = b.r * t.k;
      if (!inView(p.x, p.y, r)) continue;
      ctx.fillStyle = c.color + "0d";
      ctx.strokeStyle = c.color + "40";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 ${Math.max(11, Math.min(15, 12 * Math.sqrt(t.k / fitK.current)))}px "Chakra Petch", sans-serif`;
      ctx.fillStyle = c.color + "cc";
      ctx.textAlign = "center";
      ctx.fillText((t.k / fitK.current > 2 ? c.name : c.short).toUpperCase(), p.x, p.y - r - 6);
    }

    // edges
    for (const ed of edges) {
      const [ax, ay] = NODES[ed.a.id];
      const [bx, by] = NODES[ed.b.id];
      const A = toScreen(ax, ay);
      const B = toScreen(bx, by);
      if (!inView(A.x, A.y, 0) && !inView(B.x, B.y, 0)) continue;
      const st = EDGE_STYLE[ed.rel];
      const lit = !neighbors || (neighbors.has(ed.a.id) && neighbors.has(ed.b.id) && (ed.a.id === focus || ed.b.id === focus));
      ctx.globalAlpha = lit ? (neighbors ? 0.95 : 0.45) : 0.06;
      ctx.strokeStyle = lit && neighbors ? "#e9e9f2" : "#8a8aa6";
      ctx.lineWidth = st.width * (lit && neighbors ? 1.4 : 1);
      ctx.setLineDash(st.dash);
      // arrow points toward the "effect": caused => b->a, led-to => a->b
      let [from, to] = [A, B];
      if (ed.rel === "caused") [from, to] = [B, A];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (st.arrow && t.k / fitK.current > 1.2) {
        const target = ed.rel === "caused" ? ed.a : ed.b;
        const rr = R[target.tier] * Math.max(0.45, Math.min(1.6, t.k * 1.5)) + 3;
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const tx = to.x - Math.cos(ang) * rr;
        const ty = to.y - Math.sin(ang) * rr;
        ctx.fillStyle = ctx.strokeStyle as string;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - Math.cos(ang - 0.45) * 7, ty - Math.sin(ang - 0.45) * 7);
        ctx.lineTo(tx - Math.cos(ang + 0.45) * 7, ty - Math.sin(ang + 0.45) * 7);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // nodes
    const scaleR = Math.max(0.45, Math.min(1.6, t.k * 1.5));
    const labelTier = zoomRel > 4.5 ? 2 : zoomRel > 2.4 ? 1 : zoomRel > 1.15 ? 0 : -1;
    const labels: { e: LoreEvent; x: number; y: number; rank: number; pri: number }[] = [];
    for (const e of visibleNodes) {
      const [x, y] = NODES[e.id];
      const p = toScreen(x, y);
      const r = R[e.tier] * scaleR;
      if (!inView(p.x, p.y, r)) continue;
      const col = clusterById[e.cluster].color;
      const hid = isHidden(e);
      const dim = neighbors && !neighbors.has(e.id);
      ctx.globalAlpha = dim ? 0.15 : 1;
      if (e.tier === "landmark" && !hid && !dim) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = hid ? "#2a2a3a" : col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (state.viewed.includes(e.id)) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (e.id === focus) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const rank = e.tier === "landmark" ? 0 : e.tier === "major" ? 1 : 2;
      const isNb = !!neighbors && neighbors.has(e.id);
      if (!hid && (rank <= labelTier || isNb)) labels.push({ e, x: p.x, y: p.y + r + 13, rank, pri: (e.id === focus ? -10 : 0) + (isNb ? -5 : 0) + rank });
    }
    ctx.globalAlpha = 1;
    // Labels: highest priority first, skip any that would overlap one already placed.
    labels.sort((a, b) => a.pri - b.pri);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of labels) {
      ctx.font = `${l.rank === 0 ? 600 : 500} ${l.rank === 0 ? 12.5 : 11}px "Chakra Petch", sans-serif`;
      const text = l.e.title.length > 34 ? l.e.title.slice(0, 32) + "…" : l.e.title;
      const w = ctx.measureText(text).width;
      const box = { x0: l.x - w / 2 - 2, y0: l.y - 11, x1: l.x + w / 2 + 2, y1: l.y + 3 };
      if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      placed.push(box);
      ctx.textAlign = "center";
      ctx.globalAlpha = neighbors && !neighbors.has(l.e.id) ? 0.3 : 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#07070b";
      ctx.strokeText(text, l.x, l.y);
      ctx.fillStyle = l.rank === 0 ? "#e9e9f2" : "#a9a9c0";
      ctx.fillText(text, l.x, l.y);
    }
    ctx.globalAlpha = 1;

    // collapsed bubbles
    for (const c of activeClusters) {
      if (expanded.has(c.id)) continue;
      const b = CLUSTERS[c.id];
      const p = toScreen(b.x, b.y);
      const n = counts[c.id]?.shown ?? 0;
      const r = Math.max(26, Math.min(b.r * t.k * 0.62, 18 + Math.sqrt(counts[c.id]?.all ?? 1) * 6 * Math.max(1, t.k / fitK.current)));
      if (!inView(p.x, p.y, r)) continue;
      const grad = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
      grad.addColorStop(0, c.color + "40");
      grad.addColorStop(1, c.color + "12");
      ctx.fillStyle = grad;
      ctx.strokeStyle = c.color + "cc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = c.color;
      ctx.font = `700 ${r > 40 ? 13 : 11}px "Chakra Petch", sans-serif`;
      ctx.fillText(c.short.toUpperCase(), p.x, p.y + 1);
      ctx.fillStyle = "#a9a9c0";
      ctx.font = `500 10.5px "Chakra Petch", sans-serif`;
      ctx.fillText(`${n} event${n === 1 ? "" : "s"}`, p.x, p.y + 15);
    }
  });

  // ---- interaction
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: T; d?: number; mid?: { x: number; y: number }; moved: number; down: { x: number; y: number }; t0: number } | null>(null);
  const lastTap = useRef(0);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setT((cur) => {
      const k = Math.max(fitK.current * 0.6, Math.min(fitK.current * 12, cur.k * factor));
      const f = k / cur.k;
      return { k, x: cx - (cx - cur.x) * f, y: cy - (cy - cur.y) * f };
    });
  };

  const hitTest = (sx: number, sy: number): { kind: "node"; e: LoreEvent } | { kind: "cluster"; id: ClusterId } | null => {
    let best: LoreEvent | null = null;
    let bd = Infinity;
    const scaleR = Math.max(0.45, Math.min(1.6, t.k * 1.5));
    for (const e of visibleNodes) {
      const [x, y] = NODES[e.id];
      const p = toScreen(x, y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < R[e.tier] * scaleR + 14 && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return { kind: "node", e: best };
    for (const c of activeClusters) {
      const b = CLUSTERS[c.id];
      const p = toScreen(b.x, b.y);
      if (expanded.has(c.id)) continue;
      if (Math.hypot(p.x - sx, p.y - sy) < Math.max(30, b.r * t.k * 0.62)) return { kind: "cluster", id: c.id };
    }
    return null;
  };

  const expandCluster = (id: ClusterId) => {
    setExpanded((s) => new Set(s).add(id));
    const b = CLUSTERS[id];
    const box = { x0: b.x - b.r, y0: b.y - b.r, x1: b.x + b.r, y1: b.y + b.r };
    fitTo(box);
  };

  const local = (ev: React.PointerEvent | React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const p = local(ev);
    pointers.current.set(ev.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) gesture.current = { start: t, moved: 0, down: p, t0: Date.now() };
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { start: t, d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: 99, down: p, t0: Date.now() };
    }
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!pointers.current.has(ev.pointerId) || !gesture.current) return;
    const p = local(ev);
    pointers.current.set(ev.pointerId, p);
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 1) {
      const dx = p.x - g.down.x;
      const dy = p.y - g.down.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      setT({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
    } else if (pts.length >= 2 && g.d && g.mid) {
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = Math.max(fitK.current * 0.6, Math.min(fitK.current * 12, g.start.k * (d / g.d)));
      const f = k / g.start.k;
      setT({ k, x: mid.x - (g.mid.x - g.start.x) * f, y: mid.y - (g.mid.y - g.start.y) * f });
    }
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      gesture.current = { start: tRef.current, moved: 99, down: p, t0: Date.now() };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved > 8 || Date.now() - g.t0 > 500) return;
    const p = local(ev);
    const now = Date.now();
    const hit = hitTest(p.x, p.y);
    if (hit?.kind === "node") dispatch({ type: "select", id: hit.e.id });
    else if (hit?.kind === "cluster") expandCluster(hit.id);
    else if (now - lastTap.current < 300) zoomAt(1.8, p.x, p.y);
    else if (state.selectedId) dispatch({ type: "select", id: null });
    lastTap.current = now;
  };
  const onWheel = (ev: React.WheelEvent) => {
    const p = local(ev);
    zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  };

  // Center on the selected event when it changes from elsewhere (search, sheet nav).
  useEffect(() => {
    if (hidden || !state.selectedId) return;
    const e = eventById[state.selectedId];
    if (!e || !NODES[e.id]) return;
    if (!expanded.has(e.cluster)) setExpanded((s) => new Set(s).add(e.cluster));
    const [x, y] = NODES[e.id];
    const cur = tRef.current;
    const p = { x: x * cur.k + cur.x, y: y * cur.k + cur.y };
    if (p.x > 40 && p.x < size.w - 40 && p.y > 60 && p.y < size.h * 0.4) return;
    const k = Math.max(cur.k, fitK.current * (e.tier === "landmark" ? 2 : e.tier === "major" ? 2.6 : 3.8));
    const target = { k, x: size.w / 2 - x * k, y: size.h * 0.25 - y * k };
    if (reduced) return setT(target);
    animate(0, 1, { duration: 0.5, onUpdate: (q) => setT({ k: cur.k + (target.k - cur.k) * q, x: cur.x + (target.x - cur.x) * q, y: cur.y + (target.y - cur.y) * q }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedId, hidden]);

  useImperativeHandle(ref, () => ({
    positions(ids?: string[]) {
      const out: Record<string, { x: number; y: number; r: number }> = {};
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return out;
      const cur = tRef.current;
      const scaleR = Math.max(0.45, Math.min(1.6, cur.k * 1.5));
      const list = ids ? ids.map((id) => eventById[id]).filter(Boolean) : filtered;
      for (const e of list) {
        if (!NODES[e.id]) continue;
        if (expanded.has(e.cluster)) {
          const [x, y] = NODES[e.id];
          out[e.id] = { x: rect.left + x * cur.k + cur.x, y: rect.top + y * cur.k + cur.y, r: R[e.tier] * scaleR };
        } else {
          const b = CLUSTERS[e.cluster];
          out[e.id] = { x: rect.left + b.x * cur.k + cur.x, y: rect.top + b.y * cur.k + cur.y, r: 6 };
        }
      }
      return out;
    },
  }));

  const allExpanded = activeClusters.every((c) => expanded.has(c.id));

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" aria-hidden={hidden}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        role="img"
        aria-label="Relevance map of events grouped by theme. Use the list of buttons below to navigate with a keyboard."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      {/* Keyboard / screen reader access to everything drawn on the canvas. */}
      <ul className="sr-only">
        {activeClusters.map((c) => (
          <li key={c.id}>
            {expanded.has(c.id) ? (
              <ul aria-label={c.name}>
                {visibleNodes
                  .filter((e) => e.cluster === c.id)
                  .map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => dispatch({ type: "select", id: e.id })}>
                        {isHidden(e) ? `Hidden spoiler, ${e.inWorldDate}` : `${e.title}, ${e.inWorldDate}`}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <button type="button" onClick={() => expandCluster(c.id)}>
                Expand cluster {c.name} ({counts[c.id]?.shown ?? 0} events)
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="absolute right-2 top-2 flex flex-col gap-2">
        <MapBtn label="Zoom in" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>+</MapBtn>
        <MapBtn label="Zoom out" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>−</MapBtn>
        <MapBtn label="Show everything" onClick={() => fitAll()}>
          <span className="font-display text-[10px] uppercase">Fit</span>
        </MapBtn>
        <MapBtn
          label={allExpanded ? "Collapse all clusters" : "Expand all clusters"}
          onClick={() => {
            setExpanded(allExpanded ? new Set() : new Set(activeClusters.map((c) => c.id)));
            if (allExpanded) dispatch({ type: "select", id: null });
          }}
        >
          <Icon name="layers" size={18} />
        </MapBtn>
      </div>

      <div className="absolute left-2 top-2 max-w-[62%] rounded-md border border-line bg-bg/85 px-2.5 py-1.5 font-display text-[11px] uppercase tracking-wider text-ink-3 backdrop-blur-sm">
        {expanded.size === 0 ? "Tap a cluster to open it" : `Showing ${effTier === 0 ? "landmarks" : effTier === 1 ? "landmarks + major" : "all events"}${zoomTier > state.tierLevel ? " (zoom)" : ""}`}
      </div>

      <div className="absolute bottom-24 left-2">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="rounded-md border border-line bg-bg/85 px-2.5 py-1.5 font-display text-[11px] uppercase tracking-wider text-ink-2 backdrop-blur-sm"
        >
          Legend
        </button>
        {legendOpen && (
          <div className="mt-1.5 w-56 rounded-md border border-line bg-bg/95 p-2.5 text-xs text-ink-2 backdrop-blur-sm">
            {(Object.keys(EDGE_STYLE) as Relation[]).map((r) => (
              <div key={r} className="flex items-center gap-2 py-0.5">
                <svg width="44" height="10" aria-hidden>
                  <line x1="2" y1="5" x2={EDGE_STYLE[r].arrow ? 34 : 42} y2="5" stroke="#c8c8dc" strokeWidth={EDGE_STYLE[r].width} strokeDasharray={EDGE_STYLE[r].dash.join(" ")} />
                  {EDGE_STYLE[r].arrow && <path d="M34 1 42 5 34 9Z" fill="#c8c8dc" />}
                </svg>
                {EDGE_STYLE[r].label}
              </div>
            ))}
            <div className="mt-1.5 border-t border-line pt-1.5">Node size = importance. Ring = viewed. Grey = hidden spoiler.</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default GraphView;

function MapBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-bg/85 text-lg text-ink backdrop-blur-sm hover:border-cyan">
      {children}
    </button>
  );
}
