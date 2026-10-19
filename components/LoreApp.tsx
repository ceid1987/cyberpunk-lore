"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { clusterById, eventById } from "@/data";
import { StoreProvider, useStore, usePanelInset, usePrefersReducedMotion, type View } from "@/lib/store";
import TopBar from "./TopBar";
import TimelineView, { type TimelineHandle } from "./TimelineView";
import GraphView, { type GraphHandle } from "./GraphView";
import MuseumView, { museumLayout } from "./MuseumView";
import EventSheet from "./EventSheet";
import Panels from "./Panels";
import { Tools, useFullscreenSync } from "./Tools";
import { Icon } from "./ui";

export default function LoreApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

const MORPH_MAX = 120; // above this many moving nodes, fall back to a crossfade
const MORPH_MS = 0.7;
const TABS: { v: View; label: string; icon: "timeline" | "museum" | "graph" }[] = [
  { v: "timeline", label: "Timeline", icon: "timeline" },
  { v: "museum", label: "Museum", icon: "museum" },
  { v: "graph", label: "Map", icon: "graph" },
];

function Shell() {
  const { state, dispatch } = useStore();
  const reduced = usePrefersReducedMotion();
  const inset = usePanelInset();
  useFullscreenSync();
  const timelineRef = useRef<TimelineHandle>(null);
  const graphRef = useRef<GraphHandle>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [main, setMain] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMain({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setMain({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // All views stay mounted so switching is instant and the morph can read
  // positions from both. `shown` is what's visible; `state.view` is the target.
  const [shown, setShown] = useState<View>(state.view);
  const [phase, setPhase] = useState<"idle" | "morph" | "fade">("idle");

  const crossfade = (target: View) => {
    setPhase("fade");
    setShown(target);
    setTimeout(() => setPhase("idle"), 320);
  };

  const switchTo = (target: View) => {
    if (target === shown || phase !== "idle") return;
    dispatch({ type: "view", view: target });
    if (reduced) return setShown(target);
    // The node morph only makes sense between the full-screen timeline and map.
    if (target === "museum" || shown === "museum") return crossfade(target);

    const from = shown === "timeline" ? timelineRef.current?.positions() ?? {} : graphRef.current?.positions() ?? {};
    const ids = Object.keys(from).filter((id) => {
      const p = from[id];
      return p.x > -20 && p.x < window.innerWidth + 20 && p.y > -20 && p.y < window.innerHeight + 20;
    });
    const to = target === "timeline" ? null : graphRef.current?.positions(ids) ?? {};
    if (!ids.length || ids.length > MORPH_MAX) return crossfade(target);

    // Timeline target positions only exist once it's visible: show it invisibly first.
    setPhase("morph");
    setShown(target);
    requestAnimationFrame(() => {
      const dest = to ?? timelineRef.current?.positions() ?? {};
      const cv = overlayRef.current;
      if (!cv) return setPhase("idle");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fallback = { x: window.innerWidth / 2, y: target === "timeline" ? window.innerHeight + 40 : window.innerHeight / 2, r: 3 };
      const tracks = ids.map((id) => ({ id, a: from[id], b: dest[id] ?? fallback, color: clusterById[eventById[id].cluster].color }));
      animate(0, 1, {
        duration: MORPH_MS,
        ease: [0.65, 0, 0.35, 1],
        onUpdate: (p) => {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          for (const t of tracks) {
            const x = t.a.x + (t.b.x - t.a.x) * p;
            const y = t.a.y + (t.b.y - t.a.y) * p - Math.sin(p * Math.PI) * 30;
            const r = t.a.r + (t.b.r - t.a.r) * p;
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(2.5, r), 0, Math.PI * 2);
            ctx.fill();
          }
        },
        onComplete: () => {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          setPhase("idle");
        },
      });
    });
  };

  useEffect(() => {
    if (state.view !== shown && phase === "idle") setShown(state.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view]);

  // After a morph, fade the target in.
  const [revealT, setRevealT] = useState(1);
  useEffect(() => {
    if (phase === "morph") setRevealT(0);
    if (phase === "idle") {
      const id = requestAnimationFrame(() => setRevealT(1));
      return () => cancelAnimationFrame(id);
    }
  }, [phase]);

  const viewStyle = (on: boolean): React.CSSProperties => {
    if (phase === "morph") return { opacity: 0, transition: "none", pointerEvents: "none", visibility: on ? "visible" : "hidden" };
    if (on && phase === "idle") return { opacity: revealT, transition: "opacity 260ms ease", visibility: "visible" };
    return { opacity: on ? 1 : 0, transition: phase === "fade" ? "opacity 300ms ease" : "opacity 200ms ease", pointerEvents: on ? "auto" : "none", visibility: on ? "visible" : "hidden" };
  };

  const museum = shown === "museum";
  const mLayout = museumLayout(main.w, main.h, state.museumPanes);
  const mapOn = shown === "graph" || (museum && !!mLayout.map && state.museum.index >= 0);
  const mapBox: React.CSSProperties = museum && mLayout.map ? { left: mLayout.map.x, top: mLayout.map.y, width: mLayout.map.w, height: mLayout.map.h } : { inset: 0 };
  const topH = state.immersive ? "0px" : "calc(56px + env(safe-area-inset-top))";

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ ["--top-h" as string]: topH }}>
      {!state.immersive && <TopBar />}
      <main ref={mainRef} className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0" style={viewStyle(shown === "timeline")}>
          <TimelineView ref={timelineRef} hidden={shown !== "timeline"} />
        </div>
        <div className="absolute overflow-hidden" style={{ ...mapBox, ...viewStyle(mapOn) }}>
          <GraphView ref={graphRef} hidden={!mapOn} />
        </div>
        {museum && (
          <div className="pointer-events-none absolute inset-0" style={{ ...viewStyle(true), pointerEvents: "none" }}>
            <MuseumView layout={mLayout} width={main.w} />
          </div>
        )}

        {/* search, filters, fullscreen: same place in every view */}
        <div className="absolute right-2 z-30" style={{ bottom: inset.bottom ? inset.bottom + 12 : 84 }}>
          <Tools />
        </div>

        {/* view switch */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div role="tablist" aria-label="View" className="cp-btn pointer-events-auto flex gap-1 border border-line bg-bg p-1">
            {TABS.map(({ v, label, icon }) => {
              const on = state.view === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={on}
                  onClick={() => switchTo(v)}
                  className={`flex h-10 items-center gap-1.5 px-3 font-display text-[12.5px] font-bold uppercase tracking-wider transition-colors sm:gap-2 sm:px-4 sm:text-[13px] ${on ? "bg-yellow text-bg" : "text-ink-2 hover:text-ink"}`}
                >
                  <Icon name={icon} size={17} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </main>
      <canvas ref={overlayRef} className="pointer-events-none fixed inset-0 z-[45] h-screen w-screen" aria-hidden />
      {!museum && <EventSheet />}
      <Panels />
    </div>
  );
}
