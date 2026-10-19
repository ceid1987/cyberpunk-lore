"use client";

import { activeFilterCount, useStore } from "@/lib/store";
import { Icon, IconButton } from "./ui";

export default function TopBar() {
  const { state, dispatch } = useStore();
  const fc = activeFilterCount(state.filters);
  return (
    <header className="relative z-30 border-b border-line bg-bg/92 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="relative flex h-14 items-center gap-1.5 px-2.5">
        <IconButton label="Start here: guided path" onClick={() => dispatch({ type: "panel", panel: "start" })} active={state.pathIndex !== null} activeColor="#fcee0a">
          <Icon name="flag" size={18} />
        </IconButton>
        <IconButton
          label={state.hideSpoilers ? "2077 spoilers hidden. Show them" : "2077 spoilers shown. Hide them"}
          onClick={() => dispatch({ type: "hideSpoilers", value: !state.hideSpoilers })}
          active={state.hideSpoilers}
          activeColor="#ff2a6d"
        >
          <Icon name={state.hideSpoilers ? "eyeOff" : "eye"} size={18} />
        </IconButton>

        <button
          type="button"
          onClick={() => dispatch({ type: "panel", panel: "about" })}
          aria-label="Cyberpunk Lore: about this app"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        >
          <span className="cp-glitch block whitespace-nowrap font-display text-[16px] font-bold uppercase leading-none tracking-[0.1em] text-yellow" data-text="Cyberpunk Lore">
            Cyberpunk Lore
          </span>
          <span className="mt-1 block font-display text-[9px] uppercase tracking-[0.42em] text-ink-3">1859 · 2095</span>
        </button>

        <div className="ml-auto flex gap-1.5">
          <IconButton label="Search events" onClick={() => dispatch({ type: "panel", panel: "search" })}>
            <Icon name="search" size={18} />
          </IconButton>
          <IconButton label={`Filters${fc ? ` (${fc} active)` : ""}`} onClick={() => dispatch({ type: "panel", panel: "filters" })} active={fc > 0}>
            <Icon name="filter" size={18} />
            {fc > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center bg-magenta px-1 text-[10px] font-bold text-bg">{fc}</span>}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
