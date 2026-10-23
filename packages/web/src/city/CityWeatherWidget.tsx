import { Cloud, CloudFog, CloudHail, CloudOff, CloudRain, CloudSnow, Moon, Sun, Wind, type LucideIcon } from 'lucide-react';
import type { WeatherKind } from './weather.js';
import type { CityWeather } from './cityLocation.js';
import './city-weather-widget.css';
const icons: Record<WeatherKind, LucideIcon> = { clear: Sun, overcast: Cloud, rain: CloudRain, sleet: CloudHail, snow: CloudSnow, blizzard: Wind, fog: CloudFog };
export function CityWeatherWidget({
  cityName,
  weather,
  stale = false,
  loading = false,
  night = false,
}: {
  cityName: string;
  weather: CityWeather | null | undefined;
  stale?: boolean;
  loading?: boolean;
  night?: boolean;
}) {
  const Icon = weather ? (weather.kind === 'clear' && night ? Moon : icons[weather.kind]) : CloudOff;
  const temperature = weather
    ? `${new Intl.NumberFormat('ru', { signDisplay: 'exceptZero', maximumFractionDigits: 0 }).format(weather.temperature)}°`
    : '—';
  return (
    <aside className="city-weather-widget" aria-label={`Погода: ${cityName}`}>
      <strong className="city-weather-widget__city" title={cityName}>
        {cityName}
      </strong>
      <div className="city-weather-widget__reading">
        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        <span
          aria-label={weather ? `${Math.round(weather.temperature)} °C` : 'Температура недоступна'}
        >
          {temperature}
        </span>
      </div>
      <span className="city-weather-widget__description" title={weather?.description}>
        {weather?.description ?? (loading ? 'Загрузка…' : 'Нет данных')}
      </span>
      {stale && weather && (
        <span className="city-weather-widget__footer">Последние данные</span>
      )}
    </aside>
  );
}
