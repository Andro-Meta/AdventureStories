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

/** Auto-tune strength: off, a gentle glide onto the note, or the instant robot snap. */
enum class Tune { Off, Gentle, Robot }

/**
 * Every voice knob in the app. All defaults = the sound exactly as recorded.
 *
 * tapeSpeed  classic tape-deck speed: faster = higher AND quicker (the original toy's trick)
 * tempo      talk speed only, voice stays the same pitch
 * pitch      semitones up/down, voice "size" (formants) kept, so it sounds like you singing higher
 * formant    semitones up/down of the voice "size" only: down = giant, up = tiny
 * reverse    play backwards
 * tune/key   auto-tune; key -1 = any note, 0..11 = that major key (C..B)
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
    val tune: Tune = Tune.Off,
    val key: Int = -1,
    val layers: Int = 0,
    val echo: Float = 0f,
    val echoTime: Float = 0.35f,
    val reverb: Float = 0f,
) {
    val isNeutral get() = this == Fx()
    val hasSpace get() = layers > 0 || echo > 0f || reverb > 0f
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

/** Turns a detected pitch into the extra pitch factor that lands it on a note. */
class AutoTune(private val frameSeconds: Double) {
    private var ratio = 1.0
    private var note = NONE

    fun reset() { ratio = 1.0; note = NONE }

    /** [f0] as detected, [pitch] the pitch factor already being applied on top of it. */
    fun ratio(f0: Double, pitch: Double, fx: Fx): Double {
        if (fx.tune == Tune.Off) { reset(); return 1.0 }
        if (f0 <= 0) return ratio // unvoiced: hold, so "s" and breaths don't wobble
        val midi = 69 + 12 * log2(f0 * pitch / 440)
        val near = nearest(midi, fx.key)
        // Only change note once the voice is clearly closer to the new one: no flip-flopping.
        if (note == NONE || abs(midi - near) < abs(midi - note) - 0.15) note = near
        val want = 2.0.pow((note - midi) / 12)
        ratio = if (fx.tune == Tune.Robot) want else ratio + (want - ratio) * (1 - exp(-frameSeconds / GLIDE))
        return ratio
    }

    companion object {
        private const val NONE = Int.MIN_VALUE
        private const val GLIDE = 0.07
        private val MAJOR = intArrayOf(0, 2, 4, 5, 7, 9, 11)
        val KEY_NAMES = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")

        fun inKey(note: Int, key: Int) = key < 0 || Math.floorMod(note - key, 12) in MAJOR

        fun nearest(midi: Double, key: Int): Int {
            val r = midi.roundToInt()
            return (r - 2..r + 2).filter { inKey(it, key) }.minBy { abs(it - midi) }
        }
    }
}

/**
 * Streaming phase vocoder: time-stretch, pitch shift with the voice's formants kept,
 * and independent formant ("voice size") shift.
 *
 * Feed it one analysis frame of [size] samples per call; it returns [hop] output
 * samples. The caller decides how far apart analysis frames are (that is the
 * time-stretch), which keeps this class free of any notion of "position".
 *
 * Quality bits:
 * - Peaks move as whole regions with their phases locked together (Laroche-Dolson),
 *   so voices stay solid instead of "phasey".
 * - The voice shape is a true envelope (iterated cepstrum) whose detail follows the
 *   detected pitch: sharp enough to keep F1 and F2 apart, never sharp enough to trace
 *   the harmonics. That's what lets Voice Size move the vowel and not just the treble.
 * - Phases reset on sudden onsets so consonants stay crisp.
 */
class VoiceProcessor(private val sampleRate: Int, val size: Int = 2048) {
    val hop = size / 4
    private val half = size / 2
    private val fft = Fft(size)
    private val window = DoubleArray(size) { 0.5 - 0.5 * cos(2 * PI * it / size) }
    // Hann analysis + Hann synthesis at 4x overlap sums to 1.5; 1/size undoes the inverse FFT.
    private val olaGain = 1.0 / (1.5 * size)

