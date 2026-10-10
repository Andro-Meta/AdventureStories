package com.androsmeta.adventurestories;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates (updates.js): download a new release APK in the background,
 * then hand it to Android's installer when the player taps Install. Only this
 * game's GitHub releases are accepted, and the file must match the size GitHub
 * reports. Android itself refuses an APK signed with a different key.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/Andro-Meta/AdventureStories/releases/download/";

    private File apkFile(String version) {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return new File(dir, "AdventureStories-" + version.replaceAll("[^0-9A-Za-z.]", "") + ".apk");
    }

    /** { version } -> { ready, path } when that version is already downloaded. */
    @PluginMethod
    public void status(PluginCall call) {
        File f = apkFile(call.getString("version", "x"));
        JSObject r = new JSObject();
        r.put("ready", f.exists() && f.length() > 0);
        r.put("path", f.getAbsolutePath());
        call.resolve(r);
    }

    /** { url, version, size } -> downloads, with "progress" events { pct }; resolves { path }. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        String version = call.getString("version", "");
        long size = call.getLong("size", 0L);
        if (!url.startsWith(ALLOWED) || version.isEmpty()) { call.reject("Only this game's GitHub releases can be downloaded."); return; }
        new Thread(() -> {
            File done = apkFile(version);
            File part = new File(done.getPath() + ".part");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true); // GitHub redirects to its file server (https -> https)
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                long total = size > 0 ? size : c.getContentLengthLong();
                long got = 0; int lastPct = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n); got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != lastPct) { lastPct = pct; JSObject p = new JSObject(); p.put("pct", pct); notifyListeners("progress", p); }
                    }
                }
                if (size > 0 && got != size) throw new Exception("incomplete download (" + got + " of " + size + " bytes)");
                if (done.exists()) done.delete();
                if (!part.renameTo(done)) throw new Exception("could not save the download");
                // Older downloads are no longer needed.
                File[] old = done.getParentFile().listFiles();
                if (old != null) for (File f : old) if (!f.equals(done)) f.delete();
                JSObject r = new JSObject();
                r.put("path", done.getAbsolutePath());
                call.resolve(r);
            } catch (Exception e) {
                part.delete();
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }

    /** { version } -> opens Android's installer; { needsPermission: true } if installs from this app aren't allowed yet. */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile(call.getString("version", "x"));
        if (!f.exists()) { call.reject("Not downloaded yet."); return; }
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // First time: Android's own switch "Allow from this source" for this app.
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        r.put("needsPermission", false);
        call.resolve(r);
    }
}
