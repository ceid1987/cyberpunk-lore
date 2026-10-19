"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { clusterById, eraById, eras, type Era, type LoreEvent } from "@/data";
import { useIsHidden, useStore, useVisibleEvents, type TierLevel } from "@/lib/store";
import { Badge, CanonBadge, Icon, tierSize } from "./ui";

type Row = { kind: "era"; era: Era; count: number } | { kind: "event"; e: LoreEvent };

export interface TimelineHandle {
  /** Screen positions of node dots currently rendered, keyed by event id. */
  positions(): Record<string, { x: number; y: number; r: number }>;
}

const LINE_X = 30;

function yearLabel(e: Era) {
  const s = Number.isFinite(e.start) ? String(e.start) : "1800s";
  const end = Number.isFinite(e.end) ? String(e.end - 1) : "…";
  return `${s} – ${end}`;
}

const TimelineView = forwardRef<TimelineHandle, { hidden?: boolean }>(function TimelineView({ hidden }, ref) {
  const { state, dispatch } = useStore();
  const visible = useVisibleEvents();
  const isHidden = useIsHidden();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let current: string | null = null;
    for (const e of visible) {
      if (e.era !== current) {
        current = e.era;
        out.push({ kind: "era", era: eraById[e.era], count: visible.filter((v) => v.era === e.era).length });
      }
      out.push({ kind: "event", e });
    }
    return out;
  }, [visible]);

  const indexById = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r, i) => r.kind === "event" && (m[r.e.id] = i));
    return m;
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "era" ? 132 : rows[i].kind === "event" && (rows[i] as any).e.tier === "landmark" ? 150 : 92),
    overscan: 8,
    getItemKey: (i) => (rows[i].kind === "era" ? "era-" + (rows[i] as any).era.id : (rows[i] as any).e.id),
  });

  // Keep the reader's place when the tier level or filters change.
  const anchorYear = useRef<number | null>(null);
  const captureAnchor = useCallback(() => {
    const first = virtualizer.getVirtualItems().find((v) => v.end > (scrollRef.current?.scrollTop ?? 0) + 40);
    const r = first ? rows[first.index] : undefined;
    anchorYear.current = r ? (r.kind === "event" ? r.e.sortYear : Number.isFinite(r.era.start) ? r.era.start : 0) : null;
  }, [rows, virtualizer]);
  const prevRows = useRef(rows);
  useLayoutEffect(() => {
    if (prevRows.current === rows) return;
    prevRows.current = rows;
    const y = anchorYear.current;
    if (y == null) return;
    let best = 0;
    rows.forEach((r, i) => {
      if (r.kind === "event" && r.e.sortYear <= y) best = i;
    });
    virtualizer.scrollToIndex(best, { align: "start" });
  }, [rows, virtualizer]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => captureAnchor();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [captureAnchor]);

  // Follow the selected event (e.g. when swiping through events in the sheet).
  useEffect(() => {
    if (!state.selectedId || hidden) return;
    const i = indexById[state.selectedId];
    if (i === undefined) return;
    const items = virtualizer.getVirtualItems();
    const el = scrollRef.current;
    const it = items.find((v) => v.index === i);
    if (!el || !it || it.start < el.scrollTop || it.end > el.scrollTop + el.clientHeight * 0.45) {
      virtualizer.scrollToIndex(i, { align: "center", behavior: "smooth" });
    }
  }, [state.selectedId, indexById, virtualizer, hidden]);

  // Pinch on the timeline changes the detail level (spread fingers = more detail).
  const pinch = useRef<{ d: number; level: TierLevel } | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => {
    if (ev.touches.length === 2) {
      const [a, b] = [ev.touches[0], ev.touches[1]];
      pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), level: state.tierLevel };
    }
  };
  const onTouchMove = (ev: React.TouchEvent) => {
    if (!pinch.current || ev.touches.length !== 2) return;
    const [a, b] = [ev.touches[0], ev.touches[1]];
    const ratio = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.current.d;
    const step = ratio > 1.35 ? 1 : ratio < 0.72 ? -1 : 0;
    const next = Math.max(0, Math.min(2, pinch.current.level + step)) as TierLevel;
    if (next !== state.tierLevel) dispatch({ type: "tier", level: next });
  };
  const onTouchEnd = () => (pinch.current = null);

  useImperativeHandle(ref, () => ({
    positions() {
      const out: Record<string, { x: number; y: number; r: number }> = {};
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-node-id]").forEach((n) => {
        const b = n.getBoundingClientRect();
        if (b.bottom < 0 || b.top > window.innerHeight) return;
        out[n.dataset.nodeId!] = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
      });
      return out;
    },
  }));

  // Sticky era header + scrubber state
  const items = virtualizer.getVirtualItems();
  const scrollTop = scrollRef.current?.scrollTop ?? 0;
  const topItem = items.find((v) => v.end > scrollTop + 8);
  let currentEra: Era | undefined;
  if (topItem) {
    for (let i = topItem.index; i >= 0; i--) {
      const r = rows[i];
      if (r.kind === "era") {
        currentEra = r.era;
        break;
      }
      if (r.kind === "event") {
        currentEra = eraById[r.e.era];
        break;
      }
    }
  }
  const topRow = topItem ? rows[topItem.index] : undefined;
  const showSticky = !!currentEra && !(topRow?.kind === "era" && topItem && topItem.start > scrollTop - 60);

  return (
    <div className="absolute inset-0" aria-hidden={hidden}>
      <div
        ref={scrollRef}
        className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="feed"
        aria-label="Timeline of events"
        aria-busy={false}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() + 140 }}>
          {/* The line */}
          <div className="pointer-events-none absolute top-0 bottom-0 w-[2px]" style={{ left: LINE_X - 1, background: "linear-gradient(to bottom, #05d9e855, #ff2a6d55 50%, #fcee0a55)" }} />
          {items.map((v) => {
            const r = rows[v.index];
            return (
              <div key={v.key} data-index={v.index} ref={virtualizer.measureElement} className="absolute left-0 w-full" style={{ transform: `translateY(${v.start}px)` }}>
                {r.kind === "era" ? <EraRow era={r.era} count={r.count} /> : <EventRow e={r.e} hiddenSpoiler={isHidden(r.e)} />}
              </div>
            );
          })}
        </div>
        {rows.length === 0 && (
          <div className="p-8 pl-16 text-ink-2">
            No events match these filters.{" "}
            <button className="text-cyan underline" onClick={() => dispatch({ type: "clearFilters" })}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {showSticky && currentEra && (
        <div className="pointer-events-none absolute left-0 right-12 top-0 z-10 border-b border-line/70 bg-bg/95 py-2 pl-14 pr-3 backdrop-blur-sm">
          <div className="font-display text-[13px] font-bold uppercase tracking-[0.16em] text-ink">{currentEra.name}</div>
          <div className="font-display text-[11px] tracking-wider text-ink-3">{yearLabel(currentEra)}</div>
        </div>
      )}

      <Scrubber rows={rows} virtualizer={virtualizer} scrollEl={scrollRef} currentEra={currentEra?.id} />
    </div>
  );
});

