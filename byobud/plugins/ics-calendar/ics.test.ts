import assert from "node:assert/strict";
import { test } from "node:test";
import { agendaFrom } from "./ics.ts";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\n${body}\r\nEND:VCALENDAR\r\n`;
const from = new Date("2026-11-02T09:00:00Z");

test("reads a single event, unfolding long lines and unescaping text", () => {
  const events = agendaFrom(
    wrap("BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261103T180000Z\r\nDTEND:20261103T190000Z\r\nSUMMARY:Dinner\\, with\r\n  friends\r\nLOCATION:Home\r\nEND:VEVENT"),
    from,
    14,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, "Dinner, with friends");
  assert.equal(events[0].location, "Home");
  assert.equal(events[0].start, "2026-11-03T18:00:00.000Z");
});

test("all-day events keep a date with no time", () => {
  const [event] = agendaFrom(wrap("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261104\r\nSUMMARY:Bins\r\nEND:VEVENT"), from, 14);
  assert.equal(event.start, "2026-11-04");
});

test("leaves out what's over or too far away", () => {
  const events = agendaFrom(
    wrap("BEGIN:VEVENT\r\nDTSTART:20261001T100000Z\r\nDTEND:20261001T110000Z\r\nSUMMARY:Past\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20270101T100000Z\r\nSUMMARY:Far\r\nEND:VEVENT"),
    from,
    14,
  );
  assert.deepEqual(events, []);
});

test("expands weekly repeats on chosen days, skipping exceptions", () => {
  const events = agendaFrom(
    wrap("BEGIN:VEVENT\r\nUID:w\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T083000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEXDATE:20261104T080000Z\r\nSUMMARY:School run\r\nEND:VEVENT"),
    from,
    7,
  );
  assert.deepEqual(events.map(({ start }) => start.slice(0, 10)), ["2026-11-09"]);
});

test("stops at COUNT and UNTIL", () => {
  const count = agendaFrom(wrap("BEGIN:VEVENT\r\nDTSTART:20261102T120000Z\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:A\r\nEND:VEVENT"), from, 14);
  assert.equal(count.length, 2);
  const until = agendaFrom(wrap("BEGIN:VEVENT\r\nDTSTART:20261102T120000Z\r\nRRULE:FREQ=DAILY;UNTIL=20261104T120000Z\r\nSUMMARY:B\r\nEND:VEVENT"), from, 14);
  assert.equal(until.length, 3);
});

test("a local event keeps its clock time when the clocks change", () => {
  const [event] = agendaFrom(wrap("BEGIN:VEVENT\r\nDTSTART;TZID=Europe/London:20261012T090000\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:C\r\nEND:VEVENT"), new Date(2026, 10, 2, 0, 0), 7);
  assert.equal(new Date(event.start).getHours(), 9);
});
