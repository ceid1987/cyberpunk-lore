"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clusters, clusterById, eras, events, eventById, startHere, type Media, type SpoilerLevel } from "@/data";
import { activeFilterCount, useFilteredEvents, useIsHidden, useStore, usePrefersReducedMotion, type Filters } from "@/lib/store";
import { ClusterIcon, Icon, MEDIA_LABEL, SPOILER_LABEL } from "./ui";

function Panel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-bg/97 backdrop-blur-md"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.2 }}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="flex-1 font-display text-base font-bold uppercase tracking-[0.16em] text-yellow">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-md text-ink-2 hover:text-ink">
          <Icon name="close" />
        </button>
      </div>
      <div className="cp-scroll flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
      {footer && (
        <div className="border-t border-line px-4 py-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          {footer}
        </div>
      )}
    </motion.div>
  );
}

export default function Panels() {
  const { state, dispatch } = useStore();
  const close = () => dispatch({ type: "panel", panel: null });
  return (
    <AnimatePresence>
      {state.panel === "search" && <SearchPanel key="search" onClose={close} />}
      {state.panel === "filters" && <FiltersPanel key="filters" onClose={close} />}
      {state.panel === "start" && <StartPanel key="start" onClose={close} />}
      {state.panel === "about" && <AboutPanel key="about" onClose={close} />}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- search
function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const INDEX = events.map((e) => ({ e, title: normalize(e.title), body: normalize(`${e.summary} ${e.whyItMatters} ${e.inWorldDate}`) }));

function SearchPanel({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const isHidden = useIsHidden();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return INDEX.map(({ e, title, body }) => {
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += title.startsWith(t) ? 6 : 4;
        else if (body.includes(t)) score += 1;
        else if (/^\d{4}$/.test(t) && Math.floor(e.sortYear) === Number(t)) score += 5;
        else return null;
      }
      score += e.tier === "landmark" ? 1.5 : e.tier === "major" ? 0.7 : 0;
      return { e, score };
    })
      .filter((r): r is { e: (typeof events)[number]; score: number } => !!r)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
  }, [q]);

  return (
    <Panel title="Search" onClose={onClose}>
      <label className="block">
        <span className="sr-only">Search events</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Arasaka, 2023, Smasher, braindance…"
          className="h-12 w-full rounded-md border border-line bg-panel px-3 text-base text-ink placeholder:text-ink-3 focus:border-cyan focus:outline-none"
          inputMode="search"
          enterKeyHint="search"
        />
      </label>
      <p className="mt-2 text-xs text-ink-3" aria-live="polite">
        {q ? `${results.length} result${results.length === 1 ? "" : "s"}` : `Search all ${events.length} events by name, year or keyword.`}
      </p>
      <ul className="mt-2 divide-y divide-line">
        {results.map(({ e }) => {
          const c = clusterById[e.cluster];
          const hidden = isHidden(e);
          return (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 py-3 text-left"
                onClick={() => {
                  onClose();
                  dispatch({ type: "select", id: e.id, pathIndex: null });
                }}
              >
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: c.color }} aria-hidden />
                <span className="flex-1">
                  <span className="block font-display text-[11px] uppercase tracking-wider text-ink-3">
                    {e.inWorldDate} · {c.short}
                  </span>
                  <span className={`block text-[15px] leading-snug text-ink ${hidden ? "spoiler-blur" : ""}`}>{e.title}</span>
                  {hidden && <span className="text-xs text-magenta">2077 spoiler</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- filters
function Chip({ on, onClick, color = "#05d9e8", children }: { on: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="min-h-10 rounded-md border px-3 py-1.5 text-left text-[13px] leading-tight transition-colors"
      style={{ borderColor: on ? color : "#262636", background: on ? color + "1f" : "transparent", color: on ? color : "#a9a9c0" }}
    >
      {children}
    </button>
  );
}

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FiltersPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const f = state.filters;
  const set = (p: Partial<Filters>) => dispatch({ type: "filters", filters: p });
  const n = useFilteredEvents().length;
  return (
    <Panel
      title="Filters"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => dispatch({ type: "clearFilters" })} disabled={!activeFilterCount(f)} className="h-11 rounded-md border border-line px-4 font-display text-sm uppercase tracking-wider text-ink-2 disabled:opacity-40">
            Clear
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-md bg-cyan font-display text-sm font-bold uppercase tracking-wider text-bg">
            Show {n} events
          </button>
        </div>
      }
    >
      <Section title="Theme">
        {clusters.map((c) => (
          <Chip key={c.id} on={f.clusters.includes(c.id)} color={c.color} onClick={() => set({ clusters: toggle(f.clusters, c.id) })}>
            <span className="inline-flex items-center gap-1.5">
              <ClusterIcon id={c.id} size={14} color={f.clusters.includes(c.id) ? c.color : "#74748c"} />
              {c.name}
            </span>
          </Chip>
        ))}
      </Section>
      <Section title="Era">
        {eras.map((e) => (
          <Chip key={e.id} on={f.eras.includes(e.id)} onClick={() => set({ eras: toggle(f.eras, e.id) })}>
            {e.name}
          </Chip>
        ))}
      </Section>
      <Section title="Appears in">
        {(Object.keys(MEDIA_LABEL) as Media[]).map((m) => (
          <Chip key={m} on={f.media.includes(m)} color="#fcee0a" onClick={() => set({ media: toggle(f.media, m) })}>
            {MEDIA_LABEL[m]}
          </Chip>
        ))}
      </Section>
      <Section title="Type">
        {(["world", "game-spoiler"] as SpoilerLevel[]).map((s) => (
          <Chip key={s} on={f.spoilers.includes(s)} color="#ff2a6d" onClick={() => set({ spoilers: toggle(f.spoilers, s) })}>
            {SPOILER_LABEL[s]}
          </Chip>
        ))}
      </Section>
      <Section title="Display">
        <Chip on={state.showImages} color="#05d9e8" onClick={() => dispatch({ type: "showImages", value: !state.showImages })}>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="image" size={14} /> Wiki images {state.showImages ? "on" : "off"}
          </span>
        </Chip>
      </Section>
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 font-display text-[11px] uppercase tracking-[0.18em] text-ink-3">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- start here
function StartPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const go = (i: number) => {
    onClose();
    dispatch({ type: "select", id: startHere[i].id, pathIndex: i });
  };
  return (
    <Panel
      title="Start here"
      onClose={onClose}
      footer={
        <button type="button" onClick={() => go(0)} className="h-11 w-full rounded-md bg-yellow font-display text-sm font-bold uppercase tracking-wider text-bg">
          Begin the path
        </button>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink-2">
        {startHere.length} key events, from the founding of Night City to the opening of Cyberpunk 2077.
      </p>
      <ol className="mt-4 space-y-1">
        {startHere.map((s, i) => {
          const e = eventById[s.id];
          const c = clusterById[e.cluster];
          const seen = state.viewed.includes(e.id);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => go(i)} className="flex w-full items-start gap-3 rounded-md px-1 py-2.5 text-left hover:bg-white/5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sm border font-display text-xs font-bold" style={{ borderColor: c.color, color: seen ? "#07070b" : c.color, background: seen ? c.color : "transparent" }}>
                  {seen ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span>
                  <span className="block font-display text-[11px] uppercase tracking-wider text-ink-3">{e.inWorldDate}</span>
                  <span className="block text-[15px] font-medium leading-snug text-ink">{e.title}</span>
                  <span className="block text-[13px] leading-snug text-ink-2">{s.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

// ---------------------------------------------------------------- about
function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="About" onClose={onClose}>
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-2">
        <p>
          <strong className="text-ink">Cyberpunk Lore</strong> is a free, non-commercial fan project: a map of the Cyberpunk world for friends who have seen <em>Cyberpunk: Edgerunners</em> but not played <em>Cyberpunk 2077</em>.
        </p>
        <p>
          Every event is written in our own words from the{" "}
          <a className="text-cyan underline" href="https://cyberpunk.fandom.com/wiki/Timeline" target="_blank" rel="noopener noreferrer">
            Cyberpunk Wiki
          </a>{" "}
          and links back to its source page.
        </p>
        <h3 className="font-display text-xs uppercase tracking-[0.18em] text-yellow">Controls</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Timeline: drag to move, pinch or scroll to zoom. More events and larger cards appear as the zoom increases.</li>
          <li>Map: tap a theme bubble to open it, then a hexagon to open a group. Museum mode steps through every event in order.</li>
          <li>Event details: swipe sideways for the previous or next event.</li>
          <li>The eye button hides or shows 2077 and Phantom Liberty spoilers.</li>
        </ul>
        <h3 className="font-display text-xs uppercase tracking-[0.18em] text-yellow">Attribution and licensing</h3>
        <p className="text-sm">
          Event text is adapted from the Cyberpunk Wiki on Fandom, available under{" "}
          <a className="text-cyan underline" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">
            CC BY-SA 3.0
          </a>
          . Adapted content is shared under the same license.
        </p>
        <p className="text-sm">
          Images are loaded directly from the Cyberpunk Wiki and remain the property of their respective owners (mostly CD Projekt Red, R. Talsorian Games and Netflix). Each is credited and linked to its wiki file page, and they can be switched off in Filters → Display.
        </p>
        <p className="text-sm">
          Cyberpunk, Cyberpunk 2077, Cyberpunk: Edgerunners and related names are trademarks of CD Projekt S.A., R. Talsorian Games and/or Netflix. This project is not affiliated with or endorsed by any of them, and uses no official art, logos or images.
        </p>
      </div>
    </Panel>
  );
}
