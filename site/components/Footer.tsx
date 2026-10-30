import Link from "next/link";
import { GITHUB } from "@/lib/site";
import { Ridges } from "./Ridges";
import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="footer">
      <Ridges />
      <div className="footer-body">
        <div>
          <Wordmark />
          <p className="dim">A wall display OS for a Raspberry Pi with a touchscreen.</p>
        </div>
        <nav aria-label="Manual">
          <h2>manual</h2>
          <Link href="/manual/getting-started/">Getting started</Link>
          <Link href="/manual/faces/">Faces</Link>
          <Link href="/manual/writing-a-plugin/">Writing a plugin</Link>
          <Link href="/manual/troubleshooting/">Troubleshooting</Link>
        </nav>
        <nav aria-label="Project">
          <h2>project</h2>
          <a href={GITHUB}>Source</a>
          <a href={`${GITHUB}/issues`}>Issues</a>
        </nav>
        <p className="small dim">
          Byōbu is an independent project, not affiliated with Omarchy, Raspberry Pi, Home Assistant, Apple, Spotify or Anthropic. Omarchy&apos;s themes belong to their authors.
        </p>
      </div>
    </footer>
  );
}
