package com.andrometa.talktape.audio

import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Listening check, not a pass/fail test: set TALKTAPE_SAMPLE=<mono 44.1 kHz wav> and it
 * writes one wav per voice next to it (TALKTAPE_TAG goes in the names, e.g. "new"/"old").
 */
class DemoRender {
    private val voices = mapOf(
        "size_giant" to Fx(formant = -6f),
        "size_tiny" to Fx(formant = 6f),
        "pitch_down" to Fx(pitch = -7f),
        "pitch_up" to Fx(pitch = 7f),
        "monster" to Fx(pitch = -7f, formant = -5f),
        "mouse" to Fx(pitch = 7f, formant = 6f),
        "alien" to Fx(pitch = 6f, formant = -5f),
        "slow_talk" to Fx(tempo = 0.6f),
    )

    @Test fun render() {
        val path = System.getenv("TALKTAPE_SAMPLE")
        assumeTrue(path != null)
        val tag = System.getenv("TALKTAPE_TAG") ?: "out"
        val src = File(path!!)
        val pcm = read(src)
        for ((name, fx) in voices) write(File(src.parentFile, "${name}_$tag.wav"), TapeRenderer.renderAll(pcm, pcm.size, fx, 44100), 1)
        Extra.render(pcm, src.parentFile, tag)
    }

    private fun read(f: File): ShortArray {
        val b = ByteBuffer.wrap(f.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        var p = 12
        while (p + 8 <= b.limit()) {
            val id = String(ByteArray(4) { b.get(p + it) })
            val size = b.getInt(p + 4)
            if (id == "data") return ShortArray(size / 2) { b.getShort(p + 8 + 2 * it) }
            p += 8 + size + (size and 1)
        }
        error("no data chunk")
    }

    companion object {
        fun write(f: File, s: ShortArray, ch: Int) {
            val bytes = s.size * 2
            val b = ByteBuffer.allocate(44 + bytes).order(ByteOrder.LITTLE_ENDIAN)
            b.put("RIFF".toByteArray()).putInt(36 + bytes).put("WAVE".toByteArray())
            b.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(ch.toShort())
                .putInt(44100).putInt(44100 * 2 * ch).putShort((2 * ch).toShort()).putShort(16)
            b.put("data".toByteArray()).putInt(bytes)
            for (v in s) b.putShort(v)
            f.writeBytes(b.array())
        }
    }
}
