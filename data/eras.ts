import type { Era, EraId } from "./types";

const T = "https://cyberpunk.fandom.com/wiki/Timeline";

// Era boundaries follow the wiki's own named periods (The Collapse, the Corporate
// Wars, the Time of the Red) with year cuts where the wiki gives none.
export const eras: Era[] = [
  { id: "divergence", name: "Divergence", start: -Infinity, end: 1990, blurb: "From the 1800s to 1989: where the Cyberpunk world starts to split from ours.", wikiUrl: T },
  { id: "collapse", name: "The Collapse", start: 1990, end: 2004, blurb: "Economic ruin, failing governments and the rise of the megacorps.", wikiUrl: "https://cyberpunk.fandom.com/wiki/The_Collapse" },
  { id: "corporate-wars", name: "The Corporate Wars", start: 2004, end: 2020, blurb: "Corporations fight open wars with each other while the world rebuilds around them.", wikiUrl: "https://cyberpunk.fandom.com/wiki/Corporate_Wars" },
  { id: "fourth-corporate-war", name: "Fourth Corporate War", start: 2020, end: 2025, blurb: "The era of the Cyberpunk 2020 tabletop game, ending in the Arasaka-Militech war and a nuke in Night City.", wikiUrl: "https://cyberpunk.fandom.com/wiki/Fourth_Corporate_War" },
  { id: "time-of-the-red", name: "Time of the Red", start: 2025, end: 2046, blurb: "A shattered world rebuilds under red skies. The era of Cyberpunk RED.", wikiUrl: "https://cyberpunk.fandom.com/wiki/Time_of_the_Red" },
  { id: "reunification", name: "Reunification", start: 2046, end: 2070, blurb: "Corporations and the NUSA regain their grip, ending in the Unification War.", wikiUrl: T },
  { id: "the-2070s", name: "The 2070s", start: 2070, end: 2080, blurb: "Edgerunners, Cyberpunk 2077 and Phantom Liberty.", wikiUrl: T },
  { id: "beyond", name: "Beyond 2077", start: 2080, end: Infinity, blurb: "What the wiki records after the game.", wikiUrl: T },
];

export const eraById = Object.fromEntries(eras.map((e) => [e.id, e])) as Record<EraId, Era>;

export function eraForYear(y: number): EraId {
  return (eras.find((e) => y >= e.start && y < e.end) ?? eras[eras.length - 1]).id;
}