    private val re = DoubleArray(size)
    private val im = DoubleArray(size)
    private val mag = DoubleArray(half + 1)
    private val phaseIn = DoubleArray(half + 1)
    private val freq = DoubleArray(half + 1)
    private val lastPhase = DoubleArray(half + 1)
    // Envelope works at half resolution: es-point cepstrum over eh+1 bins.
    private val es = size / 2
    private val eh = es / 2
    private val envFft = Fft(es)
    private val logMag = DoubleArray(eh + 1)
    private val work = DoubleArray(eh + 1)
    private val lift = DoubleArray(es)
    private var liftFor = -1
    private val env = DoubleArray(half + 1)
    private val outMag = DoubleArray(half + 1)
    private val outPhase = DoubleArray(half + 1)
    private val prevOutPhase = DoubleArray(half + 1)
    private val peaks = IntArray(half + 1)
    private val accum = DoubleArray(size)
    private var prevEnergy = 0.0
    private var fresh = true

    fun reset() {
        lastPhase.fill(0.0); prevOutPhase.fill(0.0); accum.fill(0.0)
        prevEnergy = 0.0; fresh = true
    }

    /**
     * @param frame       [size] raw (un-windowed) input samples
     * @param analysisHop how many input samples since the previous frame (hop * tempo)
     * @param pitch       pitch factor, 2.0 = one octave up
     * @param formant     formant factor, 2.0 = voice "half the size"
     * @param f0          detected voice pitch of this frame in Hz (0 = none), sets the envelope detail
     * @param out         receives [hop] samples at [outOffset]
     */
    fun process(
        frame: DoubleArray, analysisHop: Double, pitch: Double, formant: Double, f0: Double,
        out: FloatArray, outOffset: Int = 0,
    ) {
        for (i in 0 until size) { re[i] = frame[i] * window[i]; im[i] = 0.0 }
        fft.transform(re, im, inverse = false)

        // Analysis: magnitude, phase and true frequency of each bin (radians per sample).
        var energy = 0.0
        for (k in 0..half) {
            mag[k] = sqrt(re[k] * re[k] + im[k] * im[k])
            energy += mag[k] * mag[k]
            val phase = atan2(im[k], re[k])
            phaseIn[k] = phase
            val binFreq = 2 * PI * k / size
            freq[k] = binFreq + wrap(phase - lastPhase[k] - binFreq * analysisHop) / analysisHop
            lastPhase[k] = phase
        }
        // A sudden jump in loudness is a consonant or a clap: restart phases from the input there.
        val onset = fresh || energy > ONSET_JUMP * prevEnergy + 1e-3
        prevEnergy = energy
        fresh = false

        val shape = pitch != 1.0 || formant != 1.0
        if (shape) {
            trueEnvelope(lifterFor(f0))
            // Nothing lives below the fundamental, so the envelope sags there; hold it level instead,
            // or a voice pitched down would lose its new, lower fundamental and go thin.
            val k0 = (f0 * size / sampleRate).roundToInt().coerceAtMost(half)
            for (k in 0 until k0) env[k] = env[k0]
        }

        // Peaks, and the low point between each pair: each peak owns the bins up to there.
        var n = 0
        for (k in 1 until half) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) peaks[n++] = k
        outMag.fill(0.0)
        for (k in 0..half) outPhase[k] = prevOutPhase[k] + hop * 2 * PI * k / size
        var lo = 0
        for (i in 0 until n) {
            val p = peaks[i]
            var hi = half
            if (i + 1 < n) { hi = p; for (k in p + 1 until peaks[i + 1]) if (mag[k] < mag[hi]) hi = k }
            val tp = (p * pitch).roundToInt()
            if (tp <= half) {
                val shift = tp - p
                val peakPhase = if (onset) phaseIn[p] else prevOutPhase[tp] + hop * freq[p] * pitch
                for (k in lo..hi) {
                    val t = k + shift
                    if (t < 0 || t > half) continue
                    val m = if (shape) mag[k] / env[k] * envAt(t / formant) else mag[k]
                    if (m > outMag[t]) { outMag[t] = m; outPhase[t] = peakPhase + phaseIn[k] - phaseIn[p] }
                }
            }
            lo = hi + 1
        }
        if (n == 0) for (k in 0..half) { outMag[k] = mag[k]; outPhase[k] = phaseIn[k] }

