package com.andrometa.talktape

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.andrometa.talktape.ui.DeckScreen
import com.andrometa.talktape.ui.Host
import com.andrometa.talktape.ui.Palette

class MainActivity : ComponentActivity() {
    private val vm: DeckViewModel by viewModels()
    private var afterMic: (() -> Unit)? = null
    /** null = no dialog, true = can ask again, false = must go to Settings. */
    private val micDenied = mutableStateOf<Boolean?>(null)

    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) afterMic?.invoke()
        else micDenied.value = shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
        if (granted) afterMic = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        volumeControlStream = AudioManager.STREAM_MUSIC
        val host = Host(::withMic, ::hasHeadphones)
        if (savedInstanceState == null) openShared(intent)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Palette.BgTop, secondary = Palette.BgBottom)) {
                DeckScreen(vm, host)
                micDenied.value?.let { canAsk ->
                    AlertDialog(
                        onDismissRequest = { micDenied.value = null },
                        title = { Text("TalkTape needs the microphone 🎙️") },
                        text = {
                            Text(
                                if (canAsk) "To record your voice, TalkTape has to use the microphone. Tap \"Try again\" and choose Allow."
                                else "The microphone is switched off for TalkTape. Ask a grown-up to open Settings, tap Permissions, and turn on Microphone.",
                                fontSize = 17.sp,
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                micDenied.value = null
                                if (canAsk) askMic.launch(Manifest.permission.RECORD_AUDIO)
                                else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
                            }) { Text(if (canAsk) "Try again" else "Open Settings", fontWeight = FontWeight.Bold, fontSize = 16.sp) }
                        },
                        dismissButton = { TextButton(onClick = { micDenied.value = null; afterMic = null }) { Text("Not now", fontSize = 16.sp) } },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openShared(intent)
    }

    /** A sound shared to TalkTape (or opened with it) becomes a tape, shown in the editor. */
    private fun openShared(intent: Intent?) {
        val uri = when (intent?.action) {
            Intent.ACTION_SEND -> if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
            Intent.ACTION_VIEW -> intent.data
            else -> null
        } ?: return
        vm.setEditMode(true)
        vm.import(uri)
    }

    private fun withMic(then: () -> Unit) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) then()
        else { afterMic = then; askMic.launch(Manifest.permission.RECORD_AUDIO) }
    }

    private fun hasHeadphones(): Boolean {
        val am = getSystemService(AudioManager::class.java)
        val heads = setOf(
            AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_USB_HEADSET,
        )
        return am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in heads }
    }

    override fun onStop() {
        super.onStop()
        // Leaving the app stops the tape (and saves any recording); rotating the screen doesn't.
        if (!isChangingConfigurations) vm.deck.stop()
    }
}
