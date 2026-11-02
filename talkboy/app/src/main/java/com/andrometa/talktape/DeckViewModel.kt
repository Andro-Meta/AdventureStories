package com.andrometa.talktape

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.andrometa.talktape.audio.Fx
import com.andrometa.talktape.audio.TapeDeck
import com.andrometa.talktape.audio.TapeRenderer
import com.andrometa.talktape.audio.Tune
import com.andrometa.talktape.data.Tape
import com.andrometa.talktape.data.TapeStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.abs

data class Preset(val emoji: String, val name: String, val fx: Fx)

val PRESETS = listOf(
    Preset("🙂", "Normal", Fx()),
    Preset("🐿️", "Chipmunk", Fx(tapeSpeed = 1.6f)),
    Preset("🐢", "Slow-Mo", Fx(tapeSpeed = 0.62f)),
    Preset("👹", "Monster", Fx(pitch = -7f, formant = -5f)),
    Preset("🐭", "Mouse", Fx(pitch = 7f, formant = 6f)),
    Preset("🐘", "Giant", Fx(pitch = -3f, formant = -8f)),
    Preset("👽", "Alien", Fx(pitch = 6f, formant = -5f)),
    Preset("🚀", "Speedy", Fx(tempo = 1.8f)),
    Preset("🤖", "Robot Star", Fx(tune = Tune.Robot, layers = 1, reverb = 0.3f)),
    Preset("👯", "Choir", Fx(layers = 4, reverb = 0.45f)),
    Preset("🏜️", "Canyon", Fx(echo = 0.55f, echoTime = 0.6f, reverb = 0.2f)),
    Preset("🦇", "Cave", Fx(pitch = -2f, echo = 0.25f, echoTime = 0.1f, reverb = 0.9f)),
)

class DeckViewModel(app: Application) : AndroidViewModel(app) {
    private val sr = TapeStore.SAMPLE_RATE
    private val store = TapeStore(File(app.filesDir, "tapes"))
    private val prefs = app.getSharedPreferences("talktape", Context.MODE_PRIVATE)
    private val saveLock = Mutex()

    val deck = TapeDeck(sr, maxFrames = MAX_MINUTES * 60 * sr)
    val maxSamples = MAX_MINUTES * 60 * sr

    private val _tapes = MutableStateFlow<List<Tape>>(emptyList())
    val tapes: StateFlow<List<Tape>> = _tapes
    private val _current = MutableStateFlow<Tape?>(null)
    val current: StateFlow<Tape?> = _current
    private val _fx = MutableStateFlow(Fx())
    val fx: StateFlow<Fx> = _fx
    /** Loudness outline of the tape for the scrub strip. */
    private val _peaks = MutableStateFlow(FloatArray(0))
    val peaks: StateFlow<FloatArray> = _peaks
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy
    private val _stereoRec = MutableStateFlow(prefs.getBoolean("stereoRec", false))
    val stereoRec: StateFlow<Boolean> = _stereoRec
    private val _monoPlay = MutableStateFlow(prefs.getBoolean("monoPlay", false))
    val monoPlay: StateFlow<Boolean> = _monoPlay

    /** Shown the "use headphones" tip already this run. */
    var liveTipShown = false

    init {
        deck.stereoRecording = _stereoRec.value
        deck.monoOutput = _monoPlay.value
        deck.onRecorded = { pcm ->
            val tape = _current.value
            if (tape != null) viewModelScope.launch(Dispatchers.IO) {
                saveLock.withLock { store.save(tape.id, pcm) }
                _peaks.value = peaksOf(pcm.data)
                refresh()
            }
        }
        viewModelScope.launch(Dispatchers.IO) {
            var list = store.list()
            if (list.isEmpty()) list = listOf(store.create("My First Tape", 0))
            _tapes.value = list
            select(list.firstOrNull { it.id == prefs.getString("current", null) } ?: list.first())
        }
    }

    fun setFx(f: Fx) { _fx.value = f; deck.fx = f }

