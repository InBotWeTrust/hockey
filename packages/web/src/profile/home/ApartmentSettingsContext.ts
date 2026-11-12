import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react';
export type ApartmentSettingsSection =
  | 'menu'
  | 'profile'
  | 'app'
  | 'notifications'
  | 'city'
  | 'help';
export const apartmentSettingsSections = [
  { id: 'profile', title: 'Профиль', hint: 'Имя, фото и описание' },
  { id: 'app', title: 'Приложение', hint: 'Тема и иконки на карте' },
  { id: 'notifications', title: 'Уведомления', hint: 'О чём напоминать' },
  { id: 'city', title: 'Город', hint: 'Погода и время суток' },
  { id: 'help', title: 'Помощь', hint: 'Связь, сообщества и аккаунт' },
] as const;
export const ApartmentSettingsContext = createContext<ApartmentSettingsSection | null>(null);

export function ApartmentSettingsGroup({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}): JSX.Element {
  const current = useContext(ApartmentSettingsContext);
  return current === null
    ? createElement(Fragment, null, children)
    : createElement('div', { hidden: current !== section }, children);
}

export const ApartmentClassicPassportContext = createContext(false);
