package com.andrometa.talktape.audio

import kotlin.math.abs
import kotlin.math.exp

/** What the player is doing with its hands, as opposed to the knobs: held buttons. */
class Hands {
    @Volatile var freeze = false
    @Volatile var stutter = false
}

/**
 * Everything after the voice, in studio order: polish (channel strip) -> drive -> character
 * (places, old tape, wobble) -> freeze ->
 * fly-around -> ghost swell -> twin voices / echo / reverb / limiter. Stereo in place, then
 * interleaved into the output.
 */
class PostChain(sampleRate: Int) {
    private val polish = Polish(sampleRate)
    private val drive = Drive(sampleRate)
    private val character = CharacterFx(sampleRate)
    private val freezer = Freezer(sampleRate)
    private val fly = FlyAround(sampleRate)
    private val space = SpaceFx(sampleRate)

    val silent get() = space.silent && !freezer.active

    fun reset() { polish.reset(); drive.reset(); character.reset(); freezer.reset(); fly.reset(); space.reset() }

    fun process(l: FloatArray, r: FloatArray, n: Int, fx: Fx, hands: Hands?, ghost: FloatArray?, out: FloatArray) {
        if (fx.polish.amount > 0f) polish.process(l, r, n, fx.polish)
        drive.process(l, r, n, fx.drive)
        character.process(l, r, n, fx.place, fx.oldTape, fx.wobble)
        // Always listening (cheap), so a press can freeze what was just heard.
        if (hands != null) freezer.process(l, r, n, hands.freeze)
        if (fx.fly.mode != Fly.Off) fly.process(l, r, n, fx.fly)
        if (ghost != null) for (i in 0 until n) { l[i] += ghost[i]; r[i] += ghost[i] }
        space.process(l, r, fx, out)
    }
}

/**
 * Plays a tape through all the effects. Owns the playhead, so tape speed, talk speed,
 * direction, loops, stutters and scratching can all move it between any two blocks
 * without a click. Output is always stereo (interleaved L,R).
 */
class TapeRenderer(private val sampleRate: Int, private val channels: Int = 1) {
    private val engine = VoiceEngine(sampleRate, channels)
    private val size = engine.size
    val block = engine.hop
    private val frames = Array(channels) { DoubleArray(size) }
    private val left = FloatArray(block)
    private val right = FloatArray(block)
    private val ghostBlock = FloatArray(block)
    private val post = PostChain(sampleRate)
    private var tail = 0
    private var primed = false
    private var jumpFrom = Double.NaN

    /** Playhead in frames. */
    var position = 0.0
    /** The tape's noise (for clean-up), whole-tape ghost swell, word starts (for auto stutter). */
    var noiseProfile: DoubleArray? = null
    var ghostTrack: FloatArray? = null
    var onsets: IntArray? = null
    var hands: Hands? = null

    fun reset(at: Double) {
        position = at; tail = 0; primed = false; jumpFrom = Double.NaN
        engine.reset(); post.reset(); stutterLeft = 0; stutterHeld = false; nextOnset = -1
    }

    /** Moves the playhead without a click: the next block crossfades from where it was. */
    fun jump(to: Double) {
        if (jumpFrom.isNaN()) jumpFrom = position
        position = to
        engine.restartPhases()
    }

    /** Looping: keeps the playhead inside [a, b), carrying any overshoot round. Call after each render. */
    fun wrapLoop(a: Int, b: Int, fx: Fx) {
        if (b - a < sampleRate / 10) return
        if (!fx.reverse && position >= b) jump(a + (position - b))
        else if (fx.reverse && position <= a) jump(b - (a - position))
    }

    fun atEnd(length: Int, fx: Fx) = if (fx.reverse) position <= 0.0 else position >= length

    /** True once the playhead has run off the end (or the start, when reversed) and the echoes have died. */
    fun finished(length: Int, fx: Fx) =
        atEnd(length, fx) && (!fx.hasSpace || post.silent || tail > sampleRate * MAX_TAIL_SECONDS)

