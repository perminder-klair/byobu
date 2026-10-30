"use client";
// Every Omarchy theme, with a real shot of the panel in it. Choosing one also recolours this page,
// which is what the panel does too.
import Image from "next/image";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_KEY } from "@/lib/theme";
import { THEMES } from "@/lib/themes";
import { Win } from "./Win";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = () => document.documentElement.dataset.theme ?? DEFAULT_THEME;

function choose(id: string) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // Private windows can refuse. It still applies to this page.
  }
  for (const listener of listeners) listener();
}

export function ThemePicker() {
  const selected = useSyncExternalStore(subscribe, current, () => DEFAULT_THEME);
  const theme = THEMES.find(({ id }) => id === selected) ?? THEMES[0];
  return (
    <div className="tiled">
      <Win title={theme.name.toLowerCase()} number={1} focused className="shot span-8">
        <Image
          key={theme.id}
          src={`/shots/themes/${theme.id}.webp`}
          alt={`The Modular face in the ${theme.name} theme.`}
          width={1280}
          height={720}
          sizes="(min-width: 900px) 820px, 100vw"
          quality={85}
        />
      </Win>
      <Win title="themes" number={2} className="span-4 theme-list">
        <div className="theme-buttons" role="group" aria-label="Theme">
          {THEMES.map(({ id, name, swatch }) => (
            <button key={id} aria-pressed={id === theme.id} onClick={() => choose(id)}>
              <span className="swatch" aria-hidden="true">
                {swatch.map((colour, i) => (
                  <i key={i} style={{ background: colour }} />
                ))}
              </span>
              {name}
            </button>
          ))}
        </div>
      </Win>
    </div>
  );
}
