package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class EditsTest {
    private val sr = 44100
    private fun tone(hz: Double, rate: Int = sr, secs: Double = 1.0, amp: Double = 16000.0) =
        ShortArray((rate * secs).toInt()) { (sin(2 * PI * hz * it / rate) * amp).toInt().toShort() }

    private fun maxStep(d: ShortArray) = (1 until d.size).maxOf { abs(d[it] - d[it - 1]) }

    private fun rms(d: ShortArray, from: Int = 0, to: Int = d.size) =
        sqrt((from until to).sumOf { d[it].toDouble() * d[it] } / (to - from))

    @Test fun cutJoinsWithoutAClick() {
        val p = Pcm(tone(440.0), 1)
        val natural = maxStep(p.data)
        // Cut lands mid-wave on both sides: a plain splice jumps, the crossfade must not.
        val a = 10_037; val b = 23_311
        val naive = p.data.copyOfRange(0, a) + p.data.copyOfRange(b, p.data.size)
        val out = Edits.cut(p, a, b)
        println("step natural=$natural naive=${maxStep(naive)} cut=${maxStep(out.data)}")
        assertTrue("naive control should click", maxStep(naive) > 3 * natural)
        assertTrue(maxStep(out.data) <= natural * 1.2)
        assertEquals(p.frames - (b - a) - Edits.XFADE, out.frames)
    }

    @Test fun stereoSpliceKeepsChannelsApart() {
        val l = tone(440.0); val r = ShortArray(l.size)
        val p = Pcm(ShortArray(l.size * 2) { if (it % 2 == 0) l[it / 2] else r[it / 2] }, 2)
        val out = Edits.reverse(Edits.repeat(p, 1000, 9000), 2000, 5000)
        assertEquals(2, out.channels)
        assertTrue((0 until out.frames).all { out.data[2 * it + 1] == 0.toShort() })
    }

    @Test fun fadesAndGainReachTheirEnds() {
        val p = Pcm(tone(440.0), 1)
        val f = Edits.fade(p, 0, sr / 2, out = false)
        assertTrue(rms(f.data, 0, 400) < 200)
        assertEquals(rms(p.data, sr / 2, sr), rms(f.data, sr / 2, sr), 1.0)
        val s = Edits.silence(p, 10_000, 20_000)
        assertTrue(rms(s.data, 10_000 + Edits.XFADE, 20_000 - Edits.XFADE) < 1)
        assertTrue(maxStep(s.data) <= maxStep(p.data))
        val n = Edits.normalize(Pcm(tone(440.0, amp = 3000.0), 1), 0, sr)
        assertEquals(29_200.0, n.data.maxOf { it.toInt() }.toDouble(), 300.0)
    }

    @Test fun resampleKeepsPitchAndLevelAndStopsAliasing() {
        // 1 kHz at 48 kHz -> 44.1 kHz: same pitch (zero crossings), same level.
        val src = tone(1000.0, rate = 48_000)
        val out = Edits.resample(src, 1, 48_000, sr)
        assertEquals(sr, out.size)
        val cross = (sr / 10 until sr * 9 / 10).count { out[it - 1] < 0 && out[it] >= 0 }
        assertEquals(800.0, cross.toDouble(), 2.0)
        assertEquals(rms(src), rms(out, 100, out.size - 100), rms(src) * 0.01)
        // Stereo: each side resampled on its own (left tone, right silent).
        val st = Edits.resample(ShortArray(src.size * 2) { if (it % 2 == 0) src[it / 2] else 0 }, 2, 48_000, sr)
        assertEquals(sr * 2, st.size)
        assertTrue((0 until sr).all { st[2 * it + 1] == 0.toShort() })
        assertEquals(rms(src), rms(ShortArray(sr) { st[2 * it] }, 100, sr - 100), rms(src) * 0.01)
        // 30 kHz at 96 kHz can't exist at 44.1 kHz: it must vanish, not fold down to 14.1 kHz.
        val hi = Edits.resample(tone(30_000.0, rate = 96_000), 1, 96_000, sr)
        val db = 20 * log10(rms(hi, 100, hi.size - 100) / rms(tone(30_000.0, rate = 96_000)))
        println("30 kHz after resample: %.1f dB".format(db))
        assertTrue(db < -40)
    }
}
