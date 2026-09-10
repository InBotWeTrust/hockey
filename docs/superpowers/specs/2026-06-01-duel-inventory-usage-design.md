# Duel Inventory Usage Design

## Summary

This spec defines the first real usage mechanics for inventory in amateur duels. Inventory effects apply only to duels for now. Daily game and training remain unchanged.

The feature builds on the existing inventory model:

- `admin_inventory_items` stores shop/admin item definitions.
- `user_inventory_item` stores user-owned item resource.
- `user_equipment` stores the user's default equipped loadout.
- `amateur_duel_participant.loadout_snapshot` stores the selected duel loadout.

The new behavior turns inventory from a visual/shop feature into gameplay-affecting duel equipment with server-authoritative, deterministic validation where it can affect shot results or whether a shot is allowed.

## Goals

- Add duel-only effects for sticks, skates, and nutrition.
- Make all inventory parameters editable in admin.
- Keep the current duel loadout flow: choose inventory on the rink, press `Готов`, then inventory is locked for the duel.
- Snapshot item effects when the user presses `Готов` so active duels are not changed by later admin edits.
- Preserve deterministic client/server shot logic. Anything that changes the shot result or blocks a shot must be reproducible on server.

## Non-Goals

- No inventory effects in daily game.
- No inventory effects in training.
- No full economy rebalance beyond the item values listed here.
- No real-money purchase changes.
- No new item visuals beyond using existing inventory artwork unless a separate asset task is requested.

## Inventory Items

### Sticks

All three sticks are the same model, `Ультимейт Ван`, with different resource amounts. They all add `+10` to puck flight speed.

| Item | Price | Resource | Effect |
| --- | ---: | ---: | --- |
| Ультимейт Ван 1 | 1490 coins | 1300 shots | +10 puck speed |
| Ультимейт Ван 2 | 2490 coins | 1950 shots | +10 puck speed |
| Ультимейт Ван 3 | 3740 coins | 2500 shots | +10 puck speed |

The current price-per-shot balance is intentionally left as specified. Larger packs last longer but are not required to be more cost-efficient in this version.

### Skates

Default skates have short random stumbles during active duel movement.

`Старт` skates:

- price: 2990 coins;
- remove stumble events while available;
- consume durability based on player movement distance.

Initial default-skate stumble tuning:

- interval: deterministic random between 25 and 45 seconds of active movement;
- duration: deterministic random between 250 and 400 ms;
- during a stumble the player briefly slows down and cannot shoot.

The exact interval and duration ranges must be admin-editable.

### Nutrition

| Item | Price | Resource |
| --- | ---: | ---: |
| Изотоник | 1490 coins | 140 active minutes |
| Энерго-заряд | 2490 coins | 250 active minutes |
| Энерго-комплекс | 3490 coins | 360 active minutes |

Nutrition prevents or significantly delays fatigue while it is available. Nutrition is consumed by active period time multiplied by player-speed pressure.

When nutrition runs out during an active period:

1. The player is slowed for 2 seconds.
2. The player then fully stops for 5 seconds.
3. Shooting is blocked during the 5-second stop.
4. After the stop, the player continues without nutrition and can accumulate normal fatigue.

The slowdown duration, stop duration, and fatigue parameters must be admin-editable.

## Admin Parameters

Each inventory item must expose editable gameplay parameters. Existing columns can be reused where they fit, but the model needs enough structured data to express different charge units.

Required editable fields:

- title;
- description;
- photo URL;
- active/deleted state;
- item kind: `stick`, `skates`, `nutrition`;
- rarity/display tier if still used by UI;
- coin price;
- resource amount per purchase;
- resource unit: `shot`, `distance`, or `energy_ms`;
- puck speed delta;
- shooter speed multiplier or delta;
- fatigue prevention/reduction settings;
- stumble enabled flag;
- stumble interval min/max ms;
- stumble duration min/max ms;
- nutrition depletion slowdown ms;
- nutrition depletion stop ms;
- power score if duel templates still use it.

Admin edits apply only to future `Готов` snapshots. Existing active duel snapshots must remain stable.

## Resource Accounting

Inventory resource is stored per user and item.

### Stick Resource

Stick resource is counted in shots.

- A selected non-default stick consumes `1` resource per accepted duel shot.
- If the selected stick has no remaining resource, it behaves as default equipment.
- The `+10` puck speed effect applies only while a selected stick has remaining resource.
- The server must be the source of truth for final charge decrement.

### Skate Resource

Skate resource is counted by movement distance, not wall-clock time.

Use a normalized distance unit:

```text
distanceUnits = playerDistanceMovedPx / baseLaneWidthPx
```

This means faster movement and longer active play consume skates faster, while waiting, loadout selection, breaks, and inactive screens do not consume skates.

If selected skates run out:

- stumble protection stops applying;
- the player falls back to default-skate stumble behavior;
- no forced stop is required just because skates ended.

### Nutrition Resource

Nutrition resource is counted in energy milliseconds.

Consumption:

```text
energyCostMs = activePeriodMs * speedPressureMultiplier
```

`speedPressureMultiplier` starts at `1.0` for default speed and increases when the player moves faster than baseline due to duel presets or future equipment effects.

Waiting, loadout selection, breaks, and inactive screens do not consume nutrition.

## Duel Flow

Inventory remains part of the existing duel-ready flow.

1. User accepts or creates a duel.
2. User lands on the duel rink.
3. Before pressing `Готов`, the user can choose available inventory.
4. By default, the loadout is taken from `user_equipment`.
5. Inventory icons remain the same normal round duel icons.
6. An item icon is clickable only if the user has available resource for that item.
7. After `Готов`, the loadout is locked.
8. `readyAmateurDuel(matchId, loadout)` sends selected item IDs.
9. Server snapshots selected item definitions and resource state into the participant.
10. Period gameplay uses the snapshot.

