package com.andrometa.talktape.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

object Palette {
    val BgTop = Color(0xFF5B4BDB)
    val BgBottom = Color(0xFF1FA2A0)
    val BodyLight = Color(0xFFF1F3F7)
    val BodyDark = Color(0xFFC3C9D4)
    val Plastic = Color(0xFF2B2E40)
    val PlasticLight = Color(0xFF41455C)
    val Lcd = Color(0xFFC9E7A7)
    val LcdInk = Color(0xFF213316)
    val Rec = Color(0xFFE53935)
    val Play = Color(0xFF2EAD4B)
    val Wind = Color(0xFF5468D4)
    val Stop = Color(0xFF5B6B78)
    val Pause = Color(0xFFFFB300)
    val Live = Color(0xFFFF6D3A)
    val Tape = Color(0xFF4A2F27)
    val Labels = listOf(
        Color(0xFFFF6B6B), Color(0xFFFF9F43), Color(0xFFFECA57), Color(0xFF7BD389),
        Color(0xFF2ED1C4), Color(0xFF54A0FF), Color(0xFFA77BFF), Color(0xFFFF7BC5),
    )
    fun label(i: Int) = Labels[Math.floorMod(i, Labels.size)]
}

/** Keeps a reel angle spinning at [speed] turns-ish per second, smoothly. */
@Composable
fun rememberReelAngle(speed: Float): Float {
    var angle by remember { mutableFloatStateOf(0f) }
    val s by rememberUpdatedState(speed)
    LaunchedEffect(speed != 0f) {
        if (speed == 0f) return@LaunchedEffect
        var last = 0L
        while (true) withFrameNanos { t ->
            if (last != 0L) angle = (angle + s * 140f * (t - last) / 1e9f) % 360f
            last = t
        }
    }
    return angle
}

@Composable
fun Cassette(name: String, color: Color, progress: Float, speed: Float, modifier: Modifier = Modifier) {
    val angle = rememberReelAngle(speed)
    val measurer = rememberTextMeasurer()
    Canvas(modifier.fillMaxWidth().aspectRatio(1.62f).semantics { contentDescription = "Cassette tape: $name" }) {
        val w = size.width; val h = size.height
        val r = w * 0.05f
        // Shell
        drawRoundRect(Palette.Plastic, cornerRadius = CornerRadius(r))
        drawRoundRect(Palette.PlasticLight, cornerRadius = CornerRadius(r), style = Stroke(w * 0.012f))
        listOf(Offset(w * .04f, h * .06f), Offset(w * .96f, h * .06f), Offset(w * .04f, h * .94f), Offset(w * .96f, h * .94f))
            .forEach { drawCircle(Palette.PlasticLight, w * 0.014f, it) }
        // Label
        val lt = Offset(w * 0.07f, h * 0.08f); val ls = Size(w * 0.86f, h * 0.62f)
        drawRoundRect(color, lt, ls, CornerRadius(r * 0.6f))
        drawRect(Color.White.copy(alpha = 0.85f), Offset(lt.x, lt.y + ls.height * 0.06f), Size(ls.width, ls.height * 0.22f))
        val text = measurer.measure(
            name, TextStyle(color = Palette.Plastic, fontSize = (h * 0.075f).toSp(), fontWeight = FontWeight.Black),
            overflow = TextOverflow.Ellipsis, maxLines = 1,
            constraints = Constraints(maxWidth = (ls.width * 0.9f).toInt()),
        )
        drawText(text, topLeft = Offset(w / 2 - text.size.width / 2, lt.y + ls.height * 0.17f - text.size.height / 2))
        // Window
        val wt = Offset(w * 0.2f, h * 0.36f); val ws = Size(w * 0.6f, h * 0.27f)
        drawRoundRect(Color(0xFF15161F), wt, ws, CornerRadius(ws.height / 2))
        val cy = wt.y + ws.height / 2
        val hub = h * 0.07f
        val maxPack = h * 0.2f
        fun pack(f: Float) = sqrt(hub * hub + (maxPack * maxPack - hub * hub) * f.coerceIn(0f, 1f))
        val glass = Path().apply { addRoundRect(RoundRect(Rect(wt, ws), CornerRadius(ws.height / 2))) }
        clipPath(glass) {
            reel(Offset(w * 0.32f, cy), pack(1f - progress), hub, angle)
            reel(Offset(w * 0.68f, cy), pack(progress), hub, angle)
        }
        // Window glass shine + bottom guide
        drawRoundRect(Color.White.copy(alpha = 0.06f), wt, Size(ws.width, ws.height * 0.4f), CornerRadius(ws.height / 2))
        val p = Path().apply {
            moveTo(w * 0.22f, h); lineTo(w * 0.28f, h * 0.78f); lineTo(w * 0.72f, h * 0.78f); lineTo(w * 0.78f, h); close()
        }
        drawPath(p, Palette.PlasticLight)
        listOf(0.36f, 0.5f, 0.64f).forEach { drawCircle(Palette.Plastic, w * 0.018f, Offset(w * it, h * 0.89f)) }
    }
}

