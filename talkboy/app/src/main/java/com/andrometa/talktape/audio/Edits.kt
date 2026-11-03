package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/**
 * Tape surgery for edit mode. Ranges are frames [a, b). Every edit returns a new [Pcm] and every
 * join is crossfaded over [XFADE] frames, so a cut never clicks.
 */
object Edits {
    /** 5 ms at 44.1 kHz. */
    const val XFADE = 220

    fun keep(p: Pcm, a: Int, b: Int) = Pcm(p.data.copyOfRange(a * p.channels, b * p.channels), p.channels)

    /** [p] with [a, b) swapped for [insert] (any length). A stereo insert makes the whole tape stereo. */
    fun splice(p: Pcm, a: Int, b: Int, insert: Pcm): Pcm {
        val c = maxOf(p.channels, insert.channels)
        val base = toChannels(p, c)
        return join(join(keep(base, 0, a), toChannels(insert, c)), keep(base, b, base.frames))
    }

    fun cut(p: Pcm, a: Int, b: Int) = splice(p, a, b, Pcm(ShortArray(0), p.channels))

    /** Plays [a, b) twice in a row. */
    fun repeat(p: Pcm, a: Int, b: Int) = splice(p, b, b, keep(p, a, b))

    fun reverse(p: Pcm, a: Int, b: Int): Pcm {
        val c = p.channels
        val seg = keep(p, a, b).data
        val n = seg.size / c
        val out = ShortArray(seg.size) { i -> seg[(n - 1 - i / c) * c + i % c] }
        return splice(p, a, b, Pcm(out, c))
    }

    /** Gain [g] across [a, b), ramped in and out over [XFADE] so the edges don't click. */
    fun gain(p: Pcm, a: Int, b: Int, g: Float) = shape(p, a, b) { i, n ->
        val edge = minOf(1f, minOf(i, n - 1 - i) / XFADE.toFloat())
        1f + (g - 1f) * edge
    }

    fun silence(p: Pcm, a: Int, b: Int) = gain(p, a, b, 0f)

    /** Brings the loudest peak in [a, b) to -1 dBFS. */
    fun normalize(p: Pcm, a: Int, b: Int): Pcm {
        var peak = 1
        for (i in a * p.channels until b * p.channels) peak = maxOf(peak, abs(p.data[i].toInt()))
        return gain(p, a, b, 0.891f * 32767f / peak)
    }

    /** Fade from silence to full across [a, b) (or full to silence when [out]). Equal-power curve. */
    fun fade(p: Pcm, a: Int, b: Int, out: Boolean) = shape(p, a, b) { i, n ->
        val t = i / (n - 1f).coerceAtLeast(1f)
        sin(PI / 2 * if (out) 1 - t else t).toFloat()
    }

    private inline fun shape(p: Pcm, a: Int, b: Int, gainAt: (Int, Int) -> Float): Pcm {
        val c = p.channels
        val d = p.data.copyOf()
        val n = b - a
        for (i in 0 until n) {
            val g = gainAt(i, n)
            for (k in 0 until c) { val j = (a + i) * c + k; d[j] = clip(d[j] * g) }
        }
        return Pcm(d, c)
    }

    /** [l] then [r], with [l]'s tail crossfaded into [r]'s head. */
    fun join(l: Pcm, r: Pcm): Pcm {
        val c = l.channels
        val x = minOf(XFADE, l.frames, r.frames)
        val out = ShortArray((l.frames + r.frames - x) * c)
        val head = (l.frames - x) * c
        l.data.copyInto(out, 0, 0, head)
        for (i in 0 until x) {
            val t = (i + 0.5f) / x
            for (k in 0 until c) out[head + i * c + k] = clip(l.data[head + i * c + k] * (1 - t) + r.data[i * c + k] * t)
        }
        r.data.copyInto(out, head + x * c, x * c, r.data.size)
        return Pcm(out, c)
    }

    fun toChannels(p: Pcm, ch: Int): Pcm = when {
        p.channels == ch -> p
        ch == 2 -> Pcm(ShortArray(p.data.size * 2) { p.data[it / 2] }, 2)
        else -> Pcm(ShortArray(p.frames) { ((p.data[2 * it] + p.data[2 * it + 1]) / 2).toShort() }, 1)
    }

    /**
     * Interleaved 16-bit audio from [from] Hz to [to] Hz: 32-tap Blackman-windowed sinc, cutoff
     * just under the lower Nyquist so downsampling doesn't alias.
     */
    fun resample(data: ShortArray, channels: Int, from: Int, to: Int): ShortArray {
        if (from == to) return data
        val inFrames = data.size / channels
        val outFrames = (inFrames.toLong() * to / from).toInt()
        val ratio = from.toDouble() / to
        val cut = 0.97 * minOf(1.0, 1 / ratio)
        val half = 16
        val out = ShortArray(outFrames * channels)
        for (o in 0 until outFrames) {
            val pos = o * ratio
            val base = floor(pos).toInt()
            for (k in 0 until channels) {
                var acc = 0.0; var norm = 0.0
                for (j in base - half + 1..base + half) {
                    val x = pos - j
                    val w = 0.42 + 0.5 * cos(PI * x / half) + 0.08 * cos(2 * PI * x / half)
                    val s = if (abs(x) < 1e-9) cut else sin(PI * cut * x) / (PI * x)
                    val h = s * w
                    norm += h
                    if (j in 0 until inFrames) acc += h * data[j * channels + k]
                }
                out[o * channels + k] = clip((acc / norm).toFloat())
            }
        }
        return out
    }

    private fun clip(v: Float) = v.coerceIn(-32768f, 32767f).toInt().toShort()
}
