package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Clean-up: a vocal channel strip. [amount] is the one kid knob and scales everything
 * together; the rest are for people who know what a de-esser is.
 *
 * lowCut    0..1 -> 40..160 Hz high-pass, 24 dB/octave (rumble, handling noise, pops)
 * deEss     0..1 how hard harsh "s" and "sh" sounds get tamed
 * compress  0..1 evens out loud and quiet (ratio and threshold together)
 * presence  0..1 lift around 4 kHz (clarity) and 12 kHz (air)
 * autoLevel slowly rides the volume toward a steady loudness (about -18 dBFS RMS)
 */
data class PolishFx(
    val amount: Float = 0f,
    val lowCut: Float = 0.5f,
    val deEss: Float = 0.5f,
    val compress: Float = 0.5f,
    val presence: Float = 0.5f,
    val autoLevel: Boolean = true,
)

/** RBJ cookbook biquad, transposed direct form II. */
internal class Biquad {
    private var b0 = 1.0; private var b1 = 0.0; private var b2 = 0.0
    private var a1 = 0.0; private var a2 = 0.0
    private var z1 = 0.0; private var z2 = 0.0

    fun reset() { z1 = 0.0; z2 = 0.0 }

    fun process(x: Double): Double {
        val y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }

    private fun set(nb0: Double, nb1: Double, nb2: Double, a0: Double, na1: Double, na2: Double) {
        b0 = nb0 / a0; b1 = nb1 / a0; b2 = nb2 / a0; a1 = na1 / a0; a2 = na2 / a0
    }

    fun highPass(fs: Int, f: Double, q: Double) {
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
    }

    fun lowPass(fs: Int, f: Double, q: Double) {
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al)
    }

    /** Band-pass with 0 dB at the centre. */
    fun bandPass(fs: Int, f: Double, q: Double) {
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / (2 * q)
        set(al, 0.0, -al, 1 + al, -2 * c, 1 - al)
    }

    fun peaking(fs: Int, f: Double, q: Double, db: Double) = peaking(cos(2 * PI * f / fs), sin(2 * PI * f / fs) / (2 * q), db)

    /** Peaking with the frequency terms precomputed ([c] = cos w0, [al] = alpha): cheap to re-gain every block. */
    fun peaking(c: Double, al: Double, db: Double) {
        val a = 10.0.pow(db / 40)
        set(1 + al * a, -2 * c, 1 - al * a, 1 + al / a, -2 * c, 1 - al / a)
    }

    fun highShelf(fs: Int, f: Double, db: Double) {
        val a = 10.0.pow(db / 40)
        val w = 2 * PI * f / fs; val c = cos(w); val al = sin(w) / 2 * sqrt(2.0) // shelf slope S = 1
        val sa = 2 * sqrt(a) * al
        set(
            a * ((a + 1) + (a - 1) * c + sa), -2 * a * ((a - 1) + (a + 1) * c), a * ((a + 1) + (a - 1) * c - sa),
            (a + 1) - (a - 1) * c + sa, 2 * ((a - 1) - (a + 1) * c), (a + 1) - (a - 1) * c - sa,
        )
    }
}

/**
 * The strip, in studio order: high-pass -> de-esser (dynamic bell on the "s" band) ->
 * compressor (soft knee, program-dependent release, gentle expander below it so room
 * noise isn't lifted, automatic makeup) -> presence/air EQ -> auto-level (gated) ->
 * 2 ms look-ahead peak limiter at -1 dBFS.
 *
 * Detectors run every sample (cheap one-poles); gain maths (logs and powers) runs every
 * [BLOCK] samples and the gains are ramped in between, so nothing zippers.
 * The limiter's look-ahead delays the output by about 2 ms.
 */
class Polish(private val fs: Int) {
    private val hp = Array(4) { Biquad() }        // 2 per channel, cascaded Butterworth
    private val ess = Array(2) { Biquad() }       // dynamic bell per channel
    private val sibDetect = Biquad()              // 5-9 kHz band, on the mono mix
    private val peak = Array(2) { Biquad() }
    private val shelf = Array(2) { Biquad() }
    private val essC = cos(2 * PI * ESS_HZ / fs)
    private val essAl = sin(2 * PI * ESS_HZ / fs) / (2 * ESS_Q)

