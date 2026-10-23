import SunCalc from 'suncalc';
import type { CityTimeOfDay } from './lighting.js';
export interface SolarCity {
  latitude: number;
  longitude: number;
  timeZone: string;
}
/** Anchor solar calculations to noon on the selected city's calendar date. */
function cityNoon(date: Date, city: SolarCity) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: city.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (value: Date) => formatter.formatToParts(value);
  const number = (values: Intl.DateTimeFormatPart[], type: string) =>
    Number(values.find((p) => p.type === type)!.value);
  const local = parts(date);
  const target = Date.UTC(
    number(local, 'year'),
    number(local, 'month') - 1,
    number(local, 'day'),
    12,
  );
  let instant = target;
  for (let pass = 0; pass < 3; pass++) {
    const current = parts(new Date(instant));
    const represented = Date.UTC(
      number(current, 'year'),
      number(current, 'month') - 1,
      number(current, 'day'),
      number(current, 'hour'),
      number(current, 'minute'),
      number(current, 'second'),
    );
    instant += target - represented;
  }
  return new Date(instant);
}
export function citySunTimes(date: Date, city: SolarCity) {
  const times = SunCalc.getTimes(cityNoon(date, city), city.latitude, city.longitude);
  return {
    sunrise: Number.isFinite(times.sunrise.getTime()) ? times.sunrise : null,
    sunset: Number.isFinite(times.sunset.getTime()) ? times.sunset : null,
  };
}
export function citySolarPhase(date: Date, city: SolarCity): CityTimeOfDay {
  const { sunrise, sunset } = citySunTimes(date, city);
  if (!sunrise || !sunset)
    return SunCalc.getPosition(date, city.latitude, city.longitude).altitude >=
      (-0.833 * Math.PI) / 180
      ? 'day'
      : 'night';
  const now = date.getTime(),
    rise = sunrise.getTime(),
    set = sunset.getTime(),
    minute = 60000;
  // Short days retain an actual day interval and never overlap morning/evening.
  const inner = Math.min(60 * minute, (set - rise) / 4);
  if (now < rise - 30 * minute || now >= set + 30 * minute) return 'night';
  if (now < rise + inner) return 'morning';
  if (now >= set - inner) return 'sunset';
  return 'day';
}
