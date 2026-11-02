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

enum class Mode { Idle, Playing, Recording, Cueing, Live }

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
    val message: String? = null,
)

/**
 * The tape machine. One worker thread at a time does the audio work (play, record,
 * cue or live); everything public is called from the main thread.
 */
class TapeDeck(private val sampleRate: Int, private val maxSamples: Int) {
    private val _state = MutableStateFlow(DeckState())
    val state: StateFlow<DeckState> = _state

    /** Effects for playback and live; safe to change while playing. */
    @Volatile var fx = Fx()

    /** Called on the worker thread with a fresh copy of the tape after a recording ends. */
    var onRecorded: ((ShortArray) -> Unit)? = null

    // Owned by the worker while it runs, by the main thread otherwise (join() hands it over).
    private var samples = ShortArray(0)
    private var length = 0

    private var worker: Thread? = null
    @Volatile private var running = false
    /** Non-zero while FF/REW is held: +1 forward, -1 back. */
    @Volatile private var cueDir = 0
    private var resumeAfterCue = false

    fun load(tape: ShortArray) {
        stop()
        samples = tape; length = tape.size
        _state.value = DeckState(length = length)
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
        start(Mode.Playing, pos) { playLoop(it) }
    }

    fun record() {
        val s = _state.value
        if (s.mode == Mode.Recording && !s.paused) return
        halt()
        if (s.position >= maxSamples) { say("This tape is full! Grab a new tape."); return }
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

    private fun newTrack(lowLatency: Boolean): AudioTrack {
        val min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        return AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(if (lowLatency) min else maxOf(min, 8192))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .apply { if (lowLatency) setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY) }
            .build()
    }

    @SuppressLint("MissingPermission") // checked by the UI before any recording starts
    private fun newRecorder(source: Int): AudioRecord? {
        val min = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = try {
            AudioRecord(source, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 8192))
        } catch (e: SecurityException) {
            finishedOnItsOwn(_state.value.position); say("TalkTape needs the microphone to record."); return null
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            rec.release()
            finishedOnItsOwn(_state.value.position); say("The microphone is busy. Close other apps using it and try again.")
            return null
        }
        return rec
    }

    private fun playLoop(startPos: Int) {
        val r = TapeRenderer(sampleRate)
        r.reset(startPos.toDouble())
        val fbuf = FloatArray(r.block)
        val sbuf = ShortArray(r.block)
        val track = newTrack(lowLatency = false)
        track.play()
        var ended = false
        var tick = 0
        try {
            while (running) {
                val cue = cueDir
                val f = if (cue != 0) Fx(tapeSpeed = CUE_SPEED, reverse = cue < 0) else fx
                if (r.finished(length, f)) { ended = true; break }
                r.render(samples, length, f, fbuf)
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
        val pos = r.position.toInt().coerceIn(0, length)
        if (ended) finishedOnItsOwn(pos) else _state.update { it.copy(position = pos) }
    }

    private fun recordLoop(startPos: Int) {
        val rec = newRecorder(MediaRecorder.AudioSource.MIC) ?: return
        val buf = ShortArray(sampleRate / 20)
        var pos = startPos
        var full = false
        rec.startRecording()
        try {
            while (running) {
                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) continue
                val take = minOf(n, maxSamples - pos)
                if (pos + take > samples.size) samples = samples.copyOf(minOf(maxSamples, maxOf(pos + take, samples.size * 2, sampleRate * 10)))
                System.arraycopy(buf, 0, samples, pos, take)
                pos += take
                if (pos > length) length = pos
                _state.update { it.copy(position = pos, length = length, level = levelOf(buf, n), speed = 1f) }
                if (pos >= maxSamples) { full = true; break }
            }
        } finally {
            rec.stop(); rec.release()
            onRecorded?.invoke(samples.copyOf(length))
        }
        if (full) { finishedOnItsOwn(pos); say("Tape full! That's the end of this tape.") }
    }

    private fun liveLoop() {
        // VOICE_COMMUNICATION turns on the phone's echo canceller where it has one: fewer squeals.
        val rec = newRecorder(MediaRecorder.AudioSource.VOICE_COMMUNICATION) ?: return
        val lv = LiveVoice(sampleRate)
        val inBuf = ShortArray(lv.block)
        val fbuf = FloatArray(lv.block)
        val outBuf = ShortArray(lv.block)
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
