import type { LoreEvent } from "./types";
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
export * from "./types";

/** Every event, sorted chronologically. */
export const events: LoreEvent[] = [
  ...divergence,
  ...collapse,
  ...corporateWars,
  ...fourthCorporateWar,
  ...timeOfTheRed,
  ...reunification,
  ...the2070s,
  ...beyond,
].sort((a, b) => a.sortYear - b.sortYear);

export const eventById: Record<string, LoreEvent> = Object.fromEntries(events.map((e) => [e.id, e]));
