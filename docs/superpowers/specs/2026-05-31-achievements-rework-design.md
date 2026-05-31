# Achievement Rework Design

## Goal

Replace the current small automatic achievement set with a full task system for Ultimate Hockey. The system must show the full catalogue in Sections, show only received achievements in Profile, support unclaimed achievement badges, let users claim rewards manually, and let admins manage reward values.

## Current Context

The project already has:

- `achievements` and `user_achievements` tables.
- Server-side achievement helpers in `packages/server/src/achievements/service.ts`.
- Profile DTOs that expose achievements through `/me` and public user profile endpoints.
- Profile UI that renders a horizontal achievements strip.
- Daily game, training, amateur duel, shop inventory, and amateur rating foundations.

The current model is too simple: `user_achievements` means "already unlocked", and there is no separate "completed but not claimed" state, no claim endpoint, no configurable reward values, and no full catalogue screen.

## Product Decisions

Full achievement catalogue lives under "Разделы", not in the Profile screen.

Profile shows only achievements the user has already received. If the user has unclaimed completed achievements, Profile may show a compact prompt or the unclaimed items at the top, but it must not become the full catalogue.

Achievements with mechanics that do not exist yet are still inserted into the catalogue, shown as locked/future, and tagged so they can be filtered in admin.

Removed achievements:

- `Идеальный расходник`
- `Не туда нажал, но вывез`
- `Камбэк в дуэли`

## Data Model

### Achievement Catalogue

Extend `achievements` from static display rows into an admin-managed catalogue:

- `id text primary key`
- `photo_url text not null`
- `title text not null`
- `description text not null`
- `requirement text not null`
- `category text not null`
- `availability text not null`
- `future_tag text null`
- `reward_currency int not null default 0`
- `reward_stars int not null default 0`
- `reward_experience int not null default 0`
- `sort_order int not null unique`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Allowed `availability` values:

- `active`: visible and executable.
- `future`: visible but not executable yet.
- `hidden`: admin-visible only.

Future tags:

- `future/pro`
- `future/tournament`
- `future/monthly_rating`

### User Achievement State

Replace the binary unlocked interpretation with three visible states:

- `locked`: condition has not been completed.
- `completed_unclaimed`: condition completed, reward not claimed.
- `claimed`: reward already received.

Implementation can keep the existing table name `user_achievements`, but it needs additional columns:

- `completed_at timestamptz not null default now()`
- `claimed_at timestamptz null`
- `completion_context jsonb not null default '{}'::jsonb`

For old rows, migrate them to `claimed` by setting both `completed_at` and `claimed_at` to the old `unlocked_at`, preserving existing player progress.

### User Experience

Add a separate `users.experience` column. Stars and experience are separate resources. Existing `users.xp` currently behaves as star balance in profile DTOs and must not be reused as experience.

Amateur unlock must use daily-game goals only, not global lifetime goals. The configured admin unlock threshold is currently expected to be 300 daily goals.

### Achievement Progress

Add `achievement_progress` for stateful conditions that should not be recomputed from scratch on every event:

- `user_id uuid not null`
- `key text not null`
- `state jsonb not null`
- `updated_at timestamptz not null default now()`
- primary key `(user_id, key)`

Expected progress keys:

- `training_40_of_50_streak`
- `training_before_duel_pending`
- `duel_win_streak`
- `duel_host_win_streak`
- `duel_guest_win_streak`
- `duel_last_loss`
- `economical_duel_wins`

## Server Architecture

Add `packages/server/src/achievements/engine.ts`.

The engine receives domain events and calls an idempotent completion helper:

```ts
completeAchievements(db, userId, achievementIds, context)
```

Completion only moves achievements to `completed_unclaimed`. It never grants rewards.

Claiming is separate:

```http
POST /achievements/:achievementId/claim
```

The claim transaction:

1. Locks the user achievement row.
2. Verifies it exists and `claimed_at is null`.
3. Locks/reads the achievement reward values.
4. Adds currency, stars, and experience.
5. Sets `claimed_at = now()`.
6. Returns updated achievement state and balances.

Double claim must be safe: a second request must not grant rewards twice.

## Badge Count

Add an authenticated endpoint or include in `/me`:

```ts
unclaimedAchievementsCount: number
```

The bottom navigation red badge for Profile/Sections counts only `completed_unclaimed` achievements. Since the full catalogue lives in Sections, the preferred badge placement is on the Sections tab. Profile may still show a local prompt when opened.

## UI Design

### Sections

Add a "Задания" entry in `SectionsScreen`.

The full Achievements screen has tabs or segmented filters:

- `Все`
- `Ежедневная`
- `Тренировка`
- `Дуэли`
- `Турниры`
- `Магазин`
- `Будущее`

Tile states:

- `locked`: grayscale image, muted text, lock/future copy.
- `future`: grayscale image, lock, `Скоро` status.
- `completed_unclaimed`: full color image, visible `Забрать` state.
- `claimed`: full color image, `Получено`.

