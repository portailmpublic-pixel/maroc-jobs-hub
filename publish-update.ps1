param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "Nouvelle version ASSOULI AUTOX"
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\hp\Documents\JOB\MarocJobs-APK"
$app = Join-Path $root "app"
$android = Join-Path $app "android"
$gradleFile = Join-Path $android "app\build.gradle"
$manifest = Join-Path $app "public\app-version.json"
$npm = "C:\Program Files\nodejs\npm.cmd"
$npx = "C:\Program Files\nodejs\npx.cmd"
$env:JAVA_HOME = Join-Path $root ".sdk\jdk-17.0.11+9"

# 1. Bump versionCode / versionName
$g = [System.IO.File]::ReadAllText($gradleFile)
if ($g -notmatch 'versionCode\s+(\d+)') { throw "versionCode introuvable" }
$newCode = [int]$Matches[1] + 1
$g = $g -replace 'versionCode\s+\d+', "versionCode $newCode"
$g = $g -replace 'versionName\s+"[^"]*"', "versionName `"$Version`""
[System.IO.File]::WriteAllText($gradleFile, $g)
Write-Host "Version $Version (code $newCode)"

# 2. Update the remote manifest BEFORE packaging so the APK ships current info
$tag = "v$Version"
$url = "https://github.com/portailmpublic-pixel/maroc-jobs-hub/releases/download/$tag/ASSOULI-AUTOX.apk"
$published = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$json = [ordered]@{
  versionCode = $newCode
  versionName = $Version
  url = $url
  notes = $Notes
  publishedAt = $published
} | ConvertTo-Json
[System.IO.File]::WriteAllText($manifest, $json)

# 3. Build web, sync, APK principal + APK admin
Push-Location $app
& $npm run build
& $npx cap sync android
Pop-Location

Push-Location $android
& .\gradlew.bat :app:assembleDebug :adminapp:assembleDebug --no-daemon
Pop-Location

Copy-Item (Join-Path $android "app\build\outputs\apk\debug\app-debug.apk") (Join-Path $root "ASSOULI-AUTOX.apk") -Force
Copy-Item (Join-Path $android "adminapp\build\outputs\apk\debug\adminapp-debug.apk") (Join-Path $root "ASSOULI-ADMIN.apk") -Force

# 4. Commit locally
Push-Location $root
git add -A
git commit -m "Release ASSOULI AUTOX $Version"

# 5. Publish release; only push the manifest if the upload succeeded
gh release create $tag (Join-Path $root "ASSOULI-AUTOX.apk") --title "ASSOULI AUTOX $Version" --notes $Notes
git pull --rebase
git push
Pop-Location

Write-Host ""
Write-Host "Publie : $url"
Write-Host "Tous les telephones recevront la mise a jour a la prochaine ouverture."
