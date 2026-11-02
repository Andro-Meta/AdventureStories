package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/** Where the voice travels around your head (headphones). */
enum class Fly { Off, Circle, SideToSide, FlyBy, Overhead }

/** speed 0..1 (slow drift to fast whizz), distance 0..1 (right by your ear to across the room). */
data class FlyFx(val mode: Fly = Fly.Off, val speed: Float = 0.4f, val distance: Float = 0.4f)

/**
 * Binaural motion from a spherical-head model (Brown & Duda 1998).
 *
 * Each ear reads the source from one delay line: propagation delay (distance / speed of
 * sound, which is the Doppler for free when the distance changes) plus that ear's
 * travel time round the head (Woodworth). Each ear then gets the head-shadow one-pole /
 * one-zero filter for its angle, a darkening when the source is behind or far away
 * (air absorption), and in Overhead mode a pinna-like notch that rises with elevation.
 * A handful of early reflections add depth. Geometry is worked out every [BLOCK] samples
 * and every parameter is interpolated per sample, so nothing zips or clicks.
 */
class FlyAround(sampleRate: Int) {
    private val sr = sampleRate.toDouble()
    private val ring = HermiteRing((0.25 * sampleRate).toInt())

    private var phase = 0.0
    private var count = 0
    private var started = false

    // Per ear (0 = left, 1 = right): previous and next geometry values, interpolated across a block.
    private val dl0 = DoubleArray(2); private val dl1 = DoubleArray(2)
    private val b00 = DoubleArray(2); private val b01 = DoubleArray(2)
    private val b10 = DoubleArray(2); private val b11 = DoubleArray(2)
    private val a10 = DoubleArray(2); private val a11 = DoubleArray(2)
    private var dark0 = 1.0; private var dark1 = 1.0
    private var gain0 = 1.0; private var gain1 = 1.0
    private var send0 = 0.0; private var send1 = 0.0
    private var prop0 = 2.0; private var prop1 = 2.0

    // Filter states.
    private val sx = DoubleArray(2); private val sy = DoubleArray(2)
    private val dk = DoubleArray(2)
    private val roomLp = DoubleArray(2)
    private val nx1 = DoubleArray(2); private val nx2 = DoubleArray(2)
    private val ny1 = DoubleArray(2); private val ny2 = DoubleArray(2)
    private var notch = false
    private var nb0 = 1.0; private var nb1 = 0.0; private var nb2 = 0.0; private var na1 = 0.0; private var na2 = 0.0
    private val roomCoef = 1 - exp(-2 * PI * 5000 / sr)

    /** Test hook: pins the source at this azimuth (radians, 0 = front, +pi/2 = right), level with the ears. */
    internal var fixedAzimuth = Double.NaN

    private var dirX = 0.0; private var dirY = 1.0; private var dirZ = 0.0; private var dist = 1.0

