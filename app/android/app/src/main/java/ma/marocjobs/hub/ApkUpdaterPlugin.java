package ma.marocjobs.hub;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
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

    private static final String UPDATE_DIR = "updates";
    private static final long MIN_APK_SIZE = 1000000L;

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", pi.versionName == null ? "1.0" : pi.versionName);
            ret.put("distribution", BuildConfig.DISTRIBUTION);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("version indisponible");
        }
    }

    /**
     * Téléchargement via le gestionnaire système Android : il gère seul les
     * redirections GitHub, les coupures réseau, la reprise et les certificats.
     * C'est beaucoup plus fiable qu'une HttpURLConnection maison qui pouvait
     * rester bloquée à 0 % sans jamais rendre la main.
     */
    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String fileName = call.getString("fileName", "ASSOULI-AUTOX.apk");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL manquante");
            return;
        }

        final Context ctx = getContext();
        final DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            downloadDirect(call, url, fileName);
            return;
        }

        final File apk;
        try {
            File dir = ctx.getExternalFilesDir(UPDATE_DIR);
            if (dir == null) dir = ctx.getCacheDir();
            if (!dir.exists()) dir.mkdirs();
            apk = new File(dir, fileName);
            if (apk.exists()) apk.delete();

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(fileName);
            req.setDescription("Mise à jour ASSOULI AUTOX");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            req.setDestinationInExternalFilesDir(ctx, UPDATE_DIR, fileName);
            req.addRequestHeader("User-Agent", "ASSOULI-AUTOX-Updater");
            req.addRequestHeader("Accept", "application/octet-stream");
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);

            final long id = dm.enqueue(req);

            new Thread(() -> {
                try {
                    int lastPct = -1;
                    long lastBytes = -1;
                    long lastChange = System.currentTimeMillis();
                    long started = System.currentTimeMillis();

                    while (true) {
                        DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
                        Cursor c = null;
                        try {
                            c = dm.query(q);
                            if (c == null || !c.moveToFirst()) {
                                call.reject("Téléchargement introuvable");
                                return;
                            }
                            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));

                            if (done != lastBytes) {
                                lastBytes = done;
                                lastChange = System.currentTimeMillis();
                            }
                            int pct = total > 0
                                ? (int) (done * 100 / total)
                                : Math.min(95, (int) (done / 200000));
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject p = new JSObject();
                                p.put("percent", pct);
                                notifyListeners("progress", p, true);
                            }

                            if (status == DownloadManager.STATUS_SUCCESSFUL) break;
                            if (status == DownloadManager.STATUS_FAILED) {
                                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                                call.reject("Téléchargement échoué (code " + reason + ")");
                                return;
                            }
                        } finally {
                            if (c != null) c.close();
                        }

                        long now = System.currentTimeMillis();
                        // Aucun octet reçu pendant 60 s : on abandonne proprement
                        // pour que l'écran propose le téléchargement manuel.
                        if (lastBytes <= 0 && now - started > 60000) {
                            try { dm.remove(id); } catch (Exception ignored) {}
                            call.reject("Réseau trop lent ou bloqué");
                            return;
                        }
                        if (now - lastChange > 180000) {
                            try { dm.remove(id); } catch (Exception ignored) {}
                            call.reject("Téléchargement interrompu");
                            return;
                        }
                        Thread.sleep(700);
                    }

                    if (!apk.exists() || apk.length() < MIN_APK_SIZE) {
                        call.reject("Fichier incomplet");
                        return;
                    }

                    JSObject ret = new JSObject();
                    ret.put("path", apk.getAbsolutePath());
                    ret.put("size", apk.length());
                    installApk(apk);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? "Téléchargement impossible" : e.getMessage());
                }
            }).start();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Téléchargement impossible" : e.getMessage());
        }
    }

    /** Secours si le gestionnaire de téléchargement système est indisponible. */
    private void downloadDirect(final PluginCall call, final String url, final String fileName) {
        new Thread(() -> {
            FileOutputStream out = null;
            HttpURLConnection con = null;
            try {
                File dir = getContext().getExternalFilesDir(UPDATE_DIR);
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

                if (apk.length() < MIN_APK_SIZE) throw new Exception("Fichier incomplet");

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

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        try {
            String fileName = call.getString("fileName", "ASSOULI-AUTOX.apk");
            File dir = getContext().getExternalFilesDir(UPDATE_DIR);
            if (dir == null) dir = getContext().getCacheDir();
            File apk = new File(dir, fileName);
            if (!apk.exists() || apk.length() < MIN_APK_SIZE) {
                call.reject("APK absent");
                return;
            }
            installApk(apk);
            JSObject ret = new JSObject();
            ret.put("path", apk.getAbsolutePath());
            ret.put("size", apk.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Installation impossible" : e.getMessage());
        }
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Réglages indisponibles");
        }
    }

    private void installApk(final File apk) {
        final android.app.Activity activity = getActivity();
        Runnable task = () -> {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                    Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                } catch (Exception ignored) {}
            }
        };
        if (activity != null) activity.runOnUiThread(task);
        else task.run();
    }
}
