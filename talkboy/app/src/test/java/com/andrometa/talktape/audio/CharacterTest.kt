package com.andrometa.talktape.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.log2
import kotlin.math.sin
import kotlin.math.sqrt

class CharacterTest {
    private val sr = 44100
    private val off = Triple(PlaceFx(), OldTapeFx(), WobbleFx())

    private fun noise(n: Int, amp: Double, seed: Long): FloatArray {
        val r = java.util.Random(seed)
        return FloatArray(n) { ((r.nextDouble() * 2 - 1) * amp).toFloat() }
    }

    private fun sine(n: Int, hz: Double, amp: Double) = FloatArray(n) { (sin(2 * PI * hz * it / sr) * amp).toFloat() }

    /** Runs the effect in 512-sample blocks (like the renderer) on copies; returns left, right. */
    private fun run(
        l: FloatArray, r: FloatArray = l.copyOf(),
        place: PlaceFx = PlaceFx(), tape: OldTapeFx = OldTapeFx(), wobble: WobbleFx = WobbleFx(),
        fx: CharacterFx = CharacterFx(sr),
    ): Pair<FloatArray, FloatArray> {
        val ol = l.copyOf(); val or = r.copyOf()
        val bl = FloatArray(512); val br = FloatArray(512)
        var i = 0
        while (i < ol.size) {
            val n = minOf(512, ol.size - i)
            System.arraycopy(ol, i, bl, 0, n); System.arraycopy(or, i, br, 0, n)
            fx.process(bl, br, n, place, tape, wobble)
            System.arraycopy(bl, 0, ol, i, n); System.arraycopy(br, 0, or, i, n)
            i += n
        }
        return ol to or
    }

    /** Welch power spectrum (4096-point Hann, 50 % overlap) of x[from, to). */
    private fun psd(x: FloatArray, from: Int = 0, to: Int = x.size): DoubleArray {
        val n = 4096; val fft = Fft(n)
        val w = DoubleArray(n) { 0.5 - 0.5 * cos(2 * PI * it / n) }
        val p = DoubleArray(n / 2 + 1)
        val re = DoubleArray(n); val im = DoubleArray(n)
        var s = from
        while (s + n <= to) {
            for (i in 0 until n) { re[i] = x[s + i] * w[i]; im[i] = 0.0 }
            fft.transform(re, im, false)
            for (k in 0..n / 2) p[k] += re[k] * re[k] + im[k] * im[k]
            s += n / 2
        }
        return p
    }

    private fun band(p: DoubleArray, lo: Double, hi: Double): Double {
        var e = 0.0
        for (k in p.indices) { val f = k * sr / 4096.0; if (f >= lo && f < hi) e += p[k] }
        return e
    }

    private fun db(a: Double, b: Double) = 10 * log10(a / b)

    /** Rising zero-crossing times (interpolated), from sample [skip]. */
    private fun crossings(x: FloatArray, skip: Int): List<Double> {
        val t = ArrayList<Double>()
        for (i in skip + 1 until x.size) if (x[i - 1] < 0 && x[i] >= 0) t += i - 1 + x[i - 1] / (x[i - 1] - x[i]).toDouble()
        return t
    }

    /** Pitch of every cycle, in cents against [ref]. */
    private fun cycleCents(x: FloatArray, ref: Double, skip: Int): DoubleArray {
        val t = crossings(x, skip)
        return DoubleArray(t.size - 1) { 1200 * log2(sr / (t[it + 1] - t[it]) / ref) }
    }

    private fun pct(a: DoubleArray, q: Double): Double { val s = a.sorted(); return s[((s.size - 1) * q).toInt()] }

