package com.andrometa.talktape.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.andrometa.talktape.DeckViewModel
import com.andrometa.talktape.audio.DeckState
import com.andrometa.talktape.audio.Mode
import com.andrometa.talktape.data.TapeStore
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** What the screen needs from the Activity: the mic permission and a headphone check. */
class Host(val withMic: (() -> Unit) -> Unit, val hasHeadphones: () -> Boolean)

@Composable
fun DeckScreen(vm: DeckViewModel, host: Host) {
    val st by vm.deck.state.collectAsStateWithLifecycle()
    val tape by vm.current.collectAsStateWithLifecycle()
    val fx by vm.fx.collectAsStateWithLifecycle()
    val peaks by vm.peaks.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val stereoRec by vm.stereoRec.collectAsStateWithLifecycle()
    val monoPlay by vm.monoPlay.collectAsStateWithLifecycle()
    val deck = vm.deck
    val sr = TapeStore.SAMPLE_RATE

    var showTapes by rememberSaveable { mutableStateOf(false) }
    var askOverwrite by remember { mutableStateOf(false) }
    var askLive by remember { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }

    LaunchedEffect(st.message) {
        st.message?.let { deck.clearMessage(); snack.showSnackbar(it) }
    }
    val view = LocalView.current
    val active = st.mode != Mode.Idle && !st.paused
    SideEffect { view.keepScreenOn = active }

    val progress = if (st.length > 0) st.position.toFloat() / st.length else 0f
    val label = Palette.label(tape?.color ?: 0)

    val rec = {
        if (!(st.mode == Mode.Recording && !st.paused)) host.withMic {
            val s = deck.state.value // fresh: the permission prompt may have taken a while
            val resuming = s.paused && s.mode == Mode.Recording
            if (!resuming && s.length > 0 && s.position < s.length - sr / 4) askOverwrite = true else deck.record()
        }
    }
    val live = {
        if (st.mode == Mode.Live) deck.stop() else host.withMic {
            if (!host.hasHeadphones() && !vm.liveTipShown) askLive = true else deck.live()
        }
    }

    Box(Modifier.fillMaxSize().background(BackgroundBrush)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 560.dp).fillMaxWidth()) {
                TopBar(tape?.name ?: "…", label) { showTapes = true }
                Spacer(Modifier.height(14.dp))

                // ── The tape machine ──
                Column(
                    Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(30.dp))
                        .background(BodyBrush, RoundedCornerShape(30.dp)).padding(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SpeakerGrill(st.level, if (st.mode == Mode.Recording) Palette.Rec else Palette.Pause, Modifier.size(96.dp))
                        Spacer(Modifier.size(14.dp))
                        Lcd(st, fx.reverse, vm.maxSamples, Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(14.dp))
                    Cassette(tape?.name ?: "", label, progress, if (st.paused) 0f else st.speed)
                    Spacer(Modifier.height(12.dp))
                    TapeStrip(
                        peaks, progress,
                        enabled = st.mode != Mode.Recording && st.mode != Mode.Live && st.length > 0,
                        accent = label,
                        onSeek = { deck.seek((it * st.length).toInt()) },
                    )
                    Spacer(Modifier.height(14.dp))
                    Keys(st, rec, deck::play, deck::togglePause,
                        stop = { if (st.mode == Mode.Idle && !st.paused) showTapes = true else deck.stop() },
                        rew = { deck.skip(-5) }, ff = { deck.skip(5) },
                        cue = deck::cueStart, cueEnd = deck::cueEnd)
                }

                Spacer(Modifier.height(16.dp))
                LiveButton(st.mode == Mode.Live, st.level, live)
                Spacer(Modifier.height(16.dp))
                MagicPanel(
                    fx, vm::setFx,
                    canSave = st.length > 0 && !fx.isNeutral && st.mode != Mode.Recording,
                    busy = busy, onSave = vm::saveMagicCopy,
                )
                Spacer(Modifier.height(16.dp))
                SoundSetup(stereoRec, vm::setStereoRec, monoPlay, vm::setMonoPlay)
                Spacer(Modifier.height(16.dp))
                Text(
                    "Tip: hold ⏩ or ⏪ to zoom through the tape. Press ■ twice to swap tapes.",
                    color = Color.White.copy(alpha = 0.85f), fontSize = 14.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(24.dp))
            }
        }
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing))
    }

    if (showTapes) TapesSheet(vm, onDismiss = { showTapes = false })

    if (askOverwrite) AlertDialog(
        onDismissRequest = { askOverwrite = false },
        title = { Text("Record over it? 🎙️") },
        text = { Text("There's already sound here. Recording now will tape over it, just like a real cassette.", fontSize = 17.sp) },
        confirmButton = { TextButton(onClick = { askOverwrite = false; deck.record() }) { Text("Record over it", fontSize = 16.sp, fontWeight = FontWeight.Bold) } },
        dismissButton = {
            Row {
                TextButton(onClick = { askOverwrite = false }) { Text("Cancel", fontSize = 16.sp) }
                TextButton(onClick = { askOverwrite = false; vm.newTape { deck.record() } }) { Text("New tape", fontSize = 16.sp) }
            }
        },
    )

    if (askLive) AlertDialog(
        onDismissRequest = { askLive = false },
        title = { Text("Squeal alert! 🎧") },
        text = { Text("Live Voice works best with headphones. Without them, the phone can hear itself and make a loud squeal. If it squeals, turn the volume down or move the phone away from your mouth.", fontSize = 17.sp) },
        confirmButton = { TextButton(onClick = { askLive = false; vm.liveTipShown = true; deck.live() }) { Text("Let's go!", fontSize = 16.sp, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = { askLive = false }) { Text("Cancel", fontSize = 16.sp) } },
    )
}

