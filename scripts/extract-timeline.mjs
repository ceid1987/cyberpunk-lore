#!/usr/bin/env node
// Parses the raw wikitext of the wiki's timeline pages (fetched by fetch-wiki.mjs)
// into a flat list of candidate entries. Curation into /data/events/*.ts is done
// from this file plus the linked article pages.
//
//   node scripts/extract-timeline.mjs
//   -> data/raw/timeline-candidates.json
//
// Each candidate: { page, section, heading, year, text, links[], refs[], canonHint }

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGES = path.join(ROOT, "data/raw/pages");
const SOURCES = [
  { title: "Timeline", file: "Timeline.wikitext" },
  { title: "Greater Europe Timeline: Future Past", file: "Timeline_Europe.wikitext" },
  { title: "South-East Asia Timeline", file: "Timeline_South-East Asia.wikitext" },
];

/** Strip wikitext markup down to readable plain text. */
export function plain(s) {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{Cite[^}]*\}\}/gi, "")
    .replace(/\{\{CP\|([^}|]+)\}\}/g, (_, x) => `Cyberpunk ${x}`)
    .replace(/\{\{CP\}\}/g, "Cyberpunk")
    .replace(/\{\{(?:RTG)\}\}/g, "R. Talsorian Games")
    .replace(/\{\{(?:CDPR)\}\}/g, "CD Projekt Red")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+ ([^\]]+)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function links(s) {
  return [...s.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()).filter((t) => !/^(File|Image|Category):/i.test(t));
}

/** Map a reference source code to a canon hint. */
export function canonOf(code) {
  if (!code) return null;
  if (/^(EDGE|CEMK|CPEMK)/i.test(code)) return "edgerunners";
  if (/^(2077|CP2077|PL)/i.test(code) || /^X:/.test(code)) return "2077";
  if (/^(2013|2020|RED|CPRED|REDJ|REDT)/i.test(code)) return "tabletop";
  return null;
}

async function parse({ title, file }) {
  const text = await readFile(path.join(PAGES, file), "utf8");
  // named ref definitions -> source code
  const refCode = {};
  for (const m of text.matchAll(/<ref name="?([^">\/]+)"?\s*>([\s\S]*?)<\/ref>/g)) {
    const code = m[2].match(/\{\{RefCP\|([^}|]+)/)?.[1] ?? (m[2].match(/\{\{RefX\|user=([^}|]+)/) ? "X:" + m[2].match(/\{\{RefX\|user=([^}|]+)/)[1] : null);
    if (code) refCode[m[1].trim()] = code;
  }
  const out = [];
  let section = "", heading = "", bulletYear = null;
  for (const line of text.split("\n")) {
    const h2 = line.match(/^==([^=].*?)==\s*$/);
    const h3 = line.match(/^===([^=].*?)===\s*$/);
    if (h2) { section = h2[1].trim(); heading = ""; bulletYear = null; continue; }
    if (h3) { heading = h3[1].trim(); bulletYear = null; continue; }
    if (!line.startsWith("*")) continue;
    if (["Regional timelines", "References", "Series history"].includes(section)) continue;
    const refs = [];
    for (const m of line.matchAll(/<ref name="?([^">\/]+?)"?\s*\/>/g)) refs.push(refCode[m[1].trim()] ?? "?" + m[1].trim());
    for (const m of line.matchAll(/<ref(?: name="?([^">\/]+?)"?)?\s*>([\s\S]*?)<\/ref>/g)) {
      const c = m[2].match(/\{\{RefCP\|([^}|]+)/)?.[1] ?? (/RefX\|user=([^}|]+)/.test(m[2]) ? "X:" + m[2].match(/RefX\|user=([^}|]+)/)[1] : null);
      refs.push(c ?? (m[1] ? refCode[m[1].trim()] : null) ?? "inline");
    }
    // Some regional pages use a bare "*1991" bullet as a year header
    const bare = plain(line.replace(/^\*+/, "")).match(/^(\d{4})s?:?$/);
    if (bare) { bulletYear = Number(bare[1]); continue; }
    const yearMatch = bulletYear ? [String(bulletYear)] : (heading || section).match(/\d{4}/);
    const canons = [...new Set(refs.map(canonOf).filter(Boolean))];
    out.push({
      page: title,
      section,
      heading,
      year: yearMatch ? Number(yearMatch[0]) : null,
      depth: line.match(/^\*+/)[0].length,
      text: plain(line.replace(/^\*+/, "")),
      links: links(line),
      refs,
      canonHint: canons.length > 1 ? "multiple" : canons[0] ?? null,
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = [];
  for (const s of SOURCES) all.push(...(await parse(s)));
  all.forEach((c, i) => (c.n = i));
  await writeFile(path.join(ROOT, "data/raw/timeline-candidates.json"), JSON.stringify(all, null, 1));
  const by = {};
  for (const c of all) by[c.page] = (by[c.page] ?? 0) + 1;
  console.log(by, "total", all.length);
}
