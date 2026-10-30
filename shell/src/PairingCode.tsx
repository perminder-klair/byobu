// The QR code a new phone scans. Codes last five minutes and work once.
import qrcode from "qrcode-generator";
import { useEffect, useState } from "react";
import type { Pairing } from "./store";

function modules(text: string) {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  const cells = Array.from({ length: size * size }, (_, i) => (code.isDark(Math.floor(i / size), i % size) ? `M${i % size} ${Math.floor(i / size)}h1v1h-1z` : ""));
  return { size, path: cells.join("") };
}

export function PairingCode() {
  const [pairing, setPairing] = useState<Pairing>();
  useEffect(() => {
    fetch("api/pairing", { method: "POST" })
      .then((response) => response.json())
      .then(setPairing)
      .catch(console.error);
  }, []);
  if (!pairing) return <div className="dim">Making a code…</div>;
  const { size, path } = modules(pairing.url);
  return (
    <div className="pairing">
      {/* Dark on light in every theme, with a margin, or phones can't read it. */}
      <svg viewBox={`-3 -3 ${size + 6} ${size + 6}`} role="img" aria-label="QR code to pair a phone">
        <rect x="-3" y="-3" width={size + 6} height={size + 6} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
      <div>
        <div>Scan this with your phone&apos;s camera.</div>
        <div className="dim">It must be on the same Wi-Fi as the panel. The code works once, for five minutes.</div>
        <div className="dim pairing-url">{pairing.url.split("#")[0]}</div>
      </div>
    </div>
  );
}
