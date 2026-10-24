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

The admin APK automatically lists the accounts created on the phone where both apps
are installed (name, e-mail, date, Actif / Désactivé). It also remembers the last list
even if the main app is closed or its data is cleared.

Usage:
1. Install **ASSOULI AUTOX 1.2.0+** first, open it and create/log in to an account.
2. Install and open **ASSOULI ADMIN** (same signing key — both debug APKs are).
3. The accounts appear under **Comptes créés sur ce téléphone**.
   Tap **Désactiver** / **Activer** on a row, then **Enregistrer** to publish.
4. You can still disable an e-mail that is not on this phone with the manual field.

Effect on phones:
- Disabled e-mail is blocked at login **and** signup.
- A user already logged in is logged out automatically (on launch/resume and every
  30-minute check) with the admin message shown.
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

## 3. Files used remotely

- Update manifest: `app/public/app-version.json`
- Disabled accounts: `app/public/access.json`

Both are served from `raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/...`.
GitHub caches raw files ~5 min; the app adds a cache-busting parameter.
