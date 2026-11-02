package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan
import kotlin.math.tanh

/** Where the voice seems to come from. */
enum class Place { Off, Telephone, Walkie, Radio, Megaphone, Underwater }

/** [amount] 0..1: how much of the place you hear (1 = all of it). */
data class PlaceFx(val place: Place = Place.Off, val amount: Float = 1f)

enum class Wobble { Off, Tremolo, Vibrato, Flanger, Phaser }

/** Knobs 0..1. rate: 0.1..8 Hz on an exponential scale. mix: dry..all effect. */
data class WobbleFx(val mode: Wobble = Wobble.Off, val rate: Float = 0.4f, val depth: Float = 0.6f, val mix: Float = 1f)

/** Worn cassette. [amount] 0 = off; the others scale within it. */
data class OldTapeFx(val amount: Float = 0f, val hiss: Float = 0.5f, val wow: Float = 0.5f, val saturation: Float = 0.5f)

/**
 * Character effects, in order: place -> old tape -> wobble. Stereo, in place.
 * A stage that is off is skipped entirely (bit-exact passthrough); switching one on, off
 * or to another mode crossfades over 15 ms so nothing clicks.
 */
class CharacterFx(sampleRate: Int) {
    private val fs = sampleRate.toDouble()
    private val place = ChPlaceStage(fs)
    private val tape = ChTapeStage(fs)
    private val wobble = ChWobbleStage(fs)

    fun reset() { place.reset(); tape.reset(); wobble.reset() }

    fun process(l: FloatArray, r: FloatArray, n: Int, place: PlaceFx, tape: OldTapeFx, wobble: WobbleFx) {
        val a = this.place.process(l, r, n, place)
        val b = this.tape.process(l, r, n, tape)
        val c = this.wobble.process(l, r, n, wobble)
        // Safety ceiling: filters ringing after a clipper can overshoot a little. Never above 1.
        if (a || b || c) for (i in 0 until n) { l[i] = ceiling(l[i]); r[i] = ceiling(r[i]) }
    }

    private fun ceiling(x: Float): Float {
        val a = abs(x)
        if (a <= 0.9f) return x
        val y = (0.9 + 0.1 * tanh((a - 0.9) / 0.1)).toFloat().coerceAtMost(1f)
        return if (x < 0) -y else y
    }
}

// ───────────────────────── building blocks (file-private, Ch-prefixed: no clashes) ─────────────────────────

private fun coef(fs: Double, seconds: Double) = 1 - exp(-1 / (seconds * fs))

/** Rational tanh, within ~2 % and exactly ±1 beyond ±3. Plenty for saturation curves. */
private fun fastTanh(x: Double) = when {
    x > 3 -> 1.0
    x < -3 -> -1.0
    else -> x * (27 + x * x) / (27 + 9 * x * x)
}

/** Sine by table (cycles in, any value). Keeps per-sample trig out of the loops. */
private object ChSine {
    private const val N = 4096
    private val t = DoubleArray(N + 1) { kotlin.math.sin(2 * PI * it / N) }
    fun sin(cycles: Double): Double {
        var p = cycles - cycles.toLong()
        if (p < 0) p += 1.0
        val x = p * N
        val i = x.toInt().coerceAtMost(N - 1)
        return t[i] + (t[i + 1] - t[i]) * (x - i)
    }
    fun cos(cycles: Double) = sin(cycles + 0.25)
}

/** xorshift32, seeded so every run (and test) is the same. */
private class ChRng(seed: Int) {
    private var s = if (seed == 0) 0x1234567 else seed
    /** -1..1 */
    fun next(): Double { s = s xor (s shl 13); s = s xor (s ushr 17); s = s xor (s shl 5); return s / 2147483648.0 }
    /** 0..1 */
    fun unit() = 0.5 * (next() + 1)
}

/** Pink noise, Paul Kellet's refined filter, about -10 dB below full scale. */
private class ChPink(seed: Int) {
    private val rng = ChRng(seed)
    private var b0 = 0.0; private var b1 = 0.0; private var b2 = 0.0; private var b3 = 0.0
    private var b4 = 0.0; private var b5 = 0.0; private var b6 = 0.0
    fun reset() { b0 = 0.0; b1 = 0.0; b2 = 0.0; b3 = 0.0; b4 = 0.0; b5 = 0.0; b6 = 0.0 }
    fun next(): Double {
        val w = rng.next()
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980
        val p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
        b6 = w * 0.115926
        return p * 0.11
    }
}

