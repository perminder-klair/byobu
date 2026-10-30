"use client";
// The time, as it sits in the panel's bar. Empty until the browser can say what it is.
import { useSyncExternalStore } from "react";

const FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" });

function subscribe(listener: () => void) {
  const timer = setInterval(listener, 1000);
  return () => clearInterval(timer);
}

const now = () => FORMAT.format(new Date()).replace(",", "").replace(" at", "").toLowerCase();

export function Clock() {
  const time = useSyncExternalStore(subscribe, now, () => "");
  return <div className="bar-time">{time}</div>;
}
