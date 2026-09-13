# Ultimate Hockey Android Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a signed Android 8.0+ APK of Ultimate Hockey with embedded web assets, VK and Telegram sign-in, native FCM notifications, and user-confirmed in-app APK updates hosted on `ultimatehockey.ru`.

**Architecture:** Add a Capacitor Android workspace package that embeds the existing `@hockey/web` build and accesses native behavior through focused platform adapters. Extend the existing Fastify backend with single-use mobile-auth handoffs, installation-scoped FCM registrations, and a signed Android release manifest while keeping the browser PWA and VAPID Web Push operational. Build and sign release candidates in GitHub Actions, accept the exact artifact on physical devices, then publish the versioned APK first and its signed manifest last.

**Tech Stack:** pnpm workspaces, React 18, Vite 5, TypeScript strict mode, Capacitor 7, Android/Kotlin, Fastify 4, PostgreSQL 16, Redis 7, Firebase Cloud Messaging HTTP v1, Google Auth Library, JOSE Ed25519 signatures, Vitest, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-android-app-design.md`

## Global Constraints

- Support Android 8.0 / API 26 and newer.
- Use package id `ru.ultimatehockey.app`; never change it after the first public release.
- Embed the compiled web application in the APK; do not load the application shell from the network.
- Native API and WebSocket traffic use `https://ultimatehockey.ru`; browser builds retain relative `/api` and same-origin WebSocket behavior.
- Keep VK and Telegram credentials outside the embedded WebView; authenticate in the provider application or system browser.
- Preserve the current JWT/refresh rotation model and all existing player identities.
- Use Firebase only for Cloud Messaging delivery; do not add Firebase Auth, Analytics, Firestore, Remote Config, or Cloud Functions.
- Keep VAPID Web Push working for browser and PWA installations.
- Never log FCM tokens, refresh tokens, provider payloads, Android keystore material, Firebase service-account JSON, or manifest-signing private keys.
- Every public APK uses one permanent Android signing identity and a strictly increasing `versionCode`.
- APK download is user initiated; Android owns the final installation confirmation. Silent installation is out of scope.
- Publish a versioned APK before atomically activating a signed manifest that references it.
- Use existing modal and button invariants; mandatory update uses `AccessibleModal`, standard modal classes, and a text-only CTA.
- Build `@hockey/game-core` before server or web tests that consume its `dist` output.
- Do not change production data, provider configuration, DNS, secrets, or release state while implementing local tasks.
- GLM is forbidden for this project; use local verification and ordinary code review.

## Owner action checkpoints

Implementation must stop at each checkpoint below and ask the owner for the exact action. Do not ask the owner to paste credentials into chat. Provide the exact console page, field names, values that are safe to share, secret names, validation command, and a clear stop condition.

1. **Before Task 4 can receive real FCM tokens:** ask the owner to create or select the Firebase/Google Cloud project, register Android application `ru.ultimatehockey.app`, and place the downloaded `google-services.json` at `packages/mobile/android/app/google-services.json`. The file contains application configuration rather than a server credential, but inspect it for the expected package id before committing it.
2. **Before Task 5 can send a real push:** ask the owner to enable Firebase Cloud Messaging API v1 and create a narrowly scoped service account for sending messages. The owner stores `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` directly in the approved GitHub/VPS secret stores; never request the JSON private key in chat.
3. **Before the first signed candidate in Task 10:** ask for explicit approval to create the permanent Android signing identity. Generate it once in a secure owner-controlled location, record and independently verify its SHA-256 certificate fingerprint, and store `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, and `ANDROID_SIGNING_CERT_SHA256` directly as protected secrets. Losing this keystore permanently breaks in-place APK updates.
4. **Before App Link/provider acceptance in Tasks 3 and 10:** give the owner the final HTTPS callback URLs and signing fingerprint, then ask them to add—not replace prematurely—the callback/domain settings in VK ID and Telegram/BotFather. Preserve the existing browser callbacks until both browser and APK authentication pass.
5. **Before manifest signing in Task 7:** ask for approval to create the separate Ed25519 manifest-signing key. Store `ANDROID_MANIFEST_PRIVATE_KEY` only in the protected release environment and commit/embed only the public key plus non-secret `keyId`.
6. **Before publishing the first APK or raising `minimumSupportedVersionCode`:** show the exact candidate SHA-256, Git SHA, CI URL, device acceptance matrix, public URLs, and proposed minimum version. Publication and making an update mandatory are separate approvals.

---

### Task 1: Scaffold the Capacitor package and platform boundary

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/web/src/api/apiFetch.ts`
- Modify: `packages/web/src/app/App.tsx`
- Create: `packages/web/src/platform/runtime.ts`
- Create: `packages/web/src/platform/runtime.test.ts`
- Create: `packages/mobile/package.json`
- Create: `packages/mobile/tsconfig.json`
- Create: `packages/mobile/capacitor.config.ts`
- Create: `packages/mobile/src/config.ts`
- Create: `packages/mobile/src/config.test.ts`
- Create: `packages/mobile/android/` through the Capacitor CLI, then retain the generated native project

**Interfaces:**
- Produces: `RuntimePlatform = 'browser' | 'android'`
- Produces: `getRuntimePlatform(): RuntimePlatform`
- Produces: `getApiBaseUrl(): string`
- Produces: `getWebSocketBaseUrl(): string`
- Produces: `isNativeAndroid(): boolean`
- Consumes later: all authentication, notification, and updater adapters use these functions rather than reading Capacitor globals directly.

- [ ] **Step 1: Write failing runtime tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl, getRuntimePlatform, getWebSocketBaseUrl } from './runtime.js';

