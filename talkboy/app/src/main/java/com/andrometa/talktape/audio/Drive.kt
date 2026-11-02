package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Distortion, from warm grit to fully blown-out.
 * amount 0..1 (0 = off) how hard it's pushed; tone 0..1 dark to bright; crush 0..1 digital
 * grit (fewer bits, lower sample rate); mix 0..1 dry vs distorted.
 */
data class DriveFx(val amount: Float = 0f, val tone: Float = 0.5f, val crush: Float = 0f, val mix: Float = 1f) {
    val on get() = amount > 0f
}

/**
 * Pro-style vocal distortion, per channel: tighten (120 Hz high-pass) and push the mids,
 * then an asymmetric soft clipper run at 2x the sample rate (31-tap half-band filters
 * either side) so the harmonics it makes don't fold back as harsh aliasing, then optional
 * bit / sample-rate crush, a tone low-pass, and automatic gain so turning it up makes it
 * dirtier, not louder.
 */
class Drive(private val sampleRate: Int) {
    private inner class Channel {
        val hp = Biquad().apply { highPass(sampleRate, 120.0, 0.707) }
        val mid = Biquad()
        val tone = Biquad()
        val up = HalfBand()
        val down = HalfBand()
        val dry = DoubleArray(HalfBand.DELAY + 1)
        var dryW = 0
        var hold = 0.0
        var holdLeft = 0
        fun reset() { hp.reset(); mid.reset(); tone.reset(); up.reset(); down.reset(); dry.fill(0.0); hold = 0.0; holdLeft = 0 }
    }

    private val ch = arrayOf(Channel(), Channel())
    private var inPow = 0.0
    private var outPow = 0.0
    private var makeup = 1.0
    private val follow = 1 - exp(-1.0 / (0.3 * sampleRate))
    private var setFor: DriveFx? = null
    private var drive = 1.0
    private var bias = 0.0
    private var steps = 0.0
    private var hold = 1
    private var mixNow = 0.0

    fun reset() { ch.forEach { it.reset() }; inPow = 0.0; outPow = 0.0; makeup = 1.0; mixNow = 0.0 }

    private fun setup(fx: DriveFx) {
        setFor = fx
        drive = 10.0.pow((4 + 32 * fx.amount) / 20.0)
        bias = 0.25 * fx.amount
        val bits = 16 - 12 * fx.crush
        steps = if (fx.crush > 0f) 2.0.pow(bits.toDouble() - 1) else 0.0
        hold = 1 + (7 * fx.crush * fx.crush).toInt()
        for (c in ch) {
            c.mid.peaking(sampleRate, 1500.0, 0.8, 5.0 * fx.amount)
            c.tone.lowPass(sampleRate, 2500.0 * 5.0.pow(fx.tone.toDouble()), 0.6)
        }
    }

    /** Stereo in place. Skipped entirely (bit-exact) when [fx] is off. */
    fun process(l: FloatArray, r: FloatArray, n: Int, fx: DriveFx) {
        if (!fx.on) { if (mixNow != 0.0) reset(); return }
        if (fx != setFor) setup(fx)
        val mix = fx.mix.toDouble()
        for (i in 0 until n) {
            val a = l[i].toDouble(); val b = r[i].toDouble()
            inPow += follow * ((a * a + b * b) / 2 - inPow)
            val ya = shape(ch[0], a); val yb = shape(ch[1], b)
            outPow += follow * ((ya * ya + yb * yb) / 2 - outPow)
            if (i and 15 == 0) makeup = if (outPow > 1e-12) sqrt(inPow / outPow).coerceIn(0.05, 4.0) else makeup
            mixNow += (mix - mixNow) * 0.002
            l[i] = blend(ch[0], a, ya).toFloat()
            r[i] = blend(ch[1], b, yb).toFloat()
        }
    }

    private fun blend(c: Channel, x: Double, y: Double): Double {
        // Dry is delayed to line up with the oversampling filters.
        c.dry[c.dryW] = x
        c.dryW = (c.dryW + 1) % c.dry.size
        val d = c.dry[c.dryW]
        return (d * (1 - mixNow) + y * makeup * mixNow).coerceIn(-1.0, 1.0)
    }

    private fun shape(c: Channel, x: Double): Double {
        val pre = c.mid.process(c.hp.process(x)) * drive
        // 2x: two samples per input sample through the clipper, then back down.
        val u0 = c.up.process(pre * 2); val u1 = c.up.process(0.0)
        c.down.process(clip(u0))
        var y = c.down.process(clip(u1))
        if (steps > 0) {
            if (c.holdLeft-- <= 0) { c.hold = Math.round(y * steps) / steps; c.holdLeft = hold - 1 }
            y = c.hold
        }
        return c.tone.process(y)
    }

    /** Asymmetric soft clip (tanh-like rational, cheap); the offset adds warm even harmonics. */
    private fun clip(x: Double): Double = sat(x + bias) - sat(bias)

    private fun sat(x: Double): Double {
        val v = x.coerceIn(-3.0, 3.0)
        val v2 = v * v
        return v * (27 + v2) / (27 + 9 * v2)
    }

    /** 31-tap windowed-sinc half-band low-pass at a quarter of the doubled rate. */
    private class HalfBand {
        private val buf = DoubleArray(TAPS)
        private var w = 0
        fun reset() { buf.fill(0.0); w = 0 }
        fun process(x: Double): Double {
            buf[w] = x
            var y = 0.0
            var j = w
            for (k in 0 until TAPS) { y += COEF[k] * buf[j]; j = if (j == 0) TAPS - 1 else j - 1 }
            w = (w + 1) % TAPS
            return y
        }

        companion object {
            const val TAPS = 31
            /** Output delay in input-rate samples: 15 + 15 taps at the doubled rate. */
            const val DELAY = 15
            val COEF = DoubleArray(TAPS) { k ->
                val m = k - TAPS / 2
                val sinc = if (m == 0) 0.5 else sin(PI * m / 2) / (PI * m)
                val win = 0.42 - 0.5 * cos(2 * PI * k / (TAPS - 1)) + 0.08 * cos(4 * PI * k / (TAPS - 1))
                sinc * win
            }.let { c -> val s = c.sum(); DoubleArray(TAPS) { c[it] / s } }
        }
    }
}