No inventory is consumed before active duel gameplay.

## Deterministic Gameplay Model

Because inventory can affect shot speed and shot availability, duel condition logic must be reproducible on both client and server.

Add a small duel-condition layer to `@hockey/game-core` or another shared pure module that obeys game-core constraints:

- no `Math.random()`;
- no `Date.now()`;
- no timers;
- deterministic by seed and explicit inputs;
- pure functions only.

Suggested API:

```ts
type DuelPlayerConditionInput = {
  seed: string;
  userId: string;
  periodNumber: number;
  elapsedMs: number;
  loadoutSnapshot: DuelLoadoutEffectsSnapshot;
  movementDistancePx: number;
  baseLaneWidthPx: number;
  baselineShooterSpeed: number;
  currentShooterSpeed: number;
  resourceSnapshot: DuelResourceSnapshot;
};

type DuelPlayerCondition = {
  puckSpeedDelta: number;
  shooterSpeedMultiplier: number;
  canShoot: boolean;
  status:
    | 'normal'
    | 'stumble'
    | 'tired'
    | 'nutrition_slowdown'
    | 'exhausted_stop';
};
```

The server uses the same function to validate:

- whether a shot was allowed at the claimed tap time;
- whether the puck speed modifier was valid;
- whether a stumble or exhausted stop should block the shot.

The client uses the same function to render:

- player speed changes;
- stumble state;
- tired state;
- nutrition slowdown;
- exhausted stop;
- disabled shot button.

## Shot Resolution

Stick puck-speed bonus must be included in shot resolution input so client and server resolve the same shot.

Current `resolveShot` already accepts `puckSpeedPerMs` through shot input. The duel layer should calculate the effective puck speed before the shot is resolved.

For a selected active stick:

```text
effectivePuckSpeed = basePuckSpeed + stickPuckSpeedDelta
```

The exact unit conversion from `+10` to `puckSpeedPerMs` must be defined in implementation. It should be a single shared conversion in game-core, not duplicated in UI and server routes.

## Server Persistence

The existing `loadout_snapshot`, `inventory_effects_snapshot`, and `inventory_report` fields should be reused if possible.

Expected snapshot content:

- selected item IDs;
- selected item titles;
- item kind;
- resource unit;
- resource available when the user pressed `Готов`;
- effect values;
- admin-tuned timings used by this duel.

Expected report content per participant/period:

- stick shots consumed;
- skate distance consumed;
- nutrition energy consumed;
- whether any item ran out;
- final player condition events if needed for audit/debugging.

Final user inventory decrement should happen server-side as accepted gameplay is recorded. If a duel is abandoned, only already consumed resource should be deducted.

## UI

### Loadout Selection

On the duel rink before `Готов`:

- show stick, skates, and nutrition icons;
- use the same round visual style as current duel inventory icons;
- colored and clickable when the user has an available item;
- gray and non-clickable when the user has no available item;
- show remaining resource in compact form:
  - sticks: shots remaining;
  - skates: durability/distance remaining;
  - nutrition: minutes remaining.

After `Готов`, the inventory selection is locked.

### In-Game Status

The rink/tableau shows short statuses when the corresponding condition is active:

- `Споткнулся`;
- `Усталость`;
- `Энергия заканчивается`;
- `Выдохся`;
- `Клюшка закончилась`;
- `Коньки сточились`.

The shot button is disabled when `canShoot === false`, especially during stumble and exhausted stop.

## Edge Cases

- If selected equipment runs out before or during a period, the player falls back to default behavior for that slot.
- If a user selects an item and another action consumes it before `Готов`, the server rejects ready with a clear inventory error and asks the user to reselect.
- If admin edits an item while a duel is active, the active duel continues with its snapshot.
- If client and server disagree about `canShoot`, the server rejects the shot and the client reconciles from fresh duel state.
- If a user has no purchased inventory, the duel remains playable with default equipment.

## Testing

Server tests:

- ready snapshots selected item definitions and resource state;
- stick consumes one resource per accepted shot;
- stick `+10` speed changes shot resolution deterministically;
- default skates generate deterministic stumble windows from seed;
- `Старт` skates disable stumble while resource remains;
- skates consume resource from movement distance only;
- nutrition consumes active time multiplied by speed pressure;
- nutrition depletion triggers 2-second slowdown then 5-second stop;
- server rejects shots during stumble or exhausted stop;
- no resource is consumed during waiting, loadout selection, or breaks.

Client tests:

- default loadout comes from profile equipment;
- available items are clickable before `Готов`;
- unavailable items are gray and non-clickable;
- inventory is locked after `Готов`;
- shot button is disabled during stumble/exhausted stop;
- status labels render for stumble, fatigue, nutrition depletion, and exhausted stop.

Shared game-core tests:

- condition function is deterministic for same seed/input;
- different seed/user/period creates different stumble timing;
- speed pressure increases nutrition consumption;
- depletion timeline transitions from normal to slowdown to exhausted stop to tired/normal.

## Rollout

Implement behind duel-only behavior. Do not enable effects in daily game or training.

Suggested rollout order:

1. Add item parameter schema and seed/update admin inventory items.
2. Add shared deterministic duel condition logic.
3. Snapshot loadout effects on `Готов`.
4. Apply stick speed and server shot validation.
5. Apply skate stumble and nutrition depletion UI/server validation.
6. Add resource decrement and inventory report.
7. Polish UI copy and status display.
