# ASSOULI AUTOX – Changelog

## 1.9.15 (42) – 2026-11-10
### Mise à jour automatique
- **Correctif de cycle de vie des listeners.** Les listeners `progress` / `state`
  sont maintenant créés pour chaque tentative et retirés dans `finally`. Avant,
  ils étaient attachés une seule fois avec le `runId` du premier essai : après un
  retry, les événements natifs étaient ignorés (barre figée). Un retry affiche
  désormais les octets réels et l'état de la source.
- **Revalidation avant installation.** `installDownloaded` et `installLatest`
  vérifient package `ma.marocjobs.hub`, `versionCode` supérieur à l'installé et
  signature identique avant d'ouvrir l'installateur. Un APK douteux est supprimé
  avec un message précis.
- **Phase `verifying`** émise avant le contrôle taille/SHA-256/signature, et
  progression forcée à 100 % après renommage réussi.
- **jsDelivr versionné** : le miroir CDN utilise `@v1.9.15` (immuable) au lieu de
  `@master`, pour ne jamais servir un APK périmé après publication.

### Sécurité (revue appliquée)
- **`access.json` haché** : les adresses des listes `marches` / `disabled` sont
  stockées en SHA-256. Le client compare l'e-mail en clair ou son hash (compatible
  avec les anciennes listes en clair).
- **OTP durci** : le code n'est plus conservé en clair (seul son SHA-256 reste en
  mémoire), **5 tentatives maximum**, **renvoi bloqué 60 s** (connexion et accès
  Marchés).
- **Compte de démonstration supprimé** : plus de `demo@assouli.app` ni de code
  fixe `246810` dans le bundle.
- **Trafic en clair interdit** : `network_security_config.xml`
  (`cleartextTrafficPermitted=false`) + `usesCleartextTraffic=false` ;
  `allowMixedContent` et `server.cleartext` retirés de `capacitor.config.json`.
- **`BootReceiver` non exporté** (`exported=false`). `AccountsProvider` reste
  exporté uniquement pour l'APK admin, protégé par la permission de niveau
  signature `READ_ACCOUNTS` (lecture + écriture).

### Risque résiduel documenté
- Le mot de passe d'application Gmail reste embarqué (`BuildConfig.SMTP_PASSWORD`)
  car l'envoi des codes se fait sans backend. **À faire** : révoquer ce mot de
  passe, déployer un petit serveur d'envoi, puis supprimer `MailPlugin` du client.
  Voir `TEST-REPORT.md`.

## 1.9.14 (41) – 2026-11-08
### Fix majeur : blocage « Connexion interrompue »
- **Telechargement 100 % natif.** Le telechargement via `fetch()` + base64 + pont Capacitor
  (WebView) est supprime. Le JS n appelle plus que le plugin natif `ApkUpdater`
  (`downloadAndInstall`) et affiche ses evenements `progress` / `state`.
- **Single-flight native.** Un seul thread de telechargement a la fois, verrouille
  (`LOCK`). Un second appel rejoint le run existant (`{busy:true}`) au lieu de
  relancer. `cancelDownload()` et `getDownloadState()` ajoutes.
- **Reprise Range.** Telechargement dans `updates/<nom>.apk.part`. Reprise
  `Range: bytes=N-` (200 vs 206 gere, 416 = deja complet). Le `.part` n est jamais
  supprime entre tentatives ni entre miroirs. Renommage `.part` -> `.apk`
  uniquement apres validation.
- **Miroirs avec failover.** Timeout connect 15 s / read 20 s, 3 reprises par miroir
  (backoff exponentiel + jitter), puis miroir suivant. Ordre : jsDelivr CDN
  (non-GitHub), GitHub Pages, raw, release GitHub.
- **Validation.** Taille == `size` du JSON (ou Content-Length), SHA-256 si present
  (champ `sha256`), `getPackageArchiveInfo` (GET_SIGNING_CERTIFICATES) :
  package == `ma.marocjobs.hub`, `versionCode` > installe, signature == signature
  installee. Echec = suppression du fichier + erreur precise.
- **Evenements.** `progress` (max 5/s) + `state {phase, mirror, attempt, httpCode,
  errorCode, message}`. Journal tag `ApkUpdater` + anneau de 20 lignes lisible
  via appui long sur la carte de mise a jour (Diagnostics).
- **JS : machine a etats.** `runId` pour ignorer les callbacks perimes, `finally`
  ne touche que son propre etat, watchdog **observateur uniquement** (lit
  `getDownloadState`, ne lance jamais un 2e run), boucle de polling 4 s supprimee
  (un seul check `installDownloaded` au retour visible pour les reglages
  unknown-sources, sans re-telecharger).
- **UI honnete.** Statut reel (`Source 1/4 · 4,2 / 14,6 Mo`, `Échec : HTTP 429`),
  barre = octets reels, etat rouge uniquement quand les octets sont arretes.
  Apres 2 cycles echoues : `Réessayer maintenant`, `Ouvrir dans le navigateur`
  (`Browser.open`, telechargement Chrome avec reprise), `Copier le lien`.
- **Contrat serveur (retro-compatible 1.9.11).** `app-version.json` garde `url` /
  `mirror` et ajoute `mirrors[]`, `size`, `sha256`. `publish-update.ps1` recalcule
  `size`/`sha256`, verifie le certificat et ecrit les deux manifestes avant
  commit/push.
- **Hygiene build.** `debug` assigne explicitement sur `~/.android/debug.keystore`
  (même certificat que 1.9.11/1.9.12, SHA-256 `360083a3…7b8`), `debuggable=false`
  partout, release `minifyEnabled=true` + `shrinkResources=true` avec regles
  ProGuard pour Capacitor. APK sideload : 14 036 654 o (plus petit que 15,34 Mo).

## 1.9.13 (40) – 2026-11-08 (partiel, remplace par 1.9.14)
- Retrait de `Confidentialité` des Configurations (section renommee `Compte & aide`).
- Alertes intelligentes par ville / type de travail / contrat (icone violette, canal `smart`).
- Premiere tentative de correction du blocage (priorite native, timeouts 180 s,
  suppression du bug `dm.remove`). Incomplet : le telechargement JS base64 restait
  actif et le watchdog pouvait toujours relancer un 2e run immediat.

## 1.9.12 (39) – 2026-11-08
- Alertes intelligentes (ville, `emploi`/`stage`/`concours`, contrat), `jobs-smart.json`
  compact pour le worker natif.

## 1.9.11 (38)
- Ouverture automatique de l installateur, verification APK, secours `installLatest`.
