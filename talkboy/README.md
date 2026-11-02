# 📼 TalkTape

A pocket tape recorder for kids, inspired by the classic 90s handheld voice recorders, with a few superpowers they never had. Native Android (Kotlin + Jetpack Compose), works fully offline, no ads, no accounts, no internet permission.

<img src="docs/screenshot.jpg" width="300" alt="TalkTape main screen">

## What it does

**The classic tape deck**
- Big chunky piano keys: **REC, PLAY, REW, F.FWD, STOP/EJECT, PAUSE**. Latched keys stay pushed down like a real deck.
- **Hold ⏪ / ⏩** to zoom through the tape with the squeaky fast-wind sound; tap them to jump 5 seconds.
- Records *over* the tape from where you are, like a real cassette (it asks first, and offers a new tape instead).
- **Tape Speed** knob: the original slow-mo trick. Faster = higher and quicker, slower = deeper and slower.
- **Live Voice**: talk into the phone and hear yourself through the speaker, with all the voice magic, live (megaphone mode). Warns about feedback squeal if no headphones are plugged in.
- Spinning reels, a tape that moves from one reel to the other, an LCD counter, a level meter, and speaker holes that bounce with the sound.
- Up to 5 minutes per tape.

**The superpowers**
- **Voice Pitch**: higher or lower (±12 semitones) *without* changing speed, and the voice keeps its natural "size".
- **Voice Size** (formants): sound like a giant or something teeny-tiny, without changing pitch.
- **Talk Speed**: faster or slower (0.5×–2×) *without* changing the pitch.
- **Backwards** playback, combinable with everything else.
- 8 one-tap voices: Normal, Chipmunk, Slow-Mo, Monster, Mouse, Giant, Alien, Speedy.
- All knobs work *while the tape is playing*.
- **Save a magic copy** bakes the current effect into a new tape.

**My Tapes**: any number of tapes with names and colour labels; rename, share (as a WAV), or throw away (with a confirm). Press STOP when stopped (it becomes EJECT) to open the tape box.

## How the sound works

All in `app/src/main/java/com/andrometa/talktape/audio/VoiceFx.kt`, pure Kotlin, no native code:

- A streaming **phase vocoder** (2048-point FFT, 4× overlap) does time-stretch (Talk Speed) and pitch shift.
- Pitch shifting divides out the **cepstral spectral envelope** first and puts it back afterwards, so the voice keeps its formants; Voice Size stretches that envelope on its own.
- Tape Speed and Backwards are done by how the playhead reads the tape (fractional step, either direction), so they mix freely with the rest.
- With every knob at Normal it is transparent (>40 dB SNR, checked by a test).

## Build

Needs JDK 17+ and the Android SDK (API 36).

```bash
cd talkboy
./gradlew :app:testDebugUnitTest   # voice-effect checks + renders the screen to app/build/screenshots
./gradlew :app:assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
```

CI (`.github/workflows/talktape.yml`) builds both APKs and the screenshots on every change under `talkboy/`; grab them from the run's artifacts.

The release build is signed with the debug key so it installs straight away. Add a real keystore before publishing to Google Play.
