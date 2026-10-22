import { describe, expect, it } from 'vitest';
import { citySolarPhase, citySunTimes } from './citySolar.js';
const moscow = { latitude: 55.7558, longitude: 37.6173, timeZone: 'Europe/Moscow' };
const vladivostok = { latitude: 43.1155, longitude: 131.8855, timeZone: 'Asia/Vladivostok' };
describe('selected city solar lighting', () => {
  it('uses actual sunrise and sunset with exact transition boundaries', () => {
    const date = new Date('2026-10-23T09:00:00Z');
    const { sunrise, sunset } = citySunTimes(date, moscow);
    expect(sunrise!.toISOString().slice(11, 13)).toBe('04');
    expect(sunset!.toISOString().slice(11, 13)).toBe('14');
    for (const [time, phase] of [
      [sunrise!.getTime() - 30 * 60000 - 1, 'night'],
      [sunrise!.getTime() - 30 * 60000, 'morning'],
      [sunrise!.getTime() + 60 * 60000, 'day'],
      [sunset!.getTime() - 60 * 60000, 'sunset'],
      [sunset!.getTime() + 30 * 60000, 'night'],
    ] as const) {
      expect(citySolarPhase(new Date(time), moscow)).toBe(phase);
    }
  });
  it('changes for city and season rather than device clock', () => {
    expect(citySolarPhase(new Date('2026-10-23T10:00:00Z'), moscow)).toBe('day');
    expect(citySolarPhase(new Date('2026-10-23T10:00:00Z'), vladivostok)).toBe('night');
    const winter = citySunTimes(new Date('2026-12-21T09:00:00Z'), moscow);
    const summer = citySunTimes(new Date('2026-06-21T09:00:00Z'), moscow);
    expect(summer.sunset!.getTime() - summer.sunrise!.getTime()).toBeGreaterThan(
      winter.sunset!.getTime() - winter.sunrise!.getTime(),
    );
  });
  it('handles the international date line using the actual city timezone', () => {
    const apia = { latitude: -13.8333, longitude: -171.75, timeZone: 'Pacific/Apia' };
    const date = new Date('2026-10-23T00:00:00Z');
    const times = citySunTimes(date, apia);
    const calendar = (value: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: apia.timeZone }).format(value);
    expect(calendar(times.sunrise!)).toBe(calendar(date));
    expect(calendar(times.sunset!)).toBe(calendar(date));
  });
  it('handles local dates across UTC midnight and polar conditions', () => {
    const a = citySunTimes(new Date('2026-10-22T23:00:00Z'), vladivostok);
    const b = citySunTimes(new Date('2026-10-23T03:00:00Z'), vladivostok);
    expect(a.sunrise).toEqual(b.sunrise);
    const polar = { latitude: 78.2232, longitude: 15.6469, timeZone: 'Arctic/Longyearbyen' };
    expect(citySolarPhase(new Date('2026-06-21T12:00:00Z'), polar)).toBe('day');
    expect(citySolarPhase(new Date('2026-12-21T12:00:00Z'), polar)).toBe('night');
  });
});
