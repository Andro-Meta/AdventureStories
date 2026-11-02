package com.andrometa.talktape.data

import com.andrometa.talktape.audio.Pcm
import org.json.JSONArray
import org.json.JSONObject
import java.io.DataInputStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

data class Tape(
    val id: String,
    val name: String,
    val color: Int,       // index into the label palette
    val created: Long,
    val samples: Int,     // length in frames, read from the file size
    val channels: Int = 1,
)

/**
 * Tapes live as plain 16-bit mono or stereo WAV files plus one small JSON index for names and colours.
 * Every write goes to a temp file first and is renamed into place, so a crash can't eat a tape.
 */
class TapeStore(private val dir: File, val sampleRate: Int = SAMPLE_RATE) {
    private val index = File(dir, "tapes.json")

    init { dir.mkdirs() }

    fun wav(id: String) = File(dir, "$id.wav")

    @Synchronized
    fun list(): List<Tape> {
        val arr = runCatching { JSONArray(index.readText()) }.getOrElse { return emptyList() }
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map {
            val id = it.getString("id")
            val ch = channelsOf(wav(id))
            Tape(id, it.getString("name"), it.optInt("color"), it.optLong("created"),
                ((wav(id).length() - HEADER) / (2 * ch)).coerceAtLeast(0).toInt(), ch)
        }
    }

    @Synchronized
    fun create(name: String, color: Int, pcm: Pcm = Pcm(ShortArray(0), 1)): Tape {
        val id = UUID.randomUUID().toString().take(8)
        writeWav(wav(id), pcm)
        val t = Tape(id, name, color, System.currentTimeMillis(), pcm.frames, pcm.channels)
        writeIndex(list() + t)
        return t
    }

    @Synchronized
    fun update(id: String, name: String, color: Int) =
        writeIndex(list().map { if (it.id == id) it.copy(name = name, color = color) else it })

    @Synchronized
    fun delete(id: String) {
        writeIndex(list().filter { it.id != id })
        wav(id).delete()
    }

    fun load(id: String): Pcm = readWav(wav(id))

    fun save(id: String, pcm: Pcm) = writeWav(wav(id), pcm)

    private fun writeIndex(tapes: List<Tape>) {
        val arr = JSONArray()
        tapes.forEach { arr.put(JSONObject().put("id", it.id).put("name", it.name).put("color", it.color).put("created", it.created)) }
        atomically(index) { it.writeText(arr.toString()) }
    }

    fun writeWav(file: File, pcm: Pcm) = atomically(file) { tmp ->
        val ch = pcm.channels
        val bytes = pcm.data.size * 2
        val buf = ByteBuffer.allocate(HEADER + bytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray()).putInt(36 + bytes).put("WAVE".toByteArray())
        buf.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(ch.toShort())
            .putInt(sampleRate).putInt(sampleRate * 2 * ch).putShort((2 * ch).toShort()).putShort(16)
        buf.put("data".toByteArray()).putInt(bytes)
        for (v in pcm.data) buf.putShort(v)
        tmp.writeBytes(buf.array())
    }

    /** Channel count from our own 44-byte header (1 if unreadable). */
    private fun channelsOf(file: File): Int = try {
        RandomAccessFile(file, "r").use { f -> f.seek(22); (f.read() or (f.read() shl 8)).takeIf { it == 2 } ?: 1 }
    } catch (e: IOException) { 1 }

    /** Reads 16-bit mono or stereo PCM WAV, skipping any extra chunks. Missing/broken file = empty tape. */
    fun readWav(file: File): Pcm {
        if (!file.exists()) return Pcm(ShortArray(0), 1)
        return try {
            DataInputStream(file.inputStream().buffered()).use { inp ->
                val head = ByteArray(12).also { inp.readFully(it) }
                if (String(head, 0, 4) != "RIFF" || String(head, 8, 4) != "WAVE") throw IOException("not a wav")
                val chunk = ByteArray(8)
                var ch = 1
                while (true) {
                    inp.readFully(chunk)
                    val size = ByteBuffer.wrap(chunk, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
                    when (String(chunk, 0, 4)) {
                        "fmt " -> {
                            val fmt = ByteArray(size + (size and 1)).also { inp.readFully(it) }
                            ch = if (ByteBuffer.wrap(fmt, 2, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt() == 2) 2 else 1
                        }
                        "data" -> {
                            val n = minOf(size, (file.length() - 44).toInt().coerceAtLeast(0)) / (2 * ch) * ch
                            val raw = ByteArray(n * 2).also { inp.readFully(it) }
                            val out = ShortArray(n)
                            ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(out)
                            return Pcm(out, ch)
                        }
                        else -> inp.skipBytes(size + (size and 1))
                    }
                }
                @Suppress("UNREACHABLE_CODE") Pcm(ShortArray(0), 1)
            }
        } catch (e: IOException) {
            Pcm(ShortArray(0), 1)
        }
    }

    private fun atomically(target: File, write: (File) -> Unit) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        write(tmp)
        if (!tmp.renameTo(target)) { target.delete(); tmp.renameTo(target) }
    }

    companion object {
        const val SAMPLE_RATE = 44100
        const val HEADER = 44
    }
}
