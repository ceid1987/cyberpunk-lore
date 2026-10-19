"use client";

import { animate } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import layout from "@/data/generated/graph-layout.json";
import { clusterById, clusters, eventById, groupById, groups, type ClusterId, type Event, type Relation } from "@/data";
import { tierAllowed, useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion, type TierLevel } from "@/lib/store";
import { CLUSTER_ICON, Icon } from "./ui";

// ---------------------------------------------------------------------------
// Relevance map, drawn on one <canvas>. Positions come from the build-time
// d3-force layout (scripts/layout-graph.ts); nothing is simulated on the phone.
//
// Readability:
//  * Every cluster is open. Inside, related events are bundled into groups
//    (Arasaka, Militech, Johnny Silverhand, Nomads...) shown as one node until
//    tapped. Opening a group reveals all of its events.
//  * Links are aggregated between whatever is on screen (group or event), so
//    a closed group carries one line per neighbour instead of dozens.
//  * Ungrouped events appear by importance as you zoom in.
// ---------------------------------------------------------------------------

const NODES = layout.nodes as unknown as Record<string, [number, number]>;
const CLUSTERS = layout.clusters as unknown as Record<string, { x: number; y: number; r: number }>;
const GROUPS = layout.groups as unknown as Record<string, { x: number; y: number; r: number }>;
const R = { landmark: 11, major: 7, minor: 4.5 } as const;
const ICONS: Partial<Record<ClusterId, Path2D>> = {};
function icon(id: ClusterId) {
  if (typeof Path2D === "undefined") return null;
  return (ICONS[id] ??= new Path2D(CLUSTER_ICON[id]));
}

