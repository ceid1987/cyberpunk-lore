"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { clusterById, eventById, startHere, type Event, type Relation } from "@/data";
import { useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion } from "@/lib/store";
import { Icon, TagRow } from "./ui";

const REL_LABEL: Record<Relation, string> = { caused: "Caused by", "led-to": "Led to", "part-of": "Part of", involves: "Involves" };
const REL_ORDER: Relation[] = ["caused", "part-of", "led-to", "involves"];

export default function EventSheet() {
  const { state, dispatch } = useStore();
  const e = state.selectedId ? eventById[state.selectedId] : null;
  const reduced = usePrefersReducedMotion();
  const controls = useDragControls();
  const visible = useFilteredEvents();
  const isHidden = useIsHidden();

  // Navigation order: the events currently on screen, chronologically. Fall back to all
  // filtered events if the open event is hidden by the current tier.
  const order = useMemo(() => (e && visible.some((v) => v.id === e.id) ? visible : visible.concat(e ? [e] : []).sort((a, b) => a.sortYear - b.sortYear)), [visible, e]);
  const pos = e ? order.findIndex((v) => v.id === e.id) : -1;
  const prev = pos > 0 ? order[pos - 1] : null;
  const next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;

  const inPath = state.pathIndex !== null;
  const pathPrev = inPath && state.pathIndex! > 0 ? startHere[state.pathIndex! - 1] : null;
  const pathNext = inPath && state.pathIndex! < startHere.length - 1 ? startHere[state.pathIndex! + 1] : null;

  const go = (target: Event | null) => target && dispatch({ type: "select", id: target.id });
  const close = () => dispatch({ type: "select", id: null });

  useEffect(() => {
    if (!e) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
      if (ev.key === "ArrowRight") inPath && pathNext ? dispatch({ type: "select", id: pathNext.id, pathIndex: state.pathIndex! + 1 }) : go(next);
      if (ev.key === "ArrowLeft") inPath && pathPrev ? dispatch({ type: "select", id: pathPrev.id, pathIndex: state.pathIndex! - 1 }) : go(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Horizontal swipe on the content = previous / next.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (ev: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - s.t < 600) {
      if (inPath) {
        if (dx < 0 && pathNext) dispatch({ type: "select", id: pathNext.id, pathIndex: state.pathIndex! + 1 });
        if (dx > 0 && pathPrev) dispatch({ type: "select", id: pathPrev.id, pathIndex: state.pathIndex! - 1 });
      } else go(dx < 0 ? next : prev);
    }
  };

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    contentRef.current?.focus({ preventScroll: true });
  }, [e?.id]);

  const spoilerGate = e ? isHidden(e) : false;
  const c = e ? clusterById[e.cluster] : null;

  const relatedGroups = useMemo(() => {
    if (!e) return [];
    const incoming = Object.values(eventById).flatMap((o) => o.related.filter((r) => r.id === e.id).map((r) => ({ id: o.id, relation: inverse(r.relation) })));
    const all = [...e.related, ...incoming].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
    return REL_ORDER.map((rel) => ({ rel, items: all.filter((r) => r.relation === rel).map((r) => eventById[r.id]).filter(Boolean).sort((a, b) => a.sortYear - b.sortYear) })).filter((g) => g.items.length);
  }, [e]);

  return (
    <AnimatePresence>
      {e && c && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[86dvh] max-w-xl flex-col border border-b-0 border-line bg-bg-2 shadow-[0_-12px_40px_rgba(0,0,0,0.6)]"
            style={{ borderTop: `2px solid ${c.color}` }}
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && close()}
          >
            <div className="flex cursor-grab touch-none flex-col items-center pb-1 pt-2" onPointerDown={(ev) => controls.start(ev)}>
              <span className="h-1.5 w-12 rounded-full bg-line" aria-hidden />
            </div>

            {inPath && (
              <div className="mx-4 mb-1 flex items-center gap-2 rounded-md border border-yellow/40 bg-yellow/5 px-3 py-2 text-[13px] text-ink-2">
                <Icon name="flag" size={16} />
                <span className="font-display text-xs uppercase tracking-wider text-yellow">
                  Start here {state.pathIndex! + 1}/{startHere.length}
                </span>
                <span className="line-clamp-1 flex-1">{startHere[state.pathIndex!]?.note}</span>
              </div>
            )}

            <div ref={contentRef} tabIndex={-1} className="cp-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-4 outline-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div className="flex items-start gap-3 pt-1">
                <div className="flex-1">
                  <div className="font-display text-[13px] uppercase tracking-[0.14em]" style={{ color: c.color }}>
                    {e.inWorldDate}
                  </div>
                  <h2 id="sheet-title" className={`mt-1 font-display text-[23px] font-bold leading-[1.1] text-ink ${spoilerGate ? "spoiler-blur" : ""}`}>
                    {e.title}
                  </h2>
                </div>
                <button type="button" onClick={close} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-md text-ink-2 hover:text-ink">
                  <Icon name="close" />
                </button>
              </div>

              <div className="mt-3">
                <TagRow e={e} hidden={spoilerGate} />
              </div>

              {!spoilerGate && state.showImages && e.image && (
                <figure className="mt-4 overflow-hidden border border-line bg-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.image.thumb} alt={`Illustration for ${e.title}`} loading="lazy" referrerPolicy="no-referrer" className="max-h-56 w-full object-cover" onError={(ev) => ((ev.currentTarget.parentElement as HTMLElement).style.display = "none")} />
                  <figcaption className="px-2 py-1 text-[11px] text-ink-3">
                    Image:{" "}
                    <a href={e.image.page} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-2">
                      Cyberpunk Wiki
                    </a>{" "}
                    · © its respective owners
                  </figcaption>
                </figure>
              )}

              {spoilerGate ? (
                <div className="mt-6 rounded-md border border-magenta/50 bg-magenta/5 p-4 text-center">
                  <p className="text-sm text-ink-2">This event spoils the story of Cyberpunk 2077 or Phantom Liberty.</p>
                  <button type="button" onClick={() => dispatch({ type: "reveal", id: e.id })} className="mt-3 h-11 rounded-md border border-magenta px-4 font-display text-sm uppercase tracking-wider text-magenta">
                    Reveal anyway
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-4 text-[15.5px] leading-relaxed text-ink">{e.summary}</p>

                  <div className="mt-4 border-l-2 pl-3" style={{ borderColor: c.color }}>
                    <div className="font-display text-[11px] uppercase tracking-[0.18em] text-ink-3">Why it matters</div>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{e.whyItMatters}</p>
                  </div>

                  {e.conflictNote && (
                    <div className="mt-4 rounded-md border border-yellow/40 bg-yellow/[0.05] p-3">
                      <div className="font-display text-[11px] uppercase tracking-[0.18em] text-yellow">Wiki conflict</div>
                      <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{e.conflictNote}</p>
                    </div>
                  )}

                  {relatedGroups.length > 0 && (
                    <div className="mt-5">
                      <div className="font-display text-[11px] uppercase tracking-[0.18em] text-ink-3">Related events</div>
                      {relatedGroups.map((g) => (
                        <div key={g.rel} className="mt-2">
                          <div className="mb-1 text-xs text-ink-3">{REL_LABEL[g.rel]}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {g.items.map((r) => {
                              const rc = clusterById[r.cluster];
                              const hidden = isHidden(r);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => dispatch({ type: "select", id: r.id, pathIndex: null })}
                                  className="min-h-9 rounded-sm border px-2.5 py-1.5 text-left text-[13px] leading-tight text-ink hover:bg-white/5"
                                  style={{ borderColor: rc.color + "66" }}
                                >
                                  <span className="mr-1.5 font-display text-[11px]" style={{ color: rc.color }}>
                                    {Math.floor(r.sortYear)}
                                  </span>
                                  {hidden ? "Hidden spoiler" : r.title}
                                </button>
                              );
                            })}
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
                className="mt-6 flex h-11 items-center justify-center gap-2 rounded-md border border-line font-display text-sm uppercase tracking-wider text-cyan hover:border-cyan"
              >
                Read on the Cyberpunk Wiki <Icon name="external" size={16} />
              </a>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-3 py-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
              {inPath ? (
                <>
                  <NavBtn label="Previous step" disabled={!pathPrev} onClick={() => pathPrev && dispatch({ type: "select", id: pathPrev.id, pathIndex: state.pathIndex! - 1 })} dir="L" />
                  <button type="button" onClick={() => dispatch({ type: "select", id: e.id, pathIndex: null })} className="flex-1 font-display text-xs uppercase tracking-wider text-ink-3">
                    Leave path
                  </button>
                  <NavBtn label="Next step" disabled={!pathNext} onClick={() => pathNext && dispatch({ type: "select", id: pathNext.id, pathIndex: state.pathIndex! + 1 })} dir="R" />
                </>
              ) : (
                <>
                  <NavBtn label={prev ? `Previous: ${prev.title}` : "Previous"} disabled={!prev} onClick={() => go(prev)} dir="L" />
                  <span className="flex-1 text-center font-display text-[11px] uppercase tracking-wider text-ink-3">{e.inWorldDate}</span>
                  <NavBtn label={next ? `Next: ${next.title}` : "Next"} disabled={!next} onClick={() => go(next)} dir="R" />
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function NavBtn({ label, disabled, onClick, dir }: { label: string; disabled: boolean; onClick: () => void; dir: "L" | "R" }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-11 w-14 place-items-center rounded-md border border-line text-ink disabled:opacity-30">
      <Icon name={dir === "L" ? "chevronL" : "chevronR"} />
    </button>
  );
}

function inverse(r: Relation): Relation {
  return r === "caused" ? "led-to" : r === "led-to" ? "caused" : r === "part-of" ? "involves" : "involves";
}