/** RBJ-cookbook biquad, transposed direct form II, double precision. */
private class ChBiquad {
    private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0; private var a1 = 0.0; private var a2 = 0.0
    private var z1 = 0.0; private var z2 = 0.0

    fun reset() { z1 = 0.0; z2 = 0.0 }

    fun process(x: Double): Double {
        val y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }

    private fun set(nb0: Double, nb1: Double, nb2: Double, a0: Double, na1: Double, na2: Double): ChBiquad {
        b0 = nb0 / a0; b1 = nb1 / a0; b2 = nb2 / a0; a1 = na1 / a0; a2 = na2 / a0
        return this
    }

    fun lowpass(fs: Double, f: Double, q: Double): ChBiquad {
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        return set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al)
    }

    fun highpass(fs: Double, f: Double, q: Double): ChBiquad {
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        return set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
    }

    fun peak(fs: Double, f: Double, q: Double, db: Double): ChBiquad {
        val a = 10.0.pow(db / 40); val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        return set(1 + al * a, -2 * c, 1 - al * a, 1 + al / a, -2 * c, 1 - al / a)
    }

    fun highShelf(fs: Double, f: Double, db: Double): ChBiquad {
        val a = 10.0.pow(db / 40); val w = 2 * PI * f / fs; val c = cos(w)
        val al = sin(w) / 2 * sqrt(2.0) // shelf slope S = 1
        val sa = 2 * sqrt(a) * al
        return set(
            a * ((a + 1) + (a - 1) * c + sa), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - sa),
            (a + 1) - (a - 1) * c + sa, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - sa,
        )
    }
}

/** Butterworth Q of section k (0-based) in a cascade of order/2 biquads. */
private fun butterQ(k: Int, order: Int) = 1 / (2 * cos((2 * k + 1) * PI / (2 * order)))

private fun Array<ChBiquad>.run(x: Double): Double {
    var y = x
    for (b in this) y = b.process(y)
    return y
}

/**
 * 2x oversampled waveshaper: 31-tap Blackman half-band up, shape at 88.2 kHz, 31-tap down.
 * Keeps the harmonics a clipper makes from folding back down as inharmonic grit.
 * Every shape has unity gain for small signals. Latency: 16 samples.
 */
private class ChOs2x {
    private val x = DoubleArray(32); private var xi = 0
    private val ze = DoubleArray(32); private val zo = DoubleArray(32); private var zi = 0

    fun reset() { x.fill(0.0); ze.fill(0.0); zo.fill(0.0) }

    fun process(input: Double, kind: Int, drive: Double): Double {
        xi = (xi + 1) and 31; x[xi] = input
        val e = x[(xi - 8) and 31]
        var o = 0.0
        for (j in 0 until 16) o += UP[j] * x[(xi - j) and 31]
        zi = (zi + 1) and 31
        ze[zi] = shape(e, kind, drive); zo[zi] = shape(o, kind, drive)
        var y = 0.5 * ze[(zi - 8) and 31]
        for (k in 1..16) y += DOWN[k] * zo[(zi - k) and 31]
        return y
    }

    companion object {
        const val SOFT = 0  // tanh: smooth, symmetric; max 1/drive
        const val TUBE = 1  // biased tanh: warm, asymmetric (even harmonics)
        const val HARD = 2  // cubic soft-knee clip: firm ceiling at (2/3)/drive

        private fun h(n: Int): Double {
            val sinc = sin(PI * n / 2) / (PI * n / 2)
            val w = 0.42 + 0.5 * cos(PI * n / 16) + 0.08 * cos(2 * PI * n / 16)
            return 0.5 * sinc * w
        }
        private val odd = (-15..15 step 2).sumOf { h(it) }
        /** Odd taps of the half-band, normalised so they sum to exactly 1/2 (unity DC). */
        private fun hn(n: Int) = h(n) * 0.5 / odd
        private val UP = DoubleArray(16) { 2 * hn(2 * it - 15) }
        private val DOWN = DoubleArray(17) { if (it == 0) 0.0 else hn(2 * it - 17) }

        fun shape(v: Double, kind: Int, d: Double): Double = when (kind) {
            TUBE -> (fastTanh(d * (v + 0.25)) - fastTanh(d * 0.25)) / d
            HARD -> {
                val u = d * v
                (if (u >= 1) 2.0 / 3 else if (u <= -1) -2.0 / 3 else u - u * u * u / 3) / d
            }
            else -> fastTanh(d * v) / d
        }
    }
}

