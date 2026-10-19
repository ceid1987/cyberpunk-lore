// Builds data/generated/wiki-meta.json for every event:
//   media:  which media the event's subject appears in (tabletop / 2077 /
//           phantom-liberty / edgerunners), read from the page's infobox
//           "appears_*" fields and categories in the raw dump.
//   image:  the wiki's own lead image for that page (via the MediaWiki
//           pageimages API): a thumbnail URL on the wiki's image server and
//           the File: page to credit. Images are hot-linked, never copied.
//
//   npm run wiki:meta     (needs data/raw/pages from `npm run wiki:fetch`)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { events } from "../data";
import type { Media } from "../data/types";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://cyberpunk.fandom.com/api.php";
const UA = "CyberpunkLoreFanTimeline/0.2 (non-commercial fan project; github.com/ceid1987/cyberpunk-lore)";
const manifest: Record<string, { redirectFrom?: string }> = JSON.parse(readFileSync(path.join(ROOT, "data/raw/manifest.json"), "utf8"));
const redirectTo = new Map(Object.entries(manifest).filter(([, m]) => m.redirectFrom).map(([t, m]) => [m.redirectFrom!, t]));

// Edgerunners connections that page metadata alone doesn't capture (subject is shown in the anime).
const EXTRA_EDGERUNNERS = ["arasaka-founded", "artificial-muscle-fiber", "eec-eurodollar", "night-city-founded", "tycho-founded", "world-sat-network", "militech-renamed", "cybermodem-invented", "braindance-invented", "psycho-squad-formed", "maelstrom-formed", "fourth-corporate-war", "trauma-team-neutral", "datakrash", "night-city-holocaust", "johnny-killed-2023", "arasaka-returns", "new-arasaka-tower", "sasquatch-animals", "highrider-confederation"];
// Pages too generic to use for media or images.
const GENERIC = new Set(["Timeline", "Greater Europe Timeline: Future Past", "South-East Asia Timeline"]);

function titleOf(url: string) {
  const t = decodeURIComponent(url.split("/wiki/")[1].split("#")[0]).replace(/_/g, " ");
  return manifest[t] ? t : redirectTo.get(t) ?? t;
}

function pageMedia(title: string): Media[] {
  const f = path.join(ROOT, "data/raw/pages", title.replace(/[\/\\:*?"<>|]/g, "_") + ".wikitext");
  if (!existsSync(f)) return [];
  const txt = readFileSync(f, "utf8");
  const appears = (txt.match(/\|\s*appears_(games|books|other)\s*=[^\n]*/g) ?? []).join(" ");
  const cats = (txt.match(/\[\[Category:[^\]]+\]\]/g) ?? []).join(" ");
  const all = appears + " " + cats;
  const m = new Set<Media>();
  if (/\{\{CP\|(2013|2020|RED)[^}]*\}\}|Cyberpunk (2013|2020|RED) /i.test(all)) m.add("tabletop");
  if (/\{\{CP\|2077(?!PL)[^}]*\}\}|Cyberpunk 2077 /i.test(all)) m.add("2077");
  if (/\{\{CP\|2077PL\}\}|Phantom Liberty/i.test(all)) m.add("phantom-liberty");
  if (/\{\{CP\|(EDGE|CEMK)[^}]*\}\}|Edgerunners/i.test(all)) m.add("edgerunners");
  return [...m];
}

const fromCanon = (c: string): Media[] => (c === "multiple" ? [] : [c as Media]);

async function pageImages(titles: string[]) {
  const out: Record<string, { thumb: string; file: string }> = {};
  for (let i = 0; i < titles.length; i += 40) {
    const u = new URL(API);
    Object.entries({ action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "480", pilimit: "50", redirects: "1", format: "json", formatversion: "2", titles: titles.slice(i, i + 40).join("|") }).forEach(([k, v]) => u.searchParams.set(k, v));
    const j = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    const redirects = new Map<string, string>((j.query?.redirects ?? []).map((r: any) => [r.to, r.from]));
    for (const p of j.query?.pages ?? []) {
      if (!p.thumbnail || !p.pageimage) continue;
      const v = { thumb: p.thumbnail.source as string, file: p.pageimage as string };
      out[p.title] = v;
      if (redirects.has(p.title)) out[redirects.get(p.title)!] = v;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return out;
}

const titles = [...new Set(events.map((e) => titleOf(e.wikiUrl)).filter((t) => !GENERIC.has(t)))];
const imgs = await pageImages(titles);

const meta: Record<string, { media: Media[]; image?: { thumb: string; file: string; page: string } }> = {};
for (const e of events) {
  const t = titleOf(e.wikiUrl);
  const media = new Set<Media>([...fromCanon(e.canonSource), ...(GENERIC.has(t) ? [] : pageMedia(t))]);
  if (EXTRA_EDGERUNNERS.includes(e.id) || e.cluster === "edgerunners") media.add("edgerunners");
  if (e.canonSource === "multiple" && media.size === 0) media.add("tabletop");
  const im = GENERIC.has(t) ? undefined : imgs[t];
  meta[e.id] = {
    media: (["tabletop", "2077", "phantom-liberty", "edgerunners"] as Media[]).filter((m) => media.has(m)),
    ...(im ? { image: { ...im, page: "https://cyberpunk.fandom.com/wiki/File:" + encodeURIComponent(im.file) } } : {}),
  };
}
writeFileSync(path.join(ROOT, "data/generated/wiki-meta.json"), JSON.stringify(meta, null, 1));
console.log(`wiki-meta: ${events.length} events, ${Object.values(meta).filter((m) => m.image).length} with images`);
