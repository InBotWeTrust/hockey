# Ultimate Hockey Android Application Design

**Date:** 2026-09-13
**Status:** Approved in product discussion; pending written-spec review

## Purpose

Ship Ultimate Hockey as a directly installable Android application while preserving the existing React game, production backend, player accounts, VK and Telegram sign-in, gameplay notifications, payments, WebSocket features, and the existing browser PWA.

The first distribution channel is a signed APK hosted on `ultimatehockey.ru`. The application checks for new versions, offers optional updates, and blocks unsupported versions until the player explicitly confirms installation through Android's system package installer.

## Product decisions

- Android 8.0 (API 26) and newer are supported.
- The application uses Capacitor and embeds the compiled `@hockey/web` bundle in the APK.
- Runtime data and API calls continue to use the production backend at `https://ultimatehockey.ru/api`.
- VK and Telegram authorization run outside the embedded WebView in the provider application or system browser and return through a verified Android App Link.
- Gameplay notifications use Firebase Cloud Messaging only as an Android delivery transport. Firebase does not replace the current database, authentication, notification rules, templates, queue, or administration.
- The current VAPID Web Push channel remains available to browser and PWA users.
- APK releases and a signed update manifest are hosted on `ultimatehockey.ru`.
- The player profile always exposes the current Android release.
- The main application surface shows an update card only when a newer version exists.
- Normal updates are dismissible. A server-configured minimum supported version can require installation before gameplay continues.
- Downloading starts only after an explicit player action. Android always owns the final installation confirmation.
- The same permanent Android signing key signs every public APK. Losing or replacing it would prevent in-place updates.

## Scope

### Included

- Capacitor Android application and repeatable debug/release builds.
- Production API origin configuration for the embedded web bundle.
- Native-aware platform abstraction in `@hockey/web`.
- VK and Telegram external authorization with verified return routing.
- FCM device registration, refresh, logout cleanup, delivery, notification channels, and deep-link routing.
- Optional and mandatory APK update checks.
- APK download with progress, integrity validation, and handoff to the Android package installer.
- Permanent Android download surface in the player profile.
- Conditional update card on the main application surface.
- Standard blocking modal for mandatory updates.
- Signed release metadata, hosted APK artifacts, CI build/sign/verify flow, staged publication, and rollback procedure.
- Regression protection for the existing browser PWA, Web Push, WebSocket, payment, and authentication flows.

### Excluded from the first release

- Google Play, RuStore, Huawei AppGallery, or other store publication.
- Silent or unattended APK installation. Normal consumer Android devices do not permit it.
- iOS packaging.
- Replacing the backend with Firebase services.
- Firebase Analytics, Firebase Authentication, Firestore, Remote Config, or Cloud Functions.
- Android versions older than 8.0.
- Live delivery of arbitrary web bundles outside an APK update.

## Architecture

### Repository layout

A new workspace package, `packages/mobile`, owns Capacitor configuration, Android-specific TypeScript integration, Android resources, and the generated/native `android/` project. It builds `@hockey/web`, copies the resulting bundle into the Android application, and produces debug or release APK artifacts.

The existing `packages/web` application remains the single UI implementation. Platform-specific capabilities are accessed through small, explicit interfaces rather than scattered `Capacitor.isNativePlatform()` checks. Browser implementations retain current behavior; Android implementations use Capacitor plugins and narrowly scoped native code where a maintained plugin is insufficient.

The server remains authoritative for identity, sessions, notification preferences, notification content, update policy, and release metadata.

### Runtime origin

The APK contains its HTML, CSS, JavaScript, fonts, and bundled visual assets. It does not load the application shell from the public website. API and WebSocket clients use an explicit production origin when running natively and retain relative `/api` behavior in browser builds.

Server-controlled data such as balances, catalog entries, tournament state, news, and notification templates changes without an APK release. Web UI, deterministic client behavior, Android permissions, native integrations, and bundled assets change only through a new APK.

### Version model