describe('runtime platform', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps browser traffic same-origin', () => {
    vi.stubGlobal('__HOCKEY_NATIVE__', undefined);
    expect(getRuntimePlatform()).toBe('browser');
    expect(getApiBaseUrl()).toBe('/api');
  });

  it('uses the canonical production origin on Android', () => {
    vi.stubGlobal('__HOCKEY_NATIVE__', { platform: 'android' });
    expect(getRuntimePlatform()).toBe('android');
    expect(getApiBaseUrl()).toBe('https://ultimatehockey.ru/api');
    expect(getWebSocketBaseUrl()).toBe('wss://ultimatehockey.ru');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `pnpm --filter @hockey/web test -- src/platform/runtime.test.ts`

Expected: FAIL because `packages/web/src/platform/runtime.ts` does not exist.

- [ ] **Step 3: Add the runtime boundary and route all API URLs through it**

Implement `runtime.ts` with an injected build/runtime marker and no import of Capacitor in browser code:

```ts
declare global {
  var __HOCKEY_NATIVE__: { platform: 'android' } | undefined;
}

export type RuntimePlatform = 'browser' | 'android';

export function getRuntimePlatform(): RuntimePlatform {
  return globalThis.__HOCKEY_NATIVE__?.platform === 'android' ? 'android' : 'browser';
}

export function isNativeAndroid(): boolean {
  return getRuntimePlatform() === 'android';
}

export function getApiBaseUrl(): string {
  return isNativeAndroid() ? 'https://ultimatehockey.ru/api' : '/api';
}

export function getWebSocketBaseUrl(): string {
  if (isNativeAndroid()) return 'wss://ultimatehockey.ru';
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
}
```

Change `apiFetch.ts` and logout/refresh callers to use `getApiBaseUrl()`. Gate the browser `UpdatePrompt` behind `!isNativeAndroid()` so a native APK never offers a Service Worker refresh.

- [ ] **Step 4: Create `@hockey/mobile` and generate the Android project**

Use mutually compatible Capacitor 7 packages and lock their resolved versions:

```bash
pnpm add --filter @hockey/mobile @capacitor/core@^7 @capacitor/android@^7 @capacitor/app@^7 @capacitor/browser@^7 @capacitor/filesystem@^7 @capacitor/preferences@^7 @capacitor/push-notifications@^7
pnpm add --filter @hockey/mobile --save-dev @capacitor/cli@^7 typescript
pnpm --filter @hockey/mobile exec cap add android
```

Set `appId: 'ru.ultimatehockey.app'`, `appName: 'Ультимейт Хоккей'`, `webDir: '../web/dist'`, `minSdkVersion = 26`, portrait orientation, and a build-time native marker injected before React mounts.

- [ ] **Step 5: Add deterministic build scripts**

Add root scripts:

```json
{
  "mobile:sync": "pnpm --filter @hockey/game-core build && pnpm --filter @hockey/web build && pnpm --filter @hockey/mobile cap:sync",
  "mobile:android:debug": "pnpm mobile:sync && pnpm --filter @hockey/mobile android:debug",
  "mobile:android:release": "pnpm mobile:sync && pnpm --filter @hockey/mobile android:release"
}
```

The mobile package scripts call `cap sync android`, `./gradlew assembleDebug`, and `./gradlew assembleRelease` from `packages/mobile/android`.

- [ ] **Step 6: Verify browser and Android build boundaries**

Run:

```bash
pnpm --filter @hockey/web test -- src/platform/runtime.test.ts src/api/apiFetch.test.ts
pnpm --filter @hockey/web typecheck
pnpm mobile:android:debug
```

Expected: focused tests PASS; web typecheck PASS; Gradle produces a debug APK whose manifest reports package `ru.ultimatehockey.app` and minimum SDK 26.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml packages/web packages/mobile
git commit -m "feat: scaffold Android application shell"
```

---

### Task 2: Move native sessions to Android-protected storage

**Files:**
- Modify: `packages/web/src/auth/authStore.ts`
- Modify: `packages/web/src/auth/authStore.test.ts`
- Modify: `packages/web/src/auth/useLogout.ts`
- Modify: `packages/web/src/main.tsx`
- Create: `packages/web/src/auth/sessionStorage.ts`
- Create: `packages/web/src/auth/sessionStorage.test.ts`
- Create: `packages/mobile/android/app/src/main/java/ru/ultimatehockey/app/SecureSessionPlugin.kt`
- Modify: `packages/mobile/android/app/src/main/java/ru/ultimatehockey/app/MainActivity.kt`
- Modify: `packages/mobile/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: `SessionStorage` with `load(): Promise<AuthSession | null>`, `save(session: AuthSession): Promise<void>`, and `clear(): Promise<void>`.
- Produces: `initializeAuthSession(): Promise<void>` called before protected routing.
- Native implementation stores an encrypted JSON session using Android Keystore-backed AES/GCM; browser implementation preserves Zustand local persistence.

- [ ] **Step 1: Write failing adapter tests**

Cover browser persistence, native load-before-render, successful rotation write-through, corrupt ciphertext returning `null`, and logout clearing both memory and protected storage.

```ts
it('does not persist native refresh tokens in localStorage', async () => {
  installRuntime('android');
  await sessionStorage.save(session);
  expect(localStorage.getItem('hockey.auth')).toBeNull();
  expect(nativeBridge.save).toHaveBeenCalledWith({ value: JSON.stringify(session) });
});
```

- [ ] **Step 2: Run the tests and verify they fail before the adapter exists**

Run: `pnpm --filter @hockey/web test -- src/auth/sessionStorage.test.ts src/auth/authStore.test.ts src/auth/useLogout.test.tsx`

Expected: FAIL on missing `sessionStorage` and native bridge behavior.

- [ ] **Step 3: Implement the browser/native session interface**

Keep React consumers synchronous after bootstrap. On Android, disable Zustand `persist`, hydrate once through `initializeAuthSession()`, and write every `setSession` rotation to the native plugin. Do not render `App` until hydration resolves; a failed native read yields a logged-out state.

- [ ] **Step 4: Implement the Keystore plugin**

Use Android Keystore alias `ultimate_hockey_session_v1`, AES/GCM/NoPadding, a random 12-byte IV per write, and app-private `SharedPreferences` for the base64 IV+ciphertext. Expose only `load`, `save`, and `clear`. Mark the plugin methods unavailable below API 26 even though the manifest already excludes those devices.

- [ ] **Step 5: Verify token migration and logout**

Run:

```bash
pnpm --filter @hockey/web test -- src/auth/sessionStorage.test.ts src/auth/authStore.test.ts src/auth/useLogout.test.tsx
pnpm --filter @hockey/web typecheck
pnpm mobile:android:debug
```

On an emulator, inspect WebView storage and confirm no refresh token appears in `localStorage`; log in, force-stop, reopen, refresh the access token, log out, and confirm the protected session is gone.

- [ ] **Step 6: Commit protected session storage**

```bash
git add packages/web/src/auth packages/web/src/main.tsx packages/mobile/android
git commit -m "feat: protect Android session storage"
```

---

### Task 3: Add replay-safe mobile authentication handoffs

**Files:**
- Modify: `packages/server/src/routes/auth.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/config.ts`
- Create: `packages/server/src/auth/mobileHandoff.ts`
- Create: `packages/server/src/auth/mobileHandoff.test.ts`
- Create: `packages/server/src/routes/mobileAuth.ts`
- Create: `packages/server/test/mobile-auth.test.ts`
- Create: `packages/web/src/auth/mobileAuth.ts`
- Create: `packages/web/src/auth/mobileAuth.test.ts`
- Create: `packages/web/src/screens/MobileTelegramAuthScreen.tsx`
- Create: `packages/web/src/screens/MobileTelegramAuthScreen.test.tsx`
- Modify: `packages/web/src/screens/LoginScreen.tsx`
- Modify: `packages/web/src/screens/LoginScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/mobile/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: `createMobileAuthAttempt(redis, { provider, codeChallenge }): Promise<{ attemptId; expiresAt }>`.
- Produces: `completeMobileAuthAttempt(redis, { attemptId, userId }): Promise<{ handoffCode }>`.
- Produces: `consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier }): Promise<string>` returning `userId` exactly once.
- Produces HTTP: `POST /mobile/auth/attempt`, `POST /mobile/auth/exchange`, canonical VK start/callback routes, and Telegram browser completion route.
- Produces web: `startMobileAuth(provider)` and `handleMobileAuthDeepLink(url)`.

- [ ] **Step 1: Write Redis handoff tests**

Test a five-minute TTL, SHA-256 PKCE challenge binding, provider binding, unknown attempt, expired attempt, wrong verifier, successful consume, and replay rejection. Use atomic Lua/`GETDEL` semantics so two exchanges cannot both issue sessions.

```ts
await expect(consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier })).resolves.toBe(userId);
await expect(consumeMobileAuthHandoff(redis, { handoffCode, codeVerifier })).rejects.toMatchObject({ code: 'mobile_auth_used' });
```

- [ ] **Step 2: Run focused server tests and confirm failure**

Run: `pnpm --filter @hockey/server test -- src/auth/mobileHandoff.test.ts test/mobile-auth.test.ts`

Expected: FAIL because mobile handoff routes and helpers do not exist.

- [ ] **Step 3: Implement the backend transaction model**

Use random 32-byte base64url identifiers. Redis keys contain only provider, challenge, creation time, and eventually `userId`; never provider tokens or Ultimate Hockey JWTs. `POST /mobile/auth/exchange` consumes the code, loads the user, issues the existing access/refresh pair, persists refresh JTI, and returns the existing `AuthSession` shape.

- [ ] **Step 4: Implement VK external authorization**

The APK generates a PKCE verifier/challenge for the Ultimate Hockey handoff, creates an attempt, and opens the canonical server start URL with `attemptId`. The server generates and stores the VK PKCE verifier and state under that attempt, redirects to VK ID, validates the callback, exchanges the VK code, calls `findOrLinkOrCreateVkUser`, completes the attempt, and redirects to:

```text
https://ultimatehockey.ru/mobile/auth/complete?code=<opaque-handoff-code>
```

Never put VK access tokens, user data, or Ultimate Hockey JWTs in this URL.

- [ ] **Step 5: Implement Telegram external authorization**

Add `/mobile-auth/telegram?attempt=<id>` as a public browser route using the existing `TelegramLoginButton`. Its signed Telegram payload is posted to a dedicated completion endpoint that reuses `verifyTelegramLoginPayload` and `findOrCreateTelegramUser`, then receives the opaque handoff URL and navigates to it. The embedded Android login screen opens this page with `Browser.open`; it does not mount the widget in the WebView.

- [ ] **Step 6: Register and verify the Android App Link**

Declare an HTTPS intent filter limited to host `ultimatehockey.ru` and path prefix `/mobile/auth/complete`, with `android:autoVerify="true"`. Add a separately deployed `/.well-known/assetlinks.json` containing package id and the final release signing-certificate SHA-256. Do not publish provider callback changes until a signed candidate fingerprint exists.

- [ ] **Step 7: Handle app resume and deep links**

Use `@capacitor/app` `appUrlOpen` plus cold-start URL retrieval. Validate exact scheme, host, path, and one `code` parameter; close the browser, exchange with the in-memory/protected verifier, store the session, and navigate to `/`. Unknown links open the authenticated home without executing arbitrary navigation.

- [ ] **Step 8: Verify authentication contracts**

Run:

```bash
pnpm --filter @hockey/server test -- src/auth/mobileHandoff.test.ts test/mobile-auth.test.ts
pnpm --filter @hockey/web test -- src/auth/mobileAuth.test.ts src/screens/MobileTelegramAuthScreen.test.tsx src/screens/LoginScreen.test.tsx
pnpm --filter @hockey/server typecheck
pnpm --filter @hockey/web typecheck
```

Expected: all focused tests PASS, including cancellation and replay cases.

- [ ] **Step 9: Commit mobile authentication**

```bash
git add packages/server/src/auth packages/server/src/routes packages/server/src/app.ts packages/server/src/config.ts packages/server/test packages/web/src/auth packages/web/src/screens packages/web/src/app/App.tsx packages/mobile/android
git commit -m "feat: add secure Android authentication handoff"
```

---

### Task 4: Store Android installations and FCM registrations

**Files:**
- Create: `packages/server/db/migrations/118_android_push_installations.sql`
- Modify: `packages/server/src/push/routes.ts`
- Create: `packages/server/src/push/installations.ts`
- Create: `packages/server/src/push/installations.test.ts`
- Create: `packages/server/test/android-push-routes.test.ts`
- Modify: `packages/web/src/api/push.ts`
- Create: `packages/web/src/platform/push.ts`
- Create: `packages/web/src/platform/push.test.ts`
- Modify: `packages/web/src/screens/ProfileSupportSections.tsx`
- Modify: `packages/web/src/screens/ProfileSettingsScreen.test.tsx`
- Modify: `packages/web/src/auth/useLogout.ts`

**Interfaces:**
- Produces DB table `android_push_installations` keyed by `(user_id, installation_id)` with unique active FCM token.
- Produces HTTP: `PUT /push/android/installations/:installationId` and `DELETE /push/android/installations/:installationId`.
- Produces web adapter: `nativePush.getStatus()`, `nativePush.subscribe()`, `nativePush.unsubscribe()`, `nativePush.addTokenRefreshListener()`.

- [ ] **Step 1: Write the migration**

```sql
create table android_push_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  installation_id uuid not null,
  fcm_token text not null,
  platform text not null check (platform = 'android'),
  app_version_code int not null check (app_version_code > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  disabled_at timestamptz,
  unique (user_id, installation_id),
  unique (fcm_token)
);

