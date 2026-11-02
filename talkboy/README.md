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

**More magic**: Auto-Tune (Smooth or Robot, any key), Twin Voices, Echo (amount and time) and Reverb, plus Robot Star, Choir, Canyon and Cave presets.

**My Tapes**: any number of tapes with names and colour labels; rename, share (as a WAV), or throw away (with a confirm). Press STOP when stopped (it becomes EJECT) to open the tape box.

## How the sound works

Pure Kotlin, no native code. `audio/VoiceFx.kt` is the voice, `audio/Space.kt` the room:

- A streaming **phase vocoder** (2048-point FFT, 4× overlap) does Talk Speed and pitch shift. Peaks move as whole regions with their phases locked together (Laroche-Dolson), and phases reset on sudden onsets so consonants stay crisp.
- The voice shape is a **true envelope** (iterated cepstrum) whose detail follows the voice's own pitch (YIN detector): sharp enough to keep the vowel's formants apart, never sharp enough to trace the harmonics. Pitch divides it out and puts it back (voice keeps its vowels); Voice Size stretches it, which moves the formants instead of just tilting the treble.
- **Auto-Tune** uses the same pitch detector: Smooth glides onto the nearest note (70 ms), Robot snaps instantly; pick any note or a major key.
- **Twin Voices**: up to 4 copies, each a few cents out of tune (two-tap rotating delay), 19–43 ms late and drifting, panned left/right.
- **Echo**: stereo ping-pong with darkening repeats. **Reverb**: 8-line feedback delay network with diffusers, damping and modulation; one knob grows room size, decay and level together.
- A limiter at the end means stacked effects never clip. Tape Speed and Backwards are just how the playhead reads the tape (Hermite interpolation), so they skip the vocoder entirely.
- **Mono or stereo**: new tapes record in either (stereo uses the phone's mic pair); playback is stereo or both-speakers mono.
- With every knob at Normal it is bit-transparent; checks in `app/src/test` cover formant placement, auto-tune, echo timing, reverb tail, layer loudness, clipping and speed.

On a Galaxy S22 Ultra a stereo tape with the heaviest preset uses about half of one core (each play logs `dsp load` to logcat under `TalkTape`).

To hear the voices on a PC: `TALKTAPE_SAMPLE=<mono 44.1 kHz wav> ./gradlew :app:testDebugUnitTest --tests '*DemoRender*'` writes one wav per voice next to it.

## Build

Needs JDK 17+ and the Android SDK (API 36).

```bash
cd talkboy
./gradlew :app:testDebugUnitTest   # voice-effect checks + renders the screen to app/build/screenshots
./gradlew :app:assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
```

CI (`.github/workflows/talktape.yml`) builds both APKs and the screenshots on every change under `talkboy/`; grab them from the run's artifacts.

The release build is signed with the debug key so it installs straight away. Add a real keystore before publishing to Google Play.
