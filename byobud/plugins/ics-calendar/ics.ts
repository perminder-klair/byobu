// Reads the parts of iCalendar a wall needs: events, their times, and the repeats real calendars
// use. Times with a TZID are taken as the panel's own zone, which is nearly always the same one.
import type { AgendaEvent } from "../../src/protocol.ts";

const MAX_REPEATS = 2000;
const DAY_NAMES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Property = { name: string; params: string; value: string };
type Time = { date: Date; allDay: boolean; utc: boolean };

function properties(text: string): Property[] {
  // A line starting with a space continues the one before.
  const unfolded = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  return unfolded.flatMap((line) => {
    const match = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    return match ? [{ name: match[1], params: match[2], value: match[3] }] : [];
  });
}

const unescape = (text: string) => text.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

function parseTime({ params, value }: Property): Time {
  const parts = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!parts) return { date: new Date(NaN), allDay: false, utc: false };
  const [, y, mo, d, h = "0", mi = "0", s = "0", utc] = parts;
  const fields = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const;
  return {
    date: utc ? new Date(Date.UTC(...fields)) : new Date(...fields),
    allDay: params.includes("VALUE=DATE") || parts[4] === undefined,
    utc: Boolean(utc),
  };
}

function formatTime({ date, allDay }: Time): string {
  if (!allDay) return date.toISOString();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A time's year to second, and back. A repeat keeps its clock time in the zone it was written in,
// so that a local event stays at 09:00 when the clocks change and one in UTC stays at 09:00 UTC.
function clockOf(date: Date, utc: boolean): number[] {
  return utc
    ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    : [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
}

function dateOf([y, mo, d, h, mi, s]: number[], utc: boolean): Date {
  return utc ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
}

// Every start of a repeating event up to the end of the window.
function repeats({ date: start, utc }: Time, rule: string, until: Date): Date[] {
  const fields = Object.fromEntries(rule.split(";").map((pair) => pair.split("=")));
  const interval = Number(fields.INTERVAL ?? 1);
  const count = fields.COUNT ? Number(fields.COUNT) : Infinity;
  const end = fields.UNTIL ? parseTime({ name: "UNTIL", params: "", value: fields.UNTIL }).date : until;
  const days: number[] | undefined = fields.BYDAY?.split(",").map((day: string) => DAY_NAMES.indexOf(day.slice(-2)));
  const limit = end < until ? end : until;
  const [y, mo, d, ...time] = clockOf(start, utc);
  const found: Date[] = [];
  for (let period = 0; found.length < count && period < MAX_REPEATS; period++) {
    const step = period * interval;
    const candidates: Date[] = [];
    if (fields.FREQ === "DAILY") candidates.push(dateOf([y, mo, d + step, ...time], utc));
    else if (fields.FREQ === "MONTHLY") candidates.push(dateOf([y, mo + step, d, ...time], utc));
    else if (fields.FREQ === "YEARLY") candidates.push(dateOf([y + step, mo, d, ...time], utc));
    else if (fields.FREQ === "WEEKLY") {
      const week = dateOf([y, mo, d + step * 7, ...time], utc);
      const weekday = utc ? week.getUTCDay() : week.getDay();
      for (const day of days ?? [weekday]) {
        const date = dateOf([y, mo, d + step * 7 - weekday + day, ...time], utc);
        if (date >= start) candidates.push(date);
      }
    } else return [start];
    for (const date of candidates.sort((a, b) => +a - +b)) {
      if (date > limit || found.length >= count) return found;
      found.push(date);
    }
  }
  return found;
}

export function agendaFrom(text: string, from: Date, days: number): AgendaEvent[] {
  const until = new Date(from.getTime() + days * 24 * 3600_000);
  const events: AgendaEvent[] = [];
  let current: Property[] | undefined;
  for (const property of properties(text)) {
    if (property.name === "BEGIN" && property.value === "VEVENT") current = [];
    else if (property.name === "END" && property.value === "VEVENT" && current) {
      const get = (name: string) => current?.find((item) => item.name === name);
      const startProperty = get("DTSTART");
      const summary = unescape(get("SUMMARY")?.value ?? "Busy");
      if (startProperty) {
        const start = parseTime(startProperty);
        const endProperty = get("DTEND");
        const length = endProperty ? parseTime(endProperty).date.getTime() - start.date.getTime() : 0;
        const excluded = new Set(
          current.filter(({ name }) => name === "EXDATE").flatMap(({ params, value }) =>
            value.split(",").map((one) => parseTime({ name: "EXDATE", params, value: one }).date.getTime()),
          ),
        );
        const rule = get("RRULE")?.value;
        for (const date of rule ? repeats(start, rule, until) : [start.date]) {
          const ends = new Date(date.getTime() + length);
          if (excluded.has(date.getTime()) || date > until || (ends < from && date < from)) continue;
          events.push({
            id: `${get("UID")?.value ?? summary}/${date.toISOString()}`,
            start: formatTime({ ...start, date }),
            end: formatTime({ ...start, date: ends }),
            summary,
            location: get("LOCATION") && unescape(get("LOCATION")?.value ?? ""),
          });
        }
      }
      current = undefined;
    } else current?.push(property);
  }
  return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
