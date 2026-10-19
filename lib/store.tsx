"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { events, eventById, type ClusterId, type EraId, type Event, type Media, type SpoilerLevel, type Tier } from "@/data";

export type View = "timeline" | "graph";
/** 0 = landmarks, 1 = + major, 2 = + minor. Driven by zoom, not by a switch. */
export type TierLevel = 0 | 1 | 2;

export interface Filters {
  clusters: ClusterId[];
  eras: EraId[];
  media: Media[];
  spoilers: SpoilerLevel[];
}

export interface State {
  view: View;
  hideSpoilers: boolean;
  showImages: boolean;
  revealed: string[]; // spoiler cards the user tapped open
  filters: Filters;
  selectedId: string | null;
  viewed: string[];
  panel: null | "search" | "filters" | "start" | "about";
  pathIndex: number | null; // position in Start Here path while following it
  /** Museum mode on the map: index into the chronological event list (-1 = not started). */
  museum: { active: boolean; index: number };
}

type Action =
  | { type: "view"; view: View }
  | { type: "hideSpoilers"; value: boolean }
  | { type: "showImages"; value: boolean }
  | { type: "reveal"; id: string }
  | { type: "filters"; filters: Partial<Filters> }
  | { type: "clearFilters" }
  | { type: "select"; id: string | null; pathIndex?: number | null }
  | { type: "panel"; panel: State["panel"] }
  | { type: "museum"; active: boolean; index?: number }
  | { type: "hydrate"; viewed: string[]; hideSpoilers: boolean; showImages: boolean };

const emptyFilters: Filters = { clusters: [], eras: [], media: [], spoilers: [] };

const initial: State = {
  view: "timeline",
  hideSpoilers: true,
  showImages: true,
  revealed: [],
  filters: emptyFilters,
  selectedId: null,
  viewed: [],
  panel: null,
  pathIndex: null,
  museum: { active: false, index: -1 },
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "view":
      return { ...s, view: a.view };
    case "showImages":
      return { ...s, showImages: a.value };
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
    case "museum":
      return { ...s, museum: { active: a.active, index: a.index ?? (a.active ? s.museum.index : -1) }, ...(a.active ? { pathIndex: null } : {}) };
    case "hydrate":
      return { ...s, viewed: a.viewed, hideSpoilers: a.hideSpoilers, showImages: a.showImages };
  }
}

const VIEWED_KEY = "ncl.viewed.v1";
const SPOILER_KEY = "ncl.hideSpoilers.v1";
const IMAGES_KEY = "ncl.showImages.v1";

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Load per-viewer conveniences. Storage can be unavailable, so everything is guarded.
  useEffect(() => {
    try {
      const viewed = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
      const hs = localStorage.getItem(SPOILER_KEY);
      const im = localStorage.getItem(IMAGES_KEY);
      dispatch({ type: "hydrate", viewed: Array.isArray(viewed) ? viewed.filter((id) => eventById[id]) : [], hideSpoilers: hs === null ? true : hs === "1", showImages: im === null ? true : im === "1" });
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
  useEffect(() => {
    try {
      localStorage.setItem(IMAGES_KEY, state.showImages ? "1" : "0");
    } catch {}
  }, [state.showImages]);

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
export function useFilteredEvents(): Event[] {
  const { state } = useStore();
  const f = state.filters;
  return useMemo(
    () =>
      events.filter(
        (e) =>
          (!f.clusters.length || f.clusters.includes(e.cluster)) &&
          (!f.eras.length || f.eras.includes(e.era)) &&
          (!f.media.length || f.media.some((m) => e.media.includes(m))) &&
          (!f.spoilers.length || f.spoilers.includes(e.spoilerLevel === "edgerunners-safe" ? "world" : e.spoilerLevel)),
      ),
    [f],
  );
}

export function useIsHidden() {
  const { state } = useStore();
  return useCallback((e: Event) => state.hideSpoilers && e.spoilerLevel === "game-spoiler" && !state.revealed.includes(e.id), [state.hideSpoilers, state.revealed]);
}

export function activeFilterCount(f: Filters) {
  return f.clusters.length + f.eras.length + f.media.length + f.spoilers.length;
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

/** Geometry of the event panel, so views can keep the focused item in the visible area. */
export function usePanelInset() {
  const { state } = useStore();
  const [vw, setVw] = useState({ w: 1024, h: 800 });
  useEffect(() => {
    const on = () => setVw({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const open = !!state.selectedId;
  const desktop = vw.w >= 768;
  return { desktop, left: open && desktop ? PANEL_W : 0, bottom: open && !desktop ? Math.round(vw.h * PEEK) : 0 };
}
export const PANEL_W = 400;
/** Mobile sheet: share of the screen height when peeking. */
export const PEEK = 0.44;
