// Weather conditions as words and icons, and which weather entity speaks for the home.
import {
  mdiAlertCircleOutline,
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherHail,
  mdiWeatherLightning,
  mdiWeatherLightningRainy,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherPouring,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSnowyRainy,
  mdiWeatherSunny,
  mdiWeatherWindy,
  mdiWeatherWindyVariant,
} from "@mdi/js";
import { entityName, type Hass, type HassEntity } from "./hass";

// Home Assistant's weather conditions.
export const CONDITIONS: Record<string, [icon: string, label: string]> = {
  "clear-night": [mdiWeatherNight, "clear"],
  cloudy: [mdiWeatherCloudy, "cloudy"],
  exceptional: [mdiAlertCircleOutline, "severe weather"],
  fog: [mdiWeatherFog, "fog"],
  hail: [mdiWeatherHail, "hail"],
  lightning: [mdiWeatherLightning, "lightning"],
  "lightning-rainy": [mdiWeatherLightningRainy, "thunderstorms"],
  partlycloudy: [mdiWeatherPartlyCloudy, "partly cloudy"],
  pouring: [mdiWeatherPouring, "heavy rain"],
  rainy: [mdiWeatherRainy, "rain"],
  snowy: [mdiWeatherSnowy, "snow"],
  "snowy-rainy": [mdiWeatherSnowyRainy, "sleet"],
  sunny: [mdiWeatherSunny, "sunny"],
  windy: [mdiWeatherWindy, "windy"],
  "windy-variant": [mdiWeatherWindyVariant, "windy"],
};

export const condition = (state: string) => CONDITIONS[state] ?? [mdiAlertCircleOutline, state];

// Home Assistant's default forecast for the home, if it's there, or the first by name.
export function homeWeather(hass: Hass): HassEntity | undefined {
  const all = Object.values(hass.entities).filter((entity) => entity.entity_id.startsWith("weather."));
  return (
    all.find((entity) => entity.entity_id === "weather.forecast_home") ??
    all.sort((a, b) => entityName(a).localeCompare(entityName(b)))[0]
  );
}

export const degrees = (value: number) => `${Math.round(value)}°`;