/** Feed-forward compressor: peak detector, gain computed every 8 samples, smoothed per sample. */
private class ChComp(fs: Double, private val thrDb: Double, private val ratio: Double, attMs: Double, relMs: Double, private val makeup: Double) {
    private val att = coef(fs, attMs / 1000)
    private val rel = coef(fs, relMs / 1000)
    private val gc = coef(fs, 0.0015)
    private var env = 0.0; private var target = 1.0; private var gain = 1.0; private var k = 0

    fun reset() { env = 0.0; target = 1.0; gain = 1.0; k = 0 }

    fun process(x: Double): Double {
        val a = abs(x)
        env += (if (a > env) att else rel) * (a - env)
        if (k++ and 7 == 0) {
            val over = 20 * log10(env + 1e-9) - thrDb
            target = if (over > 0) 10.0.pow(-over * (1 - 1 / ratio) / 20) else 1.0
        }
        gain += gc * (target - gain)
        return x * gain * makeup
    }
}

/** Power-of-two delay line with 4-point Hermite reads (cleaner than linear when modulated). */
private class ChCubicLine(size: Int) {
    private val buf = DoubleArray(size)
    private val mask = size - 1
    private var w = 0

    fun reset() { buf.fill(0.0); w = 0 }
    fun write(x: Double) { buf[w] = x; w = (w + 1) and mask }

    /** [d] samples behind the last write; d >= 2. */
    fun read(d: Double): Double {
        val p = (w - 1) - d
        val fl = floor(p)
        val i = fl.toInt(); val f = p - fl
        val y0 = buf[(i - 1) and mask]; val y1 = buf[i and mask]
        val y2 = buf[(i + 1) and mask]; val y3 = buf[(i + 2) and mask]
        val c1 = 0.5 * (y2 - y0)
        val c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
        val c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
        return ((c3 * f + c2) * f + c1) * f + y1
    }
}

// ───────────────────────── place ─────────────────────────

private class ChPlaceStage(private val fs: Double) {
    private val filters = ArrayList<ChBiquad>()
    private fun bq() = ChBiquad().also { filters += it }
    private fun butter(f: Double, order: Int, high: Boolean) = Array(order / 2) { k ->
        bq().let { if (high) it.highpass(fs, f, butterQ(k, order)) else it.lowpass(fs, f, butterQ(k, order)) }
    }

    private var cur = Place.Off
    private var v = 0.0
    private val step = 1 / (0.015 * fs)
    private var amt = 1.0
    private val amtC = coef(fs, 0.02)
    // The dry path waits out the oversampler's 16 samples so blending doesn't comb-filter.
    private val dryL = DoubleArray(32); private val dryR = DoubleArray(32); private var di = 0
    private val rng = ChRng(0x2F6E2B1)

    // Telephone: band-limit last, so nothing the saturator adds escapes 300-3400 Hz.
    private val telPre = bq().highpass(fs, 150.0, 0.707)
    private val telComp = ChComp(fs, -26.0, 3.0, 5.0, 120.0, 1.6)
    private val telSat = ChOs2x()
    private val telHp = butter(320.0, 8, true)
    private val telLp = butter(3400.0, 8, false)

    // Walkie-talkie.
    private val wkHp = butter(500.0, 4, true)
    private val wkComp = ChComp(fs, -36.0, 8.0, 1.0, 80.0, 10.0)
    private val wkClip = ChOs2x()
    private val wkLp = butter(2800.0, 4, false)
    private val wkHp2 = butter(400.0, 2, true)
    private val wkAtt = coef(fs, 0.001)
    private val wkRel = coef(fs, 0.06)
    private val wkGateC = coef(fs, 0.003)
    private val wkCloseAfter = (0.25 * fs).toInt()
    private val wkBurstLen = (0.06 * fs).toInt()
    private val wkBeepLen = (0.12 * fs).toInt()
    private val wkTailLen = (0.15 * fs).toInt()
    private val wkFade = 0.003 * fs
    private var wkEnv = 0.0; private var wkOpen = false; private var wkQuiet = 0; private var wkGate = 0.0
    private var wkBurst = 0; private var wkBeep = -1; private var wkTail = 0; private var wkPh = 0.0

