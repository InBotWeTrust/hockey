# Regular Season Podium Congratulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each top-three regular-season finisher a durable, one-time congratulation modal on the Sections tab with the tournament name, placement artwork, and the reward actually granted.

**Architecture:** Add a dedicated PostgreSQL outbox-style record created inside the existing regular-season finalization transaction. The Sections screen opts into reading pending records through its existing `/me` request, while an authenticated tournament endpoint acknowledges one record at a time. A focused React component renders the three placement variants using shared reward colors/icons and WebP artwork.

**Tech Stack:** PostgreSQL 16 migrations, Fastify 4, TypeScript NodeNext, React 18, TanStack Query, lucide-react, Testing Library, Vitest, WebP assets.

**Spec:** `docs/superpowers/specs/2026-09-04-regular-season-podium-congratulation-design.md`

## Global Constraints

- Create congratulations only after the regular standings are officially finalized during the regular-to-playoff transition.
- Only places 1, 2, and 3 receive records; records remain pending without an expiry date.
- Persist snapshots of the tournament title and actually granted coins, stars, and experience.
- The Sections screen must not add a second discovery request: it opts into congratulations through the `/me` request it already performs.
- Other `/me` consumers must not query congratulations unless they explicitly opt in.
- Acknowledgement is authenticated, ownership-checked, and idempotent across devices.
- The modal has no close icon and cannot close from backdrop or Escape; only a successful “Закрыть” acknowledgement advances the queue.
- Hide individual zero rewards; hide the entire reward section when all values are zero.
- Use the existing `.modal-*`, `.section-label`, and reward color conventions; do not add nested card surfaces.
- All three artwork files are square WebP images with no embedded text or metal labels.
- Do not run GLM review for this work.

---

### Task 1: Persist and query pending podium congratulations

**Files:**
- Create: `packages/server/db/migrations/095_tournament_regular_podium_congratulation.sql`
- Create: `packages/server/src/tournament/podiumCongratulations.ts`
- Create: `packages/server/test/tournament/podiumCongratulations.integration.test.ts`

**Interfaces:**
- Produces: `RegularSeasonPodiumRewardSnapshot = { coins: number; stars: number; experience: number }`.
- Produces: `RegularSeasonPodiumCongratulationDTO = { id: string; tournamentId: string; tournamentTitle: string; place: 1 | 2 | 3; reward: RegularSeasonPodiumRewardSnapshot; createdAt: string }`.
- Produces: `createRegularSeasonPodiumCongratulations(client, tournamentId): Promise<void>`.
- Produces: `listPendingRegularSeasonPodiumCongratulations(pool, userId): Promise<RegularSeasonPodiumCongratulationDTO[]>`.
- Produces: `acknowledgeRegularSeasonPodiumCongratulation(pool, { congratulationId, userId }): Promise<{ acknowledged: true }>`.

- [ ] **Step 1: Write the migration**

Create a table whose snapshots survive later tournament edits and whose unread lookup is indexed:

```sql
create table tournament_regular_podium_congratulation (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  tournament_title text not null,
  reward_coins integer not null default 0 check (reward_coins >= 0),
  reward_stars integer not null default 0 check (reward_stars >= 0),
  reward_experience integer not null default 0 check (reward_experience >= 0),
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (tournament_id, user_id)
);

create index tournament_regular_podium_congratulation_pending_idx
  on tournament_regular_podium_congratulation (user_id, created_at, id)
  where viewed_at is null;
```

- [ ] **Step 2: Write failing integration tests for listing and acknowledgement**

Cover oldest-first DTO mapping, ownership rejection, successful acknowledgement, repeat acknowledgement, and cross-device disappearance:

```ts
expect(await listPendingRegularSeasonPodiumCongratulations(pool, PLAYER_ID)).toEqual([
  {
    id: expect.any(String),
    tournamentId,
    tournamentTitle: 'Кубок Ледовой арены',
    place: 1,
    reward: { coins: 5000, stars: 25, experience: 1500 },
    createdAt: expect.any(String),
  },
]);
await expect(
  acknowledgeRegularSeasonPodiumCongratulation(pool, {
    congratulationId,
    userId: OTHER_PLAYER_ID,
  }),
).rejects.toMatchObject({ code: 'not_found' });
await expect(
  acknowledgeRegularSeasonPodiumCongratulation(pool, { congratulationId, userId: PLAYER_ID }),
).resolves.toEqual({ acknowledged: true });
await expect(
  acknowledgeRegularSeasonPodiumCongratulation(pool, { congratulationId, userId: PLAYER_ID }),
).resolves.toEqual({ acknowledged: true });
expect(await listPendingRegularSeasonPodiumCongratulations(pool, PLAYER_ID)).toEqual([]);
```

