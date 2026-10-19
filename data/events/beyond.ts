import type { LoreEvent } from "../types";
import { w } from "./_helpers";

// Era: Beyond 2077 (2080 onward). The wiki records very little this far ahead.
export const beyond: LoreEvent[] = [
  {
    id: "second-hot-war-prediction",
    title: "AI analysts predict a new war with the Free States",
    inWorldDate: "By 2080",
    sortYear: 2080.1,
    era: "beyond",
    cluster: "governments",
    tier: "minor",
    canonSource: "2077",
    summary: "Leading AI analytics predict with 74% confidence that a second hot war between the NUSA and the Free States will break out by 2080.",
    whyItMatters: "The Unification War settled nothing for good.",
    spoilerLevel: "world",
    related: [
      { id: "unification-war", relation: "involves" },
      { id: "treaty-of-unification", relation: "involves" },
    ],
    wikiUrl: w("Timeline", "2080"),
  },
  {
    id: "proxima-probe",
    title: "An AI probe heads for Proxima Centauri b",
    inWorldDate: "Arrival expected 2095",
    sortYear: 2095,
    era: "beyond",
    cluster: "space",
    tier: "minor",
    canonSource: "2077",
    summary: "Orbital Air has launched a probe carrying an AI, expected to reach the exoplanet Proxima Centauri b in 2095.",
    whyItMatters: "The furthest point in the wiki's timeline: humanity's reach extends to another star.",
    spoilerLevel: "world",
    related: [],
    wikiUrl: w("Orbital Air"),
  },
];