    // Old AM radio.
    private val rdHp = butter(200.0, 4, true)
    private val rdComp = ChComp(fs, -20.0, 2.5, 8.0, 150.0, 1.5)
    private val rdSat = ChOs2x()
    private val rdLp = butter(4500.0, 4, false)
    private val rdHp2 = butter(180.0, 2, true)
    private var rdClick = 0; private var rdClickAmp = 0.0; private var rdClickDecay = 1.0
    private var rdHum = 0.0

    // Megaphone.
    private val mgHp = butter(500.0, 4, true)
    private val mgPk1 = bq().peak(fs, 1200.0, 2.5, 8.0)
    private val mgPk2 = bq().peak(fs, 2600.0, 3.0, 6.0)
    private val mgClip = ChOs2x()
    private val mgLp = butter(4000.0, 4, false)
    private val mgHp2 = butter(450.0, 2, true)
    private val mgRing = DoubleArray(1024); private var mgW = 0
    private val mgComb = (0.0013 * fs).toInt()
    private val mgSlap = (0.009 * fs).toInt()

    // Underwater.
    private val uwLp = Array(4) { bq() }
    private var uwPh = 0.0; private var uwCount = 0
    private val uwL = ChCubicLine(2048); private val uwR = ChCubicLine(2048)
    private var uwChPh = 0.0
    private val bAge = IntArray(4) { -1 }; private val bLen = IntArray(4)
    private val bF = DoubleArray(4); private val bAmp = DoubleArray(4); private val bPh = DoubleArray(4)

    fun reset() {
        cur = Place.Off; v = 0.0
        dryL.fill(0.0); dryR.fill(0.0)
        resetState()
    }