export default TimelineView;

function EraRow({ era, count }: { era: Era; count: number }) {
  return (
    <section className="relative pb-3 pl-14 pr-14 pt-8" aria-label={`Era: ${era.name}`}>
      <span className="absolute h-4 w-4 rotate-45 border-2 border-yellow bg-bg" style={{ left: LINE_X - 8, top: 40 }} aria-hidden />
      <h2 className="glitch font-display text-[22px] font-bold uppercase leading-tight tracking-[0.12em] text-yellow" data-text={era.name}>
        {era.name}
      </h2>
      <p className="mt-0.5 font-display text-xs uppercase tracking-[0.2em] text-ink-3">
        {yearLabel(era)} · {count} event{count === 1 ? "" : "s"}
      </p>
      <p className="mt-2 text-sm leading-snug text-ink-2">{era.blurb}</p>
    </section>
  );
}

function EventRow({ e, hiddenSpoiler }: { e: LoreEvent; hiddenSpoiler: boolean }) {
  const { state, dispatch } = useStore();
  const c = clusterById[e.cluster];
  const size = tierSize(e.tier);
  const selected = state.selectedId === e.id;
  const viewed = state.viewed.includes(e.id);
  const big = e.tier === "landmark";

  const onClick = () => {
    if (hiddenSpoiler) dispatch({ type: "reveal", id: e.id });
    else dispatch({ type: "select", id: e.id });
  };

  return (
    <article className="relative py-1.5 pl-14 pr-14">
      <span
        data-node-id={e.id}
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: LINE_X - size / 2,
          top: big ? 26 : 20,
          width: size,
          height: size,
          background: hiddenSpoiler ? "#2a2a3a" : c.color,
          boxShadow: big && !hiddenSpoiler ? `0 0 0 3px #07070b, 0 0 14px ${c.color}aa` : "0 0 0 3px #07070b",
          outline: viewed ? `1.5px solid ${c.color}` : undefined,
          outlineOffset: 2,
        }}
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={hiddenSpoiler ? `Hidden 2077 spoiler from ${e.inWorldDate}. Activate to reveal.` : `${e.title}, ${e.inWorldDate}`}
        className={`group relative block w-full overflow-hidden rounded-md border text-left transition-colors ${selected ? "border-cyan bg-cyan/10" : "border-line bg-panel/70 hover:border-ink-3"} ${big ? "p-3.5" : "px-3 py-2.5"}`}
        style={{ borderLeft: `3px solid ${hiddenSpoiler ? "#3a3a4a" : c.color}` }}
      >
        <div className={hiddenSpoiler ? "spoiler-blur" : ""} aria-hidden={hiddenSpoiler}>
          <div className="flex items-center gap-2 font-display text-[11px] uppercase tracking-wider text-ink-3">
            <span>{e.inWorldDate}</span>
            {viewed && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-ink-3" title="Viewed">
                <Icon name="check" size={12} />
              </span>
            )}
          </div>
          <h3 className={`mt-0.5 font-display font-bold leading-tight ${big ? "text-[19px] text-ink" : e.tier === "major" ? "text-[15.5px] text-ink" : "text-[14px] text-ink-2"}`}>{hiddenSpoiler ? "Hidden spoiler event" : e.title}</h3>
          {big && !hiddenSpoiler && <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-ink-2">{e.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[11px] uppercase tracking-wider" style={{ color: c.color }}>
              {c.short}
            </span>
            {e.tier !== "minor" && <CanonBadge canon={e.canonSource} />}
            {e.edgerunnersTie && !hiddenSpoiler && <Badge color="#c8ff2e">Seen in Edgerunners</Badge>}
          </div>
        </div>
        {hiddenSpoiler && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bg/30 font-display text-xs uppercase tracking-wider text-magenta">
            <Icon name="eyeOff" size={16} /> 2077 spoiler · tap to reveal
          </div>
        )}
      </button>
    </article>
  );
}