create index android_push_installations_active_user_idx
  on android_push_installations (user_id, updated_at desc)
  where disabled_at is null;
```

- [ ] **Step 2: Write failing ownership and idempotency tests**

Test create, same-installation token rotation, token transfer rejection across users, deletion scoped to the authenticated user, invalid UUID/token/version, and logout cleanup not affecting another installation.

- [ ] **Step 3: Run migration/route tests and confirm failure**

Run: `pnpm --filter @hockey/server test -- src/push/installations.test.ts test/android-push-routes.test.ts`

Expected: FAIL before the table and routes exist.

- [ ] **Step 4: Implement registration routes without logging tokens**

Accept:

```ts
interface AndroidInstallationRegistration {
  token: string;
  appVersionCode: number;
}
```

Limit token length to 4096, use an authenticated transaction, rotate the token on conflict `(user_id, installation_id)`, clear `disabled_at`, and return `{ ok: true }`. Redact request bodies for both routes in Fastify logging.

- [ ] **Step 5: Implement the client adapter and contextual permission**

Persist one random installation UUID in Capacitor Preferences. On Android, the existing `Включить` action requests `POST_NOTIFICATIONS`, registers for push, waits for the FCM token, and saves it through the new route. On browser, retain current Service Worker/VAPID logic unchanged. Token refresh repeats the idempotent PUT.

- [ ] **Step 6: Clean up the installation on logout**

Before clearing protected auth state, make a bounded authenticated DELETE for the current installation. Failure must not prevent local logout; the server later deactivates invalid tokens from FCM responses.

- [ ] **Step 7: Verify migration and both push settings paths**

Run:

```bash
pnpm --filter @hockey/server db:migrate
pnpm --filter @hockey/server test -- src/push/installations.test.ts test/android-push-routes.test.ts
pnpm --filter @hockey/web test -- src/platform/push.test.ts src/screens/ProfileSettingsScreen.test.tsx src/auth/useLogout.test.tsx
```

Expected: PASS; browser tests still assert VAPID subscription behavior, Android tests assert FCM registration behavior.

- [ ] **Step 8: Commit installation registration**

```bash
git add packages/server/db/migrations/118_android_push_installations.sql packages/server/src/push packages/server/test packages/web/src/api/push.ts packages/web/src/platform packages/web/src/screens/ProfileSupportSections.tsx packages/web/src/screens/ProfileSettingsScreen.test.tsx packages/web/src/auth/useLogout.ts
git commit -m "feat: register Android push installations"
```

---

### Task 5: Add FCM HTTP v1 as a second delivery transport

**Files:**
- Modify: `packages/server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/plugins/pushScheduler.ts`
- Modify: `packages/server/src/push/worker-cli.ts`
- Create: `packages/server/src/push/fcm.ts`
- Create: `packages/server/src/push/fcm.test.ts`
- Modify: `packages/server/src/push/queue.ts`
- Modify: `packages/server/src/push/queue.test.ts`
- Create: `packages/server/db/migrations/119_push_delivery_transport_counts.sql`

**Interfaces:**
- Produces: `FcmOptions { projectId: string; clientEmail: string; privateKey: string }`.
- Produces: `sendFcm(token, options, payload): Promise<{ ok: boolean; invalid: boolean; retryable: boolean; status: number }>`.
- Extends queue options with optional `fcm` configuration; VAPID and FCM can be enabled independently.

- [ ] **Step 1: Add the server dependency and configuration tests**

Use `google-auth-library` to mint OAuth access tokens for the FCM HTTP v1 endpoint. Add optional `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`; configuration is valid only when all three are present. Normalize escaped newlines in the private key without printing it.

- [ ] **Step 2: Write failing FCM response-classification tests**

Cover HTTP 200 success; `UNREGISTERED`/404 invalid token; 429 and 5xx retryable; 400 non-retryable invalid payload; network error retryable. Assert diagnostics contain status/reason but never the token or Authorization header.

- [ ] **Step 3: Add per-transport delivery counters**

Migration 119 adds `web_subscription_count`, `web_sent_count`, `fcm_installation_count`, and `fcm_sent_count` as nonnegative integers defaulting to zero. Keep existing aggregate columns for admin compatibility and set them to totals.

- [ ] **Step 4: Refactor one queue item to fan out across both transports**

Fetch browser subscriptions and active Android installations. Deliver the same allowlisted payload and `deliveryId` to both. Delete gone VAPID subscriptions; set `disabled_at` for invalid FCM tokens. Retry the queue item only when no transport succeeds and at least one failure is retryable. Mark `partial` when at least one delivery succeeds and another permanently fails.

- [ ] **Step 5: Preserve worker availability semantics**

`processPushDeliveryQueue().enabled` is true when at least one transport is configured. No subscriptions across both transports yields `skipped`. A missing FCM configuration must not disable Web Push; missing VAPID must not disable FCM.

- [ ] **Step 6: Run focused queue verification**

Run:

```bash
pnpm --filter @hockey/server test -- src/push/fcm.test.ts src/push/queue.test.ts
pnpm --filter @hockey/server typecheck
```

Expected: PASS for Web-only, FCM-only, mixed success, invalid-token cleanup, and retry cases.

- [ ] **Step 7: Commit the FCM transport**

```bash
git add packages/server/package.json pnpm-lock.yaml packages/server/src/config.ts packages/server/src/app.ts packages/server/src/plugins/pushScheduler.ts packages/server/src/push packages/server/db/migrations/119_push_delivery_transport_counts.sql
git commit -m "feat: deliver notifications through FCM"
```

---

### Task 6: Route Android notifications into the application

**Files:**
- Create: `packages/web/src/platform/deepLinks.ts`
- Create: `packages/web/src/platform/deepLinks.test.ts`
- Create: `packages/web/src/platform/nativeNotifications.ts`
- Create: `packages/web/src/platform/nativeNotifications.test.ts`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/mobile/android/app/src/main/AndroidManifest.xml`
- Create: `packages/mobile/android/app/src/main/res/values/notification_channels.xml`
- Add: monochrome notification icon under `packages/mobile/android/app/src/main/res/drawable/`

