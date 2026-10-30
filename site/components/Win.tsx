// A tiled window with its title notched into the border, as the shell draws them.
import type { ComponentProps } from "react";

type Title = { title?: string; number?: number; focused?: boolean };

export function Win({ title, number, focused, className, children, ...rest }: Title & ComponentProps<"div">) {
  return (
    <div className={["win", focused && "focused", className].filter(Boolean).join(" ")} {...rest}>
      {title && (
        <span className="win-title">
          {number != null && <b>{number}</b>}
          {title}
        </span>
      )}
      {children}
    </div>
  );
}
