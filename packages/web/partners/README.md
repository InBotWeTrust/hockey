# Partners page

Public presentation at `/partners` and `/partners/`. Vite builds a separate HTML entry; it does not import the React app, auth or Pixi. The landing's trial links go to `/try`, a public alias of the existing demo. The login screen keeps `/demo`.

## Replace temporary media

1. Put approved public media in `public/partners/media/` (strip personal data from screenshots).
2. In `src/partners/media.ts`, set `trailer.src` and the screenshot paths for `city`, `shot`, `duel`, `tournament`, `locker`, `bar`.
3. Use a web-compatible MP4 (H.264/AAC) and a poster; test actual playback on target devices. The player uses controls, playsInline and preload=none, with no autoplay.
4. Screenshots replace their labelled placeholders and open in the keyboard-accessible image viewer. Without dialog support, the full image link still works. Without JavaScript, content and navigation remain available with honest pending-media labels.

The current artwork derivatives come from `sprites/login-rink-journey-v9.webp` and `bar/city-v5/hall-night-v5.webp`. The integration is a labelled schematic, using a neutral stick outline and an existing game item; it is not a screenshot or an actual branded item. `share.jpg` is 1200x630. No new AI artwork is used.

## Validation

Run from repository root:

```sh
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/web exec vitest run src/partners/page.test.ts src/app/App.test.tsx src/performance/pwaCachePolicy.test.ts src/stores/demoSession.test.ts
pnpm --filter @hockey/web build
pnpm --filter @hockey/web exec vite preview --host 127.0.0.1 --port 4198
```

Open `http://127.0.0.1:4198/partners?utm_source=review&utm_medium=local`. Only allowlisted UTM tags (at most 100 characters each) propagate to `/try`; other query parameters are discarded. No new anonymous analytics receiver or event storage is introduced; visit/click counts are not collected by this page.

Before release, supply final media, verify the described features against the target environment, and test Telegram/VK/MAX embedded browsers on actual devices. Existing installed PWA workers need their normal update to pick up the new navigation exclusion. Deployment and Russian release notes approval are separate user-authorized steps.