**Interfaces:**
- Produces: `resolveInternalDestination(value: string): string` with a fixed route allowlist.
- Produces: `initializeNativeNotifications(navigate): Promise<() => void>`.
- Consumes: FCM data payload `{ url, deliveryId, eventType, title, body }`.

- [ ] **Step 1: Write failing allowlist tests**

Accept `/`, `/?view=daily`, `/?view=training`, `/chat/<uuid>`, `/bonus-games`, `/achievements`, and known tournament/duel paths already produced by templates. Reject absolute URLs, protocol-relative URLs, encoded schemes, unknown routes, control characters, and overlong values; rejected input resolves to `/`.

- [ ] **Step 2: Implement foreground/background/cold-start routing**

Register `pushNotificationReceived` to invalidate the relevant TanStack caches without duplicating chat messages. Register `pushNotificationActionPerformed` and cold-start notification data to restore authentication first, navigate through the allowlist, and POST the existing `/push/click` delivery id once.

- [ ] **Step 3: Configure Android notification channels**

Create stable channel ids `messages`, `gameplay`, `tournaments`, and `news`. Map existing semantic event types onto them. Use a valid monochrome status-bar icon, app launcher icon as large icon, and no sensitive message body on the lock screen when Android privacy settings hide content.

- [ ] **Step 4: Verify notification routing**

