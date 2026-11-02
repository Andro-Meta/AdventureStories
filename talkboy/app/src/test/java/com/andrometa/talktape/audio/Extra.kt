package com.andrometa.talktape.audio

import java.io.File

/** The new-only voices (stereo effects, auto-tune) for [DemoRender]. */
object Extra {
    private val voices = mapOf(
        "robot_star" to Fx(tune = Tune.Robot, layers = 1, reverb = 0.3f),
        "autotune_smooth" to Fx(tune = Tune.Gentle),
        "choir" to Fx(layers = 4, reverb = 0.45f),
        "canyon" to Fx(echo = 0.55f, echoTime = 0.6f, reverb = 0.2f),
        "cave" to Fx(pitch = -2f, echo = 0.25f, echoTime = 0.1f, reverb = 0.9f),
    )

    fun render(src: ShortArray, dir: File, tag: String) {
        for ((name, fx) in voices) {
            val out = TapeRenderer.renderAll(Pcm(src, 1), fx, 44100)
            DemoRender.write(File(dir, "${name}_$tag.wav"), out.data, out.channels)
        }
    }
}
