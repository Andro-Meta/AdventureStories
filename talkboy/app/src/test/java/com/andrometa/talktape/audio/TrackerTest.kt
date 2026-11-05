package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.sin

/** How well auto-tune hears and corrects real-ish voices. */
class TrackerTest {
    private val sr = 44100

    /** A voice-like tone following [hz] over time, harmonic weights [h], plus white noise at [snrDb]. */
    private fun voice(seconds: Double, h: DoubleArray, snrDb: Double = 99.0, hz: (Double) -> Double): ShortArray {
        val rnd = Random(7)
        var ph = 0.0
        val n = (sr * seconds).toInt()
        val x = DoubleArray(n) { i ->
            ph += 2 * PI * hz(i.toDouble() / sr) / sr
            var v = 0.0
            for (k in h.indices) v += h[k] * sin((k + 1) * ph)
            v
        }
        val p = x.map { it * it }.average()
        val noise = kotlin.math.sqrt(p / Math.pow(10.0, snrDb / 10))
        val peak = x.maxOf { abs(it) } + 3 * noise
        return ShortArray(n) { ((x[it] + noise * rnd.nextGaussian()) / peak * 0.6 * 32767).toInt().toShort() }
    }

    private fun cents(a: Double, b: Double) = 1200 * log2(a / b)

    /** Runs the tracker along the clip the way the renderer does; returns % of voiced frames off by > 50 cents. */
    private fun grossErrors(s: ShortArray, truth: (Double) -> Double): Double {
        val t = PitchTracker(sr)
        val frame = DoubleArray(2048)
        var bad = 0; var n = 0
        var pos = 0
        while (pos + 2048 < s.size) {
            for (i in 0 until 2048) frame[i] = s[pos + i] / 32768.0
            val f = t.detect(frame)
            val want = truth((pos + 400.0) / sr)
            n++
            if (f <= 0 || abs(cents(f, want)) > 50) bad++
            pos += 512
        }
        return 100.0 * bad / n
    }

    @Test fun trackerHoldsUpOnHardVoices() {
        val glide = { t: Double -> 110.0 * Math.pow(2.0, t * 2.5) } // 110 -> ~620 Hz over 1 s: low man to child
        val cases = listOf(
            Triple("clean", doubleArrayOf(1.0, 0.5, 0.33, 0.25), 99.0),
            Triple("weak fundamental", doubleArrayOf(0.15, 1.0, 0.7, 0.4, 0.3), 99.0),
            Triple("noisy 10 dB", doubleArrayOf(1.0, 0.5, 0.33, 0.25), 10.0),
            Triple("weak fund + noisy", doubleArrayOf(0.15, 1.0, 0.7, 0.4, 0.3), 12.0),
        )
        var worst = 0.0
        for ((name, h, snr) in cases) {
            val e = grossErrors(voice(1.0, h, snr, glide), glide)
            println("tracker $name: ${"%.1f".format(e)}% frames off by > 50 cents")
            worst = maxOf(worst, e)
        }
        assertTrue("worst case $worst%", worst < 3.0)
    }

    private fun pitchTrack(s: ShortArray, from: Double, to: Double): List<Double> {
        val t = PitchTracker(sr)
        val frame = DoubleArray(2048)
        val out = ArrayList<Double>()
        var pos = (from * sr).toInt()
        while (pos + 2048 < (to * sr)) {
            for (i in 0 until 2048) frame[i] = s[pos + i] / 32768.0
            out += t.detect(frame)
            pos += 256
        }
        return out
    }

