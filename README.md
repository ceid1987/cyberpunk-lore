# Cyberpunk Lore

A mobile-first lore timeline and relevance map of the Cyberpunk world, made for friends who have watched **Cyberpunk: Edgerunners** but haven't played **Cyberpunk 2077**. Free, unofficial and non-commercial.

- **Timeline view**: a horizontal white line from 1859 to 2095. It opens zoomed out with every event as a dot and no cards. Zooming in (pinch, scroll, or `+` / `-`, `0` to reset) brings in cards by importance: landmarks, then major, then minor events. Compact cards show date, theme and title; zoomed in further they become full cards with the wiki image and all tags. Cards are packed in world space, so panning or opening an event never moves them.
- **Museum view**: opens on a single Start button, then steps through every event in date order with `>` / `<` (centred above the view switch, or the arrow keys). Three panes side by side: the event card, a slim timeline and the map; the Card / Timeline / Map buttons in its header switch each pane on or off. Tap any point on the slim timeline to go back to that event; "Jump to present" returns to the furthest event reached. The new point pops in, the map node arrives with a pulse, and links to events already shown draw from the older event to the new one.
- **Map view**: every theme starts closed as one bubble. Tap a theme to open it: its groups (Arasaka, Militech, Johnny Silverhand, Nomads...) and loose events spring out of the bubble. Tap a group to open it the same way.
- **Detail panel**: tapping an event opens it docked on the left on desktop, or as a bottom sheet on mobile that peeks and can be pulled up. Nothing behind it is blurred. Date, theme, close button, title and tags stay pinned while the text scrolls.
- **Spoiler-free filter**: choose any mix of Edgerunners, Cyberpunk 2077 and Phantom Liberty. Only events that spoil that story are blurred (tap to reveal); lore that merely appears in a work stays visible, so Arasaka is not an Edgerunners spoiler but David's last stand is. Each event's spoiler scope is derived in `data/index.ts` (`spoils`).
- **Tags**: importance, Lore or "<work> Spoiler", and the media each subject appears in (Tabletop, 2077, Phantom Liberty, Edgerunners), from the wiki's own page metadata.
- **Fullscreen**: hides the title bar (and uses browser fullscreen where available).
- Search, filters (theme, era, media, spoiler-free, images) and fullscreen sit in the same corner in every view. A "viewed" marker is stored in the browser.

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
components/             TimelineView, GraphView (canvas), MuseumView, EventSheet, Panels, Tools, TopBar, LoreApp
lib/store.tsx           App state (view, filters, spoiler-free, viewed, selection, museum panes, fullscreen)
data/
  types.ts              LoreEvent / Era / Cluster types
  eras.ts, clusters.ts  Era boundaries and cluster colors
  events/<era>.ts       The events, one file per era
  start-here.ts         A 15-event intro path (data only; not shown in the UI right now)
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
  summary: "2 to 4 sentences: what happened.",
  whyItMatters: "One sentence: the consequence. Shown as the end of the same paragraph.",
  spoilerLevel: "world",              // edgerunners-safe | world | game-spoiler (game-spoiler = spoils 2077)
  related: [{ id: "unification-war", relation: "part-of" }],
  wikiUrl: w("Unification War", "Late war"),
  conflictNote: "Optional, not shown in the app: where wiki pages or canons disagree.",
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
- The timeline is a custom pan/zoom view with a piecewise time scale (busy eras get more room) and greedy row packing; only on-screen cards are rendered.
- **d3-force** rather than React Flow for the map. React Flow renders every node as a DOM element and runs layout in the browser, which gets heavy on mid-range phones with hundreds of nodes. Here d3-force runs once at build time (`scripts/layout-graph.ts`, deterministic seed) and the map draws to a single `<canvas>`. The layout is nested (group members, then groups inside themes, then themes) so opening a theme or group never overlaps its neighbours. Only on-screen items are drawn, and labels avoid colliding.
- **Framer Motion** for the bottom sheet, panels and the view-switch morph (nodes fly from timeline to map positions; it falls back to a crossfade above 120 moving nodes, and to an instant switch with `prefers-reduced-motion`).
- Fonts are self-hosted via Fontsource (Chakra Petch for headings, Inter for body). UI visuals are CSS, SVG and canvas; the only third-party images are the wiki's own, hot-linked and credited.

## Attribution and licensing

Event text is adapted from the [Cyberpunk Wiki](https://cyberpunk.fandom.com/) on Fandom, licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Every event links to its source page. Images are not part of that license: they are loaded directly from the wiki's servers (not stored in this repo), credited and linked to their file pages, and remain the property of their owners (mostly CD Projekt Red, R. Talsorian Games and Netflix). The event data in `data/events/` is shared under the same CC BY-SA 3.0 license; the application code is MIT.

Cyberpunk, Cyberpunk 2077, Cyberpunk: Edgerunners and related names are trademarks of CD Projekt S.A., R. Talsorian Games and/or Netflix. This project is not affiliated with or endorsed by them.