- [ ] **Step 3: Build game-core and run the focused test to verify RED**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/tournament/podiumCongratulations.integration.test.ts
```

Expected: FAIL because the migration/service exports do not exist yet.

- [ ] **Step 4: Implement the focused persistence service**

Implement DTO mapping with numeric conversion and ISO timestamps. Implement acknowledgement as ownership-scoped and idempotent:

```ts
const result = await pool.query(
  `update tournament_regular_podium_congratulation
      set viewed_at = coalesce(viewed_at, now())
    where id = $1 and user_id = $2
    returning id`,
  [input.congratulationId, input.userId],
);
if (result.rowCount === 0) {
  throw new AppError('not_found', 'podium congratulation not found', 404);
}
return { acknowledged: true as const };
```

Keep creation in the same module, but defer its lifecycle test to Task 2. It must use `insert ... on conflict (tournament_id, user_id) do nothing`.

- [ ] **Step 5: Run the focused persistence tests**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/podiumCongratulations.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the persistence slice**

```bash
git add packages/server/db/migrations/095_tournament_regular_podium_congratulation.sql packages/server/src/tournament/podiumCongratulations.ts packages/server/test/tournament/podiumCongratulations.integration.test.ts
git commit -m "feat(tournaments): persist regular podium congratulations"
```

---

### Task 2: Create snapshots only during official regular-season finalization

**Files:**
- Modify: `packages/server/src/tournament/podiumCongratulations.ts`
- Modify: `packages/server/src/tournament/service.ts`
- Modify: `packages/server/test/tournament/service.integration.test.ts`

**Interfaces:**
- Consumes: `createRegularSeasonPodiumCongratulations(client, tournamentId): Promise<void>` from Task 1.
- Reads: applied `tournament_economy_event` rows with idempotency keys `tournament:<tournamentId>:reward:regular:<place>:<userId>`.
- Produces: atomic regular-to-playoff transition containing standings, rewards, and congratulation snapshots.

- [ ] **Step 1: Write a failing lifecycle integration test**

Create a four-player tournament with deterministic final standings and regular rewards, transition it into playoffs, then assert:

```ts
const congratulations = await pool.query(
  `select user_id, place, tournament_title, reward_coins, reward_stars, reward_experience
     from tournament_regular_podium_congratulation
    where tournament_id = $1
    order by place`,
  [tournament.id],
);
expect(congratulations.rows).toEqual([
  expect.objectContaining({ place: 1, reward_coins: 5000, reward_stars: 25 }),
  expect.objectContaining({ place: 2, reward_coins: 3000, reward_stars: 15 }),
  expect.objectContaining({ place: 3, reward_coins: 0, reward_stars: 0, reward_experience: 0 }),
]);
```

Also call the transition/finalizer again and assert exactly three rows and unchanged balances. Call the admin reward grant path before finalization in a separate test and assert that it creates no congratulation.

- [ ] **Step 2: Run the focused lifecycle test to verify RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "creates regular podium congratulations"
```

Expected: FAIL because the transition does not create the records.

- [ ] **Step 3: Implement transaction-bound creation**

In `startTournamentPlayoffs`, call the creator immediately after `grantTournamentStageRewardsWithClient(...)` and before changing tournament status:

```ts
await grantTournamentStageRewardsWithClient(client, tournamentId, 'regular');
await createRegularSeasonPodiumCongratulations(client, tournamentId);
await client.query(
  `update tournament set status = 'playoff', updated_at = now() where id = $1`,
  [tournamentId],
);
```

The creator selects only ranks 1–3. For each player it reads the already-applied regular reward economy event and snapshots its numeric amounts; when no event exists, it stores zeroes. It selects the tournament title in the same transaction and inserts all three rows idempotently. Do not call it from the generic/manual `grantTournamentStageRewards` function.

