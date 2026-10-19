"use client";

import { animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { clusterById, type Event } from "@/data";
import { useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion, type MuseumPane } from "@/lib/store";
import { EventPane } from "./EventSheet";
import { SEGS, yearToX } from "./TimelineView";
import { Icon } from "./ui";

// ---------------------------------------------------------------------------
// Museum: steps through every event in date order, with three panes side by
// side: the event card, a slim timeline (points and short labels) and the map.
// Each pane can be switched off. The map itself is the shared GraphView, which
// LoreApp positions over the "map" rect computed here.
// Before the first step only a Start button is shown.
// ---------------------------------------------------------------------------

export type Rect = { x: number; y: number; w: number; h: number };
export type MuseumLayout = { header: number; card?: Rect; timeline?: Rect; map?: Rect };

export const MUSEUM_DESKTOP = 768;
/** Mobile keeps the bottom free for the stepper and the view switch. */
const MOBILE_BOTTOM = 128;

export function museumLayout(w: number, h: number, panes: Record<MuseumPane, boolean>): MuseumLayout {
  const desktop = w >= MUSEUM_DESKTOP;
  const header = 52;
  const bodyH = h - header - (desktop ? 0 : MOBILE_BOTTOM);
  const out: MuseumLayout = { header };
  if (desktop) {
    const right = panes.timeline || panes.map;
    const cardW = panes.card ? (right ? Math.min(400, Math.round(w * 0.42)) : w) : 0;
    if (panes.card) out.card = { x: 0, y: header, w: cardW, h: bodyH };
    const rw = w - cardW;
    const tlH = panes.timeline ? (panes.map ? Math.min(170, Math.round(bodyH * 0.26)) : bodyH) : 0;
    if (panes.timeline) out.timeline = { x: cardW, y: header, w: rw, h: tlH };
    if (panes.map) out.map = { x: cardW, y: header + tlH, w: rw, h: bodyH - tlH };
  } else {
    // Card on top for reading; the map sits at the bottom where the floating buttons are.
    const others = panes.timeline || panes.map;
    const cardH = panes.card ? (others ? Math.round(bodyH * 0.46) : bodyH) : 0;
    const tlH = panes.timeline ? (panes.map ? 96 : bodyH - cardH) : 0;
    const mapH = panes.map ? bodyH - cardH - tlH : 0;
    if (panes.card) out.card = { x: 0, y: header, w, h: cardH };
    if (panes.timeline) out.timeline = { x: 0, y: header + cardH, w, h: tlH };
    if (panes.map) out.map = { x: 0, y: header + cardH + tlH, w, h: mapH };
  }
  return out;
}

const PANE_META: { id: MuseumPane; label: string; icon: "info" | "timeline" | "graph" }[] = [
  { id: "card", label: "Card", icon: "info" },
  { id: "timeline", label: "Timeline", icon: "timeline" },
  { id: "map", label: "Map", icon: "graph" },
];

export default function MuseumView({ layout, width }: { layout: MuseumLayout; width: number }) {
  const { state, dispatch } = useStore();
  const seq = useFilteredEvents();
  const idx = state.museum.index;
  const max = Math.min(state.museum.max, seq.length - 1);
  const cur = idx >= 0 ? seq[idx] : null;
  const started = idx >= 0;
  const desktop = width >= MUSEUM_DESKTOP;
  const go = (i: number) => dispatch({ type: "museum", index: Math.max(0, Math.min(seq.length - 1, i)) });

  // Keep the selected event in sync with the museum position.
  useEffect(() => {
    const id = cur?.id ?? null;
    if (state.selectedId !== id) dispatch({ type: "select", id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);
  // Filters can shrink the sequence under the current index.
  useEffect(() => {
    if (idx > seq.length - 1) go(seq.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq.length]);

  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || state.panel) return;
      if (ev.key === "ArrowRight") go(idx + 1);
      if (ev.key === "ArrowLeft" && started) go(idx - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const box = (r?: Rect): React.CSSProperties | undefined => (r ? { left: r.x, top: r.y, width: r.w, height: r.h } : undefined);
  const stepperBottom = "calc(max(0.75rem, env(safe-area-inset-bottom)) + 56px)"; // just above the view switch

  if (!started)
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 [&>*]:pointer-events-auto">
        <div className="text-center">
          <div className="font-display text-sm uppercase tracking-[0.3em] text-yellow">Museum</div>
          <p className="mt-2 text-[15px] text-ink-2">Every event from 1859 to 2095, one at a time.</p>
          <button
            type="button"
            onClick={() => go(0)}
            autoFocus
            className="cp-btn mx-auto mt-6 flex h-12 items-center gap-2 bg-yellow px-7 font-display text-[15px] font-bold uppercase tracking-[0.18em] text-bg"
            style={{ ["--b" as string]: "#fcee0a" }}
          >
            <Icon name="play" size={18} /> Start
          </button>
        </div>
      </div>
    );

  const behind = idx < max;

  return (
    <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
      {/* header: where we are + which panes are shown */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-line bg-bg px-3" style={{ height: layout.header }}>
        <div className="flex min-w-0 items-baseline gap-2.5" aria-live="polite">
          <span className="font-display text-[24px] font-bold leading-none tracking-wider text-white/90">{cur ? Math.floor(cur.sortYear) : ""}</span>
          <span className="whitespace-nowrap font-display text-[10px] uppercase leading-none tracking-[0.2em] text-ink-3">
            {idx + 1} / {seq.length}
          </span>
        </div>
        <div className="ml-auto flex gap-1" role="group" aria-label="Museum panes">
          {PANE_META.map((p) => {
            const on = state.museumPanes[p.id];
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                aria-label={p.label}
                title={`${on ? "Hide" : "Show"} ${p.label.toLowerCase()}`}
                onClick={() => dispatch({ type: "museumPane", pane: p.id })}
                className={`cp-btn flex h-9 items-center gap-1.5 border px-2.5 font-display text-[11px] uppercase tracking-wider transition-colors ${on ? "border-cyan/70 bg-cyan/10 text-cyan" : "border-line text-ink-3 hover:text-ink-2"}`}
                style={{ ["--b" as string]: on ? "#05d9e8b3" : "#262636" }}
              >
                <Icon name={p.icon} size={15} />
                <span className={desktop ? "" : "hidden min-[400px]:inline"}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {layout.card && (
        <section aria-label="Event details" className={`absolute overflow-hidden bg-bg-2 ${desktop ? "border-r" : "border-b"} border-line`} style={box(layout.card)}>
          <EventPane />
        </section>
      )}
      {layout.timeline && (
        <section aria-label="Timeline" className="absolute overflow-hidden border-b border-line bg-[#0a0a11]" style={box(layout.timeline)}>
          <MuseumTimeline seq={seq} index={idx} max={max} onPick={go} />
        </section>
      )}

      {/* stepper, centred above the view switch */}
      <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: stepperBottom }}>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button type="button" aria-label="Previous event" disabled={idx <= 0} onClick={() => go(idx - 1)} className="cp-btn grid h-10 w-11 place-items-center border border-line bg-bg/90 text-ink backdrop-blur-sm disabled:opacity-30">
            <Icon name="chevronL" />
          </button>
          <button type="button" aria-label="Next event" disabled={idx >= seq.length - 1} onClick={() => go(idx + 1)} className="cp-btn grid h-10 w-14 place-items-center bg-yellow text-bg disabled:opacity-30" style={{ ["--b" as string]: "#fcee0a" }}>
            <Icon name="chevronR" />
          </button>
          {behind && (
            <button
              type="button"
              onClick={() => go(max)}
              className="cp-btn mt-pop flex h-10 items-center gap-1.5 border border-yellow/70 bg-bg/90 px-3 font-display text-[11px] font-bold uppercase tracking-wider text-yellow backdrop-blur-sm"
              style={{ ["--b" as string]: "#fcee0ab3" }}
              title={`Back to event ${max + 1}`}
            >
              Jump to present <Icon name="chevronR" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- slim timeline
const LABEL_W_DESKTOP = 150;
const LABEL_W_MOBILE = 104;

/** Points and short labels. Every event seen so far is a button; ones after the current position are dimmed. */
function MuseumTimeline({ seq, index, max, onPick }: { seq: Event[]; index: number; max: number; onPick: (i: number) => void }) {
  const isHidden = useIsHidden();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const desktop = size.w >= 560;
  const k = Math.max(desktop ? 0.42 : 0.3, size.w / 2400);
  const cur = index >= 0 ? seq[index] : null;
  const targetX = yearToX(cur ? cur.sortYear : 1859);
  const [cx, setCx] = useState(targetX);
  const cxRef = useRef(cx);
  cxRef.current = cx;
  useEffect(() => {
    if (reduced) return setCx(targetX);
    const a = animate(cxRef.current, targetX, { duration: 0.7, ease: [0.22, 0.8, 0.2, 1], onUpdate: setCx });
    return () => a.stop();
  }, [targetX, reduced]);

  const lineY = Math.round(size.h * (size.h > 130 ? 0.55 : 0.5));
  const toX = (wx: number) => size.w / 2 + (wx - cx) * k;
  const seen = useMemo(() => seq.slice(0, Math.max(index, max) + 1), [seq, index, max]);
  const revealed = useMemo(() => (index >= 0 ? seq.slice(0, index + 1) : []), [seq, index]);

  // Events linked to the current one, for arcs and label priority.
  const linked = useMemo(() => {
    const s = new Set<string>();
    if (!cur) return s;
    for (const r of cur.related) s.add(r.id);
    for (const e of revealed) if (e.related.some((r) => r.id === cur.id)) s.add(e.id);
    return s;
  }, [cur, revealed]);

  const pts = seen.map((e, i) => ({ e, i, x: toX(yearToX(e.sortYear)), future: i > index })).filter((p) => p.x > -200 && p.x < size.w + 200);

  // Labels (revealed events only): greedy, current first, then linked, then by tier and distance; alternate above / below.
  const rowsPerSide = size.h > 150 ? 2 : 1;
  const labelW = desktop ? LABEL_W_DESKTOP : LABEL_W_MOBILE;
  const labels = useMemo(() => {
    const rank = (e: Event) => (cur && e.id === cur.id ? -2 : linked.has(e.id) ? -1 : e.tier === "landmark" ? 0 : e.tier === "major" ? 1 : 2);
    const order = pts.filter((p) => !p.future && p.x > -labelW && p.x < size.w + labelW).sort((a, b) => rank(a.e) - rank(b.e) || Math.abs(a.x - size.w / 2) - Math.abs(b.x - size.w / 2));
    const rows: { x0: number; x1: number }[][] = Array.from({ length: rowsPerSide * 2 }, () => []);
    const out: { e: Event; i: number; x: number; row: number }[] = [];
    for (const p of order) {
      const iv = { x0: p.x - labelW / 2, x1: p.x + labelW / 2 };
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].some((o) => o.x0 < iv.x1 && iv.x0 < o.x1)) continue;
        rows[r].push(iv);
        out.push({ e: p.e, i: p.i, x: p.x, row: r });
        break;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts.map((p) => p.e.id + Math.round(p.x) + (p.future ? "f" : "")).join(), linked, rowsPerSide, labelW, size.w]);

  const R = { landmark: 6, major: 4.5, minor: 3 } as const;
  const ROW_H = 26;

  return (
    <div ref={ref} className="relative h-full w-full select-none overflow-hidden">
      {/* era boundaries */}
      {SEGS.map((s) => {
        const x = toX(s.x0);
        if (x < -10 || x > size.w) return null;
        return (
          <div key={s.era.id} className="pointer-events-none absolute inset-y-0 border-l border-line/70" style={{ left: x }}>
            <span className="absolute left-1.5 top-1.5 whitespace-nowrap font-display text-[9.5px] uppercase tracking-[0.16em] text-yellow/70">{s.era.name}</span>
          </div>
        );
      })}

      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <line x1={0} x2={size.w} y1={lineY} y2={lineY} stroke="#ffffffd9" strokeWidth={1.5} />
        {/* links from earlier events to the current one, drawn in */}
        {cur &&
          pts
            .filter((p) => !p.future && linked.has(p.e.id) && p.e.id !== cur.id)
            .map((p) => {
              const x2 = toX(yearToX(cur.sortYear));
              const mid = (p.x + x2) / 2;
              const lift = Math.min(lineY - 8, 18 + Math.abs(x2 - p.x) * 0.25);
              const d = `M${p.x},${lineY} Q${mid},${lineY - lift * 2} ${x2},${lineY}`;
              return <path key={cur.id + p.e.id} d={d} className="mt-arc" fill="none" stroke="#e9e9f2" strokeOpacity={0.8} strokeWidth={1.2} pathLength={1} />;
            })}
        {pts.map(({ e, x, future }) => {
          const c = isHidden(e) ? "#3a3a4a" : clusterById[e.cluster].color;
          const r = R[e.tier];
          const isCur = cur?.id === e.id;
          return (
            <g key={e.id} transform={`translate(${x},${lineY})`} opacity={future ? 0.35 : 1}>
              <g className={isCur ? "mt-pop" : undefined}>
                {isCur && <circle r={r + 7} fill="none" stroke="#fff" strokeWidth={1.5} />}
                {e.tier === "landmark" ? <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={future ? "none" : c} stroke={c} strokeWidth={1.5} /> : <circle r={r} fill={future ? "none" : c} stroke={c} strokeWidth={1.5} />}
              </g>
            </g>
          );
        })}
      </svg>

      {/* tap targets for every seen point */}
      {pts.map(({ e, i, x }) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Go to ${isHidden(e) ? "hidden spoiler" : e.title}, ${e.inWorldDate}`}
          title={isHidden(e) ? "Hidden spoiler" : e.title}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full hover:bg-white/10"
          style={{ left: x, top: lineY, width: 22, height: 22 }}
        />
      ))}

      {labels.map(({ e, i, x, row }) => {
        const side = row % 2 === 0 ? -1 : 1;
        const level = Math.floor(row / 2);
        const isCur = cur?.id === e.id;
        const top = side === -1 ? lineY - 14 - ROW_H * (level + 1) : lineY + 12 + ROW_H * level;
        const hid = isHidden(e);
        return (
          <button
            key={e.id}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(i)}
            className={`absolute text-center leading-tight hover:text-white ${isCur ? "mt-pop" : ""}`}
            style={{ left: x - labelW / 2, top, width: labelW, height: ROW_H }}
          >
            <span className={`line-clamp-2 font-display ${isCur ? "text-[11px] font-bold text-white" : "text-[10px] text-ink-2"}`}>{hid ? "Hidden spoiler" : e.title}</span>
          </button>
        );
      })}
    </div>
  );
}
