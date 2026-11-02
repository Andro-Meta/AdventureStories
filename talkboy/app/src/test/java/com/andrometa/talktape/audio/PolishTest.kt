package com.andrometa.talktape.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

class PolishTest {
    private val sr = 44100
    /** Just the stage under test: the others are flat / off. */
    private val bare = PolishFx(amount = 1f, deEss = 0f, compress = 0f, presence = 0f, autoLevel = false)

    private fun sine(hz: Double, seconds: Double, rmsDb: Double) = FloatArray((sr * seconds).toInt()) {
        (10.0.pow(rmsDb / 20) * sqrt(2.0) * sin(2 * PI * hz * it / sr)).toFloat()
    }

    /** Runs mono [x] through both channels in 512-sample blocks; returns the left output. */
    private fun run(x: FloatArray, fx: PolishFx, p: Polish = Polish(sr)): FloatArray {
        val l = x.copyOf(); val r = x.copyOf()
        var i = 0
        while (i < x.size) {
            val n = minOf(512, x.size - i)
            val bl = l.copyOfRange(i, i + n); val br = r.copyOfRange(i, i + n)
            p.process(bl, br, n, fx)
            bl.copyInto(l, i); br.copyInto(r, i)
            i += n
        }
        return l
    }

    private fun db(x: FloatArray, from: Int, to: Int): Double {
        var e = 0.0
        for (i in from until to) e += x[i].toDouble() * x[i]
        return 10 * log10(e / (to - from) + 1e-20)
    }

    @Test fun highPassCutsRumbleNotVoice() {
        val lowIn = sine(30.0, 1.0, -20.0); val midIn = sine(1000.0, 1.0, -20.0)
        val h = sr / 2
        val low = db(run(lowIn, bare), h, lowIn.size) - db(lowIn, h, lowIn.size)
        val mid = db(run(midIn, bare), h, midIn.size) - db(midIn, h, midIn.size)
        println("high-pass (100 Hz): 30 Hz ${"%.1f".format(low)} dB, 1 kHz ${"%.2f".format(mid)} dB")
        assertTrue(low <= -20)
        assertTrue(abs(mid) < 0.5)
    }

    @Test fun deEsserTamesEssNotVowels() {
        val fx = bare.copy(deEss = 0.5f)
        for ((hz, name) in listOf(7000.0 to "7 kHz burst", 500.0 to "500 Hz vowel")) {
            val x = sine(hz, 0.6, -20.0)
            val h = x.size / 2
            val change = db(run(x, fx), h, x.size) - db(run(x, bare), h, x.size)
            println("de-esser: $name ${"%.2f".format(change)} dB")
            if (hz > 5000) assertTrue(change <= -6) else assertTrue(abs(change) < 1)
        }
    }

    @Test fun compressorEvensOutLoudAndQuiet() {
        val loud = sine(300.0, 1.0, -10.0); val quiet = sine(300.0, 1.0, -30.0)
        val x = loud + quiet
        val out = run(x, bare.copy(compress = 0.8f))
        val n = sr
        val inGap = db(x, n / 2, n) - db(x, n + n / 2, 2 * n)
        val outGap = db(out, n / 2, n) - db(out, n + n / 2, 2 * n)
        println("compressor: loud-quiet gap ${"%.1f".format(inGap)} dB -> ${"%.1f".format(outGap)} dB")
        assertTrue(outGap < inGap - 8)
    }

    @Test fun autoLevelLiftsVoiceNotSilence() {
        // Speech-like: buzzy 180 Hz voice, syllables at 4 Hz with gaps, at -35 dBFS; then 2 s of room noise at -70.
        val rnd = Random(1)
        val speech = FloatArray(6 * sr) { i ->
            val t = i.toDouble() / sr
            val syl = sin(2 * PI * 4 * t).let { if (it > 0) it else 0.0 }
            var v = 0.0
            for (h in 1..8) v += sin(2 * PI * 180 * h * t) / h
            (v * syl).toFloat()
        }
        val sRms = db(speech, 0, speech.size)
        val g = 10.0.pow((-35 - sRms) / 20).toFloat()
        for (i in speech.indices) speech[i] *= g
        val noiseAmp = (10.0.pow(-70 / 20.0) * sqrt(3.0)).toFloat()
        val room = FloatArray(2 * sr) { (rnd.nextFloat() * 2 - 1) * noiseAmp }
        val x = speech + room
        val p = Polish(sr)
        val out = run(x, PolishFx(amount = 1f), p)
        val voiceIn = db(x, 4 * sr, 6 * sr); val voiceOut = db(out, 4 * sr, 6 * sr)
        val roomIn = db(x, 6 * sr, 8 * sr); val roomOut = db(out, 6 * sr, 8 * sr)
        println("auto-level: voice ${"%.1f".format(voiceIn)} -> ${"%.1f".format(voiceOut)} dBFS (target -18), room ${"%.1f".format(roomIn)} -> ${"%.1f".format(roomOut)} dBFS, meter ${"%.1f".format(p.gainReductionDb)} dB")
        assertTrue(voiceOut > voiceIn + 8)
        assertTrue(roomOut < -55)
    }

    @Test fun limiterHoldsMinusOne() {
        val x = sine(1000.0, 1.0, 3.0) // peak +6 dBFS
        val out = run(x, bare)
        val peak = out.maxOf { abs(it) }
        // Distortion check: once settled, the limited sine should be the same chain's quiet (unlimited) output, scaled.
        val h = sr / 2
        val clean = run(FloatArray(x.size) { x[it] * 0.1f }, bare)
        val scale = out.copyOfRange(h, x.size).maxOf { abs(it) } / clean.copyOfRange(h, x.size).maxOf { abs(it) }
        var err = 0.0; var sig = 0.0
        for (i in h until x.size) { val ref = clean[i] * scale; err += (out[i] - ref).toDouble().pow(2); sig += ref.toDouble().pow(2) }
        println("limiter: peak ${"%.4f".format(peak)} (ceiling 0.8913), settled distortion ${"%.1f".format(10 * log10(err / sig))} dB")
        assertTrue(peak <= 0.8913f)
    }

    @Test fun offIsBitExact() {
        val rnd = Random(7)
        val l = FloatArray(4096) { rnd.nextFloat() * 2 - 1 }; val r = FloatArray(4096) { rnd.nextFloat() * 2 - 1 }
        val l0 = l.copyOf(); val r0 = r.copyOf()
        Polish(sr).process(l, r, l.size, PolishFx())
        assertArrayEquals(l0, l, 0f); assertArrayEquals(r0, r, 0f)
    }

    @Test fun cheapEnough() {
        val rnd = Random(3)
        val n = 10 * sr
        val l = FloatArray(n) { (sin(2 * PI * 200 * it / sr) * 0.2 + (rnd.nextFloat() - 0.5) * 0.05).toFloat() }
        val r = l.copyOf()
        val fx = PolishFx(amount = 1f)
        val warm = Polish(sr); warm.process(l.copyOf(sr), r.copyOf(sr), sr, fx)
        val p = Polish(sr)
        val t = System.nanoTime()
        var i = 0
        while (i < n) { val m = minOf(512, n - i); val bl = l.copyOfRange(i, i + m); val br = r.copyOfRange(i, i + m); p.process(bl, br, m, fx); i += m }
        val ms = (System.nanoTime() - t) / 1e6
        println("polish: 10 s stereo in ${"%.0f".format(ms)} ms")
        assertTrue(ms < 150)
    }
}
