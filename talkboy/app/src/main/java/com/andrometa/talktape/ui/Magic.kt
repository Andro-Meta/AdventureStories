package com.andrometa.talktape.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.andrometa.talktape.PRESETS
import com.andrometa.talktape.PRESET_GROUPS
import com.andrometa.talktape.audio.Fly
import com.andrometa.talktape.audio.FlyFx
import com.andrometa.talktape.audio.Fx
import com.andrometa.talktape.audio.GhostFx
import com.andrometa.talktape.audio.Harmony
import com.andrometa.talktape.audio.HarmonyFx
import com.andrometa.talktape.audio.OldTapeFx
import com.andrometa.talktape.audio.Place
import com.andrometa.talktape.audio.PlaceFx
import com.andrometa.talktape.audio.PolishFx
import com.andrometa.talktape.audio.Scale
import com.andrometa.talktape.audio.StutterFx
import com.andrometa.talktape.audio.TalkBox
import com.andrometa.talktape.audio.TalkBoxFx
import com.andrometa.talktape.audio.Tune
import com.andrometa.talktape.audio.TuneFx
import com.andrometa.talktape.audio.Wobble
import com.andrometa.talktape.audio.WobbleFx
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.pow
import kotlin.math.roundToInt

private val CardShape = RoundedCornerShape(26.dp)

/**
 * All the sound magic. Easy mode: presets, big hold pads, and one knob per effect.
 * Studio mode: the same cards with every engineer's knob showing.
 */
