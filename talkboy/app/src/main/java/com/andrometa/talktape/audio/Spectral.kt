package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Streaming phase vocoder. One [analyze] per frame does the shared work (FFT, noise
 * reduction, voice envelope, peaks); then any number of [Voice]s each make their own
 * output from it: the lead, harmony singers, whisper and talk-box are all just voices.
 *
 * The caller decides how far apart analysis frames are (that is the time-stretch), which
 * keeps this class free of any notion of "position".
 *
 * Quality bits:
 * - Peaks move as whole regions with their phases locked together (Laroche-Dolson),
 *   so voices stay solid instead of "phasey".
 * - The voice shape is a true envelope (iterated cepstrum) whose detail follows the
 *   detected pitch: sharp enough to keep F1 and F2 apart, never sharp enough to trace
 *   the harmonics. That's what lets Voice Size move the vowel and not just the treble.
 * - Phases reset on sudden onsets so consonants stay crisp.
 * - Noise reduction is a decision-directed Wiener gain (Ephraim-Malah) over a noise
 *   estimate from the whole tape (or tracked minima when live), smoothed across
 *   frequency and floored, so it removes hiss without "musical noise" warble.
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
    private var hasEnv = false
    private val peaks = IntArray(half + 1)
    private val regionHi = IntArray(half + 1)
    private var nPeaks = 0
    private var prevEnergy = 0.0
    private var fresh = true
    private var onset = false
    /** 0 voiced .. 1 unvoiced (breath, "s", "t"), smoothed: talk-box mixes in noise for consonants. */
    private var unvoiced = 1.0

    // Noise reduction.
    private val noise = DoubleArray(half + 1)
    private val gain = DoubleArray(half + 1) { 1.0 }
    private val prevClean = DoubleArray(half + 1)
    private val smoothPow = DoubleArray(half + 1)
    private val subMin = DoubleArray(half + 1) { Double.MAX_VALUE }
    private val mins = Array(MIN_WINDOWS) { DoubleArray(half + 1) { Double.MAX_VALUE } }
    private var minFrame = 0
    private var minSlot = 0

    private val voices = ArrayList<Voice>()
    val lead = Voice(1)

    /** The input just jumped (a loop): take phases from the new input, keep the overlap tail as a crossfade. */
    fun restartPhases() { fresh = true }

    fun reset() {
        lastPhase.fill(0.0); prevEnergy = 0.0; fresh = true; unvoiced = 1.0
        gain.fill(1.0); prevClean.fill(0.0); smoothPow.fill(0.0); subMin.fill(Double.MAX_VALUE)
        mins.forEach { it.fill(Double.MAX_VALUE) }; minFrame = 0; minSlot = 0
        voices.forEach { it.reset() }
    }

    /**
     * @param frame       [size] raw (un-windowed) input samples
     * @param analysisHop how many input samples since the previous frame (hop * tempo)
     * @param f0          detected voice pitch of this frame in Hz (0 = none)
     * @param envelope    work out the voice shape (needed by pitch, size, harmony, whisper, talk-box)
     * @param clean       0..1 noise reduction strength
     * @param profile     noise power per bin for this tape (from [noiseProfile]), or null to track it live
     */
    fun analyze(frame: DoubleArray, analysisHop: Double, f0: Double, envelope: Boolean, clean: Float = 0f, profile: DoubleArray? = null) {
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
        onset = fresh || energy > ONSET_JUMP * prevEnergy + 1e-3
        prevEnergy = energy
        fresh = false
        unvoiced += ((if (f0 > 0) 0.0 else 1.0) - unvoiced) * 0.5

        if (profile != null) System.arraycopy(profile, 0, noise, 0, half + 1) else trackNoise()
        if (clean > 0f) denoise(clean)

        hasEnv = envelope
        if (envelope) {
            trueEnvelope(lifterFor(f0))
            // Nothing lives below the fundamental, so the envelope sags there; hold it level instead,
            // or a voice pitched down would lose its new, lower fundamental and go thin.
            val k0 = (f0 * size / sampleRate).roundToInt().coerceAtMost(half)
            for (k in 0 until k0) env[k] = env[k0]
        }

        // Peaks, and the low point between each pair: each peak owns the bins up to there.
        nPeaks = 0
        for (k in 1 until half) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) peaks[nPeaks++] = k
        for (i in 0 until nPeaks) {
            var hi = half
            if (i + 1 < nPeaks) { hi = peaks[i]; for (k in peaks[i] + 1 until peaks[i + 1]) if (mag[k] < mag[hi]) hi = k }
            regionHi[i] = hi
        }
    }

    /** Minimum statistics: noise = the quietest each bin has been over the last ~1.5 s. */
    private fun trackNoise() {
        for (k in 0..half) {
            val p = mag[k] * mag[k]
            smoothPow[k] = if (smoothPow[k] == 0.0) p else 0.8 * smoothPow[k] + 0.2 * p
            if (smoothPow[k] < subMin[k]) subMin[k] = smoothPow[k]
        }
        if (++minFrame >= MIN_FRAMES) {
            minFrame = 0
            System.arraycopy(subMin, 0, mins[minSlot], 0, half + 1)
            minSlot = (minSlot + 1) % MIN_WINDOWS
            subMin.fill(Double.MAX_VALUE)
        }
        for (k in 0..half) {
            var m = subMin[k]
            for (w in mins) if (w[k] < m) m = w[k]
            noise[k] = if (m == Double.MAX_VALUE) 0.0 else m * MIN_BIAS
        }
    }

    /** Decision-directed Wiener gain, floored at -(6 + 18 * clean) dB and smoothed across bins. */
    private fun denoise(clean: Float) {
        val floor = Math.pow(10.0, -(6 + 18 * clean) / 20.0)
        for (k in 0..half) {
            val p = mag[k] * mag[k]
            val n = noise[k] * (1 + clean) + 1e-20
            val post = p / n
            val prior = DD * prevClean[k] / n + (1 - DD) * maxOf(post - 1, 0.0)
            work2[k] = maxOf(prior / (1 + prior), floor)
        }
        for (k in 0..half) {
            val g = 0.25 * work2[maxOf(k - 1, 0)] + 0.5 * work2[k] + 0.25 * work2[minOf(k + 1, half)]
            gain[k] = g
            mag[k] *= g
            prevClean[k] = mag[k] * mag[k]
        }
    }
    private val work2 = DoubleArray(half + 1)

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

    /** One output made from the shared analysis, with its own phases and overlap-add. */
    inner class Voice(seed: Long) {
        private val outMag = DoubleArray(half + 1)
        private val outPhase = DoubleArray(half + 1)
        private val prevOutPhase = DoubleArray(half + 1)
        private val accum = DoubleArray(size)
        private var rnd = seed * 0x9E3779B97F4A7C15uL.toLong() or 1L
        private val sRe = DoubleArray(half + 1)
        private val sIm = DoubleArray(half + 1)

        init { voices += this }

        fun reset() { prevOutPhase.fill(0.0); accum.fill(0.0) }

        /**
         * @param pitch    pitch factor, 2.0 = one octave up
         * @param formant  formant factor, 2.0 = voice "half the size"
         * @param whisper  0..1 how much of the voice turns to breath
         * @param carrier  talk-box: the synth the voice "plays" through, with [talk] 0..1 how much
         * @param out      receives [hop] samples at [outOffset]
         */
        fun render(
            pitch: Double, formant: Double, out: FloatArray, outOffset: Int = 0,
            whisper: Float = 0f, carrier: Carrier? = null, talk: Float = 0f,
        ) {
            val shape = hasEnv && (pitch != 1.0 || formant != 1.0)
            outMag.fill(0.0)
            for (k in 0..half) outPhase[k] = prevOutPhase[k] + hop * 2 * PI * k / size
            var lo = 0
            for (i in 0 until nPeaks) {
                val p = peaks[i]
                val hi = regionHi[i]
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
            if (nPeaks == 0) for (k in 0..half) { outMag[k] = mag[k]; outPhase[k] = phaseIn[k] }

            var eVoice = 0.0
            for (k in 0..half) {
                val ph = wrap(outPhase[k])
                prevOutPhase[k] = ph
                sRe[k] = outMag[k] * cos(ph)
                sIm[k] = outMag[k] * sin(ph)
                eVoice += outMag[k] * outMag[k]
            }
            if (hasEnv && eVoice > 0) {
                if (whisper > 0f) blend(whisper.toDouble(), eVoice, formant, BREATH_OLA) { k -> breath(k) }
                if (carrier != null && talk > 0f) {
                    val u = unvoiced
                    blend(talk.toDouble(), eVoice, formant, 1 + (BREATH_OLA - 1) * u) { k ->
                        // Consonants have no pitch to play: let them through as breath so words stay clear.
                        val c = carrier.norm[k]
                        nRe = (1 - u) * c * carrier.cosP[k]; nIm = (1 - u) * c * carrier.sinP[k]
                        if (u > 0.05) { val r = nRe; val i = nIm; breath(k); nRe = r + u * nRe; nIm = i + u * nIm }
                    }
                }
            }

            for (k in 0..half) { re[k] = sRe[k]; im[k] = sIm[k] }
            im[0] = 0.0; im[half] = 0.0
            for (k in 1 until half) { re[size - k] = re[k]; im[size - k] = -im[k] }
            fft.transform(re, im, inverse = true)

            for (i in 0 until size) accum[i] += re[i] * window[i] * olaGain
            for (i in 0 until hop) out[outOffset + i] = accum[i].toFloat()
            System.arraycopy(accum, hop, accum, 0, size - hop)
            accum.fill(0.0, size - hop, size)
        }

        private var nRe = 0.0
        private var nIm = 0.0

        /** Breath: random-phase noise with this bin's unit level; whisper has little below ~300 Hz. */
        private fun breath(k: Int) {
            val hp = k * k / (k * k + BREATH_KNEE * BREATH_KNEE)
            nRe = (nextU() + nextU() - 1) * hp
            nIm = (nextU() + nextU() - 1) * hp
        }

        /**
         * Mixes the voice with a new excitation shaped by the (formant-shifted) voice envelope,
         * matched in loudness to the voice: out = (1 - w) voice + w excitation * envelope.
         * [ola] makes up for noise frames overlap-adding in power, not in amplitude.
         */
        private inline fun blend(w: Double, eVoice: Double, formant: Double, ola: Double, excite: (Int) -> Unit) {
            var e = 0.0
            for (k in 0..half) {
                excite(k)
                val a = envAt(k / formant)
                nRe *= a; nIm *= a
                re[k] = nRe; im[k] = nIm
                e += nRe * nRe + nIm * nIm
            }
            if (e <= 0) return
            val g = sqrt(eVoice / e) * w * ola
            for (k in 0..half) { sRe[k] = sRe[k] * (1 - w) + re[k] * g; sIm[k] = sIm[k] * (1 - w) + im[k] * g }
        }

        /** xorshift64: uniform 0..1, cheap and repeatable. */
        private fun nextU(): Double {
            rnd = rnd xor (rnd shl 13); rnd = rnd xor (rnd ushr 7); rnd = rnd xor (rnd shl 17)
            return (rnd ushr 11) * (1.0 / (1L shl 53))
        }
    }

    companion object {
        private const val MAX_ITER = 4
        private const val CONVERGED = 0.23 // 2 dB
        private const val ONSET_JUMP = 4.0  // +6 dB in one hop
        private const val DD = 0.96
        private const val MIN_FRAMES = 16   // ~190 ms per sub-window
        private const val MIN_WINDOWS = 8   // ~1.5 s memory
        private const val MIN_BIAS = 3.0 // min of ~9-frame smoothed power over 1.5 s sits about 1/3 of the mean
        private const val BREATH_KNEE = 14.0 // bins: ~300 Hz at 2048 / 44.1 kHz
        private const val BREATH_OLA = 2.0 // measured: random-phase frames came out 6 dB down

        /**
         * Noise power per bin for a whole tape: the average spectrum of its quietest 15% of
         * frames (the hiss and room tone between words), measured the same way [analyze]
         * measures, so the clean-up knows the noise from the very first note. (An average,
         * not a per-bin low percentile: that reads noise several times too low.)
         */
        fun noiseProfile(pcm: Pcm, size: Int = 2048): DoubleArray {
            val half = size / 2
            val fft = Fft(size)
            val win = DoubleArray(size) { 0.5 - 0.5 * cos(2 * PI * it / size) }
            val re = DoubleArray(size); val im = DoubleArray(size)
            val count = ((pcm.frames - size) / (size / 2)).coerceAtLeast(0)
            if (count < 4) return DoubleArray(half + 1)
            val step = maxOf(1, count / 600)
            val rows = ArrayList<DoubleArray>()
            var f = 0
            while (f < count) {
                val start = f * size / 2
                for (i in 0 until size) {
                    var s = 0.0
                    for (c in 0 until pcm.channels) s += pcm.data[(start + i) * pcm.channels + c]
                    re[i] = s / pcm.channels / 32768.0 * win[i]; im[i] = 0.0
                }
                fft.transform(re, im, inverse = false)
                rows += DoubleArray(half + 1) { k -> re[k] * re[k] + im[k] * im[k] }
                f += step
            }
            val quiet = rows.sortedBy { it.sum() }.take(maxOf(2, rows.size * 15 / 100))
            return DoubleArray(half + 1) { k -> quiet.sumOf { it[k] } / quiet.size }
        }
    }
}