Run:

```bash
pnpm --filter @hockey/web test -- src/platform/deepLinks.test.ts src/platform/nativeNotifications.test.ts
pnpm --filter @hockey/web typecheck
pnpm mobile:android:debug
```

Then send local debug data payloads for every channel and verify foreground, background, terminated, authenticated, and logged-out behavior.

- [ ] **Step 5: Commit native notification routing**

```bash
git add packages/web/src/platform packages/web/src/app/App.tsx packages/mobile/android
git commit -m "feat: route Android notifications"
```

---

### Task 7: Define and serve the signed Android release manifest

**Files:**
- Create: `packages/server/src/mobileRelease/schema.ts`
- Create: `packages/server/src/mobileRelease/schema.test.ts`
- Create: `packages/server/src/mobileRelease/signature.ts`
- Create: `packages/server/src/mobileRelease/signature.test.ts`
- Create: `packages/server/src/mobileRelease/routes.ts`
- Create: `packages/server/test/mobile-release-routes.test.ts`
- Create: `packages/server/src/mobileRelease/build-manifest-cli.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces public `AndroidReleaseManifest` with exact fields from the spec.
- Produces: `canonicalizeReleaseManifest(unsigned): Uint8Array`.
- Produces: `signReleaseManifest(unsigned, privateKey): SignedAndroidReleaseManifest` using Ed25519.
- Produces HTTP: `GET /mobile/android/release` and `GET /mobile/android/download`.
- Produces CLI: `pnpm --filter @hockey/server mobile:release-manifest -- <metadata-json> <output-json>`.

- [ ] **Step 1: Write the strict schema and signature tests**

```ts
export interface UnsignedAndroidReleaseManifest {
  versionName: string;
  latestVersionCode: number;
  minimumSupportedVersionCode: number;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
  releaseNotes: string;
  publishedAt: string;
  keyId: string;
}

