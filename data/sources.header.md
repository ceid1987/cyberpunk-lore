# Sources log

All facts come from the Cyberpunk Wiki (cyberpunk.fandom.com). Raw page text was
downloaded through the MediaWiki API with `npm run wiki:fetch` (revision ids in
`data/raw/manifest.json`), timeline entries were extracted with `npm run wiki:extract`,
and each event was written by reading the timeline entry together with its linked
article page(s) (`node scripts/context.mjs <from> <to>` and `--page "<title>"`).

## Timeline pages read

- [Timeline](https://cyberpunk.fandom.com/wiki/Timeline): master timeline, 1800s to 2095
- [Greater Europe Timeline: Future Past](https://cyberpunk.fandom.com/wiki/Greater_Europe_Timeline:_Future_Past): 1990 to 2020
- [South-East Asia Timeline](https://cyberpunk.fandom.com/wiki/South-East_Asia_Timeline): 1940 to 2019
- Game, edition and anime pages: Cyberpunk 2013, Cyberpunk 2020, Cyberpunk RED, Cyberpunk 2077, Phantom Liberty, Cyberpunk: Edgerunners

## Editorial decisions

- **Non-canon spin-offs excluded.** The wiki marks CyberGeneration and Cyberpunk V3.0 as an alternate timeline; none of their events are included.
- **Flavor only when tied to a cluster.** Trivia entries (car model years, film premieres, sports results, one-off regional politics) were skipped unless they connect to a faction, place, technology or theme in the app. Several environmental entries were merged into a single "World & Society" event.
- **Real-world history skipped.** Most South-East Asia entries before 1990 restate real history (World War II, Vietnam War) and were left out; Europe entries that duplicate the master timeline were merged.
- **Minor NPC births skipped.** Birth entries are only kept for figures who matter to Edgerunners or 2077.
- **2077 framing preferred.** Where tabletop and 2077 sources disagree, the event follows the 2077-era version and records the difference in `conflictNote`.

## Conflicts flagged for review

Search the event files for `conflictNote` to see each one. Run `npm run validate` for a count.
