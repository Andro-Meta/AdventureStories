package com.andrometa.talktape

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.andrometa.talktape.audio.Fly
import com.andrometa.talktape.audio.FlyFx
import com.andrometa.talktape.audio.DriveFx
import com.andrometa.talktape.audio.Fx
import com.andrometa.talktape.audio.Ghost
import com.andrometa.talktape.audio.GhostFx
import com.andrometa.talktape.audio.Harmony
import com.andrometa.talktape.audio.HarmonyFx
import com.andrometa.talktape.audio.KeyFinder
import com.andrometa.talktape.audio.OldTapeFx
import com.andrometa.talktape.audio.Place
import com.andrometa.talktape.audio.PlaceFx
import com.andrometa.talktape.audio.PolishFx
import com.andrometa.talktape.audio.StutterFx
import com.andrometa.talktape.audio.TalkBox
import com.andrometa.talktape.audio.TalkBoxFx
import com.andrometa.talktape.audio.VoiceProcessor
import com.andrometa.talktape.audio.Wobble
import com.andrometa.talktape.audio.WobbleFx
import com.andrometa.talktape.audio.Pcm
import com.andrometa.talktape.audio.TapeDeck
import com.andrometa.talktape.audio.TapeRenderer
import com.andrometa.talktape.audio.Tune
import com.andrometa.talktape.audio.TuneFx
import com.andrometa.talktape.data.Tape
import com.andrometa.talktape.data.TapeStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.abs

/** A one-tap sound; [group] sorts them into rows. */
data class Preset(val emoji: String, val name: String, val fx: Fx, val group: String)

private const val VOICES = "Funny voices"
private const val MUSIC = "Music & robots"
private const val PLACES = "Places"
private const val SPOOKY = "Spooky & wild"
private const val STUDIO = "Studio"
private const val HAUNTED = "Haunted Mound"

val PRESET_GROUPS = listOf(HAUNTED, VOICES, MUSIC, PLACES, SPOOKY, STUDIO)