    @Test fun offIsBitExactAndSwitchingOffReturnsToBitExact() {
        val l = noise(sr, 0.5, 1); val r = noise(sr, 0.5, 2)
        val (ol, or) = run(l, r)
        assertArrayEquals(l, ol, 0f); assertArrayEquals(r, or, 0f)
        // On for a while, then off: once the 15 ms fade has finished it's an exact copy again.
        val fx = CharacterFx(sr)
        run(l, r, PlaceFx(Place.Radio), OldTapeFx(1f), WobbleFx(Wobble.Phaser), fx = fx)
        run(l.copyOf(4096), r.copyOf(4096), fx = fx)
        val (al, ar) = run(l, r, fx = fx)
        assertArrayEquals(l, al, 0f); assertArrayEquals(r, ar, 0f)
        println("off: bit-exact before and after use")
    }

    @Test fun telephoneKeepsOnlyThePhoneBand() {
        val x = noise(3 * sr, 0.3, 3)
        val (y, _) = run(x, x.copyOf(), PlaceFx(Place.Telephone))
        val pi = psd(x, sr / 2); val po = psd(y, sr / 2)
        val low = db(band(po, 20.0, 200.0), band(pi, 20.0, 200.0))
        val high = db(band(po, 5000.0, 20000.0), band(pi, 5000.0, 20000.0))
        val mid = db(band(po, 500.0, 3000.0), band(pi, 500.0, 3000.0))
        println("telephone: <200 Hz ${"%.1f".format(low)} dB, >5 kHz ${"%.1f".format(high)} dB, 500-3000 Hz ${"%.1f".format(mid)} dB")
        assertTrue(low <= -30); assertTrue(high <= -30); assertTrue(mid > -6)
    }

    /** Goertzel amplitude of [hz] in x[from, from + n). */
    private fun tone(x: FloatArray, hz: Double, from: Int, n: Int): Double {
        val w = 2 * PI * hz / sr
        var re = 0.0; var im = 0.0
        for (i in 0 until n) { re += x[from + i] * cos(w * i); im -= x[from + i] * sin(w * i) }
        return 2 * hypot(re, im) / n
    }

    private fun maxTone(x: FloatArray, hz: Double, from: Double, to: Double): Double {
        val win = sr / 50; var best = 0.0
        var s = (from * sr).toInt()
        while (s + win <= (to * sr).toInt()) { best = maxOf(best, tone(x, hz, s, win)); s += win / 2 }
        return best
    }

    @Test fun walkieBeepsWhenYouStopNotOnAShortPause() {
        // Talk 0.6 s, pause 0.1 s, talk 0.6 s, then stop.
        val x = FloatArray(3 * sr) { i ->
            val t = i.toDouble() / sr
            if (t < 0.6 || (t >= 0.7 && t < 1.3)) {
                var v = 0.0
                for (h in 1..6) v += sin(2 * PI * 150 * h * t) / h
                (0.3 * v / 2).toFloat()
            } else 0f
        }
        val (y, _) = run(x, x.copyOf(), PlaceFx(Place.Walkie))
        val pause = maxTone(y, 1750.0, 0.62, 0.70)
        val after = maxTone(y, 1750.0, 1.3, 3.0)
        val beep2 = maxTone(y, 2150.0, 1.3, 3.0)
        println("walkie: 1750 Hz in the pause ${"%.4f".format(pause)}, after stopping ${"%.3f".format(after)} (second tone ${"%.3f".format(beep2)})")
        assertTrue(after > 0.05); assertTrue(beep2 > 0.05); assertTrue(pause < 0.01)
        // Squelch: channel shut and silent long after the beep.
        val tailRms = sqrt((((2.5 * sr).toInt()) until 3 * sr).sumOf { y[it].toDouble() * y[it] } / (sr / 2))
        println("walkie: rms after squelch ${"%.5f".format(tailRms)}")
        assertTrue(tailRms < 0.002)
    }

    @Test fun underwaterIsMuffled() {
        val x = noise(3 * sr, 0.3, 4)
        val (y, _) = run(x, x.copyOf(), PlaceFx(Place.Underwater))
        val pi = psd(x, sr / 2); val po = psd(y, sr / 2)
        val high = db(band(po, 2000.0, 20000.0), band(pi, 2000.0, 20000.0))
        val low = db(band(po, 100.0, 500.0), band(pi, 100.0, 500.0))
        println("underwater: >2 kHz ${"%.1f".format(high)} dB, 100-500 Hz ${"%.1f".format(low)} dB")
        assertTrue(high <= -25); assertTrue(low > -6)
    }

