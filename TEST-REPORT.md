# ASSOULI AUTOX v1.9.14 – Test report

## Pre-checks (executed, 2026-11-08)
- `apksigner verify --print-certs` on the new APK (41 / 1.9.14) :
  `SHA-256 360083a3747a7f536d2b9557465abffb81ea08ac2c12b34f1906c6c6801bf7b8`
  == `36:00:83:A3…7B8` expected. **PASS.**
- Same fingerprint on `v1.9.11` release APK (15 128 384 o) and `v1.9.12`
  release APK (15 291 582 o). **PASS** — in-place updates were always possible
  signature-wise; the failure was the download loop, not the signature.
- `aapt dump badging` : `ma.marocjobs.hub` `versionCode='41'` `versionName='1.9.14'`.
- Keystore backed up to `%TEMP%\opencode\debug.keystore.bak` (hors repo).
  `adb devices` : aucun appareil, binaire `emulator` absent du SDK
  (`.sdk/android` ne contient que build-tools/platform-tools) → tests
  emulateur **non executables dans cet environnement**.

## Remote contract (executed)
- Raw manifest : 41 / 1.9.14, `mirrors` 4, `size=14036654`,
  `sha256=f1297cb8...5304` (16 octets lus au `Get-FileHash`).
- Pages manifest : identique (41 / 1.9.14, meme size/sha256).
- Raw APK : HTTP 200, 14 036 654 o. Pages APK : HTTP 200, 14 036 654 o.
- jsDelivr CDN : HTTP 200, 14 036 654 o.
- Release `v1.9.14` asset `724818604` : 14 036 654 o, HTTP 200.
- APK et JSON publies ensemble (commit `a6b1f90` push, puis release) :
  jamais de divergence.

## Code review (manual, static)
- `App.jsx` : aucun `jsDownloadApk` / `Filesystem.writeFile` de chemin d update,
  aucun `Connexion interrompue`. `startUpdate` single-flight via `runId`,
  watchdog observateur via `getDownloadState`, polling 4 s supprime, boutons
  manuels apres 2 echecs, appui long = diagnostics.
- `ApkUpdaterPlugin.java` : `LOCK` + `running`, `.part` + `Range`, 15 s/20 s,
  3 reprises + failover `mirrors[]`, `size`/`sha256`/signature verifies,
  `progress` throttled 200 ms + `state`, journal `ApkUpdater`, `installApk`
  FileProvider + `canRequestPackageInstalls` conserve.

## Acceptance tests — NOT RUN (no device/emulator)
| Test | Status |
|---|---|
| 1.9.11 -> 1.9.14 sous throttling LTE (`-netspeed lte`) | NOT RUN – emulator absent |
| Airplane 20 s : reprise depuis `.part` (pas 0) | NOT RUN |
| Bloquer miroir 1 (403) : failover | NOT RUN (code present, test manuel pending) |
| 3 echecs consecutifs : erreur reelle + boutons | NOT RUN |
| Un seul thread downloader (logs) | NOT RUN (thread named `ApkUpdater-download`, a verifier sur device) |
| Fichier corrompu : rejet sha256/signature | NOT RUN |
| Install-over-install : donnees + login conserves | NOT RUN |

Commands to run on a machine with emulator/device (see BUILD-SIGNING.md):
```powershell
adb devices
emulator -avd <AVD> -netspeed lte -netdelay umts
adb logcat -s ApkUpdater:D
# Fresh install 1.9.11, wait update, airplane mid-download, check .part resume,
# long-press update card for diagnostics.
```

## Deliverables
- Code : `ApkUpdaterPlugin.java` (rewrite), `UpdaterLog.java` (new),
  `App.jsx` (state machine), `build.gradle` (41/1.9.14, debug signing,
  minify), `proguard-rules.pro`, `publish-update.ps1`.
- Server : `app/public/app-version.json`, `docs/app-version.json` (41/1.9.14,
  `mirrors`/`size`/`sha256`), APK `docs/ASSOULI-AUTOX.apk` (14 036 654 o).
- Release : `https://github.com/portailmpublic-pixel/maroc-jobs-hub/releases/tag/v1.9.14`
  asset `ASSOULI-AUTOX.apk` `724818604`.

## Manual steps for users stuck on 1.9.11 (old updater cannot be fixed remotely)
The 1.9.11 build's updater downloads 1.9.12/1.9.14 via its own broken JS loop,
but the new `url`/`mirror` fields in `app-version.json` point to the fixed APK,
so a manual install unblocks once. After that, future updates work automatically.

1. Go to the Pages link in the phone browser (or copy it via the update screen's
   *Ouvrir dans le navigateur* once on 1.9.14+):
   `https://portailmpublic-pixel.github.io/maroc-jobs-hub/ASSOULI-AUTOX.apk`
2. Chrome downloads the 14 Mo APK (Resume supported).
3. Tap the downloaded file (or `Downloads` → `ASSOULI-AUTOX.apk`).
4. If asked, allow **Install unknown apps** for Chrome, then **Install**.
5. Open ASSOULI AUTOX, log in again (data kept), confirm version `1.9.14 (41)`
   in Configurations.
Since the signature is identical, this is an update, not a fresh install.

## Prestations
- `ASSOULI-AUTOX.apk` 14 036 654 o (sideload, 41/1.9.14)
- `ASSOULI-AUTOX-play.aab` 12 921 987 o (Play, build `playRelease`)
- `ASSOULI-ADMIN.apk` 624 833 o (admin 1.6.19)
