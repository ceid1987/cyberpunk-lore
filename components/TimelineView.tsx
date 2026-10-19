"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { animate } from "framer-motion";
import { clusterById, eras, events as allEvents, eventById, type Event } from "@/data";
import { useFilteredEvents, useIsHidden, useStore, usePanelInset, usePrefersReducedMotion } from "@/lib/store";
import { ClusterBadge, ClusterIcon, Icon, SPOIL_LABEL, TagRow, tierSize } from "./ui";

// ---------------------------------------------------------------------------
// Horizontal, zoomable timeline.
//  * x axis is time. Each era gets a width proportional to how many events it
//    holds, so the dense 1990-2077 stretch isn't squeezed by the empty 1800s.
//  * Pinch / wheel zooms the time axis; drag pans in both directions.
//  * Every event is always a dot on the line. Cards follow zoom: none when the
//    whole line is in view, then landmarks, then major, then minor events.
//    Compact cards (date, theme, title) become full cards (image, tags) when
//    zoomed in far enough.
//  * Cards are packed into rows above and below the line in world space, so
//    panning or selecting never reshuffles them; only zooming does.
// ---------------------------------------------------------------------------

const START = 1855;
const END = 2100;
const LINE_PAD = 26; // gap between line and first card row
const ROW_GAP = 10;
const MAX_ROWS = 6; // per side

type Mode = "compact" | "full";
const IMG_H = 104;
const CARD = { compact: { w: 184, h: 64 }, full: { w: 232, h: 118 } } as const;
const cardSize = (mode: Mode, img: boolean) => (mode === "full" && img ? { w: CARD.full.w, h: CARD.full.h + IMG_H } : CARD[mode]);

// ---- piecewise-linear time scale
const ERA_W = (() => {
  const counts: Record<string, number> = {};
  for (const e of allEvents) counts[e.era] = (counts[e.era] ?? 0) + 1;
  return eras.map((era) => {
    const s = Number.isFinite(era.start) ? era.start : START;
    const en = Number.isFinite(era.end) ? era.end : END;
    return { era, s, e: en, w: 220 + 52 * (counts[era.id] ?? 0) };
  });
})();
let acc = 0;
export const SEGS = ERA_W.map((seg) => {
  const x0 = acc;
  acc += seg.w;
  return { ...seg, x0, x1: acc };
});
export const WORLD_W = acc;

export function yearToX(y: number) {
  const seg = SEGS.find((s) => y >= s.s && y < s.e) ?? (y < START ? SEGS[0] : SEGS[SEGS.length - 1]);
  const f = Math.max(0, Math.min(1, (y - seg.s) / (seg.e - seg.s)));
  return seg.x0 + f * seg.w;
}
export function xToYear(x: number) {
  const seg = SEGS.find((s) => x >= s.x0 && x < s.x1) ?? (x < 0 ? SEGS[0] : SEGS[SEGS.length - 1]);
  return seg.s + ((x - seg.x0) / seg.w) * (seg.e - seg.s);
}

export interface TimelineHandle {
  positions(): Record<string, { x: number; y: number; r: number }>;
}

type T = { k: number; x: number; y: number };

/** Zoom (relative to "whole line fits") at which each tier gets cards. Below the first, only dots. */
const CARD_ZOOM = { landmark: 1.7, major: 3.4, minor: 7 } as const;
const FULL_ZOOM = 13;
const RANK = { landmark: 0, major: 1, minor: 2 } as const;