    private fun rateKnob(hz: Double) = (ln(hz / 0.1) / ln(80.0)).toFloat()

    @Test fun tremoloDepthAndRate() {
        val x = sine(4 * sr, 1000.0, 0.5)
        val (y, _) = run(x, x.copyOf(), wobble = WobbleFx(Wobble.Tremolo, rateKnob(4.0), 0.6f, 1f))
        val win = sr / 200
        val env = DoubleArray((y.size - sr / 2) / win) { k ->
            val s = sr / 2 + k * win
            sqrt((s until s + win).sumOf { y[it].toDouble() * y[it] } / win)
        }
        val depth = 1 - pct(env, 0.02) / pct(env, 0.98)
        val mean = env.average()
        var flips = 0; var above = env[0] > mean
        for (e in env) { val a = e > mean * (if (above) 0.97 else 1.03); if (a != above) { flips++; above = a } }
        val rate = flips / 2.0 / (env.size * win.toDouble() / sr)
        println("tremolo: depth ${"%.3f".format(depth)} (want 0.6), rate ${"%.2f".format(rate)} Hz (want 4)")
        assertEquals(0.6, depth, 0.06); assertEquals(4.0, rate, 0.3)
    }

    @Test fun vibratoBendsAbout40Cents() {
        val x = sine(4 * sr, 440.0, 0.5)
        val (y, _) = run(x, x.copyOf(), wobble = WobbleFx(Wobble.Vibrato, rateKnob(5.0), 1f, 1f))
        val c = cycleCents(y, 440.0, sr)
        val half = (pct(c, 0.995) - pct(c, 0.005)) / 2
        val ctl = cycleCents(x, 440.0, sr)
        println("vibrato: ±${"%.1f".format(half)} cents (want 40); dry ±${"%.2f".format((pct(ctl, 0.995) - pct(ctl, 0.005)) / 2)}")
        assertEquals(40.0, half, 8.0)
    }

    /** Smoothed |Y/X|^2 (dB) over 300-8000 Hz on a short window: returns min - max. */
    private fun notchDepth(x: FloatArray, y: FloatArray, from: Int): Double {
        val n = 4096; val fft = Fft(n)
        val w = DoubleArray(n) { 0.5 - 0.5 * cos(2 * PI * it / n) }
        val px = DoubleArray(n / 2 + 1); val py = DoubleArray(n / 2 + 1)
        for (f in 0 until 4) {
            val s = from + f * n / 2
            for ((src, acc) in listOf(x to px, y to py)) {
                val re = DoubleArray(n) { src[s + it] * w[it] }; val im = DoubleArray(n)
                fft.transform(re, im, false)
                for (k in 0..n / 2) acc[k] += re[k] * re[k] + im[k] * im[k]
            }
        }
        val lo = (300 * n / sr); val hi = (8000 * n / sr)
        val h = (lo..hi).map { k -> val a = (k - 2..k + 2).sumOf { py[it] }; val b = (k - 2..k + 2).sumOf { px[it] }; 10 * log10(a / b) }
        return h.min() - h.max()
    }

    @Test fun flangerAndPhaserCutNotches() {
        val x = noise(2 * sr, 0.3, 5)
        val ctl = notchDepth(x, run(x).first, sr)
        val fl = notchDepth(x, run(x, wobble = WobbleFx(Wobble.Flanger, 0f, 0.6f, 1f)).first, sr)
        val ph = notchDepth(x, run(x, wobble = WobbleFx(Wobble.Phaser, 0f, 0.6f, 1f)).first, sr)
        println("notches (min-max of |H|, 300-8000 Hz): off ${"%.1f".format(ctl)} dB, flanger ${"%.1f".format(fl)} dB, phaser ${"%.1f".format(ph)} dB")
        assertTrue(ctl > -1); assertTrue(fl < -15); assertTrue(ph < -10)
    }

