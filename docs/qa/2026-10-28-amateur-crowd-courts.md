# Amateur court occupancy integration

Base: origin/dev at 803d9649ee67089f5246f7c3626f3849e4ac21d9.
Local-only delivery. No push, PR, merge, deployment or database mutation.

## Behavior

- Daily game: empty rebuilt arena.
- Ordinary amateur duel: half-filled arena.
- Standard amateur tournament duel and classic tournament: full arena.
- Bar spectator views follow the duel/tournament selection.
- Frozen custom tournament home-arena artwork remains unchanged.
- Actors, motion coordinates, balance and the beginner training court remain unchanged.

Three opaque 1212x2000 WebPs total 768966 bytes (about 751 KiB).
Content-hashed filenames invalidate old browser/PWA entries without a global cache reset.
Existing 30-day image caching and startup daily-court preload remain in use.
Source provenance and normalization are in packages/web/assets/amateur-central/crowd-variants.json.

## Checks

- Original baseline asset/cache/spectator suites: 23 passed.
- RED before wiring: 4 failed / 25 passed in asset/cache/spectator suites;
  4 selected DailyScreen scenarios failed on the old artwork.
- GREEN: asset/cache/spectator suites 29 passed.
- Entire DailyScreen.test.tsx: 244 passed.
- Web typecheck, root lint, web build and diff check passed.
- All three images: opaque WebP, 1212x2000, below 350 KiB each, filename matches SHA-256.
- Goal line: Y=770 within 1 pixel at X=400 and X=812 in all variants.
- Bottom eleven rows retain ice texture; no letterbox padding.
- Yellow board contour compared to empty variant: half-filled mean 0.77 px / max 1.23 px;
  full mean 0.54 px / max 0.96 px, sampled every 20 px across the image.
- Browser: all three files loaded at 1212x2000 and switched via the local review page,
  which imports the actual runtime artwork constants. This was an artwork preview,
  not a signed-in gameplay match.

## Known suite failures

The standard web wrapper stopped in its initial batch: 3214 passed, 9 failed in 4 files.
All nine failures reproduced with matchCourt.ts, DailyScreen.tsx and SpectatorRink.tsx
restored byte-for-byte to the base revision (9 failed / 11 passed in those four files).
The implementation was then restored and the complete DailyScreen suite passed.
The later isolated wrapper suites did not run after the initial batch failed.

- OpenWindowObservationPlay.test.tsx:
  - explains the first paused opening before completing without a shot
  - lets the player classify a paused frame without a timer
  - marks a perceived opening in a moving clip without shooting
  - submits an untouched moving clip as a skip only at its end
  - retries the same marked moment after a network failure
- recordedObservation.test.ts:
  - uses the recording timeline, including separate shooter and scene clocks
  - labels the path visible now, not the historical shot result
- ChannelPostCommentsScreen.test.tsx:
  - opens author profile from a channel comment avatar
- ChatInfoScreen.test.tsx:
  - opens member profile in the shared profile sheet

These observation-recording and chat-profile failures are outside this artwork change.

## Local review

Run pnpm --filter @hockey/web dev from this worktree and open /amateur-crowd-review.html.
The review HTML is not a production build entry or public runtime asset.
Actual daily/duel/tournament gameplay acceptance is still needed before release.
