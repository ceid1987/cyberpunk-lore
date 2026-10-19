"use client";

import { activeFilterCount, useStore, type TierLevel } from "@/lib/store";
import { Icon, IconButton } from "./ui";

const TIERS: { level: TierLevel; label: string; hint: string }[] = [
  { level: 0, label: "Key", hint: "Landmark events only" },
  { level: 1, label: "+ Major", hint: "Add major events" },
  { level: 2, label: "All", hint: "Add minor events too" },
];

export default function TopBar() {
  const { state, dispatch } = useStore();
  const fc = activeFilterCount(state.filters);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "about" })}
          className="mr-auto text-left"
          aria-label="About this app"
        >
          <span className="glitch block font-display text-[17px] font-bold uppercase leading-none tracking-[0.14em] text-yellow" data-text="Night City Lore">
            Night City Lore
          </span>
          <span className="mt-0.5 block font-display text-[10px] uppercase tracking-[0.3em] text-ink-3">1859 → 2095</span>
        </button>
        <IconButton label="Start here: guided path" onClick={() => dispatch({ type: "panel", panel: "start" })} active={state.pathIndex !== null}>
          <Icon name="flag" />
        </IconButton>
        <IconButton label="Search events" onClick={() => dispatch({ type: "panel", panel: "search" })}>
          <Icon name="search" />
        </IconButton>
        <IconButton label={`Filters${fc ? ` (${fc} active)` : ""}`} onClick={() => dispatch({ type: "panel", panel: "filters" })} active={fc > 0}>
          <Icon name="filter" />
          {fc > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-magenta px-1 text-[11px] font-bold text-bg">{fc}</span>}
        </IconButton>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2 pt-2">
        <div role="radiogroup" aria-label="Detail level" className="flex flex-1 overflow-hidden rounded-md border border-line">
          {TIERS.map((t) => {
            const on = state.tierLevel === t.level;
            return (
              <button
                key={t.level}
                role="radio"
                aria-checked={on}
                title={t.hint}
                onClick={() => dispatch({ type: "tier", level: t.level })}
                className={`h-9 flex-1 font-display text-[12px] font-medium uppercase tracking-wider transition-colors ${on ? "bg-cyan/15 text-cyan" : "text-ink-3 hover:text-ink-2"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.hideSpoilers}
          onClick={() => dispatch({ type: "hideSpoilers", value: !state.hideSpoilers })}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-display text-[12px] font-medium uppercase tracking-wider ${state.hideSpoilers ? "border-magenta/60 bg-magenta/10 text-magenta" : "border-line text-ink-3"}`}
          aria-label="Hide Cyberpunk 2077 and Phantom Liberty spoilers"
          title="Hide Cyberpunk 2077 and Phantom Liberty spoilers"
        >
          <Icon name={state.hideSpoilers ? "eyeOff" : "eye"} size={16} />
          <span>{state.hideSpoilers ? "Safe" : "Spoilers"}</span>
        </button>
      </div>
    </header>
  );
}
