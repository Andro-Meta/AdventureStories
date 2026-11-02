package com.andrometa.talktape.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andrometa.talktape.audio.DeckState
import com.andrometa.talktape.audio.Mode

/** Loop and zoom buttons under the tape strip. */
@Composable
fun LoopBar(
    st: DeckState, view: StripView, maxZoom: Float, enabled: Boolean,
    onStart: () -> Unit, onEnd: () -> Unit, onLoop: () -> Unit, onClear: () -> Unit,
) {
    val marked = st.loopStart >= 0 || st.loopEnd >= 0
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("A  Start here", st.loopStart >= 0, enabled, Modifier.weight(1f), onStart)
            Chip("End here  B", st.loopEnd >= 0, enabled, Modifier.weight(1f), onEnd)
            if (marked) Chip("✕", false, true, Modifier.width(52.dp), onClear, "Clear loop marks")
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(if (st.looping) "🔁 Loop ON" else "🔁 Loop off", st.looping, enabled, Modifier.weight(1.4f), onLoop)
            Chip("🔍 −", false, view.zoom > 1f, Modifier.weight(1f), { view.zoomBy(0.5f, maxZoom = maxZoom) }, "Zoom out")
            Chip("🔍 +", false, enabled && view.zoom < maxZoom, Modifier.weight(1f), { view.zoomBy(2f, maxZoom = maxZoom) }, "Zoom in")
        }
    }
}

@Composable
private fun Chip(
    text: String, on: Boolean, enabled: Boolean, modifier: Modifier, onClick: () -> Unit, label: String = text,
) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier.height(46.dp).clip(shape)
            .background(if (on) Palette.Pause else Palette.Plastic.copy(alpha = if (enabled) 0.85f else 0.35f))
            .border(2.dp, Color.White.copy(alpha = if (on) 0.6f else 0.15f), shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label; stateDescription = if (on) "On" else "Off" },
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (on) Palette.Plastic else Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1)
    }
}

/** Small deck pinned to the bottom while the big keys are scrolled out of sight. */
@Composable
fun MiniDeck(
    st: DeckState, time: String, accent: Color,
    rec: () -> Unit, play: () -> Unit, pause: () -> Unit, stop: () -> Unit, loop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val on = !st.paused
    Column(
        modifier.widthIn(max = 560.dp).fillMaxWidth().padding(horizontal = 12.dp)
            .shadow(12.dp, RoundedCornerShape(24.dp))
            .clip(RoundedCornerShape(24.dp)).background(BodyBrush).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                time, color = Palette.LcdInk, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black, fontSize = 18.sp,
                modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(Palette.Lcd).padding(horizontal = 10.dp, vertical = 6.dp),
            )
            Spacer(Modifier.weight(1f))
            Round(Glyph.Rec, "Record", Palette.Rec, st.mode == Mode.Recording && on, rec)
            Round(Glyph.Play, "Play", Palette.Play, st.mode == Mode.Playing && on, play)
            Round(Glyph.Pause, "Pause", Palette.Pause, st.paused, pause)
            Round(Glyph.Stop, "Stop", Palette.Stop, false, stop)
            Box(
                Modifier.padding(start = 6.dp).size(48.dp).clip(CircleShape)
                    .background(if (st.looping) Palette.Pause else Palette.Plastic)
                    .clickable(role = Role.Button, onClick = loop)
                    .semantics { contentDescription = "Loop"; stateDescription = if (st.looping) "On" else "Off" },
                contentAlignment = Alignment.Center,
            ) { Text("🔁", fontSize = 22.sp) }
        }
        Spacer(Modifier.height(8.dp))
        // Thin progress line.
        Canvas(Modifier.fillMaxWidth().height(4.dp)) {
            drawRect(Color.Black.copy(alpha = 0.15f))
            if (st.length > 0) drawRect(accent, size = size.copy(width = size.width * st.position / st.length))
        }
    }
}

@Composable
private fun Round(g: Glyph, label: String, color: Color, latched: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.padding(start = 6.dp).size(48.dp).clip(CircleShape)
            .background(if (latched) color.copy(alpha = 0.6f) else color)
            .border(if (latched) 3.dp else 0.dp, Color.White, CircleShape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Canvas(Modifier.size(22.dp)) { glyph(g, Color.White) } }
}
