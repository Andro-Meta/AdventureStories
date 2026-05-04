package com.androsmeta.adventurestories;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the local custom plugin BEFORE super.onCreate so the
        // Capacitor bridge picks it up. Local plugins (defined in this app's
        // own Java sources, not installed via npm) are NOT auto-registered;
        // only npm-installed plugins are. See:
        // https://capacitorjs.com/docs/android/custom-code
        registerPlugin(ModelDownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
