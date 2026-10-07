import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BonusGamesScreen } from './src/screens/BonusGamesScreen';
import './src/app/global.css';
import './src/app/design-system.css';
import fixture from './challenge-levels-fixture.json';
const location = new URLSearchParams(window.location.search).get('location');
if (location === 'ski' || location === 'cyberpunk') {
  const slug = location === 'ski' ? 'challenge-ski-resort' : 'challenge-cyberpunk-yard';
  fixture.games = fixture.games.filter((game) => game.slug === slug);
}
if (location === 'records') {
  fixture.games = [fixture.games[0]];
  Object.assign(fixture.games[0], { skill_code: 'speed', slug: 'speed-minsk', title: 'Минск', levels: undefined, is_completed: true, state: 'completed', preview_artwork_url: '/bonus-games/hockey-cities/previews/minsk.webp', qualification_rules: { type: 'goals_in_time', targetGoals: 18, activeTimeMs: 95000 }, preview_title: 'Минск', preview_story: 'Держите темп и завершите норматив до конца отсчёта.', challenge_environment: undefined });
}
const fetchNative = window.fetch.bind(window);
window.fetch = (url, init) => String(url).startsWith('/api/') ? Promise.resolve(new Response(JSON.stringify(String(url).endsWith('/bonus-games') ? fixture : {}), {headers:{'Content-Type':'application/json'}})) : fetchNative(url,init);
localStorage.setItem('hockey.bonusGames.lastSkill', location === 'records' ? 'speed' : 'challenge');
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><BonusGamesScreen/></MemoryRouter></QueryClientProvider>);
