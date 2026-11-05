package com.andrometa.talktape

import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.activity.ComponentActivity
import android.graphics.Canvas
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.andrometa.talktape.ui.DeckScreen
import com.andrometa.talktape.ui.Host
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Renders the main screen and saves PNGs to app/build/screenshots; also proves the screen composes. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h1900dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    private fun shot(name: String) {
        val dir = File("build/screenshots").apply { mkdirs() }
        rule.mainClock.advanceTimeBy(500)
        val view = rule.activity.window.decorView
        val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bmp))
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun mainScreen() {
        val vm = DeckViewModel(ApplicationProvider.getApplicationContext())
        rule.setContent { MaterialTheme { DeckScreen(vm, Host({ it() }, { true })) } }
        rule.mainClock.autoAdvance = false // the blinking LCD never goes idle
        rule.mainClock.advanceTimeBy(1000)
        shot("main")
        rule.onNodeWithText("Monster").performClick()
        rule.onNodeWithText("Backwards").performClick()
        shot("monster_backwards")
    }
}
