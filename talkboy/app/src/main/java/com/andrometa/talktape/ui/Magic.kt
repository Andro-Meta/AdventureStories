package com.andrometa.talktape.ui

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andrometa.talktape.PRESETS
import com.andrometa.talktape.audio.Fx
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt

private val CardShape = RoundedCornerShape(26.dp)

@Composable
fun MagicPanel(fx: Fx, onFx: (Fx) -> Unit, canSave: Boolean, busy: Boolean, onSave: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(CardShape).background(Color.White.copy(alpha = 0.94f)).padding(16.dp),
    ) {
        Text("✨ Voice Magic", fontSize = 24.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
        Text("Pick a voice, then press ▶ PLAY or 🎤 Live Voice.", fontSize = 15.sp, color = Palette.Plastic.copy(alpha = 0.75f))
        Spacer(Modifier.height(12.dp))

        PRESETS.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { p ->
                    // Presets keep the Backwards switch as it is, so "Monster + Backwards" works.
                    val target = p.fx.copy(reverse = fx.reverse)
                    PresetTile(p.emoji, p.name, fx == target, Modifier.weight(1f)) { onFx(target) }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                .background(if (fx.reverse) Palette.BgTop.copy(alpha = 0.14f) else Palette.BodyLight)
                .clickable(role = Role.Switch, onClickLabel = "Toggle backwards") { onFx(fx.copy(reverse = !fx.reverse)) }
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("🔄", fontSize = 30.sp)
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Backwards", fontSize = 18.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
                Text("Play the tape in reverse", fontSize = 14.sp, color = Palette.Plastic.copy(alpha = 0.7f))
            }
            Switch(
                checked = fx.reverse, onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = Palette.BgTop),
            )
        }

        Spacer(Modifier.height(18.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🎛️ Mixer", fontSize = 20.sp, fontWeight = FontWeight.Black, color = Palette.Plastic, modifier = Modifier.weight(1f))
            TextButton(onClick = { onFx(Fx()) }, enabled = !fx.isNeutral) { Text("Reset all", fontSize = 15.sp, fontWeight = FontWeight.Bold) }
        }

        SpeedSlider(
            "📼 Tape Speed", "Old-school: faster AND higher, or slower AND deeper",
            "🐢", "🐇", fx.tapeSpeed,
        ) { onFx(fx.copy(tapeSpeed = it)) }
        SpeedSlider(
            "⏱️ Talk Speed", "Faster or slower, voice stays the same",
            "🐌", "🚀", fx.tempo,
        ) { onFx(fx.copy(tempo = it)) }
        SemitoneSlider(
            "🎵 Voice Pitch", "Low like a bear or high like a bird",
            "🐻", "🐦", fx.pitch, "lower", "higher",
        ) { onFx(fx.copy(pitch = it)) }
        SemitoneSlider(
            "📏 Voice Size", "Sound giant or teeny-tiny",
            "🐘", "🐜", fx.formant, "bigger", "smaller",
        ) { onFx(fx.copy(formant = it)) }

        Spacer(Modifier.height(10.dp))
        Button(
            onClick = onSave, enabled = canSave && !busy,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Palette.BgTop),
        ) {
            if (busy) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 3.dp)
                Spacer(Modifier.size(10.dp))
                Text("Making your copy…", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            } else {
                Text("💾 Save a magic copy", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(
            if (canSave || busy) "Makes a new tape with this voice baked in." else "Record something and pick some magic to save a copy.",
            fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.6f), textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )
    }
}

@Composable
private fun PresetTile(emoji: String, name: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier.clip(shape)
            .background(if (selected) Palette.BgTop.copy(alpha = 0.16f) else Palette.BodyLight)
            .border(if (selected) 3.dp else 1.dp, if (selected) Palette.BgTop else Palette.BodyDark, shape)
            .clickable(role = Role.RadioButton, onClickLabel = "Use $name voice", onClick = onClick)
            .semantics { stateDescription = if (selected) "On" else "Off" }
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 30.sp)
        Text(name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Palette.Plastic, maxLines = 1)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun KnobRow(
    title: String, help: String, left: String, right: String, valueText: String,
    value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Palette.Plastic, modifier = Modifier.weight(1f))
            Text(
                valueText, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                color = if (valueText == "Normal") Palette.Plastic.copy(alpha = 0.5f) else Palette.BgTop,
            )
        }
        Text(help, fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.65f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(left, fontSize = 24.sp)
            Slider(
                value = value, onValueChange = onChange, valueRange = range,
                modifier = Modifier.weight(1f).padding(horizontal = 6.dp)
                    .semantics { contentDescription = title; stateDescription = valueText },
                colors = SliderDefaults.colors(
                    thumbColor = Palette.BgTop, activeTrackColor = Palette.BgTop,
                    inactiveTrackColor = Palette.BodyDark,
                ),
                // Big round knob: easy to grab with a thumb.
                thumb = {
                    Box(
                        Modifier.size(30.dp).shadow(4.dp, CircleShape).background(Color.White, CircleShape)
                            .border(6.dp, Palette.BgTop, CircleShape),
                    )
                },
            )
            Text(right, fontSize = 24.sp)
        }
    }
}

/** Speeds slide on a doubling scale (half speed ... double speed) with a sticky "Normal" in the middle. */
@Composable
private fun SpeedSlider(title: String, help: String, left: String, right: String, speed: Float, onChange: (Float) -> Unit) {
    val v = log2(speed)
    val text = when {
        abs(speed - 1f) < 0.01f -> "Normal"
        speed > 1f -> "%.1f× faster".format(speed)
        else -> "%.1f× slower".format(1f / speed)
    }
    KnobRow(title, help, left, right, text, v, -1f..1f) { x ->
        onChange(if (abs(x) < 0.07f) 1f else 2f.pow(x))
    }
}

/** Pitch / size in semitones, snapping to whole steps so kids can find "Normal" again. */
@Composable
private fun SemitoneSlider(
    title: String, help: String, left: String, right: String, value: Float,
    down: String, up: String, onChange: (Float) -> Unit,
) {
    val n = value.roundToInt()
    val text = when {
        n == 0 -> "Normal"
        n > 0 -> "$up +$n"
        else -> "$down ${-n}"
    }
    KnobRow(title, help, left, right, text, value, -Fx.MAX_SEMIS..Fx.MAX_SEMIS) { x ->
        onChange(x.roundToInt().toFloat())
    }
}
