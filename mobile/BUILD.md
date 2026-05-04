# Building the Adventure Stories APK

The Capacitor scaffold is already generated — `mobile/android/` is a complete
Android Studio project. You only need to:

1. Open it in Android Studio
2. Drop the Gemma 3 1B model into the assets folder
3. Click **Run** with your phone connected via USB

Total time from cloning the repo: ~10 minutes (most of which is downloading
the model).

---

## Prerequisites

| What | Why | How |
|---|---|---|
| **Java 17 JDK** | Gradle needs it | `winget install Microsoft.OpenJDK.17` (Win) or `brew install --cask temurin@17` (Mac) |
| **Android Studio Hedgehog or newer** | The IDE + emulator + SDK manager | https://developer.android.com/studio |
| **Android 14 SDK (API 34) or newer** | Play Store requires API 34+ for new submissions | Installed via Android Studio's SDK Manager on first launch |
| **A real Android phone** for testing | Emulator works but on-device LLM benefits hugely from real GPU/NPU | USB cable; enable USB Debugging in Developer Options |
| **`gemma3-1b-it-int4.task`** (~600 MB) | The model itself | https://www.kaggle.com/models/google/gemma-3/tfLite — you'll need a Kaggle account to accept the Gemma license |

---

## Step-by-step

```bash
cd mobile
# Install Capacitor + plugin deps. Already done if node_modules/ exists.
npm install

# Refresh the web app from the repo root into mobile/www/, then push it
# into android/app/src/main/assets/public/. (Run any time you change the
# JS/HTML at the repo root.)
node sync-web.mjs
node node_modules/@capacitor/cli/bin/capacitor sync android
```

Now drop the model file in:

```
android/app/src/main/assets/gemma3-1b-it-int4.task
```

That single file is what `liteRTBridge.js` loads at runtime. The plugin
config in `capacitor.config.json` points at `gemma3-1b-it-int4.task` —
the bridge looks for it as an Android asset.

Then:

```bash
node node_modules/@capacitor/cli/bin/capacitor open android
```

Android Studio opens. Plug in your phone. Click the green **▶ Run** button.
First build takes ~3 minutes (Gradle downloads dependencies). After that,
incremental builds are 30-60 seconds.

---

## What's already wired

- `capacitor.config.json` — appId `com.androsmeta.adventurestories`, plugin
  config for `@capgo/capacitor-llm` and `SplashScreen`.
- `android/app/build.gradle` — namespace + applicationId
  (`com.androsmeta.adventurestories`), minSdk 24, targetSdk 36 (Play Store
  2026 requirement is API 34+).
- `android/app/src/main/AndroidManifest.xml` — activity, INTERNET
  permission (needed for the cloud fallback only; airplane mode works for
  the LiteRT default).
- `android/app/src/main/res/values/strings.xml` — app name set to
  "Adventure Stories".
- `android/app/src/main/assets/public/` — the entire web app (63 files
  including the `mobile-bootstrap.js` that pins the backend to LiteRT on
  startup).
- `android/app/src/main/assets/capacitor.plugins.json` — plugin registry
  showing `@capgo/capacitor-llm` mapped to `ee.forgr.capgo_llm.LLMPlugin`.

---

## What you do for a Play Store release

1. **Generate a keystore** (one-time, save it somewhere safe — losing it
   means losing the ability to update the app):
   ```bash
   keytool -genkey -v \
     -keystore release.keystore \
     -alias adventure-stories \
     -keyalg RSA -keysize 4096 \
     -validity 10000
   ```
   Save `release.keystore` in `mobile/`.

2. **Wire signing into `android/app/build.gradle`** under the `android {}`
   block:
   ```gradle
   signingConfigs {
       release {
           storeFile file('../../release.keystore')
           storePassword System.getenv('KEYSTORE_PASS')
           keyAlias 'adventure-stories'
           keyPassword System.getenv('KEY_PASS')
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled false  // WebView app — minification offers little
       }
   }
   ```

3. **Set up Play Asset Delivery** for the model so the base APK stays
   under Play Store's size limit (200 MB hard cap, 150 MB soft warning).
   See `mobile/README.md` "Play Asset Delivery" section for the full
   `gemma_3_1b/build.gradle` snippet.

4. **Build the AAB**:
   ```bash
   cd mobile
   KEYSTORE_PASS=*** KEY_PASS=*** node node_modules/@capacitor/cli/bin/capacitor build android
   # OR directly:
   cd android && KEYSTORE_PASS=*** KEY_PASS=*** ./gradlew bundleRelease
   ```
   The signed AAB lands at `android/app/build/outputs/bundle/release/`.

5. **Upload to Play Console** — internal testing track first, then alpha,
   then production. Required Play Console assets:
   - Privacy policy URL (game stores everything locally, so this is short)
   - Content rating (run the IARC questionnaire — fantasy violence + jail
     mechanic puts this around PEGI 7 / ESRB E10+)
   - Feature graphic, screenshots (your phone in dev mode is the source)
   - Target API level 34+ (we're at 36, no work needed)

---

## Troubleshooting

**`error: package com.getcapacitor does not exist`** — run
`node node_modules/@capacitor/cli/bin/capacitor sync android` again.
Capacitor's plugin metadata is regenerated on sync.

**Model loads but generates garbage / crashes** — the model file might be
corrupted (Kaggle download interrupts). Re-download. The file should be
exactly 555,749,376 bytes (Gemma 3 1B int4) — verify with `ls -l`.

**APK builds but app crashes at startup with `LiteRTBridge: not running in
Capacitor`** — that's the desktop fallback firing inside the APK. Check
that `mobile-bootstrap.js` loaded BEFORE `main.js` (view-source in Chrome
DevTools while the WebView is being inspected). It's the first script tag
in `<body>` after my sync.

**`npm run eval:models` says Gemma 3 1B is borderline** — bump to Gemma 3 4B
(~2.4 GB). Update `LITERT_CONFIG.MODEL_NAME` in `config.js` and the
`modelAssetPath` in `capacitor.config.json`. The 4B model fits flagship
phones (Pixel 8, Galaxy S24+) but mid-range phones may run into RAM limits.
