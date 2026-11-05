package com.andrometa.talktape.audio

import com.andrometa.talktape.PRESETS
import java.io.File

/** Every preset, for [DemoRender]: written to presets/<group>/<name>.wav next to the sample. */
object Extra {
    fun render(src: ShortArray, dir: File, tag: String) {
        val peaks = FloatArray(src.size / 441 + 1) { b -> var m = 0; for (i in b * 441 until minOf(src.size, (b + 1) * 441)) m = maxOf(m, kotlin.math.abs(src[i].toInt())); m / 32768f }
        val onsets = TapeRenderer.onsetsOf(peaks, 441)
        for (p in PRESETS) {
            val out = TapeRenderer.renderAll(Pcm(src, 1), p.fx, 44100, onsets)
            val d = File(dir, "presets_$tag/${p.group.replace(Regex("[^A-Za-z]+"), "_")}").apply { mkdirs() }
            DemoRender.write(File(d, p.name.replace(Regex("[^A-Za-z0-9-]+"), "_") + ".wav"), out.data, out.channels)
        }
    }
}
