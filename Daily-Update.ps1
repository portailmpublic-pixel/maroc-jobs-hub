# Maroc Jobs Hub — daily auto-update (runs twice a day via Windows Task Scheduler).
# 1) Scrape latest offers into the backend DB
# 2) Export APK snapshots (jobs.json, alerts.json, exams-index.json + exams/)
# 3) Commit + push to GitHub so the phone APK picks it up on next refresh.
# Log: C:\Users\hp\Documents\JOB\MarocJobs-APK\daily-update.log

$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\hp\Documents\JOB'
$Backend = Join-Path $Root 'maroc-jobs-hub\backend'
$ApkApp = Join-Path $Root 'MarocJobs-APK\app'
$Log = Join-Path $Root 'MarocJobs-APK\daily-update.log'
$Npm = 'C:\Program Files\nodejs\npm.cmd'

function Log($m) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"
  Add-Content -Path $Log -Value $line
  Write-Output $line
}

Log '===== auto-update start ====='

# 1) Scrape (updates backend DB; skips gracefully on network errors)
Log '[1/3] scraping…'
& $Npm --prefix $Backend run scrape 2>&1 | Select-Object -Last 3 | ForEach-Object { Log "  scrape: $_" }

# 2) Export snapshots for the APK
Log '[2/3] exporting APK snapshots…'
$exp = & $Npm --prefix $Backend run export:apk 2>&1 | Select-Object -Last 5
if (-not $exp) {
  # fallback: call exportApk directly (no npm script needed)
  $exp = node -e "const n=require('./src/notify');console.log(JSON.stringify(n.exportApk()))" 2>&1
}
$exp | ForEach-Object { Log "  export: $_" }

# 3) Commit + push (needs `git remote` configured once; skipped silently otherwise)
Log '[3/3] pushing to GitHub…'
$remotes = git -C $ApkApp remote 2>$null
if (-not $remotes) {
  Log '  SKIP push: no git remote configured (see Setup-Remote.ps1 or paste URL in APK Setup tab)'
} else {
  git -C $ApkApp add public/jobs.json public/alerts.json public/exams-index.json 2>&1 | ForEach-Object { Log "  git: $_" }
  git -C $ApkApp commit -m "jobs: auto refresh $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>&1 | ForEach-Object { Log "  git: $_" }
  git -C $ApkApp push 2>&1 | ForEach-Object { Log "  git: $_" }
}

Log '===== auto-update done ====='