- [ ] **Step 4: Run lifecycle and reward regression tests**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/tournament/service.integration.test.ts -t "regular podium|regular rewards|starts playoffs"
pnpm --filter @hockey/server exec vitest run test/tournament/synthetic-seasons.integration.test.ts -t "reward"
```

Expected: PASS; a manual reward grant still does not produce a premature modal event.

- [ ] **Step 5: Commit the lifecycle slice**

```bash
git add packages/server/src/tournament/podiumCongratulations.ts packages/server/src/tournament/service.ts packages/server/test/tournament/service.integration.test.ts
git commit -m "feat(tournaments): queue podium modal after regular season"
```

---

### Task 3: Expose discovery through the Sections `/me` request and add acknowledgement API

**Files:**
- Modify: `packages/server/src/routes/me.ts`
- Modify: `packages/server/src/tournament/routes.ts`
- Modify: `packages/server/test/routes/me.test.ts`
- Modify: `packages/server/test/tournament/podiumCongratulations.integration.test.ts`
- Modify: `packages/web/src/screens/profileTypes.ts`
- Modify: `packages/web/src/api/tournament.ts`

**Interfaces:**
- Consumes: list/ack functions and DTO from Task 1.
- Produces: `GET /me?includeTournamentCongratulations=true` with `pendingTournamentCongratulations`.
- Produces: `POST /tournaments/congratulations/:congratulationId/read` returning `{ acknowledged: true }`.
- Produces: web function `acknowledgeRegularSeasonPodiumCongratulation(id: string): Promise<{ acknowledged: true }>`.

- [ ] **Step 1: Write failing route contract tests**

Assert that plain `/me` preserves its current response and does not invoke/list congratulations, while the opted-in request includes them:

```ts
expect((await app.inject({ method: 'GET', url: '/me', headers: auth })).json())
  .not.toHaveProperty('pendingTournamentCongratulations');
expect(
  (await app.inject({ method: 'GET', url: '/me?includeTournamentCongratulations=true', headers: auth })).json()
    .pendingTournamentCongratulations,
).toEqual([expect.objectContaining({ place: 1 })]);
```

For the acknowledgement route, assert `401` without auth, `404` for another user, `200` for the owner, and `200` on repeat.

- [ ] **Step 2: Run route tests to verify RED**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/routes/me.test.ts test/tournament/podiumCongratulations.integration.test.ts
```

Expected: FAIL on the new query field and endpoint.

- [ ] **Step 3: Implement opt-in `/me` enrichment**

Parse an exact optional boolean query value and pass an option into `getMe`:

```ts
const query = z.object({ includeTournamentCongratulations: z.coerce.boolean().optional() }).parse(req.query);
const profile = await getMe(app, req.user.id);
if (query.includeTournamentCongratulations !== true) return profile;
return {
  ...profile,
  pendingTournamentCongratulations:
    await listPendingRegularSeasonPodiumCongratulations(app.pg, req.user.id),
};
```

Use a parser that treats only the intended `true` value as opt-in; do not allow the string `false` to coerce to true accidentally.

- [ ] **Step 4: Implement acknowledgement route and web contracts**

Register the authenticated route and validate the UUID parameter:

```ts
app.post('/tournaments/congratulations/:congratulationId/read', authenticated, async (req) => {
  const params = z.object({ congratulationId: uuid }).parse(req.params);
  return acknowledgeRegularSeasonPodiumCongratulation(app.pg, {
    congratulationId: params.congratulationId,
    userId: req.user.id,
  });
});
```

Add the DTO to `ProfileData` as an optional array so other `/me` consumers remain compatible. Add the typed `apiFetch` wrapper to `api/tournament.ts`.

- [ ] **Step 5: Run route tests and both package typechecks**

Run:

```bash
pnpm --filter @hockey/server exec vitest run test/routes/me.test.ts test/tournament/podiumCongratulations.integration.test.ts
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add packages/server/src/routes/me.ts packages/server/src/tournament/routes.ts packages/server/test/routes/me.test.ts packages/server/test/tournament/podiumCongratulations.integration.test.ts packages/web/src/screens/profileTypes.ts packages/web/src/api/tournament.ts
git commit -m "feat(tournaments): expose pending podium congratulations"
```

---

### Task 4: Create placement artwork and the reusable modal

