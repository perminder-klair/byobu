// Mountains made of blocks, the site's own backdrop and the wallpaper in its screenshots. Sums of
// slow waves make a skyline, and rounding to whole cells gives it steps. No randomness, so the
// server and the browser always draw the same thing.
export type Ridge = { seed: number; columns: number; rows: number; base: number; height: number; stretch?: number };

export function ridgePath({ seed, columns, rows, base, height, stretch = 1 }: Ridge): string {
  let path = `M0 ${rows}`;
  for (let column = 0; column < columns; column++) {
    const x = column / stretch;
    const wave = Math.sin(x * 0.031 + seed) * 0.5 + Math.sin(x * 0.083 + seed * 2.3) * 0.32 + Math.sin(x * 0.21 + seed * 0.7) * 0.18;
    path += `V${Math.round(base - wave * height)}h1`;
  }
  return `${path}V${rows}Z`;
}

// A sun of blocks, to hang over them.
export function discPath(cx: number, cy: number, radius: number): string {
  let path = "";
  for (let y = -radius; y < radius; y++) {
    const half = Math.round(Math.sqrt((radius + 0.5) ** 2 - (y + 0.5) ** 2));
    path += `M${cx - half} ${cy + y}h${half * 2}v1h${-half * 2}z`;
  }
  return path;
}
