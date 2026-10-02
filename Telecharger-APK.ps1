param(
  [string]$Owner = "VOTRE-USER",
  [string]$Repo = "maroc-jobs-hub",
  [string]$RunId = "",
  [string]$Dest = "C:\Users\hp\Documents\JOB\MarocJobs-APK"
)
# Télécharge l'APK construit gratuitement par GitHub Actions vers le dossier demandé.
# Usage: powershell -ExecutionPolicy Bypass -File Telecharger-APK.ps1 -Owner X -Repo Y -RunId Z
# Sans -RunId : prend le dernier run réussi de "Build APK (free)".
$ErrorActionPreference = "Stop"
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Installez GitHub CLI: https://cli.github.com/ puis 'gh auth login'" -ForegroundColor Yellow
  exit 1
}
New-Item -ItemType Directory -Path $Dest -Force | Out-Null
if ([string]::IsNullOrWhiteSpace($RunId)) {
  $runs = gh run list -R "$Owner/$Repo" --workflow "Build APK (free)" --status success -L 1 --json databaseId -q ".[0].databaseId"
  $RunId = "$runs".Trim()
}
if ([string]::IsNullOrWhiteSpace($RunId)) { Write-Host "Aucun run réussi trouvé. Lancez d'abord le workflow." -ForegroundColor Red; exit 1 }
Write-Host "Run: $RunId"
gh run download $RunId -R "$Owner/$Repo" -n "Maroc-Jobs-Hub-APK" -D $Dest
Write-Host "OK -> $Dest\Maroc-Jobs-Hub.apk" -ForegroundColor Green
Get-ChildItem $Dest\*.apk | Select-Object Name, Length, LastWriteTime
