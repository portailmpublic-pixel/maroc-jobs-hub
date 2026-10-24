package ma.marocjobs.hub;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

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

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", pi.versionName == null ? "1.0" : pi.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("version indisponible");
        }
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String fileName = call.getString("fileName", "ASSOULI-AUTOX.apk");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL manquante");
            return;
        }
        new Thread(() -> {
            FileOutputStream out = null;
            HttpURLConnection con = null;
            try {
                File dir = getContext().getExternalFilesDir("updates");
                if (dir == null) dir = getContext().getCacheDir();
                if (!dir.exists()) dir.mkdirs();
                File apk = new File(dir, fileName);
                if (apk.exists()) apk.delete();

                con = (HttpURLConnection) new URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(20000);
                con.setReadTimeout(30000);
                con.setRequestProperty("User-Agent", "ASSOULI-AUTOX-Updater");
                con.setRequestProperty("Accept", "application/octet-stream");
                int code = con.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("HTTP " + code);

                long total = con.getContentLengthLong();
                InputStream in = con.getInputStream();
                out = new FileOutputStream(apk);
                byte[] buf = new byte[65536];
                long done = 0;
                int lastPct = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) (done * 100 / total) : Math.min(95, (int) (done / 200000));
                    if (pct != lastPct) {
                        lastPct = pct;
                        JSObject p = new JSObject();
                        p.put("percent", pct);
                        notifyListeners("progress", p, true);
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();

                if (apk.length() < 1000000) throw new Exception("Fichier incomplet");

                JSObject ret = new JSObject();
                ret.put("path", apk.getAbsolutePath());
                ret.put("size", apk.length());
                installApk(apk);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Téléchargement impossible" : e.getMessage());
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                if (con != null) con.disconnect();
            }
        }).start();
    }

    private void installApk(File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            // L'utilisateur doit autoriser les sources inconnues puis relancer
            try {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
            } catch (Exception ignored) {}
        }
    }
}
