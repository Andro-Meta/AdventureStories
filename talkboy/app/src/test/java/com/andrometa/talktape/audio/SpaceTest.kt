package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.sin
import kotlin.math.sqrt

class SpaceTest {
    private val sr = 44100

    private fun tone(hz: Double, seconds: Double, harmonics: Int = 4): ShortArray =
        ShortArray((sr * seconds).toInt()) { i ->
            var v = 0.0
            for (h in 1..harmonics) v += sin(2 * PI * hz * h * i / sr) / h
            (v / 2 * 0.5 * 32767).toInt().toShort()
        }

    private fun click(seconds: Double) = ShortArray((sr * seconds).toInt()).also { it[100] = 20000 }

    private fun left(p: Pcm) = ShortArray(p.frames) { p.data[2 * it] }
    private fun right(p: Pcm) = ShortArray(p.frames) { p.data[2 * it + 1] }

    private fun rms(s: ShortArray, from: Int, to: Int): Double {
        var e = 0.0
        for (i in from until minOf(to, s.size)) e += s[i].toDouble() * s[i]
        return sqrt(e / (minOf(to, s.size) - from).coerceAtLeast(1))
    }

    /** Autocorrelation pitch over a 4096-sample window starting at [a]. */
    private fun pitchAt(s: ShortArray, a: Int): Double {
        val lags = sr / 1200..sr / 60
        val ac = lags.map { lag -> (0 until 4096).sumOf { s[a + it].toDouble() * s[a + it + lag] } }
        val max = ac.max()
        val i = ac.indices.first { it > 0 && it < ac.size - 1 && ac[it] >= 0.9 * max && ac[it] >= ac[it - 1] && ac[it] >= ac[it + 1] }
        return sr.toDouble() / lags.elementAt(i)
    }

    private fun cents(a: Double, b: Double) = 1200 * log2(a / b)

    @Test fun autoTuneLandsOnTheNote() {
        // 452 Hz is 47 cents sharp of A (440): robot snaps it onto A.
        val src = tone(452.0, 1.0)
        val raw = pitchAt(src, sr / 2)
        val out = TapeRenderer.renderAll(src, src.size, Fx(tune = Tune.Robot), sr)
        val tuned = pitchAt(out, sr / 2)
        println("autotune robot: in ${"%.1f".format(raw)} Hz, out ${"%.1f".format(tuned)} Hz")
        assertTrue("was ${cents(tuned, 440.0)} cents off A", abs(cents(tuned, 440.0)) < 10)
        // Gentle gets there too once the note is held.
        val gentle = pitchAt(TapeRenderer.renderAll(src, src.size, Fx(tune = Tune.Gentle), sr), sr / 2)
        assertTrue("gentle ${cents(gentle, 440.0)} cents", abs(cents(gentle, 440.0)) < 15)
    }

    @Test fun autoTuneKeySkipsWrongNotes() {
        // 470 Hz is nearest A♯ (466), which isn't in C major: it must go to A (440) or B (494).
        val src = tone(470.0, 1.0)
        val out = pitchAt(TapeRenderer.renderAll(src, src.size, Fx(tune = Tune.Robot, key = 0), sr), sr / 2)
        println("autotune C major: 470 -> ${"%.1f".format(out)}")
        assertTrue(abs(cents(out, 440.0)) < 10 || abs(cents(out, 493.88)) < 10)
    }

    @Test fun reverbTailIsLongAndWide() {
        // A loud 0.2 s shout, then 0.1 s of silence.
        val src = tone(300.0, 0.3).also { it.fill(0, sr / 5, it.size) }
        val dry = TapeRenderer.renderAll(src, src.size, Fx(), sr)
        val wet = TapeRenderer.renderAll(Pcm(src, 1), Fx(reverb = 0.8f), sr)
        assertEquals(2, wet.channels)
        val l = left(wet); val r = right(wet)
        val shout = rms(src, 0, sr / 5)
        val tail = rms(l, sr, sr + sr / 10)
        println("reverb tail 1 s later: ${"%.1f".format(20 * kotlin.math.log10(tail / shout))} dB")
        println("reverb: dry ${dry.size} frames, wet ${wet.frames} frames, tail rms ${"%.1f".format(tail)}")
        assertTrue("tail lasts past the tape", wet.frames > dry.size + sr)
        assertTrue("tail still there a second later", tail > shout * 0.003)
        var diff = 0.0; var sum = 0.0
        for (i in sr / 4 until sr) { diff += abs(l[i] - r[i]).toDouble(); sum += abs(l[i].toInt()) + abs(r[i].toInt()) }
        assertTrue("left and right differ (stereo)", diff > 0.3 * sum)
    }

