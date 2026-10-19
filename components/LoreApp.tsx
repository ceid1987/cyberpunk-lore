"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { clusterById, eventById } from "@/data";
import { StoreProvider, useStore, usePrefersReducedMotion, type View } from "@/lib/store";
import TopBar from "./TopBar";
import TimelineView, { type TimelineHandle } from "./TimelineView";
import GraphView, { type GraphHandle } from "./GraphView";
import EventSheet from "./EventSheet";
import Panels from "./Panels";
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

function Shell() {
  const { state, dispatch } = useStore();
  const reduced = usePrefersReducedMotion();
  const timelineRef = useRef<TimelineHandle>(null);
  const graphRef = useRef<GraphHandle>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Both views stay mounted so switching is instant and the morph can read
  // positions from both. `shown` is what's visible; `state.view` is the target.
  const [shown, setShown] = useState<View>(state.view);
  const [phase, setPhase] = useState<"idle" | "morph" | "fade">("idle");

  const switchTo = (target: View) => {
    if (target === shown || phase !== "idle") return;
    dispatch({ type: "view", view: target });
    if (reduced) return setShown(target);

    const from = shown === "timeline" ? timelineRef.current?.positions() ?? {} : graphRef.current?.positions() ?? {};
    // Only animate nodes actually on screen in the source view.
    const ids = Object.keys(from).filter((id) => {
      const p = from[id];
      return p.x > -20 && p.x < window.innerWidth + 20 && p.y > -20 && p.y < window.innerHeight + 20;
    });
    const to = target === "timeline" ? null : graphRef.current?.positions(ids) ?? {};

    if (!ids.length || ids.length > MORPH_MAX) {
      setPhase("fade");
      setShown(target);
      setTimeout(() => setPhase("idle"), 320);
      return;
    }

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
            // slight arc so paths don't all overlap
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

  const viewStyle = (v: View): React.CSSProperties => {
    const on = shown === v;
    if (phase === "morph") return { opacity: on ? 0 : 0, transition: "none", pointerEvents: "none", visibility: on ? "visible" : "hidden" };
    return { opacity: on ? 1 : 0, transition: phase === "fade" ? "opacity 300ms ease" : "opacity 200ms ease", pointerEvents: on ? "auto" : "none", visibility: on ? "visible" : "hidden" };
  };

  // After a morph, fade the target in.
  const [revealT, setRevealT] = useState(1);
  useEffect(() => {
    if (phase === "morph") setRevealT(0);
    if (phase === "idle") {
      const id = requestAnimationFrame(() => setRevealT(1));
      return () => cancelAnimationFrame(id);
    }
  }, [phase]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <main className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0" style={{ ...viewStyle("timeline"), ...(shown === "timeline" && phase === "idle" ? { opacity: revealT, transition: "opacity 260ms ease" } : {}) }}>
          <TimelineView ref={timelineRef} hidden={shown !== "timeline"} />
        </div>
        <div className="absolute inset-0" style={{ ...viewStyle("graph"), ...(shown === "graph" && phase === "idle" ? { opacity: revealT, transition: "opacity 260ms ease" } : {}) }}>
          <GraphView ref={graphRef} hidden={shown !== "graph"} />
        </div>

        {/* view switch */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div role="tablist" aria-label="View" className="pointer-events-auto flex overflow-hidden rounded-full border border-line bg-bg/90 p-1 shadow-[0_6px_30px_rgba(0,0,0,0.6)] backdrop-blur-md">
            {(["timeline", "graph"] as View[]).map((v) => {
              const on = state.view === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={on}
                  onClick={() => switchTo(v)}
                  className={`flex h-11 items-center gap-2 rounded-full px-5 font-display text-sm font-bold uppercase tracking-wider transition-colors ${on ? "bg-yellow text-bg" : "text-ink-2"}`}
                >
                  <Icon name={v === "timeline" ? "timeline" : "graph"} size={18} />
                  {v === "timeline" ? "Timeline" : "Map"}
                </button>
              );
            })}
          </div>
        </div>
      </main>
      <canvas ref={overlayRef} className="pointer-events-none fixed inset-0 z-[45] h-screen w-screen" aria-hidden />
      <EventSheet />
      <Panels />
    </div>
  );
}
