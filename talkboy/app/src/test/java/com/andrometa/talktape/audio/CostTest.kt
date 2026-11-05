package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

/**
 * What each heavy setting costs, per 10 s of mono tape, in units of a fixed FFT workload timed
 * on the same machine. Always prints; only enforces its limits with TALKTAPE_COST_LIMITS=1,
 * because wall-clock timing is too noisy to gate CI on (the reference alone moved 256 -> 186 ms
 * between two runs on the dev PC). The real budget is the phone: "dsp load" in logcat.
 */
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
        val ref = reference()
        var worst = 0.0
        var all = 0.0
        var worstName = ""
        for ((name, fx) in cases) {
            TapeRenderer.renderAll(Pcm(src.copyOf(sr * 2), 1), fx, sr)
            val t = System.nanoTime()
            TapeRenderer.renderAll(Pcm(src, 1), fx, sr)
            val ms = (System.nanoTime() - t) / 1e6
            println("cost $name: ${"%.0f".format(ms)} ms per 10 s (${"%.1f".format(ms / ref)} x reference)")
            if (name == "everything") all = ms / ref else if (ms / ref > worst) { worst = ms / ref; worstName = name }
        }
        // Dev PC: heaviest single effect 1.9-2.8x, everything 6.8-9.6x across runs.
        val report = "reference ${"%.0f".format(ref)} ms; worst single ($worstName) ${"%.1f".format(worst)}x (limit 4.0); everything ${"%.1f".format(all)}x (limit 14.0)"
        println(report)
        assertTrue("CostTest measured nothing", ref > 0 && all > 0)
        if (System.getenv("TALKTAPE_COST_LIMITS") == "1") assertTrue(report, worst < 4.0 && all < 14.0)
    }

    /** Fixed CPU workload: 6000 forward 2048-point FFTs, best of 3 (ms). */
    private fun reference(): Double {
        val fft = Fft(2048)
        val re = DoubleArray(2048) { sin(it * 0.37) }; val im = DoubleArray(2048)
        var best = Double.MAX_VALUE
        repeat(4) { run ->
            val t = System.nanoTime()
            repeat(6000) { re.fill(0.5, 0, 1); im.fill(0.0); fft.transform(re, im, false) }
            if (run > 0) best = minOf(best, (System.nanoTime() - t) / 1e6)
        }
        return best
    }
}
