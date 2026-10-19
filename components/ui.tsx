"use client";

import type { ReactNode } from "react";
import { clusterById, type CanonSource, type ClusterId, type LoreEvent, type SpoilerLevel, type Tier } from "@/data";

export const CANON_LABEL: Record<CanonSource, string> = {
  "2077": "2077",
  edgerunners: "Edgerunners",
  tabletop: "Tabletop",
  multiple: "Multiple",
};

export const SPOILER_LABEL: Record<SpoilerLevel, string> = {
  "edgerunners-safe": "Edgerunners-safe",
  world: "World lore",
  "game-spoiler": "2077 spoiler",
};

export const TIER_LABEL: Record<Tier, string> = { landmark: "Landmark", major: "Major", minor: "Minor" };

export function Badge({ children, color = "#a9a9c0", title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-display text-[11px] font-medium uppercase leading-none tracking-wider"
      style={{ color, borderColor: color + "66", background: color + "14" }}
    >
      {children}
    </span>
  );
}

export function CanonBadge({ canon }: { canon: CanonSource }) {
  const color = canon === "2077" ? "#fcee0a" : canon === "edgerunners" ? "#c8ff2e" : canon === "tabletop" ? "#ff8fb3" : "#b8c2cc";
  return (
    <Badge color={color} title={`Canon source: ${CANON_LABEL[canon]}`}>
      <span aria-hidden>◆</span>
      {CANON_LABEL[canon]}
    </Badge>
  );
}

export function SpoilerBadge({ level }: { level: SpoilerLevel }) {
  const color = level === "game-spoiler" ? "#ff2a6d" : level === "edgerunners-safe" ? "#c8ff2e" : "#05d9e8";
  return <Badge color={color}>{SPOILER_LABEL[level]}</Badge>;
}

export function ClusterChip({ id, small }: { id: ClusterId; small?: boolean }) {
  const c = clusterById[id];
  return (
    <span className={`inline-flex items-center gap-1.5 ${small ? "text-[11px]" : "text-xs"} font-display uppercase tracking-wider`} style={{ color: c.color }}>
      <span className="inline-block h-2 w-2 rotate-45" style={{ background: c.color }} aria-hidden />
      {c.short}
    </span>
  );
}

export function tierSize(t: Tier) {
  return t === "landmark" ? 18 : t === "major" ? 12 : 8;
}

export function eventColor(e: LoreEvent) {
  return clusterById[e.cluster].color;
}

type IconName = "search" | "filter" | "graph" | "timeline" | "close" | "eye" | "eyeOff" | "external" | "chevronL" | "chevronR" | "flag" | "info" | "check" | "layers";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "search":
      return (<svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
    case "filter":
      return (<svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
    case "graph":
      return (<svg {...p}><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="6" r="2" /><circle cx="15" cy="17" r="3" /><path d="m8.3 8 4.9 7M8.5 7l7.5-.8M17.5 8l-1.6 6" /></svg>);
    case "timeline":
      return (<svg {...p}><path d="M7 3v18" /><circle cx="7" cy="7" r="2" /><circle cx="7" cy="16" r="2" /><path d="M11 7h9M11 16h6" /></svg>);
    case "close":
      return (<svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>);
    case "eye":
      return (<svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>);
    case "eyeOff":
      return (<svg {...p}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>);
    case "external":
      return (<svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
    case "chevronL":
      return (<svg {...p}><path d="m15 5-7 7 7 7" /></svg>);
    case "chevronR":
      return (<svg {...p}><path d="m9 5 7 7-7 7" /></svg>);
    case "flag":
      return (<svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>);
    case "info":
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
    case "check":
      return (<svg {...p}><path d="m5 12 4.5 4.5L19 7" /></svg>);
    case "layers":
      return (<svg {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>);
  }
}

export function IconButton({ label, onClick, children, active, className = "" }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative grid h-11 w-11 place-items-center rounded-md border transition-colors ${active ? "border-cyan/70 bg-cyan/10 text-cyan" : "border-line bg-panel/80 text-ink-2 hover:text-ink"} ${className}`}
    >
      {children}
    </button>
  );
}
