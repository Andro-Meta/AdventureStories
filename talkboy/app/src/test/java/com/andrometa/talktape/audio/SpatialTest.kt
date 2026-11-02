package com.andrometa.talktape.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

class SpatialTest {
    private val sr = 44100

    private fun noise(seconds: Double, amp: Float = 0.3f): FloatArray {
        val rnd = Random(1)
        return FloatArray((sr * seconds).toInt()) { (rnd.nextFloat() * 2 - 1) * amp }
    }

    private fun sine(hz: Double, seconds: Double, amp: Float = 0.5f) =
        FloatArray((sr * seconds).toInt()) { (sin(2 * PI * hz * it / sr) * amp).toFloat() }

    /** Runs [src] (mono) through the fly-around in 512-sample blocks. */
    private fun fly(src: FloatArray, fx: FlyFx, az: Double = Double.NaN): Pair<FloatArray, FloatArray> {
        val f = FlyAround(sr).apply { fixedAzimuth = az }
        val l = src.copyOf(); val r = src.copyOf()
        var i = 0
        val bl = FloatArray(512); val br = FloatArray(512)
        while (i < src.size) {
            val n = minOf(512, src.size - i)
            System.arraycopy(l, i, bl, 0, n); System.arraycopy(r, i, br, 0, n)
            f.process(bl, br, n, fx)
            System.arraycopy(bl, 0, l, i, n); System.arraycopy(br, 0, r, i, n)
            i += n
        }
        return l to r
    }

    /** Interaural delay in ms over [from, from+len): positive = right ear hears it first. */
    private fun itd(l: FloatArray, r: FloatArray, from: Int, len: Int, maxLag: Int = 45): Double {
        fun xc(lag: Int): Double { var s = 0.0; for (i in from until from + len) s += l[i] * r[i - lag].toDouble(); return s }
        val c = (-maxLag..maxLag).map { xc(it) }
        val k = c.indices.maxBy { c[it] }
        val shift = if (k in 1 until c.size - 1) {
            val a = c[k - 1]; val b = c[k]; val d = c[k + 1]
            0.5 * (a - d) / (a - 2 * b + d)
        } else 0.0
        return (k - maxLag + shift) / sr * 1000
    }

    private fun rms(x: FloatArray, from: Int, to: Int): Double {
        var e = 0.0; for (i in from until to) e += x[i].toDouble() * x[i]
        return sqrt(e / (to - from))
    }

    /** Frequency from interpolated zero crossings over [from, to). */
    private fun freq(x: FloatArray, from: Int, to: Int): Double {
        var first = -1.0; var last = -1.0; var n = 0
        for (i in from + 1 until to) if (x[i - 1] < 0 && x[i] >= 0) {
            val t = i - 1 + x[i - 1] / (x[i - 1] - x[i]).toDouble()
            if (first < 0) first = t else n++
            last = t
        }
        return n * sr / (last - first)
    }

    @Test fun hardRightArrivesEarlierAndLouderOnTheRight() {
        val fx = FlyFx(Fly.Circle, distance = 0f)
        val (l, r) = fly(noise(0.5), fx, az = PI / 2)
        val right = itd(l, r, 4000, 12000)
        val (fl, fr) = fly(noise(0.5), fx, az = 0.0)
        val front = itd(fl, fr, 4000, 12000)
        val (sl, srr) = fly(sine(3000.0, 0.5), fx, az = PI / 2)
        val ild = 20 * log10(rms(srr, 4000, 20000) / rms(sl, 4000, 20000))
        val (fsl, fsr) = fly(sine(3000.0, 0.5), fx, az = 0.0)
        val ildFront = 20 * log10(rms(fsr, 4000, 20000) / rms(fsl, 4000, 20000))
        println("hard right: ITD ${"%.3f".format(right)} ms, ILD@3k ${"%.1f".format(ild)} dB; front: ITD ${"%.3f".format(front)} ms, ILD ${"%.1f".format(ildFront)} dB")
        assertTrue(right in 0.5..0.7)
        assertTrue(ild > 8)
        assertEquals(0.0, front, 0.03)
        // Left and right early reflections land at different times (decorrelation), so a steady tone combs slightly differently per ear.
        assertEquals(0.0, ildFront, 1.0)
    }

    @Test fun circleSwingsTheItdAtTheOrbitRate() {
        val fx = FlyFx(Fly.Circle, speed = 0.4f, distance = 0.2f)
        val period = 1 / (0.05 * Math.pow(20.0, 0.4))
        val (l, r) = fly(noise(period * 1.15), fx)
        val win = sr / 4
        val signs = (0 until (l.size - 100) / win - 1).map { w -> itd(l, r, 100 + w * win, win) }
        val flips = (1 until signs.size).filter { signs[it] * signs[it - 1] < 0 }.map { (it * win + 100) / sr.toDouble() }
        println("circle: period ${"%.2f".format(period)} s, ITD sign flips at ${flips.map { "%.2f".format(it) }} s; ITD by window ${signs.map { "%.2f".format(it) }}")
        // Starts in front heading right, flips at the back (half an orbit) and in front again.
        assertTrue(flips.isNotEmpty())
        assertEquals(period / 2, flips.first(), 0.35)
        assertTrue(signs.maxOrNull()!! > 0.45 && signs.minOrNull()!! < -0.45)
    }

