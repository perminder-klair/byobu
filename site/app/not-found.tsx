import Link from "next/link";
import { Win } from "@/components/Win";

export default function NotFound() {
  return (
    <div className="lost">
      <Win title="404" number={1} focused>
        <h1>Nothing on this panel</h1>
        <p className="dim">That page isn&apos;t here. It may have moved.</p>
        <div className="cta">
          <Link className="button primary" href="/">Home</Link>
          <Link className="button" href="/manual/">Manual</Link>
        </div>
      </Win>
    </div>
  );
}
