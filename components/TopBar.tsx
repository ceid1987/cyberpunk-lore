"use client";

import { useStore } from "@/lib/store";

/** Title bar. Hidden in fullscreen. Tapping the title opens About (sources and credits). */
export default function TopBar() {
  const { dispatch } = useStore();
  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-bg" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex h-14 items-center justify-center px-3">
        <button type="button" onClick={() => dispatch({ type: "panel", panel: "about" })} aria-label="Cyberpunk Lore: about this app" className="text-center">
          <span className="cp-glitch block whitespace-nowrap font-display text-[16px] font-bold uppercase leading-none tracking-[0.1em] text-yellow" data-text="Cyberpunk Lore">
            Cyberpunk Lore
          </span>
          <span className="mt-1 block font-display text-[9px] uppercase tracking-[0.42em] text-ink-3">1859 · 2095</span>
        </button>
      </div>
    </header>
  );
}
