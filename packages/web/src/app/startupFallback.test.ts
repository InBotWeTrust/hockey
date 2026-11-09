import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('index.html', 'utf8');

describe('static startup fallback', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('offers a retry when the application never replaces the loading screen', () => {
    vi.useFakeTimers();
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*?)<script type="module"/)?.[1] ?? '';
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    new Function(script!)();
    vi.advanceTimersByTime(20_000);
    expect(document.getElementById('root')?.textContent).toContain('Не удалось загрузить приложение');
    expect(document.getElementById('root')?.querySelector('button')?.textContent).toContain('Повторить');
  });

  it('does not replace an application that mounted successfully', () => {
    vi.useFakeTimers();
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*?)<script type="module"/)?.[1] ?? '';
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    new Function(script!)();
    document.getElementById('root')!.innerHTML = '<main>Игра</main>';
    vi.advanceTimersByTime(20_000);
    expect(document.getElementById('root')?.textContent).toContain('Игра');
    expect(document.getElementById('root')?.textContent).not.toContain('Не удалось загрузить приложение');
  });
});
