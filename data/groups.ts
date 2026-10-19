// Sub-clusters for the relevance map. A group collects events about the same
// organisation, person or storyline inside one cluster, so the map can show it
// as a single node until it's opened. Events not listed stay as single nodes.

export interface Group {
  id: string;
  name: string;
  members: string[];
}

export const groups: Group[] = [
  // megacorps
  { id: "arasaka", name: "Arasaka", members: ["arasaka-founded", "saburo-takes-arasaka", "arasaka-japan-politics", "yasubisu-affair", "arasaka-africa", "arasaka-expelled", "arasaka-saves-emperor", "new-arasaka-tower", "arasaka-vs-nccs", "yorinobu-ceo", "chicago-virus-bomb"] },
  { id: "militech", name: "Militech", members: ["armatech-luccessi-founded", "lundee-joins-militech", "militech-renamed", "militech-nationalized"] },
  { id: "corporate-wars", name: "The Corporate Wars", members: ["first-corporate-war", "second-corporate-war", "third-corporate-war", "fourth-corporate-war", "eurobank-ceasefire", "fourth-corporate-war-ends", "zetatech-loses-netwar", "trauma-team-neutral"] },
  { id: "sovoil-petrochem", name: "Oil & fuel giants", members: ["sovoil-formed", "sovoil-independent", "petrochem-depleted", "biotechnica-paris-attack", "biotechnica-de-extinction"] },
  { id: "arms-tech-corps", name: "Arms & tech makers", members: ["tsunami-founded", "kang-tao-rises", "kang-tao-expands", "kendachi-colombia", "zetatech-rise", "lazarus-group", "network-54", "ebm-hamburg", "ssi-founded"] },
  // figures
  { id: "arasaka-family", name: "The Arasaka family", members: ["sasai-arasaka-born", "saburo-arasaka-born", "saburo-wounded-1942", "saburo-surrender-vision", "kei-arasaka-born", "yorinobu-born", "hanako-born", "kei-arasaka-seppuku"] },
  { id: "johnny-silverhand", name: "Johnny Silverhand", members: ["johnny-silverhand-born", "johnny-silverhand-war", "samurai-formed", "samurai-splits", "arasaka-tower-2013", "johnny-killed-2023", "johnny-body-rumors", "kerry-eurodyne-born"] },
  { id: "rogue", name: "Solos & power players", members: ["rogue-johnny-split", "rogue-becomes-fixer", "blackhand-sightings"] },
  { id: "2077-cast", name: "2077 cast", members: ["jackie-welles-born", "judy-born", "peralez-born", "song-so-mi-born", "songbird-recruited"] },
  // governments
  { id: "gang-of-four", name: "Gang of Four", members: ["gang-of-four-forms", "drug-plagues", "quiet-war", "nyc-nuke", "president-allen-assassinated", "hunt-murdered", "nsa-exposed", "tesla-johanneson-killed", "gang-of-four-ends"] },
  { id: "us-collapse", name: "US collapse & recovery", members: ["crash-of-94", "collapse-begins", "federal-weapons-statute", "us-free-elections-2008", "operation-big-stick", "first-central-american-war", "second-central-american-war"] },
  { id: "kress-nusa", name: "Kress & the NUSA", members: ["kress-vice-president", "kress-president", "kress-state-of-emergency", "nusa-constitution", "myers-president", "myers-militech-offer"] },
  { id: "free-states", name: "Free States & Unification", members: ["alaska-free-state", "california-free-state", "northern-separation-war", "pacifica-confederation", "estero-bay-cog", "unification-war", "sacramento-bombed", "treaty-of-unification", "second-hot-war-prediction"] },
  { id: "europe-world", name: "Europe & the world", members: ["eec-eurodollar", "fortress-europe", "neo-soviet-union", "uk-martial-law", "european-brushfire-wars", "second-korean-war", "west-australia-secedes", "new-yen", "mideast-meltdown"] },
  // night city
  { id: "founding", name: "Founding of Night City", members: ["night-international-formed", "coronado-city-funded", "night-city-founded", "night-city-university", "maglev-to-night-city", "richard-night-assassinated", "night-foundation"] },
  { id: "mob-era", name: "Mob rule & turf wars", members: ["mob-rule", "mob-war", "metal-wars", "forlorn-hope", "forlorn-hope-shelled"] },
  { id: "rebuilding", name: "Rebuilding Night City", members: ["night-city-refounded", "night-city-reconstruction", "kabuki-district", "megabuildings", "city-hall-opens", "new-corporate-plaza", "pacifica-resort", "varicella-h", "bird-flu-years", "laguna-bend-dam"] },
  { id: "nc-politics", name: "City politics", members: ["rhyne-council", "city-of-opportunity-bill", "rhyne-dies-election", "peralez-conspiracy", "watson-lockdown"] },
  { id: "maxtac", name: "MaxTac", members: ["psycho-squad-formed", "maxtac-reformed"] },
  // net
  { id: "bartmoss", name: "Rache Bartmoss", members: ["rache-bartmoss-born", "spider-murphy-starts", "rabids-planted", "bartmoss-body-dies"] },
  { id: "netwatch-blackwall", name: "NetWatch & the Blackwall", members: ["netwatch-founded", "net-declared-down", "old-net-sealed", "blackwall-begun", "netwatch-hunts-voodoo-boys"] },
  { id: "cynosure", name: "Project Cynosure", members: ["cynosure-project", "cynosure-reactivated"] },
  // factions
  { id: "nomads", name: "Nomads", members: ["aldecaldos-form", "first-nomad-families", "nomad-riots", "long-walk", "chicago-port", "johnny-hides-aldecaldos", "seven-nations", "diaspora", "badlands-incident", "wraiths-vs-aldecaldos"] },
  { id: "nc-gangs", name: "Night City gangs", members: ["maelstrom-formed", "brick-leads-maelstrom", "tyger-claws-watson", "tyger-claws-civil-war", "sixth-street-founded", "valentinos-6th-street-war", "mox-formed", "sasquatch-animals", "scavengers"] },
  { id: "pacifica-gangs", name: "Pacifica & Dogtown", members: ["haiti-abandoned", "voodoo-boys-pacifica", "dogtown-created"] },
  // space
  { id: "orbit-moon", name: "Orbit & the Moon", members: ["tycho-founded", "crystal-palace", "copernicus-founded", "crystal-palace-complete", "crystal-palace-warning", "first-orbital-war", "orbital-colony-revolts", "seven-hour-war", "highrider-confederation"] },
  { id: "deep-space", name: "Deep space missions", members: ["mars-mission", "pathfinder-launch", "pathfinder-lost", "saturn-mission", "proxima-probe"] },
  // edgerunners
  { id: "david", name: "David's story", members: ["david-martinez-born", "gloria-dies", "edgerunners-part-one", "david-leads-crew", "faraday-trap", "david-last-stand"] },
  { id: "lucy", name: "Lucy's story", members: ["lucy-arasaka-childhood", "lucy-meets-kiwi", "lucy-on-the-moon"] },
  // 2077
  { id: "relic-story", name: "The Relic", members: ["v-born", "v-and-jackie", "evelyn-parker-relic", "konpeki-heist", "hellman-emp", "hanako-kidnapped", "v-final-choice"] },
  { id: "phantom-liberty", name: "Phantom Liberty", members: ["space-force-one", "phantom-liberty-ending", "phantom-liberty-epilogue"] },
  // tech
  { id: "cyberware", name: "Cyberware", members: ["artificial-muscle-fiber", "cyberlimbs-military", "first-human-clone", "bioware", "kiroshi-orbital-optics", "cyberware-registration", "first-acpa", "lizzy-wizzy-chrome", "zetatech-dominance"] },
  { id: "minds", name: "Minds & engrams", members: ["soulkiller-created", "johnny-engram", "relic-announced", "braindance-invented"] },
  // world
  { id: "disasters", name: "Disasters & plagues", members: ["pittsburgh-meltdown", "la-earthquake", "wasting-plague", "food-crash", "millennium-cults", "extinctions", "petrochem-drought"] },
];

export const groupOf: Record<string, string> = Object.fromEntries(groups.flatMap((g) => g.members.map((m) => [m, g.id])));
export const groupById: Record<string, Group> = Object.fromEntries(groups.map((g) => [g.id, g]));
