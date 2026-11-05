package com.andrometa.talktape.audio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.sin

/** One harmony singer: [degree] scale steps from the lead's note, plus [octave] octaves. */
class Part(val degree: Int = 0, val octave: Int = 0)

enum class Harmony(val label: String, val parts: List<Part>) {
    Off("Off", emptyList()),
    Third("3rd above", listOf(Part(2))),
    Fifth("5th above", listOf(Part(4))),
    Below("3rd below", listOf(Part(-2))),
    Triad("Chord", listOf(Part(2), Part(4))),
    Octaves("Octaves", listOf(Part(octave = 1), Part(octave = -1))),
    Choir("Choir", listOf(Part(2), Part(4), Part(octave = -1))),
    Low("Low octave", listOf(Part(octave = -1))),
}

/**
 * Harmony singers that follow the lead (and its vibrato) at intervals that fit the key:
 * a "3rd above" is 3 or 4 semitones depending on the note, like a real backing singer.
 * mix 0..1 their level; spread 0..1 how wide they sit; humanize 0..1 how loose they are
 * (tiny timing, tuning and voice-size differences, so they sound like different people).
 */
data class HarmonyFx(val style: Harmony = Harmony.Off, val mix: Float = 0.7f, val spread: Float = 0.8f, val humanize: Float = 0.5f) {
    val on get() = style != Harmony.Off
}

enum class TalkBox(val label: String) { Off("Off"), Robot("Robot"), Synth("Synth"), Chord("Chord"), Bass("Bass") }

/**
 * Talk-box / vocoder: your words played on a synth. Robot = one fixed note ([note], MIDI),
 * Synth = follows your (auto-tuned) melody, Chord = a chord in the key under your note,
 * Bass = an octave below you. tone 0..1 dark to bright; mix 0..1 against your own voice.
 */
data class TalkBoxFx(val mode: TalkBox = TalkBox.Off, val note: Int = 50, val tone: Float = 0.6f, val mix: Float = 1f) {
    val on get() = mode != TalkBox.Off
}

/**
 * Everything the vocoder does for one block of [hop] samples: pitch detection, auto-tune,
 * the lead voice (with whisper / talk-box / noise clean-up) per tape channel, plus the
 * harmony singers, mixed to stereo in [left] / [right].
 */
class VoiceEngine(private val sampleRate: Int, private val channels: Int) {
    private val procs = Array(channels) { VoiceProcessor(sampleRate) }
    val size = procs[0].size
    val hop = procs[0].hop
    private val frameSeconds = hop.toDouble() / sampleRate
    private val tracker = PitchTracker(sampleRate)
    private val tune = AutoTune(frameSeconds)
    /** Follows the lead's *output* note (never corrects): harmony and chords build on it. */
    private val follow = AutoTune(frameSeconds)
    private val carrier = Carrier(sampleRate)
    private val singers = Array(3) { procs[0].Voice(10L + it) }
    private val singerOut = Array(3) { FloatArray(hop) }
    private val singerDelay = Array(3) { Line((0.05 * sampleRate).toInt()) }
    private val semis = DoubleArray(3)
    private val mid = DoubleArray(size)
    private val voice = Array(channels) { FloatArray(hop) }
    private val hz = DoubleArray(Carrier.MAX_OSC)
    private var lastLeadHz = 0.0
    val left = FloatArray(hop)
    val right = FloatArray(hop)

    fun reset() { procs.forEach { it.reset() }; tune.reset(); follow.reset(); singerDelay.forEach { it.reset() }; semis.fill(0.0) }
    fun restartPhases() = procs.forEach { it.restartPhases() }

    /** Is the vocoder needed at all for these settings? (If not, the caller copies the tape straight through.) */
    fun needed(fx: Fx) = fx.tempo != 1f || fx.pitch != 0f || fx.formant != 0f || fx.tune.on || fx.harmony.on ||
        fx.talk.on || fx.whisper > 0f || fx.clean > 0f

