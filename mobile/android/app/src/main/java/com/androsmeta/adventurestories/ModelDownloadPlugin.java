package com.androsmeta.adventurestories;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ModelDownload")
public class ModelDownloadPlugin extends Plugin {
    private static final String TAG = "ModelDownload";
    private static final String MODELS_DIR = "models";

    private File modelFile(String modelName) {
        return new File(new File(getContext().getFilesDir(), MODELS_DIR), modelName);
    }

    @PluginMethod
    public void checkModel(PluginCall call) {
        String modelName = call.getString("modelName");
        if (modelName == null) { call.reject("modelName required"); return; }
        File f = modelFile(modelName);
        JSObject ret = new JSObject();
        ret.put("exists", f.exists() && f.length() > 0);
        ret.put("path", f.getAbsolutePath());
        ret.put("sizeBytes", f.exists() ? f.length() : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String modelName = call.getString("modelName");
        String downloadUrl = call.getString("url");
        String hfToken = call.getString("hfToken", "");

        if (modelName == null || downloadUrl == null) {
            call.reject("modelName and url required");
            return;
        }

        File modelsDir = new File(getContext().getFilesDir(), MODELS_DIR);
        modelsDir.mkdirs();
        File dest = modelFile(modelName);
        File tmp = new File(modelsDir, modelName + ".tmp");

        if (dest.exists() && dest.length() > 100_000_000L) {
            JSObject ret = new JSObject();
            ret.put("done", true);
            ret.put("path", dest.getAbsolutePath());
            call.resolve(ret);
            return;
        }

        new Thread(() -> {
            try {
                long resumeFrom = tmp.exists() ? tmp.length() : 0;
                HttpURLConnection conn = openConn(downloadUrl, hfToken, resumeFrom);

                int code = conn.getResponseCode();
                // Follow one redirect manually (HuggingFace CDN redirect)
                if (code == 301 || code == 302 || code == 307 || code == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = openConn(location, hfToken, resumeFrom);
                    code = conn.getResponseCode();
                }

                if (code == 401 || code == 403) {
                    call.reject("AUTH_REQUIRED: Accept the Gemma license on huggingface.co and set LITERT_CONFIG.MODEL_HF_TOKEN in config.js");
                    return;
                }
                if (code != 200 && code != 206) {
                    call.reject("HTTP_ERROR:" + code);
                    return;
                }

                long totalBytes = conn.getContentLengthLong();
                if (code == 206) totalBytes += resumeFrom; // partial response

                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(tmp, resumeFrom > 0);
                byte[] buf = new byte[65536];
                long downloaded = resumeFrom;
                int n;
                long lastNotify = 0;

                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                    downloaded += n;
                    long now = System.currentTimeMillis();
                    if (now - lastNotify > 400) {
                        lastNotify = now;
                        JSObject progress = new JSObject();
                        progress.put("bytesDownloaded", downloaded);
                        progress.put("totalBytes", totalBytes);
                        progress.put("percent", totalBytes > 0 ? (int)(downloaded * 100L / totalBytes) : 0);
                        notifyListeners("modelDownloadProgress", progress);
                    }
                }

                out.flush();
                out.close();
                in.close();
                conn.disconnect();

                if (!tmp.renameTo(dest)) {
                    // renameTo can fail across filesystems; copy then delete
                    java.nio.file.Files.copy(tmp.toPath(), dest.toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    tmp.delete();
                }

                Log.i(TAG, "Model ready at " + dest.getAbsolutePath() + " (" + dest.length() + " bytes)");

                JSObject ret = new JSObject();
                ret.put("done", true);
                ret.put("path", dest.getAbsolutePath());
                call.resolve(ret);

            } catch (IOException e) {
                Log.e(TAG, "Download failed", e);
                call.reject("DOWNLOAD_FAILED: " + e.getMessage());
            }
        }).start();
    }

    private HttpURLConnection openConn(String urlStr, String hfToken, long resumeFrom) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(120_000);
        conn.setInstanceFollowRedirects(false); // handle manually
        if (hfToken != null && !hfToken.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + hfToken);
        }
        if (resumeFrom > 0) {
            conn.setRequestProperty("Range", "bytes=" + resumeFrom + "-");
        }
        return conn;
    }
}