export interface SignedAndroidReleaseManifest extends UnsignedAndroidReleaseManifest {
  signature: string;
}
```

Reject unknown keys, noncanonical URL/HTTPS host, hash not matching 64 lowercase hex characters, invalid ISO timestamp, nonpositive versions/sizes, and `minimumSupportedVersionCode > latestVersionCode`. Prove any changed signed field fails verification.

- [ ] **Step 2: Run signature tests and confirm failure**

Run: `pnpm --filter @hockey/server test -- src/mobileRelease/schema.test.ts src/mobileRelease/signature.test.ts test/mobile-release-routes.test.ts`

Expected: FAIL before the module and route exist.

- [ ] **Step 3: Implement deterministic Ed25519 signing**

Canonicalize fields in a fixed order with UTF-8 JSON and no locale-dependent formatting. The build CLI reads the private key only from `ANDROID_MANIFEST_PRIVATE_KEY`, refuses to overwrite an existing output file, writes mode `0600` in CI workspace, and never echoes the key.

- [ ] **Step 4: Serve only a verified active manifest**

Configure `ANDROID_RELEASE_MANIFEST_PATH` and `ANDROID_MANIFEST_PUBLIC_KEYS_JSON`. At process start and on a short mtime cache, parse and verify the file before serving it. Return `503 mobile_release_unavailable` if absent/invalid. Response uses `Cache-Control: public, max-age=60, must-revalidate` and an ETag derived from the complete signed bytes.

`GET /mobile/android/download` redirects with `302` only to the verified manifest's canonical `apkUrl`, so profile links never hard-code a version.

- [ ] **Step 5: Verify route behavior**

Run:

```bash
pnpm --filter @hockey/server test -- src/mobileRelease/schema.test.ts src/mobileRelease/signature.test.ts test/mobile-release-routes.test.ts
pnpm --filter @hockey/server typecheck
```

Expected: PASS for valid manifest, 304 ETag, absent file, bad signature, bad host, and invalid minimum version.

- [ ] **Step 6: Commit the release contract**

```bash
git add packages/server/src/mobileRelease packages/server/test/mobile-release-routes.test.ts packages/server/src/app.ts packages/server/src/config.ts packages/server/package.json .env.example
git commit -m "feat: serve signed Android release metadata"
```

---

### Task 8: Implement the native updater and package-installer handoff

**Files:**
- Create: `packages/web/src/mobileUpdate/types.ts`
- Create: `packages/web/src/mobileUpdate/versionPolicy.ts`
- Create: `packages/web/src/mobileUpdate/versionPolicy.test.ts`
- Create: `packages/web/src/mobileUpdate/manifest.ts`
- Create: `packages/web/src/mobileUpdate/manifest.test.ts`
- Create: `packages/web/src/mobileUpdate/store.ts`
- Create: `packages/web/src/mobileUpdate/store.test.ts`
- Create: `packages/web/src/mobileUpdate/nativeUpdater.ts`
- Create: `packages/web/src/mobileUpdate/nativeUpdater.test.ts`
- Create: `packages/mobile/android/app/src/main/java/ru/ultimatehockey/app/ApkUpdaterPlugin.kt`
- Create: `packages/mobile/android/app/src/main/res/xml/file_paths.xml`
- Modify: `packages/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `packages/mobile/android/app/build.gradle`

**Interfaces:**
- Produces: `UpdatePolicy = 'current' | 'optional' | 'mandatory'`.
- Produces: `resolveUpdatePolicy(installedVersionCode, manifest): UpdatePolicy`.
- Produces Zustand state `{ status, manifest, policy, progress, error, dismissedVersionCode }`.
- Native plugin methods: `getInstalledVersion`, `downloadApk`, `cancelDownload`, `canInstallPackages`, `openInstallPermission`, `installDownloadedApk`, and progress events.

- [ ] **Step 1: Write version-policy tests**

Cover equal/newer installed builds, optional update, mandatory update, malformed manifest, dismissal scoped to one latest version, and a newer release reappearing after dismissal.

- [ ] **Step 2: Write manifest-verification tests**

Ship a public Ed25519 key by `keyId`. Fetch raw JSON, validate strict fields, canonicalize the unsigned values, and verify the signature before trusting version policy or URL. Test changed version, URL, hash, size, notes, timestamp, signature, and unknown key id.

- [ ] **Step 3: Implement bounded update checks**

Check on cold start, native resume, manual profile action, and every five minutes while active. Use an eight-second request timeout. Cache only the last successfully verified manifest. A network or signature failure never creates a new mandatory gate; an already verified mandatory policy remains active.

- [ ] **Step 4: Implement the Android download plugin**

Use app-private cache storage and Android's system download APIs or a streaming `HttpsURLConnection` restricted to `ultimatehockey.ru`. Emit integer byte progress, write to a temporary `.part`, require exact content length, compute SHA-256 while reading, fsync, then atomically rename to `.apk`. Delete partial/mismatched files on cancellation or failure.

- [ ] **Step 5: Implement safe installer handoff**

Declare `REQUEST_INSTALL_PACKAGES` and a non-exported `FileProvider` with the narrow cache path from `file_paths.xml`. If `PackageManager.canRequestPackageInstalls()` is false, open `ACTION_MANAGE_UNKNOWN_APP_SOURCES` for this package only. For a verified APK, open `ACTION_VIEW` using a `content://` URI, `application/vnd.android.package-archive`, read permission, and a new task. Never use `file://` or request broad storage permission.

- [ ] **Step 6: Verify update failure states**

Run:

```bash
pnpm --filter @hockey/web test -- src/mobileUpdate/versionPolicy.test.ts src/mobileUpdate/manifest.test.ts src/mobileUpdate/store.test.ts src/mobileUpdate/nativeUpdater.test.ts
pnpm --filter @hockey/web typecheck
pnpm mobile:android:debug
```

Instrument a local fixture server or Android test interceptor for interrupted download, wrong length, wrong SHA-256, invalid signature, denied unknown-source permission, installer cancellation, and successful installer launch.

- [ ] **Step 7: Commit the updater**

```bash
git add packages/web/src/mobileUpdate packages/mobile/android
git commit -m "feat: add verified Android APK updater"
```

---

### Task 9: Add profile, home, and mandatory-update UI

**Files:**
- Create: `packages/web/src/components/AndroidAppCard.tsx`
- Create: `packages/web/src/components/AndroidAppCard.test.tsx`
- Create: `packages/web/src/components/AndroidUpdateBanner.tsx`
- Create: `packages/web/src/components/AndroidUpdateBanner.test.tsx`
- Create: `packages/web/src/components/MandatoryAndroidUpdateModal.tsx`
- Create: `packages/web/src/components/MandatoryAndroidUpdateModal.test.tsx`
- Modify: `packages/web/src/screens/ProfileSupportSections.tsx`
- Modify: `packages/web/src/screens/ProfileSettingsScreen.test.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.tsx`
- Modify: `packages/web/src/screens/SectionsScreen.test.tsx`
- Modify: `packages/web/src/app/App.tsx`
- Modify: `packages/web/src/app/design-system.css`

