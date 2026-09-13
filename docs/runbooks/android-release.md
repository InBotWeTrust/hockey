# Android release runbook

This runbook publishes a signed APK to `ultimatehockey.ru`. A green candidate build is not permission to publish. The protected `android-production` environment must require an owner approval after physical-device acceptance of the exact candidate SHA-256.

## Permanent configuration

Create the permanent signing identity once in an owner-controlled secure location. Independently verify and retain its SHA-256 certificate fingerprint. The candidate job is restricted to `main` and uses the separately protected `android-signing` environment. Configure its environment secrets without printing them in workflow logs:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

Configure these `android-production` environment secrets:

- `ANDROID_MANIFEST_PRIVATE_KEY`

The workflow continues to use the existing repository deploy secrets `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY`, and `DEPLOY_PATH`.

Configure the non-secret repository variables `ANDROID_SIGNING_CERT_SHA256`,
`ANDROID_MANIFEST_KEY_ID`, and `ANDROID_MANIFEST_PUBLIC_KEYS_JSON`. Protect both environments with a required owner reviewer and restrict
them to `main`. The signing approval allows building the candidate; the later
`android-production` approval allows publication only after physical-device acceptance.

The public manifest key matching `ANDROID_MANIFEST_KEY_ID` must already be present in the application and in `ANDROID_MANIFEST_PUBLIC_KEYS_JSON`. Never rotate the Android keystore: losing or replacing it permanently breaks in-place updates.

Current production identities (verify them against GitHub Variables before every candidate):

- APK signing certificate SHA-256: `2893c7191ca877b0e71f16cf4e839d31db0d11c23ba9e9d2a8d751997c0b497f`
- manifest key id: `android-manifest-554cef5a349b36e9`

## 1. Select versions

Choose a unique `versionCode` greater than every APK ever published. Choose a filename-safe `versionName`. This workflow requires `minimumSupportedVersionCode` to remain at the currently active value (or `1` for the first release). Raising it requires a separate explicitly approved mandatory-update change after the replacement is public and accepted. Write concise Russian release notes.

Do not reuse a versioned APK filename or version code. Android downgrade rollback is prohibited. A bad release is superseded by a new build with a higher `versionCode`.

## 2. Build the unpublished candidate

Run the `Android Release` workflow from the exact reviewed Git SHA with the four inputs. The candidate job runs repository checks, reconstructs the keystore only in the runner temporary directory, builds and verifies the signed APK, then removes the keystore in an `always()` cleanup step.

Record from the Actions summary and downloaded candidate artifact:

- workflow URL, run id, attempt, and Git SHA;
- `versionName`, `versionCode`, and `minimumSupportedVersionCode`;
- APK SHA-256 and byte size;
- package id `ru.ultimatehockey.app` and minimum SDK 26;
- signing certificate fingerprint.

Stop if any value differs from the requested or permanent value. Do not rebuild on the VPS and do not copy signing material to the VPS.

## 3. Physical-device acceptance

Install the candidate artifact on a real Android 8.0+ device. Record PASS against its exact SHA-256 for launch, embedded assets, VK login, Telegram login, session persistence, FCM notification and deep link, background/resume, and user-confirmed APK update. Confirm an in-place update preserves application data and uses the same signer.

Before changing any VK or Telegram callback, verify the signed candidate's App Link:

```bash
adb shell pm get-app-links ru.ultimatehockey.app
```

The canonical `ultimatehockey.ru` association must be verified. Confirm browser Telegram/VK flows continue to work; provider callback changes remain a separate explicitly approved action.

## 4. Approve protected publication

Approve the waiting `Publish accepted candidate` job only when the physical-device checklist says PASS for the exact SHA-256 shown by that workflow run. Reject or cancel it if the candidate was rebuilt, the artifact hash differs, or any required evidence is missing.

Publication uploads the already-built APK to a private staging directory outside the Caddy web root, checks size, hash, and manifest signature, moves the APK to its immutable versioned filename, verifies the public HTTPS bytes, and atomically renames the signed manifest to `current.json` last. A failure before the final rename leaves clients on the previous manifest.

Never overwrite an existing versioned APK. Never activate the manifest before the public artifact read-back succeeds.

## 5. Public read-back

After the workflow is green, independently verify:

```bash
curl -fsSL https://ultimatehockey.ru/api/mobile/android/release | jq .
curl -fsSL https://ultimatehockey.ru/.well-known/assetlinks.json | jq .
curl -fsSL https://ultimatehockey.ru/download/android
```

Download the exact manifest `apkUrl`, compare its byte size and SHA-256 with the accepted candidate, and confirm the manifest signature in a production client. Check canonical, legacy, `www`, and dev routing; publication must not enable the legacy-domain Phase 2 redirect.

Only after this read-back and repeat device acceptance may a later higher release raise `minimumSupportedVersionCode`. Raising it makes older clients mandatory-update, so treat that change as its own release decision.

## Failure stops

Stop without activation when signing identity, extracted package/version/minimum SDK, candidate hash, physical-device acceptance, public APK bytes, App Link association, or protected approval is missing or mismatched. Preserve evidence and diagnose; do not bypass checks.

If an activated release is bad, publish a corrected APK with a higher `versionCode`. Do not rotate the keystore, overwrite the old APK, build on the server, lower the public artifact in place, or attempt an Android downgrade rollback.
