"use client";

import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { eventById, startHere, type Event, type Relation } from "@/data";
import { PANEL_W, PEEK, useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion } from "@/lib/store";
import { ClusterBadge, Icon, TagRow } from "./ui";

// Event details. Never covers the whole screen and never dims what's behind it:
//  * desktop (>= 768px): a panel docked on the left
//  * mobile: a bottom sheet that peeks (lower ~44%) and can be pulled up to full
// The header (date, title, theme, tags, close) stays fixed; only the body scrolls.

const REL_LABEL: Record<Relation, string> = { caused: "Caused by", "led-to": "Led to", "part-of": "Part of", involves: "Connected" };
const REL_ORDER: Relation[] = ["caused", "part-of", "led-to", "involves"];
const FULL = 0.9;

function useViewport() {
  const [v, setV] = useState({ w: 1024, h: 800 });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export default function EventSheet() {
  const { state, dispatch } = useStore();
  const e = state.selectedId ? eventById[state.selectedId] : null;
  const reduced = usePrefersReducedMotion();
  const visible = useFilteredEvents();
  const isHidden = useIsHidden();
  const vp = useViewport();
  const desktop = vp.w >= 768;

  const pos = e ? visible.findIndex((v) => v.id === e.id) : -1;
  const prev = pos > 0 ? visible[pos - 1] : null;
  const next = pos >= 0 && pos < visible.length - 1 ? visible[pos + 1] : null;
  const inPath = state.pathIndex !== null;
  const inMuseum = state.museum.active;

  const step = (dir: 1 | -1) => {
    if (inMuseum) return dispatch({ type: "museum", active: true, index: Math.max(0, Math.min(visible.length - 1, state.museum.index + dir)) });
    if (inPath) {
      const i = state.pathIndex! + dir;
      if (i >= 0 && i < startHere.length) dispatch({ type: "select", id: startHere[i].id, pathIndex: i });
      return;
    }
    const t = dir === 1 ? next : prev;
    if (t) dispatch({ type: "select", id: t.id });
  };
  const canPrev = inMuseum ? state.museum.index > 0 : inPath ? state.pathIndex! > 0 : !!prev;
  const canNext = inMuseum ? state.museum.index < visible.length - 1 : inPath ? state.pathIndex! < startHere.length - 1 : !!next;
  const close = () => dispatch({ type: "select", id: null });

  useEffect(() => {
    if (!e) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT") return;
      if (ev.key === "Escape") close();
      if (ev.key === "ArrowRight" && !inMuseum) step(1);
      if (ev.key === "ArrowLeft" && !inMuseum) step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Mobile sheet position: 0 = full, peekY = peeking.
  const fullH = Math.round(vp.h * FULL);
  const peekY = fullH - Math.round(vp.h * PEEK);
  const y = useMotionValue(fullH);
  const [expanded, setExpanded] = useState(false);
  const controls = useDragControls();
  // Keep the mobile footer (prev / next) on screen while the sheet only peeks.
  const footerY = useTransform(y, (v) => -Math.max(0, Math.min(v, peekY)));
  const isOpen = !!e;
  useEffect(() => {
    if (desktop || !isOpen) return;
    animate(y, expanded ? 0 : peekY, reduced ? { duration: 0 } : { type: "spring", damping: 34, stiffness: 340 });
  }, [expanded, peekY, desktop, reduced, y, isOpen]);
  useEffect(() => {
    if (!isOpen) {
      setExpanded(false);
      y.set(fullH);
    }
  }, [isOpen, fullH, y]);

  // Horizontal swipe on the body = previous / next.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => (touch.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() });
  const onTouchEnd = (ev: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(t.clientY - s.y) < 50 && Date.now() - s.t < 600) step(dx < 0 ? 1 : -1);
  };

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: newer Chrome returns a Promise from scrollTo, which React would treat as a cleanup.
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [e?.id]);

  const spoilerGate = e ? isHidden(e) : false;

  const relatedGroups = useMemo(() => {
    if (!e) return [];
    const incoming = Object.values(eventById).flatMap((o) => o.related.filter((r) => r.id === e.id).map((r) => ({ id: o.id, relation: inverse(r.relation) })));
    const all = [...e.related, ...incoming].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
    return REL_ORDER.map((rel) => ({ rel, items: all.filter((r) => r.relation === rel).map((r) => eventById[r.id]).filter(Boolean).sort((a, b) => a.sortYear - b.sortYear) })).filter((g) => g.items.length);
  }, [e]);

  const header = e && (
    <div className="shrink-0 border-b border-line/70 px-5 pb-3">
      <div className="flex items-start gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="font-display text-[12px] uppercase tracking-[0.14em] text-ink-2">{e.inWorldDate}</span>
          </div>
          <h2 id="sheet-title" className={`mt-1 font-display text-[21px] font-bold leading-[1.12] text-ink ${spoilerGate ? "spoiler-blur" : ""}`}>
            {spoilerGate ? "Hidden spoiler event" : e.title}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button type="button" onClick={close} aria-label="Close" className="cp-btn -mr-1 grid h-9 w-9 place-items-center border border-line text-ink-2 hover:border-ink-3 hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <TagRow e={e} hidden={spoilerGate} />
        <div className="shrink-0 pt-1">
          <ClusterBadge id={e.cluster} />
        </div>
      </div>
    </div>
  );

  const body = e && (
    <div ref={bodyRef} className="cp-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {inPath && !inMuseum && (
        <div className="mt-3 flex items-center gap-2 border border-yellow/40 bg-yellow/5 px-3 py-2 text-[13px] text-ink-2">
          <Icon name="flag" size={15} />
          <span className="font-display text-xs uppercase tracking-wider text-yellow">
            Start here {state.pathIndex! + 1}/{startHere.length}
          </span>
          <span className="line-clamp-1 flex-1">{startHere[state.pathIndex!]?.note}</span>
        </div>
      )}
      {spoilerGate ? (
        <div className="mt-5 border border-magenta/50 bg-magenta/5 p-4 text-center">
          <p className="text-sm text-ink-2">This event spoils the story of Cyberpunk 2077 or Phantom Liberty.</p>
          <button type="button" onClick={() => dispatch({ type: "reveal", id: e.id })} className="cp-btn mt-3 h-10 border border-magenta px-4 font-display text-sm uppercase tracking-wider text-magenta">
            Reveal
          </button>
        </div>
      ) : (
        <>
          {state.showImages && e.image && (
            <figure className="mt-4 border border-line bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.image.thumb}
                alt={`Illustration for ${e.title}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mx-auto block max-h-[300px] w-auto max-w-full object-contain"
                onError={(ev) => ((ev.currentTarget.parentElement as HTMLElement).style.display = "none")}
              />
              <figcaption className="border-t border-line bg-panel px-2 py-1 text-[11px] text-ink-3">
                Image:{" "}
                <a href={e.image.page} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-2">
                  Cyberpunk Wiki
                </a>{" "}
                · © its respective owners
              </figcaption>
            </figure>
          )}

          <p className="mt-4 text-[15.5px] leading-relaxed text-ink">
            {e.summary} <span className="text-ink-2">{e.whyItMatters}</span>
          </p>

          {relatedGroups.length > 0 && (
            <div className="mt-5">
              <div className="font-display text-[11px] uppercase tracking-[0.18em] text-ink-3">Related events</div>
              {relatedGroups.map((g) => (
                <div key={g.rel} className="mt-2">
                  <div className="mb-1 text-xs text-ink-3">{REL_LABEL[g.rel]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((r) => (
                      <RelatedChip key={r.id} r={r} hidden={isHidden(r)} onClick={() => (inMuseum ? null : dispatch({ type: "select", id: r.id, pathIndex: null }))} disabled={inMuseum} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <a
        href={e.wikiUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="cp-btn mt-6 flex h-10 items-center justify-center gap-2 border border-line font-display text-[13px] uppercase tracking-wider text-cyan hover:border-cyan"
      >
        Read on the Cyberpunk Wiki <Icon name="external" size={15} />
      </a>
    </div>
  );

  const footer = e && (
    <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2" style={{ paddingBottom: desktop ? undefined : "max(0.5rem, env(safe-area-inset-bottom))" }}>
      <NavBtn label="Previous event" disabled={!canPrev} onClick={() => step(-1)} dir="L" />
      <span className="flex-1 text-center font-display text-[11px] uppercase tracking-wider text-ink-3">
        {inMuseum ? `${state.museum.index + 1} / ${visible.length}` : inPath ? (
          <button type="button" onClick={() => dispatch({ type: "select", id: e.id, pathIndex: null })} className="uppercase hover:text-ink-2">
            Leave path
          </button>
        ) : (
          e.inWorldDate
        )}
      </span>
      <NavBtn label="Next event" disabled={!canNext} onClick={() => step(1)} dir="R" />
    </div>
  );

  return (
    <AnimatePresence>
      {e &&
        (desktop ? (
          <motion.aside
            key="panel"
            role="complementary"
            aria-labelledby="sheet-title"
            className="fixed bottom-0 left-0 z-40 flex flex-col border-r border-line bg-bg-2/97 shadow-[12px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
            style={{ top: "calc(56px + env(safe-area-inset-top))", width: PANEL_W }}
            initial={reduced ? { opacity: 0 } : { x: -PANEL_W }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: -PANEL_W }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
          >
            <div className="h-[2px] shrink-0 bg-yellow" />
            <div className="pt-3" />
            {header}
            {body}
            {footer}
          </motion.aside>
        ) : (
          <motion.aside
            key="sheet"
            role="complementary"
            aria-labelledby="sheet-title"
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t-2 border-yellow bg-bg-2/97 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
            style={{ height: fullH, y }}
            exit={reduced ? { opacity: 0 } : { y: fullH, transition: { duration: 0.25 } }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: fullH }}
            dragElastic={0.05}
            onDragEnd={(_, info) => {
              const cur = y.get();
              if (info.velocity.y > 700 || cur > peekY + 90) return close();
              const toFull = info.velocity.y < -300 || cur < peekY / 2;
              setExpanded(toFull);
              animate(y, toFull ? 0 : peekY, { type: "spring", damping: 34, stiffness: 340 });
            }}
          >
            <button
              type="button"
              aria-label={expanded ? "Collapse details" : "Expand details"}
              onClick={() => setExpanded((x) => !x)}
              onPointerDown={(ev) => controls.start(ev)}
              className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2"
            >
              <span className="h-1.5 w-12 bg-line" aria-hidden />
            </button>
            {header}
            {body}
            <motion.div className="relative z-10 shrink-0 bg-bg-2" style={{ y: footerY }}>
              {footer}
            </motion.div>
          </motion.aside>
        ))}
    </AnimatePresence>
  );
}

function RelatedChip({ r, hidden, onClick, disabled }: { r: Event; hidden: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cp-tag min-h-8 border border-line px-2.5 py-1.5 text-left text-[13px] leading-tight text-ink enabled:hover:border-ink-3 disabled:cursor-default"
    >
      <span className="mr-1.5 font-display text-[11px] text-ink-3">{Math.floor(r.sortYear)}</span>
      {hidden ? "Hidden spoiler" : r.title}
    </button>
  );
}

function NavBtn({ label, disabled, onClick, dir }: { label: string; disabled: boolean; onClick: () => void; dir: "L" | "R" }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="cp-btn grid h-10 w-12 place-items-center border border-line text-ink disabled:opacity-30">
      <Icon name={dir === "L" ? "chevronL" : "chevronR"} />
    </button>
  );
}

function inverse(r: Relation): Relation {
  return r === "caused" ? "led-to" : r === "led-to" ? "caused" : "involves";
}