    fun setStereoRec(on: Boolean) { _stereoRec.value = on; deck.stereoRecording = on; prefs.edit().putBoolean("stereoRec", on).apply() }

    fun setMonoPlay(on: Boolean) { _monoPlay.value = on; deck.monoOutput = on; prefs.edit().putBoolean("monoPlay", on).apply() }

    fun select(tape: Tape) {
        deck.stop()
        _current.value = tape
        prefs.edit().putString("current", tape.id).apply()
        viewModelScope.launch(Dispatchers.IO) {
            val data = saveLock.withLock { store.load(tape.id) }
            withContext(Dispatchers.Main) { if (_current.value?.id == tape.id) deck.load(data) }
            _peaks.value = peaksOf(data.data)
        }
    }

    fun newTape(then: () -> Unit = {}) = viewModelScope.launch(Dispatchers.IO) {
        val n = _tapes.value.size + 1
        val t = store.create("Tape $n", n % LABEL_COLORS)
        refresh()
        withContext(Dispatchers.Main) { select(t); then() }
    }

    fun rename(tape: Tape, name: String, color: Int) = viewModelScope.launch(Dispatchers.IO) {
        val clean = name.trim().take(30).ifEmpty { tape.name }
        store.update(tape.id, clean, color)
        refresh()
    }

    fun delete(tape: Tape) = viewModelScope.launch(Dispatchers.IO) {
        if (_current.value?.id == tape.id) withContext(Dispatchers.Main) { deck.stop() }
        saveLock.withLock { store.delete(tape.id) }
        var list = store.list()
        if (list.isEmpty()) list = listOf(store.create("Tape 1", 0))
        _tapes.value = list
        if (_current.value?.id == tape.id) withContext(Dispatchers.Main) { select(list.first()) }
    }

    /** Bakes the current magic into a brand new tape. */
    fun saveMagicCopy() {
        val tape = _current.value ?: return
        val f = _fx.value
        deck.stop()
        _busy.value = true
        viewModelScope.launch(Dispatchers.Default) {
            try {
                val src = saveLock.withLock { store.load(tape.id) }
                val out = TapeRenderer.renderAll(src, f, sr)
                val label = PRESETS.firstOrNull { it.fx == f }?.name ?: "Magic"
                val copy = store.create("${tape.name} $label".take(30), (tape.color + 1) % LABEL_COLORS, out)
                refresh()
                withContext(Dispatchers.Main) { setFx(Fx()); select(copy) }
            } finally {
                _busy.value = false
            }
        }
    }

    /** Share sheet for a tape, as "<name>.wav". */
    suspend fun shareIntent(tape: Tape): Intent = withContext(Dispatchers.IO) {
        val ctx = getApplication<Application>()
        val dir = File(ctx.cacheDir, "share").apply { deleteRecursively(); mkdirs() }
        val safe = tape.name.replace(Regex("[^A-Za-z0-9 _-]"), "").trim().ifEmpty { "TalkTape" }
        val file = File(dir, "$safe.wav")
        saveLock.withLock { store.wav(tape.id).copyTo(file, overwrite = true) }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
        Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "audio/wav"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "Share ${tape.name}")
    }

    private fun refresh() {
        val list = store.list()
        _tapes.value = list
        _current.value = list.firstOrNull { it.id == _current.value?.id } ?: _current.value
    }

    override fun onCleared() = deck.release()

    companion object {
        const val MAX_MINUTES = 5
        const val LABEL_COLORS = 8
        private const val BARS = 160

        fun peaksOf(s: ShortArray): FloatArray {
            if (s.isEmpty()) return FloatArray(0)
            val per = maxOf(1, s.size / BARS)
            return FloatArray((s.size + per - 1) / per) { b ->
                var m = 0
                for (i in b * per until minOf(s.size, (b + 1) * per)) m = maxOf(m, abs(s[i].toInt()))
                m / 32768f
            }
        }
    }
}
