// Upcoming events from an iCalendar link, for homes that keep their calendar elsewhere.
import type { Plugin } from "../../src/plugin.ts";
import { agendaFrom } from "./ics.ts";

const DAYS = 14;
const REFRESH_MS = 15 * 60_000;
const RETRY_MS = 60_000;

const plugin: Plugin = (host) => {
  const link = String(host.settings.url ?? "").trim();
  if (!link) {
    host.status("off", "Needs a calendar link");
    return {};
  }
  const url = link.replace(/^webcal:/i, "https:");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function refresh() {
    let delay = REFRESH_MS;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`the calendar answered ${response.status}`);
      const text = await response.text();
      if (stopped) return;
      host.publish({ agenda: agendaFrom(text, new Date(), DAYS) });
      host.status("ok");
    } catch (error) {
      host.status("error", `Can't load the calendar: ${error instanceof Error ? error.message : error}`);
      delay = RETRY_MS;
    }
    if (!stopped) timer = setTimeout(refresh, delay);
  }
  refresh();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
};

export default plugin;
