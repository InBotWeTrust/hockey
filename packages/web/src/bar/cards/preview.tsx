import { installBarLayoutPreview } from '../previewLayout.js';
import { installConversationPreview } from '../previewConversation.js';
import { BarAdmin } from '../../admin/BarAdmin.js';
import { installRoomPreview } from './previewRooms.js';
import { DurakRoomScreen } from './DurakRoomScreen.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BottomNav, isOpenRinkRoute } from '../../components/BottomNav.js';
import { CardInviteToast } from './CardInviteToast.js';
import { useLocation } from 'react-router-dom';
import { createGame, type Game } from './rules.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { DurakTable } from './DurakScreen.js';
import { useDurakGame } from './useDurakGame.js';
import { OnlineDurakLobby } from './OnlineDurakLobby.js';
import { OnlineDurakScreen } from './OnlineDurakScreen.js';
import { DurakScreen } from './DurakScreen.js';
import { BarScreen, BarBroadcastsScreen } from '../BarScreen.js';
import {BarStaffRoom} from '../BarStaffRoom.js';
import '../../app/global.css';
import '../../app/design-system.css';
import '../../app/liquid-glass.css';
import '../../app/light-theme.css';
import '../../app/classic-light-theme.css';
const previewTheme = new URLSearchParams(location.search).get('theme');
if (previewTheme === 'light' || previewTheme === 'dark') document.documentElement.dataset.theme = previewTheme;
const invitationDemo = new URLSearchParams(location.search).get('invitations') === 'demo';
const readinessDemo = new URLSearchParams(location.search).has('ready');
const computerDemo = new URLSearchParams(location.search).get('computer') === 'demo';
if (invitationDemo || computerDemo || readinessDemo) {
  const originalFetch = window.fetch.bind(window);
  let invitations = invitationDemo
    ? [
        {
          id: 'demo-invite',
          sender_id: 'demo-other',
          receiver_id: 'demo-player',
          sender_name: 'Александр',
          receiver_name: 'Игрок',
          status: 'pending',
          match_id: null,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ]
    : [];
  const readyGame = createGame(() => 0.4);
  const readyState = {
    selfReady: false,
    opponentReady: false,
    expiresAt: new URLSearchParams(location.search).get('ready') === 'expired' ? 0 : Date.now() + 60000,
    startsAt: null as number | null,
    cancelled: false,
  };
  let readyRevision = 0;
  let readySentAt: number | null = null;
  const players = [
    { userId: 'demo-other', displayName: 'Александр', avatarUrl: null },
    { userId: 'demo-2', displayName: 'Дмитрий', avatarUrl: null },
    { userId: 'demo-3', displayName: 'Максим', avatarUrl: null },
  ];
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    );
    if (readinessDemo && url.pathname.endsWith('/bar/cards/matches/demo-match')) {
      const now = Date.now();
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.action === 'ready' && !readyState.selfReady && !readyState.cancelled) {
          readyState.selfReady = true;
          readySentAt = now;
          readyRevision++;
        }
      }
      if (readySentAt && !readyState.opponentReady && now - readySentAt >= 2500) {
        readyState.opponentReady = true;
        readyState.startsAt = now + 5000;
        readyRevision++;
      }
      if (!readyState.startsAt && now >= readyState.expiresAt) readyState.cancelled = true;
      const started = readyState.startsAt !== null && now >= readyState.startsAt;
      return Response.json({
        id: 'demo-match',
        hand: started ? readyGame.hands[0] : [],
        opponentCount: started ? 6 : 0,
        deckCount: started ? readyGame.deck.length : 0,
        trump: readyGame.trump,
        trumpCard: readyGame.trumpCard,
        attacker: 0,
        table: [],
        limit: 6,
        phase: 'attack',
        revision: readyRevision + (started ? 1 : 0),
        result: null,
        deadline: started ? readyState.startsAt! + 40000 : null,
        serverNow: now,
        opponent: { displayName: 'Александр', avatarUrl: '/bar/cards/avatar-v2.webp' },
        ...(started ? {} : { readiness: readyState }),
      });
    }
    if (url.pathname.endsWith('/bar/cards/lobby'))
      return Response.json({ matchId: null, searching: false, invites: invitations });
    if (url.pathname.endsWith('/bar/cards/players'))
      return Response.json(
        players.filter((p) =>
          p.displayName.toLowerCase().includes((url.searchParams.get('q') ?? '').toLowerCase()),
        ),
      );
    if (url.pathname.includes('/bar/cards/invites/')) {
      invitations = [];
      return Response.json({ matchId: 'demo-match' });
    }
    return originalFetch(input, init);
  };
}
installRoomPreview();
installBarLayoutPreview();
installConversationPreview();
function PreviewChrome() {
  const route = useLocation();
  return invitationDemo ? (
    <>
      <CardInviteToast previewUserId="demo-player" suppressed={isOpenRinkRoute(route)} />
      <BottomNav preview={!isOpenRinkRoute(route)} />
    </>
  ) : null;
}
const base = createGame(() => 0.4);
const all = [...base.hands.flat(), ...base.deck];
const pairCount = Math.min(6, Math.max(1, Number(new URLSearchParams(location.search).get('pairs')) || 6));
const busy: Game = {
  ...base,
  hands: [all.slice(pairCount * 2, pairCount * 2 + 18), all.slice(pairCount * 2 + 18)],
  deck: [],
  table: Array.from({ length: pairCount }, (_, i) => ({ attack: all[i * 2]!, defence: all[i * 2 + 1]! })),
  attacker: 0,
};
const fixture = new URLSearchParams(location.search).get('layout');
const finalAce = { id: 'clubs-14', rank: 14, suit: 'clubs' as const };
const finalResponse = { id: 'hearts-6', rank: 6, suit: 'hearts' as const };
const finalGame: Game = { ...base, attacker: 0, trump: 'clubs', deck: [],
  hands: [[finalAce], [finalResponse]], table: [],
  discard: all.filter(c => c.id !== finalAce.id && c.id !== finalResponse.id) };
