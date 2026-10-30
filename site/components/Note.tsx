import type { ReactNode } from "react";
import { Win } from "./Win";

export function Note({ title = "note", children }: { title?: string; children: ReactNode }) {
  return (
    <Win title={title} focused className="note">
      {children}
    </Win>
  );
}
