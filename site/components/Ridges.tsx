// Mountains and a sun, the usual subject of a painted folding screen, in the current theme's
// colours.
import { discPath, ridgePath } from "@/lib/ridges";

const COLUMNS = 560;
const ROWS = 190;
const STRETCH = 1.75;

const ridge = (seed: number, base: number, height: number) => ridgePath({ seed, columns: COLUMNS, rows: ROWS, base, height, stretch: STRETCH });

export function Sun() {
  return (
    <svg className="sun" viewBox="0 0 36 36" aria-hidden="true">
      <path d={discPath(18, 18, 17)} />
    </svg>
  );
}

export function Ridges() {
  return (
    <svg className="ridges" viewBox={`0 0 ${COLUMNS} ${ROWS}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path className="far" d={ridge(1.2, 104, 30)} />
      <path className="middle" d={ridge(4.1, 130, 24)} />
      <path className="near" d={ridge(7.3, 156, 16)} />
    </svg>
  );
}
