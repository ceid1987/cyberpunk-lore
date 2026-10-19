"use client";

import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { eventById, type Event, type Relation } from "@/data";
import { PANEL_W, PEEK, useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion } from "@/lib/store";
import { ClusterBadge, Icon, SPOIL_NAME, TagRow } from "./ui";

// Event details. Never covers the whole screen and never dims what's behind it:
//  * desktop (>= 768px): a panel docked on the left
//  * mobile: a bottom sheet that peeks (lower ~44%) and can be pulled up to full
//  * museum: a plain pane laid out by the museum view (EventPane)
// The header (date, theme, close, title, tags) stays fixed; only the body scrolls.

const REL_LABEL: Record<Relation, string> = { caused: "Caused by", "led-to": "Led to", "part-of": "Part of", involves: "Connected" };
const REL_ORDER: Relation[] = ["caused", "part-of", "led-to", "involves"];
const FULL = 0.9;
const PAD = "px-5"; // one horizontal padding for every section of the card

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

function inverse(r: Relation): Relation {
  return r === "caused" ? "led-to" : r === "led-to" ? "caused" : "involves";
}

/** Header + scrollable body for one event. Shared by the overlay and the museum pane. */
function EventContent({ e, onClose, museum, onTouchStart, onTouchEnd }: { e: Event; onClose?: () => void; museum?: boolean; onTouchStart?: (ev: React.TouchEvent) => void; onTouchEnd?: (ev: React.TouchEvent) => void }) {
  const { state, dispatch } = useStore();
  const isHidden = useIsHidden();
  const gate = isHidden(e);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body on purpose: newer Chrome returns a Promise from scrollTo, which React would take as a cleanup.
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [e.id]);

  const relatedGroups = useMemo(() => {
    const incoming = Object.values(eventById).flatMap((o) => o.related.filter((r) => r.id === e.id).map((r) => ({ id: o.id, relation: inverse(r.relation) })));
    const all = [...e.related, ...incoming].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
    return REL_ORDER.map((rel) => ({ rel, items: all.filter((r) => r.relation === rel).map((r) => eventById[r.id]).filter(Boolean).sort((a, b) => a.sortYear - b.sortYear) })).filter((g) => g.items.length);
  }, [e]);

  return (
    <>
      <header className={`shrink-0 border-b border-line/70 ${PAD} pb-3 pt-3`}>
        <div className="flex h-9 items-center gap-3">
          <span className="min-w-0 flex-1 truncate font-display text-[12px] uppercase leading-none tracking-[0.14em] text-ink-2">{e.inWorldDate}</span>
          <ClusterBadge id={e.cluster} />
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="cp-btn -mr-1 grid h-9 w-9 shrink-0 place-items-center border border-line text-ink-2 hover:border-ink-3 hover:text-ink">
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <h2 id="sheet-title" className={`mt-1.5 font-display text-[21px] font-bold leading-[1.15] text-ink ${gate ? "spoiler-blur" : ""}`}>
          {gate ? "Hidden spoiler event" : e.title}
        </h2>
        <div className="mt-2.5">
          <TagRow e={e} hidden={gate} />
        </div>
      </header>

      <div ref={bodyRef} className={`cp-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain ${PAD} py-4`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {gate ? (
          <div className="border border-magenta/50 bg-magenta/5 p-4 text-center">
            <p className="text-sm text-ink-2">This event spoils the story of {e.spoils ? SPOIL_NAME[e.spoils] : "a game"}.</p>
            <button type="button" onClick={() => dispatch({ type: "reveal", id: e.id })} className="cp-btn mt-3 h-10 border border-magenta px-4 font-display text-sm uppercase tracking-wider text-magenta" style={{ ["--b" as string]: "#ff2a6d" }}>
              Reveal
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {state.showImages && e.image && (
              <figure key={e.id} className="border border-line bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.image.thumb}
                  alt={`Illustration for ${e.title}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="mx-auto block max-h-[300px] w-auto max-w-full object-contain"
                  onError={(ev) => {
                    const fig = ev.currentTarget.closest("figure");
                    if (fig) fig.style.display = "none";
                  }}
                />
                <figcaption className="border-t border-line bg-panel px-2.5 py-1.5 text-[11px] text-ink-3">
                  Image:{" "}
                  <a href={e.image.page} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-2">
                    Cyberpunk Wiki
                  </a>{" "}
                  · © its respective owners
                </figcaption>
              </figure>
            )}

            <p className="text-[15.5px] leading-relaxed text-ink">
              {e.summary} <span className="text-ink-2">{e.whyItMatters}</span>
            </p>

            {relatedGroups.length > 0 && (
              <section>
                <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink-3">Related events</h3>
                {relatedGroups.map((g) => (
                  <div key={g.rel} className="mt-3">
                    <div className="mb-1.5 text-xs text-ink-3">{REL_LABEL[g.rel]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={museum}
                          onClick={() => dispatch({ type: "select", id: r.id })}
                          className="cp-tag min-h-8 border border-line px-2.5 py-1.5 text-left text-[13px] leading-tight text-ink enabled:hover:border-ink-3 disabled:cursor-default"
                        >
                          <span className="mr-1.5 font-display text-[11px] text-ink-3">{Math.floor(r.sortYear)}</span>
                          {isHidden(r) ? "Hidden spoiler" : r.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        <a
          href={e.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cp-btn mt-5 flex h-10 items-center justify-center gap-2 border border-line font-display text-[13px] uppercase tracking-wider text-cyan hover:border-cyan"
        >
          Read on the Cyberpunk Wiki <Icon name="external" size={15} />
        </a>
      </div>
    </>
  );
}

/** Museum pane: just the content, laid out by MuseumView. */
export function EventPane() {
  const { state } = useStore();
  const e = state.selectedId ? eventById[state.selectedId] : null;
  if (!e)
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <div className="font-display text-sm uppercase tracking-[0.3em] text-yellow">Museum</div>
          <p className="mt-2 text-[15px] text-ink-2">Every event from 1859 to 2095, one at a time.</p>
          <p className="mt-1 text-[13px] text-ink-3">Press the yellow arrow to begin.</p>
        </div>
      </div>
    );
  return (
    <div className="flex h-full flex-col">
      <EventContent e={e} museum />
    </div>
  );
}

export default function EventSheet() {
  const { state, dispatch } = useStore();
  const e = state.selectedId ? eventById[state.selectedId] : null;
  const reduced = usePrefersReducedMotion();
  const visible = useFilteredEvents();
  const vp = useViewport();
  const desktop = vp.w >= 768;

  const pos = e ? visible.findIndex((v) => v.id === e.id) : -1;
  const prev = pos > 0 ? visible[pos - 1] : null;
  const next = pos >= 0 && pos < visible.length - 1 ? visible[pos + 1] : null;
  const step = (dir: 1 | -1) => {
    const t = dir === 1 ? next : prev;
    if (t) dispatch({ type: "select", id: t.id });
  };
  const close = () => dispatch({ type: "select", id: null });

  useEffect(() => {
    if (!e) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT" || state.panel) return; // an open panel gets the keys
      if (ev.key === "Escape") close();
      if (ev.key === "ArrowRight") step(1);
      if (ev.key === "ArrowLeft") step(-1);
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

  const footer = e && (
    <div className="flex items-center gap-2 border-t border-line bg-bg-2 px-3 py-2" style={{ paddingBottom: desktop ? undefined : "max(0.5rem, env(safe-area-inset-bottom))" }}>
      <NavBtn label="Previous event" disabled={!prev} onClick={() => step(-1)} dir="L" />
      <span className="min-w-0 flex-1 truncate text-center font-display text-[11px] uppercase tracking-wider text-ink-3">{e.inWorldDate}</span>
      <NavBtn label="Next event" disabled={!next} onClick={() => step(1)} dir="R" />
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
            className="fixed bottom-0 left-0 z-40 flex flex-col overflow-hidden border-r border-line bg-bg-2"
            style={{ top: "var(--top-h, 56px)", width: PANEL_W }}
            initial={reduced ? { opacity: 0 } : { x: -PANEL_W }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: -PANEL_W }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
          >
            <div className="h-[2px] shrink-0 bg-yellow" />
            <EventContent e={e} onClose={close} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} />
            <div className="shrink-0">{footer}</div>
          </motion.aside>
        ) : (
          <motion.aside
            key="sheet"
            role="complementary"
            aria-labelledby="sheet-title"
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t-2 border-yellow bg-bg-2"
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
              className="flex shrink-0 cursor-grab touch-none justify-center pt-2"
            >
              <span className="h-1.5 w-12 bg-line" aria-hidden />
            </button>
            <EventContent e={e} onClose={close} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} />
            <motion.div className="relative z-10 shrink-0" style={{ y: footerY }}>
              {footer}
            </motion.div>
          </motion.aside>
        ))}
    </AnimatePresence>
  );
}

function NavBtn({ label, disabled, onClick, dir }: { label: string; disabled: boolean; onClick: () => void; dir: "L" | "R" }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="cp-btn grid h-10 w-12 place-items-center border border-line text-ink disabled:opacity-30">
      <Icon name={dir === "L" ? "chevronL" : "chevronR"} />
    </button>
  );
}