@Composable
private fun TopBar(tapeName: String, color: Color, onTapes: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("📼", fontSize = 30.sp)
        Spacer(Modifier.size(6.dp))
        Text("TalkTape", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
        Row(
            Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.22f))
                .clickable(onClickLabel = "Open my tapes", onClick = onTapes)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(14.dp).background(color, CircleShape).border(2.dp, Color.White, CircleShape))
            Spacer(Modifier.size(8.dp))
            Text(tapeName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 140.dp))
            Text("  ▾", color = Color.White, fontSize = 16.sp)
        }
    }
}

private fun clock(samples: Int): String {
    val s = samples / TapeStore.SAMPLE_RATE
    return "%d:%02d".format(s / 60, s % 60)
}

@Composable
private fun Lcd(st: DeckState, reverse: Boolean, maxSamples: Int, modifier: Modifier) {
    val blink by rememberInfiniteTransition(label = "blink").animateFloat(
        1f, 0.2f, infiniteRepeatable(tween(550), RepeatMode.Reverse), label = "blink",
    )
    val status = when {
        st.paused -> "❚❚ PAUSED"
        st.mode == Mode.Recording -> "● RECORDING"
        st.mode == Mode.Playing -> if (reverse) "◀ BACKWARDS" else "▶ PLAYING"
        st.mode == Mode.Cueing -> if (st.speed < 0) "◀◀ REWIND" else "▶▶ FAST"
        st.mode == Mode.Live -> "🎤 LIVE VOICE"
        st.length == 0 -> "EMPTY TAPE"
        else -> "■ STOPPED"
    }
    val sub = when (st.mode) {
        Mode.Recording -> "tape left ${clock(maxSamples - st.position)}"
        Mode.Live -> "talk now!"
        else -> "of ${clock(st.length)}"
    } + if (st.stereo) "  STEREO" else ""
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(Palette.Plastic).padding(6.dp)
            .clip(RoundedCornerShape(12.dp)).background(Palette.Lcd).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(status, color = if (st.mode == Mode.Recording) Palette.Rec else Palette.LcdInk,
            fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1,
            modifier = Modifier.alpha(if (st.mode == Mode.Recording && !st.paused) blink else 1f))
        Text(clock(st.position), color = Palette.LcdInk, fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Black, fontSize = 38.sp, lineHeight = 40.sp)
        Text(sub, color = Palette.LcdInk.copy(alpha = 0.75f), fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            val lit = (st.level * 12).toInt()
            repeat(12) { i ->
                val c = when { i >= 10 -> Palette.Rec; i >= 7 -> Palette.Pause; else -> Palette.LcdInk }
                Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(2.dp)).background(if (i < lit) c else c.copy(alpha = 0.12f)))
            }
        }
    }
}

