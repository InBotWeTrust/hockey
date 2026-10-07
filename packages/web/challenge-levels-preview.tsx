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
const fetchNative = window.fetch.bind(window);
window.fetch = (url, init) => String(url).startsWith('/api/') ? Promise.resolve(new Response(JSON.stringify(String(url).endsWith('/bonus-games') ? fixture : {}), {headers:{'Content-Type':'application/json'}})) : fetchNative(url,init);
localStorage.setItem('hockey.bonusGames.lastSkill', 'challenge');
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><BonusGamesScreen/></MemoryRouter></QueryClientProvider>);