private fun DrawScope.reel(c: Offset, pack: Float, hub: Float, angle: Float) {
    drawCircle(Palette.Tape, pack, c)
    drawCircle(Color.Black.copy(alpha = 0.25f), pack, c, style = Stroke(pack * 0.04f))
    drawCircle(Color.White, hub, c)
    rotate(angle, c) {
        for (i in 0 until 6) {
            val a = i * PI / 3
            drawLine(Palette.Plastic, c, Offset(c.x + cos(a).toFloat() * hub * 0.95f, c.y + sin(a).toFloat() * hub * 0.95f), hub * 0.22f)
        }
    }
    drawCircle(Palette.Plastic, hub * 0.4f, c)
}

/** Speaker holes that bounce with the sound. */
@Composable
fun SpeakerGrill(level: Float, active: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val n = 6
        val step = size.minDimension / n
        val c = Offset(size.width / 2, size.height / 2)
        val maxR = size.minDimension / 2
        drawCircle(Palette.Plastic, maxR, c)
        for (y in 0 until n) for (x in 0 until n) {
            val o = Offset(c.x - maxR + step * (x + 0.5f), c.y - maxR + step * (y + 0.5f))
            val d = (o - c).getDistance() / maxR
            if (d > 0.86f) continue
            val boost = level * (1f - d)
            drawCircle(lerp(Color(0xFF14151E), active, (boost * 1.6f).coerceIn(0f, 1f)), step * (0.26f + boost * 0.16f), o)
        }
    }
}

private fun lerp(a: Color, b: Color, t: Float) = Color(
    a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t, 1f,
)

enum class Glyph { Rec, Play, Rew, Ff, Stop, Pause }

/** Transport symbols drawn by hand so they look the same on every phone. */
fun DrawScope.glyph(g: Glyph, color: Color) {
    val s = size.minDimension
    val c = Offset(size.width / 2, size.height / 2)
    fun tri(cx: Float, w: Float, right: Boolean) = Path().apply {
        val h = w * 1.15f
        if (right) { moveTo(cx - w / 2, c.y - h / 2); lineTo(cx + w / 2, c.y); lineTo(cx - w / 2, c.y + h / 2) }
        else { moveTo(cx + w / 2, c.y - h / 2); lineTo(cx - w / 2, c.y); lineTo(cx + w / 2, c.y + h / 2) }
        close()
    }
    when (g) {
        Glyph.Rec -> drawCircle(color, s * 0.3f, c)
        Glyph.Play -> drawPath(tri(c.x + s * 0.04f, s * 0.55f, true), color)
        Glyph.Ff -> { drawPath(tri(c.x - s * 0.17f, s * 0.36f, true), color); drawPath(tri(c.x + s * 0.17f, s * 0.36f, true), color) }
        Glyph.Rew -> { drawPath(tri(c.x - s * 0.17f, s * 0.36f, false), color); drawPath(tri(c.x + s * 0.17f, s * 0.36f, false), color) }
        Glyph.Stop -> drawRoundRect(color, Offset(c.x - s * 0.26f, c.y - s * 0.26f), Size(s * 0.52f, s * 0.52f), CornerRadius(s * 0.06f))
        Glyph.Pause -> {
            drawRoundRect(color, Offset(c.x - s * 0.26f, c.y - s * 0.3f), Size(s * 0.18f, s * 0.6f), CornerRadius(s * 0.05f))
            drawRoundRect(color, Offset(c.x + s * 0.08f, c.y - s * 0.3f), Size(s * 0.18f, s * 0.6f), CornerRadius(s * 0.05f))
        }
    }
}

val BackgroundBrush = Brush.verticalGradient(listOf(Palette.BgTop, Palette.BgBottom))
val BodyBrush = Brush.verticalGradient(listOf(Palette.BodyLight, Palette.BodyDark))
