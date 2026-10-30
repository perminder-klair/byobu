// A tiled window with its title notched into the border, like btop's panels.
import type { ComponentProps } from "react";

type Title = { title?: string; number?: number; focused?: boolean };

function classes({ focused }: Title, className?: string) {
  return ["win", focused && "focused", className].filter(Boolean).join(" ");
}

function WinTitle({ title, number }: Title) {
  if (!title) return null;
  return (
    <span className="win-title">
      {number != null && <b>{number}</b>}
      {title}
    </span>
  );
}

export function Win({ title, number, focused, className, children, ...rest }: Title & ComponentProps<"div">) {
  return (
    <div className={classes({ focused }, className)} {...rest}>
      <WinTitle title={title} number={number} />
      {children}
    </div>
  );
}

export function WinButton({ title, number, focused, className, children, ...rest }: Title & ComponentProps<"button">) {
  return (
    <button className={classes({ focused }, className)} {...rest}>
      <WinTitle title={title} number={number} />
      {children}
    </button>
  );
}
