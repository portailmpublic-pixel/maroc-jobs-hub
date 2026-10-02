# ⭐ Obtenir l'APK GRATUIT via le fichier .YML (GitHub Actions)

> Aucun paiement. Aucun Android Studio. Le fichier `.github/workflows/build-apk.yml`
> construit l'APK gratuitement sur les serveurs GitHub.

## Option A — 100% web (recommandé, 3 minutes)

1. Allez sur https://github.com/new → créez un repo **public** `maroc-jobs-hub`.
2. Dans le repo → **Add file → Upload files** → glissez-déposez TOUT le contenu de :
   `C:\Users\hp\Documents\JOB\MarocJobs-APK`
   (dossiers `app/`, `.github/`, fichiers `README.md`, etc.) → **Commit changes**.
3. Onglet **Actions** → activez les workflows si demandé → cliquez
   **Build APK (free)** → **Run workflow → Run workflow**.
4. Attendez ~3-5 min (pastille verte ✅). Cliquez le run :
   - En bas **Artifacts → Maroc-Jobs-Hub-APK** → téléchargez `Maroc-Jobs-Hub.apk`.
5. Copiez le fichier ici :
   `C:\Users\hp\Documents\JOB\MarocJobs-APK\Maroc-Jobs-Hub.apk`
   → installez sur Android (autorisez "sources inconnues").

Chaque nouveau `push` sur `main` crée aussi une **Release** `build-N` avec l'APK joint.

## Option B — ligne de commande

```powershell
cd "C:\Users\hp\Documents\JOB\MarocJobs-APK"
git init; git add .; git commit -m "Maroc Jobs Hub APK"
git branch -M main
git remote add origin https://github.com/VOTRE-USER/maroc-jobs-hub.git
git push -u origin main
# puis Actions → Build APK (free) → Run, comme ci-dessus
```

## Téléchargement auto après build

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\hp\Documents\JOB\MarocJobs-APK\Telecharger-APK.ps1" -Owner VOTRE-USER -Repo maroc-jobs-hub -RunId 12345678
```

## Dépannage

- `cache-dependency-path: app/package-lock.json` : si pas de lock, le workflow fait `npm install` (normal).
- Java 17 + Android SDK installés automatiquement par le workflow (gratuit).
- L'APK est `app-debug.apk` renommé `Maroc-Jobs-Hub.apk` (signé debug → installable directement).
- Pour Play Store plus tard : générez un keystore release (non nécessaire pour vos tests).
