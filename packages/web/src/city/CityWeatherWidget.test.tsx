import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CityWeatherWidget } from './CityWeatherWidget.js';
import type { CityWeather } from './cityLocation.js';
const weather: CityWeather = {
  kind: 'rain',
  temperature: 8.4,
  description: 'Небольшой дождь',
  observedAt: new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
};
it('shows a compact city reading without a source label', () => {
  render(<CityWeatherWidget cityName="Петрозаводск" weather={weather} />);
  expect(screen.getByRole('complementary', { name: 'Погода: Петрозаводск' })).toHaveTextContent(
    '+8°',
  );
  expect(screen.getByText('Небольшой дождь')).toBeVisible();
  expect(screen.queryByText('WeatherAPI')).toBeNull();
});
it('distinguishes loading, unavailable and stale weather without inventing a temperature', () => {
  const view = render(<CityWeatherWidget cityName="Москва" weather={null} loading />);
  expect(screen.getByText('Загрузка…')).toBeVisible();
  view.rerender(<CityWeatherWidget cityName="Москва" weather={null} />);
  expect(screen.getByText('Нет данных')).toBeVisible();
  expect(screen.queryByText('+8°')).toBeNull();
  view.rerender(<CityWeatherWidget cityName="Москва" weather={weather} stale />);
  expect(screen.getByText('Последние данные')).toBeVisible();
});
