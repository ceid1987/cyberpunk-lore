"use client";

import { animate } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import layout from "@/data/generated/graph-layout.json";
import { clusterById, clusters, eventById, groupById, groups, type ClusterId, type Event, type Relation } from "@/data";
import { useFilteredEvents, useIsHidden, useStore, usePanelInset, usePrefersReducedMotion } from "@/lib/store";
import { CLUSTER_ICON, Icon } from "./ui";

// ---------------------------------------------------------------------------
// Relevance map, drawn on one <canvas>. Positions come from the build-time
// d3-force layout (scripts/layout-graph.ts); nothing is simulated on the phone.
//
// Explore mode: everything starts closed (one bubble per theme, simple lines).
// Tap a theme to open it: its groups and events fly out of the bubble. Tap a
// group (hexagon) to open it the same way. Links are merged between whatever
// is on screen.
//
// Museum mode: starts empty at 1859. Each ">" adds the next event in
// chronological order (every event, minor ones included): the node appears,
// the camera moves to it, and links to earlier events draw themselves in.
// ---------------------------------------------------------------------------

const NODES = layout.nodes as unknown as Record<string, [number, number]>;
const CLUSTERS = layout.clusters as unknown as Record<string, { x: number; y: number; r: number }>;
const GROUPS = layout.groups as unknown as Record<string, { x: number; y: number; r: number }>;
const R = { landmark: 11, major: 7, minor: 4.5 } as const;
const SPAWN_MS = 650;
const EDGE_DELAY = 250;
const EDGE_MS = 750;
const ICONS: Partial<Record<ClusterId, Path2D>> = {};
function icon(id: ClusterId) {
  if (typeof Path2D === "undefined") return null;
  return (ICONS[id] ??= new Path2D(CLUSTER_ICON[id]));
}
const ease = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

type T = { k: number; x: number; y: number };
type Kind = "cluster" | "group" | "event";
type DNode = { id: string; kind: Kind; x: number; y: number; r: number; cluster: ClusterId; parent?: string; event?: Event; group?: string; count?: number };
type Spawn = { fx: number; fy: number; start: number };
type Ghost = { node: DNode; tx: number; ty: number; start: number };

export interface GraphHandle {
  positions(ids?: string[]): Record<string, { x: number; y: number; r: number }>;
}

export const EDGE_STYLE: Record<Relation, { dash: number[]; width: number; arrow: boolean; label: string }> = {
  caused: { dash: [], width: 1.6, arrow: true, label: "Caused" },
  "led-to": { dash: [6, 4], width: 1.4, arrow: true, label: "Led to" },
  "part-of": { dash: [1.5, 3.5], width: 1.4, arrow: false, label: "Part of" },
  involves: { dash: [], width: 0.8, arrow: false, label: "Connected" },
};

/** On-screen radius of a closed theme bubble / group hexagon. */
const bubbleR = (worldR: number, k: number) => Math.max(24, Math.min(58, worldR * k * 0.55));
const groupR = (worldR: number, k: number) => Math.max(10, Math.min(30, worldR * k * 0.55));
const eventScale = (k: number) => Math.max(0.55, Math.min(1.7, k * 1.6));