@Composable
fun MagicPanel(
    fx: Fx, onFx: (Fx) -> Unit, canSave: Boolean, busy: Boolean, onSave: () -> Unit,
    studio: Boolean, onStudio: (Boolean) -> Unit, onFindKey: () -> Unit,
    onFreeze: (Boolean) -> Unit, onStutter: (Boolean) -> Unit,
) {
    Column(Modifier.fillMaxWidth().clip(CardShape).background(Color.White.copy(alpha = 0.94f)).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("✨ Voice Magic", fontSize = 24.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
                Text("Tap a sound, then press ▶ PLAY or 🎤 Live Voice.", fontSize = 14.sp, color = Palette.Plastic.copy(alpha = 0.75f))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice("🧒 Easy", !studio, Modifier.weight(1f)) { onStudio(false) }
            Choice("🎛️ Studio", studio, Modifier.weight(1f)) { onStudio(true) }
        }

        // ── One-tap sounds ──
        PRESET_GROUPS.forEach { group ->
            Spacer(Modifier.height(12.dp))
            Text(group, fontSize = 16.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PRESETS.filter { it.group == group }.forEach { p ->
                    // Presets keep the Backwards switch as it is, so "Monster + Backwards" works.
                    val target = p.fx.copy(reverse = fx.reverse)
                    PresetTile(p.emoji, p.name, fx == target, Modifier.width(84.dp)) { onFx(target) }
                }
            }
        }

        // ── Hold pads ──
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HoldPad("🧊", "Hold to FREEZE", Palette.Wind, Modifier.weight(1f), onFreeze)
            HoldPad("💬", "Hold to STUTTER", Palette.Pause, Modifier.weight(1f), onStutter)
        }
        Text(
            "💿 Drag the cassette left and right to scratch like a DJ!",
            fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.7f), textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )

        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🎛️ Effects", fontSize = 20.sp, fontWeight = FontWeight.Black, color = Palette.Plastic, modifier = Modifier.weight(1f))
            TextButton(onClick = { onFx(Fx()) }, enabled = !fx.isNeutral) { Text("Reset all", fontSize = 15.sp, fontWeight = FontWeight.Bold) }
        }

        // ── Voice ──
        EffectCard("🎤", "Voice", "Speed, pitch and size", null, {}) {
            SpeedSlider("📼 Tape Speed", "Faster AND higher, or slower AND deeper", "🐢", "🐇", fx.tapeSpeed) { onFx(fx.copy(tapeSpeed = it)) }
            SpeedSlider("⏱️ Talk Speed", "Faster or slower, voice stays the same", "🐌", "🚀", fx.tempo) { onFx(fx.copy(tempo = it)) }
            SemitoneSlider("🎵 Voice Pitch", "Low like a bear or high like a bird", "🐻", "🐦", fx.pitch, "lower", "higher") { onFx(fx.copy(pitch = it)) }
            SemitoneSlider("📏 Voice Size", "Sound giant or teeny-tiny", "🐘", "🐜", fx.formant, "bigger", "smaller") { onFx(fx.copy(formant = it)) }
            ToggleRow("🔄", "Backwards", "Play the tape in reverse", fx.reverse) { onFx(fx.copy(reverse = it)) }
        }

        // ── Auto-Tune ──
        val t = fx.tune
        EffectCard("🎵", "Auto-Tune", "Sing right on the notes", t.on, { onFx(fx.copy(tune = t.copy(mode = if (it) Tune.Gentle else Tune.Off))) }) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Choice("🎶 Smooth", t.mode == Tune.Gentle, Modifier.weight(1f)) { onFx(fx.copy(tune = t.copy(mode = Tune.Gentle))) }
                Choice("🤖 Robot", t.mode == Tune.Robot, Modifier.weight(1f)) { onFx(fx.copy(tune = t.copy(mode = Tune.Robot))) }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KeyPicker(t, Modifier.weight(1.3f)) { onFx(fx.copy(tune = it)) }
                Choice("✨ Find key", false, Modifier.weight(1f), onFindKey)
            }
            if (studio) {
                Spacer(Modifier.height(6.dp))
                Amount("⚡ Retune speed", "Left = instant snap, right = slow and natural", "⚡", "🐢", t.speed, ms(t.speed * 400)) { onFx(fx.copy(tune = t.copy(speed = it))) }
                Amount("〰️ Keep vibrato", "How much of your own wobble and scoops stay", "📏", "〰️", t.humanize, pct(t.humanize)) { onFx(fx.copy(tune = t.copy(humanize = it))) }
                Amount("🎯 Strength", "How far it pulls you to the note", "🙂", "🎯", t.amount, pct(t.amount)) { onFx(fx.copy(tune = t.copy(amount = it))) }
                Amount("🤸 Flex", "Leave notes that are far off alone (0 = fix everything)", "🎯", "🤸", t.flex, pct(t.flex)) { onFx(fx.copy(tune = t.copy(flex = it))) }
            }
        }

        // ── Harmony ──
        val h = fx.harmony
        EffectCard("🎶", "Harmony", "Backing singers that follow you in key", h.on, { onFx(fx.copy(harmony = h.copy(style = if (it) Harmony.Third else Harmony.Off))) }) {
            Chips(Harmony.entries.drop(1).map { it.label }, Harmony.entries.drop(1).indexOf(h.style)) { onFx(fx.copy(harmony = h.copy(style = Harmony.entries.drop(1)[it]))) }
            Amount("🔊 Singers", "How loud the backing singers are", "🤫", "📣", h.mix, pct(h.mix)) { onFx(fx.copy(harmony = h.copy(mix = it))) }
            if (studio) {
                Amount("↔️ Spread", "Narrow to wide stereo", "⏺", "↔️", h.spread, pct(h.spread)) { onFx(fx.copy(harmony = h.copy(spread = it))) }
                Amount("🧑‍🤝‍🧑 Humanize", "Tight like a machine, or loose like real people", "🤖", "🧑‍🤝‍🧑", h.humanize, pct(h.humanize)) { onFx(fx.copy(harmony = h.copy(humanize = it))) }
            }
            Hint("Tip: turn on Auto-Tune and pick the song's key for the best harmonies.")
        }

        // ── Talk-box ──
        val k = fx.talk
        EffectCard("🤖", "Talk-box", "Your words played on a synth", k.on, { onFx(fx.copy(talk = k.copy(mode = if (it) TalkBox.Synth else TalkBox.Off))) }) {
            Chips(TalkBox.entries.drop(1).map { it.label }, TalkBox.entries.drop(1).indexOf(k.mode)) { onFx(fx.copy(talk = k.copy(mode = TalkBox.entries.drop(1)[it]))) }
            if (k.mode == TalkBox.Robot) KnobRow(
                "🎹 Robot note", "Low robot or high robot", "⬇️", "⬆️", noteName(k.note), k.note.toFloat(), 33f..69f, steps = 35,
            ) { onFx(fx.copy(talk = k.copy(note = it.roundToInt()))) }
            Amount("🌗 Tone", "Dark and smooth, or bright and buzzy", "🌑", "☀️", k.tone, pct(k.tone)) { onFx(fx.copy(talk = k.copy(tone = it))) }
            if (studio) Amount("🎚️ Mix", "Your own voice vs the synth", "🙂", "🤖", k.mix, pct(k.mix)) { onFx(fx.copy(talk = k.copy(mix = it))) }
        }

        // ── Whisper ──
        EffectCard("🤫", "Whisper", "Turn your voice into breath", fx.whisper > 0f, { onFx(fx.copy(whisper = if (it) 1f else 0f)) }) {
            Amount("🤫 How breathy", "A little air, or a full whisper", "🙂", "🤫", fx.whisper, pct(fx.whisper)) { onFx(fx.copy(whisper = it.coerceAtLeast(0.02f))) }
        }

        // ── Places ──
        val pl = fx.place
        EffectCard("📍", "Places", "Phone, walkie-talkie, radio, megaphone, underwater", pl.place != Place.Off, { onFx(fx.copy(place = pl.copy(place = if (it) Place.Telephone else Place.Off))) }) {
            val places = listOf(Place.Telephone to "📞 Phone", Place.Walkie to "📻 Walkie", Place.Radio to "🕰️ Radio", Place.Megaphone to "📣 Megaphone", Place.Underwater to "🐠 Underwater")
            Chips(places.map { it.second }, places.indexOfFirst { it.first == pl.place }) { onFx(fx.copy(place = pl.copy(place = places[it].first))) }
            if (studio) Amount("🎚️ Amount", "Blend with your real voice", "🙂", "📞", pl.amount, pct(pl.amount)) { onFx(fx.copy(place = pl.copy(amount = it))) }
        }

        // ── Old tape ──
        val ot = fx.oldTape
        EffectCard("📼", "Old Tape", "Warbly, hissy, warm, like grandpa's cassettes", ot.amount > 0f, { onFx(fx.copy(oldTape = ot.copy(amount = if (it) 0.7f else 0f))) }) {
            Amount("🕰️ How old", "A bit worn, or ancient", "✨", "🕰️", ot.amount, pct(ot.amount)) { onFx(fx.copy(oldTape = ot.copy(amount = it.coerceAtLeast(0.02f)))) }
            if (studio) {
                Amount("🌫️ Hiss", "Tape noise", "🔇", "🌫️", ot.hiss, pct(ot.hiss)) { onFx(fx.copy(oldTape = ot.copy(hiss = it))) }
                Amount("〰️ Wow & flutter", "Speed wobble", "➖", "〰️", ot.wow, pct(ot.wow)) { onFx(fx.copy(oldTape = ot.copy(wow = it))) }
                Amount("🔥 Saturation", "Warm tape squash", "❄️", "🔥", ot.saturation, pct(ot.saturation)) { onFx(fx.copy(oldTape = ot.copy(saturation = it))) }
            }
        }

        // ── Wobble ──
        val wb = fx.wobble
        EffectCard("🌀", "Wobble", "Tremolo, vibrato, jet and phaser", wb.mode != Wobble.Off, { onFx(fx.copy(wobble = wb.copy(mode = if (it) Wobble.Vibrato else Wobble.Off))) }) {
            val modes = listOf(Wobble.Tremolo to "💓 Tremolo", Wobble.Vibrato to "〰️ Vibrato", Wobble.Flanger to "✈️ Jet", Wobble.Phaser to "🌊 Phaser")
            Chips(modes.map { it.second }, modes.indexOfFirst { it.first == wb.mode }) { onFx(fx.copy(wobble = wb.copy(mode = modes[it].first))) }
            Amount("⏩ Speed", "Slow swirl or fast flutter", "🐢", "🐇", wb.rate, hz(0.1f * 80f.pow(wb.rate))) { onFx(fx.copy(wobble = wb.copy(rate = it))) }
            Amount("📏 Amount", "Subtle or wild", "🙂", "🤪", wb.depth, pct(wb.depth)) { onFx(fx.copy(wobble = wb.copy(depth = it))) }
            if (studio) Amount("🎚️ Mix", "Dry vs effect", "🙂", "🌀", wb.mix, pct(wb.mix)) { onFx(fx.copy(wobble = wb.copy(mix = it))) }
        }

        // ── Room ──
        EffectCard("🏛️", "Room", "Twin voices, echo and reverb", fx.hasSpace, {
            onFx(if (it) fx.copy(reverb = 0.35f) else fx.copy(layers = 0, echo = 0f, reverb = 0f))
        }) {
            val layerText = when (fx.layers) { 0 -> "Normal"; 1 -> "1 twin"; else -> "${fx.layers + 1} of you" }
            KnobRow("👯 Twin Voices", "Copies of you singing along, left and right", "🙂", "👯", layerText, fx.layers.toFloat(), 0f..Fx.MAX_LAYERS.toFloat(), steps = Fx.MAX_LAYERS - 1) { onFx(fx.copy(layers = it.roundToInt())) }
            AmountSlider("🏜️ Echo", "Hello… hello… hello…", "🔇", "🏜️", fx.echo, listOf("a little", "lots", "loads")) { onFx(fx.copy(echo = it)) }
            if (fx.echo > 0f) KnobRow("⏳ Echo Time", "Quick slap-back or a giant canyon", "⚡", "🏔️", "%.2f s".format(0.08f + 0.72f * fx.echoTime), fx.echoTime, 0f..1f) { onFx(fx.copy(echoTime = it)) }
            AmountSlider("⛪ Reverb", "From a small room to a giant cave", "🚪", "⛪", fx.reverb, listOf("small room", "big hall", "giant cave")) { onFx(fx.copy(reverb = it)) }
        }

        // ── Ghost ──
        val g = fx.ghost
        EffectCard("👻", "Ghost Swell", "Spooky reverb that swells in BEFORE each word", g.amount > 0f, { onFx(fx.copy(ghost = g.copy(amount = if (it) 0.7f else 0f))) }) {
            Amount("👻 Spookiness", "How loud the swell is", "🙂", "👻", g.amount, pct(g.amount)) { onFx(fx.copy(ghost = g.copy(amount = it.coerceAtLeast(0.02f)))) }
            if (studio) Amount("⏳ Swell length", "Short whoosh or long rise", "⚡", "🌫️", g.length, "%.1f s".format(0.5f + 2.5f * g.length)) { onFx(fx.copy(ghost = g.copy(length = it))) }
            Hint("Works on tapes (it has to hear what's coming), not in Live Voice.")
        }

        // ── Fly-around ──
        val fl = fx.fly
        EffectCard("🛸", "Fly-Around", "Your voice flies around your head (use headphones!)", fl.mode != Fly.Off, { onFx(fx.copy(fly = fl.copy(mode = if (it) Fly.Circle else Fly.Off))) }) {
            val modes = listOf(Fly.Circle to "🔄 Circle", Fly.SideToSide to "↔️ Side to side", Fly.FlyBy to "🏎️ Zoom past", Fly.Overhead to "🛸 Overhead")
            Chips(modes.map { it.second }, modes.indexOfFirst { it.first == fl.mode }) { onFx(fx.copy(fly = fl.copy(mode = modes[it].first))) }
            Amount("⏩ Speed", "Slow drift or racing", "🐢", "🏎️", fl.speed, pct(fl.speed)) { onFx(fx.copy(fly = fl.copy(speed = it))) }
            if (studio) Amount("📍 Distance", "Close to your ear or far away", "👂", "🏔️", fl.distance, pct(fl.distance)) { onFx(fx.copy(fly = fl.copy(distance = it))) }
        }

        // ── Stutter ──
        val st = fx.stutter
        EffectCard("💬", "Auto Stutter", "\"H-h-h-hello!\" at the start of every word", st.auto, { onFx(fx.copy(stutter = st.copy(auto = it))) }) {
            KnobRow("🔁 Repeats", "How many times", "2", "8", "${st.repeats}×", st.repeats.toFloat(), 2f..8f, steps = 5) { onFx(fx.copy(stutter = st.copy(repeats = it.roundToInt()))) }
            if (studio) Amount("✂️ Slice", "How much of the word repeats", "✂️", "📏", st.slice, ms((0.04f + 0.21f * st.slice) * 1000)) { onFx(fx.copy(stutter = st.copy(slice = it))) }
        }

        // ── Clean-up ──
        val p = fx.polish
        val cleanOn = fx.clean > 0f || p.amount > 0f
        EffectCard("✨", "Clean-up", "Less hiss and room noise, smoother and clearer", cleanOn, {
            onFx(fx.copy(clean = if (it) 0.5f else 0f, polish = p.copy(amount = if (it) 0.6f else 0f)))
        }) {
            Amount("✨ How much", "Gentle polish or full studio treatment", "🙂", "✨", maxOf(fx.clean, p.amount), pct(maxOf(fx.clean, p.amount))) { v ->
                val x = v.coerceAtLeast(0.02f); onFx(fx.copy(clean = x, polish = p.copy(amount = x)))
            }
            if (studio) {
                Amount("🔇 Noise reduction", "Hiss and room tone removed", "🔈", "🔇", fx.clean, pct(fx.clean)) { onFx(fx.copy(clean = it)) }
                Amount("🔻 Low cut", "Rumble filter", "40", "160", p.lowCut, "${(40 + 120 * p.lowCut).roundToInt()} Hz") { onFx(fx.copy(polish = p.copy(lowCut = it))) }
                Amount("🐍 De-ess", "Tames sharp \"sss\" sounds", "🙂", "🐍", p.deEss, pct(p.deEss)) { onFx(fx.copy(polish = p.copy(deEss = it))) }
                Amount("🗜️ Compress", "Evens out loud and quiet bits", "🙂", "🗜️", p.compress, pct(p.compress)) { onFx(fx.copy(polish = p.copy(compress = it))) }
                Amount("💎 Presence", "Clarity and air", "🙂", "💎", p.presence, pct(p.presence)) { onFx(fx.copy(polish = p.copy(presence = it))) }
                ToggleRow("📈", "Auto level", "Rides the volume to a steady level", p.autoLevel) { onFx(fx.copy(polish = p.copy(autoLevel = it))) }
            }
        }

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
            if (canSave || busy) "Makes a new tape with this sound baked in." else "Record something and pick some magic to save a copy.",
            fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.6f), textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )
    }
}

