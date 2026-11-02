package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

/** What each heavy setting costs, per 10 s of mono tape on this PC (a phone core is ~3x slower). */
class CostTest {
    @Test fun costs() {
        val sr = 44100
        val src = ShortArray(sr * 10) { var v = 0.0; for (h in 1..12) v += sin(2 * PI * 150 * h * it / sr) / h; (v * 5000).toInt().toShort() }
        val cases = linkedMapOf(
            "plain" to Fx(),
            "pitch" to Fx(pitch = -5f),
            "robot tune" to Fx(tune = TuneFx(Tune.Robot)),
            "choir harmony" to Fx(harmony = HarmonyFx(Harmony.Choir)),
            "talk-box chord" to Fx(talk = TalkBoxFx(TalkBox.Chord)),
            "whisper" to Fx(whisper = 1f),
            "clean-up" to Fx(clean = 1f, polish = PolishFx(amount = 1f)),
            "radio+tape+flanger" to Fx(place = PlaceFx(Place.Radio), oldTape = OldTapeFx(amount = 1f), wobble = WobbleFx(Wobble.Flanger)),
            "fly+reverb+echo+twins" to Fx(fly = FlyFx(Fly.Circle), reverb = 0.6f, echo = 0.4f, layers = 4),
            "everything" to Fx(pitch = -3f, tune = TuneFx(Tune.Robot), harmony = HarmonyFx(Harmony.Choir), talk = TalkBoxFx(TalkBox.Chord, mix = 0.5f),
                whisper = 0.3f, clean = 0.5f, polish = PolishFx(amount = 1f), place = PlaceFx(Place.Radio), oldTape = OldTapeFx(amount = 0.5f),
                wobble = WobbleFx(Wobble.Phaser), fly = FlyFx(Fly.Circle), reverb = 0.6f, echo = 0.4f, layers = 2),
        )
        var worst = 0.0
        var all = 0.0
        for ((name, fx) in cases) {
            TapeRenderer.renderAll(Pcm(src.copyOf(sr * 2), 1), fx, sr)
            val t = System.nanoTime()
            TapeRenderer.renderAll(Pcm(src, 1), fx, sr)
            val ms = (System.nanoTime() - t) / 1e6
            println("cost $name: ${"%.0f".format(ms)} ms per 10 s")
            if (name == "everything") all = ms else worst = maxOf(worst, ms)
        }
        // Any one effect well under 1 s per 10 s here; even all of them at once under 2.5 s.
        // (S22 Ultra measured ~5x slower than this PC per core: check "dsp load" in logcat.)
        assertTrue(worst < 800 && all < 2500)
    }
}