@Composable
private fun Keys(
    st: DeckState, rec: () -> Unit, play: () -> Unit, pause: () -> Unit, stop: () -> Unit,
    rew: () -> Unit, ff: () -> Unit, cue: (Int) -> Unit, cueEnd: () -> Unit,
) {
    val on = !st.paused
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val m = Modifier.weight(1f)
        PianoKey(Glyph.Rec, "REC", Palette.Rec, st.mode == Mode.Recording && on, m, rec)
        PianoKey(Glyph.Play, "PLAY", Palette.Play, st.mode == Mode.Playing && on, m, play)
        PianoKey(Glyph.Rew, "REW", Palette.Wind, st.mode == Mode.Cueing && st.speed < 0, m, rew, onHold = { cue(-1) }, onRelease = cueEnd)
        PianoKey(Glyph.Ff, "F.FWD", Palette.Wind, st.mode == Mode.Cueing && st.speed > 0, m, ff, onHold = { cue(1) }, onRelease = cueEnd)
        PianoKey(Glyph.Stop, if (st.mode == Mode.Idle && !st.paused) "EJECT" else "STOP", Palette.Stop, false, m, stop)
        PianoKey(Glyph.Pause, "PAUSE", Palette.Pause, st.paused, m, pause)
    }
}

/** A chunky cassette-deck key. Latched keys stay pushed down, like the real thing. */
@Composable
private fun PianoKey(
    glyph: Glyph, label: String, color: Color, latched: Boolean, modifier: Modifier,
    onTap: () -> Unit, onHold: (() -> Unit)? = null, onRelease: () -> Unit = {},
) {
    var pressed by remember { mutableStateOf(false) }
    val haptic = LocalHapticFeedback.current
    val tap by rememberUpdatedState(onTap)
    val hold by rememberUpdatedState(onHold)
    val release by rememberUpdatedState(onRelease)
    val down = pressed || latched
    val sink by animateDpAsState(if (down) 6.dp else 0.dp, tween(70), label = "key")
    val side = Color(
        color.red * 0.62f, color.green * 0.62f, color.blue * 0.62f, 1f,
    )
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth().height(84.dp)
                .semantics(mergeDescendants = true) {
                    role = Role.Button; contentDescription = label; selected = latched
                    onClick { tap(); true }
                }
                .pointerInput(Unit) {
                    detectTapGestures(onPress = {
                        pressed = true
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        coroutineScope {
                            var held = false
                            val timer = hold?.let { h -> launch { delay(280); held = true; h() } }
                            val up = tryAwaitRelease()
                            timer?.cancel()
                            pressed = false
                            if (held) release() else if (up) tap()
                        }
                    })
                },
        ) {
            Box(Modifier.fillMaxSize().padding(top = 8.dp).clip(RoundedCornerShape(14.dp)).background(side))
            Box(
                Modifier.fillMaxWidth().height(76.dp).offset(y = sink)
                    .clip(RoundedCornerShape(14.dp)).background(color)
                    .border(2.dp, Color.White.copy(alpha = if (down) 0.1f else 0.35f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(30.dp)) { glyph(glyph, Color.White) }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(label, color = Palette.Plastic, fontSize = 12.sp, fontWeight = FontWeight.Black, maxLines = 1)
    }
}

@Composable
private fun LiveButton(on: Boolean, level: Float, onClick: () -> Unit) {
    val pulse by rememberInfiniteTransition(label = "live").animateFloat(
        0f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "live",
    )
    val bg = if (on) Palette.Live else Color.White.copy(alpha = 0.18f)
    Row(
        Modifier.fillMaxWidth()
            .shadow(if (on) (6 + 10 * pulse).dp else 0.dp, RoundedCornerShape(24.dp))
            .clip(RoundedCornerShape(24.dp)).background(bg)
            .border(2.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(24.dp))
            .clickable(onClickLabel = if (on) "Stop live voice" else "Start live voice", onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🎤", fontSize = (34 + if (on) level * 10 else 0f).sp)
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(if (on) "Live! Tap to stop" else "Live Voice", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text(
                if (on) "Your magic voice is coming out of the speaker" else "Talk into the phone and hear your magic voice right away",
                color = Color.White.copy(alpha = 0.9f), fontSize = 14.sp,
            )
        }
    }
}
