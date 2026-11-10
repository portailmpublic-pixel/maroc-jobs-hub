param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "Nouvelle version ASSOULI AUTOX",
  [string]$NotesFile = ""
)

if ($NotesFile) {
  $Notes = [System.IO.File]::ReadAllText($NotesFile, [System.Text.Encoding]::UTF8)
}

$ErrorActionPreference = "Stop"
$root = "C:\Users\hp\Documents\JOB\MarocJobs-APK"
$app = Join-Path $root "app"
$android = Join-Path $app "android"
$gradleFile = Join-Path $android "app\build.gradle"
$manifestPub = Join-Path $app "public\app-version.json"
$manifestDocs = Join-Path $root "docs\app-version.json"
$npm = "C:\Program Files\nodejs\npm.cmd"
$npx = "C:\Program Files\nodejs\npx.cmd"
$env:JAVA_HOME = Join-Path $root ".sdk\jdk-17.0.11+9"

# Pre-check : le certificat de signature ne doit jamais changer (mises a jour en place).
$expectedCert = "360083a3747a7f536d2b9557465abffb81ea08ac2c12b34f1906c6c6801bf7b8"
$keystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
if (-not (Test-Path $keystore)) { throw "debug.keystore introuvable (signature sideload)" }

# 1. Bump versionCode / versionName
$g = [System.IO.File]::ReadAllText($gradleFile)
if ($g -notmatch 'versionCode\s+(\d+)') { throw "versionCode introuvable" }
$newCode = [int]$Matches[1] + 1
$g = $g -replace 'versionCode\s+\d+', "versionCode $newCode"
$g = $g -replace 'versionName\s+"[^"]*"', "versionName `"$Version`""
[System.IO.File]::WriteAllText($gradleFile, $g)
Write-Host "Version $Version (code $newCode)"

# 2. Build web, sync, APK principal + APK admin (sideload assigne)
Push-Location $app
& $npm run build
& $npx cap sync android
Pop-Location

Push-Location $android
& .\gradlew.bat :app:bundlePlayRelease :app:assembleSideloadDebug :adminapp:assembleDebug --console=plain
Pop-Location

Copy-Item (Join-Path $android "app\build\outputs\apk\sideload\debug\app-sideload-debug.apk") (Join-Path $root "ASSOULI-AUTOX.apk") -Force
Copy-Item (Join-Path $root "ASSOULI-AUTOX.apk") (Join-Path $root "docs\ASSOULI-AUTOX.apk") -Force
Copy-Item (Join-Path $root "app\build\outputs\bundle\playRelease\app-play-release.aab") (Join-Path $root "ASSOULI-AUTOX-play.aab") -Force
Copy-Item (Join-Path $android "adminapp\build\outputs\apk\debug\adminapp-debug.apk") (Join-Path $root "ASSOULI-ADMIN.apk") -Force

# 3. Verification de signature AVANT publication
& (Join-Path $root ".sdk\android\build-tools\36.0.0\apksigner.bat") verify --print-certs (Join-Path $root "ASSOULI-AUTOX.apk") 2>&1 | Select-String "SHA-256" | ForEach-Object { Write-Host $_ }
$certLine = & (Join-Path $root ".sdk\android\build-tools\36.0.0\apksigner.bat") verify --print-certs (Join-Path $root "ASSOULI-AUTOX.apk") 2>&1 | Select-String "SHA-256"
if ($certLine -notmatch $expectedCert) { throw "Certificat DIFFERENT : mises a jour en place impossibles. STOP." }

# 4. Manifeste : backward compatible (url/mirror pour 1.9.11) + mirrors/size/sha256.
# L APK et le JSON sont publies ensemble (commit + push) pour ne jamais diverger.
$tag = "v$Version"
$size = (Get-Item (Join-Path $root "ASSOULI-AUTOX.apk")).Length
$sha = (Get-FileHash (Join-Path $root "ASSOULI-AUTOX.apk") -Algorithm SHA256).Hash.ToLower()
$published = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$json = [ordered]@{
  versionCode = $newCode
  versionName = $Version
  url = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/docs/ASSOULI-AUTOX.apk"
  mirror = "https://portailmpublic-pixel.github.io/maroc-jobs-hub/ASSOULI-AUTOX.apk"
  mirrors = @(
    "https://cdn.jsdelivr.net/gh/portailmpublic-pixel/maroc-jobs-hub@$tag/docs/ASSOULI-AUTOX.apk",
    "https://portailmpublic-pixel.github.io/maroc-jobs-hub/ASSOULI-AUTOX.apk?v=$newCode",
    "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/docs/ASSOULI-AUTOX.apk?v=$newCode",
    "https://github.com/portailmpublic-pixel/maroc-jobs-hub/releases/download/$tag/ASSOULI-AUTOX.apk"
  )
  size = $size
  sha256 = $sha
  notes = $Notes
  publishedAt = $published
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestPub, $json)
[System.IO.File]::WriteAllText($manifestDocs, $json)
Write-Host "Manifeste size=$size sha256=$sha"

# 5. Commit + release + push (APK et JSON ensembles)
Push-Location $root
git add app/android/app/build.gradle app/public/app-version.json docs/app-version.json docs/ASSOULI-AUTOX.apk
git commit -m "Release ASSOULI AUTOX $Version (size $size)"
$notesFile = Join-Path ([System.IO.Path]::GetTempPath()) "assouli-release-notes-$Version.md"
[System.IO.File]::WriteAllText($notesFile, $Notes, (New-Object System.Text.UTF8Encoding($false)))
gh release create $tag (Join-Path $root "ASSOULI-AUTOX.apk") --title "ASSOULI AUTOX $Version" --notes-file $notesFile
git pull --rebase
git push
Pop-Location

Write-Host "Publie v$Version (code $newCode) size $size."
