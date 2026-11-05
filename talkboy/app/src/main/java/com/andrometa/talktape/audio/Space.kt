package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Everything after the voice, in studio order: twin voices, echo, reverb, then a limiter
 * so stacking them never clips. Takes mono or stereo in, always gives stereo out.
 * With none of them switched on it is a straight copy (no limiter either).
 */
class SpaceFx(private val sr: Int) {
    private val doubler = Doubler(sr)
    private val echo = Echo(sr)
    private val reverb = Reverb(sr)
    private var limEnv = 0.0
    private val release = exp(-1.0 / (0.15 * sr))

    /** The last block was silent: echoes and reverb have died away. */
    var silent = true
        private set

    fun reset() {
        doubler.reset(); echo.reset(); reverb.reset(); limEnv = 0.0; silent = true
    }

    /** [l]/[r] are one block each (the same array for mono); [out] gets them interleaved. */
    fun process(l: FloatArray, r: FloatArray, fx: Fx, out: FloatArray) {
        if (!fx.hasSpace) {
            for (i in l.indices) { out[2 * i] = l[i]; out[2 * i + 1] = r[i] }
            if (!silent) reset()
            return
        }
        val layers = fx.layers.coerceIn(0, Fx.MAX_LAYERS)
        // Detuned copies add up as power; each is panned (about half its power per side) and its
        // two crossfading taps average 3/4 power. Scale the stack back to the dry loudness.
        val stackGain = 1.0 / sqrt(1 + layers * Doubler.GAIN * Doubler.GAIN * 0.5 * 0.75)
        var peak = 0.0
        for (i in l.indices) {
            var a = l[i].toDouble(); var b = r[i].toDouble()
            if (layers > 0) {
                doubler.process(0.5 * (a + b), layers)
                a = (a + doubler.l) * stackGain; b = (b + doubler.r) * stackGain
            }
            val m = 0.5 * (a + b)
            if (fx.echo > 0f) { echo.process(m, fx.echo, fx.echoTime); a += echo.l; b += echo.r }
            if (fx.reverb > 0f) { reverb.process(m, fx.reverb); a += reverb.l; b += reverb.r }
            // Limiter: instant attack, 150 ms release, ceiling 0.9.
            limEnv = maxOf(abs(a), abs(b), limEnv * release)
            val g = if (limEnv > CEILING) CEILING / limEnv else 1.0
            a *= g; b *= g
            out[2 * i] = a.toFloat(); out[2 * i + 1] = b.toFloat()
            peak = maxOf(peak, abs(a), abs(b))
        }
        silent = peak < 3e-4 // about -70 dB
    }

    companion object { private const val CEILING = 0.9 }
}

/** Delay line with fractional reads, power-of-two sized. */
internal class Line(minSamples: Int) {
    private val buf = DoubleArray(Integer.highestOneBit(maxOf(minSamples, 2) * 2))
    private val mask = buf.size - 1
    private var w = 0

    fun reset() { buf.fill(0.0); w = 0 }
    fun write(x: Double) { buf[w] = x; w = (w + 1) and mask }

    /** Sample [d] samples behind the last write (d >= 1), linear in between. */
    fun read(d: Double): Double {
        val p = w - d
        val i = floor(p)
        val f = p - i
        return buf[i and mask] * (1 - f) + buf[(i + 1) and mask] * f
    }

    private fun floor(p: Double) = kotlin.math.floor(p).toInt()
}

/**
 * Twin voices: each layer is a copy a few cents out of tune, a few tens of milliseconds
 * late and drifting, panned left or right, like singers doubling a part. The detune is a
 * two-tap rotating delay (the classic studio "micro pitch shift"), which is clean at these
 * tiny amounts.
 */
private class Doubler(sr: Int) {
    private class Voice(cents: Double, val delay: Double, pan: Double, val lfoStep: Double, var phase: Double) {
        val rate = 1 - 2.0.pow(cents / 1200)
        val gl = cos((pan + 1) * PI / 4)
        val gr = sin((pan + 1) * PI / 4)
        var lfo = phase * 2 * PI
        var base = delay
    }

    private val win = 0.045 * sr
    private val drift = 0.0015 * sr
    private val line = Line((0.06 * sr + win + drift).toInt() + 4)
    private val voices = listOf(
        Voice(+9.0, 0.019 * sr, -0.85, 2 * PI * 0.31 / sr, 0.0),
        Voice(-11.0, 0.027 * sr, +0.85, 2 * PI * 0.23 / sr, 0.25),
        Voice(+5.0, 0.035 * sr, -0.45, 2 * PI * 0.37 / sr, 0.5),
        Voice(-6.0, 0.043 * sr, +0.45, 2 * PI * 0.19 / sr, 0.75),
    )
    private var tick = 0
    var l = 0.0; private set
    var r = 0.0; private set

    fun reset() { line.reset() }

    fun process(x: Double, n: Int) {
        line.write(x)
        l = 0.0; r = 0.0
        // The drift is a fraction of a hertz: updating it every 32 samples is inaudible and saves a sin() per sample.
        val slow = tick++ and 31 == 0
        for (v in 0 until n) {
            val vo = voices[v]
            vo.phase += vo.rate / win
            vo.phase -= kotlin.math.floor(vo.phase)
            if (slow) { vo.lfo += vo.lfoStep * 32; vo.base = vo.delay + drift * (1 + sin(vo.lfo)) }
            val p2 = if (vo.phase < 0.5) vo.phase + 0.5 else vo.phase - 0.5
            val y = (fade(vo.phase) * line.read(vo.base + vo.phase * win) + fade(p2) * line.read(vo.base + p2 * win)) * GAIN
            l += y * vo.gl; r += y * vo.gr
        }
    }

