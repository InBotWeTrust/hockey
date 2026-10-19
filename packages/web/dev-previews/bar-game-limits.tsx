// Local-only visual fixture. This entry is not part of the production build.
// No authentication is initialized; every API call is handled by synthetic data.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { CharacterLaunch } from '../src/bar/games/CharacterLaunch.js';
import { GameResult } from '../src/bar/games/GameModals.js';
import { installAppViewport } from '../src/app/viewport.js';
import '../src/app/global.css';
import '../src/app/design-system.css';
import '../src/app/liquid-glass.css';
import '../src/app/light-theme.css';
import '../src/app/classic-light-theme.css';
import '../src/bar/games/games.css';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const active = params.get('card') === 'active';
const view = params.get('view');
document.documentElement.dataset.theme = theme;
installAppViewport();
const catalog = {
  revision: 1,
  settings: {
    cardDays: 30,
    freeGames: 3,
    cardGames: 2,
    freeMessages: 10,
    cardMessages: 30,
    products: [],
  },
  state: {
    serverNow: new Date(2026, 9, 19, 16, 40).toISOString(),
    resetAt: new Date(2026, 9, 20, 0).toISOString(),
    card: { purchased: active, active, expiresAt: active ? '2026-11-19T00:00:00Z' : null },
    messages: { remaining: 0, paid: 0 },
    games: { byCharacter: { daria: 0 }, remaining: 0 },
  },
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('/api/'))
    return new Response(
      JSON.stringify(
        url.endsWith('/bar/visitor')
          ? catalog
          : { error: { code: 'preview_only', message: 'Локальный просмотр: действие отключено.' } },
      ),
      {
        status: url.endsWith('/bar/visitor') ? 200 : 503,
        headers: { 'content-type': 'application/json' },
      },
    );
  return originalFetch(input, init);
};
const snapshot: BarGameSnapshot = {
  id: 'local-last-game',
  kind: 'darts',
  character: 'daria',
  player: 0,
  participants: [
    { userId: 'preview', displayName: 'Игрок', avatarUrl: null },
    { userId: 'daria', displayName: 'Дарья', avatarUrl: null },
  ],
  runtime: createMatch('darts', 0, 0, true, 1),
  ready: null,
  serverNow: 1000,
};
snapshot.runtime.game.winner = 0;
snapshot.runtime.reason = 'played';
if (snapshot.runtime.game.kind === 'darts') snapshot.runtime.game.scores = [0, 98];
function ModalPreview() {
  const [open, setOpen] = useState(true);
  return (
    <MemoryRouter>
      <div
        className="app-shell app-shell--unified-glass app-shell--arena"
        style={{
          background: 'center / cover url(/shop/backgrounds/bar-v1.webp)',
          minHeight: '100dvh',
        }}
      >
        <Routes>
          <Route
            path="/"
            element={
              open ? (
                view === 'launch' ? (
                  <CharacterLaunch character="daria" close={() => setOpen(false)} />
                ) : (
                  <GameResult view={snapshot} replay={() => {}} back={() => setOpen(false)} />
                )
              ) : (
                <button
                  className="btn btn--cta"
                  style={{ margin: 'auto' }}
                  onClick={() => setOpen(true)}
                >
                  Открыть окно снова
                </button>
              )
            }
          />
          <Route
            path="/bar"
            element={
              <p className="glass" style={{ padding: 24, margin: 'auto' }}>
                Локальный просмотр перехода к Игорю. Покупки отключены.
              </p>
            }
          />
        </Routes>
      </div>
    </MemoryRouter>
  );
}
function Comparison() {
  const query = `theme=${theme}${active ? '&card=active' : ''}`;
  return (
    <main
      style={{
        height: '100dvh',
        overflow: 'auto',
        padding: 24,
        background: '#101a29',
        color: '#f0f4fa',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Бар: попытки закончились</h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
          Локальный просмотр реальных компонентов. Тестовые данные, без покупок и списаний.
        </p>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <a style={{ color: '#b9d7ff' }} href={`?theme=light${active ? '&card=active' : ''}`}>
            Светлая тема
          </a>
          <a style={{ color: '#b9d7ff' }} href={`?theme=dark${active ? '&card=active' : ''}`}>
            Тёмная тема
          </a>
          <a style={{ color: '#b9d7ff' }} href={`?theme=${theme}`}>
            Без карты
          </a>
          <a style={{ color: '#b9d7ff' }} href={`?theme=${theme}&card=active`}>
            С активной картой
          </a>
        </nav>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 390px), 1fr))',
            gap: 24,
          }}
        >
          {[
            ['launch', '1. Вход без попыток'],
            ['result', '2. Последняя игра завершена'],
          ].map(([mode, title]) => (
            <section key={mode}>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>{title}</h2>
              <iframe
                title={title}
                src={`?view=${mode}&${query}`}
                style={{
                  width: '100%',
                  maxWidth: 390,
                  height: 844,
                  border: '1px solid #425069',
                  borderRadius: 24,
                  display: 'block',
                  background: '#101a29',
                }}
              />
              <a
                style={{ color: '#b9d7ff', display: 'inline-block', marginTop: 12 }}
                href={`?view=${mode}&${query}`}
              >
                Открыть отдельно
              </a>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(view ? <ModalPreview /> : <Comparison />);
