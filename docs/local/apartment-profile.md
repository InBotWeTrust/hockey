# Local apartment profile

Branch: `feature/profile-apartment-local`, based on refreshed `origin/dev` at `6abc5af2995a371cfb9d482fe02cd09e4ed11af2`.

Run from this worktree:

```sh
pnpm --filter @hockey/game-core build
pnpm --filter @hockey/web exec vite --host 127.0.0.1 --port 8795 --strictPort
```

Open http://127.0.0.1:8795/section-panoramas-qa.html?scene=apartment&level=amateur&theme=light . This is the project's existing local fixture entry, using synthetic profile data without creating an authentication session or contacting a live API. Normal authenticated `/profile` also uses the new apartment in Vite development mode. Production retains the existing venue implementation.

The room is assembled from 94 independently cropped/resized WebP sources (asset directory 9.4 MiB including earlier versions), with four interior designs and separate decor layers. Import provenance is in `packages/web/public/apartment/provenance.json`; the repeatable importer takes the original artifact directory as its argument. It performs only deterministic crop, uniform resize and compression.

The header shows the existing profile's avatar, name, competition level and balances. The project navigation and interactive room objects open existing profile, rewards, friends, settings and story components in an embedded scene panel. There are no extra back/home controls in the header and no bottom-sheet presentation. Appearance controls are inside Settings; choices are stored only in local storage, scoped to the owner. Earned trophies are capped at nine display slots, with the full collection remaining in Rewards.

Drag/swipe the room horizontally for continuous free panning within the room bounds; releasing a drag keeps its intermediate position without snapping. Directional intent excludes vertical gestures; pointer capture keeps a drag active outside the initial hit point; cancellation stops it without jumping. Keyboard Left/Right works when the room has focus. The old zone label/arrows were removed. The left camera is anchored to preserve the doorway on tall screens.

Validation:

- 87 targeted tests passed across ApartmentHome, ProfileScreen, ProfileFriendsScreen and VenuePanorama.
- 35 additional tests passed across ProfileSettingsScreen, ProfileStorySeriesScreen and ProfileDestinationScreens.
- Web build (including TypeScript) and scoped ESLint passed. Build reports large-chunk/Browserslist advisories.
- Browser inspected at 430×932 and 360×640: room, doorway, both camera zones, mouse drags in both directions, ordinary modal presentation, profile, friends, rewards, settings, story and appearance/decor selection.
- Door visibility measured in browser at approximately 91 px on 430×932 and 64 px on 360×640 after fixing the camera crop.

This is local UI acceptance with fixture data. Real-device touch, authenticated backend flows, CI and deployments have not been verified or performed. Existing unrelated changes in the main checkout were preserved.

Floor and ceiling use a single overscanned image instead of wrapping an 800px tile, removing the visible join near the left camera edge. Wallpaper alone retains its repeat pattern. Regression checks cover intermediate camera positions after release and non-repeating floor rendering.

## Base interior lighting pass

Eight replacement sprites share soft neutral right-hand window lighting. The base scene includes alpha-derived per-foot contact cores, diffuse floor shadows, wall-mount shadows and decor contact shadows. The importer exports base-contact-points.json with 18 foot contacts across six subjects. Decor shadows follow the same visibility flags as their objects. The TV is anchored to the new cabinet top. The three upgraded designs also received the cohesion pass described below. The verified rendered capture is output/apartment-profile/base-after-natural.jpg. The earlier capture had a different viewport height and is not a matched-frame comparison.


## Upgraded interior lighting pass

27 replacement sprites across three designs: sofas, desks, chairs, storage cabinets, coffee tables, armchairs, pillows, throws and curtains. The original distinct structures and palettes remain. All use the base pass as a neutral painted-light reference. The same relit player appears throughout.

Each scene now derives contact and broad floor shadows from its own furniture alpha, with broad contacts for plinths. Wall screens, floating desk, shelves, pictures, windows, radiators, curtains, air conditioners and ceiling lights have separate soft mounting shadows. Floor furniture and wall-mounted objects use different shadow placement. Decor shadows share their object's visibility flag. The Scandinavian TV and tabletop accessories follow the newly generated support surface. Scandinavian desk/chair/plant move together; modern storage was narrowed to keep a clear desk gap.

Validation for this pass: layout regression first failed in all three upgraded designs, then passed after import. 91 targeted tests and the web build passed; scoped ESLint and diff whitespace checks passed. Browser at 430×932 inspected both sides of all three interiors, supported and mounted TVs, floating desk, intermediate pan viewBox 260, and plant removal without an orphan shadow. Captures: output/apartment-profile/{scandinavian,modern,premium}-natural-{left,right}.png. Source art and contact sheets: main repository artifacts/apartment-natural-designs-v1-2026-11-11. Real-device and live account acceptance remain unverified; no deployment performed.


## Interactive objects and embedded panels

The apartment section shell no longer uses AccessibleModal, a backdrop, portal or focus trap. Five SVG hit areas follow the same camera geometry as the scene: player/profile, shelves/rewards, TV/story, tabletop phone/fans, and laptop/settings. Fixed circular pulse anchors use the bar timing (1 second, scale .2 to 1.2 with fade-out) and stop for the active object; reduced-motion preferences disable the pulse animation. Phone and laptop are independent native SVG objects anchored to the desk's opaque top surface through supportY. They include separate small contact shadows.