function Scrubber({ rows, virtualizer, scrollEl, currentEra }: { rows: Row[]; virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>; scrollEl: React.RefObject<HTMLDivElement | null>; currentEra?: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ y: number; label: string } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [scrollEl]);

  const segments = useMemo(() => {
    const total = rows.length || 1;
    const segs: { id: string; name: string; start: number; frac: number; from: number }[] = [];
    rows.forEach((r, i) => {
      if (r.kind === "era") segs.push({ id: r.era.id, name: r.era.name, start: i, frac: 0, from: Number.isFinite(r.era.start) ? r.era.start : 1859 });
    });
    segs.forEach((s, i) => (s.frac = ((segs[i + 1]?.start ?? total) - s.start) / total));
    return segs;
  }, [rows]);

  const jump = (clientY: number) => {
    const bar = barRef.current;
    if (!bar || !rows.length) return;
    const b = bar.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientY - b.top) / b.height));
    const idx = Math.min(rows.length - 1, Math.floor(f * rows.length));
    virtualizer.scrollToIndex(idx, { align: "start" });
    const r = rows[idx];
    setDrag({ y: clientY - b.top, label: r.kind === "event" ? String(Math.floor(r.e.sortYear)) : r.era.name });
  };

  const el = scrollEl.current;
  const progress = el && el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;

  return (
    <nav aria-label="Jump to era" className="absolute bottom-24 right-1 top-3 z-20 flex w-10 flex-col">
      <div
        ref={barRef}
        className="relative flex flex-1 touch-none flex-col overflow-hidden rounded-sm border border-line/80 bg-bg-2/80"
        onPointerDown={(ev) => {
          (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
          jump(ev.clientY);
        }}
        onPointerMove={(ev) => ev.buttons && jump(ev.clientY)}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Jump to ${s.name}`}
            onClick={() => virtualizer.scrollToIndex(s.start, { align: "start" })}
            className="relative w-full border-b border-line/60 text-left"
            style={{ flexGrow: Math.max(s.frac, 0.02), flexBasis: 0, background: s.id === currentEra ? "#05d9e81f" : undefined }}
          >
            <span className="absolute left-0.5 top-0.5 font-display text-[9px] leading-none tracking-tight" style={{ color: s.id === currentEra ? "#05d9e8" : "#74748c" }}>
              {s.from}
            </span>
          </button>
        ))}
        <div className="pointer-events-none absolute left-0 right-0 h-[3px] bg-yellow shadow-[0_0_8px_#fcee0a]" style={{ top: `calc(${progress * 100}% - 1px)` }} />
      </div>
      {drag && (
        <div className="pointer-events-none absolute right-12 rounded-sm border border-yellow/60 bg-bg px-2 py-1 font-display text-sm font-bold text-yellow" style={{ top: drag.y - 14 }}>
          {drag.label}
        </div>
      )}
    </nav>
  );
}