Opening a completed unclaimed achievement shows a standard modal using the project modal invariant:

- `.modal-backdrop`
- `.modal-card`
- `.modal-title`
- `.modal-copy`
- `.modal-actions`
- CTA button `.modal-primary.btn--cta`

The CTA text is `Забрать`.

After successful claim, show a light reward animation: brief card glow plus floating reward numbers for currency, stars, and experience. Then update badge count.

### Profile

Profile shows only claimed achievements, plus optionally a compact "Есть награды" prompt when unclaimed achievements exist.

It must not show the full locked/future catalogue.

### Public Profiles

Public profiles and chat profile sheets show only claimed achievements.

## Admin Design

Admin must be able to manage achievements:

- list all achievements, including `hidden`;
- filter by category, availability, and future tag;
- edit title, description, requirement, image URL, sort order;
- edit reward currency, reward stars, reward experience;
- edit availability and future tag.

This lets future items like `future/pro`, `future/tournament`, and `future/monthly_rating` be gathered later.

## Image Pipeline

Generate one large achievement atlas/grid image, then crop it into individual `.webp` assets.

Image rules:

- one tile per final achievement;
- no text inside images;
- consistent hockey mini-poster style;
- future achievements still get images, but UI grays them out;
- output paths use stable IDs, for example `/achievements/ideal-day.webp`.

The atlas can be generated as an 8-column grid. The implementation plan should include a repeatable slicing script so assets can be regenerated.

## Achievement Catalogue

### Active

| ID | Title | Category | Condition |
| --- | --- | --- | --- |
| `ideal-day` | Идеальный день | daily | In one user-local day, complete daily at 90/90 and training at 50/50. |
| `first-goal` | Первая шайба | daily | Score the first goal in any game. |
| `first-daily-game` | С почином | daily | Complete the first daily game. |
| `first-training` | Начало положено | training | Complete the first training. |
| `amateur-ticket` | Билет в Любители | level | Reach configured daily-goals threshold for Amateur unlock, currently 300. |
| `daily-sniper-streak` | Снайперская серия | daily | Score 25 consecutive goals within one daily day, across periods allowed. |
| `ice-hand` | Ледяная рука | daily | Complete daily with accuracy `>= 95%`. |
| `steady-tempo` | Ровный темп | daily | Daily periods 1, 2, and 3 all completed with equal goals and each `>= 20`. |
| `third-period-decides` | Третий период решает | daily | In daily or classic duel, period 3 is strictly best; periods 1 and 2 each have `>= 20` goals. |
| `final-push` | Дожим | duel | Last 10 shots of a period are all goals; any game except training. |
| `no-panic` | Без паники | duel | After 3 consecutive non-goals, score the next 10 shots; any game except training. |
| `dry-finish` | Сухая концовка | daily | Last 20 shots of a completed daily game are all goals. |
| `keeping-fit` | Держусь в форме | daily | 7 consecutive completed daily games, each daily accuracy `>= 50%`. |
| `sniper-week` | Неделя снайпера | daily | Last 7 local days are all completed daily games; combined accuracy `>= 75%`. |
| `sniper-month` | Месяц снайпера | daily | Last 30 local days are all completed daily games; combined accuracy `>= 75%`. |
| `training-monster` | Тренировочный монстр | training | In training with exactly 50 shots, score `>= 45`. |
| `almost-perfect-training` | Почти идеально | training | In training with exactly 50 shots, score exactly 49. |
| `rhythm-control` | Контроль ритма | training | Score 30 consecutive goals in one training. |
| `cold-start` | Холодный старт | duel | First 20 shots in a duel are all goals across the whole match. |
| `no-warmup-needed` | Разминка не нужна | training | First 20 shots in training are all goals. |
| `finish-machine` | Машина на финише | training | Last 20 shots of training are all goals based on actual `shots_limit`; unavailable if limit `< 20`. |
| `underdog` | Андердог | duel | Beat an opponent with more experience; opponent experience must be at least 100. |
| `classic-speed` | Скорость в классике | duel | Complete a classic duel period in `<= 90s` from period start to close with period accuracy `>= 85%`. |
| `nervous-finish` | Нервная концовка | duel | Win any duel by exactly 1 goal. |
| `stable-student` | Стабильный ученик | training | 5 trainings in a row with `40+` goals out of exactly 50 shots. |
| `training-before-battle` | Тренировка перед боем | duel | Complete training, then win the first next settled duel; any other settled result clears pending state. |
| `dangerous-host` | Опасный хозяин | duel | Win 3 relevant duels in a row as challenger. |
| `blowout` | Разгром | duel | Win any duel by `20+` goals. |
| `thin-edge` | На тоненького | duel | Win any duel by exactly 2 goals. |
| `revenge` | Реванш | duel | Previous settled duel was a loss to player X; current settled duel is an immediate win against X. |
| `hunter-streak` | Серия охотника | duel | Win 5 duels in a row; only real settled win/draw/loss results affect the streak. |
| `clean-win` | Чистая победа | duel | Win a classic duel and strictly win every period. |
| `handled-pressure` | Давление выдержано | duel | Win a duel where the opponent completed the match earlier. |
| `dangerous-guest` | Опасный гость | duel | Win 3 relevant duels in a row as opponent. |
| `no-room-for-error` | Без права на ошибку | duel | Win a duel with `shots - goals <= 5`. |
| `wallet` | Кошелек | shop | Complete the first real paid purchase through YooKassa/bank. |
| `economical-master` | Экономный мастер | duel | Accumulate 10 duel wins without additional inventory. |
| `master-arsenal` | Арсенал мастера | duel | Win a duel where every played period has all three non-default purchased inventory slots filled: stick, skates, nutrition. |