        // Synthesis.
        for (k in 0..half) {
            val ph = wrap(outPhase[k])
            prevOutPhase[k] = ph
            re[k] = outMag[k] * cos(ph)
            im[k] = outMag[k] * sin(ph)
        }
        im[0] = 0.0; im[half] = 0.0
        for (k in 1 until half) { re[size - k] = re[k]; im[size - k] = -im[k] }
        fft.transform(re, im, inverse = true)

        for (i in 0 until size) accum[i] += re[i] * window[i] * olaGain
        for (i in 0 until hop) out[outOffset + i] = accum[i].toFloat()
        System.arraycopy(accum, hop, accum, 0, size - hop)
        accum.fill(0.0, size - hop, size)
    }

    /** Envelope detail in cepstrum samples: half a pitch period (Röbel), 1.5..6 ms. */
    private fun lifterFor(f0: Double): Int {
        val lo = sampleRate * 0.0015; val hi = sampleRate * 0.006
        val q = if (f0 > 0) (0.5 * sampleRate / f0).coerceIn(lo, hi) else lo
        return q.toInt().coerceAtMost(half / 2)
    }

    private fun envAt(src: Double): Double {
        if (src >= half) return env[half]
        val i = src.toInt(); val f = src - i
        return env[i] * (1 - f) + env[i + 1] * f
    }

    /**
     * True envelope: smooth the log spectrum, lift it to wherever the spectrum pokes above,
     * smooth again. Converges onto a curve that rides the harmonic peaks (the formants)
     * instead of sagging into the gaps between them like a plain cepstrum.
     */
    private fun trueEnvelope(order: Int) {
        // Worked on every other bin (peak of each pair): the envelope's detail tops out at
        // 6 ms, far below what a 1024-point cepstrum can hold, and it halves the cost.
        for (j in 0..eh) {
            val a = mag[2 * j]; val b = if (2 * j + 1 <= half) mag[2 * j + 1] else a
            logMag[j] = ln(maxOf(a, b) + 1e-9); work[j] = logMag[j]
        }
        if (order != liftFor) {
            liftFor = order
            val taper = (order * 0.8).toInt()
            for (i in 0 until es) {
                val q = if (i <= eh) i else es - i
                lift[i] = when {
                    q <= taper -> 1.0
                    q < order -> 0.5 + 0.5 * cos(PI * (q - taper) / (order - taper))
                    else -> 0.0
                } / es
            }
        }
        for (iter in 0 until MAX_ITER) {
            for (j in 0..eh) { re[j] = work[j]; im[j] = 0.0 }
            for (j in 1 until eh) { re[es - j] = re[j]; im[es - j] = 0.0 }
            envFft.transform(re, im, inverse = true)
            for (i in 0 until es) { re[i] *= lift[i]; im[i] = 0.0 }
            envFft.transform(re, im, inverse = false)
            var over = 0.0
            for (j in 0..eh) {
                val d = logMag[j] - re[j]
                if (d > over) over = d
                work[j] = if (d > 0) logMag[j] else re[j]
            }
            if (over < CONVERGED) break
        }
        for (j in 0..eh) re[j] = exp(re[j])
        for (k in 0..half) {
            val x = k * 0.5; val j = x.toInt().coerceAtMost(eh - 1); val f = x - j
            env[k] = (re[j] * (1 - f) + re[j + 1] * f).coerceAtLeast(1e-9)
        }
    }

    private fun wrap(a: Double) = a - 2 * PI * floor((a + PI) / (2 * PI))

    companion object {
        private const val MAX_ITER = 4
        private const val CONVERGED = 0.23 // 2 dB
        private const val ONSET_JUMP = 4.0  // +6 dB in one hop
    }
}

