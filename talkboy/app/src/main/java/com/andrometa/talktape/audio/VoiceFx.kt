package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
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
 */
data class Fx(
    val tapeSpeed: Float = 1f,
    val tempo: Float = 1f,
    val pitch: Float = 0f,
    val formant: Float = 0f,
    val reverse: Boolean = false,
) {
    val isNeutral get() = this == Fx()
    val pitchFactor get() = semis(pitch)
    val formantFactor get() = semis(formant)

    companion object {
        const val MIN_SPEED = 0.5f
        const val MAX_SPEED = 2f
        const val MAX_SEMIS = 12f
        fun semis(s: Float) = 2.0.pow(s / 12.0)
    }
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
 * Streaming phase vocoder: time-stretch, pitch shift with formant (voice size)
 * preservation, and independent formant shift.
 *
 * Feed it one analysis frame of [size] samples per call; it returns [hop] output
 * samples. The caller decides how far apart analysis frames are (that is the
 * time-stretch), which keeps this class free of any notion of "position".
 *
 * ponytail: plain phase vocoder (no phase locking), slight "phasiness" on big
 * stretches; add identity phase locking if it ever bothers anyone.
 */
class VoiceProcessor(sampleRate: Int, val size: Int = 2048) {
    val hop = size / 4
    private val half = size / 2
    private val fft = Fft(size)
    private val window = DoubleArray(size) { 0.5 - 0.5 * cos(2 * PI * it / size) }
    // Hann analysis + Hann synthesis at 4x overlap sums to 1.5; 1/size undoes the inverse FFT.
    private val olaGain = 1.0 / (1.5 * size)
    // Cepstral lifter: keep detail coarser than ~1 ms, finer than any voice's pitch period.
    private val lifter = (sampleRate / 1000).coerceIn(8, half / 2)

    private val re = DoubleArray(size)
    private val im = DoubleArray(size)
    private val mag = DoubleArray(half + 1)
    private val freq = DoubleArray(half + 1)
    private val env = DoubleArray(half + 1)
    private val outMag = DoubleArray(half + 1)
    private val outFreq = DoubleArray(half + 1)
    private val lastPhase = DoubleArray(half + 1)
    private val sumPhase = DoubleArray(half + 1)
    private val accum = DoubleArray(size)

    fun reset() {
        lastPhase.fill(0.0); sumPhase.fill(0.0); accum.fill(0.0)
    }

    /**
     * @param frame       [size] raw (un-windowed) input samples
     * @param analysisHop how many input samples since the previous frame (hop * tempo)
     * @param pitch       pitch factor, 2.0 = one octave up
     * @param formant     formant factor, 2.0 = voice "half the size"
     * @param out         receives [hop] samples at [outOffset]
     */
    fun process(
        frame: DoubleArray, analysisHop: Double, pitch: Double, formant: Double,
        out: FloatArray, outOffset: Int = 0,
    ) {
        for (i in 0 until size) { re[i] = frame[i] * window[i]; im[i] = 0.0 }
        fft.transform(re, im, inverse = false)

        // Analysis: magnitude + true frequency of each bin (radians per sample).
        for (k in 0..half) {
            mag[k] = sqrt(re[k] * re[k] + im[k] * im[k])
            val phase = atan2(im[k], re[k])
            val binFreq = 2 * PI * k / size
            val dev = wrap(phase - lastPhase[k] - binFreq * analysisHop)
            lastPhase[k] = phase
            freq[k] = binFreq + dev / analysisHop
        }

        val shiftPitch = pitch != 1.0
        val shiftFormant = formant != 1.0
        if (!shiftPitch && !shiftFormant) {
            System.arraycopy(mag, 0, outMag, 0, half + 1)
            System.arraycopy(freq, 0, outFreq, 0, half + 1)
        } else {
            spectralEnvelope()
            // Excitation = spectrum with the voice-size envelope divided out.
            outMag.fill(0.0); outFreq.fill(0.0)
            for (k in 0..half) {
                val t = (k * pitch).roundToInt()
                if (t > half) break
                val e = mag[k] / env[k]
                // Keep the strongest source bin instead of summing, so pitching down doesn't get louder.
                if (e > outMag[t]) { outMag[t] = e; outFreq[t] = freq[k] * pitch }
            }
            // Re-apply the envelope, stretched by the formant factor.
            for (k in 0..half) {
                val src = k / formant
                val envAt = if (src >= half) 0.0 else {
                    val i = src.toInt(); val f = src - i
                    env[i] * (1 - f) + env[i + 1] * f
                }
                outMag[k] *= envAt
            }
        }

        // Synthesis: accumulate phase at the fixed output hop.
        for (k in 0..half) {
            sumPhase[k] = wrap(sumPhase[k] + hop * outFreq[k])
            re[k] = outMag[k] * cos(sumPhase[k])
            im[k] = outMag[k] * sin(sumPhase[k])
        }
        im[0] = 0.0; im[half] = 0.0
        for (k in 1 until half) { re[size - k] = re[k]; im[size - k] = -im[k] }
        fft.transform(re, im, inverse = true)

        for (i in 0 until size) accum[i] += re[i] * window[i] * olaGain
        for (i in 0 until hop) out[outOffset + i] = accum[i].toFloat()
        System.arraycopy(accum, hop, accum, 0, size - hop)
        accum.fill(0.0, size - hop, size)
    }

    /** Smooth spectral envelope (the "shape" of the voice) via cepstral liftering. Uses re/im as scratch. */
    private fun spectralEnvelope() {
        for (k in 0..half) { re[k] = ln(mag[k] + 1e-9); im[k] = 0.0 }
        for (k in 1 until half) { re[size - k] = re[k]; im[size - k] = 0.0 }
        fft.transform(re, im, inverse = true)
        for (i in 0 until size) {
            val keep = i <= lifter || i >= size - lifter
            re[i] = if (keep) re[i] / size else 0.0
            im[i] = 0.0
        }
        fft.transform(re, im, inverse = false)
        for (k in 0..half) env[k] = exp(re[k]).coerceAtLeast(1e-9)
    }

    private fun wrap(a: Double) = a - 2 * PI * floor((a + PI) / (2 * PI))
}

/**
 * Plays a tape through all the effects. Owns the playhead, so tape speed,
 * talk speed and direction can change between any two blocks without a click.
 */
class TapeRenderer(private val sampleRate: Int) {
    private val proc = VoiceProcessor(sampleRate)
    private val frame = DoubleArray(proc.size)
    val block get() = proc.hop

    /** Playhead in samples. */
    var position = 0.0

    fun reset(at: Double) { position = at; proc.reset() }

    /** True once the playhead has run off the end (or the start, when reversed). */
    fun finished(length: Int, fx: Fx) = if (fx.reverse) position <= 0.0 else position >= length

    /** Renders [block] samples into [out] and advances the playhead. */
    fun render(samples: ShortArray, length: Int, fx: Fx, out: FloatArray) {
        val dir = if (fx.reverse) -1.0 else 1.0
        val step = fx.tapeSpeed * dir
        for (i in frame.indices) frame[i] = sampleAt(samples, length, position + i * step)
        proc.process(frame, proc.hop * fx.tempo.toDouble(), fx.pitchFactor, fx.formantFactor, out)
        position += proc.hop * fx.tempo * fx.tapeSpeed * dir
    }

    private fun sampleAt(s: ShortArray, length: Int, p: Double): Double {
        if (p < 0 || p >= length - 1) return 0.0
        val i = p.toInt()
        val f = p - i
        return (s[i] * (1 - f) + s[i + 1] * f) / 32768.0
    }

    companion object {
        /** Whole-tape offline render, for "save as new tape". */
        fun renderAll(samples: ShortArray, length: Int, fx: Fx, sampleRate: Int): ShortArray {
            val r = TapeRenderer(sampleRate)
            r.reset(if (fx.reverse) length - 1.0 else 0.0)
            val buf = FloatArray(r.block)
            val est = (length / (fx.tempo * fx.tapeSpeed)).toInt() + r.block * 8
            var out = ShortArray(est)
            var n = 0
            // Output block i lines up with the frame that starts at the playhead, so no latency to trim.
            while (!r.finished(length, fx)) {
                r.render(samples, length, fx, buf)
                for (v in buf) {
                    if (n == out.size) out = out.copyOf(out.size * 2)
                    out[n++] = toPcm(v)
                }
            }
            return out.copyOf(n)
        }

        fun toPcm(v: Float) = (v.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
    }
}

/** Live mic: same effects in real time. Tape speed folds into pitch+size since live time can't speed up. */
class LiveVoice(sampleRate: Int) {
    private val proc = VoiceProcessor(sampleRate)
    private val history = DoubleArray(proc.size)
    val block get() = proc.hop

    fun process(input: ShortArray, fx: Fx, out: FloatArray) {
        System.arraycopy(history, block, history, 0, history.size - block)
        for (i in 0 until block) history[history.size - block + i] = input[i] / 32768.0
        proc.process(history, block.toDouble(), fx.pitchFactor * fx.tapeSpeed, fx.formantFactor * fx.tapeSpeed, out)
    }
}
