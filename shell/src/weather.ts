// Weather conditions as words and icons.
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

// The conditions plugins report, which are Home Assistant's.
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

export const degrees = (value: number) => `${Math.round(value)}°`;