    fun reset() {
        ring.reset(); phase = 0.0; count = 0; started = false
        sx.fill(0.0); sy.fill(0.0); dk.fill(0.0); roomLp.fill(0.0)
        nx1.fill(0.0); nx2.fill(0.0); ny1.fill(0.0); ny2.fill(0.0)
    }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: FlyFx) {
        if (fx.mode == Fly.Off) return
        for (i in 0 until n) {
            if (count == 0) nextBlock(fx)
            val t = (count + 1).toDouble() / BLOCK
            count = (count + 1) % BLOCK

            ring.write(0.5 * (l[i] + r[i]))

            val dark = dark0 + (dark1 - dark0) * t
            val gain = gain0 + (gain1 - gain0) * t
            val prop = prop0 + (prop1 - prop0) * t
            val send = send0 + (send1 - send0) * t
            var outL = 0.0; var outR = 0.0
            for (e in 0..1) {
                val x = ring.read(dl0[e] + (dl1[e] - dl0[e]) * t)
                // Head shadow.
                val b0 = b00[e] + (b01[e] - b00[e]) * t
                val b1 = b10[e] + (b11[e] - b10[e]) * t
                val a1 = a10[e] + (a11[e] - a10[e]) * t
                val y = b0 * x + b1 * sx[e] - a1 * sy[e]
                sx[e] = x; sy[e] = y
                // Behind / far away: darker.
                dk[e] += dark * (y - dk[e])
                var v = dk[e]
                if (notch) {
                    val o = nb0 * v + nb1 * nx1[e] + nb2 * nx2[e] - na1 * ny1[e] - na2 * ny2[e]
                    nx2[e] = nx1[e]; nx1[e] = v; ny2[e] = ny1[e]; ny1[e] = o
                    v = o
                }
                // Early reflections, the left ear's set and the right's interleaved in time.
                var room = 0.0
                for (k in 0 until TAPS) room += TAP_GAIN[k] * ring.readLinear(prop + TAP_MS[e][k] * sr / 1000)
                roomLp[e] += roomCoef * (room - roomLp[e])
                val s = v * gain + roomLp[e] * send
                if (e == 0) outL = s else outR = s
            }
            l[i] = safe(outL)
            r[i] = safe(outR)
        }
    }

    /** Works out where the source will be at the end of the next block and the ear settings for it. */
    private fun nextBlock(fx: FlyFx) {
        geometry(fx)
        phase += rate(fx) * BLOCK / sr
        phase -= kotlin.math.floor(phase)

        for (e in 0..1) {
            dl0[e] = dl1[e]; b00[e] = b01[e]; b10[e] = b11[e]; a10[e] = a11[e]
        }
        dark0 = dark1; gain0 = gain1; send0 = send1; prop0 = prop1

        val propS = dist / C * sr
        prop1 = GUARD + propS
        for (e in 0..1) {
            val axis = if (e == 0) -1.0 else 1.0
            val theta = acos((dirX * axis).coerceIn(-1.0, 1.0))
            // Woodworth / Brown-Duda ear delay, shifted so the nearer ear is 0.
            val earS = if (theta < PI / 2) A_C * (1 - cos(theta)) else A_C * (theta - PI / 2 + 1)
            dl1[e] = GUARD + propS + earS * sr
            // Head shadow: high shelf of +6 dB facing the ear to about -20 dB on the far side.
            val alpha = (1 + ALPHA_MIN / 2) + (1 - ALPHA_MIN / 2) * cos(theta / THETA_MIN * PI)
            val k = 2 * sr
            b01[e] = (alpha * k + BETA) / (k + BETA)
            b11[e] = (BETA - alpha * k) / (k + BETA)
            a11[e] = (BETA - k) / (k + BETA)
        }
        val fcBack = 18000 - 11000 * maxOf(0.0, -dirY)
        val fcAir = 20000 / (1 + dist / 12)
        dark1 = 1 - exp(-2 * PI * minOf(fcBack, fcAir) / sr)
        gain1 = (1 / (1 + 0.35 * (dist - 0.6))).coerceIn(0.02, 1.2)
        send1 = 0.10 + 0.25 * fx.distance + 0.15 * minOf(1.0, dist / 20)

        notch = fx.mode == Fly.Overhead && fixedAzimuth.isNaN()
        if (notch) {
            // Pinna notch climbs from ~6.5 kHz at ear level to ~11 kHz straight overhead.
            val el = asin(dirZ.coerceIn(-1.0, 1.0)).coerceAtLeast(0.0) / (PI / 2)
            peaking(6500 + 4500 * el, -6 - 6 * el, 1.8)
        } else {
            nx1.fill(0.0); nx2.fill(0.0); ny1.fill(0.0); ny2.fill(0.0)
        }

        if (!started) {
            started = true
            for (e in 0..1) { dl0[e] = dl1[e]; b00[e] = b01[e]; b10[e] = b11[e]; a10[e] = a11[e] }
            dark0 = dark1; gain0 = gain1; send0 = send1; prop0 = prop1
        }
    }

    /** Orbits per second (or there-and-back trips per second for FlyBy). */
    private fun rate(fx: FlyFx): Double =
        if (fx.mode == Fly.FlyBy) speedMs(fx) / (4 * FLY_HALF) else 0.05 * 20.0.pow(fx.speed.toDouble())

    private fun speedMs(fx: FlyFx) = 4 * 10.0.pow(fx.speed.toDouble())

    private fun geometry(fx: FlyFx) {
        val radius = 0.6 + 4.4 * fx.distance
        if (!fixedAzimuth.isNaN()) {
            dirX = sin(fixedAzimuth); dirY = cos(fixedAzimuth); dirZ = 0.0; dist = radius; return
        }
        val a = 2 * PI * phase
        when (fx.mode) {
            Fly.Circle -> { dirX = sin(a); dirY = cos(a); dirZ = 0.0; dist = radius }
            Fly.SideToSide -> {
                val az = PI / 2 * sin(a)
                dirX = sin(az); dirY = cos(az); dirZ = 0.0; dist = radius
            }
            Fly.Overhead -> {
                // Front, up over the top, behind, and back over the top again.
                val x = 0.15 * sin(a); val y = cos(a); val z = abs(sin(a))
                val m = sqrt(x * x + y * y + z * z)
                dirX = x / m; dirY = y / m; dirZ = z / m; dist = radius
            }
            Fly.FlyBy -> {
                // Straight past in front, left to right, then back again (no jump at the turn).
                val x = if (phase < 0.5) -FLY_HALF + 4 * FLY_HALF * phase else 3 * FLY_HALF - 4 * FLY_HALF * phase
                val y = 1 + 9 * fx.distance
                val d = sqrt(x * x + y * y)
                dirX = x / d; dirY = y / d; dirZ = 0.0; dist = d
            }
            Fly.Off -> {}
        }
    }

    /** RBJ peaking EQ, used as a soft notch. */
    private fun peaking(f: Double, db: Double, q: Double) {
        val a = 10.0.pow(db / 40)
        val w = 2 * PI * f / sr
        val al = sin(w) / (2 * q)
        val a0 = 1 + al / a
        nb0 = (1 + al * a) / a0; nb1 = -2 * cos(w) / a0; nb2 = (1 - al * a) / a0
        na1 = -2 * cos(w) / a0; na2 = (1 - al / a) / a0
    }

    /** Soft ceiling just under full scale: transparent below 0.95. */
    private fun safe(x: Double): Float {
        val m = abs(x)
        if (m <= KNEE) return x.toFloat()
        val y = KNEE + (1 - KNEE) * tanh((m - KNEE) / (1 - KNEE)) * 0.999
        return (if (x < 0) -y else y).toFloat()
    }

    companion object {
        private const val BLOCK = 16
        private const val C = 343.0
        private const val HEAD = 0.0875
        private const val A_C = HEAD / C
        private const val BETA = 2 * C / HEAD
        private const val ALPHA_MIN = 0.1
        private const val THETA_MIN = 150.0 / 180 * PI
        private const val GUARD = 3.0
        private const val FLY_HALF = 25.0
        private const val KNEE = 0.95
        private const val TAPS = 4
        private val TAP_MS = arrayOf(doubleArrayOf(7.1, 13.3, 21.7, 29.9), doubleArrayOf(9.7, 16.1, 24.3, 33.1))
        private val TAP_GAIN = doubleArrayOf(0.5, 0.4, 0.32, 0.25)
    }
}

