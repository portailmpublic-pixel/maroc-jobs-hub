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
        final String mirror = call.getString("mirror");
        final String fileName = call.getString("fileName", "ASSOULI-AUTOX.apk");
        // forceDirect : téléchargement intégré (HttpURLConnection) sans passer
        // par le gestionnaire système ni par un navigateur.
        final boolean forceDirect = call.getBoolean("forceDirect", false);
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL manquante");
            return;
        }
        if (forceDirect) {
            downloadDirect(call, url, mirror, fileName);
            return;
        }

        final Context ctx = getContext();
        final DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            downloadDirect(call, url, mirror, fileName);
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
                    String failure = null;

                    while (true) {
                        DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
                        Cursor c = null;
                        try {
                            c = dm.query(q);
                            if (c == null || !c.moveToFirst()) {
                                failure = "Téléchargement introuvable";
                                break;
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
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            p.put("done", done);
                            p.put("total", total);
                            notifyListeners("progress", p, true);
                            lastPct = pct;

                            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                failure = null;
                                break;
                            }
                            if (status == DownloadManager.STATUS_FAILED) {
                                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                                failure = "Téléchargement échoué (code " + reason + ")";
                                break;
                            }
                        } finally {
                            if (c != null) c.close();
                        }

                        long now = System.currentTimeMillis();
                        if (lastBytes <= 0 && now - started > 15000) {
                            failure = "Réseau trop lent ou bloqué";
                            break;
                        }
                        if (now - lastChange > 45000) {
                            failure = "Téléchargement interrompu";
                            break;
                        }
                        if (now - started > 10 * 60 * 1000) {
                            failure = "Téléchargement trop lent";
                            break;
                        }
                        Thread.sleep(500);
                    }

                    try { dm.remove(id); } catch (Exception ignored) {}

                    if (failure != null) {
                        // Source principale bloquée/lente : on bascule
                        // automatiquement sur la source de secours.
                        if (mirror != null && !mirror.trim().isEmpty()) {
                            downloadDirect(call, mirror, null, fileName);
                        } else {
                            call.reject(failure);
                        }
                        return;
                    }

                    if (!apk.exists() || apk.length() < MIN_APK_SIZE) {
                        if (mirror != null && !mirror.trim().isEmpty()) {
                            downloadDirect(call, mirror, null, fileName);
                        } else {
                            call.reject("Fichier incomplet");
                        }
                        return;
                    }

                    JSObject ret = new JSObject();
                    ret.put("path", apk.getAbsolutePath());
                    ret.put("size", apk.length());
                    installApk(apk);
                    call.resolve(ret);
                } catch (Exception e) {
                    if (mirror != null && !mirror.trim().isEmpty()) {
                        downloadDirect(call, mirror, null, fileName);
                    } else {
                        call.reject(e.getMessage() == null ? "Téléchargement impossible" : e.getMessage());
                    }
                }
            }).start();
        } catch (Exception e) {
            if (mirror != null && !mirror.trim().isEmpty()) {
                downloadDirect(call, mirror, null, fileName);
            } else {
                call.reject(e.getMessage() == null ? "Téléchargement impossible" : e.getMessage());
            }
        }
    }

    /**
     * Téléchargement DIRECT dans l'application : aucune redirection vers un
     * navigateur, aucun lien GitHub demandé à l'utilisateur. Deux tentatives
     * par source, puis bascule silencieuse sur la source de secours.
     */
    private void downloadDirect(final PluginCall call, final String url, final String nextUrl, final String fileName) {
        new Thread(() -> {
            File dir = getContext().getExternalFilesDir(UPDATE_DIR);
            if (dir == null) dir = getContext().getCacheDir();
            if (!dir.exists()) dir.mkdirs();
            final File apk = new File(dir, fileName);
            String lastError = null;

            String[] sources = (nextUrl != null && !nextUrl.trim().isEmpty())
                ? new String[]{url, nextUrl}
                : new String[]{url};

            for (String src : sources) {
                for (int attempt = 1; attempt <= 2; attempt++) {
                    HttpURLConnection con = null;
                    InputStream in = null;
                    FileOutputStream out = null;
                    try {
                        if (apk.exists()) apk.delete();

                        con = (HttpURLConnection) new URL(src).openConnection();
                        con.setInstanceFollowRedirects(true);
                        con.setConnectTimeout(20000);
                        con.setReadTimeout(30000);
                        con.setUseCaches(false);
                        con.setRequestProperty("User-Agent", "ASSOULI-AUTOX-Updater");
                        con.setRequestProperty("Cache-Control", "no-cache");
                        con.setRequestProperty("Accept-Encoding", "identity");
                        int code = con.getResponseCode();
                        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);

                        long total = con.getContentLengthLong();
                        in = con.getInputStream();
                        out = new FileOutputStream(apk);
                        byte[] buf = new byte[65536];
                        long done = 0;
                        long started = System.currentTimeMillis();
                        long lastTick = 0;
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            long now = System.currentTimeMillis();
                            if (now - started > 10 * 60 * 1000) throw new Exception("Téléchargement trop lent");
                            // On émet au maximum toutes les 250 ms : le garde-fou
                            // JavaScript voit toujours un progrès réel.
                            if (now - lastTick > 250) {
                                lastTick = now;
                                int pct = total > 0
                                    ? (int) Math.min(100, done * 100 / total)
                                    : (int) Math.min(95, done * 100 / 16777216L);
                                JSObject p = new JSObject();
                                p.put("percent", pct);
                                p.put("done", done);
                                p.put("total", total > 0 ? total : 0);
                                notifyListeners("progress", p, true);
                            }
                        }
                        out.flush();
                        out.close();
                        out = null;
                        in.close();
                        in = null;

                        if (apk.length() < MIN_APK_SIZE) throw new Exception("Fichier incomplet");

                        JSObject ret = new JSObject();
                        ret.put("path", apk.getAbsolutePath());
                        ret.put("size", apk.length());
                        installApk(apk);
                        call.resolve(ret);
                        return;
                    } catch (Exception e) {
                        lastError = e.getMessage() == null ? "Téléchargement impossible" : e.getMessage();
                        try { if (out != null) out.close(); } catch (Exception ignored) {}
                        try { if (in != null) in.close(); } catch (Exception ignored) {}
                        if (con != null) con.disconnect();
                        try { Thread.sleep(1200); } catch (Exception ignored) {}
                    }
                }
            }

            if (apk.exists() && apk.length() < MIN_APK_SIZE) apk.delete();
            call.reject(lastError == null ? "Téléchargement impossible" : lastError);
        }).start();
    }

    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        try {
            final android.app.Activity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Indisponible");
        }
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
            // Fichier partiel d'une tentative précédente : on le supprime pour
            // forcer un nouveau téléchargement au lieu d'ouvrir un APK cassé.
            if (apkVersionCode(apk) <= 0) {
                try { apk.delete(); } catch (Exception ignored) {}
                call.reject("APK invalide");
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

    /**
     * Ouvre l'installateur pour l'APK le plus récent déjà présent dans le
     * dossier updates, à condition qu'il soit plus récent que la version
     * installée. Sert de secours quand le téléchargement a abouti mais que
     * l'écran de mise à jour n'a pas réussi à ouvrir l'installateur.
     */
    @PluginMethod
    public void installLatest(PluginCall call) {
        try {
            File dir = getContext().getExternalFilesDir(UPDATE_DIR);
            if (dir == null) dir = getContext().getCacheDir();
            int current = installedVersionCode();
            File best = null;
            int bestCode = current;
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f == null || !f.isFile() || f.length() < MIN_APK_SIZE) continue;
                    if (!f.getName().toLowerCase().endsWith(".apk")) continue;
                    int code = apkVersionCode(f);
                    if (code > bestCode) {
                        best = f;
                        bestCode = code;
                    }
                }
            }
            if (best == null) {
                call.reject("APK absent");
                return;
            }
            installApk(best);
            JSObject ret = new JSObject();
            ret.put("path", best.getAbsolutePath());
            ret.put("size", best.length());
            ret.put("versionCode", bestCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Installation impossible" : e.getMessage());
        }
    }

    private int installedVersionCode() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private int apkVersionCode(File apk) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            if (pi == null) return 0;
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
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
                    openUnknownSources();
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                // ACTION_INSTALL_PACKAGE est le chemin le plus direct vers
                // l'installateur ; certains appareils ne répondent pas à
                // ACTION_VIEW, d'où les deux tentatives.
                try {
                    Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                    intent.setData(uri);
                    intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                }
            } catch (Exception e) {
                openUnknownSources();
            }
        };
        if (activity != null) activity.runOnUiThread(task);
        else task.run();
    }

    private void openUnknownSources() {
        try {
            Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            settings.setData(Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
        } catch (Exception ignored) {}
    }
}
