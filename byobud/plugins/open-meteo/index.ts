// Weather from Open-Meteo: a plain web API with no key. A template for the simplest kind of
// plugin, which fetches something now and then and publishes it.
import type { Plugin } from "../../src/plugin.ts";
import type { Forecast, Weather } from "../../src/protocol.ts";

const REFRESH_MS = 15 * 60_000;
const RETRY_MS = 60_000;
const API = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes, as the conditions every plugin reports.
export function conditionFor(code: number, day = true): string {
  if (code === 0 || code === 1) return day ? "sunny" : "clear-night";
  if (code === 2) return "partlycloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "rainy";
  if (code === 66 || code === 67) return "snowy-rainy";
  if (code === 65 || code === 82) return "pouring";
  if ((code >= 61 && code <= 63) || code === 80 || code === 81) return "rainy";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snowy";
  if (code === 95) return "lightning-rainy";
  if (code === 96 || code === 99) return "hail";
  return "exceptional";
}

type Response = {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
};

export function weatherFrom({ current, hourly, daily }: Response, now = Date.now()): Weather {
  const hours: Forecast[] = hourly.time.map((time, i) => ({
    time,
    condition: conditionFor(hourly.weather_code[i]),
    temperature: hourly.temperature_2m[i],
    rainChance: hourly.precipitation_probability[i],
  }));
  const days: Forecast[] = daily.time.map((time, i) => ({
    time,
    condition: conditionFor(daily.weather_code[i]),
    temperature: daily.temperature_2m_max[i],
    low: daily.temperature_2m_min[i],
    rainChance: daily.precipitation_probability_max[i],
  }));
  return {
    condition: conditionFor(current.weather_code, current.is_day === 1),
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    // The API starts at midnight; only what's still to come is useful.
    hourly: hours.filter(({ time }) => Date.parse(time) >= now - 3600_000),
    daily: days,
  };
}

const plugin: Plugin = (host) => {
  const { latitude, longitude, unit } = host.settings as { latitude: string; longitude: string; unit: string };
  if (!latitude || !longitude) {
    host.status("off", "Needs a latitude and longitude");
    return {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const url = new URL(API);
  url.search = new URLSearchParams({
    latitude,
    longitude,
    temperature_unit: unit,
    timezone: "auto",
    forecast_days: "7",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  }).toString();

  async function refresh() {
    let delay = REFRESH_MS;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
      if (stopped) return;
      host.publish({ weather: weatherFrom(await response.json()) });
      host.status("ok");
    } catch (error) {
      host.status("error", `Can't get the weather: ${error instanceof Error ? error.message : error}`);
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