/** A rack unit: title, switch, and its knobs when it's on. [on] null = always open, no switch. */
@Composable
private fun EffectCard(emoji: String, title: String, help: String, on: Boolean?, onToggle: (Boolean) -> Unit, content: @Composable () -> Unit) {
    val open = on ?: true
    Column(
        Modifier.fillMaxWidth().padding(vertical = 5.dp).clip(RoundedCornerShape(20.dp))
            .background(if (open && on != null) Palette.BgTop.copy(alpha = 0.08f) else Palette.BodyLight)
            .border(if (open && on != null) 2.dp else 1.dp, if (open && on != null) Palette.BgTop.copy(alpha = 0.5f) else Palette.BodyDark, RoundedCornerShape(20.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().then(if (on != null) Modifier.clickable(role = Role.Switch, onClickLabel = "Turn $title ${if (on) "off" else "on"}") { onToggle(!on) } else Modifier),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(emoji, fontSize = 28.sp)
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
                Text(help, fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.7f))
            }
            if (on != null) Switch(checked = on, onCheckedChange = null, colors = SwitchDefaults.colors(checkedTrackColor = Palette.BgTop))
        }
        if (open) {
            Spacer(Modifier.height(6.dp))
            content()
        }
    }
}

/** Big pad that works while held (freeze, stutter). */
@Composable
private fun HoldPad(emoji: String, label: String, color: Color, modifier: Modifier, onHold: (Boolean) -> Unit) {
    var down by remember { mutableStateOf(false) }
    Column(
        modifier.height(76.dp).shadow(if (down) 1.dp else 6.dp, RoundedCornerShape(18.dp))
            .clip(RoundedCornerShape(18.dp)).background(if (down) color.copy(alpha = 0.7f) else color)
            .semantics { contentDescription = label; role = Role.Button }
            .pointerInput(Unit) {
                detectTapGestures(onPress = {
                    down = true; onHold(true)
                    tryAwaitRelease()
                    down = false; onHold(false)
                })
            },
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(emoji, fontSize = 26.sp)
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White)
    }
}

