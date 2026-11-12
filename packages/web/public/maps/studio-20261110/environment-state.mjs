export const TIME_LABELS = { auto: 'Авто · местное время', morning: 'Утро', day: 'День', sunset: 'Закат', night: 'Ночь' };
export const WEATHER_LABELS = { clear: 'Ясно', overcast: 'Пасмурно', snow: 'Снег', blizzard: 'Метель', fog: 'Туман', rain: 'Дождь', sleet: 'Дождь со снегом' };
export const LIGHT_LABELS = { auto: 'Автоматически', on: 'Включён', off: 'Выключен' };

export function environmentSettings(value = {}) {
  return {
    time: Object.hasOwn(TIME_LABELS, value?.time) ? value.time : 'day',
    weather: Object.hasOwn(WEATHER_LABELS, value?.weather) ? value.weather : 'clear',
    lights: Object.hasOwn(LIGHT_LABELS, value?.lights) ? value.lights : 'auto'
  };
}

// Same local-time fallback intervals as the game's city/lighting.ts.
export function environmentPhase(value, date = new Date()) {
  const settings = environmentSettings(value);
  if (settings.time !== 'auto') return settings.time;
  const hour = date.getHours();
  if (hour >= 7 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 18) return 'day';
  if (hour === 18 || (hour === 19 && date.getMinutes() < 30)) return 'sunset';
  return 'night';
}

export function lightAmount(environment, item = {}, date) {
  const settings = environmentSettings(environment);
  if (settings.lights === 'off' || item.lightMode === 'off') return 0;
  if (settings.lights === 'on' || item.lightMode === 'on') return 1;
  const phase = environmentPhase(settings, date);
  return { morning: 0, day: 0, sunset: 0.72, night: 1 }[phase];
}

export function spriteFilter(environment, date) {
  const phase = environmentPhase(environment, date);
  return {
    morning: 'brightness(0.90) saturate(0.82)',
    day: 'none',
    sunset: 'brightness(0.63) sepia(0.12) saturate(0.86)',
    night: 'brightness(0.65) saturate(0.78)'
  }[phase];
}

export function projectRegion(item, asset, region) {
  const [left, top, right, bottom] = asset.bbox;
  return region.map(([u, v]) => [
    (item.x + item.w * (u * asset.size[0] - left) / (right - left)) * 30,
    (item.y + item.h * (v * asset.size[1] - top) / (bottom - top)) * 10
  ]);
}

// The road keeps one geometry source so traffic and stop lines cannot drift.
export function roadFilter(environment) {
  return { morning: 'brightness(1.02) saturate(0.90)', day: 'none', sunset: 'brightness(0.93) sepia(0.12) saturate(0.88)', night: 'brightness(0.78) saturate(0.65)' }[environmentPhase(environment)];
}

export function spriteAppearance(asset, item, environment) {
  if (asset.appearanceProfile === 'road') return { src: asset.daySrc || asset.src, filter: roadFilter(environment) };
  const phase = environmentPhase(environment);
  const generated = asset.phaseSources?.[phase];
  const bakedLightsOff = asset.phaseLightsBaked && ['sunset', 'night'].includes(phase) && !lightAmount(environment, item);
  if (generated && !bakedLightsOff) return { src: generated, filter: 'none' };
  if (phase === 'night' && asset.nightOnlySrc && lightAmount(environment, item)) {
    return { src: asset.nightOnlySrc, filter: 'none' };
  }
  if (asset.nightSrc && lightAmount(environment, item)) {
    return { src: phase === 'night' || phase === 'sunset' ? asset.nightSrc : asset.src, filter: phase === 'night' || phase === 'sunset' ? 'saturate(0.45)' : 'none' };
  }
  return { src: asset.daySrc || asset.src, filter: spriteFilter(environment) };
}
