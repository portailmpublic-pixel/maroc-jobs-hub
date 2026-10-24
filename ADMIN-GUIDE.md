# ASSOULI AUTOX — Updates & Admin

## 1. Publish an app update (one command)

```powershell
cd C:\Users\hp\Documents\JOB\MarocJobs-APK
.\publish-update.ps1 -Version 1.2.0 -Notes "Corrections + nouvelles offres"
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

## 2. Admin APK (enable / disable accounts)

File: `ASSOULI-ADMIN.apk` — package `ma.marocjobs.hub.admin`.

**Keep this APK private**: it contains a GitHub write token.

**Version 1.2.0+** opens with an animated Midnight Emerald splash and a modern
dashboard: live counters (Actifs / Désactivés), rounded account cards, a fixed
Recharger / Publier bar, and a collapsible GitHub settings card.

The admin APK automatically lists the accounts created on the phone where both apps
are installed (name, e-mail, date, Actif / Désactivé). It also remembers the last list
even if the main app is closed or its data is cleared.

Usage:
1. Install **ASSOULI AUTOX 1.2.0+** first, open it and create/log in to an account.
2. Install and open **ASSOULI ADMIN** (same signing key — both debug APKs are).
3. The accounts appear under **Comptes de cet appareil**.
   Tap **Désactiver** / **Activer** on a row, then **Publier les modifications**.
4. You can still disable an e-mail that is not on this phone with the manual field.

Effect on phones:
- Disabled e-mail is blocked at login **and** signup.
- If the main app is open on the same phone, the admin broadcast closes it within
  seconds. Otherwise it is stopped at the next launch/resume (plus a 20-second check).
- The admin message is shown the next time the app opens.
- Works remotely; no need to rebuild the app.

> The list is per-phone (the two APKs share it through a signature-protected provider).
> To see accounts from **every** user's phone, a small central database is required;
> the app can be connected to Firebase/Supabase or a Google Sheet on request.

Login is now passwordless: the app sends a 6-digit code, the account is saved on the
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

- A background worker checks `alerts.json` even when the app is closed
  (about every 15 minutes, Wi-Fi/data required) and posts a notification when
  new offers are published.
- The notification uses the ASSOULI AUTOX icon and opens the app when tapped.
- Android 13+: allow notifications on first launch. If you blocked them, enable
  them in Android Settings → Apps → ASSOULI AUTOX → Notifications.

## 4. Files used remotely

- Update manifest: `app/public/app-version.json`
- Disabled accounts: `app/public/access.json`

Both are served from `raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/...`.
GitHub caches raw files ~5 min; the app adds a cache-busting parameter.
