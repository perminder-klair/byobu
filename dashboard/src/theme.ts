// The palette is theme.css next to the page rather than part of the build, so a panel can
// change theme without a rebuild. In development it follows the desktop's Omarchy theme live.
let current: HTMLLinkElement | undefined;

export function loadTheme() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `theme.css?v=${Date.now()}`;
  // Swap only once the new sheet is in, so the page never flashes the fallback palette.
  link.onload = () => {
    current?.remove();
    current = link;
  };
  link.onerror = () => link.remove();
  document.head.append(link);
}

import.meta.hot?.on("byobu:theme", loadTheme);
