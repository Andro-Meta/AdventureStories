package com.androsmeta.adventurestories;

import android.os.Bundle;
import android.webkit.WebView;
import android.graphics.Color;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ forces edge-to-edge; do the same on 12-14 so every version
        // lays out alike (Capacitor's SystemBars pads for the bars either way).
        // After super: BridgeActivity swaps the splash theme there, and touching
        // the window first kept the splash theme's action bar. Dark = light icons.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
        // The Android back button used to close the app mid-game. Ask the game
        // first (window.__advBack in main.js): it goes back a screen or opens the
        // menu and returns true; only on the main menu does back leave the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) { leave(); return; }
                webView.evaluateJavascript("(function(){try{return !!(window.__advBack&&window.__advBack());}catch(e){return false;}})()",
                    value -> { if (!"true".equals(value)) leave(); });
            }

            private void leave() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