/**
 * The talk-box's instrument: band-limited sawtooth oscillators (PolyBLEP) at the given
 * notes, analysed with the vocoder's own window so the voice can be imposed on it.
 * [norm] is the carrier's spectrum with its own tilt flattened (divided by its local
 * average), so the voice envelope alone decides the tone.
 */
class Carrier(private val sampleRate: Int, private val size: Int = 2048) {
    private val hop = size / 4
    private val half = size / 2
    private val fft = Fft(size)
    private val window = DoubleArray(size) { 0.5 - 0.5 * cos(2 * PI * it / size) }
    private val buf = DoubleArray(size)
    private val re = DoubleArray(size)
    private val im = DoubleArray(size)
    private val phase = DoubleArray(MAX_OSC)
    private val freqNow = DoubleArray(MAX_OSC)
    private var lp = 0.0
    val norm = DoubleArray(half + 1)
    val cosP = DoubleArray(half + 1)
    val sinP = DoubleArray(half + 1)
    private val pre = DoubleArray(half + 2)

    /** Plays [hop] more samples of [hz] (0 = silent voice), gliding from the last notes, then analyses. */
    fun advance(hz: DoubleArray, tone: Float) {
        System.arraycopy(buf, hop, buf, 0, size - hop)
        val cut = 1 - exp(-2 * PI * (1500 + 9000 * tone) / sampleRate)
        for (i in 0 until hop) {
            var s = 0.0
            for (o in hz.indices) {
                if (hz[o] <= 0) continue
                if (freqNow[o] <= 0) freqNow[o] = hz[o]
                freqNow[o] += (hz[o] - freqNow[o]) * 0.01
                val dt = freqNow[o] / sampleRate
                phase[o] += dt
                if (phase[o] >= 1) phase[o] -= 1
                s += 2 * phase[o] - 1 - polyBlep(phase[o], dt)
            }
            lp += cut * (s - lp)
            buf[size - hop + i] = lp
        }
        for (i in 0 until size) { re[i] = buf[i] * window[i]; im[i] = 0.0 }
        fft.transform(re, im, inverse = false)
        for (k in 0..half) {
            val m = sqrt(re[k] * re[k] + im[k] * im[k])
            norm[k] = m
            if (m > 0) { cosP[k] = re[k] / m; sinP[k] = im[k] / m } else { cosP[k] = 1.0; sinP[k] = 0.0 }
        }
        // Flatten: divide by the average over about two harmonics' width.
        val lowest = hz.filter { it > 0 }.minOrNull() ?: 110.0
        val w = (2 * lowest * size / sampleRate).toInt().coerceIn(3, 60)
        pre[0] = 0.0
        for (k in 0..half) pre[k + 1] = pre[k] + norm[k]
        for (k in 0..half) {
            val a = maxOf(0, k - w); val b = minOf(half, k + w)
            val avg = (pre[b + 1] - pre[a]) / (b - a + 1)
            norm[k] = if (avg > 1e-12) norm[k] / avg else 0.0
        }
    }

    private fun polyBlep(t: Double, dt: Double): Double = when {
        t < dt -> { val x = t / dt; x + x - x * x - 1 }
        t > 1 - dt -> { val x = (t - 1) / dt; x * x + x + x + 1 }
        else -> 0.0
    }

    companion object { const val MAX_OSC = 4 }
}