### Future

| ID | Title | Future tag | Condition |
| --- | --- | --- | --- |
| `pro-ticket` | Билет в Про | `future/pro` | Future Pro unlock condition. |
| `playoff-semifinal` | Турнирный характер | `future/tournament` | Reach playoff semifinal. |
| `playoff-final` | Финальный лед | `future/tournament` | Reach playoff final. |
| `tournament-cup` | Кубок над головой | `future/tournament` | Win a tournament. |
| `dark-horse` | Темная лошадка | `future/tournament` | Eliminate a more experienced player from playoffs. |
| `death-bracket` | Сетка смерти | `future/tournament` | Beat 3 opponents in a row, each with more experience. |
| `series-comeback` | Мощный камбэк | `future/tournament` | Win a multi-game match after trailing in the series; applies to matches requiring at least 2 game/duel wins. |
| `no-shake` | Без дрожи | `future/tournament` | Show `>= 90%` accuracy in a playoff match. |
| `tournament-streak` | Турнирная серия | `future/tournament` | Win 3 tournaments in one season. |
| `monthly-top-1` | Топ 1 месяца | `future/monthly_rating` | Finish the month as rank 1 in duel rating. |
| `monthly-top-3` | Топ 3 месяца | `future/monthly_rating` | Finish the month in top 3 of duel rating. |

## Event Mapping

Daily:

- after daily shot: first goal, daily sniper streak, final push, no panic;
- after period close: final push and period aggregates;
- after day close: first daily game, ice hand, steady tempo, third period decides, dry finish, ideal day, keeping fit, sniper week, sniper month, amateur ticket.

Training:

- after training shot or close: rhythm control, no warmup needed;
- after training close: first training, training monster, almost perfect training, finish machine, stable student, ideal day, training-before-battle pending state.

Duel:

- after duel shot or period close: cold start, final push, no panic, classic speed;
- after duel settle: underdog, nervous finish, dangerous host, blowout, thin edge, revenge, hunter streak, clean win, handled pressure, dangerous guest, no room for error, economical master, master arsenal, training before battle.

Shop:

- after paid YooKassa/bank payment: wallet.

Future-only:

- Pro, tournament, playoff, and monthly rating achievements are catalogue-only until their domain events exist.

## Testing

Server tests:

- migration tests for new columns and catalogue rows;
- claim endpoint idempotency and reward accounting;
- daily evaluator tests for daily close and streak conditions;
- training evaluator tests for configurable `shots_limit`, 30-streak, first 20, last 20, exact 50 conditions;
- duel evaluator tests for win margin, role streaks, revenge, classic period speed, inventory slots;
- payment test for `wallet`;
- profile and public profile tests proving only claimed achievements are exposed publicly/profile-only where required.

Web tests:

- Sections screen exposes "Задания";
- Achievement screen filters and renders locked/future/completed/claimed states;
- bottom nav badge shows unclaimed count;
- claim modal uses standard modal classes and updates balances/count;
- Profile shows claimed achievements only.

Asset tests:

- slicing script outputs one `.webp` per catalogue image id;
- generated filenames match seeded `photo_url` values.

## Open Decisions Resolved

- `Идеальный день`: daily 90/90 and training 50/50 in the same local day.
- `Машина на финише`: last 20 shots based on actual training `shots_limit`.
- `Сухая концовка`: daily only.
- `Дожим`: last 10 shots of a period, any game except training.
- `Без паники`: 3 non-goals, then 10 goals, any game except training.
- `Третий период решает`: period 3 must be strictly better.
- Stars and experience are separate user resources.
- `Билет в Про` is future-tagged.
- `Кошелек` means real paid purchase, not inventory purchase for internal currency.
- `Экономный мастер` is cumulative 10 wins, not a streak.
- `Арсенал мастера` checks non-default inventory slots for every played period.
- Plain "duel" means any amateur duel kind; "classic" means `duel_kind = classic`.
- `Серия охотника` only considers real settled win/draw/loss outcomes.
