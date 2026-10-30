import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionFor, weatherFrom } from "./index.ts";

test("maps WMO codes to the shared conditions", () => {
  assert.equal(conditionFor(0), "sunny");
  assert.equal(conditionFor(0, false), "clear-night");
  assert.equal(conditionFor(3), "cloudy");
  assert.equal(conditionFor(63), "rainy");
  assert.equal(conditionFor(65), "pouring");
  assert.equal(conditionFor(73), "snowy");
  assert.equal(conditionFor(95), "lightning-rainy");
});

test("keeps only hours still to come", () => {
  const weather = weatherFrom(
    {
      current: { temperature_2m: 12.4, apparent_temperature: 10, relative_humidity_2m: 80, weather_code: 61, is_day: 1 },
      hourly: { time: ["2026-11-02T08:00", "2026-11-02T12:00"], temperature_2m: [9, 12], precipitation_probability: [0, 40], weather_code: [3, 61] },
      daily: { time: ["2026-11-02"], weather_code: [61], temperature_2m_max: [13], temperature_2m_min: [7], precipitation_probability_max: [60] },
    },
    Date.parse("2026-11-02T11:30"),
  );
  assert.equal(weather.condition, "rainy");
  assert.equal(weather.hourly.length, 1);
  assert.equal(weather.hourly[0].rainChance, 40);
  assert.equal(weather.daily[0].low, 7);
});