    private fun resetState() {
        filters.forEach { it.reset() }
        telComp.reset(); telSat.reset(); wkComp.reset(); wkClip.reset(); rdComp.reset(); rdSat.reset(); mgClip.reset()
        wkEnv = 0.0; wkOpen = false; wkQuiet = 0; wkGate = 0.0; wkBurst = 0; wkBeep = -1; wkTail = 0
        rdClick = 0; mgRing.fill(0.0); uwL.reset(); uwR.reset(); bAge.fill(-1); uwCount = 0
    }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: PlaceFx): Boolean {
        val want = if (fx.amount > 0f) fx.place else Place.Off
        if (cur == Place.Off && want == Place.Off && v == 0.0) return false
        val target = fx.amount.toDouble().coerceIn(0.0, 1.0)
        for (i in 0 until n) {
            if (cur != want) {
                v -= step
                if (v <= 0) { v = 0.0; cur = want; resetState(); amt = target }
            } else if (v < 1) v = minOf(1.0, v + step)
            val xl = l[i].toDouble(); val xr = r[i].toDouble()
            di = (di + 1) and 31; dryL[di] = xl; dryR[di] = xr
            if (cur == Place.Off) continue
            amt += amtC * (target - amt)
            val m = 0.5 * (xl + xr)
            var wl: Double
            var wr: Double
            when (cur) {
                Place.Telephone -> { wl = telephone(m); wr = wl }
                Place.Walkie -> { wl = walkie(m); wr = wl }
                Place.Radio -> { wl = radio(m); wr = wl }
                Place.Megaphone -> { wl = megaphone(m); wr = wl }
                else -> { underwater(m); wl = uwOutL; wr = uwOutR }
            }
            val dl = dryL[(di - 16) and 31]; val dr = dryR[(di - 16) and 31]
            val sl = dl + (wl - dl) * amt
            val sr = dr + (wr - dr) * amt
            l[i] = (xl + (sl - xl) * v).toFloat()
            r[i] = (xr + (sr - xr) * v).toFloat()
        }
        return true
    }

    private fun telephone(m: Double): Double {
        var s = telComp.process(telPre.process(m))
        s = telSat.process(s, ChOs2x.SOFT, 1.6) * 1.5
        s += 0.0025 * rng.next() // line noise, band-limited with the voice below
        return telLp.run(telHp.run(s)) * 1.3
    }

    private fun walkie(m: Double): Double {
        val a = abs(m)
        wkEnv += (if (a > wkEnv) wkAtt else wkRel) * (a - wkEnv)
        if (!wkOpen) {
            if (wkEnv > 0.025) { wkOpen = true; wkQuiet = 0; wkBurst = wkBurstLen; wkBeep = -1; wkTail = 0 }
        } else if (wkEnv < 0.01) {
            // Only a real stop (a quarter second of quiet) closes the channel: no beep on every breath.
            if (++wkQuiet > wkCloseAfter) { wkOpen = false; wkBeep = 0; wkPh = 0.0 }
        } else wkQuiet = 0
        wkGate += wkGateC * ((if (wkOpen) 1.0 else 0.0) - wkGate)

        var s = wkComp.process(wkHp.run(m))
        s = wkClip.process(s, ChOs2x.HARD, 2.5) * 3.4 * wkGate
        s += 0.012 * rng.next() * wkGate // carrier hiss while the channel is open
        if (wkBurst > 0) { s += 0.15 * rng.next() * wkBurst / wkBurstLen; wkBurst-- }
        if (wkBeep >= 0) {
            // Roger beep: two tones, each faded in and out over 3 ms.
            val half = wkBeepLen / 2
            val tp = wkBeep % half
            val e = minOf(1.0, tp / wkFade, (half - tp) / wkFade)
            wkPh += (if (wkBeep < half) BEEP1 else BEEP2) / fs
            if (wkPh >= 1) wkPh -= 1.0
            s += 0.28 * e * ChSine.sin(wkPh)
            if (++wkBeep >= wkBeepLen) { wkBeep = -1; wkTail = wkTailLen }
        } else if (wkTail > 0) {
            val t = wkTail.toDouble() / wkTailLen
            s += 0.18 * rng.next() * t * t
            wkTail--
        }
        return wkHp2.run(wkLp.run(s))
    }

    private fun radio(m: Double): Double {
        var s = rdComp.process(rdHp.run(m))
        s = rdSat.process(s, ChOs2x.TUBE, 2.2) * 1.3
        if (rdClick <= 0 && rng.unit() < 7 / fs) {
            rdClick = ((0.0005 + 0.0025 * rng.unit()) * fs).toInt().coerceAtLeast(4)
            rdClickAmp = 0.03 + 0.1 * rng.unit()
            rdClickDecay = exp(-5.0 / rdClick)
        }
        if (rdClick > 0) { s += rdClickAmp * rng.next(); rdClickAmp *= rdClickDecay; rdClick-- }
        s = rdHp2.run(rdLp.run(s))
        // Mains hum from the set itself, so it sits outside the radio band.
        rdHum += 60 / fs
        if (rdHum >= 1) rdHum -= 1.0
        return s + 0.003 * ChSine.sin(rdHum) + 0.0018 * ChSine.sin(2 * rdHum) + 0.0012 * ChSine.sin(3 * rdHum)
    }

    private fun megaphone(m: Double): Double {
        var s = mgPk2.process(mgPk1.process(mgHp.run(m)))
        s = mgClip.process(s, ChOs2x.HARD, 3.0) * 3.9
        // Tiny metal horn: a 1.3 ms feedback comb, then a 9 ms slap off the bell.
        val c = s + 0.35 * mgRing[(mgW - mgComb) and 1023]
        mgW = (mgW + 1) and 1023
        mgRing[mgW] = c
        val out = 0.7 * c + 0.22 * mgRing[(mgW - mgSlap) and 1023]
        return mgHp2.run(mgLp.run(out)) * 0.8
    }

    private var uwOutL = 0.0
    private var uwOutR = 0.0

    private fun underwater(m: Double) {
        if (uwCount++ and 31 == 0) {
            // The muffling breathes slowly (0.23 Hz) around 650 Hz; 8th-order, so highs are gone.
            uwPh += 32 * 0.23 / fs
            if (uwPh >= 1) uwPh -= 1.0
            val fc = 650 * (1 + 0.18 * ChSine.sin(uwPh))
            for (k in 0 until 4) uwLp[k].lowpass(fs, fc, butterQ(k, 8))
        }
        var s = uwLp.run(m) * 1.25
        // Bubbles: short rising chirps (Minnaert-ish), a few per second.
        if (rng.unit() < 1.2 / fs) {
            val k = bAge.indexOfFirst { it < 0 }
            if (k >= 0) {
                bAge[k] = 0; bLen[k] = ((0.04 + 0.05 * rng.unit()) * fs).toInt()
                bF[k] = 350 + 350 * rng.unit(); bAmp[k] = 0.04 + 0.08 * rng.unit(); bPh[k] = 0.0
            }
        }
        for (k in 0 until 4) {
            if (bAge[k] < 0) continue
            val t = bAge[k].toDouble() / bLen[k]
            bPh[k] += bF[k] * (1 + 0.6 * t) / fs
            if (bPh[k] >= 1) bPh[k] -= 1.0
            val env = minOf(1.0, bAge[k] / (0.002 * fs)) * exp(-bAge[k] / (0.025 * fs))
            s += bAmp[k] * env * ChSine.sin(bPh[k])
            if (++bAge[k] >= bLen[k]) bAge[k] = -1
        }
        // Slow, slightly different drift left and right: the water wobbles the pitch.
        uwChPh += 0.7 / fs
        if (uwChPh >= 1) uwChPh -= 1.0
        uwL.write(s); uwR.write(s)
        uwOutL = uwL.read(441 + 110 * ChSine.sin(uwChPh))
        uwOutR = uwR.read(441 + 110 * ChSine.sin(uwChPh + 0.5))
    }

    companion object {
        private const val BEEP1 = 1750.0
        private const val BEEP2 = 2150.0
    }
}

