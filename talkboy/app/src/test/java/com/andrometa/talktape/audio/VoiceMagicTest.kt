package com.andrometa.talktape.audio

import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/** Harmony, talk-box, whisper, clean-up, freeze, stutter and scratch, measured. */
class VoiceMagicTest {
    private val sr = 44100

    /** Glottal pulses through an /a/ vowel's resonances: a stand-in for a sung vowel at [f0]. */
    private fun vowel(f0: Double, seconds: Double, noiseDb: Double = -200.0, gapsEvery: Double = 0.0): ShortArray {
        val n = (sr * seconds).toInt()
        var x = DoubleArray(n)
        var next = 0.0
        for (i in 0 until n) if (i >= next) { x[i] = 1.0; next += sr / f0 }
        for ((f, bw) in listOf(700.0 to 80.0, 1220.0 to 100.0, 2600.0 to 140.0)) {
            val r = exp(-PI * bw / sr); val a1 = 2 * r * cos(2 * PI * f / sr); val a2 = -r * r
            val y = DoubleArray(n)
            for (i in 0 until n) y[i] = x[i] + a1 * (if (i > 0) y[i - 1] else 0.0) + a2 * (if (i > 1) y[i - 2] else 0.0)
            x = y
        }
        if (gapsEvery > 0) for (i in 0 until n) if ((i / (sr * gapsEvery)).toInt() % 2 == 1) x[i] = 0.0
        val peak = x.maxOf { abs(it) }
        val rnd = Random(3)
        val noise = Math.pow(10.0, noiseDb / 20)
        return ShortArray(n) { ((x[it] / peak * 0.5 + noise * rnd.nextGaussian()) * 32767).toInt().coerceIn(-32767, 32767).toShort() }
    }

    private fun mono(p: Pcm) = if (p.channels == 1) p.data else ShortArray(p.frames) { ((p.data[2 * it] + p.data[2 * it + 1]) / 2).toShort() }

    /** Level in dB of [hz] in the middle second of [s]. */
    private fun toneDb(s: ShortArray, hz: Double): Double {
        val a = s.size / 4; val len = s.size / 2
        var re = 0.0; var im = 0.0
        for (i in 0 until len) {
            val w = 0.5 - 0.5 * cos(2 * PI * i / len)
            re += s[a + i] * w * cos(2 * PI * hz * i / sr); im -= s[a + i] * w * sin(2 * PI * hz * i / sr)
        }
        return 20 * log10(hypot(re, im) / len + 1e-9)
    }

    private fun pitchOf(s: ShortArray, from: Int = s.size / 3): Double {
        val t = PitchTracker(sr)
        val f = DoubleArray(2048) { s[from + it] / 32768.0 }
        return t.detect(f)
    }

    private fun rms(s: ShortArray, from: Int, to: Int): Double {
        var e = 0.0
        for (i in from until to) e += s[i].toDouble() * s[i]
        return sqrt(e / (to - from))
    }

    @Test fun harmonyAddsAThirdThatFitsTheKey() {
        // Singing A (220) in C major: the 3rd above is C (261.6), not C# (277.2).
        val src = vowel(220.0, 2.0)
        val fx = Fx(tune = TuneFx(Tune.Off, key = 0, scale = Scale.Major), harmony = HarmonyFx(Harmony.Third, mix = 0.8f))
        val out = mono(TapeRenderer.renderAll(Pcm(src, 1), fx, sr))
        val lead = toneDb(out, 220.0); val c = toneDb(out, 261.63); val cs = toneDb(out, 277.18)
        val before = toneDb(src, 261.63)
        println("harmony: lead ${"%.1f".format(lead)} dB, C ${"%.1f".format(c)} dB (input had ${"%.1f".format(before)}), C# ${"%.1f".format(cs)} dB")
        assertTrue("third present", c > before + 15)
        assertTrue("diatonic third, not major", c > cs + 10)
    }

    @Test fun talkBoxPlaysTheNoteButKeepsTheVowel() {
        // Speak at 150 Hz; robot plays D3 (146.8)? use A2 (110) so it's clearly the carrier.
        val src = vowel(150.0, 2.0)
        val out = mono(TapeRenderer.renderAll(Pcm(src, 1), Fx(talk = TalkBoxFx(TalkBox.Robot, note = 45)), sr))
        val p = pitchOf(out)
        // Vowel kept: compare spectral peak region energy near F1 (700) vs a valley (1000) in the output.
        val f1 = toneDb(out, 660.0); val valley = toneDb(out, 990.0)
        println("talk-box: output pitch ${"%.1f".format(p)} Hz (want 110), F1 band ${"%.1f".format(f1)} dB vs valley ${"%.1f".format(valley)} dB")
        assertTrue(abs(p - 110) < 3)
        assertTrue("vowel shape kept", f1 > valley + 6)
    }

