# Shop Categories Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shop's mixed product feed with four navigable product categories while keeping the main `Товары / Банк / История` switcher and preserving the existing purchase economy.

**Architecture:** Keep `InventoryScreen` as the route owner and encode the selected goods category in the `category` URL search parameter. Extract the category metadata and catalog presentation into focused web components, while reusing the existing product cards, bank, history, purchase dialogs, query, and mutation. Add one coherent shop background and four WebP category-zone artworks, then layer existing glass content over them.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Testing Library, Vitest, CSS, WebP assets.

**Spec:** `docs/superpowers/specs/2026-09-11-shop-categories-redesign.md`

## Global Constraints

- Keep the `Товары / Банк / История` switcher on the main shop screen.
- Hide that switcher only while a goods category is open.
- Preserve all existing prices, balances, bank packages, transaction history, purchase requests, dialogs, and notices.
- Use only the four existing inventory kinds: `stick`, `skates`, `nutrition`, and `recovery`.
- Use generated WebP artwork optimized for mobile loading; do not redraw existing product images.
- Use the shared `.icon-btn` for back actions and do not add icons to ordinary text buttons.
- Do not touch arena cube artwork or gameplay assets.
- Do not add discounts, timers, certificates, promotional popups, or new sales mechanics.

---

### Task 1: Category navigation contract

**Files:**
- Create: `packages/web/src/screens/inventoryShopCategories.ts`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`

**Interfaces:**
- Produces: `type ShopCategory = InventoryKind`.
- Produces: `SHOP_CATEGORY_META: Record<ShopCategory, { title: string; description: string; artworkUrl: string; className: string }>`.
- Produces: `parseShopCategory(value: string | null): ShopCategory | null`.
- Consumes: the existing `InventoryKind` and `InventoryState` API types.

- [ ] **Step 1: Add failing unit coverage for category parsing**

Create focused tests alongside the screen tests:

```ts
import { parseShopCategory } from './inventoryShopCategories.js';

it.each(['stick', 'skates', 'nutrition', 'recovery'] as const)(
  'accepts the %s shop category',
  (category) => expect(parseShopCategory(category)).toBe(category),
);

