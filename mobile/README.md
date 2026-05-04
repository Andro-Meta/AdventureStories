# Adventure Stories — Android (Capacitor + LiteRT-LM)

This folder turns the web app at `..` into a signed Play-Store-ready Android
APK / AAB. The on-device LLM is **Gemma 3 1B** (int4, ~600 MB) running
through Google's **LiteRT-LM** runtime (the production successor to
MediaPipe's LLM Inference API), exposed to JS via the
[`@capgo/capacitor-llm`](https://github.com/Cap-go/capacitor-llm) plugin.

The web app talks to the model through `liteRTBridge.js`, which speaks the
same OpenAI `/v1/chat/completions` shape as the desktop backends. Nothing
in the game logic changes — `aiHandler.js`, `engine.js`, `schemas.js` etc.
are completely backend-agnostic.

---

## One-time setup (host machine)

You need:
- **Node 22+**, npm
- **Java 17 (JDK)**
- **Android Studio Hedgehog (2023.1)+** with the Android 14 (API 34) SDK
- The **Gemma 3 1B int4 task file** from Google
  ([`gemma3-1b-it-int4.task`](https://www.kaggle.com/models/google/gemma-3/tfLite/gemma3-1b-it-int4),
  ~600 MB). Drop it into `mobile/android/app/src/main/assets/` once the
  Android project exists.

```bash
cd mobile
npm install
npm run init             # writes capacitor.config.json (already in repo)
npm run add:android      # generates the android/ Gradle project
```

Then drop the model:

```bash
cp ~/Downloads/gemma3-1b-it-int4.task android/app/src/main/assets/
```

> For Play Store builds, do NOT bundle the model in the base APK — wire it
> through Play Asset Delivery instead. See **Play Asset Delivery** below.

```bash
npm run sync             # copy web app into android/app/src/main/assets/public
npm run open:android     # open Android Studio
```

Connect a phone with USB debugging on, hit **Run**.

---

## Choose-your-model UX

The shipped APK lets the player pick the model on first launch (Settings →
On-Device Model):

| Model | Size | Required RAM | Quality | Speed |
|---|---|---|---|---|
| Gemma 3 270M (int4) | ~180 MB | 2 GB | basic | fastest |
| **Gemma 3 1B (int4)** ← default | ~600 MB | 4 GB | good | fast |
| Gemma 3 4B (int4) | ~2.4 GB | 6 GB | great | mid |

The selector writes `localStorage.adv.litertModel`; `liteRTBridge.js` honors
the choice on next app launch. Run `npm run eval:models` (root project) to
benchmark each option against the actual game prompts and verify the small
model is "smart enough" before publishing — if Gemma 3 1B passes the
schema-compliance threshold, **make it the only shipped model** to keep
APK size minimal and behaviour consistent across phones.

---

## Play Asset Delivery (model not in base APK)

Play Store rejects base APKs over ~150 MB. Use [Play Asset Delivery (PAD)](https://developer.android.com/guide/playcore/asset-delivery)
to ship the model as an asset pack:

1. In `android/app/build.gradle`, declare an asset pack module:
   ```gradle
   android {
     assetPacks = [':gemma_3_1b']
   }
   ```
2. Create `android/gemma_3_1b/build.gradle`:
   ```gradle
   apply plugin: 'com.android.asset-pack'
   assetPack {
     packName = "gemma_3_1b"
     dynamicDelivery { deliveryType = "install-time" }
   }
   ```
3. Drop the `.task` file into `android/gemma_3_1b/src/main/assets/`.
4. The Capacitor `liteRTBridge.js` already accepts `modelAssetPath` — point
   it at `gemma_3_1b/gemma3-1b-it-int4.task` once the pack is wired.

`install-time` delivery downloads the pack alongside the base APK, so the
game is fully playable offline immediately after install. For a smaller
initial download, switch to `on-demand` and trigger the fetch from the
"Welcome — downloading game brain (600 MB)" splash screen.

---

## Signing for the Play Store

```bash
keytool -genkey -v \
  -keystore release.keystore \
  -alias adventure-stories \
  -keyalg RSA -keysize 4096 \
  -validity 10000
```

Place `release.keystore` in `mobile/`. Reference it from
`android/app/build.gradle`:

```gradle
signingConfigs {
  release {
    storeFile file('../../release.keystore')
    storePassword System.getenv('KEYSTORE_PASS')
    keyAlias 'adventure-stories'
    keyPassword System.getenv('KEY_PASS')
  }
}
```

Then:

```bash
KEYSTORE_PASS=*** KEY_PASS=*** npm run build:release
```

The signed AAB lands at `android/app/build/outputs/bundle/release/`.
Upload that file to Play Console.

---

## Required Play Store metadata

- **Privacy policy** — required for any app that processes user input.
  The game stores everything locally; the policy can simply state that.
- **Content rating** — the game has fantasy violence and a jail mechanic;
  expect PEGI 7 / ESRB E10+ if you select honest options in the IARC
  questionnaire.
- **App category** — Games → Role-playing.
- **Target API level** — Google requires API 34+ for new submissions in 2026.
  Capacitor 8 already targets API 35; no extra work needed.

---

## Architecture cheat sheet

```
  +-------------------+     window.Capacitor
  | index.html (PWA)  | <----------- iframe ---------+
  +-------------------+                              |
            |                                        |
            | imports                                |
            v                                        |
  +-------------------+    isLiteRT? short-circuit   |
  | localAI.js        | ---------------------------> |
  +-------------------+                              |
                                                     v
                                          +---------------------+
                                          | liteRTBridge.js     |
                                          +---------------------+
                                                     |
                                                     | @capgo/capacitor-llm
                                                     v
                                          +---------------------+
                                          | Native: LiteRT-LM   |
                                          | + Gemma 3 1B (.task)|
                                          +---------------------+
```

When the user runs the game on desktop, `Capacitor.isNativePlatform()`
returns false, the LiteRT branch is skipped, and everything routes through
the existing llama-cpp / Ollama / Cloud paths.