- `versionName` is the player-visible semantic release string.
- `versionCode` is a strictly increasing positive Android integer.
- `latestVersionCode` identifies the newest public build.
- `minimumSupportedVersionCode` identifies the oldest build permitted to continue.
- An update is optional when `installedVersionCode < latestVersionCode` and `installedVersionCode >= minimumSupportedVersionCode`.
- An update is mandatory when `installedVersionCode < minimumSupportedVersionCode`.
- The server must reject publication where `minimumSupportedVersionCode > latestVersionCode`.
- A broken release is fixed by publishing another APK with a higher `versionCode`; Android downgrade is not the rollback mechanism.

## Authentication

### Shared requirements

- Existing player identities and progress remain in the current production database.
- The embedded WebView never collects provider credentials.
- OAuth state, PKCE verifier, one-time handoff material, and callback expiry are validated before a session is created.
- Provider access tokens are not placed in Android deep-link URLs.
- A callback is accepted only for an authorization attempt initiated by the same application installation.
- Failed or cancelled authorization returns the player to the login screen with a Russian user-facing error and permits retry.

### VK

The Android application opens VK ID authorization in the VK application when supported or in a secure browser surface otherwise. The existing authorization-code plus PKCE exchange remains server-backed. The registered VK callback includes the canonical HTTPS callback on `ultimatehockey.ru`; a verified Android App Link transfers the completed attempt to the installed application.

### Telegram

The Android application does not render the current Telegram Login Widget inside the embedded WebView. It opens a canonical HTTPS authorization page on `ultimatehockey.ru` in the system browser. That page hosts the supported Telegram authorization surface, submits the signed Telegram payload to the backend, and receives a short-lived, single-use mobile handoff code bound to the initiating installation and OAuth state. The canonical HTTPS completion link returns only that opaque handoff code through the verified Android App Link; the application exchanges it for the normal Ultimate Hockey session. Telegram identity data and application tokens are never placed in the return URL.

Telegram Mini App authentication remains a separate, supported browser context and is not replaced by the APK flow.

### Session storage

Access and refresh tokens continue to follow the current rotation model. The mobile implementation stores long-lived session material using Android-protected storage exposed through a focused session adapter rather than plain WebView local storage. Logout revokes the refresh token, removes the local FCM registration, and clears protected local credentials.

## Android push notifications

### Delivery model

Existing notification producers continue to create the same semantic events and rendered payloads for chat, daily play, training, duels, tournaments, and news. The delivery worker selects all active transports for the user:

- VAPID Web Push subscriptions for browsers and installed PWAs;
- FCM registration tokens for Android installations.

Each physical installation has its own opaque registration record. Notification preferences remain user-level and apply consistently across transports. Delivery logs record transport and installation without exposing raw FCM tokens to administrators or routine logs.

### Registration lifecycle

The application requests Android notification permission contextually from profile notification settings, not on first launch. After consent it obtains an FCM token and registers it through an authenticated API. Token refresh updates the same installation record. Logout removes that installation's registration. FCM responses marking a token invalid or unregistered deactivate it idempotently.

### Notification behavior

Android notification channels group player-visible categories without changing existing preference semantics. Foreground delivery updates the relevant application cache and shows an in-app/native notification according to the event policy. Background or terminated delivery creates a system notification. Tapping it routes to an allowlisted internal destination such as a chat, duel, tournament, daily game, training, or news screen.

Arbitrary external URLs and unknown internal paths are rejected. Authentication is restored before a protected destination is opened.

## APK update system

### Public release metadata

The server exposes cache-controlled release metadata for Android. The response contains:

- `versionName`;
- `latestVersionCode`;
- `minimumSupportedVersionCode`;
- `apkUrl` restricted to the canonical HTTPS download origin;
- `apkSizeBytes`;
- `apkSha256`;
- `releaseNotes` in Russian;
- `publishedAt`;
- a signature and key identifier for manifest verification.

The application ships with the public verification key. The private manifest-signing key and Android keystore never ship in the repository, APK, container image, logs, or public release metadata.

### Check policy

