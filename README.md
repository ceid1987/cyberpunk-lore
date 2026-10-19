# Cyberpunk Lore

A mobile-first lore timeline and relevance map of the Cyberpunk world, made for friends who have watched **Cyberpunk: Edgerunners** but haven't played **Cyberpunk 2077**. Free, unofficial and non-commercial.

- **Timeline view**: a horizontal line from 1859 to 2095. Drag to move, pinch or scroll to zoom. Detail follows zoom: landmarks first, then major and minor events, and cards grow from compact to full (with the wiki image) as space allows. Every card shows all its tags.
- **Map view**: every theme cluster is open, with related events bundled into groups (Arasaka, Militech, Johnny Silverhand, Nomads...). Tap a group to open it. Links are merged between whatever is on screen, so closed groups carry one line per neighbour.
- **Tags**: theme (with icon), importance, spoiler level, and the media each subject appears in (Tabletop, 2077, Phantom Liberty, Edgerunners), derived from the wiki's own page metadata.
- **Images**: each event's lead image from its wiki page, hot-linked from the wiki with a credit link, and switchable off in Filters.
- **Spoiler safety**: 2077 and Phantom Liberty plot events are blurred until tapped; the eye button toggles this.
- Search, filters (theme, era, media, spoiler level), a 15-step **Start here** path, and a "viewed" marker stored in the browser.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # validates data, computes the map layout, static export to out/
npx serve out        # preview the static build
```

Requires Node 20+.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and deploys on every push to `main`. One-time setup in the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is served at `https://<user>.github.io/<repo>/`; the workflow sets `NEXT_PUBLIC_BASE_PATH` to the repo name so asset paths work. The app is fully static and makes no calls to the wiki at runtime.

## Project layout

```
app/                    Next.js App Router entry (layout, page, global styles)
components/             TimelineView, GraphView (canvas), EventSheet, Panels, TopBar, LoreApp
lib/store.tsx           App state (view, filters, tier level, spoilers, viewed) via React context
data/
  types.ts              LoreEvent / Era / Cluster types
  eras.ts, clusters.ts  Era boundaries and cluster colors
  events/<era>.ts       The events, one file per era
  start-here.ts         The guided path
  generated/            graph-layout.json (built by `npm run layout`)
  raw/manifest.json     Wiki pages downloaded, with revision ids (page text itself is gitignored)
  sources.md            Which wiki pages each era cites (generated)
scripts/
  fetch-wiki.mjs        Download raw wikitext through the MediaWiki API
  extract-timeline.mjs  Parse the timeline pages into data/raw/timeline-candidates.json
  context.mjs           Authoring helper: show candidates + linked page text for a year range
  validate.ts           Data checks (run before every build)
  layout-graph.ts       Build-time d3-force layout for the map
  sources-log.ts        Regenerate data/sources.md
```

## Adding or editing events

1. Read the wiki page first. Paraphrase; never paste wiki paragraphs (the wiki is CC BY-SA).
2. Add an object to the right `data/events/<era>.ts` file:

```ts
{
  id: "kebab-case-unique-id",
  title: "Short headline",
  inWorldDate: "June 6, 2070",        // as the wiki gives it
  sortYear: 2070.43,                  // decimals order events inside a year
  era: "the-2070s",                   // must match the year range in data/eras.ts
  cluster: "governments",             // see data/clusters.ts
  tier: "major",                      // landmark | major | minor
  canonSource: "2077",                // primary source: 2077 | edgerunners | tabletop | multiple
  summary: "2 to 4 sentences.",
  whyItMatters: "One or two sentences.",
  spoilerLevel: "world",              // edgerunners-safe | world | game-spoiler
  related: [{ id: "unification-war", relation: "part-of" }],
  wikiUrl: w("Unification War", "Late war"),
  conflictNote: "Optional: where wiki pages or canons disagree.",
}
```

`related` describes how the linked event relates to this one: `caused` (it caused this), `led-to` (this led to it), `part-of` (this is part of it), `involves` (a looser link). Links only need to be written on one side; the app shows both directions.

3. Optionally add the event to a map group in `data/groups.ts` (all members of a group must share a cluster).
4. Run `npm run wiki:meta` to refresh media tags and images, then `npm run validate`. It fails on missing fields, bad enum values, non-wiki URLs, duplicate ids and dangling `related` ids, and warns when an event's era doesn't match its year.
5. Run `npm run sources` to refresh `data/sources.md`.

**Tier rules.** Landmark: changes the state of the world or anchors a game or series (about 3 to 6 per era). Major: has its own wiki article and shifts a faction, city or technology. Minor: world-building detail.

## Re-running the data pipeline

```bash
npm run wiki:fetch                 # seeds + every page they link to, into data/raw/pages/
npm run wiki:fetch -- "Night City" "Adam Smasher"   # fetch specific extra pages
npm run wiki:extract               # timeline pages -> data/raw/timeline-candidates.json
npm run wiki:meta                  # media tags + lead images -> data/generated/wiki-meta.json (commit it)
node scripts/context.mjs 2070 2079             # candidates for a year range, with linked page leads
node scripts/context.mjs --page "Dogtown" --grep 2070   # paragraphs of one page
```

Behind a corporate or sandbox proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` (Node 22.13+). The wiki's current revision ids are stored in `data/raw/manifest.json`, so you can diff what changed on the wiki since the data was written.

Writing events is a reading-and-paraphrasing step, not an automatic one: the scripts gather and organize the source text, and each event is written by hand (or with an AI assistant) from it.

## Tech choices

- **Next.js (App Router) + TypeScript + Tailwind CSS v4**, static export.
- **@tanstack/react-virtual** for the timeline, so only on-screen rows are rendered.
- **d3-force** rather than React Flow for the map. React Flow renders every node as a DOM element and runs layout in the browser, which gets heavy on mid-range phones with hundreds of nodes. Here d3-force runs once at build time (`scripts/layout-graph.ts`, deterministic seed) and the map draws to a single `<canvas>`. Level of detail: clusters start as single bubbles, tiers appear as you zoom, only on-screen items are drawn, and labels show by tier and zoom.
- **Framer Motion** for the bottom sheet, panels and the view-switch morph (nodes fly from timeline to map positions; it falls back to a crossfade above 120 moving nodes, and to an instant switch with `prefers-reduced-motion`).
- Fonts are self-hosted via Fontsource (Chakra Petch for headings, Inter for body). No images from CD Projekt Red, R. Talsorian or Netflix: visuals are CSS, SVG and canvas only.

## Attribution and licensing

Event text is adapted from the [Cyberpunk Wiki](https://cyberpunk.fandom.com/) on Fandom, licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Every event links to its source page. Images are not part of that license: they are loaded directly from the wiki's servers (not stored in this repo), credited and linked to their file pages, and remain the property of their owners (mostly CD Projekt Red, R. Talsorian Games and Netflix). The event data in `data/events/` is shared under the same CC BY-SA 3.0 license; the application code is MIT.

Cyberpunk, Cyberpunk 2077, Cyberpunk: Edgerunners and related names are trademarks of CD Projekt S.A., R. Talsorian Games and/or Netflix. This project is not affiliated with or endorsed by them.