**Files:**
- Create: `packages/web/public/tournament-results/regular-season-first.webp`
- Create: `packages/web/public/tournament-results/regular-season-second.webp`
- Create: `packages/web/public/tournament-results/regular-season-third.webp`
- Create: `packages/web/src/tournament/RegularSeasonPodiumModal.tsx`
- Create: `packages/web/src/tournament/RegularSeasonPodiumModal.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: `RegularSeasonPodiumCongratulationDTO` from Task 1 mirrored by the web API contract in Task 3.
- Produces: `RegularSeasonPodiumModal({ congratulation, pending, error, onConfirm }): JSX.Element`.

- [ ] **Step 1: Generate and convert the three approved square illustrations**

Use the established tournament-result artwork as visual reference. Generate one composition per placement: hockey player viewed from behind, one arm raised holding a small non-branded cup, no text or labels, same rink/cinematic style. Vary only the cup metal: gold, silver, bronze. Export each final asset at a consistent square resolution and encode as WebP.

Verify with:

```bash
file packages/web/public/tournament-results/regular-season-*.webp
identify packages/web/public/tournament-results/regular-season-*.webp
```

Expected: all three files report WebP and identical square dimensions.

- [ ] **Step 2: Write failing component tests**

Cover all titles, tournament name, artwork mapping, reward filtering, all-zero section removal, close blocking, and pending/error states:

```tsx
render(<RegularSeasonPodiumModal congratulation={fixture({ place: 2 })} pending={false} error={null} onConfirm={onConfirm} />);
expect(screen.getByRole('heading', { name: 'Вы заняли 2-е место в регулярном чемпионате!' })).toBeInTheDocument();
expect(screen.getByText('Кубок Ледовой арены')).toBeInTheDocument();
expect(screen.getByRole('img')).toHaveAttribute('src', '/tournament-results/regular-season-second.webp');
expect(screen.getByLabelText('Монеты: 3000')).toBeInTheDocument();
expect(screen.queryByLabelText('Звёзды: 0')).toBeNull();
fireEvent.keyDown(document, { key: 'Escape' });
expect(onConfirm).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
expect(onConfirm).toHaveBeenCalledTimes(1);
```

- [ ] **Step 3: Run the component test to verify RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/tournament/RegularSeasonPodiumModal.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the modal with shared visual conventions**

Use `AccessibleModal` with `closeBlocked`, no `headerAction`, and no `onClose`. Render the tournament name directly under the title, the square image, then a conditional `.section-label` and inline reward values. Use lucide `CircleDollarSign`, filled `Star`, and `TrendingUp`, plus `rewardColor(...)`. Keep reward values tabular and expose accessible labels such as `Монеты: 5000`.

Use one CSS namespace, for example `.regular-podium-modal__*`, only for layout. Keep the card at the existing non-compact result width and reuse `.tournament-duel-result__artwork`, `.modal-actions`, and `.modal-primary.btn.btn--cta`.

- [ ] **Step 5: Run component tests and focused lint**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/tournament/RegularSeasonPodiumModal.test.tsx
pnpm --filter @hockey/web exec eslint src/tournament/RegularSeasonPodiumModal.tsx src/tournament/RegularSeasonPodiumModal.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the visual component slice**

```bash
git add packages/web/public/tournament-results/regular-season-first.webp packages/web/public/tournament-results/regular-season-second.webp packages/web/public/tournament-results/regular-season-third.webp packages/web/src/tournament/RegularSeasonPodiumModal.tsx packages/web/src/tournament/RegularSeasonPodiumModal.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(tournaments): add regular podium modal"
```

---

### Task 5: Integrate the durable queue into Sections

**Files:**
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.test.tsx`

**Interfaces:**
- Consumes: `/me?includeTournamentCongratulations=true`, acknowledgement wrapper, and `RegularSeasonPodiumModal`.
- Produces: oldest-first one-at-a-time queue that advances only after successful server acknowledgement.

- [ ] **Step 1: Write failing Sections flow tests**

Mock the opted-in `/me` response with two congratulations. Assert the correct request, first modal, successful removal/next modal, and failed acknowledgement behavior:

```ts
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/me?includeTournamentCongratulations=true'), expect.anything());
expect(await screen.findByText('Первый турнир')).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
await waitFor(() => expect(screen.getByText('Второй турнир')).toBeInTheDocument());
```