    @Test fun oldTapeWarblesAndHisses() {
        val x = sine(4 * sr, 1000.0, 0.5)
        val (y, _) = run(x, x.copyOf(), tape = OldTapeFx(1f, hiss = 0f, wow = 1f, saturation = 0.5f))
        val c = cycleCents(y, 1000.0, sr)
        val range = pct(c, 0.99) - pct(c, 0.01)
        val ctl = cycleCents(x, 1000.0, sr)
        val ctlRange = pct(ctl, 0.99) - pct(ctl, 0.01)
        println("old tape: pitch wander ${"%.1f".format(range)} cents peak-to-peak (dry ${"%.2f".format(ctlRange)})")
        assertTrue(range > 4); assertTrue(ctlRange < 0.5)
        val (h, _) = run(FloatArray(2 * sr), tape = OldTapeFx(1f, hiss = 1f))
        val rms = sqrt((sr until 2 * sr).sumOf { h[it].toDouble() * h[it] } / sr)
        val hissDb = 20 * log10(rms)
        val (h2, _) = run(FloatArray(2 * sr), tape = OldTapeFx(1f, hiss = 0.5f))
        val hiss2 = 20 * log10(sqrt((sr until 2 * sr).sumOf { h2[it].toDouble() * h2[it] } / sr))
        println("old tape: hiss ${"%.1f".format(hissDb)} dBFS at hiss 1, ${"%.1f".format(hiss2)} dBFS at 0.5")
        assertTrue(hissDb in -60.0..-30.0); assertTrue(hiss2 < hissDb - 3)
    }

    @Test fun nothingEverPassesFullScale() {
        val loud = listOf(sine(sr, 300.0, 1.0), noise(sr, 1.0, 6), FloatArray(sr) { if ((it / 50) % 2 == 0) 1f else -1f })
        var worst = 0f
        val cases = Place.values().filter { it != Place.Off }.map { Triple(PlaceFx(it), OldTapeFx(), WobbleFx()) } +
            listOf(Triple(PlaceFx(), OldTapeFx(1f, 1f, 1f, 1f), WobbleFx())) +
            Wobble.values().filter { it != Wobble.Off }.map { Triple(PlaceFx(), OldTapeFx(), WobbleFx(it, 0.5f, 1f, 1f)) } +
            listOf(Triple(PlaceFx(Place.Megaphone), OldTapeFx(1f, 1f, 1f, 1f), WobbleFx(Wobble.Flanger, 0.5f, 1f, 1f)))
        for ((p, t, w) in cases) for (x in loud) {
            val (a, b) = run(x, x.copyOf(), p, t, w)
            val m = maxOf(a.maxOf { abs(it) }, b.maxOf { abs(it) })
            worst = maxOf(worst, m)
            assertTrue("$p $t $w peaked at $m", m <= 1f)
        }
        println("full-scale input, every mode: worst peak ${"%.4f".format(worst)}")
    }

    @Test fun cheapEnough() {
        val l = noise(10 * sr, 0.3, 7); val r = noise(10 * sr, 0.3, 8)
        val p = PlaceFx(Place.Radio); val t = OldTapeFx(1f); val w = WobbleFx(Wobble.Flanger)
        run(l.copyOf(2 * sr), r.copyOf(2 * sr), p, t, w) // warm up the JIT
        var best = Long.MAX_VALUE
        repeat(3) {
            val t0 = System.nanoTime()
            run(l, r, p, t, w)
            best = minOf(best, System.nanoTime() - t0)
        }
        println("10 s stereo, radio + old tape + flanger: ${best / 1_000_000} ms")
        for (pl in Place.values().filter { it != Place.Off }) {
            val t0 = System.nanoTime(); run(l, r, PlaceFx(pl)); println("  ${pl.name}: ${(System.nanoTime() - t0) / 1_000_000} ms")
        }
        assertTrue(best < 300_000_000)
    }
}
