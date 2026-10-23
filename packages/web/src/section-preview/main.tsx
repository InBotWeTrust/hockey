import { ProfileFriendsScreen } from '../screens/ProfileFriendsScreen.js';
import { SocialProvider } from '../social/SocialContext.js';
import { socialApi } from '../social/api.js';
import { LockerRoomScreen } from '../screens/LockerRoomScreen.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { apartmentProfile, referralSummary } from './apartmentFixtures.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen.js';
import { ReferralsScreen } from '../screens/ReferralsScreen.js';
import { ProfileRewardsScreen } from '../screens/ProfileRewardsScreen.js';
import {
  ProfileStoryScreen,
  ProfileStatsScreen,
  ProfileArenaScreen,
} from '../screens/ProfileDestinationScreens.js';
import { ProfileStorySeriesScreen } from '../screens/ProfileStorySeriesScreen.js';
import {useProfileCity,useCityWeather,validCityWeather,type SelectedCity} from '../city/cityLocation.js';
import {weatherKinds,type WeatherKind} from '../city/weather.js';
import { CityMap } from '../city/CityMap.js';
import { BarScene } from '../bar/BarScene.js';
import { createDefaultBarLayout } from '@hockey/game-core';
import type { CityTimeOfDay } from '../city/lighting.js';
import { VenuePanorama } from '../components/VenuePanorama.js';
import { DailyScreen, GameHub } from '../screens/DailyScreen.js';
import { DailyOverviewScreen } from '../screens/DailyOverviewScreen.js';
import { AchievementsScreen } from '../screens/AchievementsScreen.js';
import { WeeklyChallengeScreen } from '../screens/WeeklyChallengeScreen.js';
import { baseState, trainingIdleState, initialTrainingCatalog } from './venueFixtures.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryScreen } from '../screens/InventoryScreen.js';
import { BonusGamesScreen } from '../screens/BonusGamesScreen.js';
import { inventoryWithItems, coinPackages, card } from './fixtures.js';
import '../app/global.css';
import '../app/design-system.css';
import '../app/liquid-glass.css';

// Local-only visual fixtures. No account/session mutation and no requests to a live API.
if (!import.meta.env.DEV) throw new Error('Local preview only');
const params = new URLSearchParams(location.search),
  scene = params.get('scene') ?? 'shop';
const level =
  params.get('level') === 'beginner'
    ? 'beginner'
    : params.get('level') === 'professional'
      ? 'professional'
      : 'amateur';
const previewTime = ['morning', 'day', 'sunset', 'night'].includes(params.get('time') ?? '')
  ? (params.get('time') as CityTimeOfDay)
  : undefined;
