package com.andrometa.talktape.ui

import android.content.ActivityNotFoundException
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.andrometa.talktape.DeckViewModel
import com.andrometa.talktape.data.Tape
import com.andrometa.talktape.data.TapeStore
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TapesSheet(vm: DeckViewModel, onDismiss: () -> Unit) {
    val tapes by vm.tapes.collectAsStateWithLifecycle()
    val current by vm.current.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Tape?>(null) }
    var deleting by remember { mutableStateOf<Tape?>(null) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 18.dp).navigationBarsPadding()) {
            Text("📼 My Tapes", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Palette.Plastic)
            Text("Tap a tape to put it in the deck.", fontSize = 15.sp, color = Palette.Plastic.copy(alpha = 0.7f))
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { vm.newTape(); onDismiss() },
                modifier = Modifier.fillMaxWidth().height(58.dp), shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Palette.Play),
            ) { Text("＋  New blank tape", fontSize = 18.sp, fontWeight = FontWeight.Black) }
            Spacer(Modifier.height(12.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                items(tapes.reversed(), key = { it.id }) { t ->
                    TapeRow(
                        t, inDeck = t.id == current?.id,
                        onPick = { if (t.id != current?.id) vm.select(t); onDismiss() },
                        onEdit = { editing = t },
                        onShare = {
                            scope.launch {
                                try { ctx.startActivity(vm.shareIntent(t)) } catch (_: ActivityNotFoundException) {}
                            }
                        },
                        onDelete = { deleting = t },
                    )
                }
            }
        }
    }

    editing?.let { t ->
        var name by remember(t.id) { mutableStateOf(t.name) }
        var color by remember(t.id) { mutableIntStateOf(t.color) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("Name your tape ✏️") },
            text = {
                Column {
                    OutlinedTextField(name, { name = it.take(30) }, singleLine = true, label = { Text("Tape name") })
                    Spacer(Modifier.height(14.dp))
                    Text("Label colour", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Palette.Labels.forEachIndexed { i, c ->
                            Box(
                                Modifier.size(30.dp).clip(CircleShape).background(c)
                                    .border(if (i == color) 4.dp else 0.dp, Palette.Plastic, CircleShape)
                                    .semantics { contentDescription = "Colour ${i + 1}" + if (i == color) ", picked" else "" }
                                    .clickable { color = i },
                            )
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { vm.rename(t, name, color); editing = null }) { Text("Save", fontWeight = FontWeight.Bold, fontSize = 16.sp) } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel", fontSize = 16.sp) } },
        )
    }

    deleting?.let { t ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Throw away this tape? 🗑️") },
            text = { Text("“${t.name}” will be gone for good. It can't come back!", fontSize = 17.sp) },
            confirmButton = {
                TextButton(onClick = { vm.delete(t); deleting = null }) {
                    Text("Throw it away", color = Palette.Rec, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Keep it", fontSize = 16.sp, fontWeight = FontWeight.Bold) } },
        )
    }
}

@Composable
private fun TapeRow(t: Tape, inDeck: Boolean, onPick: () -> Unit, onEdit: () -> Unit, onShare: () -> Unit, onDelete: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    val color = Palette.label(t.color)
    Row(
        Modifier.fillMaxWidth().clip(shape)
            .background(if (inDeck) color.copy(alpha = 0.18f) else Palette.BodyLight)
            .border(if (inDeck) 3.dp else 0.dp, color, shape)
            .clickable(onClickLabel = "Put ${t.name} in the deck", onClick = onPick)
            .padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniCassette(color)
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.name, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Palette.Plastic, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val secs = t.samples / TapeStore.SAMPLE_RATE
            Text(
                (if (t.samples == 0) "empty" else "%d:%02d".format(secs / 60, secs % 60)) + if (inDeck) "  ·  in the deck" else "",
                fontSize = 14.sp, color = Palette.Plastic.copy(alpha = 0.7f),
            )
        }
        EmojiButton("✏️", "Rename ${t.name}", onEdit)
        if (t.samples > 0) EmojiButton("📤", "Share ${t.name}", onShare)
        EmojiButton("🗑️", "Throw away ${t.name}", onDelete)
    }
}

@Composable
private fun EmojiButton(emoji: String, description: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = description }) {
        Text(emoji, fontSize = 22.sp)
    }
}

@Composable
private fun MiniCassette(color: Color) {
    Canvas(Modifier.size(width = 52.dp, height = 34.dp)) {
        val w = size.width; val h = size.height
        drawRoundRect(Palette.Plastic, cornerRadius = CornerRadius(w * 0.08f))
        drawRoundRect(color, Offset(w * 0.08f, h * 0.1f), Size(w * 0.84f, h * 0.6f), CornerRadius(w * 0.05f))
        drawRoundRect(Color(0xFF15161F), Offset(w * 0.24f, h * 0.36f), Size(w * 0.52f, h * 0.26f), CornerRadius(h * 0.13f))
        drawCircle(Color.White, h * 0.09f, Offset(w * 0.36f, h * 0.49f))
        drawCircle(Color.White, h * 0.09f, Offset(w * 0.64f, h * 0.49f))
    }
}
