# Recovery Kits Design
## Product

The amateur shop gains three single-use non-equippable products under a new `Восстановление` section:

| Product | Effect | Price |
| --- | ---: | ---: |
| Малый набор для восстановления | -15 minutes | 600 coins |
| Набор для восстановления | -30 minutes | 1,000 coins |
| Большой набор для восстановления | -60 minutes | 1,800 coins |

The one-hour kit is cheaper than two 30-minute kits, while four 15-minute kits cost more than one one-hour kit. Stock has no expiry or cap.

## Applicability

Kits apply only to a `recent_gameplay` lock. They never bypass `active_daily`, `active_classic`, or `scheduled_tournament` locks. Each application is attached to the exact latest `shot_session` that created the current recovery window. Recovery cannot be reduced below zero. A later accepted shot creates a fresh one-hour recovery window and does not inherit previous reductions.

If the lock expires before the transaction is processed, no item or currency is spent. Applying a kit and optionally purchasing it are one atomic, idempotent transaction. A repeated request with the same idempotency key returns the same outcome without a second debit.

## UX

- The shop shows `Восстановление` below equipment with all three products.
- The profile heading becomes `Инвентарь`. Its compact card becomes a horizontal snap-scrolling row: three equipment slots remain fully visible and the fourth recovery card peeks from the right. The recovery card remains visible at zero stock and opens the shop.
- The duel locker shows recovery stock as a separate fourth category but never offers it as loadout.
- Game HUD equipment circles remain strictly stick, skates, and nutrition.
- A daily or Classic screen blocked by `recent_gameplay` offers `Сократить восстановление`. A modal lists owned kits and allows confirmed use. With zero stock it offers confirmed purchase-and-use. Insufficient balance leads to the bank.
- After success, inventory and affected gameplay state refresh immediately.

## Administration and history

Admin inventory supports kind `recovery`, effect minutes, image, title, description, price, availability, and purchase quantity. Purchases remain `inventory_purchase`; use records appear as `Использован набор для восстановления · −N минут восстановления`.

## Assets

Use the approved coherent blue product series in the existing light-wood locker room:

- 15 minutes: cold pack and one tape roll.
- 30 minutes: centered compact pouch, cold pack, tapes, towel.
- 60 minutes: large varied bag with cold packs, tape, towel, knee sleeve, recovery ball, cooling balm, and gel.