    /** Renders [block] stereo frames (2 * block values) into [out] and advances the playhead. */
    fun render(samples: ShortArray, length: Int, fx: Fx, out: FloatArray) {
        val dir = if (fx.reverse) -1.0 else 1.0
        val advance = block * fx.tempo * fx.tapeSpeed * dir
        val before = position
        if (!engine.needed(fx)) {
            // Tape speed and backwards are just how the playhead moves: no vocoder needed.
            if (primed) { primed = false; engine.reset() }
            straight(samples, length, fx.tapeSpeed * dir)
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
        jumpFrom = Double.NaN // the vocoder's overlap tail already blends a jump
        post.process(left, right, block, fx, hands, ghostFor(fx, before, dir), out)
        if (atEnd(length, fx)) tail += block
        position += advance
        stutter(fx, before, dir)
    }

    /** Reel scratch: the playhead chases the finger ([target]) like a hand on a spinning reel. */
    fun scratch(samples: ShortArray, length: Int, target: Double, fx: Fx, out: FloatArray) {
        for (i in 0 until block) {
            // Critically damped follow: quick, no overshoot, top speed 8x.
            scratchVel += ((target - position) * 0.0016 - scratchVel) * 0.02
            scratchVel = scratchVel.coerceIn(-8.0, 8.0)
            position += scratchVel
            // Faster than normal speed would alias: soften the top end in step with the speed.
            val cut = 1 - exp(-1.0 / (1 + abs(scratchVel) * 0.8))
            for (c in 0 until channels) {
                val x = sampleAt(samples, length, c, position)
                scratchLp[c] += cut * (x - scratchLp[c])
            }
            left[i] = scratchLp[0].toFloat(); right[i] = scratchLp[channels - 1].toFloat()
        }
        post.process(left, right, block, fx, hands, null, out)
    }
    private var scratchVel = 0.0
    private val scratchLp = DoubleArray(2)
    /** Hand the motion over when the finger lets go (so play carries on from the reel's speed). */
    val scratchSpeed get() = scratchVel

    private fun straight(samples: ShortArray, length: Int, step: Double) {
        for (i in 0 until block) {
            var l = sampleAt(samples, length, 0, position + i * step)
            var r = if (channels == 2) sampleAt(samples, length, 1, position + i * step) else l
            if (!jumpFrom.isNaN()) {
                val w = i.toDouble() / block
                l = sampleAt(samples, length, 0, jumpFrom + i * step) * (1 - w) + l * w
                r = (if (channels == 2) sampleAt(samples, length, 1, jumpFrom + i * step) else sampleAt(samples, length, 0, jumpFrom + i * step)) * (1 - w) + r * w
            }
            left[i] = l.toFloat(); right[i] = r.toFloat()
        }
    }

    private fun voiceBlock(samples: ShortArray, length: Int, fx: Fx) {
        val step = fx.tapeSpeed * if (fx.reverse) -1.0 else 1.0
        for (c in 0 until channels) {
            val f = frames[c]
            for (i in 0 until size) f[i] = sampleAt(samples, length, c, position + i * step)
        }
        engine.process(frames, block * fx.tempo.toDouble(), fx, profile = noiseProfile)
        System.arraycopy(engine.left, 0, left, 0, block)
        System.arraycopy(engine.right, 0, right, 0, block)
    }

    private fun ghostFor(fx: Fx, from: Double, dir: Double): FloatArray? {
        val g = ghostTrack ?: return null
        if (fx.ghost.amount <= 0f) return null
        val step = fx.tapeSpeed * dir
        val amt = fx.ghost.amount * 2
        for (i in 0 until block) {
            val p = from + i * step
            val j = p.toInt()
            ghostBlock[i] = if (j < 0 || j + 1 >= g.size) 0f else ((g[j] + (g[j + 1] - g[j]) * (p - j)) * amt).toFloat()
        }
        return ghostBlock
    }

    // Stutter state: repeating [stutterStart, stutterEnd) [stutterLeft] more times.
    private var stutterStart = 0.0
    private var stutterEnd = 0.0
    private var stutterLeft = 0
    private var stutterHeld = false
    private var nextOnset = -1

    private fun stutter(fx: Fx, before: Double, dir: Double) {
        val slice = fx.stutter.sliceSeconds * sampleRate * fx.tapeSpeed
        val held = hands?.stutter == true
        if (held && !stutterHeld) {
            // Hold: repeat what just played.
            stutterEnd = position; stutterStart = position - slice * dir; stutterLeft = Int.MAX_VALUE
            jump(stutterStart)
        }
        if (!held && stutterHeld) stutterLeft = 0
        stutterHeld = held
        val passed = if (dir > 0) position >= stutterEnd else position <= stutterEnd
        if (stutterLeft > 0 && passed) {
            if (stutterLeft != Int.MAX_VALUE) stutterLeft--
            jump(stutterStart + (position - stutterEnd))
            return
        }
        // Auto: a word starts inside this block -> play its first slice [repeats] times.
        val on = onsets ?: return
        if (!fx.stutter.auto || held || stutterLeft > 0 || dir < 0) return
        if (nextOnset < 0 || nextOnset >= on.size || (nextOnset > 0 && on[nextOnset - 1] > before)) {
            nextOnset = on.indexOfFirst { it >= before }.let { if (it < 0) on.size else it }
        }
        while (nextOnset < on.size && on[nextOnset] < before) nextOnset++
        if (nextOnset < on.size && on[nextOnset] < position) {
            stutterStart = on[nextOnset].toDouble(); stutterEnd = stutterStart + slice
            stutterLeft = fx.stutter.repeats.coerceIn(2, 8) - 1
            nextOnset++
        }
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
        fun outChannels(channels: Int, fx: Fx) = if (channels == 2 || fx.makesStereo) 2 else 1

        /** Word starts on a tape, from its 10 ms loudness outline: loud after a quiet stretch. */
        fun onsetsOf(peaks: FloatArray, peakFrames: Int): IntArray {
            val out = ArrayList<Int>()
            var quiet = 0
            for (i in peaks.indices) {
                if (peaks[i] < 0.03f) { quiet++; continue }
                if (quiet >= 8 && peaks[i] > 0.08f) out += i * peakFrames
                quiet = 0
            }
            return out.toIntArray()
        }

        /** Whole-tape offline render, for "save as new tape". */
        fun renderAll(src: Pcm, fx: Fx, sampleRate: Int, onsets: IntArray? = null): Pcm {
            val length = src.frames
            val r = TapeRenderer(sampleRate, src.channels)
            r.reset(if (fx.reverse) length - 1.0 else 0.0)
            if (fx.clean > 0f) r.noiseProfile = VoiceProcessor.noiseProfile(src)
            if (fx.ghost.amount > 0f) r.ghostTrack = Ghost.render(src.data, src.channels, sampleRate, fx.ghost.length)
            r.onsets = onsets
            val buf = FloatArray(r.block * 2)
            val ch = outChannels(src.channels, fx)
            val est = ((length / (fx.tempo * fx.tapeSpeed)).toInt() + r.block * 8) * ch
            var out = ShortArray(est)
            var n = 0
            // Output block i lines up with the frame that starts at the playhead, so no latency to trim.
            var guard = 0
            while (!r.finished(length, fx) && guard++ < length / r.block * 12 + 2000) {
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
    private val engine = VoiceEngine(sampleRate, 1)
    private val history = arrayOf(DoubleArray(engine.size))
    private val post = PostChain(sampleRate)
    private val l = FloatArray(engine.hop)
    private val r = FloatArray(engine.hop)
    val block get() = engine.hop
    var hands: Hands? = null

    /** [out] gets 2 * block interleaved stereo values. */
    fun process(input: ShortArray, fx: Fx, out: FloatArray) {
        val h = history[0]
        System.arraycopy(h, block, h, 0, h.size - block)
        for (i in 0 until block) h[h.size - block + i] = input[i] / 32768.0
        engine.process(history, block.toDouble(), fx.copy(tempo = 1f), pitchExtra = fx.tapeSpeed.toDouble())
        System.arraycopy(engine.left, 0, l, 0, block)
        System.arraycopy(engine.right, 0, r, 0, block)
        post.process(l, r, block, fx, hands, null, out)
    }
}
