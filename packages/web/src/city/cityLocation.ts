import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch } from '../api/apiFetch.js';
import type { SolarCity } from './citySolar.js';
import type { WeatherKind } from './weather.js';
export interface SelectedCity extends SolarCity {
  id: string;
  name: string;
  region: string;
  country: string;
}
export interface CitySearchResult {
  id: number;
  name: string;
  region: string;
  country: string;
}
export interface CityWeather {
  kind: WeatherKind;
  temperature: number;
  description: string;
  observedAt: string;
  fetchedAt: string;
}
export interface WeatherResult {
  status: 'fresh' | 'stale' | 'unavailable' | 'not_configured';
  weather: CityWeather | null;
}
export const profileCityKey = (owner: string | undefined) => ['profile-city', owner] as const;
export function useProfileCity(owner: string | undefined) {
  return useQuery({
    queryKey: profileCityKey(owner),
    queryFn: ({ signal }) => apiFetch<{ city: SelectedCity | null }>('/me/city', { signal }),
    enabled: Boolean(owner),
    staleTime: 60000,
    refetchInterval: 5 * 60000,
    retry: 1,
  });
}
export function useCityWeather(owner: string | undefined, city: SelectedCity | null | undefined) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['city-weather', owner, city?.id],
    queryFn: ({ signal }) =>
      apiFetch<WeatherResult>(`/me/weather?cityId=${encodeURIComponent(city!.id)}`, { signal }),
    enabled: Boolean(owner && city),
    staleTime: 30 * 60000,
    refetchInterval: 30 * 60000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (query.error && 'code' in query.error && query.error.code === 'city_changed')
      void client.invalidateQueries({ queryKey: profileCityKey(owner) });
  }, [query.error, owner, client]);
  return query;
}
export function validCityWeather(result: WeatherResult | undefined): CityWeather | null {
  const weather = result?.weather;
  if (!weather) return null;
  const age = Date.now() - Date.parse(weather.observedAt);
  return Number.isFinite(age) && age >= -5 * 60000 && age < 24 * 3600000 ? weather : null;
}