@Composable
private fun Chips(labels: List<String>, selected: Int, onPick: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEachIndexed { i, l -> Choice(l, i == selected, Modifier.padding(vertical = 2.dp)) { onPick(i) } }
    }
}

@Composable
private fun Hint(text: String) =
    Text(text, fontSize = 12.sp, color = Palette.Plastic.copy(alpha = 0.6f), modifier = Modifier.padding(top = 4.dp))

@Composable
private fun ToggleRow(emoji: String, title: String, help: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(16.dp))
            .clickable(role = Role.Switch) { onChange(!on) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 24.sp)
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
            Text(help, fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.65f))
        }
        Switch(checked = on, onCheckedChange = null, colors = SwitchDefaults.colors(checkedTrackColor = Palette.BgTop))
    }
}

/** Recording and playback channels. */
@Composable
fun SoundSetup(stereoRec: Boolean, onStereoRec: (Boolean) -> Unit, monoPlay: Boolean, onMonoPlay: (Boolean) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(CardShape).background(Color.White.copy(alpha = 0.94f)).padding(16.dp)) {
        Text("🎧 Sound Setup", fontSize = 20.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
        Spacer(Modifier.height(8.dp))
        Text("Record new tapes in", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Palette.Plastic)
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice("🔈 Mono", !stereoRec, Modifier.weight(1f)) { onStereoRec(false) }
            Choice("🔊 Stereo", stereoRec, Modifier.weight(1f)) { onStereoRec(true) }
        }
        Text("Play back in", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Palette.Plastic)
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Choice("🔈 Mono", monoPlay, Modifier.weight(1f)) { onMonoPlay(true) }
            Choice("🎧 Stereo", !monoPlay, Modifier.weight(1f)) { onMonoPlay(false) }
        }
        Text(
            "Stereo uses two microphones, so you can hear where sounds are. Echo, reverb, harmony and fly-around sound best in stereo with headphones.",
            fontSize = 13.sp, color = Palette.Plastic.copy(alpha = 0.65f),
        )
    }
}