    @Test fun humanizeKeepsVibratoButFixesTheNote() {
        // 25 cents flat of A with a 5.5 Hz, +-40 cent vibrato, like a real singer.
        val sung = { t: Double -> 440 * Math.pow(2.0, (-25 + 40 * sin(2 * PI * 5.5 * t)) / 1200) }
        val src = voice(2.0, doubleArrayOf(1.0, 0.5, 0.33, 0.25), 99.0, sung)
        val out = TapeRenderer.renderAll(src, src.size, Fx(tune = TuneFx(Tune.Gentle)), sr)
        val p = pitchTrack(out, 0.6, 1.8).filter { it > 0 }.map { cents(it, 440.0) }
        val mean = p.average()
        val depth = (p.max() - p.min()) / 2
        for (m in listOf(Tune.Robot)) {
            val o = TapeRenderer.renderAll(src, src.size, Fx(tune = TuneFx(m)), sr)
            val q = pitchTrack(o, 0.6, 1.8).filter { it > 0 }.map { cents(it, 440.0) }
            println("DBG $m centre ${"%.1f".format(q.average())} depth ${"%.1f".format((q.max() - q.min()) / 2)} voiced ${q.size}")
        }
        val raw = pitchTrack(src, 0.6, 1.8).filter { it > 0 }.map { cents(it, 440.0) }
        println("DBG input centre ${"%.1f".format(raw.average())} depth ${"%.1f".format((raw.max() - raw.min()) / 2)}")
        println("humanize: centre ${"%.1f".format(mean)} cents from A (was -25), vibrato +-${"%.1f".format(depth)} cents (was +-40)")
        assertTrue("centre on the note", abs(mean) < 8)
        assertTrue("vibrato kept", depth > 25)
    }

    @Test fun robotSnapsWithoutChatter() {
        // A slow slide from 430 to 470 Hz crosses from A to A# once: robot should switch note once.
        val slide = { t: Double -> 430.0 + 40 * t / 2 }
        val src = voice(2.0, doubleArrayOf(1.0, 0.5, 0.33, 0.25), 20.0, slide)
        val out = TapeRenderer.renderAll(src, src.size, Fx(tune = TuneFx(Tune.Robot)), sr)
        val notes = pitchTrack(out, 0.1, 1.9).filter { it > 0 }.map { (69 + 12 * log2(it / 440)).let { m -> Math.round(m) } }
        var switches = 0
        for (i in 1 until notes.size) if (notes[i] != notes[i - 1]) switches++
        val offNote = pitchTrack(out, 0.1, 1.9).filter { it > 0 }.map { abs(69 + 12 * log2(it / 440) - Math.round(69 + 12 * log2(it / 440))) * 100 }
        println("robot slide: $switches note switches (want 1), median off-note ${"%.1f".format(offNote.sorted()[offNote.size / 2])} cents")
        assertTrue(switches <= 2)
    }

    @Test fun findsTheKeyOfAMelody() {
        // A tune in G major (G A B C D E F# with G/D leaning), then one in A minor.
        for ((notes, want) in listOf(
            intArrayOf(67, 71, 74, 72, 71, 69, 67, 66, 67, 74, 71, 67, 62, 66, 69, 67) to (7 to Scale.Major),
            intArrayOf(57, 60, 64, 62, 60, 59, 57, 64, 65, 64, 62, 60, 59, 57, 52, 57) to (9 to Scale.Minor),
        )) {
            val per = 0.3
            val song = voice(per * notes.size, doubleArrayOf(1.0, 0.5, 0.3), 30.0) { t -> 440 * Math.pow(2.0, (notes[(t / per).toInt().coerceAtMost(notes.size - 1)] - 69) / 12.0) }
            val got = KeyFinder.find(Pcm(song, 1), sr)
            println("key finder: want ${TuneFx.KEY_NAMES[want.first]} ${want.second}, got ${got?.let { TuneFx.KEY_NAMES[it.first] + " " + it.second }}")
            assertTrue(got == want)
        }
    }

    @Test fun scaleSnapsOnlyToItsNotes() {
        // C minor pentatonic: C Eb F G Bb. E (64) must go to Eb (63) or F (65), never E.
        for (midi in listOf(64.0, 61.0, 68.2, 70.6)) {
            val n = AutoTune.nearest(midi, 0, Scale.MinorPentatonic)
            println("pentatonic: $midi -> $n")
            assertTrue(Scale.MinorPentatonic.contains(n, 0))
        }
        // Third above A (69) in C major is C (72); fifth above is E (76).
        assertTrue(Scale.Major.step(69, 0, 2) == 72 && Scale.Major.step(69, 0, 4) == 76)
    }
}