const GraphView = forwardRef<GraphHandle, { hidden?: boolean }>(function GraphView({ hidden }, ref) {
  const { state, dispatch } = useStore();
  const filtered = useFilteredEvents();
  const isHidden = useIsHidden();
  const reduced = usePrefersReducedMotion();
  const inset = usePanelInset();
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<T>({ k: 0.2, x: 187, y: 300 });
  const tRef = useRef(t);
  tRef.current = t;
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const [openG, setOpenG] = useState<Set<string>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const fitK = useRef(0.2);
  const museum = state.museum.active;
  const mIndex = state.museum.index;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const activeClusters = useMemo(() => clusters.filter((c) => filtered.some((e) => e.cluster === c.id) && CLUSTERS[c.id]), [filtered]);

  // ---- camera
  const cameraAnim = useRef<{ stop: () => void } | null>(null);
  const animateTo = useCallback(
    (target: T, duration = 0.6) => {
      cameraAnim.current?.stop();
      if (reduced) return setT(target);
      const from = tRef.current;
      cameraAnim.current = animate(0, 1, { duration, ease: [0.22, 0.8, 0.2, 1], onUpdate: (p) => setT({ k: from.k + (target.k - from.k) * p, x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p }) });
    },
    [reduced],
  );
  /** Camera that fits a world-space box into the part of the view not covered by the panel. */
  const boxTarget = useCallback(
    (b: { x0: number; y0: number; x1: number; y1: number }, kMin = 0, kMax = Infinity, m: { top?: number; bottom?: number; side?: number; focus?: [number, number] } = {}): T => {
      const { left, bottom } = insetRef.current;
      const top = m.top ?? 40;
      const bot = bottom + (m.bottom ?? 70);
      const aw = Math.max(80, size.w - left - 2 * (m.side ?? 20));
      const ah = Math.max(80, size.h - top - bot);
      const k = Math.max(kMin, Math.min(kMax, aw / Math.max(1, b.x1 - b.x0), ah / Math.max(1, b.y1 - b.y0)));
      const cx = left + (size.w - left) / 2;
      const cy = top + ah / 2;
      let wx = (b.x0 + b.x1) / 2;
      let wy = (b.y0 + b.y1) / 2;
      // Box too large at this zoom: keep the focus point on screen instead of the box centre.
      if (m.focus) {
        const hw = Math.max(0, aw / 2 - 20) / k;
        const hh = Math.max(0, ah / 2 - 40) / k;
        wx = Math.max(m.focus[0] - hw, Math.min(m.focus[0] + hw, wx));
        wy = Math.max(m.focus[1] - hh, Math.min(m.focus[1] + hh, wy));
      }
      return { k, x: cx - wx * k, y: cy - wy * k };
    },
    [size],
  );
  const allBox = useCallback(() => {
    const cs = activeClusters.map((c) => CLUSTERS[c.id]);
    return { x0: Math.min(...cs.map((c) => c.x - c.r)), y0: Math.min(...cs.map((c) => c.y - c.r)) - 20, x1: Math.max(...cs.map((c) => c.x + c.r)), y1: Math.max(...cs.map((c) => c.y + c.r)) };
  }, [activeClusters]);
  const fitAll = useCallback(
    (anim = true) => {
      if (!activeClusters.length) return;
      const saved = insetRef.current;
      insetRef.current = { ...saved, left: 0, bottom: 0 };
      const target = boxTarget(allBox());
      insetRef.current = saved;
      fitK.current = target.k;
      anim ? animateTo(target) : setT(target);
    },
    [activeClusters, boxTarget, allBox, animateTo],
  );
  const didFit = useRef(false);
  useEffect(() => {
    if (size.w > 0 && !didFit.current) {
      didFit.current = true;
      fitAll(false);
    }
  }, [size, fitAll]);

  const zoomRel = t.k / fitK.current;

  // ---- museum sequence
  const seq = filtered; // already chronological
  const revealed = useMemo(() => (museum ? seq.slice(0, Math.max(0, mIndex + 1)) : []), [museum, seq, mIndex]);
  const current = museum && mIndex >= 0 ? seq[mIndex] : null;

  // ---- what is on screen
  const { dnodes, dOf } = useMemo(() => {
    const dnodes: DNode[] = [];
    const dOf: Record<string, string> = {};
    if (museum) {
      for (const e of revealed) {
        if (!NODES[e.id]) continue;
        dnodes.push({ id: e.id, kind: "event", x: NODES[e.id][0], y: NODES[e.id][1], r: R[e.tier], cluster: e.cluster, event: e });
        dOf[e.id] = e.id;
      }
      return { dnodes, dOf };
    }
    for (const c of activeClusters) {
      const evs = filtered.filter((e) => e.cluster === c.id && NODES[e.id]);
      const b = CLUSTERS[c.id];
      if (!openC.has(c.id)) {
        dnodes.push({ id: "c:" + c.id, kind: "cluster", x: b.x, y: b.y, r: b.r, cluster: c.id, count: evs.length });
        for (const e of evs) dOf[e.id] = "c:" + c.id;
        continue;
      }
      const byGroup: Record<string, Event[]> = {};
      for (const e of evs) {
        if (e.group && GROUPS[e.group]) (byGroup[e.group] ??= []).push(e);
        else {
          dnodes.push({ id: e.id, kind: "event", x: NODES[e.id][0], y: NODES[e.id][1], r: R[e.tier], cluster: c.id, event: e, parent: "c:" + c.id });
          dOf[e.id] = e.id;
        }
      }
      for (const [gid, members] of Object.entries(byGroup)) {
        if (openG.has(gid)) {
          for (const e of members) {
            dnodes.push({ id: e.id, kind: "event", x: NODES[e.id][0], y: NODES[e.id][1], r: R[e.tier], cluster: c.id, event: e, parent: "g:" + gid });
            dOf[e.id] = e.id;
          }
        } else {
          dnodes.push({ id: "g:" + gid, kind: "group", x: GROUPS[gid].x, y: GROUPS[gid].y, r: GROUPS[gid].r, cluster: c.id, group: gid, count: members.length, parent: "c:" + c.id });
          for (const e of members) dOf[e.id] = "g:" + gid;
        }
      }
    }
    return { dnodes, dOf };
  }, [museum, revealed, activeClusters, filtered, openC, openG]);
  const byDid = useMemo(() => Object.fromEntries(dnodes.map((d) => [d.id, d])), [dnodes]);

  // World position a display node comes out of / goes back into.
  const parentPos = (id: string | undefined) => {
    if (!id) return null;
    if (id.startsWith("c:")) return CLUSTERS[id.slice(2)];
    if (id.startsWith("g:")) return GROUPS[id.slice(2)];
    return null;
  };

  // ---- spawn / collapse animations
  const spawns = useRef(new Map<string, Spawn>());
  const ghosts = useRef<Ghost[]>([]);
  const edgeAnims = useRef(new Map<string, number>()); // edge key -> start time (museum)
  const prevNodes = useRef<Map<string, DNode>>(new Map());
  const [, setTick] = useState(0);
  useEffect(() => {
    const now = performance.now();
    const prev = prevNodes.current;
    const nextMap = new Map(dnodes.map((d) => [d.id, d]));
    if (!reduced) {
      for (const d of dnodes) {
        if (prev.has(d.id)) continue;
        if (museum) spawns.current.set(d.id, { fx: d.x, fy: d.y, start: now });
        else {
          const pp = parentPos(d.parent);
          if (pp && prev.size) spawns.current.set(d.id, { fx: pp.x, fy: pp.y, start: now });
        }
      }
      if (!museum)
        for (const [id, d] of prev) {
          if (nextMap.has(id)) continue;
          // Collapse toward whatever now holds this node's events.
          const sample = d.kind === "event" ? d.id : d.kind === "group" ? groupById[d.group!]?.members.find((m) => dOf[m]) : null;
          const holder = sample ? nextMap.get(dOf[sample]) : undefined;
          if (holder) ghosts.current.push({ node: d, tx: holder.x, ty: holder.y, start: now });
        }
    }
    prevNodes.current = nextMap;
    setTick((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dnodes]);

  // Keep repainting while anything is animating.
  const rafRef = useRef(0);
  const ensureLoop = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      const now = performance.now();
      for (const [id, s] of spawns.current) if (now - s.start > SPAWN_MS) spawns.current.delete(id);
      ghosts.current = ghosts.current.filter((g) => now - g.start < SPAWN_MS * 0.7);
      for (const [k, st] of edgeAnims.current) if (now - st > EDGE_DELAY + EDGE_MS) edgeAnims.current.delete(k);
      setTick((x) => x + 1);
      if (spawns.current.size || ghosts.current.length || edgeAnims.current.size) rafRef.current = requestAnimationFrame(loop);
      else rafRef.current = 0;
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const posOf = (d: DNode, now: number) => {
    const s = spawns.current.get(d.id);
    if (!s) return { x: d.x, y: d.y, p: 1 };
    const p = ease((now - s.start) / SPAWN_MS);
    return { x: s.fx + (d.x - s.fx) * p, y: s.fy + (d.y - s.fy) * p, p };
  };

  // ---- edges
  const edges = useMemo(() => {
    const m = new Map<string, { a: string; b: string; rel: Relation; n: number }>();
    for (const e of museum ? revealed : filtered)
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
  }, [museum, revealed, filtered, dOf]);

  // In museum mode, links from the new event to earlier ones draw themselves in.
  const lastMuseum = useRef<string | null>(null);
  useEffect(() => {
    if (!museum || !current || lastMuseum.current === current.id) return;
    const goingForward = !lastMuseum.current || (eventById[lastMuseum.current] && seq.indexOf(eventById[lastMuseum.current]) < mIndex);
    lastMuseum.current = current.id;
    if (!goingForward || reduced) return;
    const now = performance.now();
    for (const ed of edges) if (ed.a === current.id || ed.b === current.id) edgeAnims.current.set(ed.a + "|" + ed.b, now);
    ensureLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, museum, edges]);
  useEffect(() => {
    if (spawns.current.size || ghosts.current.length) ensureLoop();
  });

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
    const now = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size.w * dpr)) cv.width = Math.round(size.w * dpr);
    if (cv.height !== Math.round(size.h * dpr)) cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const S = (x: number, y: number) => ({ x: x * t.k + t.x, y: y * t.k + t.y });
    const inView = (x: number, y: number, r: number) => x + r > -40 && x - r < size.w + 40 && y + r > -40 && y - r < size.h + 40;
    const es = eventScale(t.k);
    const screenR = (d: DNode) => (d.kind === "cluster" ? bubbleR(d.r, t.k) : d.kind === "group" ? groupR(d.r, t.k) : d.r * es);
    const drawIcon = (id: ClusterId, x: number, y: number, size: number, color: string) => {
      const ic = icon(id);
      if (!ic) return;
      ctx.save();
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(ic);
      ctx.restore();
    };
    const label = (text: string, x: number, y: number, color: string, weight = 600, px = 12, align: CanvasTextAlign = "center") => {
      ctx.font = `${weight} ${px}px "Chakra Petch", sans-serif`;
      ctx.textAlign = align;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#07070b";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };

    // open-theme halos (explore) / present themes (museum)
    const haloClusters = museum ? activeClusters.filter((c) => revealed.some((e) => e.cluster === c.id)) : activeClusters.filter((c) => openC.has(c.id));
    for (const c of haloClusters) {
      const b = CLUSTERS[c.id];
      const p = S(b.x, b.y);
      const r = b.r * t.k;
      if (!inView(p.x, p.y, r + 30)) continue;
      ctx.fillStyle = c.color + "0a";
      ctx.strokeStyle = c.color + "40";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      const text = (zoomRel > 1.6 ? c.name : c.short).toUpperCase() + (museum ? "" : "  [ − ]");
      ctx.font = `700 12px "Chakra Petch", sans-serif`;
      const tw = ctx.measureText(text).width;
      const lx = p.x - (tw + 18) / 2;
      drawIcon(c.id, lx + 6, p.y - r - 14, 13, c.color);
      label(text, lx + 18, p.y - r - 10, c.color, 700, 12, "left");
    }
    // open-group outlines
    if (!museum)
      for (const gid of openG) {
        const g = GROUPS[gid];
        const grp = groupById[gid];
        if (!g || !grp) continue;
        const first = eventById[grp.members[0]];
        if (!openC.has(first.cluster) || !filtered.some((e) => e.group === gid)) continue;
        const p = S(g.x, g.y);
        const r = g.r * t.k;
        if (!inView(p.x, p.y, r)) continue;
        const col = clusterById[first.cluster].color;
        ctx.strokeStyle = col + "80";
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        label(`${grp.name.toUpperCase()}  [ − ]`, p.x, p.y - r - 5, col, 600, 11);
      }

    // edges
    for (const ed of edges) {
      const A0 = byDid[ed.a];
      const B0 = byDid[ed.b];
      if (!A0 || !B0) continue;
      const pa = posOf(A0, now);
      const pb = posOf(B0, now);
      let A = S(pa.x, pa.y);
      let B = S(pb.x, pb.y);
      // museum: grow from the older node toward the new one
      const st0 = edgeAnims.current.get(ed.a + "|" + ed.b);
      let grow = 1;
      if (st0 !== undefined) {
        grow = ease((now - st0 - EDGE_DELAY) / EDGE_MS);
        if (grow <= 0) continue;
        if (current && ed.a === current.id) A = { x: B.x + (A.x - B.x) * grow, y: B.y + (A.y - B.y) * grow };
        else B = { x: A.x + (B.x - A.x) * grow, y: A.y + (B.y - A.y) * grow };
      }
      if (!inView(A.x, A.y, 0) && !inView(B.x, B.y, 0)) continue;
      const lit = neighbors ? neighbors.has(ed.a) && neighbors.has(ed.b) && (ed.a === focus || ed.b === focus) : false;
      const st = EDGE_STYLE[ed.rel];
      const simple = !museum && A0.kind === "cluster" && B0.kind === "cluster";
      ctx.globalAlpha = (neighbors ? (lit ? 0.95 : 0.06) : simple ? 0.12 + Math.min(0.35, ed.n * 0.03) : 0.12 + Math.min(0.3, (ed.n - 1) * 0.07)) * Math.min(pa.p, pb.p);
      if (st0 !== undefined) ctx.globalAlpha = 0.95;
      ctx.strokeStyle = lit || st0 !== undefined ? "#e9e9f2" : "#9a9ab8";
      ctx.lineWidth = simple ? 1 + Math.min(5, ed.n * 0.35) : Math.min(5, st.width + (ed.n - 1) * 0.6) * (lit ? 1.3 : 1);
      ctx.setLineDash(simple ? [] : st.dash);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!simple && st.arrow && grow >= 1 && (lit || zoomRel > 2.2 || museum)) {
        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        const rr = screenR(B0) + 4;
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

    // ghosts (collapsing back into their parent)
    for (const g of ghosts.current) {
      const p = ease((now - g.start) / (SPAWN_MS * 0.7));
      const x = g.node.x + (g.tx - g.node.x) * p;
      const y = g.node.y + (g.ty - g.node.y) * p;
      const s = S(x, y);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = clusterById[g.node.cluster].color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(2, screenR(g.node) * (1 - p * 0.7)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // nodes
    const labels: { text: string; x: number; y: number; pri: number; strong: boolean; dim: boolean }[] = [];
    for (const d of dnodes) {
      const ap = posOf(d, now);
      const p = S(ap.x, ap.y);
      const col = clusterById[d.cluster].color;
      const dim = !!neighbors && !neighbors.has(d.id);
      const grow = museum ? ap.p : 0.35 + 0.65 * ap.p;
      const r = screenR(d) * grow;
      if (!inView(p.x, p.y, r)) continue;
      ctx.globalAlpha = (dim ? 0.18 : 1) * Math.min(1, 0.2 + ap.p);
      if (d.kind === "cluster") {
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r);
        grad.addColorStop(0, col + "40");
        grad.addColorStop(1, col + "10");
        ctx.fillStyle = grad;
        ctx.strokeStyle = col + "d0";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const c = clusterById[d.cluster];
        drawIcon(d.cluster, p.x, p.y - (r > 34 ? 12 : 7), r > 34 ? 18 : 13, col);
        if (r > 30) label(String(d.count), p.x, p.y + 15, "#a9a9c0", 600, 11);
        labels.push({ text: c.short, x: p.x, y: p.y + r + 14, pri: -2, strong: true, dim });
      } else if (d.kind === "group") {
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
        ctx.font = `700 ${r > 18 ? 12 : 10.5}px "Chakra Petch", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = col;
        ctx.fillText(String(d.count), p.x, p.y + 0.5);
        ctx.textBaseline = "alphabetic";
        if (r > 11) labels.push({ text: groupById[d.group!].name, x: p.x, y: p.y + r + 13, pri: dim ? 5 : 0, strong: true, dim });
      } else {
        const e = d.event!;
        const hid = isHidden(e);
        const isCur = museum && current?.id === e.id;
        if ((e.tier === "landmark" || isCur) && !hid && !dim) {
          ctx.shadowColor = col;
          ctx.shadowBlur = isCur ? 22 : 12;
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
        if (museum && ap.p < 1) {
          // arrival pulse
          ctx.strokeStyle = col;
          ctx.globalAlpha = 1 - ap.p;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6 + ap.p * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (state.viewed.includes(e.id) && !museum) {
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
        const show = !hid && (rank <= (zoomRel > 4 ? 2 : zoomRel > 2 ? 1 : 0) || (neighbors && neighbors.has(d.id)) || (!museum && e.group && openG.has(e.group)));
        if (show && ap.p > 0.6) labels.push({ text: e.title.length > 34 ? e.title.slice(0, 32) + "…" : e.title, x: p.x, y: p.y + r + 12, pri: (d.id === focus ? -10 : 0) + (neighbors?.has(d.id) ? -4 : 0) + rank + 1, strong: rank === 0 || d.id === focus, dim });
      }
    }
    ctx.globalAlpha = 1;

    labels.sort((a, b) => a.pri - b.pri);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of labels) {
      ctx.font = `${l.strong ? 600 : 500} ${l.strong ? 12 : 11}px "Chakra Petch", sans-serif`;
      const w = ctx.measureText(l.text).width;
      const box = { x0: l.x - w / 2 - 2, y0: l.y - 11, x1: l.x + w / 2 + 2, y1: l.y + 3 };
      if (placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      placed.push(box);
      ctx.globalAlpha = l.dim ? 0.3 : 1;
      label(l.text, l.x, l.y, l.strong ? "#e9e9f2" : "#a9a9c0", l.strong ? 600 : 500, l.strong ? 12 : 11);
    }
    ctx.globalAlpha = 1;
  });

  // ---- interaction
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: T; d?: number; mid?: { x: number; y: number }; moved: number; down: { x: number; y: number }; t0: number } | null>(null);
  const lastTap = useRef(0);
  const clampK = (k: number) => Math.max(fitK.current * 0.6, Math.min(fitK.current * 16, k));
  const zoomAt = (factor: number, cx: number, cy: number) => {
    cameraAnim.current?.stop();
    setT((cur) => {
      const k = clampK(cur.k * factor);
      const f = k / cur.k;
      return { k, x: cx - (cx - cur.x) * f, y: cy - (cy - cur.y) * f };
    });
  };

  const openCluster = (cid: string) => {
    setOpenC((s) => new Set(s).add(cid));
    const b = CLUSTERS[cid];
    animateTo(boxTarget({ x0: b.x - b.r, y0: b.y - b.r - 24, x1: b.x + b.r, y1: b.y + b.r }, 0, fitK.current * 6));
    ensureLoop();
  };
  const closeCluster = (cid: string) => {
    setOpenC((s) => {
      const n = new Set(s);
      n.delete(cid);
      return n;
    });
    setOpenG((s) => new Set([...s].filter((g) => eventById[groupById[g].members[0]].cluster !== cid)));
    ensureLoop();
  };
  const openGroup = (gid: string) => {
    setOpenG((s) => new Set(s).add(gid));
    const g = GROUPS[gid];
    const pad = 36;
    animateTo(boxTarget({ x0: g.x - g.r - pad, y0: g.y - g.r - pad, x1: g.x + g.r + pad, y1: g.y + g.r + pad }, tRef.current.k, fitK.current * 9));
    ensureLoop();
  };
  const closeGroup = (gid: string) => {
    setOpenG((s) => {
      const n = new Set(s);
      n.delete(gid);
      return n;
    });
    ensureLoop();
  };

  type Hit = { kind: "event" | "group" | "cluster" | "closeGroup" | "closeCluster"; id: string };
  const hitTest = (sx: number, sy: number): Hit | null => {
    const S = (x: number, y: number) => ({ x: x * t.k + t.x, y: y * t.k + t.y });
    const es = eventScale(t.k);
    let best: DNode | null = null;
    let bd = Infinity;
    for (const d of dnodes) {
      const p = S(d.x, d.y);
      const r = d.kind === "cluster" ? bubbleR(d.r, t.k) : d.kind === "group" ? groupR(d.r, t.k) : d.r * es;
      const dist = Math.hypot(p.x - sx, p.y - sy);
      if (dist < r + (d.kind === "event" ? 12 : 6) && dist - r < bd) {
        bd = dist - r;
        best = d;
      }
    }
    if (best) return best.kind === "group" ? { kind: "group", id: best.group! } : best.kind === "cluster" ? { kind: "cluster", id: best.cluster } : { kind: "event", id: best.id };
    if (museum) return null;
    for (const gid of openG) {
      const g = GROUPS[gid];
      if (!g) continue;
      const p = S(g.x, g.y);
      if (Math.abs(sx - p.x) < 100 && Math.abs(sy - (p.y - g.r * t.k - 9)) < 14) return { kind: "closeGroup", id: gid };
    }
    for (const cid of openC) {
      const b = CLUSTERS[cid];
      const p = S(b.x, b.y);
      if (Math.abs(sx - p.x) < 140 && Math.abs(sy - (p.y - b.r * t.k - 14)) < 16) return { kind: "closeCluster", id: cid };
    }
    return null;
  };

  const local = (ev: React.PointerEvent | React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    cameraAnim.current?.stop();
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
    else if (hit?.kind === "cluster") openCluster(hit.id);
    else if (hit?.kind === "closeGroup") closeGroup(hit.id);
    else if (hit?.kind === "closeCluster") closeCluster(hit.id);
    else if (now - lastTap.current < 300) zoomAt(1.8, p.x, p.y);
    else if (state.selectedId && !museum) dispatch({ type: "select", id: null });
    lastTap.current = now;
  };
  const onWheel = (ev: React.WheelEvent) => {
    const p = local(ev);
    zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  };

  // Explore: when an event is selected elsewhere (search, panel), open its theme and group and bring it into view.
  useEffect(() => {
    if (hidden || museum || !state.selectedId) return;
    const e = eventById[state.selectedId];
    if (!e || !NODES[e.id]) return;
    if (!openC.has(e.cluster)) setOpenC((s) => new Set(s).add(e.cluster));
    if (e.group && !openG.has(e.group)) setOpenG((s) => new Set(s).add(e.group!));
    const [x, y] = NODES[e.id];
    const cur = tRef.current;
    const { left, bottom } = insetRef.current;
    const p = { x: x * cur.k + cur.x, y: y * cur.k + cur.y };
    if (p.x > left + 40 && p.x < size.w - 40 && p.y > 60 && p.y < size.h - bottom - 60 && cur.k / fitK.current > 2) return;
    const k = Math.max(cur.k, fitK.current * 3);
    animateTo({ k, x: left + (size.w - left) / 2 - x * k, y: (size.h - bottom) / 2 - y * k });
    ensureLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedId, hidden]);

  // Museum: select the current event and frame it with its already-revealed neighbours.
  useEffect(() => {
    if (!museum) return;
    if (mIndex < 0 || !current) {
      dispatch({ type: "select", id: null });
      return;
    }
    if (state.selectedId !== current.id) dispatch({ type: "select", id: current.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museum, mIndex]);
  useEffect(() => {
    if (!museum || !current || !NODES[current.id]) return;
    const [x, y] = NODES[current.id];
    const linked = new Set<string>();
    for (const r of current.related) linked.add(r.id);
    for (const e of revealed) if (e.related.some((r) => r.id === current.id)) linked.add(e.id);
    const pts = [[x, y], ...revealed.filter((e) => linked.has(e.id) && NODES[e.id]).map((e) => NODES[e.id])];
    const pad = 70;
    const box = { x0: Math.min(...pts.map((p) => p[0])) - pad, y0: Math.min(...pts.map((p) => p[1])) - pad, x1: Math.max(...pts.map((p) => p[0])) + pad, y1: Math.max(...pts.map((p) => p[1])) + pad };
    const desktop = size.w >= 768;
    const target = boxTarget(box, fitK.current * 0.9, fitK.current * 4.5, { top: desktop ? 90 : 80, bottom: desktop ? 210 : 70, side: desktop ? 90 : 70, focus: [x, y] });
    animateTo(target, 0.8);
    ensureLoop();
    // wait for the panel inset to settle (panel opens on first step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museum, current?.id, inset.left, inset.bottom]);

  // Entering / leaving museum mode.
  const prevMuseum = useRef(museum);
  useEffect(() => {
    if (prevMuseum.current === museum) return;
    prevMuseum.current = museum;
    spawns.current.clear();
    ghosts.current = [];
    edgeAnims.current.clear();
    lastMuseum.current = null;
    if (!museum) {
      setOpenC(new Set());
      setOpenG(new Set());
    }
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [museum]);

  // Keyboard for museum.
  useEffect(() => {
    if (!museum || hidden) return;
    const on = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT") return;
      if (ev.key === "ArrowRight") dispatch({ type: "museum", active: true, index: Math.min(seq.length - 1, mIndex + 1) });
      if (ev.key === "ArrowLeft") dispatch({ type: "museum", active: true, index: Math.max(0, mIndex - 1) });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [museum, hidden, mIndex, seq.length, dispatch]);

  useImperativeHandle(ref, () => ({
    positions(ids?: string[]) {
      const out: Record<string, { x: number; y: number; r: number }> = {};
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return out;
      const cur = tRef.current;
      for (const id of ids ?? filtered.map((e) => e.id)) {
        const did = dOf[id];
        const d = did ? byDid[did] : undefined;
        const e = eventById[id];
        if (!e) continue;
        const [x, y] = d ? [d.x, d.y] : [CLUSTERS[e.cluster]?.x ?? 0, CLUSTERS[e.cluster]?.y ?? 0];
        out[id] = { x: rect.left + x * cur.k + cur.x, y: rect.top + y * cur.k + cur.y, r: d?.kind === "event" ? R[e.tier] * eventScale(cur.k) : 6 };
      }
      return out;
    },
  }));

  const anyOpen = openC.size > 0;
  const year = current ? Math.floor(current.sortYear) : 1859;

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

      <ul className="sr-only">
        {dnodes.map((d) => (
          <li key={d.id}>
            {d.kind === "cluster" ? (
              <button type="button" onClick={() => openCluster(d.cluster)}>
                Open theme {clusterById[d.cluster].name} ({d.count} events)
              </button>
            ) : d.kind === "group" ? (
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

      {/* museum: big year + intro */}
      {museum && (
        <div className="pointer-events-none absolute right-3 top-2 text-right md:top-3">
          <div className="font-display text-[28px] md:text-[40px] font-bold leading-none tracking-wider text-white/90">{year}</div>
          <div className="mt-1 font-display text-[10px] uppercase tracking-[0.2em] text-ink-3 md:text-[11px]">
            {mIndex + 1} / {seq.length} events
          </div>
        </div>
      )}
      {museum && mIndex < 0 && (
        <div className="pointer-events-none absolute inset-x-6 top-1/3 text-center">
          <div className="font-display text-sm uppercase tracking-[0.3em] text-yellow">Museum mode</div>
          <div className="mt-2 text-[15px] text-ink-2">Every event from 1859 to 2095, one at a time.</div>
          <div className="mt-1 text-[13px] text-ink-3">Press the arrow to begin.</div>
        </div>
      )}

      {/* controls */}
      <div className="absolute right-2 flex flex-col gap-1.5" style={{ bottom: inset.bottom ? inset.bottom + 62 : 140 }}>
        <MapBtn label="Zoom in" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>
          <Icon name="plus" size={18} />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>
          <Icon name="minus" size={18} />
        </MapBtn>
        <MapBtn label="Show everything" onClick={() => fitAll()}>
          <Icon name="fit" size={18} />
        </MapBtn>
        {!museum && (
          <MapBtn
            label={anyOpen ? "Close everything" : "Open every theme"}
            onClick={() => {
              if (anyOpen) {
                setOpenC(new Set());
                setOpenG(new Set());
                dispatch({ type: "select", id: null });
              } else setOpenC(new Set(activeClusters.map((c) => c.id)));
              ensureLoop();
            }}
          >
            <Icon name="layers" size={18} />
          </MapBtn>
        )}
      </div>

      {/* museum toggle / stepper */}
      <div className="pointer-events-none absolute flex justify-center [&>*]:pointer-events-auto" style={{ bottom: inset.bottom ? inset.bottom + 10 : 84, left: inset.left, right: 0 }}>
        {museum ? (
          <div className="cp-btn flex items-center gap-1 border border-yellow/60 bg-bg/90 p-1 backdrop-blur-md" style={{ ["--b" as string]: "#fcee0a99" }}>
            <button type="button" onClick={() => dispatch({ type: "museum", active: false })} className="h-10 px-3 font-display text-[12px] uppercase tracking-wider text-ink-2 hover:text-ink">
              Exit
            </button>
            <button type="button" aria-label="Previous event" disabled={mIndex <= 0} onClick={() => dispatch({ type: "museum", active: true, index: mIndex - 1 })} className="grid h-10 w-11 place-items-center text-ink disabled:opacity-30">
              <Icon name="chevronL" />
            </button>
            <button
              type="button"
              aria-label="Next event"
              disabled={mIndex >= seq.length - 1}
              onClick={() => dispatch({ type: "museum", active: true, index: mIndex + 1 })}
              className="grid h-10 w-14 place-items-center bg-yellow text-bg disabled:opacity-30"
            >
              <Icon name="chevronR" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "select", id: null });
              dispatch({ type: "museum", active: true, index: -1 });
            }}
            className="cp-btn flex h-10 items-center gap-2 border border-yellow/60 bg-bg/90 px-3 font-display text-[12px] font-bold uppercase tracking-wider text-yellow backdrop-blur-md hover:bg-yellow/10"
            style={{ ["--b" as string]: "#fcee0a99" }}
          >
            <Icon name="museum" size={16} /> Museum mode
          </button>
        )}
      </div>

      {!museum && (
        <div className="absolute" style={{ bottom: inset.bottom ? inset.bottom + 62 : 140, left: inset.left + 8 }}>
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            aria-expanded={legendOpen}
            className="cp-btn border border-line bg-bg/85 px-2.5 py-1.5 font-display text-[11px] uppercase tracking-wider text-ink-2 backdrop-blur-sm"
          >
            Legend
          </button>
          {legendOpen && (
            <div className="cp-card absolute bottom-9 left-0 w-60 border border-line bg-bg/95 p-2.5 text-xs text-ink-2 backdrop-blur-sm">
              {(Object.keys(EDGE_STYLE) as Relation[]).map((r) => (
                <div key={r} className="flex items-center gap-2 py-0.5">
                  <svg width="44" height="10" aria-hidden>
                    <line x1="2" y1="5" x2={EDGE_STYLE[r].arrow ? 34 : 42} y2="5" stroke="#c8c8dc" strokeWidth={EDGE_STYLE[r].width} strokeDasharray={EDGE_STYLE[r].dash.join(" ")} />
                    {EDGE_STYLE[r].arrow && <path d="M34 1 42 5 34 9Z" fill="#c8c8dc" />}
                  </svg>
                  {EDGE_STYLE[r].label}
                </div>
              ))}
              <div className="mt-1.5 border-t border-line pt-1.5">Circle = theme, hexagon = group (tap to open). Diamond = landmark event. Ring = viewed. Grey = hidden spoiler.</div>
            </div>
          )}
        </div>
      )}
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
