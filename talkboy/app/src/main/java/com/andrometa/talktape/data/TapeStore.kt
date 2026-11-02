package com.andrometa.talktape.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.DataInputStream
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

data class Tape(
    val id: String,
    val name: String,
    val color: Int,       // index into the label palette
    val created: Long,
    val samples: Int,     // length, read from the file size
)

/**
 * Tapes live as plain 16-bit mono WAV files plus one small JSON index for names and colours.
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
            Tape(id, it.getString("name"), it.optInt("color"), it.optLong("created"),
                ((wav(id).length() - HEADER) / 2).coerceAtLeast(0).toInt())
        }
    }

    @Synchronized
    fun create(name: String, color: Int, samples: ShortArray = ShortArray(0), length: Int = samples.size): Tape {
        val id = UUID.randomUUID().toString().take(8)
        writeWav(wav(id), samples, length)
        val t = Tape(id, name, color, System.currentTimeMillis(), length)
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

    fun load(id: String): ShortArray = readWav(wav(id))

    fun save(id: String, samples: ShortArray, length: Int) = writeWav(wav(id), samples, length)

    private fun writeIndex(tapes: List<Tape>) {
        val arr = JSONArray()
        tapes.forEach { arr.put(JSONObject().put("id", it.id).put("name", it.name).put("color", it.color).put("created", it.created)) }
        atomically(index) { it.writeText(arr.toString()) }
    }

    fun writeWav(file: File, s: ShortArray, length: Int) = atomically(file) { tmp ->
        val bytes = length * 2
        val buf = ByteBuffer.allocate(HEADER + bytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray()).putInt(36 + bytes).put("WAVE".toByteArray())
        buf.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            .putInt(sampleRate).putInt(sampleRate * 2).putShort(2).putShort(16)
        buf.put("data".toByteArray()).putInt(bytes)
        for (i in 0 until length) buf.putShort(s[i])
        tmp.writeBytes(buf.array())
    }

    /** Reads 16-bit mono PCM WAV, skipping any extra chunks. Missing/broken file = empty tape. */
    fun readWav(file: File): ShortArray {
        if (!file.exists()) return ShortArray(0)
        return try {
            DataInputStream(file.inputStream().buffered()).use { inp ->
                val head = ByteArray(12).also { inp.readFully(it) }
                if (String(head, 0, 4) != "RIFF" || String(head, 8, 4) != "WAVE") throw IOException("not a wav")
                val chunk = ByteArray(8)
                while (true) {
                    inp.readFully(chunk)
                    val size = ByteBuffer.wrap(chunk, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
                    if (String(chunk, 0, 4) == "data") {
                        val n = minOf(size, (file.length() - 44).toInt().coerceAtLeast(0)) / 2
                        val raw = ByteArray(n * 2).also { inp.readFully(it) }
                        val out = ShortArray(n)
                        ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(out)
                        return out
                    }
                    inp.skipBytes(size + (size and 1))
                }
                @Suppress("UNREACHABLE_CODE") ShortArray(0)
            }
        } catch (e: IOException) {
            ShortArray(0)
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
