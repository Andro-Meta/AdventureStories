package com.andrometa.talktape.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs

/** Which part of the tape the strip shows: zoom 1 = all of it. */
@Stable
class StripView {
    var zoom by mutableFloatStateOf(1f)
        private set
    /** Left edge, as a fraction of the tape. */
    var start by mutableFloatStateOf(0f)
        private set
    val width get() = 1f / zoom

    fun zoomBy(factor: Float, around: Float = 0.5f, maxZoom: Float) {
        val at = start + around * width
        zoom = (zoom * factor).coerceIn(1f, maxZoom.coerceAtLeast(1f))
        start = at - around * width
        clamp()
    }

    fun pan(by: Float) { start += by; clamp() }

    /** Pages along so [f] stays in view while the tape plays. */
    fun follow(f: Float) {
        if (zoom > 1f && (f < start || f > start + width)) { start = f - width * 0.1f; clamp() }
    }

    private fun clamp() { start = start.coerceIn(0f, 1f - width) }
}

/**
 * The tape as a waveform. Tap to jump there; drag to scrub (or to slide along when zoomed in);
 * pinch to zoom; drag the A and B flags to move the loop.
 */
@Composable
fun TapeStrip(
    peaks: FloatArray, peakFrames: Int, st: StripState, view: StripView, enabled: Boolean, accent: Color,
    onSeek: (Int) -> Unit, onLoop: (Int, Int) -> Unit, modifier: Modifier = Modifier,
) {
    val length = st.length
    var scrub by remember { mutableStateOf<Int?>(null) }
    var dragA by remember { mutableStateOf<Int?>(null) }
    var dragB by remember { mutableStateOf<Int?>(null) }
    val seek by rememberUpdatedState(onSeek)
    val loop by rememberUpdatedState(onLoop)
    val cur by rememberUpdatedState(st)
    val text = rememberTextMeasurer()
    // Zoom no further than about one second across.
    val maxZoom = (length / 44100f).coerceIn(1f, 64f)

    LaunchedEffect(st.position, st.playing) { if (st.playing && length > 0) view.follow(st.position.toFloat() / length) }

    Canvas(
        modifier.fillMaxWidth().height(72.dp)
            .semantics { contentDescription = "Tape position ${if (length > 0) st.position * 100 / length else 0} percent. Tap to jump, pinch to zoom." }
            .pointerInput(enabled, length) {
                if (!enabled || length == 0) return@pointerInput
                val grab = 28.dp.toPx()
                fun frameAt(x: Float) = ((view.start + x / size.width * view.width) * length).toInt().coerceIn(0, length)
                fun xOf(f: Int) = (f.toFloat() / length - view.start) / view.width * size.width
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val x0 = down.position.x
                    val s = cur
                    val handle = listOf('A' to s.loopStart, 'B' to s.loopEnd)
                        .filter { it.second >= 0 && abs(xOf(it.second) - x0) < grab }
                        .minByOrNull { abs(xOf(it.second) - x0) }?.first
                    var moved = false
                    var pinched = false
                    var lastSpan = 0f
                    while (true) {
                        val ev = awaitPointerEvent()
                        val pts = ev.changes.filter { it.pressed }
                        if (pts.isEmpty()) break
                        if (pts.size >= 2) {
                            pinched = true
                            val span = abs(pts[0].position.x - pts[1].position.x)
                            val cx = (pts[0].position.x + pts[1].position.x) / 2
                            if (lastSpan > 20f && span > 20f) view.zoomBy(span / lastSpan, (cx / size.width).coerceIn(0f, 1f), maxZoom)
                            lastSpan = span
                            ev.changes.forEach { it.consume() }
                            continue
                        }
                        lastSpan = 0f
                        val p = pts[0]
                        if (!moved && p.isConsumed) break // the page is scrolling instead
                        if (!moved && abs(p.position.x - x0) > viewConfiguration.touchSlop) moved = true
                        if (moved && !pinched) {
                            when {
                                handle == 'A' -> dragA = frameAt(p.position.x)
                                handle == 'B' -> dragB = frameAt(p.position.x)
                                view.zoom > 1f -> view.pan(-(p.position.x - p.previousPosition.x) / size.width * view.width)
                                else -> scrub = frameAt(p.position.x)
                            }
                            p.consume()
                        }
                    }
                    when {
                        dragA != null -> loop(dragA!!, cur.loopEnd)
                        dragB != null -> loop(cur.loopStart, dragB!!)
                        scrub != null -> seek(scrub!!)
                        !moved && !pinched -> seek(frameAt(x0))
                    }
                    dragA = null; dragB = null; scrub = null
                }
            },
    ) {
        val w = size.width
        val r = CornerRadius(size.height / 4)
        drawRoundRect(Palette.Plastic, cornerRadius = r)
        val mid = size.height / 2 + 6f
        val pos = scrub ?: st.position
        fun xOf(f: Int) = if (length == 0) 0f else (f.toFloat() / length - view.start) / view.width * w

        // Loop region.
        val la = dragA ?: st.loopStart
        val lb = dragB ?: st.loopEnd
        if (length > 0 && (la >= 0 || lb >= 0 || st.looping)) {
            val x1 = xOf(if (la >= 0) la else 0).coerceIn(0f, w)
            val x2 = xOf(if (lb >= 0) lb else length).coerceIn(0f, w)
            if (x2 > x1) drawRect(accent.copy(alpha = if (st.looping) 0.32f else 0.16f), Offset(minOf(x1, x2), 0f), Size(abs(x2 - x1), size.height))
        }

        if (peaks.isEmpty() || length == 0) {
            drawLine(Color.White.copy(alpha = 0.25f), Offset(16f, mid), Offset(w - 16f, mid), 3f)
        } else {
            // One bar per ~4 px, each the loudest bit of tape under it.
            val bars = (w / 4f).toInt().coerceAtLeast(1)
            val posX = xOf(pos)
            for (j in 0 until bars) {
                val f0 = ((view.start + j.toFloat() / bars * view.width) * length).toInt()
                val f1 = ((view.start + (j + 1).toFloat() / bars * view.width) * length).toInt()
                val i0 = (f0 / peakFrames).coerceIn(0, peaks.size - 1)
                val i1 = (f1 / peakFrames).coerceIn(i0, peaks.size - 1)
                var p = 0f
                for (i in i0..i1) p = maxOf(p, peaks[i])
                val x = (j + 0.5f) * w / bars
                val h = p.coerceAtLeast(0.02f) * size.height * 0.36f
                drawLine(if (x <= posX) accent else Color.White.copy(alpha = 0.45f), Offset(x, mid - h), Offset(x, mid + h), 2.5f)
            }
        }

        // A / B flags.
        for ((label, f) in listOf("A" to la, "B" to lb)) {
            if (f < 0 || length == 0) continue
            val x = xOf(f)
            if (x < -2f || x > w + 2f) continue
            drawLine(Palette.Pause, Offset(x, 0f), Offset(x, size.height), 4f)
            val tag = text.measure(label, TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Black, color = Palette.Plastic))
            val tw = tag.size.width + 14f
            val left = (if (label == "A") x else x - tw).coerceIn(0f, w - tw)
            drawRoundRect(Palette.Pause, Offset(left, 0f), Size(tw, tag.size.height + 4f), CornerRadius(8f))
            drawText(tag, topLeft = Offset(left + 7f, 2f))
        }

        // Playhead.
        val px = xOf(pos)
        if (px in 0f..w) {
            drawLine(Color.White, Offset(px, 4f), Offset(px, size.height - 4f), 5f)
            drawCircle(Color.White, 9f, Offset(px, size.height - 8f))
        }
        if (view.zoom > 1f) {
            // Where the zoomed window sits on the whole tape.
            drawRect(Color.White.copy(alpha = 0.18f), Offset(0f, size.height - 4f), Size(w, 4f))
            drawRect(Color.White.copy(alpha = 0.7f), Offset(view.start * w, size.height - 4f), Size(view.width * w, 4f))
        }
    }
}

/** What the strip needs from the deck. */
data class StripState(
    val position: Int, val length: Int, val loopStart: Int, val loopEnd: Int, val looping: Boolean, val playing: Boolean,
)