A single region panel switches between sections. The chevron, active dock tab, or Escape collapses it. The current route stays mounted when collapsed, preserving form drafts and scroll; the hidden panel becomes inert. Opening focuses the panel heading, closing restores focus to its opener. Appearance is an inline subview of Settings. Horizontal drags suppress the resulting object click; dock taps continue to work after dragging.

The preview's seeded synthetic summary now has infinite cache lifetime so its disabled unauthenticated query remains available when Story is opened after several minutes. No auth/session state was created or changed.

Validation: four initial panel tests failed against the modal shell, then passed. Final targeted suites: 112 tests passed across apartment, layout, profile, friends, venue, destinations and story series. Web build and scoped ESLint passed; diff whitespace check passed. Browser verified five object entry points, chevron and dock collapse, free pan without accidental activation, inline appearance, and layout at 430×932 and 360×640. Draft/scroll preservation and inert collapsed content are covered by tests. Saved captures: output/apartment-profile/interactive-room.png and inline-profile.png. This remains a local fixture preview; no real-device/authenticated backend acceptance, CI or deployment was performed.


## Compact passport and settings experiment

While reading a section, the room HUD and five-tab dock are hidden. One narrow bottom return bar restores the room, its HUD and dock. The reading surface has no outer border or nested passport glass cards. Balances sit in one row and metrics in a compact two-column layout. An Edit action opens the existing profile form as a separate view and returns to the passport.

Apartment settings start with six short entries: Profile, Application, Notifications, City, Help and Appearance. Each opens only the relevant controls, using an optional ApartmentSettingsContext. The existing default settings screen outside the apartment retains its controls and original DOM grouping through transparent group components. Help contains account, support, communities and logout. Grip is excluded from the apartment experiment; its existing default-settings implementation remains, and relocation to the locker is not implemented in this passport/settings pass. Existing profile mutations remain unchanged.

The room is inert and hidden from accessibility navigation while reading. Hidden settings groups preserve profile draft state. No changes were made to authentication, accounts, live backend state or releases.

Validation: two new chrome/menu regressions failed before implementation; 135 targeted tests now pass including default settings and apartment isolation. Web build and scoped ESLint passed. Browser checked passport, editor and root settings at 360×640 and 430×932; at 360×640 scrollHeight equals clientHeight for passport (380), settings menu (386), editor (362), and app settings (352). Open/back/return flows were inspected without saving any account data. Captures: passport-compact.png, settings-menu-compact.png, profile-editor-compact.png and compact-profile-settings.jpg under output/apartment-profile. Keyboard-open, large-text accessibility and real-device acceptance are not established by these normal-viewport checks.

## Terminal-style apartment interfaces (2026-11-12)

Supersedes the full-screen reading experiment above. Panels now use the bar terminal's viewport placement, content-driven height, shared glass surface tokens and a close cross. The room stays visible behind and below the panel; the five-tab dock remains available. The room HUD and dock identity row hide while an interface is open, so identity/balance/title are not duplicated. Closing restores them. The extra bottom return bar was removed. Compact settings subviews remain available inside the interface. Clicking the active dock item also closes; selecting a different dock item switches the open section.

Validation: four initial interface regressions failed, then all 119 targeted apartment/profile/settings/friends/venue tests passed. Web build and scoped ESLint passed; whitespace diff check passed. Browser inspected at 430×932 and 360×640: profile, settings, direct switching, close/reopen and dock availability. Saved captures: output/apartment-profile/terminal-style-profile.png and terminal-style-settings-small.png. Local fixture evidence only; no deployment or live account changes.

## Classic passport layout and liquid-glass correction

The supplied pre-city screenshot supersedes the temporary row layout: balances use three columns, sporting metrics use four, with the old streak/current-best notation. ApartmentClassicPassportContext opts only the local apartment into the compact metric labels; other profile presentations retain their prior behavior. The extra Apartment heading is removed.

Passport sections use the project liquid-card background, liquid border and liquid blur tokens. The wrapper is transparent with no filter or shadow; each card has an inset highlight rather than an external clipped shadow. Identity padding is 16px, with the measured avatar inset 17px including the border. Light-theme metric numbers use liquid-ink rather than legacy white values.

The local preview has a 36px toolbar with Light/Dark buttons. Switching updates only the document theme and the theme query parameter, preserving the open interface without reload or account-setting writes. The preview frame reserves the toolbar height and positions app-content within the frame.

Checks: 61 targeted profile/apartment/theme-switch tests passed, web build and scoped ESLint passed, whitespace diff check passed. Browser inspected both themes at 430×932 and 360×640. Captures: passport-liquid-light.png and passport-liquid-dark.png. No deployment or live account mutation.

## Interactive apartment objects

Generated separate transparent phone, laptop, mirror, catalogue and base pendant sprites in
`public/apartment/interactive/`; source paths, normalization and alpha checks are in `manifest.json`.
Phone and laptop replace the SVG device placeholders. Existing character, trophies, TV, window and
higher-tier lighting remain independent layers. A smaller v2 mirror sits beside the door on the left wall with matching perspective in all
layouts; desk devices share the desk support height and render behind the chair.

Room shortcuts: character -> profile, shelf -> rewards, phone -> friends, laptop -> settings menu,
TV -> story, mirror -> profile editing, window -> city/weather, pendant -> theme only,
catalogue -> apartment appearance. The laptop retains all settings. Shortcuts reuse the common
settings container and back navigation. Local preview only; no release or account changes.