@Composable
private fun Choice(name: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier.clip(shape)
            .background(if (selected) Palette.BgTop.copy(alpha = 0.16f) else Palette.BodyLight)
            .border(if (selected) 3.dp else 1.dp, if (selected) Palette.BgTop else Palette.BodyDark, shape)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics { stateDescription = if (selected) "On" else "Off" }
            .padding(vertical = 10.dp, horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Palette.Plastic, maxLines = 1)
    }
}

/** Auto-tune key and scale: "Any note", or a key with major / minor (and more in the list). */
@Composable
private fun KeyPicker(t: TuneFx, modifier: Modifier, onTune: (TuneFx) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val name = if (t.scale == Scale.Chromatic) "Any note" else "${TuneFx.KEY_NAMES[t.key]} ${t.scale.label.lowercase()}"
    Box(modifier) {
        Choice("🎹 $name ▾", false, Modifier.fillMaxWidth()) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("Any note (easiest)") }, onClick = { onTune(t.copy(scale = Scale.Chromatic)); open = false })
            Scale.entries.drop(1).forEach { sc ->
                TuneFx.KEY_NAMES.forEachIndexed { i, k ->
                    DropdownMenuItem(text = { Text("$k ${sc.label.lowercase()}") }, onClick = { onTune(t.copy(key = i, scale = sc)); open = false })
                }
            }
        }
    }
}