// ───────────────────────── old tape ─────────────────────────

private class ChTapeStage(private val fs: Double) {
    private var on = false
    private var v = 0.0
    private val step = 1 / (0.015 * fs)
    private val pc = coef(fs, 0.05)
    private var amt = 0.0; private var wowK = 0.0; private var hissK = 0.0; private var satK = 0.0
    private val lineL = ChCubicLine(1024); private val lineR = ChCubicLine(1024)
    private val preL = ChBiquad().highShelf(fs, 3000.0, 6.0); private val preR = ChBiquad().highShelf(fs, 3000.0, 6.0)
    private val deL = ChBiquad().highShelf(fs, 3000.0, -6.0); private val deR = ChBiquad().highShelf(fs, 3000.0, -6.0)
    private val headL = ChBiquad(); private val headR = ChBiquad()
    private val bumpL = ChBiquad(); private val bumpR = ChBiquad()
    private val osL = ChOs2x(); private val osR = ChOs2x()
    private val pinkL = ChPink(0x51A7); private val pinkR = ChPink(0x7E3B)
    private val rng = ChRng(0x6D2B79F)
    private val flutC = coef(fs, 1 / (2 * PI * 8))
    private val dropC = coef(fs, 0.006)
    private var wowPh = 0.0; private var flutPh = 0.0; private var flutNoise = 0.0
    private var drop = 0; private var dropGain = 1.0
    private var count = 0

    fun reset() {
        on = false; v = 0.0
        resetState()
    }

