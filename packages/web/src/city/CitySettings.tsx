import { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/apiFetch.js';
import {
  profileCityKey,
  useProfileCity,
  useCityWeather,
  validCityWeather,
  type SelectedCity,
  type CitySearchResult,
} from './cityLocation.js';
import { useCityClock } from './cityClock.js';
import { citySunTimes } from './citySolar.js';
import './city-settings.css';

export function CitySettings({ owner }: { owner: string | undefined }) {
  const client = useQueryClient();
  const now = useCityClock();
  const location = useProfileCity(owner),
    city = location.data?.city;
  const weatherQuery = useCityWeather(owner, city),
    weather = validCityWeather(weatherQuery.data);
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async (name: string | null) => {
      let cityId: string | null = null;
      if (name !== null) {
        const result = await apiFetch<{ cities: CitySearchResult[] }>(
          `/cities?q=${encodeURIComponent(name.trim())}`,
        );
        const found = result.cities[0];
        if (!found) throw new Error('city_not_found');
        cityId = String(found.id);
      }
      return apiFetch<{ city: SelectedCity | null }>('/me/city', {
        method: 'PUT',
        body: JSON.stringify({ cityId }),
      });
    },
    onSuccess: async (data) => {
      await client.cancelQueries({ queryKey: profileCityKey(owner) });
      client.setQueryData(profileCityKey(owner), data);
      setInput('');
      setSaved(true);
    },
  });
  const sun = city ? citySunTimes(now, city) : null;
  const time = (date: Date) =>
    new Intl.DateTimeFormat('ru', {
      timeZone: city!.timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  return (
    <section className="profile-city-section" aria-label="Город и погода">
      <div className="section-label">Город и погода</div>
      <div className="glass profile-city-settings">
        {location.isPending ? (
          <p role="status">Загружаем город…</p>
        ) : location.isError ? (
          <p role="alert">
            Не удалось загрузить город.{' '}
            <button type="button" className="btn" onClick={() => void location.refetch()}>
              Повторить
            </button>
          </p>
        ) : (
          <>
            <div className="profile-city-selected">
              <strong>{city?.name ?? 'Город не выбран'}</strong>
              {city && (
                <button
                  type="button"
                  className="icon-btn profile-city-reset"
                  aria-label="Сбросить город"
                  title="Сбросить город"
                  disabled={save.isPending}
                  onClick={() => save.mutate(null)}
                >
                  <X size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
              )}
            </div>
            {city && <p>{[city.region, city.country].filter(Boolean).join(', ')}</p>}
            <p>
              Погода и время суток на карте соответствуют выбранному городу. Город сохраняется в
              аккаунте.
            </p>
            {sun && (
              <p>
                {sun.sunrise && sun.sunset
                  ? `Восход ${time(sun.sunrise)} · Закат ${time(sun.sunset)}`
                  : 'Полярный день или полярная ночь: освещение определяется положением солнца.'}
              </p>
            )}
            {city && (
              <p role="status">
                {weather
                  ? `${weather.description}, ${Math.round(weather.temperature)} °C${weatherQuery.data?.status === 'stale' || weatherQuery.isError ? ' · Последние полученные данные' : ''}`
                  : weatherQuery.isPending
                    ? 'Загружаем погоду…'
                    : 'Погода временно недоступна. Время суток продолжает обновляться.'}
              </p>
            )}
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending && owner && input.trim().length >= 2) {
              setSaved(false);
              save.mutate(input.trim());
            }
          }}
        >
          <label htmlFor="profile-city-search">Найти город</label>
          <div className="profile-city-search-row">
            <input
              id="profile-city-search"
              type="text"
              autoComplete="off"
              maxLength={80}
              value={input}
              placeholder="Название города"
              onChange={(event) => {
                setInput(event.target.value);
                setSaved(false);
                save.reset();
              }}
              disabled={save.isPending}
            />
          </div>
          <button
            type="submit"
            className="btn btn--cta"
            disabled={!owner || input.trim().length < 2 || save.isPending}
          >
            {save.isPending ? 'Сохраняем…' : 'Сохранить город'}
          </button>
        </form>
        {save.isError && (
          <p role="alert">
            {save.error.message === 'city_not_found'
              ? 'Такой город не найден'
              : 'Не удалось сохранить город. Попробуйте ещё раз.'}
          </p>
        )}
        {saved && <p role="status">Город сохранён.</p>}
        {!city && !location.isPending && (
          <p>Пока город не выбран, время суток определяется по часам устройства.</p>
        )}
        <a href="https://www.weatherapi.com/" target="_blank" rel="noopener noreferrer">
          Источник погоды: WeatherAPI.com
        </a>
      </div>
    </section>
  );
}