type T = { k: number; x: number; y: number };
/** On-screen size of a closed group: follows its real footprint, within tappable limits. */
const groupR = (worldR: number, k: number) => Math.max(9, Math.min(30, worldR * k * 0.55));
type DNode = { id: string; kind: "event" | "group"; x: number; y: number; r: number; cluster: ClusterId; event?: Event; group?: string; count?: number };

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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const fitK = useRef(0.3);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const activeClusters = useMemo(() => clusters.filter((c) => filtered.some((e) => e.cluster === c.id) && CLUSTERS[c.id]), [filtered]);

  const animateTo = useCallback(
    (target: T) => {
      if (reduced) return setT(target);
      const from = tRef.current;
      animate(0, 1, { duration: 0.55, ease: [0.2, 0.8, 0.2, 1], onUpdate: (p) => setT({ k: from.k + (target.k - from.k) * p, x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p }) });
    },
    [reduced],
  );
  const boxTarget = useCallback(
    (b: { x0: number; y0: number; x1: number; y1: number }) => {
      const k = Math.min((size.w - 48) / (b.x1 - b.x0), (size.h - 120) / (b.y1 - b.y0));
      return { k, x: size.w / 2 - ((b.x0 + b.x1) / 2) * k, y: size.h / 2 - 20 - ((b.y0 + b.y1) / 2) * k };
    },
    [size],
  );
  const fitAll = useCallback(
    (anim = true) => {
      const cs = activeClusters.map((c) => CLUSTERS[c.id]);
      if (!cs.length) return;
      const target = boxTarget({ x0: Math.min(...cs.map((c) => c.x - c.r)), y0: Math.min(...cs.map((c) => c.y - c.r)) - 30, x1: Math.max(...cs.map((c) => c.x + c.r)), y1: Math.max(...cs.map((c) => c.y + c.r)) });
      fitK.current = target.k;
      anim ? animateTo(target) : setT(target);
    },
    [activeClusters, boxTarget, animateTo],
  );
  const didFit = useRef(false);
  useEffect(() => {
    if (size.w > 0 && !didFit.current) {
      didFit.current = true;
      fitAll(false);
      // Start closer in, on Night City, so groups are readable; "Fit" shows everything.
      const nc = CLUSTERS["night-city"];
      if (nc) {
        const k = fitK.current * 2.3;
        setT({ k, x: size.w / 2 - nc.x * k, y: size.h / 2 - 20 - nc.y * k });
      }
    }
  }, [size, fitAll]);

  // ---- what is on screen
  const zoomRel = t.k / fitK.current;
  const zoomTier: TierLevel = zoomRel > 3.2 ? 2 : zoomRel > 1.7 ? 1 : 0;

  const { dnodes, dOf } = useMemo(() => {
    const dnodes: DNode[] = [];
    const dOf: Record<string, string> = {};
    const groupCounts: Record<string, number> = {};
    for (const e of filtered) if (e.group && !open.has(e.group)) groupCounts[e.group] = (groupCounts[e.group] ?? 0) + 1;
    for (const g of groups) {
      const n = groupCounts[g.id];
      if (!n || !GROUPS[g.id]) continue;
      const first = eventById[g.members[0]];
      dnodes.push({ id: "g:" + g.id, kind: "group", x: GROUPS[g.id].x, y: GROUPS[g.id].y, r: GROUPS[g.id].r, cluster: first.cluster, group: g.id, count: n });
    }
    for (const e of filtered) {
      if (!NODES[e.id]) continue;
      if (e.group && !open.has(e.group)) {
        dOf[e.id] = "g:" + e.group;
        continue;
      }
      // Events in an opened group are always shown; loose events appear by zoom.
      if (!e.group && !tierAllowed(e.tier, zoomTier)) continue;
      dnodes.push({ id: e.id, kind: "event", x: NODES[e.id][0], y: NODES[e.id][1], r: R[e.tier], cluster: e.cluster, event: e });
      dOf[e.id] = e.id;
    }
    return { dnodes, dOf };
  }, [filtered, open, zoomTier]);
  const byDid = useMemo(() => Object.fromEntries(dnodes.map((d) => [d.id, d])), [dnodes]);

  // Aggregate links between displayed nodes.
  const edges = useMemo(() => {
    const m = new Map<string, { a: string; b: string; rel: Relation; n: number }>();
    for (const e of filtered)
      for (const r of e.related) {
        const a = dOf[e.id];
        const b = dOf[r.id];
        if (!a || !b || a === b) continue;
        const [from, to, rel] = r.relation === "caused" ? [b, a, "led-to" as Relation] : [a, b, r.relation];
        const key = from < to ? from + "|" + to : to + "|" + from;
        const cur = m.get(key);
        if (cur) cur.n++;
        else m.set(key, { a: from, b: to, rel, n: 1 });
      }
    return [...m.values()];
  }, [filtered, dOf]);

  const focus = state.selectedId ? dOf[state.selectedId] ?? null : null;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const ed of edges) {
      if (ed.a === focus) s.add(ed.b);
      if (ed.b === focus) s.add(ed.a);
    }
    return s;
  }, [focus, edges]);

  // ---- drawing
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size.w * dpr)) cv.width = Math.round(size.w * dpr);
    if (cv.height !== Math.round(size.h * dpr)) cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const S = (x: number, y: number) => ({ x: x * t.k + t.x, y: y * t.k + t.y });
    const inView = (x: number, y: number, r: number) => x + r > -40 && x - r < size.w + 40 && y + r > -40 && y - r < size.h + 40;
    const scaleR = Math.max(0.55, Math.min(1.7, t.k * 1.6));

    // clusters: halo, icon, name
    for (const c of activeClusters) {
      const b = CLUSTERS[c.id];
      const p = S(b.x, b.y);
      const r = b.r * t.k;
      if (!inView(p.x, p.y, r + 30)) continue;
      ctx.fillStyle = c.color + "0b";
      ctx.strokeStyle = c.color + "38";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      const label = (zoomRel > 1.6 ? c.name : c.short).toUpperCase();
      ctx.font = `700 12px "Chakra Petch", sans-serif`;
      const tw = ctx.measureText(label).width;
      const lx = p.x - (tw + 18) / 2;
      const ly = p.y - r - 10;
      const ic = icon(c.id);
      if (ic) {
        ctx.save();
        ctx.translate(lx, ly - 10);
        ctx.scale(13 / 24, 13 / 24);
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(ic);
        ctx.restore();
      }
      ctx.fillStyle = c.color;
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 18, ly);
    }

    // open-group halos
    for (const gid of open) {
      const g = GROUPS[gid];
      if (!g || !groupById[gid]) continue;
      const first = eventById[groupById[gid].members[0]];
      if (!filtered.some((e) => e.group === gid)) continue;
      const p = S(g.x, g.y);
      const r = g.r * t.k;
      if (!inView(p.x, p.y, r)) continue;
      const col = clusterById[first.cluster].color;
      ctx.strokeStyle = col + "70";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 11px "Chakra Petch", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = col;
      ctx.fillText(`${groupById[gid].name.toUpperCase()}  [ − ]`, p.x, p.y - r - 5);
    }

    // edges
    for (const ed of edges) {
      const A0 = byDid[ed.a];
      const B0 = byDid[ed.b];
      if (!A0 || !B0) continue;
      const A = S(A0.x, A0.y);
      const B = S(B0.x, B0.y);
      if (!inView(A.x, A.y, 0) && !inView(B.x, B.y, 0)) continue;
      const lit = neighbors ? neighbors.has(ed.a) && neighbors.has(ed.b) && (ed.a === focus || ed.b === focus) : false;
      const st = EDGE_STYLE[ed.rel];
      ctx.globalAlpha = neighbors ? (lit ? 0.95 : 0.04) : 0.09 + Math.min(0.3, (ed.n - 1) * 0.07);
      ctx.strokeStyle = lit ? "#e9e9f2" : "#9a9ab8";
      ctx.lineWidth = Math.min(5, st.width + (ed.n - 1) * 0.6) * (lit ? 1.3 : 1);
      ctx.setLineDash(st.dash);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (st.arrow && (lit || zoomRel > 2.2)) {
        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        const rr = (B0.kind === "group" ? groupR(B0.r, t.k) : B0.r * scaleR) + 4;
        const tx = B.x - Math.cos(ang) * rr;
        const ty = B.y - Math.sin(ang) * rr;
        ctx.fillStyle = ctx.strokeStyle;
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
    const labels: { text: string; x: number; y: number; pri: number; strong: boolean; dim: boolean }[] = [];
    for (const d of dnodes) {
      const p = S(d.x, d.y);
      const col = clusterById[d.cluster].color;
      const dim = !!neighbors && !neighbors.has(d.id);
      if (d.kind === "group") {
        const r = groupR(d.r, t.k);
        if (!inView(p.x, p.y, r)) continue;
        ctx.globalAlpha = dim ? 0.2 : 1;
        // hexagon-ish group node
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          const px = p.x + Math.cos(a) * r;
          const py = p.y + Math.sin(a) * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = col + "2a";
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = `700 ${r > 18 ? 12 : 10.5}px "Chakra Petch", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(d.count), p.x, p.y + 4);
        if (r > 11) labels.push({ text: groupById[d.group!].name, x: p.x, y: p.y + r + 13, pri: dim ? 5 : 0, strong: true, dim });
      } else {
        const e = d.event!;
        const r = d.r * scaleR;
        if (!inView(p.x, p.y, r)) continue;
        const hid = isHidden(e);
        ctx.globalAlpha = dim ? 0.15 : 1;
        if (e.tier === "landmark" && !hid && !dim) {
          ctx.shadowColor = col;
          ctx.shadowBlur = 12;
        }
        ctx.fillStyle = hid ? "#2a2a3a" : col;
        ctx.beginPath();
        if (e.tier === "landmark") {
          ctx.moveTo(p.x, p.y - r);
          ctx.lineTo(p.x + r, p.y);
          ctx.lineTo(p.x, p.y + r);
          ctx.lineTo(p.x - r, p.y);
          ctx.closePath();
        } else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (state.viewed.includes(e.id)) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (d.id === focus) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        const rank = e.tier === "landmark" ? 0 : e.tier === "major" ? 1 : 2;
        const show = !hid && (rank <= (zoomRel > 4 ? 2 : zoomRel > 2 ? 1 : 0) || (neighbors && neighbors.has(d.id)) || (e.group && open.has(e.group)));
        if (show) labels.push({ text: e.title.length > 32 ? e.title.slice(0, 30) + "…" : e.title, x: p.x, y: p.y + r + 12, pri: (d.id === focus ? -10 : 0) + (neighbors?.has(d.id) ? -4 : 0) + rank + 1, strong: rank === 0, dim });
      }
    }
    ctx.globalAlpha = 1;

    // labels with collision avoidance
    labels.sort((a, b) => a.pri - b.pri);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of labels) {
      ctx.font = `${l.strong ? 600 : 500} ${l.strong ? 12 : 11}px "Chakra Petch", sans-serif`;
      const w = ctx.measureText(l.text).width;
      const box = { x0: l.x - w / 2 - 2, y0: l.y - 11, x1: l.x + w / 2 + 2, y1: l.y + 3 };
      if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      placed.push(box);
      ctx.globalAlpha = l.dim ? 0.3 : 1;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#07070b";
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = l.strong ? "#e9e9f2" : "#a9a9c0";
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.globalAlpha = 1;
  });

  // ---- interaction
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: T; d?: number; mid?: { x: number; y: number }; moved: number; down: { x: number; y: number }; t0: number } | null>(null);
  const lastTap = useRef(0);
  const clampK = (k: number) => Math.max(fitK.current * 0.6, Math.min(fitK.current * 14, k));
  const zoomAt = (factor: number, cx: number, cy: number) =>
    setT((cur) => {
      const k = clampK(cur.k * factor);
      const f = k / cur.k;
      return { k, x: cx - (cx - cur.x) * f, y: cy - (cy - cur.y) * f };
    });

  const openGroup = (gid: string) => {
    setOpen((s) => new Set(s).add(gid));
    const g = GROUPS[gid];
    const pad = 30;
    const target = boxTarget({ x0: g.x - g.r - pad, y0: g.y - g.r - pad, x1: g.x + g.r + pad, y1: g.y + g.r + pad });
    animateTo({ ...target, k: Math.max(tRef.current.k, Math.min(target.k, fitK.current * 5)) });
  };
  const closeGroup = (gid: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.delete(gid);
      return n;
    });

  const hitTest = (sx: number, sy: number): { kind: "event"; id: string } | { kind: "group"; id: string } | { kind: "close"; id: string } | null => {
    const S = (x: number, y: number) => ({ x: x * t.k + t.x, y: y * t.k + t.y });
    const scaleR = Math.max(0.55, Math.min(1.7, t.k * 1.6));
    let best: DNode | null = null;
    let bd = Infinity;
    for (const d of dnodes) {
      const p = S(d.x, d.y);
      const r = d.kind === "group" ? groupR(d.r, t.k) : d.r * scaleR;
      const dist = Math.hypot(p.x - sx, p.y - sy);
      if (dist < r + 12 && dist < bd) {
        bd = dist;
        best = d;
      }
    }
    if (best) return best.kind === "group" ? { kind: "group", id: best.group! } : { kind: "event", id: best.id };
    for (const gid of open) {
      const g = GROUPS[gid];
      if (!g) continue;
      const p = S(g.x, g.y);
      if (Math.abs(sx - p.x) < 90 && Math.abs(sy - (p.y - g.r * t.k - 9)) < 14) return { kind: "close", id: gid };
    }
    return null;
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
    if (pts.length === 1) gesture.current = { start: tRef.current, moved: 0, down: p, t0: Date.now() };
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { start: tRef.current, d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: 99, down: p, t0: Date.now() };
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
      const k = clampK(g.start.k * (d / g.d));
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
    if (hit?.kind === "event") dispatch({ type: "select", id: hit.id });
    else if (hit?.kind === "group") openGroup(hit.id);
    else if (hit?.kind === "close") closeGroup(hit.id);
    else if (now - lastTap.current < 300) zoomAt(1.8, p.x, p.y);
    else if (state.selectedId) dispatch({ type: "select", id: null });
    lastTap.current = now;
  };
  const onWheel = (ev: React.WheelEvent) => {
    const p = local(ev);
    zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  };

  // Center on the selected event when it changes elsewhere (search, sheet).
  useEffect(() => {
    if (hidden || !state.selectedId) return;
    const e = eventById[state.selectedId];
    if (!e || !NODES[e.id]) return;
    if (e.group && !open.has(e.group)) setOpen((s) => new Set(s).add(e.group!));
    const [x, y] = NODES[e.id];
    const cur = tRef.current;
    const p = { x: x * cur.k + cur.x, y: y * cur.k + cur.y };
    if (p.x > 40 && p.x < size.w - 40 && p.y > 60 && p.y < size.h * 0.4 && cur.k / fitK.current > 1.6) return;
    const k = Math.max(cur.k, fitK.current * (e.tier === "landmark" ? 2 : e.tier === "major" ? 2.4 : 3.6));
    animateTo({ k, x: size.w / 2 - x * k, y: size.h * 0.25 - y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedId, hidden]);

  useImperativeHandle(ref, () => ({
    positions(ids?: string[]) {
      const out: Record<string, { x: number; y: number; r: number }> = {};
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return out;
      const cur = tRef.current;
      const list = ids ?? filtered.map((e) => e.id);
      for (const id of list) {
        const e = eventById[id];
        if (!e || !NODES[id]) continue;
        let x: number, y: number;
        if (e.group && !open.has(e.group) && GROUPS[e.group]) [x, y] = [GROUPS[e.group].x, GROUPS[e.group].y];
        else [x, y] = NODES[id];
        out[id] = { x: rect.left + x * cur.k + cur.x, y: rect.top + y * cur.k + cur.y, r: R[e.tier] * Math.max(0.55, Math.min(1.7, cur.k * 1.6)) };
      }
      return out;
    },
  }));

  const anyOpen = open.size > 0;

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

      {/* keyboard / screen reader access */}
      <ul className="sr-only">
        {dnodes.map((d) => (
          <li key={d.id}>
            {d.kind === "group" ? (
              <button type="button" onClick={() => openGroup(d.group!)}>
                Open group {groupById[d.group!].name} ({d.count} events)
              </button>
            ) : (
              <button type="button" onClick={() => dispatch({ type: "select", id: d.id })}>
                {isHidden(d.event!) ? `Hidden spoiler, ${d.event!.inWorldDate}` : `${d.event!.title}, ${d.event!.inWorldDate}`}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="absolute bottom-24 right-2 flex flex-col gap-1.5">
        <MapBtn label="Zoom in" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>
          <Icon name="plus" size={18} />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>
          <Icon name="minus" size={18} />
        </MapBtn>
        <MapBtn label="Show everything" onClick={() => fitAll()}>
          <Icon name="fit" size={18} />
        </MapBtn>
        <MapBtn
          label={anyOpen ? "Close all groups" : "Open all groups"}
          onClick={() => {
            setOpen(anyOpen ? new Set() : new Set(groups.map((g) => g.id)));
            if (anyOpen) dispatch({ type: "select", id: null });
          }}
        >
          <Icon name="layers" size={18} />
        </MapBtn>
      </div>

      <div className="absolute bottom-24 left-2">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="cp-btn border border-line bg-bg/85 px-2.5 py-1.5 font-display text-[11px] uppercase tracking-wider text-ink-2 backdrop-blur-sm"
        >
          Legend
        </button>
        {legendOpen && (
          <div className="cp-card mt-1.5 w-60 border border-line bg-bg/95 p-2.5 text-xs text-ink-2 backdrop-blur-sm">
            {(Object.keys(EDGE_STYLE) as Relation[]).map((r) => (
              <div key={r} className="flex items-center gap-2 py-0.5">
                <svg width="44" height="10" aria-hidden>
                  <line x1="2" y1="5" x2={EDGE_STYLE[r].arrow ? 34 : 42} y2="5" stroke="#c8c8dc" strokeWidth={EDGE_STYLE[r].width} strokeDasharray={EDGE_STYLE[r].dash.join(" ")} />
                  {EDGE_STYLE[r].arrow && <path d="M34 1 42 5 34 9Z" fill="#c8c8dc" />}
                </svg>
                {EDGE_STYLE[r].label}
              </div>
            ))}
            <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5">
              <svg width="18" height="18" viewBox="-10 -10 20 20" aria-hidden>
                <polygon points="8.7,5 0,10 -8.7,5 -8.7,-5 0,-10 8.7,-5" fill="#05d9e82a" stroke="#05d9e8" strokeWidth="1.4" />
              </svg>
              Group of events (number inside)
            </div>
            <div className="mt-1">Thicker line = more links. Diamond = landmark. Ring = viewed. Grey = hidden spoiler.</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default GraphView;

function MapBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="cp-btn grid h-10 w-10 place-items-center border border-line bg-bg/85 text-ink backdrop-blur-sm hover:border-cyan">
      {children}
    </button>
  );
}
