import { createGame, type Game } from './rules.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { DurakScreen } from './DurakScreen.js';
import { BarScreen, BarBroadcastsScreen } from '../BarScreen.js';
import '../../app/global.css';
import '../../app/design-system.css';
const base = createGame(() => 0.4);
const all = [...base.hands.flat(), ...base.deck];
const busy: Game = {
  ...base,
  hands: [all.slice(12, 30), all.slice(30)],
  deck: [],
  table: Array.from({ length: 6 }, (_, i) => ({ attack: all[i * 2]!, defence: all[i * 2 + 1]! })),
  attacker: 0,
};
const fixture = new URLSearchParams(location.search).get('layout');
const initial =
  fixture === 'busy'
    ? busy
    : fixture === 'win'
      ? { ...base, result: 0 as const, phase: 'ended' as const }
      : fixture === 'loss'
        ? { ...base, result: 1 as const, phase: 'ended' as const }
        : undefined;
document.documentElement.style.setProperty('--app-safe-top', '0px');
document.documentElement.style.setProperty('--app-safe-bottom', '0px');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Routes>
          <Route
            path="/bar/cards/maria"
            element={
              <DurakScreen initialGame={initial} previewPlayer={{ displayName: 'Александр' }} />
            }
          />
          <Route path="/bar/broadcasts" element={<BarBroadcastsScreen />} />
          <Route path="*" element={<BarScreen />} />
        </Routes>
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>,
);
