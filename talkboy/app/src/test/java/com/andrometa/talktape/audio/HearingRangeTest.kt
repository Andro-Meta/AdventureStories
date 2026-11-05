package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class HearingRangeTest {
    private val sr = 44100

    /** Gain in dB of a [hz] tone through the filter, measured after it settles. */
    private fun gainDb(hz: Double, channels: Int = 1): Double {
        val n = sr * 2
        val buf = ShortArray(n * channels) { (sin(2 * PI * hz * (it / channels) / sr) * 16000).toInt().toShort() }
        HearingRange(sr, channels).process(buf, n)
        fun rms(from: Int) = sqrt((from until n).sumOf { val v = buf[it * channels].toDouble(); v * v } / (n - from))
        return 20 * log10(rms(sr) / (16000 / sqrt(2.0)))
    }

    @Test fun dropsWhatEarsCantHearAndKeepsTheRest() {
        val g = listOf(5.0, 10.0, 40.0, 100.0, 1000.0, 10_000.0, 16_000.0, 21_500.0).associateWith { gainDb(it) }
        println(g.entries.joinToString { "%.0f Hz %.1f dB".format(it.key, it.value) })
        assertTrue("5 Hz", g[5.0]!! < -40)
        assertTrue("10 Hz", g[10.0]!! < -24)
        assertTrue("21.5 kHz", g[21_500.0]!! < -24)
        for (hz in listOf(100.0, 1000.0, 10_000.0)) assertEquals("$hz Hz", 0.0, g[hz]!!, 0.1)
        assertEquals("40 Hz", 0.0, g[40.0]!!, 1.0)
        assertEquals("16 kHz", 0.0, g[16_000.0]!!, 1.0)
    }

    @Test fun keepsStereoChannelsApart() {
        val n = sr
        val buf = ShortArray(n * 2) { if (it % 2 == 0) (sin(2 * PI * 440 * (it / 2) / sr) * 16000).toInt().toShort() else 0 }
        HearingRange(sr, 2).process(buf, n)
        assertTrue((0 until n).all { buf[2 * it + 1] == 0.toShort() })
    }

    @Test fun removesDcOffset() {
        val n = sr
        val buf = ShortArray(n) { 3000 }
        HearingRange(sr, 1).process(buf, n)
        assertTrue(buf.copyOfRange(sr / 2, n).maxOf { kotlin.math.abs(it.toInt()) } < 30)
    }
}
