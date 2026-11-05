package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class VoiceFxTest {
    private val sr = 44100

    private fun tone(hz: Double, seconds: Double, harmonics: Int = 1, amp: (Double) -> Double = { 0.5 }): ShortArray =
        ShortArray((sr * seconds).toInt()) { i ->
            val t = i.toDouble() / sr
            var v = 0.0
            for (h in 1..harmonics) v += sin(2 * PI * hz * h * t) / h
            (v / harmonics * amp(t) * 32767 * 1.5).coerceIn(-32767.0, 32767.0).toInt().toShort()
        }

    private fun render(s: ShortArray, fx: Fx) = TapeRenderer.renderAll(s, s.size, fx, sr)

    /** Autocorrelation pitch estimate over the middle of the clip. */
    private fun pitchOf(s: ShortArray): Double {
        val a = s.size / 4
        val n = 4096
        val lags = sr / 1200..sr / 60
        val ac = lags.map { lag -> (0 until n).sumOf { s[a + it].toDouble() * s[a + it + lag] } }
        val max = ac.max()
        // First local peak near the max = the true period (later peaks are its multiples).
        val i = ac.indices.first { it > 0 && it < ac.size - 1 && ac[it] >= 0.9 * max && ac[it] >= ac[it - 1] && ac[it] >= ac[it + 1] }
        return sr.toDouble() / lags.elementAt(i)
    }

    private fun rms(s: ShortArray, from: Int, to: Int): Double {
        var e = 0.0
        for (i in from until to) e += s[i].toDouble() * s[i]
        return sqrt(e / (to - from))
    }

    @Test fun neutralIsTransparent() {
        val src = tone(220.0, 1.0, harmonics = 5)
        val out = render(src, Fx())
        assertEquals(src.size.toDouble(), out.size.toDouble(), 1024.0)
        var err = 0.0; var sig = 0.0
        for (i in 4096 until src.size - 4096) {
            val d = (out[i] - src[i]).toDouble(); err += d * d; sig += src[i].toDouble() * src[i]
        }
        val snr = 10 * log10(sig / err)
        assertTrue("SNR $snr dB", snr > 40)
    }

    @Test fun talkSpeedChangesLengthNotPitch() {
        val src = tone(300.0, 1.0)
        for (tempo in listOf(0.5f, 2f)) {
            val out = render(src, Fx(tempo = tempo))
            assertEquals(src.size / tempo.toDouble(), out.size.toDouble(), 2048.0)
            assertEquals(300.0, pitchOf(out), 8.0)
        }
    }

    @Test fun pitchChangesPitchNotLength() {
        val src = tone(220.0, 1.0, harmonics = 3)
        val up = render(src, Fx(pitch = 12f))
        assertEquals(src.size.toDouble(), up.size.toDouble(), 1024.0)
        assertEquals(440.0, pitchOf(up), 15.0)
        val down = render(src, Fx(pitch = -12f))
        assertEquals(110.0, pitchOf(down), 6.0)
    }

    @Test fun tapeSpeedChangesBoth() {
        val src = tone(220.0, 1.0)
        val out = render(src, Fx(tapeSpeed = 2f))
        assertEquals(src.size / 2.0, out.size.toDouble(), 1024.0)
        assertEquals(440.0, pitchOf(out), 15.0)
    }

    @Test fun formantKeepsPitch() {
        val src = tone(200.0, 1.0, harmonics = 8)
        for (f in listOf(-6f, 6f)) {
            val out = render(src, Fx(formant = f))
            assertEquals(200.0, pitchOf(out), 10.0)
            assertTrue(rms(out, 0, out.size) > 500)
        }
    }

    @Test fun reverseFlipsTime() {
        // Gets louder over time; backwards it should get quieter.
        val src = tone(300.0, 1.0) { t -> 0.05 + 0.6 * t }
        val out = render(src, Fx(reverse = true))
        assertEquals(src.size.toDouble(), out.size.toDouble(), 1024.0)
        val q = out.size / 4
        assertTrue(rms(out, 0, q) > 2 * rms(out, 3 * q, out.size))
    }

    @Test fun everythingAtOnceStaysSane() {
        val src = tone(180.0, 0.5, harmonics = 6)
        val out = render(src, Fx(tapeSpeed = 0.7f, tempo = 1.6f, pitch = 5f, formant = -4f, reverse = true))
        assertEquals(src.size / (0.7 * 1.6), out.size.toDouble(), 2048.0)
        assertTrue(out.all { abs(it.toInt()) <= 32767 })
        assertTrue(rms(out, 0, out.size) > 300)
    }
}
