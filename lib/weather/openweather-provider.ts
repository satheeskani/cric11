import type { WeatherForecast } from "./types";

/**
 * OpenWeatherMap free-tier "5 day / 3 hour" forecast endpoint. Good enough
 * for the 24-48h-ahead lookahead this app needs (match day pitch/weather
 * conditions), and the free quota (60 calls/min, 1M/month) is generous
 * enough to call on demand from a user request — unlike CricketData.org,
 * this does NOT need to be routed through the cron job.
 */
export async function fetchWeatherForecast(
  venueId: string,
  lat: number,
  lon: number,
  targetTime: Date,
): Promise<WeatherForecast | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("units", "metric");
  url.searchParams.set("appid", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`OpenWeatherMap request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const slots: any[] = data.list ?? [];
  if (slots.length === 0) return null;

  const targetMs = targetTime.getTime();
  const closest = slots.reduce((best, slot) => {
    const slotMs = slot.dt * 1000;
    const bestMs = best.dt * 1000;
    return Math.abs(slotMs - targetMs) < Math.abs(bestMs - targetMs) ? slot : best;
  }, slots[0]);

  return {
    venueId,
    forecastFor: new Date(closest.dt * 1000).toISOString(),
    temperatureC: closest.main?.temp ?? 0,
    condition: closest.weather?.[0]?.main ?? "Unknown",
    humidityPct: closest.main?.humidity ?? 0,
    windSpeedKph: Math.round((closest.wind?.speed ?? 0) * 3.6),
    precipitationProbabilityPct: Math.round((closest.pop ?? 0) * 100),
  };
}