const TimelineView = forwardRef<TimelineHandle, { hidden?: boolean }>(function TimelineView({ hidden }, ref) {
  const { state, dispatch } = useStore();
  const filtered = useFilteredEvents();
  const isHidden = useIsHidden();
  const reduced = usePrefersReducedMotion();
  const inset = usePanelInset();
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<T>({ k: 375 / WORLD_W, x: 20, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const k0 = (Math.max(size.w, 320) - 40) / WORLD_W;
  const clampK = useCallback((k: number) => Math.max(k0 * 0.9, Math.min(k0 * 80, k)), [k0]);

  // Fit everything on first layout.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w > 0) {
      fitted.current = true;
      setT({ k: k0, x: 20, y: 0 });
    }
  }, [size, k0]);

  const z = t.k / k0;
  const mode: Mode = z >= FULL_ZOOM ? "full" : "compact";
  const card = cardSize(mode, state.showImages);
  const lineY = size.h * 0.5 + t.y;

  const toX = (wx: number) => wx * t.k + t.x;

  // ---- card packing, in world space so it only changes with zoom.
  // Zoom is quantised (about 3% steps) so packing doesn't churn every frame.
  const kq = Math.round(Math.log(t.k) * 32);
  const packing = useMemo(() => {
    const k = Math.exp(kq / 32);
    const zz = k / k0;
    const perSide = Math.max(1, Math.min(MAX_ROWS, Math.floor((size.h / 2 - LINE_PAD - 44) / (card.h + ROW_GAP))));
    const order = filtered.filter((e) => zz >= CARD_ZOOM[e.tier]).sort((a, b) => RANK[a.tier] - RANK[b.tier] || a.sortYear - b.sortYear);
    const halfW = (card.w / 2 + 8) / k; // world units
    const rows: { x0: number; x1: number }[][] = Array.from({ length: perSide * 2 }, () => []);
    const out: { e: Event; wx: number; r: number }[] = [];
    for (const e of order) {
      const wx = yearToX(e.sortYear);
      const iv = { x0: wx - halfW, x1: wx + halfW };
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].some((o) => o.x0 < iv.x1 && iv.x0 < o.x1)) continue;
        rows[r].push(iv);
        out.push({ e, wx, r });
        break;
      }
    }
    return out;
  }, [filtered, kq, k0, size.h, card.w, card.h]);

  const layout = useMemo(() => {
    const margin = card.w;
    const dots = filtered.map((e) => ({ e, px: yearToX(e.sortYear) * t.k + t.x })).filter((v) => v.px > -40 && v.px < size.w + 40);
    const placed: { e: Event; px: number; left: number; top: number; side: 1 | -1 }[] = [];
    for (const p of packing) {
      const px = p.wx * t.k + t.x;
      if (px < -margin || px > size.w + margin) continue;
      const level = Math.floor(p.r / 2);
      const side: 1 | -1 = p.r % 2 === 0 ? -1 : 1;
      const top = side === -1 ? -(LINE_PAD + (level + 1) * card.h + level * ROW_GAP) : LINE_PAD + level * (card.h + ROW_GAP);
      placed.push({ e: p.e, px, left: px - card.w / 2, top, side });
    }
    return { dots, placed };
  }, [filtered, packing, t.k, t.x, size.w, card.w, card.h]);

  // ---- interaction
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ start: T; down: { x: number; y: number }; d?: number; midX?: number; moved: number; captured: boolean } | null>(null);
  const suppressClick = useRef(false);

  const zoomAt = useCallback(
    (factor: number, cx: number) =>
      setT((cur) => {
        const k = clampK(cur.k * factor);
        return { ...cur, k, x: cx - (cx - cur.x) * (k / cur.k) };
      }),
    [clampK],
  );

  const local = (ev: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const onPointerDown = (ev: React.PointerEvent) => {
    const p = local(ev);
    pointers.current.set(ev.pointerId, p);
    const pts = [...pointers.current.values()];
    suppressClick.current = false;
    if (pts.length === 1) g.current = { start: tRef.current, down: p, moved: 0, captured: false };
    else if (pts.length === 2) {
      const [a, b] = pts;
      g.current = { start: tRef.current, down: p, d: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 0.35, midX: (a.x + b.x) / 2, moved: 99, captured: true };
    }
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (!pointers.current.has(ev.pointerId) || !g.current) return;
    const p = local(ev);
    pointers.current.set(ev.pointerId, p);
    const pts = [...pointers.current.values()];
    const s = g.current;
    if (pts.length === 1) {
      const dx = p.x - s.down.x;
      const dy = p.y - s.down.y;
      s.moved = Math.max(s.moved, Math.hypot(dx, dy));
      if (s.moved > 6 && !s.captured) {
        s.captured = true;
        (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      }
      if (s.captured) {
        suppressClick.current = true;
        const maxY = Math.max(40, size.h * 0.32);
        setT({ ...s.start, x: s.start.x + dx, y: Math.max(-maxY, Math.min(maxY, s.start.y + dy)) });
      }
    } else if (pts.length >= 2 && s.d && s.midX !== undefined) {
      suppressClick.current = true;
      const [a, b] = pts;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 0.35;
      const mid = (a.x + b.x) / 2;
      const k = clampK(s.start.k * (d / s.d));
      setT({ ...s.start, k, x: mid - (s.midX - s.start.x) * (k / s.start.k) });
    }
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      g.current = { start: tRef.current, down: p, moved: 99, captured: true };
    } else if (pointers.current.size === 0) g.current = null;
  };
  const onWheel = (ev: React.WheelEvent) => {
    const p = local(ev);
    if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) setT((cur) => ({ ...cur, x: cur.x - (ev.deltaX || ev.deltaY) }));
    else zoomAt(Math.exp(-ev.deltaY * 0.0018), p.x);
  };
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.target !== wrapRef.current) return;
    if (ev.key === "ArrowLeft") setT((c) => ({ ...c, x: c.x + 80 }));
    if (ev.key === "ArrowRight") setT((c) => ({ ...c, x: c.x - 80 }));
    if (ev.key === "ArrowUp") setT((c) => ({ ...c, y: c.y + 60 }));
    if (ev.key === "ArrowDown") setT((c) => ({ ...c, y: c.y - 60 }));
    // Zoom around the middle of the part of the screen not covered by the detail panel.
    const mid = insetRef.current.left + (size.w - insetRef.current.left) / 2;
    if (ev.key === "+" || ev.key === "=") zoomAt(1.4, mid);
    if (ev.key === "-") zoomAt(1 / 1.4, mid);
    if (ev.key === "0") animateTo({ k: k0, x: 20, y: 0 });
  };

  const animateTo = useCallback(
    (target: T) => {
      if (reduced) return setT(target);
      const from = tRef.current;
      animate(0, 1, { duration: 0.5, ease: [0.2, 0.8, 0.2, 1], onUpdate: (q) => setT({ k: from.k + (target.k - from.k) * q, x: from.x + (target.x - from.x) * q, y: from.y + (target.y - from.y) * q }) });
    },
    [reduced],
  );

  // Bring the selected event into view, zooming in enough for its tier to show.
  useEffect(() => {
    if (hidden || !state.selectedId) return;
    const e = eventById[state.selectedId];
    if (!e) return;
    const cur = tRef.current;
    const need = CARD_ZOOM[e.tier] * k0 * 1.05;
    const k = Math.max(cur.k, need);
    const wx = yearToX(e.sortYear);
    const { left, bottom } = insetRef.current;
    const px = wx * cur.k + cur.x;
    const cx = left + (size.w - left) / 2;
    if (k === cur.k && px > left + (size.w - left) * 0.15 && px < size.w * 0.85) return;
    // Keep the line in the visible part above a mobile bottom sheet.
    const ty = bottom ? -Math.min(bottom * 0.55, size.h * 0.3) : cur.y;
    animateTo({ k, x: cx - wx * k, y: ty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedId, hidden]);

  useImperativeHandle(ref, () => ({
    positions() {
      const out: Record<string, { x: number; y: number; r: number }> = {};
      wrapRef.current?.querySelectorAll<HTMLElement>("[data-node-id]").forEach((n) => {
        const b = n.getBoundingClientRect();
        if (b.right < 0 || b.left > window.innerWidth) return;
        out[n.dataset.nodeId!] = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
      });
      return out;
    },
  }));

  // ---- ticks
  const ticks = useMemo(() => {
    const out: { x: number; label: string; major: boolean }[] = [];
    for (const s of SEGS) {
      const sx0 = toX(s.x0);
      const sx1 = toX(s.x1);
      if (sx1 < -50 || sx0 > size.w + 50) continue;
      const pxPerYear = (s.w * t.k) / (s.e - s.s);
      const step = [1, 2, 5, 10, 20, 25, 50, 100].find((st) => st * pxPerYear >= 64) ?? 100;
      const first = Math.ceil(s.s / step) * step;
      for (let y = first; y < s.e; y += step) {
        const x = toX(yearToX(y));
        if (x < -40 || x > size.w + 40) continue;
        out.push({ x, label: String(y), major: y % (step * 5) === 0 });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.k, t.x, size.w]);


  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 select-none overflow-hidden outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Timeline. Drag to move, pinch or scroll to zoom in and see event cards."
      aria-hidden={hidden}
      onClickCapture={(ev) => {
        if (suppressClick.current) {
          ev.stopPropagation();
          ev.preventDefault();
          suppressClick.current = false;
        }
      }}
    >
      {/* era bands */}
      {SEGS.map((s, i) => {
        const x0 = toX(s.x0);
        const x1 = toX(s.x1);
        if (x1 < 0 || x0 > size.w) return null;
        const labelW = s.era.name.length * 10 + 24;
        const labelX = Math.max(x0, 0) + 10;
        const showLabel = labelX + labelW < x1;
        return (
          <div key={s.era.id} className="pointer-events-none absolute inset-y-0" style={{ left: x0, width: x1 - x0, background: i % 2 ? "rgba(255,255,255,0.018)" : "transparent", borderLeft: "1px solid #26263680" }}>
            {showLabel && <div className="absolute top-2 whitespace-nowrap" style={{ left: labelX - x0 }}>
              <div className="font-display text-[13px] font-bold uppercase tracking-[0.16em] text-yellow/90">
                {s.era.name}
              </div>
              <div className="font-display text-[10px] tracking-[0.2em] text-ink-3">
                {Number.isFinite(s.era.start) ? s.era.start : "1800s"} – {Number.isFinite(s.era.end) ? s.era.end - 1 : "…"}
              </div>
            </div>}
          </div>
        );
      })}

      {/* the line */}
      <div className="pointer-events-none absolute left-0 right-0 h-[2px] bg-white/85" style={{ top: lineY - 1 }} />
      {ticks.map((tk) => (
        <div key={tk.label} className="pointer-events-none absolute" style={{ left: tk.x, top: lineY }}>
          <div className="absolute -translate-x-1/2 bg-white/70" style={{ width: 1, height: tk.major ? 10 : 6, top: -(tk.major ? 5 : 3) }} />
          <div className="absolute -translate-x-1/2 font-display text-[10px] tracking-wider text-ink-3" style={{ top: 7 }}>
            {tk.label}
          </div>
        </div>
      ))}

      {/* connectors */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {layout.placed.map((p) => {
          const c = clusterById[p.e.cluster].color;
          const y2 = p.side === -1 ? lineY + p.top + card.h : lineY + p.top;
          return <line key={p.e.id} x1={p.px} y1={lineY} x2={p.px} y2={y2} stroke={isHidden(p.e) ? "#3a3a4a" : c} strokeOpacity={0.55} strokeWidth={1} strokeDasharray={p.e.tier === "minor" ? "2 3" : undefined} />;
        })}
      </svg>

      {/* dots */}
      {layout.dots.map(({ e, px }) => {
        const c = clusterById[e.cluster].color;
        const s = tierSize(e.tier);
        const hid = isHidden(e);
        const viewed = state.viewed.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            tabIndex={-1}
            aria-label={hid ? "Hidden spoiler" : e.title}
            onClick={() => (hid ? dispatch({ type: "reveal", id: e.id }) : dispatch({ type: "select", id: e.id }))}
            className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: px, top: lineY, width: Math.max(28, s + 12), height: 28 }}
          >
            <span
              data-node-id={e.id}
              className={e.tier === "landmark" ? "rotate-45" : "rounded-full"}
              style={{
                width: s,
                height: s,
                background: hid ? "#2a2a3a" : c,
                boxShadow: `0 0 0 2.5px #07070b${e.tier === "landmark" && !hid ? `, 0 0 12px ${c}` : ""}`,
                outline: viewed || state.selectedId === e.id ? `1.5px solid ${state.selectedId === e.id ? "#fff" : c}` : undefined,
                outlineOffset: 2,
              }}
            />
          </button>
        );
      })}

      {/* cards */}
      {layout.placed.map((p) => (
        <EventCard key={p.e.id} e={p.e} mode={mode} left={p.left} top={lineY + p.top} />
      ))}

      {filtered.length === 0 && (
        <div className="absolute inset-x-0 top-1/3 text-center text-ink-2">
          No events match these filters.{" "}
          <button className="text-cyan underline" onClick={() => dispatch({ type: "clearFilters" })}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
});

export default TimelineView;

function EventCard({ e, mode, left, top }: { e: Event; mode: Mode; left: number; top: number }) {
  const { state, dispatch } = useStore();
  const isHidden = useIsHidden();
  const hid = isHidden(e);
  const c = clusterById[e.cluster];
  const full = mode === "full";
  const withImg = full && state.showImages;
  const { w, h } = cardSize(mode, state.showImages);
  const selected = state.selectedId === e.id;
  const border = selected ? "#05d9e8" : hid ? "#2e2e3e" : c.color + "66";
  return (
    <button
      type="button"
      onClick={() => (hid ? dispatch({ type: "reveal", id: e.id }) : dispatch({ type: "select", id: e.id }))}
      aria-label={hid ? `Hidden spoiler, ${e.inWorldDate}. Activate to reveal.` : `${e.title}, ${e.inWorldDate}`}
      className={`cp-card absolute flex flex-col overflow-hidden border text-left transition-colors ${selected ? "bg-[#10202a]" : "bg-panel/95 hover:bg-[#171724]"}`}
      style={{ left, top, width: w, height: h, borderColor: border, borderLeft: `3px solid ${hid ? "#3a3a4a" : c.color}`, ["--b" as string]: border }}
    >
      {withImg && (
        <div className="relative grid w-full shrink-0 place-items-center overflow-hidden border-b border-line/60 bg-black" style={{ height: IMG_H }}>
          {e.image && !hid ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.image.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain opacity-90" draggable={false} onError={(ev) => (ev.currentTarget.style.visibility = "hidden")} />
          ) : (
            <span className="opacity-40">
              <ClusterIcon id={e.cluster} size={30} />
            </span>
          )}
        </div>
      )}
      <div className={`flex min-h-0 flex-1 flex-col px-2.5 py-2 ${hid ? "spoiler-blur" : ""}`} aria-hidden={hid}>
        <div className="flex h-[14px] items-center justify-between gap-2">
          <span className="min-w-0 truncate font-display text-[10px] uppercase leading-none tracking-wider text-ink-3">{e.inWorldDate}</span>
          <ClusterBadge id={e.cluster} small />
        </div>
        <div className={`mt-1 line-clamp-2 font-display font-bold leading-[1.2] text-ink ${full ? "h-[34px] text-[14px]" : "h-[30px] text-[12.5px]"}`}>{hid ? "Hidden spoiler event" : e.title}</div>
        {full && (
          <div className="mt-2 max-h-[38px] overflow-hidden">
            <TagRow e={e} small hidden={hid} />
          </div>
        )}
      </div>
      {hid && (
        <div className="absolute inset-0 grid place-items-center bg-bg/40 font-display text-[11px] uppercase tracking-wider text-magenta">
          <span className="flex items-center gap-1.5">
            <Icon name="eyeOff" size={14} /> {e.spoils ? SPOIL_LABEL[e.spoils] : "Spoiler"}
          </span>
        </div>
      )}
    </button>
  );
}
