"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { events, eventById, type CanonSource, type ClusterId, type EraId, type LoreEvent, type SpoilerLevel, type Tier } from "@/data";

export type View = "timeline" | "graph";
/** 0 = landmarks, 1 = + major, 2 = + minor */
export type TierLevel = 0 | 1 | 2;

export interface Filters {
  clusters: ClusterId[];
  eras: EraId[];
  canon: CanonSource[];
  spoilers: SpoilerLevel[];
}

export interface State {
  view: View;
  tierLevel: TierLevel;
  hideSpoilers: boolean;
  revealed: string[]; // spoiler cards the user tapped open
  filters: Filters;
  selectedId: string | null;
  viewed: string[];
  panel: null | "search" | "filters" | "start" | "about";
  pathIndex: number | null; // position in Start Here path while following it
}

type Action =
  | { type: "view"; view: View }
  | { type: "tier"; level: TierLevel }
  | { type: "hideSpoilers"; value: boolean }
  | { type: "reveal"; id: string }
  | { type: "filters"; filters: Partial<Filters> }
  | { type: "clearFilters" }
  | { type: "select"; id: string | null; pathIndex?: number | null }
  | { type: "panel"; panel: State["panel"] }
  | { type: "hydrate"; viewed: string[]; hideSpoilers: boolean };

const emptyFilters: Filters = { clusters: [], eras: [], canon: [], spoilers: [] };

const initial: State = {
  view: "timeline",
  tierLevel: 0,
  hideSpoilers: true,
  revealed: [],
  filters: emptyFilters,
  selectedId: null,
  viewed: [],
  panel: null,
  pathIndex: null,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "view":
      return { ...s, view: a.view };
    case "tier":
      return { ...s, tierLevel: a.level };
    case "hideSpoilers":
      return { ...s, hideSpoilers: a.value, revealed: a.value ? [] : s.revealed };
    case "reveal":
      return s.revealed.includes(a.id) ? s : { ...s, revealed: [...s.revealed, a.id] };
    case "filters":
      return { ...s, filters: { ...s.filters, ...a.filters } };
    case "clearFilters":
      return { ...s, filters: emptyFilters };
    case "select": {
      const viewed = a.id && !s.viewed.includes(a.id) ? [...s.viewed, a.id] : s.viewed;
      return { ...s, selectedId: a.id, viewed, pathIndex: a.pathIndex === undefined ? (a.id ? s.pathIndex : null) : a.pathIndex };
    }
    case "panel":
      return { ...s, panel: a.panel };
    case "hydrate":
      return { ...s, viewed: a.viewed, hideSpoilers: a.hideSpoilers };
  }
}

const VIEWED_KEY = "ncl.viewed.v1";
const SPOILER_KEY = "ncl.hideSpoilers.v1";

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Load per-viewer conveniences. Storage can be unavailable, so everything is guarded.
  useEffect(() => {
    try {
      const viewed = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
      const hs = localStorage.getItem(SPOILER_KEY);
      dispatch({ type: "hydrate", viewed: Array.isArray(viewed) ? viewed.filter((id) => eventById[id]) : [], hideSpoilers: hs === null ? true : hs === "1" });
    } catch {
      /* storage blocked: defaults are fine */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(VIEWED_KEY, JSON.stringify(state.viewed));
    } catch {}
  }, [state.viewed]);
  useEffect(() => {
    try {
      localStorage.setItem(SPOILER_KEY, state.hideSpoilers ? "1" : "0");
    } catch {}
  }, [state.hideSpoilers]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

const TIER_RANK: Record<Tier, number> = { landmark: 0, major: 1, minor: 2 };

export function tierAllowed(t: Tier, level: TierLevel) {
  return TIER_RANK[t] <= level;
}

/** Events that pass the filters (ignoring tier, which views apply themselves). */
export function useFilteredEvents(): LoreEvent[] {
  const { state } = useStore();
  const f = state.filters;
  return useMemo(
    () =>
      events.filter(
        (e) =>
          (!f.clusters.length || f.clusters.includes(e.cluster)) &&
          (!f.eras.length || f.eras.includes(e.era)) &&
          (!f.canon.length || f.canon.includes(e.canonSource)) &&
          (!f.spoilers.length || f.spoilers.includes(e.spoilerLevel)),
      ),
    [f],
  );
}

/** Filtered events that also pass the current tier level. */
export function useVisibleEvents(level?: TierLevel): LoreEvent[] {
  const { state } = useStore();
  const filtered = useFilteredEvents();
  const lv = level ?? state.tierLevel;
  return useMemo(() => filtered.filter((e) => tierAllowed(e.tier, lv)), [filtered, lv]);
}

export function useIsHidden() {
  const { state } = useStore();
  return useCallback((e: LoreEvent) => state.hideSpoilers && e.spoilerLevel === "game-spoiler" && !state.revealed.includes(e.id), [state.hideSpoilers, state.revealed]);
}

export function activeFilterCount(f: Filters) {
  return f.clusters.length + f.eras.length + f.canon.length + f.spoilers.length;
}

export function usePrefersReducedMotion() {
  const get = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    m?.addEventListener?.("change", force);
    return () => m?.removeEventListener?.("change", force);
  }, []);
  return !!get();
}