    // Smoothed parameters (snap on the first block after a reset).
    private var fresh = true
    private var cutHz = 0.0; private var essK = 0.0; private var comp = 0.0; private var pres = 0.0; private var amt = 0.0
    private var setCut = -1.0; private var setPres = -1.0; private var setEssDb = 1.0

    // Detectors.
    private var sibPow = 0.0; private var fullPow = 0.0
    private var compPow = 0.0
    private var expPow = 0.0
    private var alPow = 0.0
    private val essAtt = coef(0.001); private val essRel = coef(0.06)
    private val compAtt = coef(0.005); private val compRel = coef(0.12)
    private val expAtt = coef(0.0005); private val expRel = coef(0.02)
    private val alTau = coef(0.4)

    // Gains in dB (control rate) and their per-sample ramps (linear).
    private var essDb = 0.0
    private var compDb = 0.0; private var sustain = 0.0
    private var expDb = 0.0; private var hold = 0
    private var alDb = 0.0
    private var gComp = 1.0; private var gAl = 1.0
    private var compGrDb = 0.0

    // Limiter.
    private val look = maxOf(1, (0.002 * fs).toInt())
    private val dl = DoubleArray(look + 1); private val dr = DoubleArray(look + 1); private val dg = DoubleArray(look + 1)
    private var wp = 0
    private val minVal = DoubleArray(look + 2); private val minAt = LongArray(look + 2)
    private var qHead = 0; private var qLen = 0; private var t = 0L
    private var limG = 1.0
    private val limAtt = 1 - exp(-5.0 / look)
    private val limRel = 1 - exp(-1.0 / (0.08 * fs))
    private var limGrDb = 0.0

    /** Compressor + limiter gain reduction in dB, for a meter. */
    val gainReductionDb: Float get() = (compGrDb + limGrDb).toFloat()

    fun reset() {
        hp.forEach { it.reset() }; ess.forEach { it.reset() }; sibDetect.reset()
        peak.forEach { it.reset() }; shelf.forEach { it.reset() }
        fresh = true; setCut = -1.0; setPres = -1.0; setEssDb = 1.0
        sibPow = 0.0; fullPow = 0.0; compPow = 0.0; expPow = 0.0; alPow = 0.0; expDb = 0.0; hold = 0
        essDb = 0.0; compDb = 0.0; sustain = 0.0; alDb = 0.0; gComp = 1.0; gAl = 1.0; compGrDb = 0.0
        dl.fill(0.0); dr.fill(0.0); dg.fill(1.0); wp = 0; qHead = 0; qLen = 0; t = 0L; limG = 1.0; limGrDb = 0.0
    }

