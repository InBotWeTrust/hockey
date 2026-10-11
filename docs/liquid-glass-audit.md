# Повторная проверка Liquid Glass

11 октября 2026. Проверены общие CSS, локальные CSS и inline styles во всех исходниках web; перечень ниже фиксирует охват исходников, а не браузерную приёмку всех состояний.

## Маршруты приложения

- `/bar/cards/online`
- `/bar/cards/room/:id`
- `/bar/cards/match/:id`
- `/bar/cards/computer/:opponentId`
- `/bar/cards/maria`
- `/bar/broadcasts`
- `/bar`
- `/bar/:kind/:id`
- `/login`
- `/invite/:code`
- `/prices`
- `/terms`
- `/offer`
- `/privacy`
- `/personal-data-consent`
- `/demo`
- `/dev/daily-period-preview`
- `/dev/monthly-rating-reward-preview`
- `/dev/tournament-result-preview`
- `/auth/vk/callback`
- `/mobile-auth/telegram`
- `/`
- `/duel/:goalieId`
- `/sections`
- `/bonus-games`
- `/bonus-games/:gameId/play`
- `/achievements`
- `/inventory`
- `/daily`
- `/achievements/weekly-challenge`
- `/weekly-challenge`
- `/profile`
- `/referrals`
- `/profile/marksmanship-constructor`
- `/profile/settings`
- `/profile/stats`
- `/profile/equipment`
- `/profile/arena`
- `/profile/story`
- `/profile/story/series-1`
- `/profile/story/series-2`
- `/profile/achievements`
- `/profile/achievements/weekly-challenge`
- `/admin`
- `/test-court`
- `/chat`
- `/chat/new`
- `/chat/:chatId`
- `/chat/:chatId/info`
- `/chat/:chatId/posts/:postId/comments`
- `/users/:userId`

## Все файлы страниц

- `packages/web/src/admin/AdminScreen.tsx`
- `packages/web/src/arsenich/DestinationIntroductionPreviewScreen.tsx`
- `packages/web/src/bar/BarScreen.tsx`
- `packages/web/src/bar/cards/DurakRoomScreen.tsx`
- `packages/web/src/bar/cards/DurakScreen.tsx`
- `packages/web/src/bar/cards/OnlineDurakScreen.tsx`
- `packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx`
- `packages/web/src/chat/screens/ChatInfoScreen.tsx`
- `packages/web/src/chat/screens/ChatListScreen.tsx`
- `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- `packages/web/src/chat/screens/UserProfileScreen.tsx`
- `packages/web/src/components/duel/MonthlyRatingRewardPreviewScreen.tsx`
- `packages/web/src/onboarding/AmateurOnboardingPreviewScreen.tsx`
- `packages/web/src/onboarding/BeginnerOnboardingPreviewScreen.tsx`
- `packages/web/src/screens/AchievementsScreen.tsx`
- `packages/web/src/screens/BonusGamePlayScreen.tsx`
- `packages/web/src/screens/BonusGamesScreen.tsx`
- `packages/web/src/screens/DailyOverviewScreen.tsx`
- `packages/web/src/screens/DailyScreen.tsx`
- `packages/web/src/screens/DuelScreen.tsx`
- `packages/web/src/screens/GoalieListScreen.tsx`
- `packages/web/src/screens/InventoryScreen.tsx`
- `packages/web/src/screens/InviteScreen.tsx`
- `packages/web/src/screens/LoginScreen.tsx`
- `packages/web/src/screens/MarksmanshipConstructorScreen.tsx`
- `packages/web/src/screens/MobileTelegramAuthScreen.tsx`
- `packages/web/src/screens/PricesScreen.tsx`
- `packages/web/src/screens/ProfileScreen.tsx`
- `packages/web/src/screens/ProfileSettingsScreen.tsx`
- `packages/web/src/screens/ProfileStorySeriesScreen.tsx`
- `packages/web/src/screens/ReferralsScreen.tsx`
- `packages/web/src/screens/SectionsScreen.tsx`
- `packages/web/src/screens/TermsScreen.tsx`
- `packages/web/src/screens/TestCourtScreen.tsx`
- `packages/web/src/screens/VkAuthCallbackScreen.tsx`
- `packages/web/src/screens/WeeklyChallengeScreen.tsx`

## Модалки, sheets и переключатели

- `packages/web/src/bar/cards/DurakModals.tsx`
- `packages/web/src/chat/components/ChannelPollComposerSheet.tsx`
- `packages/web/src/chat/components/ChannelPostEditorSheet.tsx`
- `packages/web/src/chat/components/DuelChallengeModal.tsx`
- `packages/web/src/chat/components/UserPickerModal.tsx`
- `packages/web/src/chat/components/UserProfileSheet.tsx`
- `packages/web/src/components/AccessibleModal.tsx`
- `packages/web/src/components/GlassSelect.tsx`
- `packages/web/src/components/HomeArenaModal.tsx`
- `packages/web/src/components/MandatoryAndroidUpdateModal.tsx`
- `packages/web/src/components/ResultModal.tsx`
- `packages/web/src/components/SegmentedTabs.tsx`
- `packages/web/src/components/SettingsSheet.tsx`
- `packages/web/src/components/Sheet.tsx`
- `packages/web/src/components/StartPeriodModal.tsx`
- `packages/web/src/components/WeeklyChallengeStartModal.tsx`
- `packages/web/src/components/duel/MonthlyRatingRewardModal.tsx`
- `packages/web/src/components/duel/fight/FightModal.tsx`
- `packages/web/src/components/duel/fight/FightResultModal.tsx`
- `packages/web/src/profile/BonusRecordsModal.tsx`
- `packages/web/src/profile/ExperienceRatingModal.tsx`
- `packages/web/src/profile/StatRatingModal.tsx`
- `packages/web/src/tournament/RegularSeasonPodiumModal.tsx`

## Границы проверки

Все общие материалы подключаются в App. Portal-select и AccessibleModal получают root-токены вне app-shell. Физические сцены, картинка карточной игры, лед, эффекты и смысловые цвета прогресса сохранены.

Chromium: login, prices, terms, offer, privacy, personal-data-consent, demo и test-court открыты без входа на 360 px. Реальные BottomNav, GlassSelect, StartPeriodModal проверены на трёх фонах, включая режим reduced transparency. Тесты модалок проверяют взаимодействия, а не визуальные размеры каждого сценария.

Вход, создание аккаунтов и серверные записи не выполнялись. Авторизованные сценарии, админские состояния и физический iPhone не имеют полной браузерной приёмки; этот аудит не даёт такого утверждения.
