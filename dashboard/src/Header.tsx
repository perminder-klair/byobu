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
import { useEffect, useState } from "react";
import { entityName, locale, type HassConfig, type HassEntity } from "./hass";
import { Icon } from "./Icon";

// Home Assistant's weather conditions.
const CONDITIONS: Record<string, [icon: string, label: string]> = {
  "clear-night": [mdiWeatherNight, "Clear"],
  cloudy: [mdiWeatherCloudy, "Cloudy"],
  exceptional: [mdiAlertCircleOutline, "Severe weather"],
  fog: [mdiWeatherFog, "Fog"],
  hail: [mdiWeatherHail, "Hail"],
  lightning: [mdiWeatherLightning, "Lightning"],
  "lightning-rainy": [mdiWeatherLightningRainy, "Thunderstorms"],
  partlycloudy: [mdiWeatherPartlyCloudy, "Partly cloudy"],
  pouring: [mdiWeatherPouring, "Heavy rain"],
  rainy: [mdiWeatherRainy, "Rain"],
  snowy: [mdiWeatherSnowy, "Snow"],
  "snowy-rainy": [mdiWeatherSnowyRainy, "Sleet"],
  sunny: [mdiWeatherSunny, "Sunny"],
  windy: [mdiWeatherWindy, "Windy"],
  "windy-variant": [mdiWeatherWindyVariant, "Windy"],
};

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Header({ config, weather }: { config?: HassConfig; weather?: HassEntity }) {
  const now = useNow();
  const format = { timeZone: config?.time_zone };
  return (
    <header>
      <div>
        <div className="time">
          {now.toLocaleTimeString(locale(config), { ...format, hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="date">
          {now.toLocaleDateString(locale(config), { ...format, weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>
      {weather && <Weather entity={weather} />}
    </header>
  );
}

function Weather({ entity }: { entity: HassEntity }) {
  const [icon, label] = CONDITIONS[entity.state] ?? [mdiWeatherPartlyCloudy, entity.state];
  const { temperature, temperature_unit } = entity.attributes;
  return (
    <div className="weather">
      <div>
        {temperature != null && <div className="temperature">{Math.round(temperature)}{temperature_unit}</div>}
        <div className="condition">{label} · {entityName(entity)}</div>
      </div>
      <Icon path={icon} />
    </div>
  );
}
