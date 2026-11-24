import { partnersMedia, type PartnersMedia } from './media.js';

/** Enhance the static page without importing authentication or the game. */
export function initializePartnersPage(media: PartnersMedia = partnersMedia): void {
  const source = new URLSearchParams(window.location.search);
  const tags = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = source.get(key)?.trim();
    if (value) tags.set(key, value.slice(0, 100));
  }
  const query = tags.toString();
  document.querySelectorAll<HTMLAnchorElement>('a[data-trial]').forEach((link) => {
    link.setAttribute('href', `/try${query ? `?${query}` : ''}`);
  });
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  const trailerSlot = document.getElementById('trailer-slot');
  if (trailerSlot && media.trailer.src) {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'none';
    video.poster = media.trailer.poster;
    video.src = media.trailer.src;
    video.setAttribute('aria-label', 'Трейлер Ultimate Hockey');
    const fallback = document.createElement('a');
    fallback.href = media.trailer.src;
    fallback.textContent = 'Открыть трейлер';
    video.append(fallback);
    trailerSlot.replaceChildren(video);
  }

  const dialog = document.querySelector<HTMLDialogElement>('.media-dialog');
  const dialogImage = dialog?.querySelector('img');
  const dialogTitle = dialog?.querySelector('.modal-title');
  let lastImageLink: HTMLAnchorElement | null = null;
  dialog?.querySelector('button')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('close', () => lastImageLink?.focus());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  for (const [key, src] of Object.entries(media.screenshots)) {
    if (!src) continue;
    const figure = document.querySelector<HTMLElement>(`[data-screen="${key}"]`);
    const pending = figure?.querySelector('.screen-pending');
    if (!pending) continue;
    const title = figure?.querySelector('figcaption')?.textContent ?? 'Игровой экран';
    const link = document.createElement('a');
    link.href = src;
    link.setAttribute('aria-label', `Увеличить: ${title}`);
    const image = document.createElement('img');
    image.src = src;
    image.alt = title;
    image.loading = 'lazy';
    image.width = 360;
    image.height = 640;
    link.append(image);
    link.addEventListener('click', (event) => {
      // Older embedded browsers can still open the full image via the anchor.
      if (!dialog || !dialogImage || !dialogTitle || typeof dialog.showModal !== 'function') return;
      event.preventDefault();
      lastImageLink = link;
      dialogImage.src = src;
      dialogImage.alt = title;
      dialogTitle.textContent = title;
      dialog.showModal();
    });
    pending.replaceWith(link);
  }
  const configuredScreens = document.querySelectorAll('[data-screen] a').length;
  if (configuredScreens === 6) {
    const note = document.querySelector('.gallery-heading > p');
    if (note) note.textContent = 'Нажми на экран, чтобы рассмотреть его ближе.';
  }
}
