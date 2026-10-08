# Adventure Stories — Android (Capacitor)

The Android app is the same web game wrapped in Capacitor 8. The storyteller is
the same free online AI as on desktop (OpenRouter or Google AI Studio); each
player pastes a free key once in **⚙️ AI Settings**. Nothing is downloaded or
run on the phone besides the game itself.

## Build a debug APK

```bash
cd mobile
npm install                 # first time only
node sync-web.mjs           # copy the web game into mobile/www
npx cap copy android        # or copy mobile/www/* into android/app/src/main/assets/public/
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk` (about 10 MB).
Install it with `adb install -r app-debug.apk` or copy it to the phone.

## Notes

- `sync-web.mjs` lists the files that make up the game; add new modules there.
- `webContentsDebuggingEnabled` is off so the app can't be remote-debugged on
  players' phones; turn it on locally if you need Chrome DevTools.
- The phone needs internet: every turn is one request to the AI provider.