val PRESETS = listOf(
    // Built from how critics describe these artists' records (no published chain exists):
    // Cemetery: deep "baritone evilness", hard robot auto-tune, layered and stacked, blown-out
    // distortion + heavy compression, digital crush, phaser, dark room.
    Preset("🪦", "Cemetery", Fx(
        pitch = -4f, formant = -4f,
        tune = TuneFx(Tune.Robot, speed = 0f, humanize = 0f),
        harmony = HarmonyFx(Harmony.Low, mix = 0.28f, spread = 0.3f, humanize = 0.3f),
        layers = 2,
        polish = PolishFx(amount = 0.8f, compress = 0.9f, presence = 0.6f),
        drive = DriveFx(amount = 0.75f, tone = 0.45f, crush = 0.25f),
        wobble = WobbleFx(Wobble.Phaser, rate = 0.3f, depth = 0.55f, mix = 0.5f),
        reverb = 0.35f, echo = 0.15f, echoTime = 0.3f,
    ), HAUNTED),
    // Ghost Mountain: deep, flat, "half-dead" singing that floats like a ghost, smoother
    // (softened robot) auto-tune, a little breath, lighter grit, lo-fi haze, long dark reverb and echo.
    Preset("⛰️", "Ghost Mountain", Fx(
        pitch = -3f, formant = -4f,
        tune = TuneFx(Tune.Robot, speed = 0.04f, humanize = 0.2f),
        whisper = 0.12f,
        layers = 1,
        polish = PolishFx(amount = 0.6f, compress = 0.7f, presence = 0.3f),
        drive = DriveFx(amount = 0.35f, tone = 0.3f),
        oldTape = OldTapeFx(amount = 0.3f, hiss = 0.3f, wow = 0.3f),
        reverb = 0.7f, echo = 0.3f, echoTime = 0.45f,
        ghost = GhostFx(amount = 0.35f, length = 0.5f),
    ), HAUNTED),
    Preset("🔥", "Blown Out", Fx(drive = DriveFx(amount = 0.9f, tone = 0.55f, crush = 0.35f), polish = PolishFx(amount = 0.7f, compress = 1f)), HAUNTED),

    Preset("🙂", "Normal", Fx(), VOICES),
    Preset("🐿️", "Chipmunk", Fx(tapeSpeed = 1.6f), VOICES),
    Preset("🐢", "Slow-Mo", Fx(tapeSpeed = 0.62f), VOICES),
    Preset("👹", "Monster", Fx(pitch = -7f, formant = -5f), VOICES),
    Preset("🐭", "Mouse", Fx(pitch = 7f, formant = 6f), VOICES),
    Preset("🐘", "Giant", Fx(pitch = -3f, formant = -8f), VOICES),
    Preset("👽", "Alien", Fx(pitch = 6f, formant = -5f, wobble = WobbleFx(Wobble.Vibrato, rate = 0.55f, depth = 0.5f)), VOICES),
    Preset("🚀", "Speedy", Fx(tempo = 1.8f), VOICES),

    Preset("🤖", "Robot Star", Fx(tune = TuneFx(Tune.Robot), layers = 1, reverb = 0.3f), MUSIC),
    Preset("🎤", "Pop Star", Fx(tune = TuneFx(Tune.Gentle), harmony = HarmonyFx(Harmony.Third, mix = 0.45f), polish = PolishFx(amount = 0.7f), reverb = 0.25f, echo = 0.15f, echoTime = 0.25f), MUSIC),
    Preset("👯", "Choir", Fx(tune = TuneFx(Tune.Gentle), harmony = HarmonyFx(Harmony.Choir), reverb = 0.5f), MUSIC),
    Preset("🎹", "Talk-box", Fx(tune = TuneFx(Tune.Robot), talk = TalkBoxFx(TalkBox.Synth)), MUSIC),
    Preset("🎛️", "Vocoder", Fx(talk = TalkBoxFx(TalkBox.Chord), reverb = 0.2f), MUSIC),
    Preset("📢", "Robot", Fx(talk = TalkBoxFx(TalkBox.Robot, note = 45), wobble = WobbleFx(Wobble.Flanger, rate = 0.2f, depth = 0.3f, mix = 0.4f)), MUSIC),
    Preset("🎸", "Bass Buddy", Fx(talk = TalkBoxFx(TalkBox.Bass, mix = 0.5f)), MUSIC),

    Preset("📞", "Phone", Fx(place = PlaceFx(Place.Telephone)), PLACES),
    Preset("📻", "Walkie", Fx(place = PlaceFx(Place.Walkie)), PLACES),
    Preset("🕰️", "Old Radio", Fx(place = PlaceFx(Place.Radio)), PLACES),
    Preset("📣", "Megaphone", Fx(place = PlaceFx(Place.Megaphone), echo = 0.25f, echoTime = 0.5f), PLACES),
    Preset("🐠", "Underwater", Fx(place = PlaceFx(Place.Underwater), reverb = 0.3f), PLACES),
    Preset("🏜️", "Canyon", Fx(echo = 0.55f, echoTime = 0.6f, reverb = 0.2f), PLACES),
    Preset("🦇", "Cave", Fx(pitch = -2f, echo = 0.25f, echoTime = 0.1f, reverb = 0.9f), PLACES),
    Preset("🏟️", "Stadium", Fx(polish = PolishFx(amount = 0.6f), echo = 0.3f, echoTime = 0.45f, reverb = 0.7f), PLACES),

    Preset("👻", "Ghost", Fx(whisper = 0.7f, ghost = GhostFx(amount = 0.8f, length = 0.6f), reverb = 0.6f), SPOOKY),
    Preset("🤫", "Whisper", Fx(whisper = 1f, reverb = 0.15f), SPOOKY),
    Preset("📼", "Old Tape", Fx(oldTape = OldTapeFx(amount = 0.8f)), SPOOKY),
    Preset("🌀", "Wobbly", Fx(wobble = WobbleFx(Wobble.Vibrato, rate = 0.6f, depth = 0.8f)), SPOOKY),
    Preset("✈️", "Jet", Fx(wobble = WobbleFx(Wobble.Flanger, rate = 0.25f, depth = 0.9f)), SPOOKY),
    Preset("🛸", "Fly-Around", Fx(fly = FlyFx(Fly.Circle), reverb = 0.2f), SPOOKY),
    Preset("🏎️", "Zoom Past", Fx(fly = FlyFx(Fly.FlyBy, speed = 0.6f)), SPOOKY),
    Preset("💬", "S-s-stutter", Fx(stutter = StutterFx(auto = true)), SPOOKY),

    Preset("✨", "Clean Voice", Fx(clean = 0.5f, polish = PolishFx(amount = 0.6f)), STUDIO),
    Preset("🎙️", "Podcast", Fx(clean = 0.7f, polish = PolishFx(amount = 1f, compress = 0.7f, presence = 0.6f)), STUDIO),
    Preset("🎧", "Vocal Booth", Fx(tune = TuneFx(Tune.Gentle, amount = 0.6f), clean = 0.4f, polish = PolishFx(amount = 0.8f), reverb = 0.2f, echo = 0.12f, echoTime = 0.2f), STUDIO),
    Preset("🎚️", "Doubled", Fx(layers = 1, polish = PolishFx(amount = 0.5f)), STUDIO),
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
    /** Loudness outline of the tape for the scrub strip: one bar per [PEAK_FRAMES] frames. */
    private val _peaks = MutableStateFlow(FloatArray(0))
    val peaks: StateFlow<FloatArray> = _peaks
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy
    private val _stereoRec = MutableStateFlow(prefs.getBoolean("stereoRec", false))
    val stereoRec: StateFlow<Boolean> = _stereoRec
    private val _monoPlay = MutableStateFlow(prefs.getBoolean("monoPlay", false))
    val monoPlay: StateFlow<Boolean> = _monoPlay
    private val _studio = MutableStateFlow(prefs.getBoolean("studio", false))
    /** Studio view: every engineer's knob showing. */
    val studio: StateFlow<Boolean> = _studio

    fun setStudio(on: Boolean) { _studio.value = on; prefs.edit().putBoolean("studio", on).apply() }

    /** Shown the "use headphones" tip already this run. */
    var liveTipShown = false

    init {
        deck.stereoRecording = _stereoRec.value
        deck.monoOutput = _monoPlay.value
        deck.onRecorded = { pcm ->
            val tape = _current.value
            if (tape != null) viewModelScope.launch(Dispatchers.IO) {
                saveLock.withLock { store.save(tape.id, pcm) }
                _peaks.value = peaksOf(pcm)
                prepare(pcm)
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

    fun setFx(f: Fx) {
        _fx.value = f; deck.fx = f
        if (f.ghost.amount > 0f && (deck.ghostTrack == null || ghostLength != f.ghost.length)) makeGhost(f.ghost.length)
    }

    /** The tape in the deck, for the background helpers. */
    @Volatile private var loaded: Pcm? = null
    private var ghostLength = -1f
    private var ghostJob: Job? = null

    /** Works out what the effects need to know about this tape: its noise and its word starts. */
    private fun prepare(pcm: Pcm) {
        loaded = pcm
        deck.ghostTrack = null; ghostLength = -1f
        viewModelScope.launch(Dispatchers.Default) {
            deck.noiseProfile = VoiceProcessor.noiseProfile(pcm)
            deck.onsets = TapeRenderer.onsetsOf(peaksOf(pcm), PEAK_FRAMES)
            val g = _fx.value.ghost
            if (g.amount > 0f) withContext(Dispatchers.Main) { makeGhost(g.length) }
        }
    }

    /** The ghost swell is worked out for the whole tape at once (it has to hear the future). */
    private fun makeGhost(length: Float) {
        val pcm = loaded ?: return
        ghostLength = length
        ghostJob?.cancel()
        ghostJob = viewModelScope.launch(Dispatchers.Default) {
            val g = Ghost.render(pcm.data, pcm.channels, sr, length)
            if (loaded === pcm && ghostLength == length) deck.ghostTrack = g
        }
    }

    /** Listens to the whole tape and sets auto-tune to its key. */
    fun findKey() {
        val pcm = loaded ?: return
        viewModelScope.launch(Dispatchers.Default) {
            val found = KeyFinder.find(pcm, sr)
            withContext(Dispatchers.Main) {
                if (found == null) { deck.tell("Sing a bit more first, then I can find your key!"); return@withContext }
                val f = _fx.value
                setFx(f.copy(tune = f.tune.copy(key = found.first, scale = found.second, mode = if (f.tune.on) f.tune.mode else Tune.Gentle)))
                deck.tell("Your key: ${TuneFx.KEY_NAMES[found.first]} ${found.second.label.lowercase()} 🎵")
            }
        }
    }

    fun setStereoRec(on: Boolean) { _stereoRec.value = on; deck.stereoRecording = on; prefs.edit().putBoolean("stereoRec", on).apply() }

    fun setMonoPlay(on: Boolean) { _monoPlay.value = on; deck.monoOutput = on; prefs.edit().putBoolean("monoPlay", on).apply() }

    fun select(tape: Tape) {
        deck.stop()
        _current.value = tape
        prefs.edit().putString("current", tape.id).apply()
        viewModelScope.launch(Dispatchers.IO) {
            val data = saveLock.withLock { store.load(tape.id) }
            withContext(Dispatchers.Main) { if (_current.value?.id == tape.id) deck.load(data) }
            _peaks.value = peaksOf(data)
            prepare(data)
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
                val out = TapeRenderer.renderAll(src, f, sr, TapeRenderer.onsetsOf(peaksOf(src), PEAK_FRAMES))
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
        /** 10 ms per bar: fine enough to zoom right in on a word. */
        const val PEAK_FRAMES = 441

        fun peaksOf(pcm: Pcm): FloatArray {
            val s = pcm.data
            if (s.isEmpty()) return FloatArray(0)
            val per = PEAK_FRAMES * pcm.channels
            return FloatArray((s.size + per - 1) / per) { b ->
                var m = 0
                for (i in b * per until minOf(s.size, (b + 1) * per)) m = maxOf(m, abs(s[i].toInt()))
                m / 32768f
            }
        }
    }
}
