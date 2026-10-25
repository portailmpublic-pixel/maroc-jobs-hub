# ASSOULI AUTOX — APK Android (emploi · concours · marchés publics)

Application Android Capacitor + React pour consulter les offres d'emploi, les
concours de la fonction publique, les examens (sujets + corrigés) et les marchés
publics. Les données sont actualisées automatiquement deux fois par jour par
GitHub Actions, sans PC allumé.

## Fonctionnalités

- **Comptes sans mot de passe** : nom + e-mail à l'inscription, e-mail seul à la
  connexion, code à 6 chiffres envoyé par e-mail. Le compte est mémorisé sur
  l'appareil.
- **Marchés publics sur autorisation** : l'onglet est verrouillé par défaut.
  L'administrateur autorise un e-mail depuis l'APK admin ; l'utilisateur débloque
  ensuite l'espace avec une connexion dédiée e-mail + code.
- **Notifications en arrière-plan** : WorkManager vérifie `alerts.json` et
  `marches-meta.json` toutes les ~15 minutes, même application fermée, et affiche
  une notification avec l'icône ASSOULI AUTOX. Un récepteur relance le travail
  après un redémarrage ou une mise à jour.
- **Mises à jour automatiques** : l'app lit `app-version.json`, télécharge le
  nouvel APK depuis la release GitHub et ouvre l'installateur Android.
- **Mode faible connexion** : les dernières données sont mises en cache et
  affichées si le réseau est lent ou indisponible.
- **Interface Atlas Clair** : en-tête marine, cartes blanches, accents turquoise,
  navigation basse, filtres et recherche.

## Contenu du projet

```
MarocJobs-APK/
  app/                         code React + projet Android
    src/App.jsx                interface et logique de l'application
    src/styles.css             thème Atlas Clair
    public/jobs.json           snapshot des offres
    public/marches.json        snapshot des marchés publics
    public/marches-meta.json   manifeste pour les notifications de marchés
    public/alerts.json         alertes lues par le travail de fond
    public/access.json         comptes désactivés + e-mails autorisés Marchés
    public/app-version.json    manifeste de mise à jour
    android/                   projet Capacitor (app principale + adminapp)
  scraper/                     collecteurs emploi / marchés + export des snapshots
  .github/workflows/           rafraîchissement automatique des données
  publish-update.ps1           build + release + publication d'une mise à jour
  ADMIN-GUIDE.md               guide de l'APK admin et des notifications
```

## Build local

```powershell
cd app
npm install --no-audit --no-fund
npm run build
npx cap copy android

cd android
$env:JAVA_HOME="C:\Users\hp\Documents\JOB\MarocJobs-APK\.sdk\jdk-17.0.11+9"
.\gradlew.bat :app:assembleDebug :adminapp:assembleDebug --no-daemon
```

Résultats :

- `app/android/app/build/outputs/apk/debug/app-debug.apk` (ASSOULI AUTOX)
- `app/android/adminapp/build/outputs/apk/debug/adminapp-debug.apk` (admin, privé)

Toujours exécuter `npx cap copy android` après `npm run build`, sinon l'APK
conserve les anciens fichiers web.

## Publier une mise à jour

```powershell
cd C:\Users\hp\Documents\JOB\MarocJobs-APK
.\publish-update.ps1 -Version 1.4.0 -Notes "Nouvelle version"
```

Le script incrémente `versionCode`, met à jour `app-version.json`, construit les
deux APK, crée la release GitHub et pousse le manifeste.

## Données

- Emploi / concours : collecteurs du dossier `scraper`, export vers `app/public`.
- Marchés publics : source publique `appeldoffres.ma` (miroir PMMP + BDC),
  filtrée par les mots-clés métier de l'application.
- GitHub Actions exécute le tout à 05:00 et 17:00 UTC et peut être lancé
  manuellement depuis l'onglet **Actions**.
