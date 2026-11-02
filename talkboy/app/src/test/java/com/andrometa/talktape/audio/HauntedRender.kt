package com.andrometa.talktape.audio

import com.andrometa.talktape.PRESETS
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.roundToInt

/** TALKTAPE_HAUNTED=<dir with voice.wav, voice_high.wav>: renders the Haunted Mound presets and measures them. */
class HauntedRender {
    @Test fun render() {
        val dir = System.getenv("TALKTAPE_HAUNTED")?.let(::File)
        assumeTrue(dir != null)
        for (v in listOf("voice", "voice_high")) {
            val b = ByteBuffer.wrap(File(dir, "$v.wav").readBytes()).order(ByteOrder.LITTLE_ENDIAN)
            var p = 12; var src = ShortArray(0)
            while (p + 8 <= b.limit()) { val id = String(ByteArray(4) { b.get(p + it) }); val sz = b.getInt(p + 4); if (id == "data") { src = ShortArray(sz / 2) { b.getShort(p + 8 + 2 * it) }; break }; p += 8 + sz + (sz and 1) }
            val inF0 = medianF0(src)
            for (name in listOf("Cemetery", "Ghost Mountain", "Blown Out")) {
                val fx = PRESETS.first { it.name == name }.fx
                val out = TapeRenderer.renderAll(Pcm(src, 1), fx, 44100)
                val mono = ShortArray(out.frames) { ((out.data[it * out.channels] + out.data[it * out.channels + out.channels - 1]) / 2).toShort() }
                val f0 = medianF0(mono)
                val peak = out.data.maxOf { abs(it.toInt()) } / 32768.0
                val onNote = onNoteShare(mono)
                println("haunted $v / $name: pitch ${inF0.roundToInt()} -> ${f0.roundToInt()} Hz, frames within 15 cents of a note ${"%.0f".format(onNote * 100)}% (input ${"%.0f".format(onNoteShare(src) * 100)}%), peak ${"%.2f".format(peak)}")
                val dryFx = Fx(pitch = fx.pitch, formant = fx.formant, tune = fx.tune)
                val dry = TapeRenderer.renderAll(Pcm(src, 1), dryFx, 44100).data
                println("haunted $v / $name tuning stage alone: ${"%.0f".format(onNoteShare(dry) * 100)}% within 15 cents")
                DemoRender.write(File(dir, "haunted_${v}_${name.replace(' ', '_')}.wav"), out.data, out.channels)
            }
        }
    }

    private fun track(s: ShortArray): List<Double> {
        val t = PitchTracker(44100); val f = DoubleArray(2048); val out = ArrayList<Double>()
        var i = 0
        while (i + 2048 < s.size) { for (k in 0 until 2048) f[k] = s[i + k] / 32768.0; val p = t.detect(f); if (p > 0) out += p; i += 1024 }
        return out
    }
    private fun medianF0(s: ShortArray) = track(s).sorted().let { if (it.isEmpty()) 0.0 else it[it.size / 2] }
    private fun onNoteShare(s: ShortArray) = track(s).let { t -> t.count { val m = 69 + 12 * log2(it / 440); abs(m - m.roundToInt()) < 0.15 }.toDouble() / t.size.coerceAtLeast(1) }
}