**Interfaces:**
- Consumes: update store and `GET /mobile/android/download`.
- Produces: permanent profile card, conditional optional banner, and route-level mandatory gate.

- [ ] **Step 1: Write the profile-card tests**

Assert Android browser shows `Скачать приложение`, APK shows installed/current versions and `Проверить обновления`, outdated APK shows `Обновить`, non-Android browser shows `Доступно для Android` without a download button, and no component hard-codes a versioned APK URL.

- [ ] **Step 2: Write optional-banner tests**

Assert no banner for current/unverified/browser state; compact banner for optional update; dismissal persists only for `latestVersionCode`; next version reappears; pressing `Обновить` starts the native updater.

- [ ] **Step 3: Write mandatory-modal tests**

Assert the modal uses `AccessibleModal` with `closeBlocked`, blocks protected route interaction, contains no icon in its CTA, reports download progress, handles permission denial and retry, and remains until the installed version is supported.

- [ ] **Step 4: Implement the profile card**

Place `Приложение для Android` in `ProfileSupportSections`, after notification preferences and before feedback. Browser Android opens `/api/mobile/android/download`; native Android runs the updater; desktop/iOS remains informational.

- [ ] **Step 5: Implement the home banner**

Mount the compact card at the top of `SectionsScreen` inside its scroll surface so it never overlays gameplay. Do not show a permanent APK promotion on the main surface.

- [ ] **Step 6: Implement the mandatory route gate**

Mount one modal at `AppExperience` level after auth hydration. Allow only login/auth completion, update actions, and logout while mandatory. Do not destroy the current session or daily-game state.

- [ ] **Step 7: Run focused rendered tests**

Run:

```bash
pnpm --filter @hockey/web test -- src/components/AndroidAppCard.test.tsx src/components/AndroidUpdateBanner.test.tsx src/components/MandatoryAndroidUpdateModal.test.tsx src/screens/ProfileSettingsScreen.test.tsx src/screens/SectionsScreen.test.tsx
pnpm --filter @hockey/web typecheck
pnpm exec eslint 'packages/web/src/**/*.{ts,tsx}'
```

Expected: PASS, including keyboard focus containment and Russian copy.

- [ ] **Step 8: Commit update UI**

```bash
git add packages/web/src/components packages/web/src/screens/ProfileSupportSections.tsx packages/web/src/screens/ProfileSettingsScreen.test.tsx packages/web/src/screens/SectionsScreen.tsx packages/web/src/screens/SectionsScreen.test.tsx packages/web/src/app
git commit -m "feat: expose Android downloads and updates"
```

---

### Task 10: Build, sign, host, and atomically publish APK releases

**Files:**
- Create: `.github/workflows/android-release.yml`
- Modify: `packages/mobile/android/app/build.gradle`
- Modify: `packages/mobile/android/gradle.properties`
- Modify: `packages/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `packages/server/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `Caddyfile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Create: `packages/server/src/mobileRelease/downloadPage.ts`
- Create: `packages/server/src/mobileRelease/downloadPage.test.ts`
- Create: `docs/runbooks/android-release.md`

**Interfaces:**
- Workflow inputs: `versionName`, `versionCode`, `minimumSupportedVersionCode`, and Russian `releaseNotes`.
- Candidate output: signed APK plus metadata JSON, SHA-256, byte size, package details, signing fingerprint, Git SHA, and CI run id.
- Publish environment requires explicit approval and writes versioned artifact before active manifest.

- [ ] **Step 1: Add a testable public download page**

Render a server-owned unauthenticated page at `/download/android` that reads only verified release metadata, shows application name, version, size, Android 8.0+ requirement, installation steps, and a link to the canonical versioned APK. Escape release notes and set a restrictive CSP; do not inject raw HTML from the manifest.

- [ ] **Step 2: Configure release signing without repository secrets**

Gradle reads temporary CI paths/properties only when assembling release. The workflow reconstructs the keystore in the runner temporary directory from `ANDROID_KEYSTORE_BASE64`, supplies alias/store/key passwords through masked environment variables, and deletes temporary material in an `always()` cleanup step. No signing value enters `gradle.properties` or artifacts.

- [ ] **Step 3: Build and inspect an unpublished candidate**

The candidate job runs:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm --filter @hockey/game-core build
pnpm build
pnpm test
pnpm mobile:android:release
apksigner verify --verbose --print-certs packages/mobile/android/app/build/outputs/apk/release/app-release.apk
aapt dump badging packages/mobile/android/app/build/outputs/apk/release/app-release.apk
sha256sum packages/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Fail unless package id is `ru.ultimatehockey.app`, minimum SDK is 26, requested versions match extracted values, and the signer fingerprint equals protected variable `ANDROID_SIGNING_CERT_SHA256`.

- [ ] **Step 4: Gate publication on physical-device acceptance**

Upload the candidate APK and evidence bundle as immutable Actions artifacts. The protected `android-production` environment publish job requires manual approval after the physical-device checklist records PASS for that exact SHA-256. Rebuilding creates a different candidate and invalidates prior acceptance.

- [ ] **Step 5: Add server release storage without building on the VPS**

Mount a dedicated host directory such as `/opt/hockey/android-releases` read-only into the server container at `/app/android-releases`. The workflow uploads the already-built APK and signed manifest to a staging filename over SSH/SCP. It does not run Gradle, Node, or signing on the VPS.

- [ ] **Step 6: Publish atomically**

On the VPS, verify uploaded byte size and SHA-256 against candidate metadata, move the APK to its immutable versioned filename, verify the public HTTPS bytes, then atomically rename the signed manifest to `current.json` last. Never replace an existing versioned APK with different bytes.

- [ ] **Step 7: Preserve shared Caddy production hostnames in both deploy workflows**

Update production and dev deployment inputs together so recreating shared Caddy retains `ultimatehockey.ru`, legacy production, `www`, and dev routing. Add the APK route without enabling or changing the separately gated legacy-domain Phase 2 redirect.

- [ ] **Step 8: Publish verified App Links metadata**

Serve `/.well-known/assetlinks.json` with `application/json`, the exact package id, and accepted release signing certificate fingerprint. Verify Android domain association with `adb shell pm get-app-links ru.ultimatehockey.app` on the signed candidate before changing VK or Telegram provider callbacks.

- [ ] **Step 9: Document the exact release runbook**

The runbook includes version selection, secret names, candidate build, evidence capture, device acceptance, provider callback checks, publication approval, public read-back, mandatory-version raising, failure stops, and superseding a bad release with a higher `versionCode`. Explicitly prohibit keystore rotation, APK overwrite, server-side build, and Android downgrade rollback.

- [ ] **Step 10: Verify workflow and hosting configuration**

Run:

```bash
pnpm --filter @hockey/server test -- src/mobileRelease/downloadPage.test.ts test/mobile-release-routes.test.ts
docker compose config
git diff --check -- .github/workflows/android-release.yml .github/workflows/deploy.yml .github/workflows/deploy-dev.yml Caddyfile docker-compose.yml
git diff -- .github/workflows/android-release.yml .github/workflows/deploy.yml .github/workflows/deploy-dev.yml Caddyfile docker-compose.yml
```

Expected: tests PASS, Compose parses, `actionlint` passes when installed, `git diff --check` is clean, and shared hostname variables remain present in both deploy workflows.

- [ ] **Step 11: Commit release automation**

```bash
git add .github/workflows/android-release.yml .github/workflows/deploy.yml .github/workflows/deploy-dev.yml packages/mobile/android packages/server/Dockerfile docker-compose.yml Caddyfile packages/server/src/mobileRelease docs/runbooks/android-release.md
git commit -m "feat: automate signed Android releases"
```

---

### Task 11: Complete regression, security, and physical-device acceptance

**Files:**
- Create: `docs/qa/android-release-acceptance.md`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: documentation only where commands or configuration changed in Tasks 1-10

**Interfaces:**
- Produces an exact-artifact acceptance record with expected/actual, Android version, scenario, PASS/FAIL/BLOCKED, APK SHA-256, Git SHA, CI run, and tester/device class.
- Produces first public release evidence without treating deployment health as rendered acceptance.

- [ ] **Step 1: Run the complete local verification chain**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm --filter @hockey/game-core build
pnpm build
pnpm test
pnpm mobile:android:debug
```