    @Test fun echoRepeatsAtTheEchoTime() {
        val src = click(1.5)
        val time = 0.35f
        val delay = ((0.08 + 0.72 * time) * sr).toInt()
        val out = TapeRenderer.renderAll(Pcm(src, 1), Fx(echo = 0.5f, echoTime = time), sr)
        val l = left(out); val r = right(out)
        // Ping-pong: first repeat on the left one delay after the click, second on the right.
        val firstL = rms(l, 100 + delay - 200, 100 + delay + 200)
        val beforeL = rms(l, 100 + delay / 2 - 200, 100 + delay / 2 + 200)
        val secondR = rms(r, 100 + 2 * delay - 300, 100 + 2 * delay + 300)
        println("echo: first ${"%.1f".format(firstL)} vs gap ${"%.1f".format(beforeL)}, second on right ${"%.1f".format(secondR)}")
        assertTrue(firstL > 20 * (beforeL + 1))
        assertTrue(secondR > 20)
    }

    @Test fun layersMakeAWideChorusAtTheSameLoudness() {
        val src = tone(220.0, 1.0)
        val out = TapeRenderer.renderAll(Pcm(src, 1), Fx(layers = 4), sr)
        val l = left(out); val r = right(out)
        val inRms = rms(src, sr / 4, 3 * sr / 4)
        val outRms = (rms(l, sr / 4, 3 * sr / 4) + rms(r, sr / 4, 3 * sr / 4)) / 2
        var diff = 0.0
        for (i in sr / 4 until 3 * sr / 4) diff += abs(l[i] - r[i]).toDouble()
        diff /= sr / 2
        println("layers: in rms ${"%.0f".format(inRms)}, out ${"%.0f".format(outRms)}, L-R ${"%.0f".format(diff)}")
        assertTrue("loudness within 3 dB", outRms in inRms * 0.7..inRms * 1.42)
        assertTrue("left and right differ", diff > 0.1 * inRms)
    }

    @Test fun stackedEffectsNeverClip() {
        val src = ShortArray(sr) { (sin(2 * PI * 200 * it / sr) * 32000).toInt().toShort() }
        val out = TapeRenderer.renderAll(Pcm(src, 1), Fx(layers = 4, echo = 1f, reverb = 1f), sr)
        val peak = out.data.maxOf { abs(it.toInt()) }
        println("stacked peak $peak")
        assertTrue(peak <= (0.9 * 32767).toInt() + 2)
    }

    @Test fun stereoTapeStaysStereoAndTransparent() {
        val l = tone(220.0, 1.0); val r = tone(330.0, 1.0)
        val src = ShortArray(l.size * 2) { if (it % 2 == 0) l[it / 2] else r[it / 2] }
        val out = TapeRenderer.renderAll(Pcm(src, 2), Fx(), sr)
        assertEquals(2, out.channels)
        for ((name, a, b) in listOf(Triple("L", l, left(out)), Triple("R", r, right(out)))) {
            var err = 0.0; var sig = 0.0
            for (i in 4096 until a.size - 4096) { val d = (b[i] - a[i]).toDouble(); err += d * d; sig += a[i].toDouble() * a[i] }
            val snr = 10 * kotlin.math.log10(sig / err)
            println("stereo $name SNR ${"%.1f".format(snr)} dB")
            assertTrue(snr > 40)
        }
    }

    @Test fun fastEnoughForAPhone() {
        val src = tone(150.0, 10.0, harmonics = 12)
        val fx = Fx(pitch = -5f, formant = -4f, tune = Tune.Robot, layers = 3, echo = 0.4f, reverb = 0.6f)
        TapeRenderer.renderAll(Pcm(src.copyOf(sr), 1), fx, sr) // warm up the JIT
        val t = System.nanoTime()
        TapeRenderer.renderAll(Pcm(src, 1), fx, sr)
        val ms = (System.nanoTime() - t) / 1e6
        println("10 s of audio, everything on: ${"%.0f".format(ms)} ms")
        // A phone core is several times slower than this PC; keep lots of headroom.
        assertTrue(ms < 2000)
    }
}
