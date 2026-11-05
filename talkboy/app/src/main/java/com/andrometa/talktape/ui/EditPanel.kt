package com.andrometa.talktape.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andrometa.talktape.DeckViewModel
import com.andrometa.talktape.audio.DeckState
import com.andrometa.talktape.data.TapeStore

/** Edit mode's tools: work on the part between the A and B flags, or the whole tape. */
@Composable
fun EditPanel(
    vm: DeckViewModel, st: DeckState, hasMagic: Boolean, canUndo: Boolean, busy: Boolean,
    onOpenFile: () -> Unit, onShare: () -> Unit,
) {
    val picked = st.loopStart >= 0 || st.loopEnd >= 0
    val a = if (st.loopStart >= 0) st.loopStart else 0
    val b = if (st.loopEnd >= 0) st.loopEnd else st.length
    val has = st.length > 0 && !busy
    Column(Modifier.fillMaxWidth().clip(CardShape).background(Color.White.copy(alpha = 0.94f)).padding(16.dp)) {
        Text("✂️ Edit Sound", fontSize = 24.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
        Text(
            if (!picked) "Tap A and B (or drag the flags on the tape) to pick a part. With nothing picked, tools work on the whole tape."
            else "Picked ${stamp(minOf(a, b))} to ${stamp(maxOf(a, b))}  (${"%.1f".format((maxOf(a, b) - minOf(a, b)) / TapeStore.SAMPLE_RATE.toFloat())} s)",
            fontSize = 14.sp, color = Palette.Plastic.copy(alpha = 0.75f),
        )
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Tool("📥 Open a file", !busy, Modifier.weight(1f), onOpenFile)
            Tool("↩️ Undo", canUndo && !busy, Modifier.weight(1f), vm::undoEdit)
        }
        Spacer(Modifier.height(12.dp))
        Text(if (picked) "The picked part" else "The whole tape", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
        Spacer(Modifier.height(6.dp))
        Rows(
            listOf(
                Triple("✂️ Keep only this", has && picked, vm::keepPicked),
                Triple("🗑️ Cut it out", has && picked, vm::cutPicked),
                Triple("🔁 Play it twice", has && picked, vm::repeatPicked),
                Triple("⏪ Backwards", has, vm::reversePicked),
                Triple("🌅 Fade in", has, { vm.fade(false) }),
                Triple("🌇 Fade out", has, { vm.fade(true) }),
                Triple("🔊 Louder", has, vm::louder),
                Triple("🔉 Quieter", has, vm::quieter),
                Triple("📏 Max volume", has, vm::maxVolume),
                Triple("🤫 Silence", has && picked, vm::silencePicked),
            ),
        )
        Spacer(Modifier.height(12.dp))
        Tool(
            if (busy) "⏳ Working…" else if (picked) "✨ Put the Voice Magic on this part" else "✨ Put the Voice Magic on all of it",
            has && hasMagic, Modifier.fillMaxWidth(), vm::applyFx, accent = true,
        )
        Text(
            if (hasMagic) "Press ▶ PLAY to hear it first. The magic below gets baked in for good (Undo can take it back)."
            else "Pick a sound in Voice Magic below, then bake it in here.",
            fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.65f), textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )
        Spacer(Modifier.height(8.dp))
        Tool("📤 Share or save as a WAV file", has, Modifier.fillMaxWidth(), onShare)
    }
}

@Composable
private fun Rows(tools: List<Triple<String, Boolean, () -> Unit>>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tools.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { (label, on, go) -> Tool(label, on, Modifier.weight(1f), go) }
            }
        }
    }
}

@Composable
private fun Tool(label: String, enabled: Boolean, modifier: Modifier, onClick: () -> Unit, accent: Boolean = false) {
    val shape = RoundedCornerShape(14.dp)
    val bg = if (accent) Palette.BgTop else Palette.Plastic
    Box(
        modifier.height(50.dp).clip(shape).background(bg.copy(alpha = if (enabled) 0.9f else 0.3f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

private fun stamp(frames: Int): String {
    val t = frames / TapeStore.SAMPLE_RATE.toFloat()
    return "%d:%04.1f".format((t / 60).toInt(), t % 60)
}
