// Precomputes the relevance-map layout at build time with d3-force, so phones
// never run a physics simulation. Output: data/generated/graph-layout.json
//
//   npm run layout   (runs automatically before `npm run build`)
//
// Three nested levels, each laid out with its own small simulation:
//  1. Inside each group: member events around the group's center.
//  2. Inside each cluster: groups (sized to their opened footprint) and loose
//     events, pulled together and kept apart by collision.
//  3. Clusters: placed relative to each other, attracted by how many links
//     cross between them, never overlapping.
// Every simulation uses a seeded random source, so output is deterministic.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceCenter } from "d3-force";
import { events, clusters, groups } from "../data";

type N = { id: string; x?: number; y?: number; vx?: number; vy?: number; r: number; fx?: number | null; fy?: number | null };

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}
const round = (v: number) => Math.round(v * 10) / 10;
const RADIUS = { landmark: 11, major: 7, minor: 4.5 } as const;
const byId = Object.fromEntries(events.map((e) => [e.id, e]));
const golden = Math.PI * (3 - Math.sqrt(5));
const seedPos = (i: number, spread: number) => ({ x: Math.cos(i * golden) * spread * Math.sqrt(i + 1), y: Math.sin(i * golden) * spread * Math.sqrt(i + 1) });

// ---- 1. members inside each group (relative coordinates)
const memberRel: Record<string, { x: number; y: number }> = {};
const groupRadius: Record<string, number> = {};
for (const g of groups) {
  const ns: N[] = g.members.map((id, i) => ({ id, r: RADIUS[byId[id].tier], ...seedPos(i, 10) }));
  const set = new Set(g.members);
  const links = g.members.flatMap((id) => byId[id].related.filter((r) => set.has(r.id)).map((r) => ({ source: id, target: r.id })));
  forceSimulation(ns as any)
    .randomSource(lcg(11))
    .force("charge", forceManyBody().strength(-30))
    .force("link", forceLink(links as any).id((d: any) => d.id).distance(26).strength(0.3))
    .force("x", forceX(0).strength(0.12))
    .force("y", forceY(0).strength(0.12))
    .force("collide", forceCollide((d: any) => d.r + 9))
    .stop()
    .tick(300);
  for (const n of ns) memberRel[n.id] = { x: n.x!, y: n.y! };
  groupRadius[g.id] = Math.max(22, ...ns.map((n) => Math.hypot(n.x!, n.y!) + n.r + 8));
}

// ---- 2. items inside each cluster (relative coordinates)
const itemRel: Record<string, { x: number; y: number }> = {}; // keys: "g:<id>" or event id
const clusterRadius: Record<string, number> = {};
for (const c of clusters) {
  const evs = events.filter((e) => e.cluster === c.id);
  const gids = [...new Set(evs.map((e) => e.group).filter(Boolean))] as string[];
  const items: N[] = [
    ...gids.map((g, i) => ({ id: "g:" + g, r: groupRadius[g] + 10, ...seedPos(i, 30) })),
    ...evs.filter((e) => !e.group).map((e, i) => ({ id: e.id, r: RADIUS[e.tier] + 10, ...seedPos(i + gids.length, 30) })),
  ];
  const itemOf = (id: string) => (byId[id].group ? "g:" + byId[id].group : id);
  const linkMap = new Map<string, number>();
  for (const e of evs)
    for (const r of e.related) {
      const o = byId[r.id];
      if (!o || o.cluster !== c.id) continue;
      const a = itemOf(e.id);
      const b = itemOf(o.id);
      if (a === b) continue;
      const k = [a, b].sort().join("|");
      linkMap.set(k, (linkMap.get(k) ?? 0) + 1);
    }
  const links = [...linkMap.entries()].map(([k, n]) => ({ source: k.split("|")[0], target: k.split("|")[1], n }));
  forceSimulation(items as any)
    .randomSource(lcg(23))
    .force("charge", forceManyBody().strength(-40))
    .force("link", forceLink(links as any).id((d: any) => d.id).distance((l: any) => l.source.r + l.target.r + 10).strength(0.05))
    .force("x", forceX(0).strength(0.08))
    .force("y", forceY(0).strength(0.08))
    .force("collide", forceCollide((d: any) => d.r).iterations(3))
    .stop()
    .tick(400);
  for (const n of items) itemRel[n.id] = { x: n.x!, y: n.y! };
  clusterRadius[c.id] = Math.max(60, ...items.map((n) => Math.hypot(n.x!, n.y!) + n.r)) + 14;
}

// ---- 3. cluster centers
const crossLinks: Record<string, number> = {};
for (const e of events)
  for (const r of e.related) {
    const o = byId[r.id];
    if (!o || o.cluster === e.cluster) continue;
    const k = [e.cluster, o.cluster].sort().join("|");
    crossLinks[k] = (crossLinks[k] ?? 0) + 1;
  }
const cNodes: N[] = clusters.map((c, i) => {
  const a = (i / clusters.length) * Math.PI * 2;
  return { id: c.id, r: clusterRadius[c.id], x: Math.cos(a) * 600, y: Math.sin(a) * 600 };
});
const cLinks = Object.entries(crossLinks).map(([k, v]) => ({ source: k.split("|")[0], target: k.split("|")[1], value: v }));
const maxV = Math.max(1, ...cLinks.map((l) => l.value));
forceSimulation(cNodes as any)
  .randomSource(lcg(7))
  .force("charge", forceManyBody().strength(-400))
  .force("link", forceLink(cLinks as any).id((d: any) => d.id).distance((l: any) => l.source.r + l.target.r + 40).strength((l: any) => 0.02 + (l.value / maxV) * 0.25))
  .force("collide", forceCollide((d: any) => d.r + 46).iterations(4))
  .force("center", forceCenter(0, 0))
  .force("x", forceX(0).strength(0.03))
  .force("y", forceY(0).strength(0.045))
  .stop()
  .tick(800);
const centers = Object.fromEntries(cNodes.map((c) => [c.id, { x: c.x!, y: c.y!, r: c.r }]));

// ---- compose absolute positions
const nodes: Record<string, [number, number]> = {};
const groupPos: Record<string, { x: number; y: number; r: number }> = {};
for (const e of events) {
  const c = centers[e.cluster];
  if (e.group) {
    const g = itemRel["g:" + e.group];
    const m = memberRel[e.id];
    nodes[e.id] = [round(c.x + g.x + m.x), round(c.y + g.y + m.y)];
  } else {
    const it = itemRel[e.id];
    nodes[e.id] = [round(c.x + it.x), round(c.y + it.y)];
  }
}
for (const g of groups) {
  const first = byId[g.members[0]];
  const c = centers[first.cluster];
  const it = itemRel["g:" + g.id];
  groupPos[g.id] = { x: round(c.x + it.x), y: round(c.y + it.y), r: round(groupRadius[g.id]) };
}
const clusterOut = Object.fromEntries(Object.entries(centers).map(([id, c]) => [id, { x: round(c.x), y: round(c.y), r: round(c.r) }]));

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "../data/generated");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "graph-layout.json"), JSON.stringify({ nodes, clusters: clusterOut, groups: groupPos }));
console.log(`layout: ${events.length} nodes, ${groups.length} groups, ${clusters.length} clusters`);