The native application checks on cold start, foreground resume, an explicit profile action, and a bounded periodic interval while active. Requests use a short timeout and must not hold the splash screen indefinitely.

The last successfully verified manifest may be cached. A network failure does not turn an optional update into a mandatory update and does not block a version that was valid under the last trusted policy. When a verified manifest proves the installed version is below `minimumSupportedVersionCode`, the mandatory gate remains until a supported APK is installed.

### Optional update

The main application surface shows a compact update card only when a verified newer version exists. The player may dismiss it for that exact `latestVersionCode`; the next published version may show a new card. The profile continues to show update availability even after dismissal.

### Mandatory update

A mandatory update uses the shared modal design: `.modal-backdrop`, `.modal-card`, `.modal-title`, `.modal-copy`, `.modal-actions`, and a text-only `.modal-primary.btn--cta`. The modal cannot be dismissed and protected gameplay routes are unavailable. It explains why an update is required and offers retry after recoverable failures.

### Download and installation

Downloading begins only after the player presses a download/update button. The application:

1. verifies the signed manifest;
2. confirms the URL uses the canonical HTTPS origin;
3. downloads to application-controlled temporary storage with visible progress;
4. verifies exact byte length and SHA-256;
5. deletes a partial or invalid download;
6. requests Android's per-source installation permission when necessary;
7. exposes the verified APK through a scoped `FileProvider` content URI;
8. opens the Android package installer;
9. leaves final confirmation to the player.

The application cannot silently install or overwrite itself. If the player refuses the system permission or installation, the current supported version remains usable; an unsupported version returns to the mandatory gate.

## User interface

### Player profile

The profile contains a permanent card named `Приложение для Android`.

- Android browser: current public version, APK size, and `Скачать приложение`.
- Installed APK: installed version, current status, `Проверить обновления`, and `Обновить` when applicable.
- Non-Android browser: informational `Доступно для Android` copy without a misleading install action.
- A mandatory update state prioritizes the update CTA.

All surfaces resolve release information from the same server response. No UI component contains a hard-coded versioned APK URL.

### Main application surface

No permanent download advertisement occupies the main game surface. A compact card appears only for an optional update. It follows the current visual language, does not cover gameplay, includes a text-only update button, and can be dismissed for the current `latestVersionCode`.

### Browser compatibility

The existing PWA update prompt remains responsible for Service Worker updates and is not shown as an APK update inside the native application. Browser Web Push controls remain unchanged. Native-only actions are guarded behind the platform adapter.

## Release and distribution

### Artifact URLs

- Human download page: `https://ultimatehockey.ru/download/android`
- Versioned artifact: `https://ultimatehockey.ru/downloads/android/ultimate-hockey-<versionName>.apk`
- Release metadata: a stable API endpoint under `https://ultimatehockey.ru/api`

The human page never requires authentication. The profile links to the stable human download route in browsers and invokes the native updater inside the APK.

### CI workflow

Android release is an explicit workflow and is not triggered by every web or server deployment. It performs:

1. dependency installation and existing repository checks;
2. game-core and web production builds;
3. Capacitor synchronization;
4. Android unit/instrumentation checks available in CI;
5. release APK build;
6. signing with the permanent keystore supplied from approved secret storage;
7. Android signature verification;
8. extraction and verification of package id, `versionName`, `versionCode`, and minimum SDK;
9. SHA-256 and byte-size calculation;
10. retention of an unpublished candidate artifact for physical-device acceptance.

Publication is a separately approved job. It uploads the immutable versioned APK first, confirms the public bytes match the candidate hash, and publishes the signed manifest last. A client must never observe a manifest pointing to a missing or partially uploaded artifact.

### Signing and secrets

Every public APK uses the same application id and signing identity. The keystore, its passwords, FCM server credential, and manifest-signing private key live only in approved GitHub/server secret storage. CI output must mask secrets and must not print encoded keystores or credentials.

### Recovery