it.each([null, '', 'bank', 'unknown'])(
  'rejects invalid shop category %s',
  (category) => expect(parseShopCategory(category)).toBeNull(),
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @hockey/web test -- InventoryScreen.test.tsx`

Expected: FAIL because `inventoryShopCategories.ts` does not exist.

- [ ] **Step 3: Implement typed category metadata and parser**

Create `inventoryShopCategories.ts` with the exact four categories and stable URLs:

```ts
import type { InventoryKind } from '../api/inventory.js';

export type ShopCategory = InventoryKind;

export const SHOP_CATEGORY_ORDER: ShopCategory[] = [
  'stick',
  'skates',
  'nutrition',
  'recovery',
];

export const SHOP_CATEGORY_META = {
  stick: {
    title: 'Клюшки',
    description: 'Выбрать клюшку',
    artworkUrl: '/shop/categories/sticks.webp',
    className: 'shop-zone--sticks',
  },
  skates: {
    title: 'Коньки',
    description: 'Выбрать коньки',
    artworkUrl: '/shop/categories/skates.webp',
    className: 'shop-zone--skates',
  },
  nutrition: {
    title: 'Питание',
    description: 'Выбрать питание',
    artworkUrl: '/shop/categories/nutrition.webp',
    className: 'shop-zone--nutrition',
  },
  recovery: {
    title: 'Восстановление',
    description: 'Выбрать набор',
    artworkUrl: '/shop/categories/recovery.webp',
    className: 'shop-zone--recovery',
  },
} satisfies Record<ShopCategory, {
  title: string;
  description: string;
  artworkUrl: string;
  className: string;
}>;

export function parseShopCategory(value: string | null): ShopCategory | null {
  return value !== null && SHOP_CATEGORY_ORDER.includes(value as ShopCategory)
    ? (value as ShopCategory)
    : null;
}
```

- [ ] **Step 4: Add failing screen tests for the main and nested states**

Update the render helper to accept an initial URL and cover these contracts:

```ts
function renderInventory(initialEntry = '/inventory'): void {
  // existing providers
  // <MemoryRouter initialEntries={[initialEntry]}>
}

it('keeps the main tabs and shows four goods categories', async () => {
  mockInventoryFetch(inventoryWithItems);
  renderInventory();

  expect(await screen.findByRole('tab', { name: 'Товары' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Открыть раздел Клюшки' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Открыть раздел Коньки' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Открыть раздел Питание' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Открыть раздел Восстановление' })).toBeInTheDocument();
  expect(screen.queryByText('Бронзовая клюшка')).not.toBeInTheDocument();
});

it('opens one category and hides the main shop tabs', async () => {
  mockInventoryFetch(inventoryWithItems);
  renderInventory('/inventory?category=stick');

  expect(await screen.findByRole('heading', { name: 'Клюшки' })).toBeInTheDocument();
  expect(screen.queryByRole('tablist', { name: 'Разделы магазина' })).toBeNull();
  expect(screen.getByText('Бронзовая клюшка')).toBeInTheDocument();
  expect(screen.queryByText('Серебряные коньки')).toBeNull();
});

it('returns from a category to the goods overview', async () => {
  mockInventoryFetch(inventoryWithItems);
  renderInventory('/inventory?category=stick');

  fireEvent.click(await screen.findByRole('button', { name: 'К разделам магазина' }));
  expect(screen.getByRole('heading', { name: 'Магазин' })).toBeInTheDocument();
  expect(screen.getByRole('tablist', { name: 'Разделы магазина' })).toBeInTheDocument();
});

it('falls back to the goods overview for an invalid category', async () => {
  mockInventoryFetch(inventoryWithItems);
  renderInventory('/inventory?category=bank');

  expect(await screen.findByRole('heading', { name: 'Магазин' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Открыть раздел Клюшки' })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the focused test and verify the new assertions fail**

Run: `pnpm --filter @hockey/web test -- InventoryScreen.test.tsx`

Expected: FAIL because the existing `GoodsTab` still renders every product and the screen does not read `category`.

- [ ] **Step 6: Implement category-aware navigation**

In `InventoryScreen.tsx`:

- use `useSearchParams()` to read and set `category`;
- derive `selectedCategory = activeTab === 'goods' ? parseShopCategory(searchParams.get('category')) : null`;
- clear the category query parameter whenever `ShopTabs` changes to `bank` or `history`;
- make the header back button clear the category first and navigate to `/sections` only from the main level;
- render `ShopTabs` only when `selectedCategory === null`;
- replace `GoodsTab` with `GoodsCategoryOverview` on the main level and `GoodsCategoryCatalog` on the nested level;
- reuse `InventoryProductCard`, `uniqueShopItems`, detail state, and purchase state without changing their behavior.

Use an explicit URL update that preserves unrelated search parameters:

```ts
const openCategory = (category: ShopCategory): void => {
  const next = new URLSearchParams(searchParams);
  next.set('category', category);
  setSearchParams(next);
};

const closeCategory = (): void => {
  const next = new URLSearchParams(searchParams);
  next.delete('category');
  setSearchParams(next, { replace: true });
};
```

- [ ] **Step 7: Run the focused screen suite**

Run: `pnpm --filter @hockey/web test -- InventoryScreen.test.tsx`

Expected: PASS for main tabs, four category buttons, filtering, invalid URLs, return navigation, existing bank/history flows, details, and purchases.

- [ ] **Step 8: Commit the navigation contract**

```bash
git add packages/web/src/screens/inventoryShopCategories.ts packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx
git commit -m "feat(shop): add navigable product categories"
```

---

### Task 2: Shop artwork and responsive presentation

**Files:**
- Create: `packages/web/public/shop/shop-background.webp`
- Create: `packages/web/public/shop/categories/sticks.webp`
- Create: `packages/web/public/shop/categories/skates.webp`
- Create: `packages/web/public/shop/categories/nutrition.webp`
- Create: `packages/web/public/shop/categories/recovery.webp`
- Modify: `packages/web/src/app/design-system.css`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`

**Interfaces:**
- Consumes: `SHOP_CATEGORY_META[*].artworkUrl` and `className` from Task 1.
- Produces: `.inventory-shop-screen`, `.inventory-category-grid`, `.inventory-category-card`, and `.inventory-category-catalog` presentation classes.
- Preserves: `.inventory-product-card`, `.inventory-bank-card`, `.inventory-history-*`, shared `.glass`, and `.icon-btn` contracts.

- [ ] **Step 1: Write failing presentation assertions**

Add assertions that validate semantic image delivery and category styling without testing implementation-only inline styles:

```ts
it('uses the shop background and WebP artwork for each category', async () => {
  mockInventoryFetch(inventoryWithItems);
  const { container } = renderInventory();

  expect(await screen.findByRole('main')).toHaveClass('inventory-shop-screen');
  const categoryImages = container.querySelectorAll<HTMLImageElement>('.inventory-category-card img');
  expect(categoryImages).toHaveLength(4);
  expect([...categoryImages].every((image) => image.src.endsWith('.webp'))).toBe(true);
});

it('shows a category-local empty state without removing the other shop data', async () => {
  mockInventoryFetch({
    ...inventoryWithItems,
    items: { ...inventoryWithItems.items, skates: [] },
  });
  renderInventory('/inventory?category=skates');

  expect(await screen.findByText('В разделе пока нет товаров')).toBeInTheDocument();
  expect(screen.getByLabelText('Монеты: 1 000')).toBeInTheDocument();
});
```

Change `renderInventory` to return Testing Library's `RenderResult` so the test can inspect `container`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @hockey/web test -- InventoryScreen.test.tsx`

Expected: FAIL because the new shop and category classes/artwork are absent.

- [ ] **Step 3: Generate the coherent WebP shop artwork set**

Use the approved locker-room visual language as a style reference, not as an edit source. Generate one vertical/mobile hockey retail interior plus four consistent category-zone images. Requirements for every image:

- realistic premium hockey shop, cool neutral daylight and restrained blue accents;
- no people, no readable text, no logos, no prices, no UI, no watermarks;
- uncluttered center/lower area so glass cards remain legible;
- shared camera height, materials, lighting, and color grade across the set;
- category-specific content limited to sticks, skates, sports nutrition, or recovery supplies;
- no arena, ice surface, rink boards, locker-room player equipment slots, or cube imagery.

Export exactly to the five paths listed above as WebP. Verify each with:

```bash
file packages/web/public/shop/shop-background.webp packages/web/public/shop/categories/*.webp
du -h packages/web/public/shop/shop-background.webp packages/web/public/shop/categories/*.webp
```

Expected: every file reports WebP image data; individual assets remain practical for mobile delivery and visually sharp at the rendered card size.

- [ ] **Step 4: Implement the responsive visual layer**

Add `inventory-shop-screen` to the root `<main>`, and make category overview buttons use real `<img>` elements with empty `alt` because the accessible name is carried by the button.

In `design-system.css`:

```css
.inventory-shop-screen {
  background:
    linear-gradient(180deg, rgba(7, 18, 34, 0.2), rgba(7, 18, 34, 0.56)),
    url('/shop/shop-background.webp') center top / cover fixed no-repeat;
}

.inventory-category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.inventory-category-card {
  position: relative;
  min-height: 190px;
  overflow: hidden;
  border-radius: 24px;
}

.inventory-category-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.inventory-category-card::after {
  content: '';
  position: absolute;
  inset: 38% 0 0;
  background: linear-gradient(180deg, transparent, rgba(2, 8, 23, 0.78));
}

.inventory-category-card__copy {
  position: absolute;
  z-index: 1;
  right: 14px;
  bottom: 14px;
  left: 14px;
  color: #fff;
  text-align: left;
}

@media (max-width: 380px) {
  .inventory-category-card {
    min-height: 168px;
  }
}
```

Tune only contrast, crop, spacing, and responsive sizing during rendered QA; keep the two-column, no-horizontal-scroll structure.

- [ ] **Step 5: Run focused tests and production build**

Run:

```bash
pnpm --filter @hockey/web test -- InventoryScreen.test.tsx
pnpm --filter @hockey/web build
```

Expected: PASS, with Vite including all referenced WebP paths and no TypeScript errors.

- [ ] **Step 6: Commit artwork and presentation**

```bash
git add packages/web/public/shop packages/web/src/app/design-system.css packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx
git commit -m "feat(shop): add hockey retail presentation"
```

---

### Task 3: Regression and rendered acceptance

**Files:**
- Modify only if verification reveals a scoped defect: `packages/web/src/screens/InventoryScreen.tsx`
- Modify only if verification reveals a scoped defect: `packages/web/src/app/design-system.css`
- Modify only if contract coverage is missing: `packages/web/src/screens/InventoryScreen.test.tsx`

**Interfaces:**
- Consumes: completed main and nested shop flows from Tasks 1 and 2.
- Produces: verified behavior at desktop and narrow mobile widths with no server or economy changes.

- [ ] **Step 1: Run the complete web regression suite**

Run:

```bash
pnpm --filter @hockey/web test
pnpm --filter @hockey/web build
```

Expected: PASS with no failing existing shop, profile, sections, bank, history, or purchase tests.

- [ ] **Step 2: Start the existing local stack and inspect the main shop**

Open `/inventory` in the internal browser at a narrow mobile viewport. Verify:

- header and balances remain inside the viewport;
- `Товары / Банк / История` is present;
- exactly four category cards are visible, legible, and fully clickable;
- the generated background is sharp and does not compete with text;
- no horizontal scroll is introduced.

- [ ] **Step 3: Inspect each nested category**

Open each of:

```text
/inventory?category=stick
/inventory?category=skates
/inventory?category=nutrition
/inventory?category=recovery
```

Verify the title, balance, matching products, correct artwork/crop, hidden main switcher, and `К разделам магазина` back behavior. Confirm browser history returns to the preceding view and a reload preserves the chosen valid category.

- [ ] **Step 4: Inspect unchanged commerce flows**

From the main shop:

- switch to `Банк`, then back to `Товары` and confirm no stale category remains;
- switch to `История`, use all four history filters, and load another page when available;
- open one affordable and one unaffordable product;
- verify details, confirmation, disabled state, purchase notice, and balance update retain existing behavior.

- [ ] **Step 5: Verify empty and invalid states**

Use the unit fixtures for an empty shop and a single empty category, then navigate to `/inventory?category=unknown`. Confirm the two empty messages differ appropriately and an invalid category safely falls back to the four-section overview.

- [ ] **Step 6: Review the final diff and working tree scope**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~2..HEAD
```

Expected: only the planned shop source, test, CSS, documentation, and five WebP assets are part of this change; pre-existing unrelated untracked files remain untouched.

- [ ] **Step 7: Commit any verification-only corrections**

If rendered QA required scoped corrections:

```bash
git add packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "fix(shop): polish category navigation"
```

If no correction was required, do not create an empty commit.

---

### Task 4: Match category cards to the project and replace the shop background

Final user ruling supersedes earlier visual revisions: reuse the exact `DailyScreen` amateur card and generate four square opaque category scenes with their own full backgrounds. Existing transparent product icons and the rejected transparent category compositions are not the final deliverables.

Add the root-only `Товары` section label using exactly the existing Bank/History `section-label` and margin, grouped with the category grid in a `display: grid; gap: 8px` section. Verify matching label style and tab-specific visibility.

**Files:**
- Replace: `packages/web/public/shop/shop-background.webp`
- Replace: `packages/web/public/shop/categories/{sticks,skates,nutrition,recovery}.webp`
- Modify: `packages/web/src/screens/inventoryShopCategories.ts`
- Modify: `packages/web/src/screens/InventoryScreen.tsx`
- Modify: `packages/web/src/screens/InventoryScreen.test.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Preserve: the four category IDs, URLs, category query navigation, bank/history tabs, and category-specific inner accents.
- Change: category metadata retains category artwork URLs and no longer exposes secondary description copy.
- Change: `.inventory-category-card` uses `section-card-surface amateur-hub-card`, `amateur-hub-card__art`, `amateur-hub-card__copy`, and `card-chevron`: 86×86 artwork left, title and unique product count in the middle, chevron right.

- [ ] **Step 1: Add failing tests for the approved card contract**

Add assertions that each category card contains exactly one visible category name, no `Выбрать…` secondary copy, the correct unique-item count (including duplicate source items), a category WebP, and a decorative chevron. Assert the exact shared `section-card-surface amateur-hub-card` structure and existing dimensions, without independent card CSS.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @hockey/web exec vitest run src/screens/InventoryScreen.test.tsx`

Expected: FAIL because the old metadata and cards still render secondary copy and use two tall columns without the shared wide-card structure.

- [ ] **Step 3: Generate square category scenes and a new shop background**

Generate four distinct square scenes, each with a full opaque hockey-shop display background, no text, logos, windows, people or watermark:

- `/shop/categories/sticks.webp` — several hockey sticks;
- `/shop/categories/skates.webp` — a pair of hockey skates;
- `/shop/categories/nutrition.webp` — sports nutrition containers;
- `/shop/categories/recovery.webp` — sports bag and recovery kit.

Generate one new vertical/mobile shop background with the built-in image tool. It must clearly show a closed hockey equipment store with visible racks of sticks, skates, helmets, jerseys and protective gear on the side and back walls. Keep the center calmer for UI. Avoid windows, forest or outdoor views, office-like emptiness, people, readable text, logos, price tags and watermarks. Save the accepted result as `packages/web/public/shop/shop-background.webp`.

- [ ] **Step 4: Implement minimal compact cards**

Remove `description` from category metadata and markup. Use a single-column grid with four instances of the exact `section-card-surface amateur-hub-card` structure from `DailyScreen`: shared surface and border, 116px height, 86×86 image on the left, title and unique-item count in the middle, and existing chevron on the right. Preserve category-specific artwork on internal catalog screens.

- [ ] **Step 5: Run GREEN and build**

Run:

```bash
pnpm --filter @hockey/web exec vitest run src/screens/InventoryScreen.test.tsx
pnpm --filter @hockey/web build
```

Expected: PASS.

- [ ] **Step 6: Rendered QA**

At 320px and 390px compare the cards directly with `/sections`: shared material, radius, artwork size, typography, chevron and pressed behavior must match. Verify all four rows, title/count readability, no horizontal scroll, and enough new hockey-shop background visible around the cards. Open all four categories and confirm their product lists and visual accents still work.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-shop-categories-redesign.md docs/superpowers/plans/2026-09-11-shop-categories-redesign.md packages/web/public/shop/shop-background.webp packages/web/src/screens/inventoryShopCategories.ts packages/web/src/screens/InventoryScreen.tsx packages/web/src/screens/InventoryScreen.test.tsx packages/web/src/app/design-system.css
git commit -m "feat(shop): simplify category cards"
```
