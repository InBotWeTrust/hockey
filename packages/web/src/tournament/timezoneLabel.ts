const TIMEZONE_LABELS: Record<string, string> = {
  'Europe/Moscow': 'МСК',
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Samara': 'Самара',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан',
  'Asia/Kamchatka': 'Камчатка',
  'America/New_York': 'Нью-Йорк',
  'America/Los_Angeles': 'Лос-Анджелес',
  UTC: 'Всемирное время',
};

export function tournamentTimezoneLabel(timezone: string): string {
  return TIMEZONE_LABELS[timezone] ?? 'Местное время';
}

export function tournamentTimezoneOptionLabel(timezone: string): string {
  return timezone === 'Europe/Moscow' ? 'Москва (МСК)' : tournamentTimezoneLabel(timezone);
}
