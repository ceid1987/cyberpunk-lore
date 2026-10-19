"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { events, eventById, type ClusterId, type EraId, type Event, type Media, type Tier } from "@/data";

export type View = "timeline" | "museum" | "graph";
export type SpoilerMedia = "edgerunners" | "2077" | "phantom-liberty";
export type MuseumPane = "card" | "timeline" | "map";
/** 0 = landmarks, 1 = + major, 2 = + minor. Driven by zoom, not by a switch. */
export type TierLevel = 0 | 1 | 2;

export interface Filters {
  clusters: ClusterId[];
  eras: EraId[];
  media: Media[];
}

export interface State {
  view: View;
  /** Stories the viewer hasn't seen yet: events that spoil them are blurred until tapped. */
  spoilerFree: SpoilerMedia[];
  /** Fullscreen: the top bar is hidden. */
  immersive: boolean;
  showImages: boolean;
  revealed: string[]; // spoiler cards the user tapped open
  filters: Filters;
  selectedId: string | null;
  viewed: string[];
  panel: null | "search" | "filters" | "start" | "about";
  pathIndex: number | null; // position in Start Here path while following it
  /** Museum: index into the chronological event list (-1 = not started). `active` mirrors view === "museum". */
  museum: { active: boolean; index: number };
  museumPanes: Record<MuseumPane, boolean>;
}

type Action =
  | { type: "view"; view: View }
  | { type: "spoilerFree"; value: SpoilerMedia[] }
  | { type: "immersive"; value: boolean }
  | { type: "museumPane"; pane: MuseumPane }
  | { type: "showImages"; value: boolean }
  | { type: "reveal"; id: string }
  | { type: "filters"; filters: Partial<Filters> }
  | { type: "clearFilters" }
  | { type: "select"; id: string | null; pathIndex?: number | null }
  | { type: "panel"; panel: State["panel"] }
  | { type: "museum"; index: number }
  | { type: "hydrate"; viewed: string[]; spoilerFree: SpoilerMedia[]; showImages: boolean };

const emptyFilters: Filters = { clusters: [], eras: [], media: [] };
export const DEFAULT_SPOILER_FREE: SpoilerMedia[] = ["2077", "phantom-liberty"];

const initial: State = {
  view: "timeline",
  spoilerFree: DEFAULT_SPOILER_FREE,
  immersive: false,
  showImages: true,
  revealed: [],
  filters: emptyFilters,
  selectedId: null,
  viewed: [],
  panel: null,
  pathIndex: null,
  museum: { active: false, index: -1 },
  museumPanes: { card: true, timeline: true, map: true },
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "view":
      return { ...s, view: a.view, museum: { ...s.museum, active: a.view === "museum" }, pathIndex: null, selectedId: a.view === "museum" || s.view === "museum" ? null : s.selectedId };
    case "showImages":
      return { ...s, showImages: a.value };
    case "spoilerFree":
      return { ...s, spoilerFree: a.value, revealed: [] };
    case "immersive":
      return { ...s, immersive: a.value };
    case "museumPane": {
      const next = { ...s.museumPanes, [a.pane]: !s.museumPanes[a.pane] };
      return Object.values(next).some(Boolean) ? { ...s, museumPanes: next } : s; // keep at least one pane
    }
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
      return { ...s, museum: { ...s.museum, index: a.index } };
    case "hydrate":
      return { ...s, viewed: a.viewed, spoilerFree: a.spoilerFree, showImages: a.showImages };
  }
}

const VIEWED_KEY = "ncl.viewed.v1";
const SPOILER_KEY = "ncl.spoilerFree.v1";
const IMAGES_KEY = "ncl.showImages.v1";

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Load per-viewer conveniences. Storage can be unavailable, so everything is guarded.
  useEffect(() => {
    try {
      const viewed = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? "[]");
      const sf = JSON.parse(localStorage.getItem(SPOILER_KEY) ?? "null");
      const im = localStorage.getItem(IMAGES_KEY);
      const okSf = Array.isArray(sf) ? sf.filter((m) => m === "edgerunners" || m === "2077" || m === "phantom-liberty") : DEFAULT_SPOILER_FREE;
      dispatch({ type: "hydrate", viewed: Array.isArray(viewed) ? viewed.filter((id) => eventById[id]) : [], spoilerFree: okSf, showImages: im === null ? true : im === "1" });
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
      localStorage.setItem(SPOILER_KEY, JSON.stringify(state.spoilerFree));
    } catch {}
  }, [state.spoilerFree]);
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
          (!f.media.length || f.media.some((m) => e.media.includes(m))),
      ),
    [f],
  );
}

export function useIsHidden() {
  const { state } = useStore();
  return useCallback((e: Event) => !!e.spoils && state.spoilerFree.includes(e.spoils as SpoilerMedia) && !state.revealed.includes(e.id), [state.spoilerFree, state.revealed]);
}

export function activeFilterCount(f: Filters) {
  return f.clusters.length + f.eras.length + f.media.length;
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
  // The museum lays its panes side by side, so nothing overlaps the views there.
  const open = !!state.selectedId && state.view !== "museum";
  const desktop = vw.w >= 768;
  return { desktop, left: open && desktop ? PANEL_W : 0, bottom: open && !desktop ? Math.round(vw.h * PEEK) : 0 };
}
export const PANEL_W = 400;
/** Mobile sheet: share of the screen height when peeking. */
export const PEEK = 0.44;
