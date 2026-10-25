# ASSOULI AUTOX — Updates & Admin

## 1. Publish an app update (one command)

```powershell
cd C:\Users\hp\Documents\JOB\MarocJobs-APK
.\publish-update.ps1 -Version 1.5.0 -Notes "Corrections + nouvelles offres"
```

What it does:
1. Bumps `versionCode` + `versionName`.
2. Updates `app/public/app-version.json` (the manifest every phone reads).
3. Builds the web app, syncs Capacitor, builds both APKs.
4. Commits, uploads `ASSOULI-AUTOX.apk` to a new GitHub release, pushes.

Phones check on every launch and every 30 minutes:
they show an **"Installer"** banner, download the APK and open the Android installer.
Future releases install over the old app (same signing key).

> First install only: the old v1.0 (versionCode 1) has no updater, so install
> `ASSOULI-AUTOX.apk` (1.1.0) manually one time. After that everything is automatic.

## 2. Admin APK (accounts + Marchés authorization)

File: `ASSOULI-ADMIN.apk` — package `ma.marocjobs.hub.admin`.

**Keep this APK private**: it contains a GitHub write token.

**Version 1.3.0+** opens with an animated splash and a modern dashboard:
three live counters (Comptes actifs / Désactivés / Accès Marchés), rounded
account cards, a fixed Recharger / Publier bar, and a collapsible GitHub
settings card.

The admin APK automatically lists the accounts created on the phone where both apps
are installed (name, e-mail, date, Actif / Désactivé). It also remembers the last list
even if the main app is closed or its data is cleared.

Usage:
1. Install **ASSOULI AUTOX 1.5.0+** first, open it and create/log in to an account.
2. Install and open **ASSOULI ADMIN 1.3.0+** (same signing key — both debug APKs are).
3. The accounts appear under **Comptes de cet appareil**.
   - **Désactiver / Activer** blocks or restores the whole account.
   - **Marchés** grants or removes the special Marchés Publics access.
   - The manual e-mail field can also authorize an address that is not on this phone.
4. Tap **Publier les modifications**. This writes both lists to `access.json`.

Effect on phones:
- Disabled e-mail is blocked at login **and** signup.
- If the main app is open on the same phone, the admin broadcast closes it within
  seconds. Otherwise it is stopped at the next launch/resume (plus a 20-second check).
- The admin message is shown the next time the app opens.
- Works remotely; no need to rebuild the app.

### Marchés Publics access

`access.json` contains a `marches` allow-list:

```json
{
  "disabled": ["compte-bloque@example.com"],
  "marches": ["compte-autorise@example.com"],
  "message": "Ce compte a été désactivé par l’administrateur.",
  "updatedAt": "2026-10-25T12:00:00Z"
}
```

- The Marchés tab is locked for every e-mail that is not in `marches`.
- The user unlocks it with a **dedicated e-mail + 6-digit code** login; the
  verified address is remembered on that device.
- Removing the address and publishing re-locks the tab at the next check
  (20 seconds while the app is open, or at the next launch).
- The list is public (GitHub raw file), so this is an authorization gate, not
  encryption. Do not put secrets in the e-mails or the message.

> The account list is per-phone (the two APKs share it through a
> signature-protected provider). To see accounts from **every** user's phone,
> a small central database is required; the app can be connected to
> Firebase/Supabase or a Google Sheet on request.

Login is passwordless: the app sends a 6-digit code, the account is saved on the
device after verification, and later logins only ask for the code again.

Token: the APK is built with the token from
`app/android/adminapp/admin-token.txt` (local only, never committed).
To replace it, edit that file and rebuild:

```powershell
cd app\android
$env:JAVA_HOME="C:\Users\hp\Documents\JOB\MarocJobs-APK\.sdk\jdk-17.0.11+9"
.\gradlew.bat :adminapp:assembleDebug --no-daemon
```

Result: `app/android/adminapp/build/outputs/apk/debug/adminapp-debug.apk`.

## 3. Notifications (app closed)

- A WorkManager job checks the cloud every ~15 minutes, even when the app is
  closed, and posts a notification when:
  - `alerts.json` changes with new job offers, or
  - `marches-meta.json` reports a new Marchés consultation.
- It also runs once when the app is opened, after a phone reboot, and after an
  APK update (BOOT_COMPLETED / MY_PACKAGE_REPLACED receiver).
- The notification uses the ASSOULI AUTOX icon (status-bar icon + large icon)
  and opens the app when tapped.
- Android 13+: allow notifications on first launch. If you blocked them, open
  **Configuration → Réglages** (or Android Settings → Apps → ASSOULI AUTOX →
  Notifications).
- Some manufacturers (Xiaomi, Huawei, Oppo, Samsung…) delay background work.
  Use **Configuration → Arrière-plan** to allow the app to ignore battery
  optimization, and enable **Autostart** in the manufacturer's settings.
- WorkManager cannot run if the user force-stops the app in Android settings;
  the next manual open restores the schedule.

## 4. Files used remotely

- Update manifest: `app/public/app-version.json`
- Accounts + Marchés authorization: `app/public/access.json`
- Job alerts (background notifications): `app/public/alerts.json`
- Marchés notification manifest: `app/public/marches-meta.json`
- Job snapshot: `app/public/jobs.json`
- Marchés snapshot: `app/public/marches.json`

They are served from
`raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/...`.
GitHub caches raw files ~5 min; the app adds a cache-busting parameter.

## 5. Automatic data refresh

`.github/workflows/update-jobs.yml` runs twice a day (05:00 and 17:00 UTC,
i.e. 06:00 and 18:00 Casablanca) and can also be started manually from the
GitHub **Actions** tab. It scrapes jobs, scrapes the live Marchés source,
exports the APK snapshots, and commits `jobs.json`, `alerts.json`,
`marches.json`, `marches-meta.json` and the scraper archives. No PC is needed.