    @Test fun flyByDopplerRisesThenFalls() {
        val fx = FlyFx(Fly.FlyBy, speed = 0.6f, distance = 0.4f)
        val v = 4 * Math.pow(10.0, 0.6)
        val closest = 25.0 / v // a quarter of the there-and-back trip
        val src = sine(1000.0, closest * 2)
        val (l, _) = fly(src, fx)
        val before = freq(l, ((closest - 0.8) * sr).toInt(), ((closest - 0.4) * sr).toInt())
        val after = freq(l, ((closest + 0.4) * sr).toInt(), ((closest + 0.8) * sr).toInt())
        val atPass = freq(l, ((closest - 0.05) * sr).toInt(), ((closest + 0.05) * sr).toInt())
        println("flyby ${"%.1f".format(v)} m/s: approaching ${"%.1f".format(before)} Hz, passing ${"%.1f".format(atPass)} Hz, leaving ${"%.1f".format(after)} Hz")
        assertTrue(before > 1020)
        assertTrue(after < 980)
    }

    @Test fun movingNeverClicks() {
        val src = sine(440.0, 3.0)
        val own = (2 * PI * 440 / sr * 0.5).toFloat()
        for (fx in listOf(FlyFx(Fly.Circle, 1f, 0f), FlyFx(Fly.FlyBy, 1f, 0f), FlyFx(Fly.SideToSide, 1f, 0.5f), FlyFx(Fly.Overhead, 1f, 0.3f))) {
            val (l, r) = fly(src, fx)
            var step = 0f
            for (i in 2000 until l.size) step = maxOf(step, abs(l[i] - l[i - 1]), abs(r[i] - r[i - 1]))
            println("${fx.mode}: biggest step ${"%.4f".format(step)} (source ${"%.4f".format(own)})")
            assertTrue(step < own * 1.6f)
        }
    }

    @Test fun fullScaleNeverOverOne() {
        val src = noise(2.0, 1f)
        for (m in Fly.entries.filter { it != Fly.Off }) {
            val (l, r) = fly(src, FlyFx(m, 1f, 0f))
            val peak = maxOf(l.maxOf { abs(it) }, r.maxOf { abs(it) })
            println("$m full-scale peak ${"%.4f".format(peak)}")
            assertTrue(peak <= 1f)
        }
    }

    @Test fun ghostSwellsBeforeTheSoundAndNotAfter() {
        val n = sr * 3
        val t = sr * 2
        val src = ShortArray(n)
        for (i in 0 until sr / 20) src[t + i] = (sin(2 * PI * 500 * i / sr) * 24000).toInt().toShort()
        val g = Ghost.render(src, 1, sr, 0.5f)
        val before = rms(g, t - sr / 2, t - sr / 100)
        val early = rms(g, t - 2 * sr, t - sr * 3 / 2)
        var after = 0f
        for (i in t + sr / 20 + sr / 20 until n) after = maxOf(after, abs(g[i]))
        val dry = 24000 / 32768f
        val peakDb = 20 * log10(g.maxOf { abs(it) } / dry)
        println("ghost: swell rms in the 0.5 s before ${"%.4f".format(before)}, 2 s before ${"%.5f".format(early)}, max after +50 ms ${"%.6f".format(after)}, peak ${"%.1f".format(peakDb)} dB re dry")
        assertTrue(before > 0.01)
        assertTrue(before > 5 * early)
        assertTrue(after < 1e-4)
        assertEquals(-12.0, peakDb.toDouble(), 1.0)
    }

    @Test fun ghostIsFastAndLengthMatters() {
        val rnd = Random(2)
        val five = ShortArray(sr * 300) { (rnd.nextFloat() * 2 - 1).times(8000).toInt().toShort() }
        Ghost.render(five.copyOf(sr * 10), 1, sr, 0.5f)
        val t0 = System.nanoTime()
        Ghost.render(five, 1, sr, 0.5f)
        val ms = (System.nanoTime() - t0) / 1e6
        println("ghost: 5 min mono in ${"%.0f".format(ms)} ms")
        assertTrue(ms < 1500)

        val click = ShortArray(sr * 5).also { it[sr * 4] = 30000 }
        fun reach(len: Float): Double {
            val g = Ghost.render(click, 1, sr, len)
            val p = g.maxOf { abs(it) }
            val first = g.indexOfFirst { abs(it) > p * 0.001f }
            return (sr * 4 - first) / sr.toDouble()
        }
        val short = reach(0f); val long = reach(1f)
        println("ghost: swell starts ${"%.2f".format(short)} s early at length 0, ${"%.2f".format(long)} s at length 1")
        assertTrue(long > short * 2)
    }
}