- Publication failure before manifest activation leaves clients on the prior release.
- A corrupt or mismatched public artifact prevents manifest activation.
- A bad activated build is superseded by a higher `versionCode` release.
- Previously published artifacts are retained for audit and diagnosis but are not offered as Android downgrades.
- `minimumSupportedVersionCode` is raised only after the replacement APK is publicly reachable and accepted on physical devices.

## Error handling

- Update metadata unavailable: keep using a currently supported application and allow manual retry.
- Invalid manifest signature: ignore the response, record a redacted diagnostic, and never download.
- Noncanonical or non-HTTPS APK URL: reject it.
- Interrupted download: delete partial data or safely restart; never open it in the installer.
- Hash or size mismatch: delete the file and show a retry message.
- Unknown-sources permission denied: explain the exact Android setting and allow retry without repeatedly opening settings.
- Installer cancelled: return to the application; optional updates stay optional and mandatory updates stay gated.
- FCM registration unavailable: the game remains usable and retries registration with bounded backoff.
- Invalid FCM token: deactivate it without affecting the player's other installations or Web Push subscriptions.
- OAuth cancelled, expired, or state mismatch: create no session and present a safe retry.
- Unknown notification destination: open the authenticated main application surface.

## Testing and acceptance

### Automated coverage

- Unit tests for platform selection, version comparison, dismissal behavior, and mandatory gating.
- Server route tests for release metadata validation and cache behavior.
- Cryptographic tests proving valid manifests pass and tampered fields fail.
- API tests for FCM registration, token rotation, logout cleanup, idempotency, and user ownership.
- Delivery-worker tests for Web Push only, FCM only, both transports, invalid tokens, retryable failures, and preference suppression.
- Deep-link tests for all allowlisted routes and rejection of external or malformed destinations.
- OAuth tests for PKCE/state success, cancellation, expiry, replay, and mismatched installation.
- Web regression tests proving native-only prompts and APIs do not alter the PWA.
- Android build checks verifying application id, API 26 minimum, version metadata, permissions, `FileProvider`, verified links, and release signature.
- Existing repository `typecheck`, `lint`, `build`, and `test` suites.

### Physical-device matrix

Acceptance covers at least Android 8.0, one supported intermediate Android version, and the current Android version. Tests use the exact signed candidate APK and include:

- clean installation;
- in-place update from the prior public version without losing account state;
- VK through installed application and browser fallback;
- Telegram through installed application and browser fallback;
- correct return into the APK;
- each notification category while foregrounded, backgrounded, and terminated;
- navigation from each notification type;
- optional update, dismissal, manual profile check, and reappearance for a later release;
- mandatory update and recovery from permission denial;
- interrupted download, invalid artifact, unavailable manifest, and poor connectivity;
- WebSocket reconnection, authenticated API refresh, payment return, and critical game flow;
- unchanged browser PWA authentication, Web Push, Service Worker update, WebSocket, and payment behavior.

### Evidence required before public release

- exact Git SHA;
- CI run URL and green required jobs;
- candidate APK SHA-256 and byte size;
- verified Android signing certificate fingerprint;
- extracted `versionName`, `versionCode`, application id, and minimum SDK;
- physical-device PASS/FAIL evidence by Android version and scenario;
- public artifact hash read-back;
- signed manifest read-back;
- final installation/update smoke from the public URL.

A successful server deploy or `/api/health` response is not mobile acceptance. Any APK rebuild changes the accepted artifact and requires signature/hash verification plus the affected device checks again.

## Delivery stages

1. **Foundation:** Capacitor package, embedded web build, native API origin, secure session adapter, Android debug build.
2. **Authentication:** verified App Links, VK and Telegram external flows, callback recovery.
3. **Notifications:** FCM registration and server transport alongside existing Web Push.
4. **Updates:** signed manifest, optional/mandatory policy, UI, download integrity, package-installer handoff.
5. **Release automation:** signed candidate workflow, protected publication, hosted download page.
6. **Acceptance:** physical-device matrix, browser regression, exact-artifact evidence, first public APK.

Each stage must leave the existing PWA deployable. Production publication occurs only after the complete candidate passes acceptance.