Add tests for an empty queue, launch/render with Sections already active, an acknowledgement `500` that leaves the first modal visible, and the absence of backdrop/Escape dismissal.

- [ ] **Step 2: Run Sections tests to verify RED**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx
```

Expected: FAIL because Sections does not request or display congratulations.

- [ ] **Step 3: Implement query opt-in and acknowledgement mutation**

Change only the Sections profile query URL:

```ts
const profileQuery = useQuery<ProfileData>({
  queryKey: ['profile', 'sections'],
  queryFn: () => apiFetch<ProfileData>('/me?includeTournamentCongratulations=true'),
});
const pendingCongratulations = profileQuery.data?.pendingTournamentCongratulations ?? [];
const activeCongratulation = pendingCongratulations[0] ?? null;
```

On mutation success, remove only the acknowledged ID from the `['profile', 'sections']` cache so the next record renders immediately. On failure, keep the same record and show a concise retry message. Disable the button while the request is pending to prevent double submission.

- [ ] **Step 4: Render the modal after the Sections content**

Render `RegularSeasonPodiumModal` only when `activeCongratulation !== null`. Do not place this state in localStorage and do not mark a record viewed merely because it was rendered.

- [ ] **Step 5: Run Sections, component, and accessibility regressions**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/SectionsScreen.test.tsx src/tournament/RegularSeasonPodiumModal.test.tsx src/components/AccessibleModal.test.tsx
pnpm --filter @hockey/web exec eslint src/screens/SectionsScreen.tsx src/screens/SectionsScreen.test.tsx src/tournament/RegularSeasonPodiumModal.tsx src/tournament/RegularSeasonPodiumModal.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the Sections integration**

```bash
git add packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
git commit -m "feat(tournaments): show podium queue in sections"
```

---

### Task 6: Full verification and narrow-screen visual QA

**Files:**
- Modify if findings require it: `packages/web/src/app/design-system.css`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified migration, server contracts, responsive modal, and recorded QA evidence.

- [ ] **Step 1: Run formatting and static checks**

Run:

```bash
pnpm exec prettier --check packages/server/src/tournament/podiumCongratulations.ts packages/server/src/routes/me.ts packages/server/src/tournament/routes.ts packages/server/test/tournament/podiumCongratulations.integration.test.ts packages/server/test/routes/me.test.ts packages/web/src/tournament/RegularSeasonPodiumModal.tsx packages/web/src/tournament/RegularSeasonPodiumModal.test.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web lint
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 2: Run focused and full relevant tests**

Run:

```bash
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/server exec vitest run test/tournament/podiumCongratulations.integration.test.ts test/tournament/service.integration.test.ts test/routes/me.test.ts
pnpm --filter @hockey/web exec vitest run src/tournament/RegularSeasonPodiumModal.test.tsx src/screens/SectionsScreen.test.tsx
pnpm --filter @hockey/server test
pnpm --filter @hockey/web test
```

Expected: all enabled tests PASS. Report environment-skipped integration tests explicitly rather than calling them passed.

- [ ] **Step 3: Apply migration to the local database and verify schema**

Run:

```bash
pnpm --filter @hockey/server db:migrate
psql "$DATABASE_URL" -c "\\d+ tournament_regular_podium_congratulation"
```

Expected: migration 095 is applied; the unique constraint and partial pending index exist.

- [ ] **Step 4: Perform rendered QA at narrow widths**

Open the real Sections route with deterministic local fixture data for each place and inspect at widths 323, 340, 360, and 390 px. Verify title wrapping, tournament-name ellipsis, square artwork, reward wrapping, safe-area padding, one visible card surface, button reachability, and no horizontal overflow. Check the browser console for errors.

Do not create or mutate a dev fixture without separate user authorization; this step is local-only.

- [ ] **Step 5: Record evidence and commit any QA-only adjustments**

Append the tested widths, PASS/FAIL results, command outputs, and screenshots/paths to `design-qa.md`. If CSS changed during QA, rerun the focused web tests and typecheck before committing:

```bash
git add design-qa.md packages/web/src/app/design-system.css
git commit -m "test(tournaments): verify podium modal layouts"
```

- [ ] **Step 6: Report readiness without deploying**

Summarize commits, migrations, test counts, skipped tests, and rendered widths. Do not push or deploy unless the user explicitly requests a dev release after reviewing the local result.