@Composable
private fun PresetTile(emoji: String, name: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier.clip(shape)
            .background(if (selected) Palette.BgTop.copy(alpha = 0.16f) else Palette.BodyLight)
            .border(if (selected) 3.dp else 1.dp, if (selected) Palette.BgTop else Palette.BodyDark, shape)
            .clickable(role = Role.RadioButton, onClickLabel = "Use $name", onClick = onClick)
            .semantics { stateDescription = if (selected) "On" else "Off" }
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 30.sp)
        Text(name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Palette.Plastic, maxLines = 1)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun KnobRow(
    title: String, help: String, left: String, right: String, valueText: String,
    value: Float, range: ClosedFloatingPointRange<Float>, steps: Int = 0, onChange: (Float) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Black, color = Palette.Plastic, modifier = Modifier.weight(1f))
            Text(
                valueText, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                color = if (valueText == "Normal" || valueText == "Off") Palette.Plastic.copy(alpha = 0.5f) else Palette.BgTop,
            )
        }
        Text(help, fontSize = 12.sp, color = Palette.Plastic.copy(alpha = 0.65f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(left, fontSize = 20.sp)
            Slider(
                value = value, onValueChange = onChange, valueRange = range, steps = steps,
                modifier = Modifier.weight(1f).padding(horizontal = 6.dp)
                    .semantics { contentDescription = title; stateDescription = valueText },
                colors = SliderDefaults.colors(
                    thumbColor = Palette.BgTop, activeTrackColor = Palette.BgTop,
                    inactiveTrackColor = Palette.BodyDark,
                ),
                // Big round knob: easy to grab with a thumb.
                thumb = {
                    Box(
                        Modifier.size(28.dp).shadow(4.dp, CircleShape).background(Color.White, CircleShape)
                            .border(6.dp, Palette.BgTop, CircleShape),
                    )
                },
            )
            Text(right, fontSize = 20.sp)
        }
    }
}

/** A plain 0..1 knob with its value shown as [text]. */
@Composable
private fun Amount(title: String, help: String, left: String, right: String, value: Float, text: String, onChange: (Float) -> Unit) =
    KnobRow(title, help, left, right, text, value, 0f..1f, onChange = onChange)

/** 0..1 effect amount, 0 snapping to Off so it's easy to switch off again. */
@Composable
private fun AmountSlider(
    title: String, help: String, left: String, right: String, value: Float, words: List<String>,
    onChange: (Float) -> Unit,
) {
    val text = if (value <= 0f) "Off" else words[(value * words.size).toInt().coerceAtMost(words.size - 1)]
    KnobRow(title, help, left, right, text, value, 0f..1f) { onChange(if (it < 0.04f) 0f else it) }
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

private fun pct(v: Float) = "${(v * 100).roundToInt()}%"
private fun ms(v: Float) = if (v < 1f) "instant" else "${v.roundToInt()} ms"
private fun hz(v: Float) = "%.1f Hz".format(v)
private fun noteName(m: Int) = TuneFx.KEY_NAMES[Math.floorMod(m, 12)] + (m / 12 - 1)