    private fun resetState() {
        lineL.reset(); lineR.reset()
        for (b in listOf(preL, preR, deL, deR, headL, headR, bumpL, bumpR)) b.reset()
        osL.reset(); osR.reset(); pinkL.reset(); pinkR.reset()
        drop = 0; dropGain = 1.0; count = 0; flutNoise = 0.0
    }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: OldTapeFx): Boolean {
        val want = fx.amount > 0f
        if (!on && !want && v == 0.0) return false
        val tAmt = fx.amount.toDouble().coerceIn(0.0, 1.0)
        for (i in 0 until n) {
            if (on != want) {
                v -= step
                if (v <= 0) {
                    v = 0.0; on = want; resetState()
                    amt = tAmt; wowK = fx.wow.toDouble(); hissK = fx.hiss.toDouble(); satK = fx.saturation.toDouble()
                }
            } else if (v < 1) v = minOf(1.0, v + step)
            if (!on) continue
            amt += pc * (tAmt - amt); wowK += pc * (fx.wow - wowK)
            hissK += pc * (fx.hiss - hissK); satK += pc * (fx.saturation - satK)
            if (count++ and 63 == 0) {
                // Worn heads lose treble (14 kHz down to 9 kHz) and gain a little low bump.
                val fc = 14000 - 5000 * amt
                headL.lowpass(fs, fc, 0.6); headR.lowpass(fs, fc, 0.6)
                bumpL.peak(fs, 80.0, 1.0, 1.5 * amt); bumpR.peak(fs, 80.0, 1.0, 1.5 * amt)
            }
            // Wow (slow capstan wander) + flutter (fast, a bit random), as a moving playback head.
            wowPh += 0.5 / fs
            if (wowPh >= 1) wowPh -= 1.0
            flutPh += 7 / fs
            if (flutPh >= 1) flutPh -= 1.0
            flutNoise += flutC * (rng.next() - flutNoise)
            val wowD = 90 * amt * wowK
            val flD = 3 * amt * wowK
            val d = 300 + wowD * ChSine.sin(wowPh) + flD * (0.7 * ChSine.sin(flutPh) + 2.5 * flutNoise)
            // Rare dropouts on a really worn tape.
            if (drop <= 0 && amt > 0.6 && rng.unit() < (amt - 0.6) * 0.25 / fs) drop = ((0.03 + 0.05 * rng.unit()) * fs).toInt()
            dropGain += dropC * ((if (drop-- > 0) 0.3 else 1.0) - dropGain)
            val drive = 1 + 1.5 * satK * amt
            val hiss = 0.04 * (hissK * amt).pow(1.5)
            val xl = l[i].toDouble(); val xr = r[i].toDouble()
            lineL.write(xl); lineR.write(xr)
            val yl = tape(lineL.read(d), preL, osL, deL, headL, bumpL, drive) * dropGain + hiss * pinkL.next()
            val yr = tape(lineR.read(d), preR, osR, deR, headR, bumpR, drive) * dropGain + hiss * pinkR.next()
            l[i] = (xl + (yl - xl) * v).toFloat()
            r[i] = (xr + (yr - xr) * v).toFloat()
        }
        return true
    }

    /** Record pre-emphasis, magnetic saturation, playback de-emphasis, head loss. */
    private fun tape(x: Double, pre: ChBiquad, os: ChOs2x, de: ChBiquad, head: ChBiquad, bump: ChBiquad, drive: Double) =
        bump.process(head.process(de.process(os.process(pre.process(x), ChOs2x.SOFT, drive))))
}

// ───────────────────────── wobble ─────────────────────────

private class ChWobbleStage(private val fs: Double) {
    private var cur = Wobble.Off
    private var v = 0.0
    private val step = 1 / (0.015 * fs)
    private val pc = coef(fs, 0.03)
    private val pc16 = coef(fs / 16, 0.05)
    private val slow16 = coef(fs / 16, 0.2)
    private var logHz = ln(1.0); private var hz = 1.0
    private var depth = 0.0; private var mix = 0.0
    private var ph = 0.0
    private var count = 0
    private val lineL = ChCubicLine(4096); private val lineR = ChCubicLine(4096)
    private var vibD = 0.0
    private val apL = DoubleArray(6); private val apR = DoubleArray(6)
    private var fbL = 0.0; private var fbR = 0.0
    private var aL = 0.0; private var aR = 0.0; private var daL = 0.0; private var daR = 0.0

    fun reset() { cur = Wobble.Off; v = 0.0; resetState() }