const initial =
  fixture === 'final' ? finalGame : fixture === 'busy'
    ? busy
    : fixture === 'win'
      ? { ...base, result: 0 as const, phase: 'ended' as const }
      : fixture === 'loss'
        ? { ...base, result: 1 as const, phase: 'ended' as const }
        : undefined;
function OnlineTablePreview() {
  const controller = useDurakGame(initial);
  return (
    <DurakTable
      controller={controller}
      online
      opponent={{ displayName: 'Соперник', avatarUrl: null }}
      previewPlayer={{ displayName: 'Александр' }}
    />
  );
}
const safeAreaPreview = new URLSearchParams(location.search).get('safe') === 'iphone';
document.documentElement.style.setProperty('--app-safe-top', safeAreaPreview ? '47px' : '0px');
document.documentElement.style.setProperty('--app-safe-bottom', safeAreaPreview ? '34px' : '0px');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <div className="app-shell app-shell--unified-glass">
        <MotionConfig reducedMotion="user">
          <HashRouter>
            <PreviewChrome />
            <Routes>
              <Route
                path="/bar/cards/computer/:opponentId"
                element={
                  <DurakScreen initialGame={initial} previewPlayer={{ displayName: 'Александр' }} />
                }
              />
              <Route
                path="/bar/cards/maria"
                element={
                  <DurakScreen initialGame={initial} previewPlayer={{ displayName: 'Александр' }} />
                }
              />
              <Route
                path="/bar/cards/room/:id"
                element={<DurakRoomScreen previewUserId="demo-player" />}
              />
              <Route path="/bar/cards/online" element={<OnlineDurakLobby />} />
              <Route
                path="/bar/cards/match/:id"
                element={readinessDemo ? <OnlineDurakScreen /> : <OnlineTablePreview />}
              />
              <Route path="/bar/cards/online-preview" element={<OnlineTablePreview />} />
              <Route
                path="/bar/admin-preview"
                element={
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--liquid-inset-bg)',
                      color: 'white',
                      minHeight: '100vh',
                    }}
                  >
                    <p>Локальный редактор: изменения сохраняются только в этом браузере.</p>
                    <a href="#/bar">Открыть бар</a>
                    <BarAdmin />
                  </div>
                }
              />
              <Route path="/bar/staff-room" element={<BarStaffRoom />} />
              <Route path="/bar/broadcasts" element={<BarBroadcastsScreen />} />
              <Route path="*" element={<BarScreen />} />
            </Routes>
          </HashRouter>
        </MotionConfig>
      </div>
    </QueryClientProvider>
  </React.StrictMode>,
);