/** Delay line with 4-point Hermite reads: clean pitch when the delay glides (Doppler). */
private class HermiteRing(minSamples: Int) {
    private val buf = DoubleArray(Integer.highestOneBit(maxOf(minSamples, 4) * 2))
    private val mask = buf.size - 1
    private var w = 0

    fun reset() { buf.fill(0.0); w = 0 }
    fun write(x: Double) { buf[w] = x; w = (w + 1) and mask }

    /** [d] samples behind the last write; needs d >= 2. */
    fun read(d: Double): Double {
        val p = w - 1 - d
        val i = kotlin.math.floor(p).toInt()
        val f = p - i
        val y0 = buf[(i - 1) and mask]; val y1 = buf[i and mask]
        val y2 = buf[(i + 1) and mask]; val y3 = buf[(i + 2) and mask]
        val c1 = 0.5 * (y2 - y0)
        val c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
        val c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
        return ((c3 * f + c2) * f + c1) * f + y1
    }

    fun readLinear(d: Double): Double {
        val p = w - 1 - d
        val i = kotlin.math.floor(p).toInt()
        val f = p - i
        return buf[i and mask] * (1 - f) + buf[(i + 1) and mask] * f
    }
}

/** amount 0 = off; length 0..1 = a half-second breath in to a three-second swell. */
data class GhostFx(val amount: Float = 0f, val length: Float = 0.5f)