/**
 * Plays a tape through all the effects. Owns the playhead, so tape speed,
 * talk speed and direction can change between any two blocks without a click.
 * Output is always stereo (interleaved L,R).
 */
class TapeRenderer(private val sampleRate: Int, private val channels: Int = 1) {
    private val procs = Array(channels) { VoiceProcessor(sampleRate) }
    private val size = procs[0].size
    val block = procs[0].hop
    private val frames = Array(channels) { DoubleArray(size) }
    private val mid = DoubleArray(size)
    private val voice = Array(channels) { FloatArray(block) }
    private val tracker = PitchTracker(sampleRate)
    private val tune = AutoTune(block.toDouble() / sampleRate)
    private val space = SpaceFx(sampleRate)
    private var tail = 0
    private var primed = false

    /** Playhead in frames. */
    var position = 0.0

    fun reset(at: Double) {
        position = at; tail = 0; primed = false
        procs.forEach { it.reset() }; tune.reset(); space.reset()
    }

    fun atEnd(length: Int, fx: Fx) = if (fx.reverse) position <= 0.0 else position >= length

    /** True once the playhead has run off the end (or the start, when reversed) and the echoes have died. */
    fun finished(length: Int, fx: Fx) =
        atEnd(length, fx) && (!fx.hasSpace || space.silent || tail > sampleRate * MAX_TAIL_SECONDS)

    /** Renders [block] stereo frames (2 * block values) into [out] and advances the playhead. */
    fun render(samples: ShortArray, length: Int, fx: Fx, out: FloatArray) {
        val dir = if (fx.reverse) -1.0 else 1.0
        val advance = block * fx.tempo * fx.tapeSpeed * dir
        // Tape speed and backwards are just how the playhead moves: only talk speed, pitch,
        // size and auto-tune need the (expensive) vocoder.
        val vocoder = fx.tempo != 1f || fx.pitch != 0f || fx.formant != 0f || fx.tune != Tune.Off
        if (!vocoder) {
            if (primed) { primed = false; procs.forEach { it.reset() }; tune.reset() }
            val step = fx.tapeSpeed * dir
            for (c in 0 until channels) for (i in 0 until block) voice[c][i] = sampleAt(samples, length, c, position + i * step).toFloat()
        } else {
            if (!primed) {
                // Overlap-add needs the frames before this one, or the sound fades in.
                primed = true
                val at = position
                for (j in PRIME downTo 1) { position = at - j * advance; voiceBlock(samples, length, fx) }
                position = at
            }
            voiceBlock(samples, length, fx)
        }
        space.process(voice[0], voice[channels - 1], fx, out)
        if (atEnd(length, fx)) tail += block
        position += advance
    }

    private fun voiceBlock(samples: ShortArray, length: Int, fx: Fx) {
        val step = fx.tapeSpeed * if (fx.reverse) -1.0 else 1.0
        for (c in 0 until channels) {
            val f = frames[c]
            for (i in 0 until size) f[i] = sampleAt(samples, length, c, position + i * step)
        }
        val shaping = fx.pitch != 0f || fx.formant != 0f || fx.tune != Tune.Off
        val f0 = if (shaping) {
            for (i in 0 until size) { var s = 0.0; for (c in 0 until channels) s += frames[c][i]; mid[i] = s / channels }
            tracker.detect(mid)
        } else 0.0
        val pitch = fx.pitchFactor * tune.ratio(f0, fx.pitchFactor, fx)
        for (c in 0 until channels) procs[c].process(frames[c], block * fx.tempo.toDouble(), pitch, fx.formantFactor, f0, voice[c])
    }

