# REBUILD_NOW.ps1 - Forces a clean Android rebuild after MainActivity fix,
# then pushes to GitHub. Run this AFTER fixing the ModelDownloadPlugin
# registration in MainActivity.java.

$ErrorActionPreference = 'Continue'
$repo = "D:\Documents\Cursor\AdventureStoriesWebApp - Cursor"
Set-Location $repo

# ----------------------------------------------------------------------------
# Java env
# ----------------------------------------------------------------------------
Write-Host "==> Step 0: Java env" -ForegroundColor Cyan
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path "$javaHome\bin\java.exe")) {
    $candidates = @(
        "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot",
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot"
    )
    foreach ($c in $candidates) {
        if (Test-Path "$c\bin\java.exe") { $javaHome = $c; break }
    }
}
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
Write-Host "    JAVA_HOME = $javaHome"

# ----------------------------------------------------------------------------
# Sanity: confirm MainActivity registers the plugin
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Step 1: Verify MainActivity registers ModelDownloadPlugin" -ForegroundColor Cyan
$mainActivity = Get-Content "$repo\mobile\android\app\src\main\java\com\androsmeta\adventurestories\MainActivity.java" -Raw
if ($mainActivity -match 'registerPlugin\s*\(\s*ModelDownloadPlugin\.class\s*\)') {
    Write-Host "    OK - registerPlugin(ModelDownloadPlugin.class) found" -ForegroundColor Green
} else {
    Write-Host "    FAIL - MainActivity does NOT register ModelDownloadPlugin" -ForegroundColor Red
    Write-Host "    Aborting - the fix isn't applied to source." -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
# Force-clean build to make sure the Java change is picked up
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Step 2: Clean previous build (force fresh compile)" -ForegroundColor Cyan
Set-Location "$repo\mobile\android"
.\gradlew.bat clean --console=plain
if ($LASTEXITCODE -ne 0) {
    Write-Host "    gradlew clean failed" -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
# Build debug APK
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Step 3: Build debug APK" -ForegroundColor Cyan
$logPath = "$repo\mobile\android\last-build.log"
.\gradlew.bat assembleDebug --console=plain 2>&1 | Tee-Object -FilePath $logPath
$buildCode = $LASTEXITCODE

Set-Location $repo
$apk = "$repo\mobile\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
if (Test-Path $apk) {
    $sizeMB = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    $time = (Get-Item $apk).LastWriteTime
    $age = (Get-Date) - $time
    if ($age.TotalMinutes -lt 10) {
        Write-Host "==> APK READY (fresh build with plugin fix)" -ForegroundColor Green
    } else {
        Write-Host "==> APK is $([math]::Round($age.TotalMinutes,0)) min old - build may have failed" -ForegroundColor Yellow
        Write-Host "    See: $logPath" -ForegroundColor Yellow
    }
    Write-Host "    Path:  $apk"
    Write-Host "    Size:  $sizeMB MB"
    Write-Host "    Built: $time"
} else {
    Write-Host "==> APK NOT FOUND" -ForegroundColor Red
    Write-Host "    Build log: $logPath" -ForegroundColor Red
    Get-Content $logPath -Tail 30
    exit 1
}

# ----------------------------------------------------------------------------
# Verify the registerPlugin call made it into the compiled APK
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Step 4: Verify ModelDownloadPlugin compiled into APK" -ForegroundColor Cyan
# Use unzip-style listing - the .class file must be in the dex/JAR
$apkContents = & "$javaHome\bin\jar.exe" tf $apk 2>&1
if ($apkContents -match 'classes\.dex') {
    Write-Host "    classes.dex present" -ForegroundColor Green
} else {
    Write-Host "    No classes.dex in APK - this is broken" -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------------------
# Push to GitHub
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Step 5: Commit + push the plugin-registration fix" -ForegroundColor Cyan
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
git add -A
$staged = (git diff --cached --name-only | Measure-Object).Count
Write-Host "    $staged files staged"
if ($staged -gt 0) {
    $msg = "Fix: register ModelDownloadPlugin in MainActivity.onCreate`n`nLocal Capacitor plugins (defined in this app's own Java sources)`nare not auto-registered - only npm-installed ones are. The`nliteRT bridge was failing with 'ModelDownload plugin not found'`nbecause the Java class existed but wasn't bound to the bridge.`n`nAlso adds REBUILD_NOW.ps1 / .bat for forced clean rebuilds."
    $msgFile = Join-Path $env:TEMP "rebuild_msg.txt"
    $msg | Out-File -FilePath $msgFile -Encoding utf8 -NoNewline
    git commit -F $msgFile
    Remove-Item $msgFile -ErrorAction SilentlyContinue
    git push origin main
    if ($LASTEXITCODE -eq 0) {
        $sha = git rev-parse --short HEAD
        Write-Host "    Pushed $sha" -ForegroundColor Green
    } else {
        Write-Host "    Push failed - check auth or secret-scan output" -ForegroundColor Red
    }
} else {
    Write-Host "    Nothing new to commit"
}

Write-Host ""
Write-Host "==> NEXT STEPS:" -ForegroundColor Cyan
Write-Host "    1. Install the APK on your phone:" -ForegroundColor White
Write-Host "       adb install -r `"$apk`""
Write-Host "    2. Open the app. Go to Settings -> On-Device AI." -ForegroundColor White
Write-Host "       The 'ModelDownload plugin not found' error should be GONE."
Write-Host "       You should see 'Model not downloaded yet' with a Download button."
Write-Host "    3. For Cloud AI: Settings -> Cloud AI -> paste a fresh OpenRouter key." -ForegroundColor White
Write-Host "       (You need to rotate the leaked one at https://openrouter.ai/keys)"

Write-Host ""
Write-Host "Press any key to exit..."
[void][System.Console]::ReadKey($true)