/**
 * Reverse reverb: every word is preceded by its own reverb tail, played backwards, so it
 * swells up out of nowhere into the word. y = reverse(reverb(reverse(x))). Only possible
 * offline (the swell comes before the sound), so it is rendered once per tape.
 */
object Ghost {
    fun render(src: ShortArray, channels: Int, sampleRate: Int, length: Float): FloatArray {
        val n = src.size / channels
        val y = FloatArray(n)
        if (n == 0) return y
        var peak = 0f
        for (i in 0 until n) {
            var s = 0
            for (c in 0 until channels) s += src[i * channels + c]
            val v = s / (32768f * channels)
            y[n - 1 - i] = v
            peak = maxOf(peak, abs(v))
        }
        if (peak == 0f) return y
        reverb(y, sampleRate, length.coerceIn(0f, 1f))
        y.reverse()
        var wet = 0f
        for (v in y) wet = maxOf(wet, abs(v))
        if (wet > 0f) {
            // Swell peaks 12 dB under the dry voice's peak.
            val g = 0.25f * peak / wet
            for (i in y.indices) y[i] *= g
        }
        return y
    }

    /**
     * In place, wet only: low cut, four all-pass diffusers, then an 8-line feedback delay
     * network (Householder mix, damped loops) whose decay time follows [length].
     */
    private fun reverb(x: FloatArray, sr: Int, length: Float) {
        // 200 Hz high-pass (RBJ, Butterworth Q) and a 7 kHz one-pole: no boom, no fizz.
        val w = 2 * PI * 200 / sr
        val al = sin(w) / (2 * 0.7071)
        val a0 = 1 + al
        val hb0 = (1 + cos(w)) / 2 / a0; val hb1 = -(1 + cos(w)) / a0; val hb2 = hb0
        val ha1 = -2 * cos(w) / a0; val ha2 = (1 - al) / a0
        var hx1 = 0.0; var hx2 = 0.0; var hy1 = 0.0; var hy2 = 0.0
        val inLp = 1 - exp(-2 * PI * 7000 / sr)
        var lpIn = 0.0

        val apLen = doubleArrayOf(3.1, 4.7, 7.3, 11.3).map { (it * sr / 1000).toInt() }
        val ap = apLen.map { DoubleArray(it) }
        val apI = IntArray(4)
        val g = 0.65

        val size = 0.9 + 0.5 * length
        val rt60 = 0.5 + 2.5 * length
        val lenMs = doubleArrayOf(43.1, 47.9, 53.7, 59.3, 67.1, 73.9, 79.7, 89.3)
        val lens = IntArray(8) { (lenMs[it] * size * sr / 1000).toInt() }
        val lines = Array(8) { DoubleArray(lens[it]) }
        val idx = IntArray(8)
        val fb = DoubleArray(8) { 10.0.pow(-3.0 * lens[it] / (rt60 * sr)) }
        val damp = 1 - exp(-2 * PI * 5500 / sr)
        val lp = DoubleArray(8)
        val yv = DoubleArray(8)

        for (i in x.indices) {
            val v = x[i].toDouble()
            val h = hb0 * v + hb1 * hx1 + hb2 * hx2 - ha1 * hy1 - ha2 * hy2
            hx2 = hx1; hx1 = v; hy2 = hy1; hy1 = h
            lpIn += inLp * (h - lpIn)
            var d = lpIn
            for (k in 0 until 4) {
                val buf = ap[k]
                val j = apI[k]
                val delayed = buf[j]
                val u = d - g * delayed
                buf[j] = u
                apI[k] = if (j + 1 == buf.size) 0 else j + 1
                d = g * u + delayed
            }
            var sum = 0.0
            for (k in 0 until 8) { yv[k] = lines[k][idx[k]]; sum += yv[k] }
            val s = 0.25 * sum
            val inj = d * 0.35
            var out = 0.0
            for (k in 0 until 8) {
                lp[k] += damp * (yv[k] - s - lp[k])
                val j = idx[k]
                lines[k][j] = (if (k and 1 == 0) inj else -inj) + fb[k] * lp[k]
                idx[k] = if (j + 1 == lens[k]) 0 else j + 1
                out += if (k % 3 == 0) -yv[k] else yv[k]
            }
            x[i] = (out * 0.3).toFloat()
        }
    }
}
