// Moves the current face between its far and near views. The layout changes once, then each
// window animates from where it was using only a transform, which the GPU runs by itself.
// Animating the layout, or a View Transition, drops frames on a Pi.
const DURATION = 350;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const currentWindows = () => [...document.querySelectorAll<HTMLElement>(".face[data-current] .win")];

export function morph(update: () => void) {
  const before = new Map(currentWindows().map((win) => [win, win.getBoundingClientRect()]));
  update();
  for (const win of currentWindows()) {
    const from = before.get(win);
    const to = win.getBoundingClientRect();
    if (!from || to.width === 0 || to.height === 0) continue;
    const start = {
      transformOrigin: "0 0",
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
    };
    win.animate([start, { transformOrigin: "0 0", transform: "none" }], { duration: DURATION, easing: EASING });
  }
  for (const element of document.querySelectorAll(".face[data-current] .near-only")) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: "ease-in" });
  }
}
