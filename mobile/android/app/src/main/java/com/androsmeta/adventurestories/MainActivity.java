package com.androsmeta.adventurestories;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class); // in-app updates (updates.js)
        super.onCreate(savedInstanceState);
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
