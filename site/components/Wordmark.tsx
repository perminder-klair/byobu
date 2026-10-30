// BYŌBU in the shell's big digits: letters on the same 3 by 5 grid as its clock, with a macron
// over the O.
const LETTERS = ["110101110101110", "101101010010010", "111101101101111", "110101110101110", "101101101101111"];
const COLUMNS = 3;
const TOP = 2;

const cells = LETTERS.flatMap((bits, letter) =>
  [...bits].flatMap((bit, i) => (bit === "1" ? `M${letter * (COLUMNS + 1) + (i % COLUMNS)} ${TOP + Math.floor(i / COLUMNS)}h1v1h-1z` : [])),
).join("");

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg className={["wordmark", className].filter(Boolean).join(" ")} viewBox="0 0 19 7" role="img" aria-label="Byōbu">
      <path d={cells} />
      <path className="macron" d="M8 0h3v1H8z" />
    </svg>
  );
}
