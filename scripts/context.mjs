#!/usr/bin/env node
// Authoring helper: prints timeline candidates for a year range together with
// the opening of each linked wiki page (from the raw dump), so an event can be
// written from the source pages rather than from memory.
//
//   node scripts/context.mjs 1990 1994            # candidates in [1990, 1994]
//   node scripts/context.mjs 1990 1994 --lead 600 # longer page leads
//   node scripts/context.mjs --page "Night City" --grep 2013   # paragraphs of a page mentioning a term

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { plain } from "./extract-timeline.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGES = path.join(ROOT, "data/raw/pages");
const manifest = JSON.parse(await readFile(path.join(ROOT, "data/raw/manifest.json"), "utf8"));
const redirect = Object.fromEntries(Object.entries(manifest).filter(([, v]) => v.redirectFrom).map(([k, v]) => [v.redirectFrom.toLowerCase(), k]));

const fileFor = (t) => path.join(PAGES, t.replace(/[\/\\:*?"<>|]/g, "_") + ".wikitext");
function resolve(t) {
  const norm = t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");
  if (manifest[norm]) return norm;
  return redirect[norm.toLowerCase()] ?? null;
}
async function pageText(t) {
  const r = resolve(t);
  if (!r || !existsSync(fileFor(r))) return null;
  return { title: r, text: await readFile(fileFor(r), "utf8") };
}
function lead(text, n) {
  const body = text.replace(/\{\{Infobox[\s\S]*?\n\}\}/i, "").split(/\n==/)[0];
  return plain(body).slice(0, n);
}

const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

if (args.includes("--page")) {
  const p = await pageText(flag("--page"));
  if (!p) { console.log("not in dump"); process.exit(0); }
  const g = flag("--grep", null);
  const paras = p.text.split(/\n\s*\n|\n(?===)/).map((x) => x.trim()).filter(Boolean);
  for (const para of paras) if (!g || para.includes(g)) console.log("¶ " + plain(para).slice(0, Number(flag("--max", 900))) + "\n");
  console.log("URL:", manifest[p.title].url);
  process.exit(0);
}

const [from, to] = args.filter((a) => /^-?\d+$/.test(a)).map(Number);
const n = Number(flag("--lead", 280));
const cands = JSON.parse(await readFile(path.join(ROOT, "data/raw/timeline-candidates.json"), "utf8"));
const seen = new Set();
for (const c of cands) {
  if (c.year == null || c.year < from || c.year > to) continue;
  console.log(`#${c.n} [${c.page === "Timeline" ? "T" : c.page.slice(0, 6)}] ${c.year} :: ${c.text}  {${c.canonHint ?? "-"}; ${c.refs.join(",")}}`);
  for (const l of c.links.slice(0, 3)) {
    const p = await pageText(l);
    if (!p || seen.has(p.title)) continue;
    seen.add(p.title);
    console.log(`    > ${p.title}: ${lead(p.text, n)}`);
  }
}
