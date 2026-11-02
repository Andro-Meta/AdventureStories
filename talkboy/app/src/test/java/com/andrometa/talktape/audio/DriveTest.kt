package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class DriveTest {
    private val sr = 44100

    private fun run(hz: Double, fx: DriveFx, amp: Double = 0.3): FloatArray {
        val d = Drive(sr)
        val n = sr
        val l = FloatArray(n) { (amp * sin(2 * PI * hz * it / sr)).toFloat() }
        val r = l.copyOf()
        var i = 0
        while (i < n) { val m = minOf(512, n - i); val a = l.copyOfRange(i, i + m); val b = r.copyOfRange(i, i + m); d.process(a, b, m, fx); a.copyInto(l, i); i += m }
        return l
    }

    private fun db(s: FloatArray, hz: Double): Double {
        val a = s.size / 2; val len = s.size / 2
        var re = 0.0; var im = 0.0
        for (i in 0 until len) {
            val w = 0.5 - 0.5 * cos(2 * PI * i / len)
            re += s[a + i] * w * cos(2 * PI * hz * i / sr); im -= s[a + i] * w * sin(2 * PI * hz * i / sr)
        }
        return 20 * log10(hypot(re, im) / len + 1e-12)
    }

    private fun rms(s: FloatArray) = sqrt(s.drop(s.size / 2).map { it * it.toDouble() }.average())

    @Test fun offIsBitExact() {
        val src = FloatArray(1000) { sin(it * 0.1).toFloat() }
        val l = src.copyOf(); val r = src.copyOf()
        Drive(sr).process(l, r, 1000, DriveFx())
        assertTrue(l.contentEquals(src))
    }

    @Test fun dirtierNotLouder() {
        for (a in listOf(0.3f, 0.7f, 1f)) {
            val out = run(440.0, DriveFx(amount = a))
            val h = (2..6).map { db(out, 440.0 * it) }.max() - db(out, 440.0)
            val level = 20 * log10(rms(out) / (0.3 / sqrt(2.0)))
            println("drive $a: strongest harmonic ${"%.1f".format(h)} dB vs fundamental, level ${"%.1f".format(level)} dB vs dry")
            assertTrue(h > -30)
            assertTrue(level in -2.5..2.5)
        }
    }

    @Test fun oversamplingKeepsAliasesDown() {
        // A 7 kHz tone's 5th harmonic (35 kHz) folds to 9.1 kHz without oversampling.
        val out = run(7000.0, DriveFx(amount = 1f, tone = 1f))
        val alias = db(out, 44100 - 35000.0) - db(out, 7000.0)
        println("drive alias at 9.1 kHz: ${"%.1f".format(alias)} dB")
        assertTrue(alias < -35)
    }

    @Test fun toneAndCrush() {
        val dark = run(440.0, DriveFx(amount = 0.8f, tone = 0f)); val bright = run(440.0, DriveFx(amount = 0.8f, tone = 1f))
        val darker = db(bright, 440.0 * 15) - db(dark, 440.0 * 15)
        val crushed = run(440.0, DriveFx(amount = 0.3f, crush = 1f))
        val clean = run(440.0, DriveFx(amount = 0.3f))
        // Crush adds energy between the harmonics (quantising noise / sample-hold images).
        val between = db(crushed, 440.0 * 7.5) - db(clean, 440.0 * 7.5)
        println("drive tone: 6.6 kHz ${"%.1f".format(darker)} dB brighter at tone 1; crush adds ${"%.1f".format(between)} dB between harmonics")
        assertTrue(darker > 10 && between > 10)
    }
}
