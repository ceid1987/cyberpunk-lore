"use client";

import { useEffect } from "react";
import { activeFilterCount, useStore } from "@/lib/store";
import { Icon } from "./ui";

/** Search, filters and fullscreen. A column floating over the timeline / map, or a row in the museum header. */
export function Tools({ row, compact }: { row?: boolean; compact?: boolean }) {
  const { state, dispatch } = useStore();
  const fc = activeFilterCount(state.filters);
  const size = compact ? "h-9 w-9" : "h-10 w-10";

  const toggleFullscreen = () => {
    const on = !state.immersive;
    dispatch({ type: "immersive", value: on });
    // Real fullscreen where the browser allows it (not on iPhone); hiding the top bar works everywhere.
    try {
      if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch {}
  };

  return (
    <div className={`flex gap-1.5 ${row ? "flex-row" : "flex-col"}`}>
      <Btn label="Search events" className={size} onClick={() => dispatch({ type: "panel", panel: "search" })}>
        <Icon name="search" size={18} />
      </Btn>
      <Btn label={`Filters${fc ? ` (${fc} active)` : ""}`} className={size} active={fc > 0} onClick={() => dispatch({ type: "panel", panel: "filters" })}>
        <Icon name="filter" size={18} />
        {fc > 0 && <span className="absolute bottom-0.5 right-0.5 grid h-3.5 min-w-3.5 place-items-center bg-magenta px-0.5 text-[9px] font-bold leading-none text-bg">{fc}</span>}
      </Btn>
      <Btn label={state.immersive ? "Exit fullscreen" : "Fullscreen"} className={size} active={state.immersive} onClick={toggleFullscreen}>
        <Icon name={state.immersive ? "fitExit" : "fit"} size={18} />
      </Btn>
    </div>
  );
}

/** Leaving browser fullscreen with Esc also leaves immersive mode. */
export function useFullscreenSync() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    const on = () => {
      if (!document.fullscreenElement && state.immersive) dispatch({ type: "immersive", value: false });
    };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [state.immersive, dispatch]);
}

function Btn({ label, onClick, children, active, className }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; className: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      onPointerDown={(ev) => ev.stopPropagation()}
      className={`cp-btn relative grid place-items-center border backdrop-blur-sm transition-colors ${className} ${active ? "border-cyan/70 bg-cyan/10 text-cyan" : "border-line bg-bg/85 text-ink hover:border-cyan"}`}
      style={{ ["--b" as string]: active ? "#05d9e8b3" : "#262636" }}
    >
      {children}
    </button>
  );
}
