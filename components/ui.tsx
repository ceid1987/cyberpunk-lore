"use client";

import type { ReactNode } from "react";
import { clusterById, type ClusterId, type Event, type Media, type Tier } from "@/data";

export const MEDIA_LABEL: Record<Media, string> = {
  tabletop: "Tabletop",
  "2077": "2077",
  "phantom-liberty": "Phantom Liberty",
  edgerunners: "Edgerunners",
};
export const MEDIA_COLOR: Record<Media, string> = { tabletop: "#ff8fb3", "2077": "#fcee0a", "phantom-liberty": "#ff9b3d", edgerunners: "#c8ff2e" };

/** Spoiler tag: "Lore" for events that spoil nothing, otherwise whose story they spoil. */
export const SPOIL_LABEL: Record<Media, string> = { tabletop: "Lore", "2077": "2077 Spoiler", "phantom-liberty": "PL Spoiler", edgerunners: "Edgerunners Spoiler" };
export const SPOIL_NAME: Record<Media, string> = { tabletop: "Tabletop", "2077": "Cyberpunk 2077", "phantom-liberty": "Phantom Liberty", edgerunners: "Edgerunners" };
export const LORE_COLOR = "#05d9e8";
export const SPOIL_COLOR = "#ff2a6d";
export function spoilerTag(e: Event) {
  return e.spoils ? { label: SPOIL_LABEL[e.spoils], color: SPOIL_COLOR } : { label: "Lore", color: LORE_COLOR };
}

export const TIER_LABEL: Record<Tier, string> = { landmark: "Landmark", major: "Major", minor: "Minor" };
export const TIER_COLOR: Record<Tier, string> = { landmark: "#fcee0a", major: "#05d9e8", minor: "#a9a9c0" };

/** 24x24 stroke icons per cluster. Shared by the DOM (SVG) and the map (canvas Path2D). */
export const CLUSTER_ICON: Record<ClusterId, string> = {
  megacorps: "M4 21V5l8-3v19M12 21V9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2",
  governments: "M3 21h18M5 21V10M19 21V10M9.7 21V10M14.3 21V10M3 10l9-6 9 6Z",
  "night-city": "M2 21h20M4 21V11h4v10M10 21V4h4v17M16 21V8h4v13M12 7v.01M12 10v.01",
  "net-ai": "M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6ZM10 10h4v4h-4Z",
  "cyberware-tech": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  space: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM2.5 16.5c1.5 1.8 17.5-6.7 19-9",
  factions: "M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4 3 5v3h8v-3c1.7-1 3-2.5 3-5a7 7 0 0 0-7-7ZM9 11h.01M15 11h.01M10 18v3M14 18v3",
  figures: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-7 8-7s8 3 8 7",
  edgerunners: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  cp2077: "M7 4h10l3 3v10l-3 3H7l-3-3V7ZM9 9h6v6H9Z",
  world: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z",
};

export function ClusterIcon({ id, size = 14, color }: { id: ClusterId; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? clusterById[id].color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="block shrink-0">
      <path d={CLUSTER_ICON[id]} />
    </svg>
  );
}

export function Tag({ children, color = "#a9a9c0", title, small }: { children: ReactNode; color?: string; title?: string; small?: boolean }) {
  return (
    <span
      title={title}
      className={`cp-tag inline-flex items-center gap-1 border font-display font-medium uppercase leading-none tracking-wider ${small ? "h-[17px] px-1 text-[9.5px]" : "h-[22px] px-1.5 text-[11px]"}`}
      style={{ color, borderColor: color + "70", background: color + "14", ["--b" as string]: color + "70" }}
    >
      {children}
    </span>
  );
}

/** Theme badge with icon, placed in the top-right corner of cards and the detail header. */
export function ClusterBadge({ id, small }: { id: ClusterId; small?: boolean }) {
  const c = clusterById[id];
  return (
    <span className={`inline-flex items-center gap-1 font-display font-medium uppercase leading-none tracking-wider ${small ? "text-[9.5px]" : "text-[11px]"}`} style={{ color: c.color }} title={c.name}>
      <ClusterIcon id={id} size={small ? 11 : 13} />
      <span className="translate-y-[0.5px]">{c.short}</span>
    </span>
  );
}

/** Importance, spoiler level, and the media an event appears in. */
export function TagRow({ e, small, hidden }: { e: Event; small?: boolean; hidden?: boolean }) {
  const sp = spoilerTag(e);
  return (
    <div className={`flex flex-wrap items-center ${small ? "gap-1" : "gap-1.5"}`}>
      <Tag color={TIER_COLOR[e.tier]} small={small}>
        {TIER_LABEL[e.tier]}
      </Tag>
      <Tag color={sp.color} small={small}>
        {sp.label}
      </Tag>
      {!hidden &&
        e.media.map((m) => (
          <Tag key={m} color={MEDIA_COLOR[m]} small={small} title={`Appears in ${MEDIA_LABEL[m]}`}>
            {MEDIA_LABEL[m]}
          </Tag>
        ))}
    </div>
  );
}

export function tierSize(t: Tier) {
  return t === "landmark" ? 16 : t === "major" ? 11 : 7;
}

type IconName = "play" | "museum" | "search" | "filter" | "graph" | "timeline" | "close" | "eye" | "eyeOff" | "external" | "chevronL" | "chevronR" | "flag" | "info" | "check" | "layers" | "image" | "plus" | "minus" | "fit" | "fitExit";

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
    case "play":
      return (<svg {...p}><path d="M8 5v14l11-7Z" /></svg>);
    case "museum":
      return (<svg {...p}><path d="M3 21h18M4 10h16M12 3l9 5H3ZM6 10v8M10 10v8M14 10v8M18 10v8" /></svg>);
    case "search":
      return (<svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
    case "filter":
      return (<svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
    case "graph":
      return (<svg {...p}><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="6" r="2" /><circle cx="15" cy="17" r="3" /><path d="m8.3 8 4.9 7M8.5 7l7.5-.8M17.5 8l-1.6 6" /></svg>);
    case "timeline":
      return (<svg {...p}><path d="M3 12h18" /><circle cx="7" cy="12" r="2" /><circle cx="16" cy="12" r="2" /><path d="M7 10V5M16 14v5" /></svg>);
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
    case "image":
      return (<svg {...p}><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></svg>);
    case "plus":
      return (<svg {...p}><path d="M12 5v14M5 12h14" /></svg>);
    case "minus":
      return (<svg {...p}><path d="M5 12h14" /></svg>);
    case "fitExit":
      return (<svg {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>);
    case "fit":
      return (<svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);
  }
}

export function IconButton({ label, onClick, children, active, activeColor = "#05d9e8", className = "" }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; activeColor?: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`cp-btn relative grid h-10 w-10 place-items-center border transition-colors ${className}`}
      style={active ? { borderColor: activeColor + "b0", background: activeColor + "1a", color: activeColor, ["--b" as string]: activeColor + "b0" } : { borderColor: "#262636", background: "#12121ccc", color: "#a9a9c0" }}
    >
      {children}
    </button>
  );
}
