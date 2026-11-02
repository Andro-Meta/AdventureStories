package com.andrometa.talktape.audio

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlin.math.sqrt

enum class Mode { Idle, Playing, Recording, Cueing, Live, Scratching }

data class DeckState(
    val mode: Mode = Mode.Idle,
    /** Pause key is down: [mode] is what resumes when it pops back up. */
    val paused: Boolean = false,
    val position: Int = 0,
    val length: Int = 0,
    /** 0..1 loudness for the meters. */
    val level: Float = 0f,
    /** How fast the tape moves (negative = backwards), drives the reel animation. */
    val speed: Float = 0f,
    val stereo: Boolean = false,
    val message: String? = null,
    /** Loop points in frames, -1 = not set (the loop then uses the tape's start / end). */
    val loopStart: Int = -1,
    val loopEnd: Int = -1,
    val looping: Boolean = false,
)

/**
 * The tape machine. One worker thread at a time does the audio work (play, record,
 * cue or live); everything public is called from the main thread.
 */
class TapeDeck(private val sampleRate: Int, private val maxFrames: Int) {
    private val _state = MutableStateFlow(DeckState())
    val state: StateFlow<DeckState> = _state

    /** Effects for playback and live; safe to change while playing. */
    @Volatile var fx = Fx()

    /** New (empty) tapes record in stereo. A tape keeps the channels it was first recorded in. */
    @Volatile var stereoRecording = false

    /** Play through both speakers the same (mono) instead of in stereo. */
    @Volatile var monoOutput = false

    /** Held performance buttons (freeze, stutter): read by the audio thread every block. */
    val hands = Hands()

    /** Per-tape helpers worked out in the background: noise for clean-up, ghost swell, word starts. */
    @Volatile var noiseProfile: DoubleArray? = null
    @Volatile var ghostTrack: FloatArray? = null
    @Volatile var onsets: IntArray? = null

    @Volatile private var scratchTarget = 0.0
    private var resumeAfterScratch = false

    /** A finger lands on the reels: the tape stops under it, like a hand on a turning reel. */
    fun scratchStart() {
        val s = _state.value
        if (length == 0 || s.mode == Mode.Recording || s.mode == Mode.Live) return
        resumeAfterScratch = s.mode == Mode.Playing && !s.paused
        halt()
        scratchTarget = s.position.toDouble()
        start(Mode.Scratching, s.position) { scratchLoop(it) }
    }

    /** The finger moved the tape by [frames] (negative = backwards). */
    fun scratchBy(frames: Double) { scratchTarget = (scratchTarget + frames).coerceIn(0.0, length.toDouble()) }

    fun scratchEnd() {
        if (_state.value.mode != Mode.Scratching) return
        halt()
        _state.update { it.copy(mode = Mode.Idle, level = 0f, speed = 0f) }
        if (resumeAfterScratch) play()
    }

    /** Called on the worker thread with a fresh copy of the tape after a recording ends. */
    var onRecorded: ((Pcm) -> Unit)? = null

    // Owned by the worker while it runs, by the main thread otherwise (join() hands it over).
    private var samples = ShortArray(0)
    /** Length in frames (one sample per channel). */
    private var length = 0
    private var channels = 1

    private var worker: Thread? = null
    @Volatile private var running = false
    /** Non-zero while FF/REW is held: +1 forward, -1 back. */
    @Volatile private var cueDir = 0
    private var resumeAfterCue = false

    fun load(tape: Pcm) {
        stop()
        samples = tape.data; channels = tape.channels; length = tape.frames
        _state.value = DeckState(length = length, stereo = channels == 2, looping = _state.value.looping)
    }

    val isEmpty get() = _state.value.length == 0

    fun play() {
        val s = _state.value
        if (s.mode == Mode.Playing && !s.paused) return
        halt()
        if (length == 0) { say("This tape is empty. Press RECORD first!"); return }
        var pos = s.position
        // Kid-friendly: pressing play at the end starts again instead of doing nothing.
        if (!fx.reverse && pos >= length - sampleRate / 10) pos = 0
        if (fx.reverse && pos <= sampleRate / 10) pos = length
        if (s.looping) {
            val (a, b) = loopRange(s)
            if (pos < a || pos >= b) pos = if (fx.reverse) b else a
        }
        start(Mode.Playing, pos) { playLoop(it) }
    }

    /** The stretch that loops: the markers that are set, the tape's ends for the rest. */
    private fun loopRange(s: DeckState): Pair<Int, Int> {
        val a = if (s.loopStart >= 0) s.loopStart else 0
        val b = if (s.loopEnd >= 0) s.loopEnd else length
        return minOf(a, b) to maxOf(a, b)
    }

