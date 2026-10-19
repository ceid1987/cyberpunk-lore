// Shared data model. Every event in /data/events/*.ts must satisfy LoreEvent.
// Run `npm run validate` after editing data.

export type EraId =
  | "divergence"
  | "collapse"
  | "corporate-wars"
  | "fourth-corporate-war"
  | "time-of-the-red"
  | "reunification"
  | "the-2070s"
  | "beyond";

export type ClusterId =
  | "megacorps"
  | "governments"
  | "night-city"
  | "net-ai"
  | "cyberware-tech"
  | "space"
  | "factions"
  | "figures"
  | "edgerunners"
  | "cp2077"
  | "world";

export type Tier = "landmark" | "major" | "minor";

export type CanonSource = "2077" | "edgerunners" | "tabletop" | "multiple";

/** Media an event's subject appears in. Derived by scripts/wiki-meta.ts. */
export type Media = "tabletop" | "2077" | "phantom-liberty" | "edgerunners";

export type SpoilerLevel = "edgerunners-safe" | "world" | "game-spoiler";

export type Relation = "caused" | "led-to" | "part-of" | "involves";

/**
 * How the linked event relates to THIS event:
 *  caused   = the linked event caused this one      (shown as "Caused by")
 *  led-to   = this event led to the linked one      (shown as "Led to")
 *  part-of  = this event is part of the linked one  (shown as "Part of")
 *  involves = a looser connection (people, places, organisations in common)
 */
export interface RelatedLink {
  id: string;
  relation: Relation;
}

export interface LoreEvent {
  /** kebab-case, unique across all eras */
  id: string;
  title: string;
  /** Human readable in-world date as the wiki gives it, e.g. "June 6, 2070" or "Mid-2040s" */
  inWorldDate: string;
  /** Numeric sort key. Use decimals for ordering inside a year (2077.33 = ~May). */
  sortYear: number;
  era: EraId;
  cluster: ClusterId;
  tier: Tier;
  canonSource: CanonSource;
  /** 2 to 4 sentences, paraphrased from the wiki. Never copied. */
  summary: string;
  whyItMatters: string;
  spoilerLevel: SpoilerLevel;
  related: RelatedLink[];
  /** Full https://cyberpunk.fandom.com/wiki/... URL of the page this event is sourced from */
  wikiUrl: string;
  /** Present when the wiki is ambiguous or tabletop and 2077 canon disagree */
  conflictNote?: string;
}

/** An event with build-time extras merged in (see data/index.ts). */
export interface Event extends LoreEvent {
  media: Media[];
  group?: string;
  image?: { thumb: string; file: string; page: string };
}

export interface Era {
  id: EraId;
  name: string;
  /** inclusive start, exclusive end (sortYear) */
  start: number;
  end: number;
  blurb: string;
  wikiUrl: string;
}

export interface Cluster {
  id: ClusterId;
  name: string;
  short: string;
  /** CSS color used as accent */
  color: string;
  blurb: string;
}