    companion object {
        const val GAIN = 0.7
        private const val TABLE = 1024
        /** sin²(πp) for p in 0..1; two taps half a cycle apart always sum to 1. */
        private val FADE = DoubleArray(TABLE + 1) { sin(PI * it / TABLE).let { s -> s * s } }
        private fun fade(p: Double): Double {
            val x = p * TABLE
            val i = x.toInt().coerceAtMost(TABLE - 1)
            val f = x - i
            return FADE[i] + (FADE[i + 1] - FADE[i]) * f
        }
    }
}

/**
 * Ping-pong echo: repeats bounce left, right, left, getting darker each time like an old
 * tape echo. Changing the time glides (and bends the pitch a little, as tape does).
 */
private class Echo(private val sr: Int) {
    private val left = Line((0.9 * sr).toInt())
    private val right = Line((0.9 * sr).toInt())
    private val damp = 1 - exp(-2 * PI * 3500 / sr)
    private var delay = -1.0
    private var lpL = 0.0
    private var lpR = 0.0
    var l = 0.0; private set
    var r = 0.0; private set

    fun reset() { left.reset(); right.reset(); lpL = 0.0; lpR = 0.0; delay = -1.0 }

    fun process(x: Double, amount: Float, time: Float) {
        val target = (0.08 + 0.72 * time) * sr
        delay = if (delay < 0) target else delay + (target - delay) * 0.0005
        val yl = left.read(delay); val yr = right.read(delay)
        val fb = 0.3 + 0.4 * amount
        lpL += damp * (x + yr * fb - lpL); left.write(lpL)
        lpR += damp * (yl * fb - lpR); right.write(lpR)
        val wet = 0.3 + 0.35 * amount
        l = yl * wet; r = yr * wet
    }
}

/**
 * Feedback delay network reverb: 8 delay lines mixed by a Householder matrix, each line
 * losing a little treble per trip (air and soft walls), lightly modulated so it never rings
 * metallic, after four all-pass diffusers that smear the voice into a smooth wash.
 * The one knob grows the room, the decay and the wet level together: closet to cathedral.
 */
private class Reverb(private val sr: Int) {
    private val n = 8
    private val baseMs = doubleArrayOf(31.7, 37.3, 41.9, 47.1, 53.3, 59.9, 67.3, 73.7)
    private val lines = Array(n) { Line((baseMs[it] * 1.4 * sr / 1000).toInt() + 64) }
    private val len = DoubleArray(n)
    private val gain = DoubleArray(n)
    private val lp = DoubleArray(n)
    private val y = DoubleArray(n)
    private val lfo = DoubleArray(n) { it * 0.7 }
    private val lfoStep = DoubleArray(n) { 2 * PI * (0.5 + 0.09 * it) / sr }
    private val diffusers = doubleArrayOf(4.77, 3.59, 12.73, 9.3).map { AllPass((it * sr / 1000).toInt(), 0.6) }
    private val pre = Line((0.04 * sr).toInt())
    private val lowCut = 1 - exp(-2 * PI * 140.0 / sr)
    private var lowState = 0.0
    private var damp = 0.0
    private var preDelay = 1.0
    private var wet = 0.0
    private var setFor = -1f
    private val mod = DoubleArray(n)
    private var tick = 0
    var l = 0.0; private set
    var r = 0.0; private set

    fun reset() {
        lines.forEach { it.reset() }; diffusers.forEach { it.reset() }; pre.reset()
        lp.fill(0.0); lowState = 0.0
    }

    private fun setup(amount: Float) {
        setFor = amount
        val size = 0.35 + 0.95 * amount
        val rt60 = 0.3 + 3.2 * amount.toDouble().pow(1.5)
        for (i in 0 until n) {
            len[i] = baseMs[i] * size * sr / 1000
            gain[i] = 10.0.pow(-3 * len[i] / (rt60 * sr))
        }
        damp = 1 - exp(-2 * PI * (7000 - 3500 * amount) / sr)
        preDelay = maxOf(1.0, (0.005 + 0.025 * amount) * sr)
        wet = 0.55 * amount.toDouble().pow(0.6)
    }

    fun process(x: Double, amount: Float) {
        if (amount != setFor) setup(amount)
        lowState += lowCut * (x - lowState)
        pre.write(x - lowState)
        var d = pre.read(preDelay)
        for (ap in diffusers) d = ap.process(d)
        // Slow wobble (under 1.2 Hz): refreshed every 32 samples, not every sample.
        if (tick++ and 31 == 0) for (i in 0 until n) { lfo[i] += lfoStep[i] * 32; mod[i] = 6 * sin(lfo[i]) }
        var sum = 0.0
        for (i in 0 until n) {
            y[i] = lines[i].read(len[i] + mod[i])
            sum += y[i]
        }
        val s = 2.0 / n * sum
        for (i in 0 until n) {
            lp[i] += damp * (y[i] - s - lp[i])
            lines[i].write((if (i % 2 == 0) d else -d) * 0.5 + gain[i] * lp[i])
        }
        l = (y[0] - y[2] + y[4] - y[6]) * 0.5 * wet
        r = (y[1] - y[3] + y[5] - y[7]) * 0.5 * wet
    }

    private class AllPass(length: Int, private val g: Double) {
        private val line = Line(length + 2)
        private val d = length.toDouble()
        fun reset() = line.reset()
        fun process(x: Double): Double {
            val delayed = line.read(d)
            val v = x - g * delayed
            line.write(v)
            return g * v + delayed
        }
    }
}