    fun toggleLoop() = _state.update { it.copy(looping = !it.looping) }

    /** Marks the loop start (or end) at [pos]; a start after the end swaps them. */
    fun setLoopStart(pos: Int) = setLoop(pos, _state.value.loopEnd)
    fun setLoopEnd(pos: Int) = setLoop(_state.value.loopStart, pos)

    fun setLoop(start: Int, end: Int) {
        var a = start.coerceAtMost(length); var b = end.coerceAtMost(length)
        if (a >= 0 && b >= 0 && a > b) { val t = a; a = b; b = t }
        if (a >= 0 && b >= 0 && b - a < sampleRate / 5) { say("That loop is too short. Pick points further apart!"); return }
        _state.update { it.copy(loopStart = a, loopEnd = b) }
    }

    fun clearLoop() = _state.update { it.copy(loopStart = -1, loopEnd = -1) }

    fun record() {
        val s = _state.value
        if (s.mode == Mode.Recording && !s.paused) return
        halt()
        if (s.position >= maxFrames) { say("This tape is full! Grab a new tape."); return }
        start(Mode.Recording, s.position) { recordLoop(it) }
    }

    fun live() {
        halt()
        start(Mode.Live, _state.value.position) { liveLoop() }
    }

    /** FF/REW held down: zoom through the tape with the classic squeaky sound. */
    fun cueStart(dir: Int) {
        val s = _state.value
        resumeAfterCue = s.mode == Mode.Playing && !s.paused
        cueDir = dir
        if (s.mode == Mode.Playing && !s.paused) {
            _state.update { it.copy(mode = Mode.Cueing) } // the play loop picks up cueDir live
            return
        }
        halt()
        if (length == 0) { cueDir = 0; return }
        start(Mode.Cueing, s.position) { playLoop(it) }
    }

    fun cueEnd() {
        if (cueDir == 0) return
        cueDir = 0
        val s = _state.value
        val atEdge = s.position <= 0 || s.position >= length
        if (resumeAfterCue && !atEdge && s.mode == Mode.Cueing && worker != null) {
            _state.update { it.copy(mode = Mode.Playing) }
        } else {
            stop()
        }
    }

    /** Pause key: freezes whatever is going on; press again (or PLAY/REC) to carry on. */
    fun togglePause() {
        val s = _state.value
        when {
            s.paused -> when (s.mode) {
                Mode.Playing -> { _state.update { it.copy(paused = false) }; play() }
                Mode.Recording -> { _state.update { it.copy(paused = false) }; record() }
                else -> _state.update { it.copy(paused = false) }
            }
            s.mode == Mode.Playing || s.mode == Mode.Recording -> {
                halt()
                _state.update { it.copy(paused = true, level = 0f, speed = 0f) }
            }
        }
    }

    fun stop() {
        cueDir = 0
        halt()
        _state.update { it.copy(mode = Mode.Idle, paused = false, level = 0f, speed = 0f) }
    }

    fun skip(seconds: Int) = seek(_state.value.position + seconds * sampleRate)

    fun seek(pos: Int) {
        val s = _state.value
        if (s.mode == Mode.Recording || s.mode == Mode.Live) return
        val p = pos.coerceIn(0, length)
        val wasPlaying = s.mode == Mode.Playing && !s.paused
        halt()
        _state.update { it.copy(position = p) }
        if (wasPlaying && p < length) start(Mode.Playing, p) { playLoop(it) }
        else if (s.mode == Mode.Playing && !s.paused) _state.update { it.copy(mode = Mode.Idle) }
    }

    fun clearMessage() = _state.update { it.copy(message = null) }

    fun release() = stop()

    fun tell(msg: String) = say(msg)

    private fun say(msg: String) = _state.update { it.copy(message = msg) }

    private fun start(mode: Mode, pos: Int, body: (Int) -> Unit) {
        running = true
        _state.update { it.copy(mode = mode, paused = false, position = pos) }
        worker = Thread({
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
            try {
                body(pos)
            } catch (e: Exception) {
                running = false
                _state.update { it.copy(mode = Mode.Idle, level = 0f, speed = 0f, message = "Oops, the sound got stuck. Try again!") }
            }
        }, "tape-$mode").apply { start() }
    }

    /** Stops the worker and waits for it, so the tape data is ours again. */
    private fun halt() {
        running = false
        worker?.let { if (it !== Thread.currentThread()) it.join(2000) }
        worker = null
    }