    private fun resetState() {
        lineL.reset(); lineR.reset(); apL.fill(0.0); apR.fill(0.0); fbL = 0.0; fbR = 0.0; count = 0; vibD = -1.0
    }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: WobbleFx): Boolean {
        val want = if (fx.mix > 0f) fx.mode else Wobble.Off
        if (cur == Wobble.Off && want == Wobble.Off && v == 0.0) return false
        val tLog = ln(0.1 * 80.0.pow(fx.rate.toDouble().coerceIn(0.0, 1.0)))
        val tDepth = fx.depth.toDouble().coerceIn(0.0, 1.0)
        val tMix = fx.mix.toDouble().coerceIn(0.0, 1.0)
        for (i in 0 until n) {
            if (cur != want) {
                v -= step
                if (v <= 0) { v = 0.0; cur = want; resetState(); logHz = tLog; hz = exp(tLog); depth = tDepth; mix = tMix }
            } else if (v < 1) v = minOf(1.0, v + step)
            if (cur == Wobble.Off) continue
            depth += pc * (tDepth - depth); mix += pc * (tMix - mix)
            if (count++ and 15 == 0) {
                logHz += pc16 * (tLog - logHz)
                hz = exp(logHz)
                when (cur) {
                    Wobble.Vibrato -> {
                        // Up to ±40 cents at full depth, whatever the rate: depth of delay sweep = cents / speed.
                        val dt = (depth * 0.0234 * fs / (2 * PI * hz)).coerceAtMost(1500.0)
                        vibD = if (vibD < 0) dt else vibD + slow16 * (dt - vibD)
                    }
                    Wobble.Phaser -> {
                        // Next coefficients 16 samples ahead, glided to in between (no zipper).
                        val nl = apCoef(ph + 16 * hz / fs); val nr = apCoef(ph + 0.25 + 16 * hz / fs)
                        daL = (nl - aL) / 16; daR = (nr - aR) / 16
                    }
                    else -> {}
                }
            }
            ph += hz / fs
            if (ph >= 1) ph -= 1.0
            val xl = l[i].toDouble(); val xr = r[i].toDouble()
            var yl: Double; var yr: Double
            when (cur) {
                Wobble.Tremolo -> {
                    yl = xl * (1 - mix * depth * (0.5 - 0.5 * ChSine.cos(ph)))
                    yr = xr * (1 - mix * depth * (0.5 - 0.5 * ChSine.cos(ph + 0.25)))
                }
                Wobble.Vibrato -> {
                    val d = vibD + 3 + vibD * ChSine.sin(ph)
                    lineL.write(xl); lineR.write(xr)
                    yl = xl + (lineL.read(d) - xl) * mix
                    yr = xr + (lineR.read(d) - xr) * mix
                }
                Wobble.Flanger -> {
                    // 0.5..6 ms sweep, 50 % feedback; scaled so the comb's peaks sit at unity.
                    val span = 243 * depth
                    val dl = 22 + span * (0.5 - 0.5 * ChSine.cos(ph))
                    val dr = 22 + span * (0.5 - 0.5 * ChSine.cos(ph + 0.25))
                    val wl = lineL.read(dl); val wr = lineR.read(dr)
                    lineL.write(xl + FLANGE_FB * wl); lineR.write(xr + FLANGE_FB * wr)
                    yl = xl + ((xl + wl) * FLANGE_NORM - xl) * mix
                    yr = xr + ((xr + wr) * FLANGE_NORM - xr) * mix
                }
                else -> {
                    aL += daL; aR += daR
                    var u = xl + PHASE_FB * fbL
                    for (k in 0 until 6) { val y = aL * u + apL[k]; apL[k] = u - aL * y; u = y }
                    fbL = u
                    yl = xl + ((xl + u) * PHASE_NORM - xl) * mix
                    u = xr + PHASE_FB * fbR
                    for (k in 0 until 6) { val y = aR * u + apR[k]; apR[k] = u - aR * y; u = y }
                    fbR = u
                    yr = xr + ((xr + u) * PHASE_NORM - xr) * mix
                }
            }
            l[i] = (xl + (yl - xl) * v).toFloat()
            r[i] = (xr + (yr - xr) * v).toFloat()
        }
        return true
    }

    /** All-pass coefficient for the sweep: 200 Hz up to 200 * 2^(4 * depth) Hz. */
    private fun apCoef(p: Double): Double {
        val f = 200 * 2.0.pow(4 * depth * (0.5 - 0.5 * ChSine.cos(p)))
        val t = tan(PI * f / fs)
        return (t - 1) / (t + 1)
    }

    companion object {
        private const val FLANGE_FB = 0.5
        private const val FLANGE_NORM = (1 - FLANGE_FB) / (2 - FLANGE_FB)
        private const val PHASE_FB = 0.4
        private const val PHASE_NORM = (1 - PHASE_FB) / (2 - PHASE_FB)
    }
}
