package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Every voice knob in the app. All defaults = the sound exactly as recorded.
 *
 * tapeSpeed  classic tape-deck speed: faster = higher AND quicker (the original toy's trick)
 * tempo      talk speed only, voice stays the same pitch
 * pitch      semitones up/down, voice "size" (formants) kept, so it sounds like you singing higher
 * formant    semitones up/down of the voice "size" only: down = giant, up = tiny
 * reverse    play backwards
 * tune       auto-tune (see TuneFx); harmony, talk (talk-box), whisper 0..1: more voice magic
 * clean      0..1 noise clean-up; polish: the vocal channel strip (see PolishFx); drive: distortion
 * place, oldTape, wobble: character (telephone, walkie... / old tape / tremolo, flanger...)
 * fly, ghost, stutter: fly-around, reverse-reverb swell, word stutter
 * layers     extra copies of your voice, slightly out of tune and time with each other (0 = off)
 * echo       0..1 how much echo, echoTime 0..1 short slap to long canyon
 * reverb     0..1 small room to giant cave
 */
data class Fx(
    val tapeSpeed: Float = 1f,
    val tempo: Float = 1f,
    val pitch: Float = 0f,
    val formant: Float = 0f,
    val reverse: Boolean = false,
    val tune: TuneFx = TuneFx(),
    val harmony: HarmonyFx = HarmonyFx(),
    val talk: TalkBoxFx = TalkBoxFx(),
    val whisper: Float = 0f,
    val clean: Float = 0f,
    val polish: PolishFx = PolishFx(),
    val drive: DriveFx = DriveFx(),
    val place: PlaceFx = PlaceFx(),
    val oldTape: OldTapeFx = OldTapeFx(),
    val wobble: WobbleFx = WobbleFx(),
    val layers: Int = 0,
    val echo: Float = 0f,
    val echoTime: Float = 0.35f,
    val reverb: Float = 0f,
    val fly: FlyFx = FlyFx(),
    val ghost: GhostFx = GhostFx(),
    val stutter: StutterFx = StutterFx(),
) {
    val isNeutral get() = this == Fx()
    /** Twin voices, echo or reverb: the SpaceFx stage (and its tail after the tape ends). */
    val hasSpace get() = layers > 0 || echo > 0f || reverb > 0f
    /** Anything that makes left and right differ. */
    val makesStereo get() = hasSpace || harmony.on || fly.mode != Fly.Off || wobble.mode != Wobble.Off || place.place == Place.Underwater
    val pitchFactor get() = semis(pitch)
    val formantFactor get() = semis(formant)

    companion object {
        const val MIN_SPEED = 0.5f
        const val MAX_SPEED = 2f
        const val MAX_SEMIS = 12f
        const val MAX_LAYERS = 4
        fun semis(s: Float) = 2.0.pow(s / 12.0)
    }
}

/** Interleaved 16-bit audio: [channels] samples per frame. */
class Pcm(val data: ShortArray, val channels: Int) {
    val frames get() = data.size / channels
}

/** In-place iterative radix-2 complex FFT of a fixed power-of-two size. */
class Fft(private val n: Int) {
    private val cosT = DoubleArray(n / 2) { cos(2 * PI * it / n) }
    private val sinT = DoubleArray(n / 2) { sin(2 * PI * it / n) }
    private val rev = IntArray(n).also { r ->
        val bits = Integer.numberOfTrailingZeros(n)
        for (i in 0 until n) r[i] = Integer.reverse(i) ushr (32 - bits)
    }

    init { require(n >= 2 && n and (n - 1) == 0) { "FFT size must be a power of two" } }

    /** inverse = true computes the unscaled inverse (caller divides by n). */
    fun transform(re: DoubleArray, im: DoubleArray, inverse: Boolean) {
        for (i in 0 until n) {
            val j = rev[i]
            if (j > i) {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
        }
        val sign = if (inverse) 1.0 else -1.0
        var size = 2
        while (size <= n) {
            val half = size / 2
            val step = n / size
            var start = 0
            while (start < n) {
                var k = 0
                for (j in start until start + half) {
                    val wr = cosT[k]
                    val wi = sign * sinT[k]
                    val l = j + half
                    val tr = re[l] * wr - im[l] * wi
                    val ti = re[l] * wi + im[l] * wr
                    re[l] = re[j] - tr; im[l] = im[j] - ti
                    re[j] += tr; im[j] += ti
                    k += step
                }
                start += size
            }
            size *= 2
        }
    }
}

/**
 * YIN pitch detector. Works at half the sample rate (plenty for voices) to stay cheap.
 * Looks at the start of the frame, which is the part the voice processor is outputting.
 */
class PitchTracker(sampleRate: Int) {
    private val rate = sampleRate / 2.0
    private val w = (rate * 0.024).toInt()
    private val maxLag = (rate / 70).toInt()
    private val minLag = (rate / 1100).toInt()
    private val x = DoubleArray(w + maxLag + 1)
    private val d = DoubleArray(maxLag + 2)

    /** Voice pitch in Hz, or 0 when there isn't a clear one (breath, "sss", silence). */
    fun detect(frame: DoubleArray): Double {
        if (frame.size < 2 * x.size) return 0.0
        for (i in x.indices) x[i] = 0.5 * (frame[2 * i] + frame[2 * i + 1])
        var energy = 0.0
        for (i in 0 until w) energy += x[i] * x[i]
        if (energy / w < 1e-6) return 0.0
        var run = 0.0
        d[0] = 1.0
        for (tau in 1..maxLag) {
            var s = 0.0
            for (j in 0 until w) { val v = x[j] - x[j + tau]; s += v * v }
            run += s
            d[tau] = if (run > 0) s * tau / run else 1.0
        }
        var best = -1
        for (tau in minLag until maxLag) {
            if (d[tau] < THRESHOLD) {
                var t = tau
                while (t + 1 < maxLag && d[t + 1] < d[t]) t++
                best = t; break
            }
        }
        if (best < 1) return 0.0
        val a = d[best - 1]; val b = d[best]; val c = d[best + 1]
        val den = a - 2 * b + c
        val shift = if (abs(den) > 1e-12) (0.5 * (a - c) / den).coerceIn(-1.0, 1.0) else 0.0
        return rate / (best + shift)
    }

    companion object { const val THRESHOLD = 0.15 }
}

