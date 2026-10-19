import type { Cluster, ClusterId } from "./types";

// Clusters for the relevance map. Colors chosen for >= 4.5:1 contrast on #07070b.
export const clusters: Cluster[] = [
  { id: "megacorps", name: "Megacorps & Corporate Wars", short: "Megacorps", color: "#ff2a6d", blurb: "Arasaka, Militech and the rest: foundings, rivalries, scandals and the four Corporate Wars." },
  { id: "governments", name: "Governments, States & Wars", short: "States", color: "#ffa53d", blurb: "The Collapse, the NUSA, the Free States, the Unification War and conflicts between nations." },
  { id: "night-city", name: "Night City", short: "Night City", color: "#05d9e8", blurb: "The founding, ruin and rebuilding of the city where Edgerunners and 2077 happen." },
  { id: "net-ai", name: "The Net, AI & the Blackwall", short: "Net & AI", color: "#a970ff", blurb: "Netrunning, NetWatch, Rache Bartmoss, the DataKrash, rogue AIs and the Blackwall." },
  { id: "cyberware-tech", name: "Cyberware & Tech", short: "Cyberware", color: "#00f5a0", blurb: "Implants, cyberpsychosis, braindance, Soulkiller and other technology milestones." },
  { id: "space", name: "Space & Orbit", short: "Space", color: "#5c8dff", blurb: "Orbital stations, the Highriders, Mars and Moon colonies and deep space missions." },
  { id: "factions", name: "Gangs, Nomads & Subcultures", short: "Factions", color: "#ff6a3d", blurb: "Maelstrom, Tyger Claws, Voodoo Boys, Nomad families and other street-level powers." },
  { id: "figures", name: "Key Figures", short: "Figures", color: "#ff5cf0", blurb: "Turning points in the lives of the people who shaped the world." },
  { id: "edgerunners", name: "Edgerunners", short: "Edgerunners", color: "#c8ff2e", blurb: "Where the anime sits in the wider timeline." },
  { id: "cp2077", name: "Cyberpunk 2077 & Phantom Liberty", short: "2077", color: "#fcee0a", blurb: "Story events of the game and its expansion. Spoilers." },
  { id: "world", name: "World & Society", short: "World", color: "#b8c2cc", blurb: "Environment, culture and regional events that give the setting its texture." },
];

export const clusterById = Object.fromEntries(clusters.map((c) => [c.id, c])) as Record<ClusterId, Cluster>;
