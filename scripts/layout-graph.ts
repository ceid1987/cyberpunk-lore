// Precomputes the relevance-map layout at build time with d3-force, so phones
// never run a physics simulation. Output: data/generated/graph-layout.json
//
//   npm run layout   (runs automatically before `npm run build`)
//
// Layout model:
//  1. Cluster centers: a small force simulation where clusters attract each
//     other in proportion to how many related-links cross between them.
//  2. Event nodes: pulled toward their cluster center, linked to related
//     events, kept apart by collision radius (bigger for higher tiers).
// The simulation uses a seeded random source, so output is deterministic.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceCenter } from "d3-force";
import { events, clusters } from "../data";

type N = { id: string; x?: number; y?: number; vx?: number; vy?: number; r: number; cluster: string };

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}

const RADIUS = { landmark: 11, major: 7, minor: 4.5 } as const;

// ---- 1. cluster centers
const counts: Record<string, number> = {};
for (const e of events) counts[e.cluster] = (counts[e.cluster] ?? 0) + 1;
const crossLinks: Record<string, number> = {};
const byId = Object.fromEntries(events.map((e) => [e.id, e]));
for (const e of events)
  for (const r of e.related) {
    const o = byId[r.id];
    if (!o || o.cluster === e.cluster) continue;
    const k = [e.cluster, o.cluster].sort().join("|");
    crossLinks[k] = (crossLinks[k] ?? 0) + 1;
  }

const clusterRadius = (id: string) => 60 + Math.sqrt(counts[id] ?? 1) * 26;
const cNodes: N[] = clusters.map((c, i) => {
  const a = (i / clusters.length) * Math.PI * 2;
  return { id: c.id, cluster: c.id, r: clusterRadius(c.id), x: Math.cos(a) * 500, y: Math.sin(a) * 500 };
});
const cLinks = Object.entries(crossLinks).map(([k, v]) => {
  const [a, b] = k.split("|");
  return { source: a, target: b, value: v };
});
const maxV = Math.max(1, ...cLinks.map((l) => l.value));
forceSimulation(cNodes as any)
  .randomSource(lcg(7))
  .force("charge", forceManyBody().strength(-2200))
  .force("link", forceLink(cLinks as any).id((d: any) => d.id).distance((l: any) => 520 - (l.value / maxV) * 260).strength((l: any) => 0.05 + (l.value / maxV) * 0.4))
  .force("collide", forceCollide((d: any) => d.r + 70))
  .force("center", forceCenter(0, 0))
  .stop()
  .tick(600);
const centers = Object.fromEntries(cNodes.map((c) => [c.id, { x: c.x!, y: c.y!, r: c.r }]));

// ---- 2. event nodes
const golden = Math.PI * (3 - Math.sqrt(5));
const idx: Record<string, number> = {};
const nodes: N[] = events.map((e) => {
  const i = (idx[e.cluster] = (idx[e.cluster] ?? 0) + 1);
  const c = centers[e.cluster];
  const rr = 8 * Math.sqrt(i);
  return { id: e.id, cluster: e.cluster, r: RADIUS[e.tier], x: c.x + Math.cos(i * golden) * rr, y: c.y + Math.sin(i * golden) * rr };
});
const links = events.flatMap((e) => e.related.map((r) => ({ source: e.id, target: r.id, same: byId[r.id]?.cluster === e.cluster })));

forceSimulation(nodes as any)
  .randomSource(lcg(42))
  .force("charge", forceManyBody().strength(-28).distanceMax(220))
  .force("link", forceLink(links as any).id((d: any) => d.id).distance((l: any) => (l.same ? 34 : 140)).strength((l: any) => (l.same ? 0.35 : 0.02)))
  .force("x", forceX((d: any) => centers[d.cluster].x).strength(0.12))
  .force("y", forceY((d: any) => centers[d.cluster].y).strength(0.12))
  .force("collide", forceCollide((d: any) => d.r + 5).iterations(2))
  .stop()
  .tick(500);

// Recompute cluster bounds from final node positions.
const bounds: Record<string, { x: number; y: number; r: number }> = {};
for (const c of clusters) {
  const ns = nodes.filter((n) => n.cluster === c.id);
  if (!ns.length) continue;
  const cx = ns.reduce((a, n) => a + n.x!, 0) / ns.length;
  const cy = ns.reduce((a, n) => a + n.y!, 0) / ns.length;
  const r = Math.max(40, ...ns.map((n) => Math.hypot(n.x! - cx, n.y! - cy) + n.r + 10));
  bounds[c.id] = { x: round(cx), y: round(cy), r: round(r) };
}
function round(v: number) {
  return Math.round(v * 10) / 10;
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  nodes: Object.fromEntries(nodes.map((n) => [n.id, [round(n.x!), round(n.y!)]])),
  clusters: bounds,
};
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "../data/generated");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "graph-layout.json"), JSON.stringify(out));
console.log(`layout: ${nodes.length} nodes, ${links.length} links, ${Object.keys(bounds).length} clusters`);