    @Test fun whisperHasNoPitchButKeepsTheVoiceShape() {
        val src = vowel(140.0, 2.0)
        val out = mono(TapeRenderer.renderAll(Pcm(src, 1), Fx(whisper = 1f), sr))
        val voiced = (0 until 20).count { pitchOf(out, sr / 4 + it * 2048) > 0 }
        val inVoiced = (0 until 20).count { pitchOf(src, sr / 4 + it * 2048) > 0 }
        val ratio = rms(out, sr / 4, 3 * sr / 2) / rms(src, sr / 4, 3 * sr / 2)
        println("whisper: frames with pitch $voiced/20 (input $inVoiced/20), loudness ratio ${"%.2f".format(ratio)}")
        assertTrue(voiced <= 3 && inVoiced >= 18)
        assertTrue(ratio in 0.5..1.6)
    }

    @Test fun cleanUpRemovesHissBetweenWords() {
        // Vowel bursts with gaps, plus hiss at -40 dBFS.
        val src = vowel(160.0, 3.0, noiseDb = -40.0, gapsEvery = 0.25)
        val out = mono(TapeRenderer.renderAll(Pcm(src, 1), Fx(clean = 1f), sr))
        fun gap(s: ShortArray) = rms(s, (0.27 * sr).toInt(), (0.47 * sr).toInt())
        fun word(s: ShortArray) = rms(s, (0.53 * sr).toInt(), (0.72 * sr).toInt())
        val gapDrop = 20 * log10(gap(src) / gap(out))
        val wordDrop = 20 * log10(word(src) / word(out))
        println("clean-up: hiss in gaps down ${"%.1f".format(gapDrop)} dB, words changed ${"%.1f".format(wordDrop)} dB")
        assertTrue(gapDrop > 12)
        assertTrue(abs(wordDrop) < 2)
    }

    @Test fun freezeHoldsTheSound() {
        val src = vowel(200.0, 1.0).copyOf(sr * 3) // a vowel, then 2 s of silence
        val r = TapeRenderer(sr)
        r.reset(0.0)
        val hands = Hands(); r.hands = hands
        val buf = FloatArray(r.block * 2)
        val levels = ArrayList<Double>()
        var t = 0
        while (t < sr * 3) {
            hands.freeze = t in (sr * 8 / 10) until (sr * 25 / 10) // hold from 0.8 s to 2.5 s
            r.render(src, src.size, Fx(), buf)
            var e = 0.0; for (v in buf) e += v * v
            levels += sqrt(e / buf.size)
            t += r.block
        }
        // Average over 100 ms: a frozen drone is noise-like block to block.
        fun at(sec: Double): Double { val i = (sec * sr / r.block).toInt(); return levels.subList(i - 4, i + 4).average() }
        val voice = at(0.5); val held = at(2.0); val after = at(2.9)
        println("freeze: voice ${"%.3f".format(voice)}, held in silence ${"%.3f".format(held)}, after release ${"%.4f".format(after)}")
        assertTrue("still sounding a second into the silence", held > voice * 0.3)
        // 0.4 s release: 0.4 s after letting go about 37% is left.
        assertTrue("fades after release", after < held * 0.5)
    }

    @Test fun autoStutterRepeatsTheStartOfAWord() {
        // Silence, then a word at 0.5 s: the first slice should play 3 times, making it longer.
        val src = ShortArray(sr * 2).also { s -> val v = vowel(180.0, 1.0); System.arraycopy(v, 0, s, sr / 2, v.size) }
        val peaks = FloatArray(src.size / 441) { b -> var m = 0; for (i in b * 441 until minOf(src.size, (b + 1) * 441)) m = maxOf(m, abs(src[i].toInt())); m / 32768f }
        val onsets = TapeRenderer.onsetsOf(peaks, 441)
        val fx = Fx(stutter = StutterFx(auto = true, slice = 0.5f, repeats = 3))
        val out = mono(TapeRenderer.renderAll(Pcm(src, 1), fx, sr, onsets))
        val slice = fx.stutter.sliceSeconds * sr
        println("stutter: onsets ${onsets.toList()}, length ${src.size} -> ${out.size} (want +${(2 * slice).toInt()})")
        assertTrue(onsets.size == 1 && abs(onsets[0] - sr / 2) < 900)
        assertTrue(abs(out.size - (src.size + 2 * slice)) < 1200)
    }

    @Test fun scratchFollowsTheFinger() {
        val src = vowel(200.0, 2.0)
        val r = TapeRenderer(sr)
        r.reset(sr * 0.5)
        val buf = FloatArray(r.block * 2)
        // Finger pushes the reel forward 0.3 s over 0.2 s, then back.
        repeat(20) { r.scratch(src, src.size, sr * 0.8, Fx(), buf) }
        val forward = r.position
        repeat(20) { r.scratch(src, src.size, sr * 0.5, Fx(), buf) }
        println("scratch: forward to ${"%.2f".format(forward / sr)} s (target 0.80), back to ${"%.2f".format(r.position / sr)} s (target 0.50)")
        assertTrue(abs(forward - sr * 0.8) < sr * 0.03 && abs(r.position - sr * 0.5) < sr * 0.03)
    }
}
