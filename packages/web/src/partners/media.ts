export interface PartnersMedia {
  trailer: { src: string | null; poster: string };
  screenshots: Partial<Record<'city' | 'shot' | 'duel' | 'tournament' | 'locker' | 'bar', string>>;
}

// Replace null/empty entries with approved public media paths when supplied.
// Screenshots must be current and cleared of personal data; no mock screens.
export const partnersMedia: PartnersMedia = {
  trailer: { src: null, poster: '/partners/media/poster.webp' },
  screenshots: {},
};
