package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.sin

/**
 * Voice Size must move the formants (the vowel resonances), not just tilt the treble.
 * A synthetic /a/ vowel (pulse train through F1/F2/F3 resonators) goes in; the formant
 * peaks of what comes out are read from the harmonic amplitudes.
 */
class FormantTest {
    private val sr = 44100
    private val f0 = 120.0

    /** Klatt-style vowel: impulse train through three 2-pole resonators. */
    private fun vowel(formants: List<Double>, seconds: Double = 1.5): ShortArray {
        val n = (sr * seconds).toInt()
        var x = DoubleArray(n)
        val period = sr / f0
        var next = 0.0
        for (i in 0 until n) if (i >= next) { x[i] = 1.0; next += period }
        for ((k, f) in formants.withIndex()) {
            val bw = listOf(80.0, 100.0, 140.0)[k]
            val r = exp(-PI * bw / sr)
            val a1 = 2 * r * cos(2 * PI * f / sr); val a2 = -r * r
            val y = DoubleArray(n)
            for (i in 0 until n) y[i] = x[i] + a1 * (if (i > 0) y[i - 1] else 0.0) + a2 * (if (i > 1) y[i - 2] else 0.0)
            x = y
        }
        val peak = x.maxOf { kotlin.math.abs(it) }
        return ShortArray(n) { (x[it] / peak * 0.7 * 32767).toInt().toShort() }
    }

    /** dB amplitude of each harmonic of f0 (single-bin DFT over the middle of the clip). */
    private fun harmonics(s: ShortArray, fund: Double): DoubleArray {
        val a = s.size / 4; val len = s.size / 2
        return DoubleArray((4000 / fund).toInt()) { h ->
            val f = fund * (h + 1)
            var re = 0.0; var im = 0.0
            for (i in 0 until len) {
                val w = 0.5 - 0.5 * cos(2 * PI * i / len)
                val ph = 2 * PI * f * i / sr
                re += s[a + i] * w * cos(ph); im -= s[a + i] * w * sin(ph)
            }
            20 * log10(hypot(re, im) + 1e-9)
        }
    }

    /** Frequency of the loudest harmonic between lo and hi Hz. */
    private fun peak(h: DoubleArray, fund: Double, lo: Double, hi: Double): Double {
        var best = -1; var bv = -1e9
        for (i in h.indices) { val f = fund * (i + 1); if (f in lo..hi && h[i] > bv) { bv = h[i]; best = i } }
        return fund * (best + 1)
    }

    private fun formants(s: ShortArray, factor: Double): Pair<Double, Double> {
        val h = harmonics(s, f0)
        return peak(h, f0, 450 * factor, 950 * factor) to peak(h, f0, 1000 * factor, 1700 * factor)
    }

    /** Pitch moves the harmonics but the vowel (formants) must stay put. */
    @Test fun pitchShiftKeepsTheResonances() {
        val src = vowel(listOf(700.0, 1220.0, 2600.0))
        for (semis in listOf(-5f, 5f)) {
            val fund = f0 * Fx.semis(semis)
            val out = TapeRenderer.renderAll(src, src.size, Fx(pitch = semis), sr)
            val h = harmonics(out, fund)
            val o1 = peak(h, fund, 450.0, 950.0); val o2 = peak(h, fund, 1000.0, 1700.0)
            println("pitch $semis: F1 $o1  F2 $o2 (want 700 / 1220)")
            assertEquals(700.0, o1, fund * 1.5)
            assertEquals(1220.0, o2, fund * 1.5)
        }
    }

    /** Same check for a high (child-like) voice, where a too-sharp envelope would follow the harmonics. */
    @Test fun formantShiftHighVoice() {
        val src = vowelAt(260.0, listOf(850.0, 1750.0, 3000.0))
        val factor = Fx.semis(5f)
        val out = TapeRenderer.renderAll(src, src.size, Fx(formant = 5f), sr)
        val h = harmonics(out, 260.0)
        val o1 = peak(h, 260.0, 600 * factor, 1300 * factor); val o2 = peak(h, 260.0, 1400 * factor, 2200 * factor)
        println("high voice formant +5: F1 $o1 (want ${850 * factor})  F2 $o2 (want ${1750 * factor})")
        assertEquals(850 * factor, o1, 260 * 1.1)
        assertEquals(1750 * factor, o2, 260 * 1.1)
    }

    private fun vowelAt(fund: Double, formants: List<Double>): ShortArray {
        val n = (sr * 1.5).toInt()
        var x = DoubleArray(n)
        var next = 0.0
        for (i in 0 until n) if (i >= next) { x[i] = 1.0; next += sr / fund }
        for ((k, f) in formants.withIndex()) {
            val bw = listOf(90.0, 110.0, 150.0)[k]
            val r = exp(-PI * bw / sr)
            val a1 = 2 * r * cos(2 * PI * f / sr); val a2 = -r * r
            val y = DoubleArray(n)
            for (i in 0 until n) y[i] = x[i] + a1 * (if (i > 0) y[i - 1] else 0.0) + a2 * (if (i > 1) y[i - 2] else 0.0)
            x = y
        }
        val peak = x.maxOf { kotlin.math.abs(it) }
        return ShortArray(n) { (x[it] / peak * 0.7 * 32767).toInt().toShort() }
    }

    @Test fun formantShiftMovesTheResonances() {
        val src = vowel(listOf(700.0, 1220.0, 2600.0))
        val (s1, s2) = formants(src, 1.0)
        println("source F1=$s1 F2=$s2")
        for (semis in listOf(-6f, 6f)) {
            val factor = Fx.semis(semis)
            val out = TapeRenderer.renderAll(src, src.size, Fx(formant = semis), sr)
            val (o1, o2) = formants(out, factor)
            println("formant $semis: F1 $o1 (want ${700 * factor})  F2 $o2 (want ${1220 * factor})")
            // Within 1.5 harmonics of the ideal.
            assertEquals(700 * factor, o1, f0 * 1.5)
            assertEquals(1220 * factor, o2, f0 * 1.5)
        }
    }
}
