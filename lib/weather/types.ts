export interface WeatherForecast {
  venueId: string;
  forecastFor: string; // ISO timestamp of the forecast slot used
  temperatureC: number;
  condition: string;
  humidityPct: number;
  windSpeedKph: number;
  precipitationProbabilityPct: number;
}
