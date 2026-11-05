package com.andrometa.talktape.audio

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt

/** Auto-tune style: off, a smooth natural correction that keeps vibrato, or the hard robot snap. */
enum class Tune { Off, Gentle, Robot }

/** Which notes count as "in tune". Steps are semitones above the key's root. */
enum class Scale(val label: String, val steps: IntArray) {
    Chromatic("Any note", intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)),
    Major("Major", intArrayOf(0, 2, 4, 5, 7, 9, 11)),
    Minor("Minor", intArrayOf(0, 2, 3, 5, 7, 8, 10)),
    HarmonicMinor("Harmonic minor", intArrayOf(0, 2, 3, 5, 7, 8, 11)),
    MajorPentatonic("Major pentatonic", intArrayOf(0, 2, 4, 7, 9)),
    MinorPentatonic("Minor pentatonic", intArrayOf(0, 3, 5, 7, 10)),
    Blues("Blues", intArrayOf(0, 3, 5, 6, 7, 10));

    fun contains(note: Int, key: Int) = Math.floorMod(note - key, 12) in steps

    /** The scale note [degrees] scale steps away from [note] (which should be in the scale). */
    fun step(note: Int, key: Int, degrees: Int): Int {
        var n = note
        var left = abs(degrees)
        val dir = if (degrees >= 0) 1 else -1
        while (left > 0) { n += dir; if (contains(n, key)) left-- }
        return n
    }
}

/**
 * Auto-tune settings. The kid view only shows [mode] and the key; the rest is the studio view.
 * speed     retune time 0..1 -> 0..400 ms (0 = instant)
 * humanize  0..1 how much of the singer's own vibrato and scoops survive
 * amount    0..1 how far towards the note it pulls
 * flex      0..1 notes further than this from the target are left alone (0 = always correct)
 */
data class TuneFx(
    val mode: Tune = Tune.Off,
    val key: Int = 0,
    val scale: Scale = Scale.Chromatic,
    val speed: Float = 0.12f,
    val humanize: Float = 0.8f,
    val amount: Float = 1f,
    val flex: Float = 0f,
) {
    val on get() = mode != Tune.Off

    companion object {
        val KEY_NAMES = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")
    }
}

/**
 * Turns the detected pitch into a correction, like a studio pitch corrector:
 * - the target note is chosen from the singer's slow "centre" pitch, with vibrato filtered
 *   out and hysteresis, so a wide vibrato near a note boundary doesn't flip notes;
 * - a real note change (the voice jumps and stays) re-centres at once, no lag;
 * - Robot pulls the instant pitch onto the note (flattens vibrato), Gentle pulls the centre
 *   (keeps vibrato), humanize blends between them, speed sets the retune glide.
 */
class AutoTune(private val frameSeconds: Double) {
    private var centre = Double.NaN
    private var away = 0
    private var note = NONE
    private var corr = 0.0 // semitones currently applied
    /** Last note chosen (MIDI), or -1: harmony builds on it. */
    val currentNote get() = if (note == NONE) -1 else note

    fun reset() { centre = Double.NaN; away = 0; note = NONE; corr = 0.0 }

    /** [f0] as detected, [pitch] the pitch factor already applied on top of it. Returns the extra pitch factor. */
    fun ratio(f0: Double, pitch: Double, t: TuneFx): Double {
        if (!t.on) { reset(); return 1.0 }
        if (f0 <= 0) return 2.0.pow(corr / 12) // unvoiced: hold, so "s" and breaths don't wobble
        val midi = 69 + 12 * log2(f0 * pitch / 440)
        // Slow centre (about 3 Hz): vibrato averages out. A jump of > 0.8 semitone held for
        // ~35 ms is a new note: snap the centre there instead of sliding.
        if (centre.isNaN()) centre = midi
        if (abs(midi - centre) > 0.8) { if (++away >= 3) { centre = midi; away = 0 } } else away = 0
        centre += (midi - centre) * (1 - exp(-frameSeconds / CENTRE_TIME))

        val scale = t.scale
        val near = nearest(centre, t.key, scale)
        if (note == NONE || !scale.contains(note, t.key) || abs(centre - near) < abs(centre - note) - HYSTERESIS) note = near

        val fast = note - midi
        val slow = note - centre
        val h = if (t.mode == Tune.Robot) t.humanize * 0.25 else t.humanize.toDouble()
        var want = (h * slow + (1 - h) * fast) * t.amount
        if (t.flex > 0 && abs(slow) > 0.5 + 1.5 * (1 - t.flex)) want = 0.0
        val glide = if (t.mode == Tune.Robot) t.speed * 0.15 else t.speed * 0.4 // seconds
        corr = if (glide < frameSeconds) want else corr + (want - corr) * (1 - exp(-frameSeconds / glide))
        return 2.0.pow(corr / 12)
    }

    companion object {
        private const val NONE = Int.MIN_VALUE
        private const val CENTRE_TIME = 0.12
        private const val HYSTERESIS = 0.2

        fun nearest(midi: Double, key: Int, scale: Scale): Int {
            val r = midi.roundToInt()
            return (r - 3..r + 3).filter { scale.contains(it, key) }.minBy { abs(it - midi) }
        }
    }
}

/**
 * Finds the key of a recording: how long each note is sung (weighted by loudness), matched
 * against the Krumhansl-Kessler key profiles. Returns key 0..11 and major/minor, or null if
 * there's too little singing to tell.
 */
object KeyFinder {
    private val MAJOR = doubleArrayOf(6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
    private val MINOR = doubleArrayOf(6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)

    fun find(pcm: Pcm, sampleRate: Int): Pair<Int, Scale>? {
        val tracker = PitchTracker(sampleRate)
        val frame = DoubleArray(2048)
        val hist = DoubleArray(12)
        var voiced = 0
        var pos = 0
        val ch = pcm.channels
        while (pos + frame.size < pcm.frames) {
            var e = 0.0
            for (i in frame.indices) {
                var s = 0.0
                for (c in 0 until ch) s += pcm.data[(pos + i) * ch + c]
                frame[i] = s / ch / 32768.0
                e += frame[i] * frame[i]
            }
            val f0 = tracker.detect(frame)
            if (f0 > 0) {
                val m = 69 + 12 * log2(f0 / 440)
                hist[Math.floorMod(m.roundToInt(), 12)] += kotlin.math.sqrt(e / frame.size)
                voiced++
            }
            pos += 1024
        }
        if (voiced < 20) return null
        var best = -2.0; var bestKey = 0; var bestScale = Scale.Major
        for (k in 0 until 12) for ((profile, scale) in listOf(MAJOR to Scale.Major, MINOR to Scale.Minor)) {
            val r = correlate(hist, profile, k)
            if (r > best) { best = r; bestKey = k; bestScale = scale }
        }
        return bestKey to bestScale
    }

    private fun correlate(h: DoubleArray, p: DoubleArray, key: Int): Double {
        val hm = h.average(); val pm = p.average()
        var num = 0.0; var dh = 0.0; var dp = 0.0
        for (i in 0 until 12) {
            val a = h[(i + key) % 12] - hm; val b = p[i] - pm
            num += a * b; dh += a * a; dp += b * b
        }
        return num / kotlin.math.sqrt(dh * dp + 1e-12)
    }
}
