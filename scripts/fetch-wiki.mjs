#!/usr/bin/env node
// Downloads raw wikitext from the Cyberpunk Wiki (cyberpunk.fandom.com) through the
// public MediaWiki API so the dataset can be curated and audited offline.
//
//   node scripts/fetch-wiki.mjs                 # seeds + every page linked from them
//   node scripts/fetch-wiki.mjs "Night City" …  # extra titles
//   node scripts/fetch-wiki.mjs --no-follow     # seeds only
//
// Output:
//   data/raw/pages/<Title>.wikitext   (gitignored, CC BY-SA content)
//   data/raw/manifest.json            (committed: title -> revid, timestamp, url)
//
// The deployed app never calls the wiki. This script only runs at authoring time.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const API = "https://cyberpunk.fandom.com/api.php";
const UA = "CyberpunkLoreFanTimeline/0.1 (non-commercial fan project; github.com/ceid1987/cyberpunk-lore)";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "data/raw/pages");
const MANIFEST = path.join(ROOT, "data/raw/manifest.json");

const SEEDS = [
  "Timeline",
  "Greater Europe Timeline: Future Past",
  "South-East Asia Timeline",
  "Cyberpunk: Edgerunners",
  "Cyberpunk 2077",
  "Cyberpunk 2077: Phantom Liberty",
  "Cyberpunk 2020",
  "Cyberpunk RED",
  "Cyberpunk 2013",
  "Corporate War",
  "Fourth Corporate War",
  "The Collapse",
  "Time of the Red",
  "Unification War",
  "Night City",
  "DataKrash",
  "Blackwall",
];

const args = process.argv.slice(2);
const follow = !args.includes("--no-follow");
const extra = args.filter((a) => !a.startsWith("--"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fileFor = (title) => path.join(OUT, title.replace(/[\/\\:*?"<>|]/g, "_") + ".wikitext");

async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: "json", formatversion: "2", maxlag: "5", ...params })) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const json = await res.json();
      if (json.error?.code === "maxlag") { await sleep(5000); continue; }
      if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`);
      return json;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url}`);
}

async function fetchBatch(titles, manifest) {
  const json = await api({
    action: "query",
    prop: "revisions",
    rvprop: "content|ids|timestamp",
    rvslots: "main",
    redirects: "1",
    titles: titles.join("|"),
  });
  const pages = json.query?.pages ?? [];
  const redirects = Object.fromEntries((json.query?.redirects ?? []).map((r) => [r.to, r.from]));
  const got = [];
  for (const p of pages) {
    if (p.missing || !p.revisions) continue;
    const rev = p.revisions[0];
    const text = rev.slots.main.content;
    await writeFile(fileFor(p.title), text);
    manifest[p.title] = {
      pageid: p.pageid,
      revid: rev.revid,
      timestamp: rev.timestamp,
      url: "https://cyberpunk.fandom.com/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":"),
      ...(redirects[p.title] ? { redirectFrom: redirects[p.title] } : {}),
    };
    got.push({ title: p.title, text });
  }
  return got;
}

export function wikiLinks(text) {
  const out = new Set();
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim().replace(/_/g, " ");
    if (!t || /^(File|Image|Category|Template|User|w|wikipedia|wp)\s*:/i.test(t)) continue;
    out.add(t.charAt(0).toUpperCase() + t.slice(1));
  }
  return [...out];
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : {};
  const queue = [...new Set([...SEEDS, ...extra])];
  const seen = new Set();
  let depth0 = new Set(queue);
  while (queue.length) {
    const batch = queue.splice(0, 50).filter((t) => !seen.has(t));
    batch.forEach((t) => seen.add(t));
    if (!batch.length) continue;
    const got = await fetchBatch(batch, manifest);
    process.stdout.write(`fetched ${got.length}/${batch.length} (total ${Object.keys(manifest).length})\n`);
    if (follow) {
      for (const { title, text } of got) {
        if (!depth0.has(title)) continue; // follow links one level from seeds only
        for (const l of wikiLinks(text)) if (!seen.has(l)) queue.push(l);
      }
    }
    await sleep(800); // be polite
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`done: ${Object.keys(sorted).length} pages in manifest`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
