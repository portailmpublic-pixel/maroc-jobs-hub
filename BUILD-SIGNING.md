# ASSOULI AUTOX – Build & signature (sans secrets)

## Certificat (ne jamais changer)
- Tous les APK sideload (1.9.11 → 1.9.15) sont signes avec le **meme certificat
  Android Debug**, SHA-256 :
  `36:00:83:A3:74:7A:7F:53:6D:2B:95:57:46:5A:BF:FB:81:EA:08:AC:2C:12:B3:4F:19:06:C6:C6:80:1B:F7:B8`
  (`360083a3747a7f536d2b9557465abffb81ea08ac2c12b34f1906c6c6801bf7b8`).
- Keystore local : `%USERPROFILE%\.android\debug.keystore` (non commit, sauvegarde
  hors repo e.g. `%TEMP%\opencode\debug.keystore.bak`). **Ne jamais commiter le
  keystore ni les mots de passe** (`keystore.properties`, `secrets.properties`
  sont gitignored).
- `app/android/app/build.gradle` assigne `debug` sur ce fichier
  (`storeFile = ~/.android/debug.keystore`). Les valeurs `android` /
  `androiddebugkey` sont les valeurs **publiques standard** du keystore debug
  (pas un secret) et peuvent etre surchargees via `secrets.properties`
  (`DEBUG_STORE_PASSWORD`, `DEBUG_KEY_ALIAS`, `DEBUG_KEY_PASSWORD`).
- `buildTypes.debug.debuggable=false`, `buildTypes.release.debuggable=false`,
  `release.minifyEnabled=true`, `release.shrinkResources=true`.

## Pre-checks (a executer avant chaque build distribue)
```powershell
cd C:\Users\hp\Documents\JOB\MarocJobs-APK
& '.sdk\android\build-tools\36.0.0\apksigner.bat' verify --print-certs ASSOULI-AUTOX.apk
# Attendu : SHA-256 360083a3...7b8 (identique a 1.9.11 / 1.9.12)
```
Si l empreinte differe : **STOP**, ne pas publier (les telephones ne pourraient
plus mettre a jour sur place et devraient etre reinstalles une fois).

## Build complet
```powershell
cd C:\Users\hp\Documents\JOB\MarocJobs-APK\app
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npx.cmd' cap sync android
cd ..\app\android
$env:JAVA_HOME='C:\Users\hp\Documents\JOB\MarocJobs-APK\.sdk\jdk-17.0.11+9'
.\gradlew.bat :app:bundlePlayRelease :app:assembleSideloadDebug :adminapp:assembleDebug
cd ..\..
Copy-Item app\android\app\build\outputs\apk\sideload\debug\app-sideload-debug.apk ASSOULI-AUTOX.apk
Copy-Item app\android\app\build\outputs\bundle\playRelease\app-play-release.aab ASSOULI-AUTOX-play.aab
Copy-Item ASSOULI-AUTOX.apk docs\ASSOULI-AUTOX.apk
Copy-Item app\android\adminapp\build\outputs\apk\debug\adminapp-debug.apk ASSOULI-ADMIN.apk
& '.sdk\android\build-tools\36.0.0\aapt.exe' dump badging ASSOULI-AUTOX.apk
```

## Publication (APK + JSON ensemble)
Utiliser `publish-update.ps1` (mis a jour) : il bump la version, rebuild,
verifie le certificat, calcule `size`/`sha256`, ecrit
`app/public/app-version.json` **et** `docs/app-version.json`, commit, cree la
release GitHub et push. Les deux manifestes doivent toujours contenir
`versionCode` / `versionName` identiques a l APK.

## Mirror non-GitHub
`mirrors[0]` pointe vers `cdn.jsdelivr.net` (reseau different de
`raw.githubusercontent.com` / `github.io`). L URL est **versionnee**
(`@v1.9.15`) : le CDN ne peut pas servir un APK perime apres publication.
Pour une independance totale, hebergez aussi l APK sur un domaine propre,
Cloudflare R2 ou Firebase Hosting et placez cette URL en premiere position
dans `mirrors` (genere par `publish-update.ps1`).

## Verification apres publication
```powershell
curl.exe -s https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/app-version.json
curl.exe -s https://portailmpublic-pixel.github.io/maroc-jobs-hub/app-version.json
curl.exe -s -L -o NUL -w "raw:%{http_code} %{size_download}\n" https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/docs/ASSOULI-AUTOX.apk
curl.exe -s -L -o NUL -w "pages:%{http_code} %{size_download}\n" https://portailmpublic-pixel.github.io/maroc-jobs-hub/ASSOULI-AUTOX.apk
```
Les deux manifestes doivent afficher `42 / 1.9.15` et les deux APK `size` ==
`size` du JSON.
