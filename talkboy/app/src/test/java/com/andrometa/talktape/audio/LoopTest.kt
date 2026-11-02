package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class LoopTest {
    private val sr = 44100
    private val tone = ShortArray(sr) { (sin(2 * PI * 440 * it / sr) * 16000).toInt().toShort() }
    // Loop length deliberately not a whole number of cycles, so the wrap lands mid-wave.
    private val a = sr / 10
    private val b = a + 9137

    /** Plays 1.5 s looping [a, b); returns the biggest sample-to-sample step and where the playhead went. */
    private fun play(fx: Fx, naive: Boolean): Pair<Float, ClosedFloatingPointRange<Double>> {
        val r = TapeRenderer(sr)
        r.reset(a.toDouble())
        val buf = FloatArray(r.block * 2)
        var prev = Float.NaN
        var step = 0f
        var lo = Double.MAX_VALUE; var hi = -Double.MAX_VALUE
        repeat((1.5 * sr / r.block).toInt()) { n ->
            r.render(tone, tone.size, fx, buf)
            if (naive) { if (r.position >= b) r.position = a + (r.position - b) } else r.wrapLoop(a, b, fx)
            lo = minOf(lo, r.position); hi = maxOf(hi, r.position)
            // Skip the first few blocks (vocoder fade-in has its own shape).
            for (i in 0 until r.block) {
                val v = buf[2 * i]
                if (n > 4 && !prev.isNaN()) step = maxOf(step, abs(v - prev))
                prev = v
            }
        }
        return step to lo..hi
    }

    @Test fun loopWrapsWithoutAClick() {
        val sine = (2 * PI * 440 / sr * 16000 / 32768).toFloat() // biggest natural step of the tone
        for ((name, fx) in listOf("plain" to Fx(), "voice fx" to Fx(pitch = 3f))) {
            val (naive, _) = play(fx, naive = true)
            val (smooth, range) = play(fx, naive = false)
            println("loop $name: biggest step naive ${"%.3f".format(naive)}, crossfaded ${"%.3f".format(smooth)}, tone ${"%.3f".format(sine)}; playhead ${range.start.toInt()}..${range.endInclusive.toInt()} (loop $a..$b)")
            assertTrue("stays in the loop", range.start >= a && range.endInclusive < b + 600)
            assertTrue("no click", smooth < sine * 1.6f)
        }
    }

    @Test fun backwardsLoops() {
        val r = TapeRenderer(sr)
        r.reset(b.toDouble())
        val buf = FloatArray(r.block * 2)
        repeat(200) { r.render(tone, tone.size, Fx(reverse = true), buf); r.wrapLoop(a, b, Fx(reverse = true)) }
        assertTrue(r.position in (a - 600.0)..b.toDouble())
    }
}