    /**
     * @param frames      one analysis frame per channel
     * @param analysisHop input samples since the last frame (hop * talk speed)
     * @param pitchExtra  extra pitch factor (live voice folds tape speed in here)
     * @param profile     the tape's noise profile, or null to track noise live
     */
    fun process(frames: Array<DoubleArray>, analysisHop: Double, fx: Fx, pitchExtra: Double = 1.0, profile: DoubleArray? = null) {
        val needPitch = fx.pitch != 0f || fx.formant != 0f || pitchExtra != 1.0 || fx.tune.on || fx.harmony.on || fx.talk.on || fx.whisper > 0f
        val f0 = if (needPitch) {
            for (i in 0 until size) { var s = 0.0; for (c in 0 until channels) s += frames[c][i]; mid[i] = s / channels }
            tracker.detect(mid)
        } else 0.0
        val base = fx.pitchFactor * pitchExtra
        val lead = base * tune.ratio(f0, base, fx.tune)
        val formant = fx.formantFactor * if (pitchExtra != 1.0) pitchExtra else 1.0
        val envelope = lead != 1.0 || formant != 1.0 || fx.harmony.on || fx.talk.on || fx.whisper > 0f
        for (c in 0 until channels) procs[c].analyze(frames[c], analysisHop, f0, envelope, fx.clean, profile)

        // Where the lead is now, as a note in the key (harmony and chords hang off it).
        val keyScale = if (fx.tune.scale == Scale.Chromatic) Scale.Major else fx.tune.scale
        val key = fx.tune.key
        if (fx.harmony.on || fx.talk.mode == TalkBox.Chord) follow.ratio(f0, lead, TuneFx(Tune.Gentle, key, keyScale, amount = 0f))
        val note = follow.currentNote
        if (f0 > 0) lastLeadHz = f0 * lead

        val talk = fx.talk
        if (talk.on) {
            hz.fill(0.0)
            when (talk.mode) {
                TalkBox.Robot -> hz[0] = midiHz(talk.note.toDouble())
                TalkBox.Synth -> { hz[0] = lastLeadHz; hz[1] = lastLeadHz * 1.004 }
                TalkBox.Bass -> { hz[0] = lastLeadHz / 2; hz[1] = lastLeadHz / 2 * 1.003 }
                TalkBox.Chord -> if (note >= 0) {
                    hz[0] = midiHz(note - 12.0)
                    hz[1] = midiHz(note.toDouble())
                    hz[2] = midiHz(keyScale.step(note, key, 2).toDouble())
                    hz[3] = midiHz(keyScale.step(note, key, 4).toDouble())
                } else hz[0] = lastLeadHz
                TalkBox.Off -> {}
            }
            carrier.advance(hz, talk.tone)
        }
        for (c in 0 until channels) {
            procs[c].lead.render(lead, formant, voice[c], whisper = fx.whisper, carrier = if (talk.on) carrier else null, talk = talk.mix)
        }
        System.arraycopy(voice[0], 0, left, 0, hop)
        System.arraycopy(voice[channels - 1], 0, right, 0, hop)

        val h = fx.harmony
        if (h.on) {
            val parts = h.style.parts
            for (i in parts.indices) {
                val p = parts[i]
                val want = if (note >= 0) (keyScale.step(note, key, p.degree) - note + 12 * p.octave).toDouble() else semis[i]
                semis[i] += (want - semis[i]) * GLIDE
                // Each singer is a slightly different person: a few cents off, a little bigger or smaller.
                val detune = DETUNE[i] * h.humanize
                val size = 2.0.pow(SIZE[i] * h.humanize / 12)
                singers[i].render(lead * 2.0.pow((semis[i] + detune / 100) / 12), formant * size, singerOut[i])
                val delay = (0.004 + 0.022 * h.humanize * DELAY[i]) * sampleRate
                val pan = PAN[i] * h.spread
                val gl = cos((pan + 1) * PI / 4) * h.mix * 1.2
                val gr = sin((pan + 1) * PI / 4) * h.mix * 1.2
                val line = singerDelay[i]
                val out = singerOut[i]
                for (j in 0 until hop) {
                    line.write(out[j].toDouble())
                    val y = line.read(delay)
                    left[j] += (y * gl).toFloat(); right[j] += (y * gr).toFloat()
                }
            }
        }
    }

    private fun midiHz(m: Double) = 440 * 2.0.pow((m - 69) / 12)

    companion object {
        private const val GLIDE = 0.35
        private val DETUNE = doubleArrayOf(6.0, -7.0, 4.0)
        private val SIZE = doubleArrayOf(0.6, -0.5, -0.8)
        private val DELAY = doubleArrayOf(0.6, 1.0, 0.3)
        private val PAN = doubleArrayOf(-0.8, 0.8, 0.0)

        fun cents(a: Double, b: Double) = 1200 * log2(a / b)
    }
}
