import type { Event, LoreEvent } from "./types";
import meta from "./generated/wiki-meta.json";
import { groupOf } from "./groups";
import { divergence } from "./events/divergence";
import { collapse } from "./events/collapse";
import { corporateWars } from "./events/corporate-wars";
import { fourthCorporateWar } from "./events/fourth-corporate-war";
import { timeOfTheRed } from "./events/time-of-the-red";
import { reunification } from "./events/reunification";
import { the2070s } from "./events/the-2070s";
import { beyond } from "./events/beyond";

export { eras, eraById, eraForYear } from "./eras";
export { clusters, clusterById } from "./clusters";
export { startHere } from "./start-here";
export { groups, groupById, groupOf } from "./groups";
export * from "./types";

const raw: LoreEvent[] = [
  ...divergence,
  ...collapse,
  ...corporateWars,
  ...fourthCorporateWar,
  ...timeOfTheRed,
  ...reunification,
  ...the2070s,
  ...beyond,
];

const META = meta as Record<string, { media: Event["media"]; image?: Event["image"] }>;

// Plot events of Phantom Liberty that sit outside the "phantom-liberty" map group.
const PL_PLOT = new Set(["songbird-recruited", "song-so-mi-born"]);

/** Whose story an event spoils. Lore that merely appears in a work (Arasaka, NetWatch...) spoils nothing. */
function spoilsOf(e: LoreEvent, group?: string): Event["spoils"] {
  if (group === "phantom-liberty" || PL_PLOT.has(e.id)) return "phantom-liberty";
  if (e.canonSource === "edgerunners" && e.sortYear >= 2073) return "edgerunners";
  if (e.spoilerLevel === "game-spoiler") return "2077";
  return undefined;
}

/** Every event, sorted chronologically, with media tags, image, map group and spoiler scope. */
export const events: Event[] = raw
  .map((e) => ({ ...e, media: META[e.id]?.media ?? [], image: META[e.id]?.image, group: groupOf[e.id], spoils: spoilsOf(e, groupOf[e.id]) }))
  .sort((a, b) => a.sortYear - b.sortYear);

export const eventById: Record<string, Event> = Object.fromEntries(events.map((e) => [e.id, e]));
