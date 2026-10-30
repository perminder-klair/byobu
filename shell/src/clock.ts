// The time, in the language and time zone a plugin says, if one does. A wall clock has to work
// by itself, so otherwise this is the panel's own time, on a 24-hour clock.
import { useEffect, useState } from "react";
import type { Locale } from "./store";

export type Clock = { time: string; date: string; weekday: string; language: string; timeZone?: string };

export function useClock(locale?: Locale): Clock {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const nextMinute = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        nextMinute();
      }, 60_000 - (Date.now() % 60_000));
    };
    nextMinute();
    return () => window.clearTimeout(timer);
  }, []);

  const language = locale?.language ?? "en-GB";
  const timeZone = locale?.timeZone;
  const parts = new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", timeZone }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const date = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", timeZone });
  return {
    time: `${part("hour")}:${part("minute")}`,
    date: date.format(now).toLowerCase(),
    weekday: new Intl.DateTimeFormat(language, { weekday: "long", timeZone }).format(now).toLowerCase(),
    language,
    timeZone,
  };
}

// "18:30" for today, otherwise "fri 18:30". All-day events only have a date.
export function eventTime(start: string, { language, timeZone }: Clock): string {
  const allDay = !start.includes("T");
  const when = new Date(allDay ? `${start}T12:00:00` : start);
  const day = (date: Date) => date.toLocaleDateString(language, { timeZone });
  const today = day(when) === day(new Date());
  const weekday = when.toLocaleDateString(language, { weekday: "short", timeZone }).toLowerCase();
  if (allDay) return today ? "today" : weekday;
  const time = when.toLocaleTimeString(language, { hour: "numeric", minute: "2-digit", timeZone });
  return today ? time : `${weekday} ${time}`;
}