if (['map', 'locker', 'locker-alias'].includes(scene)) useDailyStore.setState({data: baseState});
const inventory = structuredClone(inventoryWithItems);
inventory.balances = { tokens: 43509, stars: 1860, experience: 77 };
for (const kind of ['stick', 'skates', 'nutrition', 'recovery'] as const) {
  const item = inventory.items[kind][0]!;
  inventory.items[kind] = Array.from({ length: 3 }, (_, i) => ({
    ...item,
    id: `${kind}-${i}`,
    rarity: (['common', 'rare', 'legendary'] as const)[i]!,
    title: `${{ stick: 'Ультимейт Ван', skates: 'Коньки Ультимейт', nutrition: 'Спортивное питание', recovery: 'Восстановление' }[kind]} ${i + 1}`,
    chargesPerPurchase: 1800 + i * 2000,
    currencyPrice: 3750 + i * 3750,
    starPrice: 150 + i * 150,
  }));
}
const skills = ['speed', 'accuracy', 'marksmanship', 'endurance', 'rhythm', 'challenge'];
const titles = ['Скорость', 'Точность', 'Меткость', 'Выносливость', 'Ритм', 'Испытания'];
const images = [
  '/bonus-games/nhl-cities/arenas/boston.webp',
  '/bonus-games/nhl-cities/arenas/chicago.webp',
];
const games = skills.flatMap((skill, index) =>
  Array.from({ length: 10 }, (_, i) =>
    card({
      id: `${skill}-${i}`,
      slug: skill === 'challenge' ? 'challenge-beach' : `${skill}-${i}`,
      title: `${titles[index]} · Локация ${i + 1}`,
      preview_title: `${titles[index]} · Локация ${i + 1}`,
      skill_code: skill,
      state: i === 0 ? 'available' : 'completed',
      is_completed: i > 0,
      arena: {
        title: `Локация ${i + 1}`,
        artwork_url: images[i % 2],
        thumbnail_url: images[i % 2],
      },
      preview_artwork_url: images[i % 2],
    }),
  ),
);
// Synthetic social connections for the local preview only.
const previewFans = [
  { id: 'preview-fan-1', displayName: 'Максим Орлов', avatarUrl: null },
  { id: 'preview-fan-2', displayName: 'Анна Соколова', avatarUrl: null },
  { id: 'preview-fan-3', displayName: 'Ледяной Лис', avatarUrl: null },
];
const previewFollowing = [
  { id: 'preview-follow-1', displayName: 'Александр Волков', avatarUrl: null },
  { id: 'preview-follow-2', displayName: 'Мария Север', avatarUrl: null },
  { id: 'preview-follow-3', displayName: 'Капитан двора', avatarUrl: null },
  { id: 'preview-follow-4', displayName: 'Дмитрий Очень Длинная Фамилия', avatarUrl: null },
];
const previewSocialSummary = () => ({ followersCount: previewFans.length, followingCount: previewFollowing.length, following: false, canFollow: false });
const previewCities:SelectedCity[]=[
 {id:'2801268',name:'Москва',region:'Москва',country:'Россия',latitude:55.7558,longitude:37.6173,timeZone:'Europe/Moscow'},
 {id:'2795655',name:'Владивосток',region:'Приморский край',country:'Россия',latitude:43.1155,longitude:131.8855,timeZone:'Asia/Vladivostok'},
];
let previewSelectedCity:SelectedCity|null=params.get('city')==='none'?null:previewCities[0]!;
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes('/api/')) return Response.error();
  let data: unknown = {};
  if(url.endsWith('/me/city')){
   if(init?.method==='PUT'){const body=JSON.parse(String(init.body)) as {cityId:string|null};previewSelectedCity=previewCities.find(city=>city.id===body.cityId)??null;}
   data={city:previewSelectedCity};
  }else if(url.includes('/cities?')){
   const q=new URL(url,'http://fixture.local').searchParams.get('q')?.toLocaleLowerCase()??'';
   data={cities:previewCities.filter(city=>city.name.toLocaleLowerCase().includes(q)).map(city=>({...city,id:Number(city.id)}))};
  }else if(url.includes('/me/weather?')){
   const requested=params.get('weather') as WeatherKind|null;
   const kind=requested&&weatherKinds.includes(requested)?requested:'overcast';
   data=params.get('weatherOffline')==='1'?{status:'unavailable',weather:null}:{status:'fresh',weather:{kind,temperature:8,description:{clear:'Ясно',overcast:'Пасмурно',rain:'Дождь',snow:'Снег',sleet:'Дождь со снегом',blizzard:'Метель',fog:'Туман'}[kind],observedAt:new Date().toISOString(),fetchedAt:new Date().toISOString()}};
  }else if (url.endsWith('/inventory/equipment') && init?.method === 'PATCH') {
    Object.assign(inventory.equipped, JSON.parse(String(init.body)));
    data = inventory;
   } else if (/\/me\/fans\//.test(url) && init?.method === 'DELETE') {
    const index = previewFans.findIndex(player => player.id === url.split('/').pop());
    if (index >= 0) previewFans.splice(index, 1);
    data = previewSocialSummary();
  } else if (/\/users\/[^/]+\/fan$/.test(url) && init?.method === 'DELETE') {
    const index = previewFollowing.findIndex(player => player.id === url.split('/').at(-2));
    if (index >= 0) previewFollowing.splice(index, 1);
    data = previewSocialSummary();
  } else if (url.includes('/fans/summary')) data = previewSocialSummary();
  else if (/\/(fans|following)(\?|$)/.test(url)) data = { items: url.includes('/following') ? previewFollowing : previewFans, nextCursor: null };
  else if (url.includes('/social/fans/rating')) data = { items:[], nextCursor:null, currentUser:null };
  else if (/\/users\/[^/]+\/bio$/.test(url)) data = { bio: 'Играю в хоккей с детства. Люблю красивые передачи и вечерние матчи во дворе.' };
  else if (url.endsWith('/api/me'))
    data = {
      ...apartmentProfile,
      competitionLevel: level,
      ...(params.get('empty') === '1'
        ? {
            achievements: [],
            trophySummary: {
              regularSeasonWins: 0,
              tournamentChampionships: 0,
              tournamentPodiums: 0,
              completedChallenges: 0,
            },
          }
        : {}),
    };
  else if (url.includes('/referrals/me')) data = referralSummary;
  else if (url.includes('/referrals/invitees')) data = { items: [], total: 0 };
  else if (url.includes('/push/preferences'))
    data = {
      chatNewDialogMessage: true,
      dailyGame: true,
      trainingAvailable: true,
      duelEvents: true,
      tournamentEvents: true,
      gameNews: true,
    };
  else if (url.includes('/social') || url.includes('/friends'))
    data = { followers: 0, following: 0, friends: 0, items: [] };
  else if (url.includes('/duel/daily/history'))
    data = {
      games: [],
      summary: {
        possible_games: 0,
        played_games: 0,
        completed_games: 0,
        total_shots: 0,
        total_goals: 0,
      },
      nextOffset: null,
    };
  else if (url.includes('/duel/daily/state')) data = baseState;
  else if (url.includes('/duel/training/course')) data = initialTrainingCatalog;
  else if (url.includes('/duel/training/state')) data = trainingIdleState;
  else if (url.includes('/duel/amateur/templates')) data = { templates: [] };
  else if (url.includes('/duel/amateur/matches')) data = { matches: [] };
  else if (url.includes('/duel/amateur/rating')) data = { rating: [], season_key: '2026-10' };
  else if (url.includes('/tournaments'))
    data = { tournaments: [], active: [], upcoming: [], completed: [] };
  else if (url.endsWith('/achievements'))
    data = {
      unclaimedCount: 1,
      achievements: Array.from({ length: 8 }, (_, i) => ({
        id: `a${i}`,
        title: `Хоккейный путь ${i + 1}`,
        description: 'Продолжай тренировки и забивай шайбы',
        requirement: 'Забей 30 шайб',
        category: 'daily',
        availability: 'active',
        status: i === 0 ? 'completed_unclaimed' : 'locked',
        isUnlocked: i === 0,
        isClaimable: i === 0,
        rewardCurrency: 100,
        rewardStars: 5,
        rewardExperience: 10,
        photoUrl: '/achievements/first-goal.webp',
      })),
    };
  else if (url.includes('/weekly-challenge/catalog'))
    data = {
      future: [],
      active: [
        {
          id: 'weekly',
          title: 'Неделя снайпера',
          description: 'Забивай и тренируйся',
          status: 'running',
          startAt: '2026-10-19T00:00:00Z',
          endAt: '2026-10-26T00:00:00Z',
          serverNow: '2026-10-19T12:00:00Z',
          reward: { coins: 1000, stars: 20, experience: 50, tokens: 0 },
          rewardClaimedAt: null,
          hasProgress: true,
          canClaimReward: false,
          allTasksCompleted: false,
          tasks: [
            {
              id: 'goals',
              type: 'goals_scored',
              title: 'Забей 100 шайб',
              target: 100,
              progress: 35,
              completed: false,
            },
          ],
        },
      ],
      completed: [],
    };
  else if (url.includes('/weekly-challenge/current'))
    data = { challenge: null, pendingRewards: [] };
  else if (url.includes('/bar/visitor'))
    data = {
      revision: 1,
      settings: {
        cardDays: 30,
        products: [
          {
            id: 'card',
            kind: 'card',
            title: 'Карта посетителя',
            amount: 1,
            coins: 15000,
            stars: 600,
          },
        ],
      },
      state: { card: { active: false, expiresAt: null } },
    };
  else if (url.includes('/inventory/me') || url.includes('/inventory/items/')) data = inventory;
  else if (url.includes('/inventory/transactions'))
    data = {
      transactions: Array.from({ length: 12 }, (_, i) => ({
        ...inventoryWithItems.transactionHistory![
          i % inventoryWithItems.transactionHistory!.length
        ],
        id: `t${i}`,
      })),
      total: 12,
      nextOffset: null,
    };
  else if (url.includes('/bank/packages')) data = { packages: coinPackages };
  else if (url.includes('/bank/receipt-email')) data = { receiptEmail: null };
  else if (url.endsWith('/bonus-games'))
    data = {
      games,
      active_attempt: null,
      attempt_allowances: Object.fromEntries(
        skills.map((skill) => [
          skill,
          {
            skill_code: skill,
            daily_limit: 2,
            used: 0,
            remaining: 2,
            resets_at: '2026-10-20T00:00:00Z',
          },
        ]),
      ),
    };
  else if (url.includes('/records')) data = { rows: [], currentUser: null, nextOffset: null };
  else if (init?.method && init.method !== 'GET')
    data = { error: 'preview_only', message: 'Локальный просмотр' };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