    init { reset() }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: PolishFx) {
        if (fx.amount <= 0f) return
        var i = 0
        while (i < n) {
            val m = minOf(BLOCK, n - i)
            control(fx)
            // Ramp the block's gains from where they were to the new targets.
            val gc0 = gComp; val gc1 = 10.0.pow((compDb + expDb) / 20)
            val ga0 = gAl; val ga1 = 10.0.pow(alDb / 20)
            for (j in 0 until m) {
                val k = i + j
                val f = (j + 1).toDouble() / m
                var a = hp[1].process(hp[0].process(l[k].toDouble()))
                var b = hp[3].process(hp[2].process(r[k].toDouble()))
                // De-esser detection: "s" band vs everything, on the mono mix.
                val mono = 0.5 * (a + b)
                val s = sibDetect.process(mono)
                sibPow = follow(sibPow, s * s, essAtt, essRel)
                fullPow = follow(fullPow, mono * mono, essAtt, essRel)
                a = ess[0].process(a); b = ess[1].process(b)
                // Compressor: feed-forward, linked across channels.
                val pw = maxOf(a * a, b * b)
                compPow = follow(compPow, pw, compAtt, compRel)
                expPow = follow(expPow, pw, expAtt, expRel)
                val gc = gc0 + (gc1 - gc0) * f
                a *= gc; b *= gc
                a = shelf[0].process(peak[0].process(a)); b = shelf[1].process(peak[1].process(b))
                alPow += alTau * (0.5 * (a * a + b * b) - alPow)
                val ga = ga0 + (ga1 - ga0) * f
                a *= ga; b *= ga
                limit(a, b, l, r, k)
            }
            gComp = gc1; gAl = ga1
            i += m
        }
    }

    /** Once per block: smooth parameters, update filters, work out the gains. */
    private fun control(fx: PolishFx) {
        val a = fx.amount.toDouble().coerceIn(0.0, 1.0)
        val tCut = 40.0 + 120.0 * fx.lowCut.coerceIn(0f, 1f)
        val tEss = 2.0 * fx.deEss.coerceIn(0f, 1f) * a
        val tComp = fx.compress.coerceIn(0f, 1f) * a
        val tPres = fx.presence.coerceIn(0f, 1f) * a
        if (fresh) { cutHz = tCut; essK = tEss; comp = tComp; pres = tPres; amt = a; fresh = false }
        else {
            cutHz += (tCut - cutHz) * PARAM; essK += (tEss - essK) * PARAM
            comp += (tComp - comp) * PARAM; pres += (tPres - pres) * PARAM; amt += (a - amt) * PARAM
        }
        if (abs(cutHz - setCut) > 0.05) {
            setCut = cutHz
            for (c in 0..1) { hp[2 * c].highPass(fs, cutHz, Q1); hp[2 * c + 1].highPass(fs, cutHz, Q2) }
            sibDetect.bandPass(fs, ESS_HZ, 0.9)
        }
        if (abs(pres - setPres) > 1e-4) {
            setPres = pres
            for (c in 0..1) { peak[c].peaking(fs, 4000.0, 0.8, 5.0 * pres); shelf[c].highShelf(fs, 12000.0, 4.0 * pres) }
        }

        // De-esser: how far the "s" band sticks out of the whole voice decides the cut.
        var wantEss = 0.0
        if (essK > 0 && fullPow > 1e-8) {
            val over = sqrt(sibPow / fullPow) / ESS_RATIO
            if (over > 1) wantEss = -minOf(ESS_MAX_DB, 20 * log10(over) * essK)
        }
        essDb += (wantEss - essDb) * (if (wantEss < essDb) ESS_DOWN else ESS_UP)
        if (abs(essDb - setEssDb) > 0.01) { setEssDb = essDb; for (c in 0..1) ess[c].peaking(essC, essAl, essDb) }

        // Compressor (+ expander below it).
        val level = 10 * log10(compPow + 1e-12)
        val thr = -10.0 - 20.0 * comp
        val ratio = 1.0 + 5.0 * comp
        val gr = reduction(level, thr, ratio)
        val makeup = reduction(-12.0, thr, ratio)
        val want = -gr + makeup
        // Program-dependent release: brief peaks let go fast, long squeezes let go slowly.
        sustain += (gr - sustain) * SUSTAIN
        val relTime = 0.06 + 0.44 * (sustain / 6.0).coerceIn(0.0, 1.0)
        compDb += (want - compDb) * (if (want < compDb) ATTACK else 1 - exp(-BLOCK / (relTime * fs)))
        compGrDb = maxOf(0.0, makeup - compDb)

        // Expander: its own fast detector with a hold, so it shuts in the pauses (taking back the
        // makeup and auto-level boost too, so room noise is never lifted) but never clips a word's start.
        val expLevel = 10 * log10(expPow + 1e-12)
        if (expLevel > EXP_THR) hold = HOLD_BLOCKS else if (hold > 0) hold--
        val below = if (hold > 0) 0.0 else EXP_THR - expLevel
        val noLift = maxOf(0.0, makeup + alDb) * (below / 6.0).coerceIn(0.0, 1.0) * minOf(1.0, comp * 4)
        val expWant = -(minOf(20.0 * comp, below * (EXP_RATIO - 1)) + noLift)
        expDb += (expWant - expDb) * (if (expWant > expDb) EXP_OPEN else EXP_CLOSE)

        // Auto-level: only learns while someone is actually making sound.
        if (fx.autoLevel) {
            val lv = 10 * log10(alPow + 1e-12)
            if (lv > GATE) {
                // lv is measured before this gain, so the gap to the target IS the gain wanted.
                val target = (TARGET - lv).coerceIn(-6.0, 12.0 * amt)
                alDb += (target - alDb) * AL_SPEED
            }
        } else alDb += (0.0 - alDb) * AL_SPEED * 8
    }

    /** Soft-knee (6 dB) gain reduction in dB for a level, threshold and ratio. */
    private fun reduction(x: Double, thr: Double, ratio: Double): Double {
        val d = x - thr
        val slope = 1 - 1 / ratio
        return when {
            2 * d < -KNEE -> 0.0
            2 * d > KNEE -> d * slope
            else -> slope * (d + KNEE / 2) * (d + KNEE / 2) / (2 * KNEE)
        }
    }

    /** Look-ahead limiter: the gain is already down when a peak comes out of the delay. */
    private fun limit(a: Double, b: Double, l: FloatArray, r: FloatArray, k: Int) {
        val pk = maxOf(abs(a), abs(b))
        val g = if (pk > CEIL) CEIL / pk else 1.0
        // Sliding minimum of the needed gain over the look-ahead window (monotonic queue).
        val cap = minVal.size
        while (qLen > 0 && minVal[(qHead + qLen - 1) % cap] >= g) qLen--
        val tail = (qHead + qLen) % cap
        minVal[tail] = g; minAt[tail] = t; qLen++
        while (minAt[qHead] <= t - look - 1) { qHead = (qHead + 1) % cap; qLen-- }
        val winMin = minVal[qHead]
        limG += (winMin - limG) * (if (winMin < limG) limAtt else limRel)
        // The sample leaving the delay now.
        val outL = dl[wp]; val outR = dr[wp]; val need = dg[wp]
        dl[wp] = a; dr[wp] = b; dg[wp] = g
        wp = (wp + 1) % dl.size
        t++
        val gain = minOf(limG, need)
        limGrDb = if (gain < 0.9999) -20 * log10(gain) else 0.0
        l[k] = (outL * gain).toFloat(); r[k] = (outR * gain).toFloat()
    }

    private fun coef(seconds: Double) = 1 - exp(-1.0 / (seconds * fs))
    private fun follow(env: Double, x: Double, att: Double, rel: Double) = env + (x - env) * (if (x > env) att else rel)

    private val ATTACK = 1 - exp(-BLOCK / (0.003 * fs))
    private val SUSTAIN = 1 - exp(-BLOCK / (0.5 * fs))
    private val AL_SPEED = 1 - exp(-BLOCK / (1.5 * fs))
    private val PARAM = 1 - exp(-BLOCK / (0.02 * fs))
    private val ESS_DOWN = 1 - exp(-BLOCK / (0.002 * fs))
    private val ESS_UP = 1 - exp(-BLOCK / (0.05 * fs))
    private val EXP_OPEN = 1 - exp(-BLOCK / (0.001 * fs))
    private val EXP_CLOSE = 1 - exp(-BLOCK / (0.06 * fs))
    private val HOLD_BLOCKS = (0.08 * fs / BLOCK).toInt()

    companion object {
        private const val BLOCK = 16
        private const val Q1 = 0.5411961 // 4th-order Butterworth as two biquads
        private const val Q2 = 1.3065630
        private const val ESS_HZ = 7000.0
        private const val ESS_Q = 0.7
        private const val ESS_RATIO = 0.35 // "s" band louder than this share of the voice = sibilant
        private const val ESS_MAX_DB = 12.0
        private const val KNEE = 6.0
        private const val EXP_THR = -50.0
        private const val EXP_RATIO = 2.0
        private const val GATE = -50.0
        private const val TARGET = -18.0
        private const val CEIL = 0.8912509 // -1 dBFS
    }
}