    /** 4-point Hermite interpolation: smoother than straight lines when the tape speed is off 1×. */
    private fun sampleAt(s: ShortArray, length: Int, c: Int, p: Double): Double {
        if (p < 0 || p > length - 1) return 0.0
        val i = p.toInt()
        val f = p - i
        val y1 = s[i * channels + c] / 32768.0
        if (f == 0.0) return y1
        val y0 = if (i > 0) s[(i - 1) * channels + c] / 32768.0 else y1
        val y2 = if (i + 1 < length) s[(i + 1) * channels + c] / 32768.0 else y1
        val y3 = if (i + 2 < length) s[(i + 2) * channels + c] / 32768.0 else y2
        val c1 = 0.5 * (y2 - y0)
        val c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
        val c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
        return ((c3 * f + c2) * f + c1) * f + y1
    }

    companion object {
        private const val MAX_TAIL_SECONDS = 8
        private const val PRIME = 3

        /** Channels a rendered copy needs: stereo if the tape is, or if the effects make it so. */
        fun outChannels(channels: Int, fx: Fx) = if (channels == 2 || fx.hasSpace) 2 else 1

        /** Whole-tape offline render, for "save as new tape". */
        fun renderAll(src: Pcm, fx: Fx, sampleRate: Int): Pcm {
            val length = src.frames
            val r = TapeRenderer(sampleRate, src.channels)
            r.reset(if (fx.reverse) length - 1.0 else 0.0)
            val buf = FloatArray(r.block * 2)
            val ch = outChannels(src.channels, fx)
            val est = ((length / (fx.tempo * fx.tapeSpeed)).toInt() + r.block * 8) * ch
            var out = ShortArray(est)
            var n = 0
            // Output block i lines up with the frame that starts at the playhead, so no latency to trim.
            while (!r.finished(length, fx)) {
                r.render(src.data, length, fx, buf)
                if (n + r.block * ch > out.size) out = out.copyOf(out.size * 2)
                for (i in 0 until r.block) {
                    if (ch == 2) { out[n++] = toPcm(buf[2 * i]); out[n++] = toPcm(buf[2 * i + 1]) }
                    else out[n++] = toPcm(0.5f * (buf[2 * i] + buf[2 * i + 1]))
                }
            }
            return Pcm(out.copyOf(n), ch)
        }

        fun renderAll(samples: ShortArray, length: Int, fx: Fx, sampleRate: Int): ShortArray =
            renderAll(Pcm(samples.copyOf(length), 1), fx, sampleRate).data

        fun toPcm(v: Float) = (v.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
    }
}

/** Live mic: same effects in real time. Tape speed folds into pitch+size since live time can't speed up. */
class LiveVoice(sampleRate: Int) {
    private val proc = VoiceProcessor(sampleRate)
    private val history = DoubleArray(proc.size)
    private val voice = FloatArray(proc.hop)
    private val tracker = PitchTracker(sampleRate)
    private val tune = AutoTune(proc.hop.toDouble() / sampleRate)
    private val space = SpaceFx(sampleRate)
    val block get() = proc.hop

    /** [out] gets 2 * block interleaved stereo values. */
    fun process(input: ShortArray, fx: Fx, out: FloatArray) {
        System.arraycopy(history, block, history, 0, history.size - block)
        for (i in 0 until block) history[history.size - block + i] = input[i] / 32768.0
        val shaping = fx.pitch != 0f || fx.formant != 0f || fx.tune != Tune.Off || fx.tapeSpeed != 1f
        val f0 = if (shaping) tracker.detect(history) else 0.0
        val pitch = fx.pitchFactor * fx.tapeSpeed
        proc.process(history, block.toDouble(), pitch * tune.ratio(f0, pitch, fx), fx.formantFactor * fx.tapeSpeed, f0, voice)
        space.process(voice, voice, fx, out)
    }
}
