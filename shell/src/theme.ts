// The palette and wallpaper sit next to the page rather than in the build, so a panel can change
// theme without a rebuild. In development they follow the desktop's Omarchy theme live.
let current: HTMLLinkElement | undefined;

export function loadTheme() {
  const version = Date.now();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `theme.css?v=${version}`;
  // Swap only once the new sheet is in, so the page never flashes the fallback palette.
  link.onload = () => {
    current?.remove();
    current = link;
  };
  link.onerror = () => link.remove();
  document.head.append(link);
  // Absolute, or it would resolve against the built stylesheet's folder rather than the page's.
  const wallpaper = new URL(`wallpaper.jpg?v=${version}`, location.href);
  document.documentElement.style.setProperty("--wallpaper", `url("${wallpaper}")`);
}

import.meta.hot?.on("byobu:theme", loadTheme);