Record exact command results. DB-backed tests require the documented Postgres/Redis `TEST_*` environment; skipped integration suites are not reported as passing.

- [ ] **Step 2: Review the complete Android security boundary**

Inspect manifest exports, App Link hosts/paths, WebView navigation, cleartext traffic, certificate pin assumptions, protected storage, `FileProvider` paths, install-package permission, URL allowlists, OAuth replay behavior, token/log redaction, manifest signature verification, and release-secret handling. Record actionable findings and fix them before candidate build.

- [ ] **Step 3: Build one signed release candidate**

Trigger `android-release.yml` candidate stage with a unique higher `versionCode`. Capture candidate SHA-256, byte size, Git SHA, version values, minimum SDK, signer fingerprint, and Actions URL. Do not publish yet.

- [ ] **Step 4: Execute the physical-device matrix**

Test the exact candidate on Android 8.0, one intermediate supported version, and the current Android version. For each device record:

- clean install and launch;
- session persistence across force-stop/reboot;
- VK installed-app and browser fallback;
- Telegram installed-app and browser fallback;
- OAuth cancel, expiry, mismatch, and replay;
- WebSocket reconnect and access-token refresh;
- each push category foreground/background/terminated;
- notification deep links authenticated/logged out;
- optional update, dismissal, profile check, and next-version reappearance;
- mandatory update, unknown-source denial, retry, installer cancellation, and successful in-place install;
- interrupted/corrupt download and unavailable/invalid manifest;
- payment creation/return without granting coins from the return URL;
- daily game and one additional critical game mode.

- [ ] **Step 5: Verify browser/PWA regression separately**

On `ultimatehockey.ru`, verify Telegram Widget, VK login, `/api/me`, refresh rotation, WebSocket, browser Web Push, Service Worker update prompt, PWA installation, push deep links, public prices/payment return, and the new Android download page. APK success does not substitute for browser acceptance.

- [ ] **Step 6: Publish through the protected job**

Only after every release-blocking row is PASS, approve the exact candidate's publish job. Verify the public APK SHA-256 equals the accepted candidate, `GET /api/mobile/android/release` returns the signed expected manifest, `/download/android` links to that immutable file, and a clean phone can install it from the public URL.

- [ ] **Step 7: Raise the minimum supported version separately when required**

Do not make the first release mandatory by default. To retire an older build, publish and accept the replacement first, then issue a newly signed manifest with the chosen `minimumSupportedVersionCode`. Verify one supported old build remains usable and one below-minimum build shows the blocking modal and successfully updates.

- [ ] **Step 8: Commit acceptance documentation**

```bash
git add docs/qa/android-release-acceptance.md README.md .env.example
git commit -m "docs: record Android release acceptance"
```

---

## Final completion gate

The Android initiative is complete only when all of the following are true:

- The exact signed public APK matches an accepted CI candidate by SHA-256.
- Package id, version, minimum SDK, and signing fingerprint match the release record.
- VK and Telegram succeed on physical Android through installed-app and browser fallback paths.
- FCM notifications arrive and route correctly while the application is foregrounded, backgrounded, and terminated.
- Optional and mandatory updates behave as specified, including denied permission and failed download recovery.
- In-place update preserves the player session and server-side progress.
- Existing browser PWA, VAPID Web Push, WebSocket, auth, and payment checks pass separately.
- The permanent profile download surface and conditional main update card pass rendered QA.
- Release secrets remain absent from git, build logs, public artifacts, and container images.
- The first public manifest does not unnecessarily force all players to update.