function BarNavigationPreview() {
  const [slot, setSlot] = React.useState('bar-1');
  return (
    <BarScene
      layout={createDefaultBarLayout()}
      activeSlotId={slot}
      onSelectSlot={setSlot}
      onAction={() => {}}
      activityCounts={{ online: 2, veronika: 1 }}
    />
  );
}
function MapNavigationPreview() {
  const navigate = useNavigate();
  const city=useProfileCity('navigation-labels-qa');
  const weather=useCityWeather('navigation-labels-qa',city.data?.city);
  return (
    <main className="screen sections-city-screen">
      <CityMap
        city={city.data?.city??null}
        currentWeather={validCityWeather(weather.data)}
        weatherLoading={weather.isPending}
        weatherStale={params.get('weatherStale')==='1'}
        level={level}
        owner="navigation-labels-qa"
        startAtDaily
        gamePanel={<GameHub presentation="city" onOpenDailyPlay={()=>{}} onOpenTraining={()=>{}} onOpenTrainingPlay={()=>{}} onOpenAmateurMatch={()=>{}} />}
        daily="0/90 бросков"
        training="0/500"
        tasks="Есть награда"
        bonus="Бонусные игры"
        taskCount={1}
        isAdmin
        adminCount={2}
        onNavigate={navigate}
      />
    </main>
  );
}
const initial =
  scene === 'locker' ? '/locker-room' : scene === 'locker-alias' ? '/profile/equipment' : scene === 'apartment'
    ? params.get('page') === 'referrals'
      ? '/referrals'
      : params.get('page') && params.get('page') !== 'profile'
        ? `/profile/${params.get('page')}`
        : '/profile'
    : scene === 'map'
      ? '/preview-map'
      : scene === 'bar'
        ? '/preview-bar'
        : scene === 'yard'
          ? `/?view=training&section=${params.get('section') ?? 'course'}&from=sections`
          : scene === 'stadium'
            ? `/?view=amateur&section=${params.get('section') ?? 'duels'}&from=sections`
            : scene === 'tasks'
              ? '/achievements'
              : scene === 'bonus'
                ? `/bonus-games?skill=${params.get('skill') ?? 'speed'}`
                : scene === 'bank'
                  ? `/inventory?tab=${params.get('tab') ?? 'bank'}`
                  : `/inventory?category=${params.get('category') ?? 'stick'}`;
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    <SocialProvider value={{viewerId:apartmentProfile.id,api:socialApi}}>
    <MemoryRouter initialEntries={[initial]}>
      <div
        className="app-shell app-shell--unified-glass"
        style={
          {
            height: '100dvh',
            width: '100%',
            maxWidth: 430,
            margin: '0 auto',
            '--navigation-safe-area': `${Math.max(0, Math.min(100, Number(params.get('safe-bottom')) || 0))}px`,
          } as React.CSSProperties
        }
      >
        <div className="app-content">
          <VenuePanorama level={level} owner="local-preview" previewTime={previewTime}>
            <Routes>
              <Route path="/profile" element={<ProfileScreen />} />
              <Route path="/profile/friends" element={<ProfileFriendsScreen />} />
              <Route path="/profile/equipment" element={<Navigate to="/locker-room" replace />} />
              <Route path="/locker-room" element={<LockerRoomScreen />} />
              <Route path="/sections" element={<MapNavigationPreview />} />
              <Route path="/profile/rewards" element={<ProfileRewardsScreen />} />
              <Route path="/profile/settings" element={<ProfileSettingsScreen />} />
              <Route path="/referrals" element={<ReferralsScreen />} />
              <Route path="/profile/story" element={<ProfileStoryScreen />} />
              <Route path="/profile/story/series-1" element={<ProfileStorySeriesScreen />} />
              <Route
                path="/profile/story/series-2"
                element={<ProfileStorySeriesScreen series={2} />}
              />
              <Route path="/profile/stats" element={<ProfileStatsScreen />} />
              <Route path="/profile/arena" element={<ProfileArenaScreen />} />
              <Route path="/preview-map" element={<MapNavigationPreview />} />
              <Route path="/preview-bar" element={<BarNavigationPreview />} />
              <Route path="/" element={<DailyScreen />} />
              <Route path="/daily" element={<DailyOverviewScreen />} />
              <Route path="/achievements" element={<AchievementsScreen />} />
              <Route path="/achievements/weekly-challenge" element={<WeeklyChallengeScreen />} />
              <Route path="/inventory" element={<InventoryScreen />} />
              <Route path="/bonus-games" element={<BonusGamesScreen />} />
              <Route
                path="*"
                element={
                  <p>
                    Возврат на карту. <a href="/section-panoramas-qa.html">Открыть магазин</a>
                  </p>
                }
              />
            </Routes>
          </VenuePanorama>
        </div>
      </div>
    </MemoryRouter>
    </SocialProvider>
  </QueryClientProvider>,
);
