# Prompt to give Claude Code

Copy everything between the `---` lines into Claude Code, sitting in
`D:\Documents\Cursor\AdventureStoriesWebApp - Cursor\`. It's self-contained
— a fresh Claude Code session needs no prior context.

---

I'm building an Android APK for the Adventure Stories game in this repo.
The Capacitor scaffolding is already done in `mobile/`. Your job: drop in
the Gemma 3 1B model file, build a debug APK, and install it on my
connected phone. Then verify the app launches and the LLM bridge
initializes.

## What's already set up (don't redo)

- `mobile/capacitor.config.json` — appId `com.androsmeta.adventurestories`,
  plugin config for `@capgo/capacitor-llm` and `SplashScreen`.
- `mobile/android/` — full Gradle project. minSdk 24, targetSdk 36.
  namespace + applicationId both `com.androsmeta.adventurestories`. Strings
  branded "Adventure Stories". MainActivity in the correct package.
- `mobile/android/app/src/main/assets/public/` — 63 web-app files including
  `liteRTBridge.js` and `mobile-bootstrap.js`. Capacitor plugins registered
  in `capacitor.plugins.json`.
- The web app's existing engine, schemas, choice-handling, save/load, and
  god-mode logic are all audited and green (`npm run audit` from the repo
  root runs 4 suites, all pass).

## What you need to do

### 1. Verify prerequisites

Run these and confirm versions:
- `java --version` → must be Java 17 (OpenJDK or Temurin). If missing or
  wrong version, tell me to install it (`winget install Microsoft.OpenJDK.17`)
  before continuing.
- `where studio64.exe` (Windows) or check `~/AppData/Local/Programs/Android Studio/` —
  needed only if I want to open the IDE; you can build via Gradle CLI.
- `adb devices` from `%ANDROID_HOME%/platform-tools/` (typically
  `~/AppData/Local/Android/Sdk/platform-tools/`) — should list my phone.
  If it says "unauthorized", I need to accept the USB debugging prompt on
  the phone. If empty, USB debugging isn't on or the cable is data-only.

### 2. Place the Gemma 3 1B model

The file `gemma3-1b-it-int4.task` (≈555 MB) needs to land at:
```
mobile/android/app/src/main/assets/gemma3-1b-it-int4.task
```

Look in `~/Downloads/` first — I probably already downloaded it from
Kaggle. If not, tell me to download it from
https://www.kaggle.com/models/google/gemma-3/tfLite/gemma3-1b-it-int4 (Gemma
license requires a Kaggle account). Don't try to download it yourself —
the license requires interactive acceptance.

Verify the file size after copying:
```powershell
Get-ChildItem "mobile/android/app/src/main/assets/gemma3-1b-it-int4.task" | Select Length
```
Should be 555,749,376 bytes. Anything else means a corrupted download.

### 3. Sync the latest web app

Run from the repo root:
```bash
cd mobile
node sync-web.mjs
node node_modules/@capacitor/cli/bin/capacitor sync android
```

This refreshes `mobile/www/` from the repo root and copies it into
`android/app/src/main/assets/public/`. It also regenerates
`capacitor.plugins.json`.

### 4. Build a debug APK via Gradle CLI

```powershell
cd mobile/android
./gradlew assembleDebug --console=plain
```

This will download Gradle dependencies (~5 minutes first run, then
cached). Expected output: `BUILD SUCCESSFUL`. The APK lands at:
```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

If the build fails, the most common errors are:
- **Java version mismatch** — confirm `java --version` shows 17.x.
- **`SDK location not found`** — set `ANDROID_HOME` env var to
  `~/AppData/Local/Android/Sdk/` or create
  `mobile/android/local.properties` with one line:
  `sdk.dir=C\:\\Users\\Owner\\AppData\\Local\\Android\\Sdk`
- **`MediaPipe / tasks-genai` resolution** — open
  `mobile/android/capacitor-cordova-android-plugins/build.gradle` and the
  generated `node_modules/@capgo/capacitor-llm/android/build.gradle`;
  confirm they reference `com.google.mediapipe:tasks-genai`. If not, the
  plugin version may be stale — `cd mobile && npm install @capgo/capacitor-llm@latest`.

### 5. Install on my phone

```powershell
~/AppData/Local/Android/Sdk/platform-tools/adb.exe install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` reinstalls if the previous version exists.

### 6. Smoke test

Launch the app:
```powershell
adb shell am start -n com.androsmeta.adventurestories/.MainActivity
```

Capture the first 30 seconds of logcat to verify the LiteRT bridge fires:
```powershell
adb logcat -c                              # clear
adb shell am start -n com.androsmeta.adventurestories/.MainActivity
adb logcat -d -t 1000 *:I | Select-String "Capacitor|LiteRT|liteRT|gemma|ll mPlugin|MediaPipe"
```

What I want to see:
- `Capacitor` startup lines (bridge attaching to WebView)
- `LLMPlugin` registering
- `liteRTBridge: ` initialization log when the user starts a new adventure

Common issues at this step:
- **Black screen** → check `adb logcat *:E` for WebView errors. Usually
  a missing JS file (compare `mobile/www/` against
  `android/app/src/main/assets/public/`).
- **"Failed to load model" toast** → the .task file isn't where the
  plugin expects. Recheck step 2 path. The plugin reads from
  `app/src/main/assets/`, NOT `app/src/main/assets/public/`.
- **App launches but story generation hangs** → first model load takes
  10–30 s on mid-range phones; nothing is stuck. Watch logcat for
  "model loaded" before declaring it broken.

### 7. Report back

Tell me:
1. APK build size in MB (debug builds with the model bundled will be
   ~620 MB — confirm this is in the right ballpark)
2. Whether the app launches without crashing
3. Whether the first scene generates within 60 seconds
4. Logcat excerpt showing the LiteRT init line(s)

If all four are green, we're ready to talk Play Store signing and
Play Asset Delivery (so the model isn't bundled in the base APK and we
stay under the Play Store size cap). If anything's red, paste the
exact error and we'll debug.

## What NOT to do

- Do not edit `engine.js`, `schemas.js`, `aiHandler.js`, `actionHandler.js`,
  `godMode.js`, or any of the existing game logic. Those are audited and
  green; if your build fails, the issue is in the Android scaffolding,
  not the game.
- Do not modify `mobile-bootstrap.js`. It pins the backend to `litert`
  on Android start and that's correct.
- Do not regenerate the Android project (`cap add android`). The
  scaffolding is already correct; regenerating would overwrite the
  package-name fixes I had to apply manually.
- Do not run `npm run audit` and treat its output as a build failure
  signal. Those audits are static-analysis only and pass independent of
  the Android build.

## Files to read if you get confused

- `mobile/BUILD.md` — step-by-step build instructions (matches this
  prompt; written first for me, included here for completeness).
- `mobile/README.md` — architecture diagram, Play Store roadmap.
- `liteRTBridge.js` — the contract between the web app and the native
  LLM plugin. If anything weird happens at runtime, this is where to
  add console.log calls.
- `config.js` `LITERT_CONFIG` — model name, asset path, context window.

Get to work. Report when the APK is on my phone.

---
