# ASSOULI AUTOX v1.9.15 – Test report

## Pre-checks (executed, 2026-11-10)
- `apksigner verify --print-certs` on the new APK (42 / 1.9.15) :
  `SHA-256 360083a3747a7f536d2b9557465abffb81ea08ac2c12b34f1906c6c6801bf7b8`
  == `36:00:83:A3…7B8` expected. **PASS.**
- Same fingerprint previously confirmed on `v1.9.11` (15 128 384 o) and
  `v1.9.12` (15 291 582 o) release APKs. **PASS** — in-place updates remain
  possible signature-wise.
- `aapt dump badging` : `ma.marocjobs.hub` `versionCode='42'` `versionName='1.9.15'`.
- Keystore backed up outside the repo (`%TEMP%\opencode\debug.keystore.bak`).
- `adb devices` : no device; `emulator` binary absent from this SDK →
  device/emulator tests **NOT RUN** in this environment.

## Build artefacts
| File | Size | Notes |
|---|---|---|
| `ASSOULI-AUTOX.apk` | 13 993 294 o | sideload, 42 / 1.9.15, debug keystore |
| `ASSOULI-AUTOX-play.aab` | 12 878 784 o | Play bundle (`playRelease`) |
| `ASSOULI-ADMIN.apk` | 620 262 o | admin 1.6.19, rebuilt against 42/1.9.15 |
- SHA-256 APK : `b760c361998f327592fa5981e96b7bc02081938ab99a2d4ddc5b970719dab1cd`

## Security checks (executed)
- `access.json` : 4 `marches` entries are 64-char SHA-256, `disabled` empty,
  message UTF-8 corrected. Client `emailMatchesList` accepts plain or hash.
- Bundle : no `DEMO_EMAIL`, no `DEMO_CODE`, no `demo@assouli.app`, no `246810`,
  no `codeInfo.code` / `mGateInfo.code` plaintext comparison.
- `App.jsx` : OTP stored as `sha256Hex(code)`, max 5 attempts, resend cooldown
  60 s for login and Marchés gate.
- Manifest (`aapt dump xmltree`) : `usesCleartextTraffic=0x0`,
  `networkSecurityConfig=@0x7f100003`, `BootReceiver exported=0x0`,
  `AccountsProvider exported=0x1` with `readPermission` + `writePermission`
  `ma.marocjobs.hub.permission.READ_ACCOUNTS` (protectionLevel signature).
- `capacitor.config.json` : no `allowMixedContent`, no `server.cleartext`.
- Updater : JS fetch + base64 + Filesystem path removed; only
  `ApkUpdater.downloadAndInstall` remains. Native `.part` + Range resume,
  4 mirrors, SHA-256/size/package/version/signature validation.
- Listener lifecycle : `progress` / `state` handles are created per run and
  removed in `finally` (fixes stale `runId` after retry).
- Install-time revalidation : `installDownloaded` / `installLatest` refuse
  wrong package, version ≤ installed, or different signing certificate.

## Acceptance tests — NOT RUN (no device/emulator)
| Test | Status |
|---|---|
| 1.9.14/1.9.11 -> 1.9.15 over LTE throttling | NOT RUN – emulator absent |
| Airplane 20 s : resume from `.part` (not 0) | NOT RUN |
| Block mirror 1 (403) : failover to mirror 2 | NOT RUN |
| 3 consecutive failures : real error + manual buttons | NOT RUN |
| Single downloader thread (logs) | NOT RUN (thread `ApkUpdater-download`) |
| Corrupted APK : SHA-256/signature rejection | NOT RUN |
| Install-over-install keeps data/login | NOT RUN |

Commands on a machine with a device/emulator:
```powershell
adb devices
emulator -avd <AVD> -netspeed lte -netdelay umts
adb logcat -s ApkUpdater:D
# Install 1.9.14, let it update; enable airplane mode mid-download and check
# `updates/ASSOULI-AUTOX-1.9.15.apk.part` grows after reconnect.
# Long-press the update card to show the last 20 updater log lines.
```

## Remote contract (to verify after publish)
- Raw manifest : `42 / 1.9.15`, `size=13993294`, `sha256=b760c361…b1cd`.
- Pages manifest : identical.
- `mirrors[0]` : jsDelivr `@v1.9.15` (immutable tag), then Pages, raw, release.
- APK + JSON published together (commit + push, then release `v1.9.15`).

## Residual risk
- Gmail app password still embedded in `BuildConfig.SMTP_PASSWORD` because no
  auth backend exists. **Rotate it now** (Google Account → Security → App
  passwords → delete), then deploy a small server for code delivery and remove
  `MailPlugin` from the client. Until then, anyone with the APK can extract it.
- The admin APK embeds a local GitHub token (`adminapp/admin-token.txt`,
  gitignored). Keep that APK private; rotate the token if it leaks.

## Manual steps for users stuck on 1.9.11/1.9.14 (old updater)
1. Open in the phone browser:
   `https://portailmpublic-pixel.github.io/maroc-jobs-hub/ASSOULI-AUTOX.apk`
2. Chrome downloads ~14 MB (resumable). Tap the file.
3. Allow **Install unknown apps** for Chrome if asked, then **Install**.
4. Reopen ASSOULI AUTOX; the same signing certificate means data/login are kept.
   Future updates use the fixed native downloader automatically.
