# 🇲🇦 Maroc Jobs Hub — APK Android moderne (100% gratuit via GitHub)

App mobile moderne (style sites modernes) qui présente les résultats d'offres d'emploi.
**À chaque ↻ / actualisation, l'app recharge les résultats** (hors-ligne + distant).

## 📁 Contenu de `C:\Users\hp\Documents\JOB\MarocJobs-APK`

```
MarocJobs-APK/
  app/                  → code source mobile (Vite + React + Capacitor)
    src/App.jsx         → UI moderne : hero, stats, recherche, filtres, cards, bottom-nav, pull-to-refresh
    src/styles.css      → design glassmorphism / gradient
    public/jobs.json    → 349 offres intégrées (marche sans internet)
    capacitor.config.ts → config Android : ma.marocjobs.hub
  .github/workflows/
    build-apk.yml       → ⭐ build APK GRATUIT sur GitHub (cliquez Run)
    update-jobs.yml     → refresh quotidien 06:00 des offres
  GET-APK-GRATUIT.md    → guide 3 clics
  Telecharger-APK.ps1   → script qui télécharge l'APK ici après le build
```

## 🚀 Obtenir l'APK GRATUIT en 3 clics (sans Android Studio)

1. Créez un repo GitHub vide (ex: `maroc-jobs-hub`), puis uploadez TOUT le contenu de `MarocJobs-APK/` :
   - via web : Add file → Upload files → glissez le dossier
   - ou : `git init / add / commit / push` (voir GET-APK-GRATUIT.md)
2. Sur GitHub : onglet **Actions** → **Build APK (free)** → **Run workflow** (ou poussez sur `main`).
   - Le build est GRATUIT (ubuntu-latest + Gradle, ~3-5 min).
3. Téléchargez l'APK :
   - **Actions → run → Artifacts → Maroc-Jobs-Hub-APK** → `Maroc-Jobs-Hub.apk`
   - ou **Releases → Maroc Jobs Hub APK #N** → `Maroc-Jobs-Hub.apk`
   - Copiez-le ici : `C:\Users\hp\Documents\JOB\MarocJobs-APK\Maroc-Jobs-Hub.apk`
   - Script auto : `powershell -ExecutionPolicy Bypass -File Telecharger-APK.ps1 -Owner VOTRE-USER -Repo maroc-jobs-hub -RunId LE-NUMERO`

## 🔄 Actualisation moderne (comme les sites modernes)

- Bouton central **↻** + bouton haut + **tirez vers le bas** en haut de page.
- Chaque refresh : recharge `jobs.json`, ré-anime les cards, met à jour `Dernière actualisation`.
- **Sans republier l'APK** : onglet ⚙️ Refresh → collez votre URL RAW :
  `https://raw.githubusercontent.com/VOTRE-USER/maroc-jobs-hub/main/app/public/jobs.json`
  Le workflow `update-jobs.yml` met ce fichier à jour chaque jour → l'app affiche les nouveautés à chaque ↻.

## 💻 Test local immédiat (sans APK)

```powershell
cd "C:\Users\hp\Documents\JOB\MarocJobs-APK\app"
& "C:\Program Files\nodejs\npm.cmd" install --no-audit --no-fund
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run preview
# ouvrir http://localhost:4173  (même UI que l'APK)
```

## 📦 Données

- `app/public/jobs.json` : snapshot du 29/09/2026 (349 offres, ReKrute/Dreamjob/Emploi-Public/ANAPEC/Stellantis/Jawb/Indeed…).
- Rapport semaine 18-24 sept : voir `../Morocco_Job_Offers_Week_Sept18-24_2026.md`.
