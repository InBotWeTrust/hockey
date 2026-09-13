# Profile Experience Rating Design

## Goal

Make inventory resource badges understandable at a glance and turn the profile experience balance into an entry point to a scalable, mobile-friendly all-player experience rating.

## Scope

The change covers two profile behaviors:

1. Compact resource units in profile inventory artwork badges.
2. An authenticated experience leaderboard modal opened from the profile's `Experience` balance.

It does not change experience accrual, inventory consumption, player profiles, duel ratings, or any admin behavior.

## Inventory resource badges

Profile inventory artwork badges use a compact value plus unit:

- recovery: `30 min`;
- stick: `1 800 sh`;
- skates: `14 817 rides`;
- nutrition: minutes remain `156 min`.

In the Russian UI the rendered labels are `мин`, `бр`, and `пр` respectively. Full resource wording remains unchanged in descriptive text such as inventory pickers and stock details. A shared formatter owns the compact badge labels so profile cards do not duplicate unit logic.

## Experience rating entry point

The complete experience balance cell in the profile passport becomes a button while retaining the existing label, icon, amount, colors, and three-column layout. It has the accessible name `Открыть рейтинг по опыту` and opens a standard `AccessibleModal` titled `Рейтинг по опыту`.

The modal follows the project modal invariants: blurred full-screen backdrop, frosted centered card, title and close button in the header row. The card fits the mobile viewport. Its leaderboard viewport has a fixed responsive height sufficient for approximately 10 to 12 compact rows and scrolls internally; loading additional players never increases the modal height.

## Rating rows

Each row contains:

- ordinal place;
- circular avatar and display name;
- formatted experience amount.

The experience column is headed `Опыт`; values do not append a second explanatory unit to every row. Missing avatars render the player's first display-name letter. An image that fails to load switches to the same fallback. Long names truncate on one line without moving the experience column.

Players are ordered by:

1. `users.experience DESC`;
2. `users.lifetime_goals_total DESC` when experience is equal;
3. career shooting accuracy (`lifetime_goals_total / lifetime_shots_total`) descending when experience and goals are equal;
4. `users.id ASC` as the stable final tie-breaker.

Accuracy is zero when the player has no recorded shots.

Places use `row_number` semantics, so equal experience values still receive distinct deterministic positions.

The current player's normal row uses the same blue emphasis family as the current-user row in duel ratings. Rows are informational and do not navigate to another profile.

## Pagination and server contract

Add authenticated `GET /profile/experience-rating` with query parameters:

- `limit`: optional integer from 1 to 50, default 30;
- `cursor`: optional opaque cursor returned by the previous response.

The response is:

```ts
type ExperienceRatingResponse = {
  rows: Array<{
    place: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    experience: number;
  }>;
  nextCursor: string | null;
  currentUser: {
    place: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    experience: number;
  };
};
```

The cursor encodes the final row's experience, goals, exact SQL accuracy value, user ID, and place. Subsequent pages use keyset conditions matching the complete sort order rather than `OFFSET`, preventing later pages from becoming slower as the user scrolls. The server fetches `limit + 1` rows to determine `nextCursor` and obtains the authenticated player's row and rank in the same request handler. Invalid cursors return the project's standard `400 bad_request` response.

Add a database index on `(experience DESC, lifetime_goals_total DESC, id ASC)` so the leading page and rank conditions use indexed ranking fields; accuracy remains a calculated career ratio. The migration is additive and does not rewrite player values.

Experience may change while a modal is open. The list is a live best-effort snapshot: a refresh reopens from the first page, while an already open list keeps its loaded order. Exact cross-page snapshot isolation is deliberately out of scope.

## Client loading behavior

The client uses TanStack Query infinite-query state with a page size of 30. Opening the modal requests the first page. An intersection sentinel near the bottom requests the next page once; concurrent duplicate requests are prevented by the query state. Scrolling can continue until `nextCursor` is null.

The first load shows a compact loading state within the fixed list viewport. A first-page failure shows an inline error and `Повторить` action. A later-page failure preserves loaded rows and shows a retry action at the bottom. An empty rating is not expected because the authenticated player exists, but the modal still renders `Рейтинг пока пуст` defensively.

## Current-player pinned row

The API always returns `currentUser`, independently of the loaded page. The client observes the current player's normal row relative to the internal scroll viewport:

- while that normal row intersects the viewport, only the normal highlighted row is shown;
- while it is absent or outside the viewport, a highlighted copy is pinned below the scroll viewport;
- the pinned copy is not part of the scrolling table and does not cover its last row.

This makes the user's own position continuously available without duplicating it when visible. The pinned row uses the same columns and widths as ordinary rows.

## Accessibility

The experience balance entry is keyboard operable. The modal retains focus trapping and Escape/close behavior through `AccessibleModal`. The list uses table semantics with a sticky header. Loading and error messages are announced, and the current player's row exposes a readable `aria-label` including place, name, and experience.

## Testing

Server integration tests cover default and explicit limits, deterministic ordering and places, cursor pagination without duplicate rows, inclusion of the current user outside the first page, avatar nullability, and invalid cursor rejection.

Web tests cover the compact badge units, opening and closing the modal, first-page rendering, current-user highlighting, pinned-row visibility rules, next-page loading from the sentinel, no modal-height growth contract through the relevant classes, avatar fallback, and retry states.

Manual verification uses a narrow mobile viewport and confirms that approximately 10 to 12 rows fit, the header stays visible, scrolling loads another page, the pinned current-player row disappears exactly while its normal row is visible, and no profile or inventory layout shifts.
