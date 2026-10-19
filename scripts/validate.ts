// Validates the baked dataset. Fails (exit 1) on:
//  - missing or empty required fields, bad enum values
//  - missing / non-wiki wikiUrl
//  - duplicate ids, dangling related ids, self-links
//  - unknown ids in the Start Here path
// Warns on: era not matching sortYear, summaries outside 1-4 sentences, em dashes.
//
//   npm run validate

import { events, eras, clusters, startHere, groups } from "../data";
import type { LoreEvent } from "../data/types";
import { eraForYear } from "../data/eras";

const TIERS = ["landmark", "major", "minor"];
const CANON = ["2077", "edgerunners", "tabletop", "multiple"];
const SPOIL = ["edgerunners-safe", "world", "game-spoiler"];
const REL = ["caused", "led-to", "part-of", "involves"];
const ERAS = eras.map((e) => e.id as string);
const CLUSTERS = clusters.map((c) => c.id as string);
const REQUIRED: (keyof LoreEvent)[] = ["id", "title", "inWorldDate", "sortYear", "era", "cluster", "tier", "canonSource", "summary", "whyItMatters", "spoilerLevel", "related", "wikiUrl"];

const errors: string[] = [];
const warnings: string[] = [];
const ids = new Set<string>();

for (const e of events) {
  const where = `[${e.id ?? "?"}]`;
  for (const k of REQUIRED) {
    const v = e[k];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) errors.push(`${where} missing ${k}`);
  }
  if (ids.has(e.id)) errors.push(`${where} duplicate id`);
  ids.add(e.id);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`${where} id must be kebab-case`);
  if (!/^https:\/\/cyberpunk\.fandom\.com\/wiki\/\S+$/.test(e.wikiUrl ?? "")) errors.push(`${where} wikiUrl must be a cyberpunk.fandom.com/wiki URL`);
  if (typeof e.sortYear !== "number" || Number.isNaN(e.sortYear)) errors.push(`${where} sortYear must be a number`);
  if (!TIERS.includes(e.tier)) errors.push(`${where} bad tier ${e.tier}`);
  if (!CANON.includes(e.canonSource)) errors.push(`${where} bad canonSource ${e.canonSource}`);
  if (!SPOIL.includes(e.spoilerLevel)) errors.push(`${where} bad spoilerLevel ${e.spoilerLevel}`);
  if (!ERAS.includes(e.era)) errors.push(`${where} bad era ${e.era}`);
  if (!CLUSTERS.includes(e.cluster)) errors.push(`${where} bad cluster ${e.cluster}`);
  if (!Array.isArray(e.related)) errors.push(`${where} related must be an array`);
  if (eraForYear(e.sortYear) !== e.era) warnings.push(`${where} era ${e.era} but sortYear ${e.sortYear} falls in ${eraForYear(e.sortYear)}`);
  const sentences = (e.summary ?? "").split(/(?<=[.!?])\s+(?=[A-Z"])/).length;
  if (sentences > 4) warnings.push(`${where} summary has ${sentences} sentences (aim for 2-4)`);
  for (const [k, v] of Object.entries(e)) if (typeof v === "string" && v.includes("—")) warnings.push(`${where} em dash in ${k}`);
}

for (const e of events) {
  for (const r of e.related ?? []) {
    if (!ids.has(r.id)) errors.push(`[${e.id}] related id "${r.id}" does not exist`);
    if (r.id === e.id) errors.push(`[${e.id}] links to itself`);
    if (!REL.includes(r.relation)) errors.push(`[${e.id}] bad relation ${r.relation}`);
  }
}
for (const s of startHere) if (!ids.has(s.id)) errors.push(`[start-here] unknown id "${s.id}"`);
const seenInGroup = new Map<string, string>();
for (const g of groups) {
  const cl = new Set<string>();
  for (const m of g.members) {
    const ev = events.find((e) => e.id === m);
    if (!ev) errors.push(`[group ${g.id}] unknown member "${m}"`);
    else cl.add(ev.cluster);
    if (seenInGroup.has(m)) errors.push(`[group ${g.id}] "${m}" already in group ${seenInGroup.get(m)}`);
    seenInGroup.set(m, g.id);
  }
  if (cl.size > 1) errors.push(`[group ${g.id}] members span clusters: ${[...cl].join(", ")}`);
}
for (const e of events) if (!e.media.length) warnings.push(`[${e.id}] no media tags (run npm run wiki:meta)`);

const count = (k: keyof LoreEvent) => events.reduce<Record<string, number>>((a, e) => ((a[String(e[k])] = (a[String(e[k])] ?? 0) + 1), a), {});
console.log(`events: ${events.length}`);
console.log("by era:", count("era"));
console.log("by tier:", count("tier"));
console.log("by cluster:", count("cluster"));
console.log("by spoiler:", count("spoilerLevel"));
console.log("with conflict notes:", events.filter((e) => e.conflictNote).length);
for (const w of warnings) console.warn("warn:", w);
if (errors.length) {
  for (const e of errors) console.error("error:", e);
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log("ok");
