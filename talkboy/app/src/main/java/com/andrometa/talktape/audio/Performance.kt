package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Stutter: repeats a short slice, "h-h-h-hello". [auto] does it by itself at the start of
 * each word (onsets found on the tape); holding the Stutter button repeats whatever just
 * played for as long as it's held. slice 0..1 -> 40..250 ms; repeats 2..8 for auto.
 */
data class StutterFx(val auto: Boolean = false, val slice: Float = 0.35f, val repeats: Int = 3) {
    val sliceSeconds get() = 0.04 + 0.21 * slice
}

/**
 * Spectral freeze: while held, the sound at the moment you pressed hangs in the air as a
 * smooth drone (captured spectrum, re-synthesised every 23 ms with fresh random phases, so
 * it never loops or buzzes). Fades in over 20 ms and away over 0.4 s; the tape keeps
 * playing underneath, a little quieter.
 */
class Freezer(private val sampleRate: Int) {
    private val n = 4096
    private val hop = n / 4
    private val half = n / 2
    private val fft = Fft(n)
    private val win = DoubleArray(n) { 0.5 - 0.5 * cos(2 * PI * it / n) }
    private val ring = DoubleArray(n)
    private var w = 0
    private val held = DoubleArray(half + 1)
    private val re = DoubleArray(n)
    private val im = DoubleArray(n)
    private val accum = DoubleArray(n + hop)
    private var outPos = hop
    private var level = 0.0
    private var holding = false
    private var rnd = 0x2545F4914F6CDD1DL
    private val attack = 1 - exp(-1.0 / (0.02 * sampleRate))
    private val release = 1 - exp(-1.0 / (0.4 * sampleRate))

    val active get() = level > 1e-4 || holding

    fun reset() { ring.fill(0.0); accum.fill(0.0); outPos = hop; level = 0.0; holding = false }

    fun process(l: FloatArray, r: FloatArray, count: Int, hold: Boolean) {
        if (hold && !holding) capture()
        holding = hold
        for (i in 0 until count) {
            ring[w] = 0.5 * (l[i] + r[i]); w = (w + 1) % n
            if (!active) continue
            level += ((if (holding) 1.0 else 0.0) - level) * (if (holding) attack else release)
            if (outPos >= hop) nextGrain()
            val y = accum[outPos++] * level
            val duck = (1 - 0.5 * level).toFloat()
            l[i] = l[i] * duck + y.toFloat(); r[i] = r[i] * duck + y.toFloat()
        }
    }

    /** Spectrum of the last 93 ms, averaged over three overlapping windows for a steadier tone. */
    private fun capture() {
        held.fill(0.0)
        for (o in 0 until 3) {
            for (i in 0 until n) {
                val j = Math.floorMod(w - n - o * hop / 2 + i, n)
                re[i] = ring[j] * win[i]; im[i] = 0.0
            }
            fft.transform(re, im, inverse = false)
            for (k in 0..half) held[k] += (re[k] * re[k] + im[k] * im[k]) / 3
        }
        for (k in 0..half) held[k] = sqrt(held[k])
    }

    private fun nextGrain() {
        System.arraycopy(accum, hop, accum, 0, n)
        accum.fill(0.0, n, n + hop)
        outPos = 0
        for (k in 0..half) {
            val ph = 2 * PI * nextU()
            re[k] = held[k] * cos(ph); im[k] = held[k] * sin(ph)
        }
        im[0] = 0.0; im[half] = 0.0
        for (k in 1 until half) { re[n - k] = re[k]; im[n - k] = -im[k] }
        fft.transform(re, im, inverse = true)
        // Hann grains at 4x overlap sum to 2 in amplitude; random phases add in power, so sqrt.
        val g = 1.0 / (n * sqrt(1.5 * 0.375 * 4))
        for (i in 0 until n) accum[i] += re[i] * win[i] * g * 2
    }

    private fun nextU(): Double {
        rnd = rnd xor (rnd shl 13); rnd = rnd xor (rnd ushr 7); rnd = rnd xor (rnd shl 17)
        return (rnd ushr 11) * (1.0 / (1L shl 53))
    }
}
