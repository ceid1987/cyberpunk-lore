#!/usr/bin/env node
// Authoring helper: print the lead and the dated paragraphs of wiki pages.
//   node scripts/dated.mjs "Page A" "Page B" --max 350 --n 8
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { plain } from "./extract-timeline.mjs";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const manifest = JSON.parse(await readFile(path.join(ROOT, "data/raw/manifest.json"), "utf8"));
const args = process.argv.slice(2);
const flag = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const max = flag("--max", 350), n = flag("--n", 8);
const titles = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
for (const t of titles) {
  const key = manifest[t] ? t : Object.keys(manifest).find((k) => manifest[k].redirectFrom === t || k.toLowerCase() === t.toLowerCase());
  const f = key && path.join(ROOT, "data/raw/pages", key.replace(/[\/\\:*?"<>|]/g, "_") + ".wikitext");
  if (!f || !existsSync(f)) { console.log(`=== ${t}: not in dump`); continue; }
  const text = await readFile(f, "utf8");
  const paras = text.replace(/\{\{Infobox[\s\S]*?\n\}\}/i, "").split(/\n\s*\n|\n(?===)/).map((p) => plain(p)).filter((p) => p.length > 40 && !/^(Category|==\s*(Gallery|References|Trivia))/.test(p));
  console.log(`=== ${key}`);
  console.log("  L: " + (paras[0] ?? "").slice(0, max));
  paras.slice(1).filter((p) => /\b(19|20)\d\d\b/.test(p)).slice(0, n).forEach((p) => console.log("  - " + p.slice(0, max)));
}