    /** Called by a worker that ran off the end of the tape. */
    private fun finishedOnItsOwn(pos: Int) {
        running = false
        cueDir = 0
        _state.update { it.copy(mode = Mode.Idle, paused = false, position = pos, level = 0f, speed = 0f) }
    }

    /** Always stereo: the effects are stereo even when the tape isn't. */
    private fun newTrack(lowLatency: Boolean): AudioTrack {
        val min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        return AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(if (lowLatency) min else maxOf(min, 16384))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .apply { if (lowLatency) setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY) }
            .build()
    }

    @SuppressLint("MissingPermission") // checked by the UI before any recording starts
    private fun newRecorder(source: Int, stereo: Boolean = false): AudioRecord? {
        val mask = if (stereo) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
        val min = AudioRecord.getMinBufferSize(sampleRate, mask, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(source, sampleRate, mask, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 16384))
        } catch (e: SecurityException) {
            finishedOnItsOwn(_state.value.position); say("TalkTape needs the microphone to record."); return null
        } catch (e: IllegalArgumentException) {
            null
        }
        if (rec == null || rec.state != AudioRecord.STATE_INITIALIZED) {
            rec?.release()
            if (stereo) return null // caller falls back to mono
            finishedOnItsOwn(_state.value.position); say("The microphone is busy. Close other apps using it and try again.")
            return null
        }
        return rec
    }

    /** Both speakers the same, when the mono switch is on. */
    private fun downmixIfMono(buf: FloatArray) {
        if (!monoOutput) return
        for (i in 0 until buf.size / 2) { val m = 0.5f * (buf[2 * i] + buf[2 * i + 1]); buf[2 * i] = m; buf[2 * i + 1] = m }
    }

    private fun playLoop(startPos: Int) {
        val r = TapeRenderer(sampleRate, channels)
        r.reset(startPos.toDouble())
        r.hands = hands
        val fbuf = FloatArray(r.block * 2)
        val sbuf = ShortArray(r.block * 2)
        val track = newTrack(lowLatency = false)
        track.play()
        var ended = false
        var tick = 0
        var dspNanos = 0L
        var blocks = 0
        try {
            while (running) {
                val cue = cueDir
                val f = if (cue != 0) Fx(tapeSpeed = CUE_SPEED, reverse = cue < 0) else fx
                r.noiseProfile = noiseProfile; r.ghostTrack = ghostTrack; r.onsets = onsets
                if (r.finished(length, f)) { ended = true; break }
                val t0 = System.nanoTime()
                r.render(samples, length, f, fbuf)
                dspNanos += System.nanoTime() - t0; blocks++
                val st = _state.value
                if (st.looping && cue == 0) loopRange(st).let { (a, b) -> r.wrapLoop(a, b, f) }
                downmixIfMono(fbuf)
                val gain = if (cue != 0) 0.6f else 1f
                for (i in sbuf.indices) sbuf[i] = TapeRenderer.toPcm(fbuf[i] * gain)
                track.write(sbuf, 0, sbuf.size)
                if (tick++ % 3 == 0) {
                    val dir = if (f.reverse) -1f else 1f
                    val pos = r.position.toInt().coerceIn(0, length)
                    _state.update { it.copy(position = pos, level = levelOf(sbuf, sbuf.size), speed = f.tapeSpeed * f.tempo * dir) }
                }
            }
        } finally {
            if (ended) {
                // Let the last bit play out before letting go of the speaker.
                track.stop()
                val until = System.currentTimeMillis() + 400
                while (track.playState == AudioTrack.PLAYSTATE_PLAYING && System.currentTimeMillis() < until) Thread.sleep(10)
            } else {
                track.pause(); track.flush()
            }
            track.release()
        }
        // Over 100% of real time = stutter. One line per play, for checking slower phones.
        if (blocks > 0) android.util.Log.i("TalkTape", "dsp load %.0f%% of real time (%d ch, %s)".format(
            dspNanos / 1e9 / (blocks * r.block.toDouble() / sampleRate) * 100, channels, fx))
        val pos = r.position.toInt().coerceIn(0, length)
        if (ended) finishedOnItsOwn(pos) else _state.update { it.copy(position = pos) }
    }

    private fun recordLoop(startPos: Int) {
        // A blank tape takes the Mono/Stereo setting; a used one keeps what it is.
        if (length == 0) { channels = if (stereoRecording) 2 else 1; samples = ShortArray(0) }
        // CAMCORDER is the source phones wire to their stereo mic pair.
        var rec = if (channels == 2) newRecorder(MediaRecorder.AudioSource.CAMCORDER, stereo = true) else null
        if (channels == 2 && rec == null && length == 0) {
            channels = 1
            say("This phone can't record in stereo, so this tape is mono.")
        }
        val inCh = if (rec != null) 2 else 1
        if (rec == null) rec = newRecorder(MediaRecorder.AudioSource.MIC) ?: return
        _state.update { it.copy(stereo = channels == 2) }
        val buf = ShortArray(sampleRate / 20 * inCh)
        var pos = startPos
        var full = false
        rec.startRecording()
        try {
            while (running) {
                val n = rec.read(buf, 0, buf.size) / inCh
                if (n <= 0) continue
                val take = minOf(n, maxFrames - pos)
                if ((pos + take) * channels > samples.size) {
                    samples = samples.copyOf(minOf(maxFrames, maxOf(pos + take, samples.size / channels * 2, sampleRate * 10)) * channels)
                }
                for (i in 0 until take) {
                    val o = (pos + i) * channels
                    when {
                        inCh == channels -> System.arraycopy(buf, i * inCh, samples, o, inCh)
                        channels == 2 -> { samples[o] = buf[i]; samples[o + 1] = buf[i] }
                        else -> samples[o] = ((buf[2 * i] + buf[2 * i + 1]) / 2).toShort()
                    }
                }
                pos += take
                if (pos > length) length = pos
                _state.update { it.copy(position = pos, length = length, level = levelOf(buf, n * inCh), speed = 1f) }
                if (pos >= maxFrames) { full = true; break }
            }
        } finally {
            rec.stop(); rec.release()
            onRecorded?.invoke(Pcm(samples.copyOf(length * channels), channels))
        }
        if (full) { finishedOnItsOwn(pos); say("Tape full! That's the end of this tape.") }
    }

    private fun scratchLoop(startPos: Int) {
        val r = TapeRenderer(sampleRate, channels)
        r.reset(startPos.toDouble())
        r.hands = hands
        val fbuf = FloatArray(r.block * 2)
        val sbuf = ShortArray(r.block * 2)
        val track = newTrack(lowLatency = true)
        track.play()
        // Voice magic off while scratching (it needs a steady tape); the room effects stay.
        val roomOnly = fx.let { Fx(layers = it.layers, echo = it.echo, echoTime = it.echoTime, reverb = it.reverb) }
        var tick = 0
        try {
            while (running) {
                r.scratch(samples, length, scratchTarget, roomOnly, fbuf)
                downmixIfMono(fbuf)
                for (i in sbuf.indices) sbuf[i] = TapeRenderer.toPcm(fbuf[i])
                track.write(sbuf, 0, sbuf.size)
                if (tick++ % 2 == 0) {
                    val pos = r.position.toInt().coerceIn(0, length)
                    _state.update { it.copy(position = pos, level = levelOf(sbuf, sbuf.size), speed = r.scratchSpeed.toFloat()) }
                }
            }
        } finally {
            track.pause(); track.flush(); track.release()
        }
        _state.update { it.copy(position = r.position.toInt().coerceIn(0, length)) }
    }

    private fun liveLoop() {
        // VOICE_COMMUNICATION turns on the phone's echo canceller where it has one: fewer squeals.
        val rec = newRecorder(MediaRecorder.AudioSource.VOICE_COMMUNICATION) ?: return
        val lv = LiveVoice(sampleRate)
        lv.hands = hands
        val inBuf = ShortArray(lv.block)
        val fbuf = FloatArray(lv.block * 2)
        val outBuf = ShortArray(lv.block * 2)
        val track = newTrack(lowLatency = true)
        rec.startRecording(); track.play()
        var tick = 0
        try {
            while (running) {
                var got = 0
                while (got < inBuf.size && running) {
                    val n = rec.read(inBuf, got, inBuf.size - got)
                    if (n < 0) break
                    got += n
                }
                if (got < inBuf.size) break
                lv.process(inBuf, fx, fbuf)
                downmixIfMono(fbuf)
                for (i in outBuf.indices) outBuf[i] = TapeRenderer.toPcm(fbuf[i])
                track.write(outBuf, 0, outBuf.size)
                if (tick++ % 3 == 0) _state.update { it.copy(level = levelOf(outBuf, outBuf.size)) }
            }
        } finally {
            rec.stop(); rec.release()
            track.pause(); track.flush(); track.release()
        }
    }

    private fun levelOf(b: ShortArray, n: Int): Float {
        if (n <= 0) return 0f
        var e = 0.0
        for (i in 0 until n) e += b[i].toDouble() * b[i]
        // Square-root again so quiet talking still wiggles the meter.
        return sqrt(sqrt(e / n) / 32768.0).toFloat().coerceIn(0f, 1f)
    }

    companion object {
        const val CUE_SPEED = 3f
    }
}
