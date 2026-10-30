// Big square digits on a 3 by 5 grid, like tty-clock: readable across a room, and as sharp-edged
// as the windows around them. CSS sizes them through --cell.
import type { CSSProperties } from "react";

const GLYPHS: Record<string, string> = {
  "0": "111101101101111",
  "1": "110010010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001001001001",
  "8": "111101111101111",
  "9": "111101111001111",
  ":": "01010",
  ".": "00001",
  "-": "000000111000000",
  "°": "1111000000",
};

function Glyph({ bits }: { bits: string }) {
  const columns = bits.length / 5;
  const cells = [...bits].map((bit, i) => (bit === "1" ? `M${i % columns} ${Math.floor(i / columns)}h1v1h-1z` : ""));
  return (
    <svg viewBox={`0 0 ${columns} 5`} style={{ "--columns": columns } as CSSProperties} aria-hidden="true">
      <path d={cells.join("")} />
    </svg>
  );
}

export function Blocks({ text }: { text: string }) {
  return (
    <span className="blocks" role="img" aria-label={text}>
      {[...text].map((char, i) => GLYPHS[char] && <Glyph key={i} bits={GLYPHS[char]} />)}
    </span>
  );
}
