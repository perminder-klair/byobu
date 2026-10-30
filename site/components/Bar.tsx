// The site's navigation, drawn like the thin bar along the top of the panel.
import Link from "next/link";
import { GITHUB } from "@/lib/site";
import { Clock } from "./Clock";
import { Mark } from "./Mark";

export function Bar() {
  return (
    <header className="bar">
      <nav className="bar-links" aria-label="Main">
        <Link className="bar-home" href="/" aria-label="Byōbu home">
          <Mark />
          <span>byōbu</span>
        </Link>
        <Link href="/manual/">manual</Link>
        <Link className="wide-only" href="/#plugins">plugins</Link>
        <Link className="wide-only" href="/#themes">themes</Link>
      </nav>
      <Clock />
      <div className="tray">
        <a className="wide-only" href={GITHUB}>github</a>
        <Link className="button small" href="/#build">build it</Link>
      </div>
    </header>
  );
}
