package ma.marocjobs.hub;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

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
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";
    private static final long MIN_APK_SIZE = 1000000L;
    private static final String TAG = "ApkUpdater";
    private static final String EXPECTED_PKG = "ma.marocjobs.hub";

    // Single-flight : un seul telechargement a la fois.
    private static final Object LOCK = new Object();
    private static Thread downloadThread = null;
    private static PluginCall activeCall = null;
    private static String activeFileName = null;
    private static final AtomicBoolean running = new AtomicBoolean(false);
    private static final AtomicBoolean cancelled = new AtomicBoolean(false);

    private static volatile String statePhase = "idle";
    private static volatile String stateMirror = "";
    private static volatile int stateMirrorIndex = 0;
    private static volatile int stateAttempt = 0;
    private static volatile int stateHttpCode = 0;
    private static volatile String stateErrorCode = "";
    private static volatile String stateMessage = "";
    private static final AtomicLong stateDone = new AtomicLong(0);
    private static final AtomicLong stateTotal = new AtomicLong(0);
    private static volatile long stateLastByteAt = 0;

    private static final Object emitLock = new Object();
    private static long lastProgressEmitMs = 0;

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

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        try {
            cancelled.set(true);
            Log.i(TAG, "cancelDownload requested");
            UpdaterLog.add("cancel requested");
            if (downloadThread != null) {
                try { downloadThread.interrupt(); } catch (Exception ignored) {}
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("cancel impossible");
        }
    }

    @PluginMethod
    public void getDownloadState(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("running", running.get());
            ret.put("phase", statePhase);
            ret.put("mirror", stateMirror);
            ret.put("mirrorIndex", stateMirrorIndex);
            ret.put("attempt", stateAttempt);
            ret.put("httpCode", stateHttpCode);
            ret.put("errorCode", stateErrorCode);
            ret.put("message", stateMessage);
            ret.put("done", stateDone.get());
            ret.put("total", stateTotal.get());
            ret.put("lastByteAt", stateLastByteAt);
            ret.put("fileName", activeFileName == null ? "" : activeFileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("state indisponible");
        }
    }

    @PluginMethod
    public void getLogs(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("logs", UpdaterLog.toJson());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("logs indisponibles");
        }
    }

    /**
     * Telechargement NATIF prioritaire (single-flight, reprise Range, miroirs).
     * Signature compatible avec les anciens clients JS (url/mirror/fileName/forceDirect)
     * et les nouveaux (mirrors/size/sha256).
     */
    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String mirror = call.getString("mirror");
        final String fileName = call.getString("fileName", "ASSOULI-AUTOX.apk");
        final Long expectedSize = call.getLong("size");
        final String expectedSha = call.getString("sha256");
        // forceDirect ignore : on utilise toujours le moteur natif avec reprise.
        final List<String> mirrors = new ArrayList<>();
        try {
            com.getcapacitor.JSArray arr = call.getArray("mirrors");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    try {
                        String m = arr.getString(i);
                        if (m != null && !m.trim().isEmpty() && !mirrors.contains(m)) mirrors.add(m);
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception ignored) {}
        if (mirror != null && !mirror.trim().isEmpty() && !mirrors.contains(mirror)) mirrors.add(mirror);
        if (url != null && !url.trim().isEmpty() && !mirrors.contains(url)) mirrors.add(url);
        if (mirrors.isEmpty()) {
            call.reject("URL manquante");
            return;
        }
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("fileName manquant");
            return;
        }

        synchronized (LOCK) {
            if (running.get()) {
                Log.i(TAG, "downloadAndInstall join existing run file=" + fileName);
                UpdaterLog.add("join existing " + fileName);
                JSObject ret = new JSObject();
                ret.put("busy", true);
                ret.put("phase", statePhase);
                ret.put("fileName", activeFileName);
                call.resolve(ret);
                return;
            }
            running.set(true);
            cancelled.set(false);
            activeCall = call;
            activeFileName = fileName;
            statePhase = "connecting";
            stateDone.set(0);
            stateTotal.set(expectedSize != null ? expectedSize : 0);
        }
        emitState("connecting", mirrors.isEmpty() ? "" : mirrors.get(0), 0, 1, 0, "", "start");
        Log.i(TAG, "download start file=" + fileName + " mirrors=" + mirrors.size());
        UpdaterLog.add("start " + fileName + " mirrors=" + mirrors.size());

        downloadThread = new Thread(() -> {
            try {
                downloadWithResume(call, mirrors, fileName, expectedSize, expectedSha);
            } catch (Exception e) {
                String msg = e.getMessage() == null ? "Telechargement impossible" : e.getMessage();
                Log.e(TAG, "download failed " + msg, e);
                UpdaterLog.add("FAILED " + msg);
                try { call.reject(msg); } catch (Exception ignored) {}
            } finally {
                running.set(false);
                downloadThread = null;
                if (activeCall == call) activeCall = null;
            }
        });
        downloadThread.setName("ApkUpdater-download");
        downloadThread.start();
    }

    private void downloadWithResume(final PluginCall call, final List<String> mirrors, final String fileName, final Long expectedSize, final String expectedSha) throws Exception {
        File dir = getContext().getExternalFilesDir(UPDATE_DIR);
        if (dir == null) dir = getContext().getCacheDir();
        if (!dir.exists()) dir.mkdirs();
        final File apk = new File(dir, fileName);
        final File part = new File(dir, fileName + ".part");

        String lastError = "Telechargement impossible";
        String lastCode = "IO";

        for (int mi = 0; mi < mirrors.size(); mi++) {
            String src = mirrors.get(mi);
            stateMirror = src;
            stateMirrorIndex = mi + 1;
            for (int attempt = 1; attempt <= 3; attempt++) {
                if (cancelled.get() || Thread.currentThread().isInterrupted()) {
                    Log.i(TAG, "cancelled");
                    throw new Exception("Telechargement annule");
                }
                stateAttempt = attempt;
                statePhase = "connecting";
                emitState("connecting", src, mi + 1, attempt, 0, "", "mirror " + (mi + 1) + "/" + mirrors.size() + " attempt " + attempt);
                Log.i(TAG, "mirror " + (mi + 1) + "/" + mirrors.size() + " attempt " + attempt + " url=" + src + " partLen=" + (part.exists() ? part.length() : 0));
                UpdaterLog.add("mirror " + (mi + 1) + " try " + attempt + " part=" + (part.exists() ? part.length() : 0));

                HttpURLConnection con = null;
                InputStream in = null;
                FileOutputStream out = null;
                try {
                    long existing = part.exists() ? part.length() : 0;
                    // Si un .apk valide existe deja, on passe directement a l install.
                    if (apk.exists() && apk.length() >= MIN_APK_SIZE && apkVersionCode(apk) > installedVersionCode()) {
                        // Verifier rapidement : si c est le bon fichier, on l utilise.
                        // On laisse la validation complete apres telechargement suivre.
                    }
                    con = (HttpURLConnection) new URL(src).openConnection();
                    con.setInstanceFollowRedirects(true);
                    con.setConnectTimeout(15000);
                    con.setReadTimeout(20000);
                    con.setUseCaches(false);
                    con.setRequestProperty("User-Agent", "ASSOULI-AUTOX-Updater");
                    con.setRequestProperty("Cache-Control", "no-cache");
                    con.setRequestProperty("Accept-Encoding", "identity");
                    if (existing > 0) {
                        con.setRequestProperty("Range", "bytes=" + existing + "-");
                    }
                    int code = con.getResponseCode();
                    stateHttpCode = code;
                    Log.i(TAG, "HTTP " + code + " existing=" + existing);
                    UpdaterLog.add("HTTP " + code);

                    if (code == 416) {
                        // .part deja complet : on valide et renomme.
                        Log.i(TAG, "416 complete, validating part");
                        if (validatePartFile(part, expectedSize, expectedSha)) {
                            renameAndInstall(call, part, apk, src);
                            return;
                        } else {
                            // .part invalide : on recommence ce miroir a 0 (tronque, pas supprime en boucle).
                            try { new FileOutputStream(part, false).close(); } catch (Exception ignored) {}
                            throw new Exception("Fichier incomplet (416 invalide)");
                        }
                    }
                    if (code == 206) {
                        // Reprise : server renvoie le reste a partir de existing.
                    } else if (code == 200) {
                        // Server ignore Range : on repart a 0 sur ce fichier (tronque).
                        existing = 0;
                        try { if (part.exists()) part.delete(); } catch (Exception ignored) {}
                    } else if (code >= 400) {
                        lastError = "HTTP " + code;
                        lastCode = "HTTP_" + code;
                        Log.w(TAG, "HTTP error " + code);
                        UpdaterLog.add("HTTP " + code);
                        throw new Exception("HTTP " + code);
                    }

                    long total = expectedSize != null && expectedSize > 0 ? expectedSize : con.getContentLengthLong();
                    if (total > 0) stateTotal.set(total);
                    long done = existing;
                    stateDone.set(done);
                    stateLastByteAt = System.currentTimeMillis();
                    statePhase = "downloading";
                    emitState("downloading", src, mi + 1, attempt, code, "", done + "/" + (total > 0 ? total : "?"));

                    boolean append = existing > 0 && code == 206;
                    in = con.getInputStream();
                    out = new FileOutputStream(part, append);
                    byte[] buf = new byte[65536];
                    long lastTick = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        if (cancelled.get()) throw new Exception("Telechargement annule");
                        out.write(buf, 0, n);
                        done += n;
                        stateDone.set(done);
                        stateLastByteAt = System.currentTimeMillis();
                        long now = System.currentTimeMillis();
                        if (now - lastTick > 200) {
                            lastTick = now;
                            int pct = total > 0 ? (int) Math.min(100, done * 100 / total) : (int) Math.min(95, done * 100 / 16777216L);
                            emitProgress(pct, done, total);
                        }
                    }
                    out.flush();
                    out.close(); out = null;
                    try { in.close(); } catch (Exception ignored) {} in = null;

                    if (!validatePartFile(part, expectedSize, expectedSha)) {
                        String msg = "Validation echouee (taille/signature)";
                        lastError = msg;
                        lastCode = "VALIDATION";
                        Log.e(TAG, msg);
                        UpdaterLog.add("VALIDATION FAILED");
                        // Fichier corrompu : on supprime pour repartir proprement sur le miroir suivant.
                        try { if (part.exists()) part.delete(); } catch (Exception ignored) {}
                        try { if (apk.exists() && apk.length() < MIN_APK_SIZE) apk.delete(); } catch (Exception ignored) {}
                        throw new Exception(msg);
                    }
                    renameAndInstall(call, part, apk, src);
                    return;
                } catch (Exception e) {
                    lastError = e.getMessage() == null ? "Telechargement impossible" : e.getMessage();
                    if (lastError.startsWith("HTTP ") || lastError.startsWith("Fichier") || lastError.startsWith("Validation")) {
                        // conserve lastCode deja renseigne
                    } else if (lastError.contains("timeout") || lastError.contains("Timeout") || lastError.contains("Read timed")) {
                        lastCode = "TIMEOUT";
                    }
                    Log.w(TAG, "attempt failed " + lastError, e);
                    UpdaterLog.add("ERR " + lastError);
                    emitState("failed", src, mi + 1, attempt, stateHttpCode, lastCode, lastError);
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    if (con != null) con.disconnect();
                    // Backoff exponentiel + jitter avant le prochain essai (sans supprimer .part).
                    if (attempt < 3) {
                        long backoff = Math.min(8000, (long) (1000 * Math.pow(2, attempt - 1))) + (long) (Math.random() * 500);
                        Log.i(TAG, "backoff " + backoff + "ms");
                        UpdaterLog.add("backoff " + backoff);
                        try { Thread.sleep(backoff); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                    }
                }
            }
            // Failover au miroir suivant SANS effacer .part (reprise possible).
        }
        throw new Exception(lastError);
    }

    private boolean validatePartFile(File part, Long expectedSize, String expectedSha) {
        try {
            if (part == null || !part.exists()) return false;
            long len = part.length();
            if (len < MIN_APK_SIZE) { Log.e(TAG, "validate size < MIN " + len); return false; }
            if (expectedSize != null && expectedSize > 0 && len != expectedSize) {
                Log.e(TAG, "validate size mismatch " + len + " vs " + expectedSize);
                return false;
            }
            if (expectedSha != null && !expectedSha.trim().isEmpty()) {
                String got = sha256Hex(part);
                String want = expectedSha.trim().toLowerCase();
                if (!want.equals(got)) { Log.e(TAG, "validate sha256 mismatch"); return false; }
            }
            PackageInfo pi = getContext().getPackageManager().getPackageArchiveInfo(part.getAbsolutePath(), signatureFlags());
            if (pi == null) { Log.e(TAG, "validate package null"); return false; }
            if (!EXPECTED_PKG.equals(pi.packageName)) { Log.e(TAG, "validate package " + pi.packageName); return false; }
            long vc = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            if (vc <= installedVersionCode()) { Log.e(TAG, "validate versionCode " + vc); return false; }
            if (!signatureMatchesInstalled(part)) { Log.e(TAG, "validate signature mismatch"); return false; }
            Log.i(TAG, "validate OK vc=" + vc + " len=" + len);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "validate exception", e);
            return false;
        }
    }

    private void renameAndInstall(PluginCall call, File part, File apk, String src) throws Exception {
        try { if (apk.exists()) apk.delete(); } catch (Exception ignored) {}
        boolean ok = part.renameTo(apk);
        if (!ok) {
            // Fallback : copier si rename echoue (stockage different).
            try (InputStream in = new java.io.FileInputStream(part); FileOutputStream out = new FileOutputStream(apk)) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            try { if (part.exists() && part.length() == apk.length()) part.delete(); } catch (Exception ignored) {}
        }
        Log.i(TAG, "rename ok apkLen=" + apk.length() + " src=" + src);
        UpdaterLog.add("validated, install " + apk.length());
        statePhase = "installing";
        emitState("installing", src, 0, 0, 0, "", "Ouverture de l installateur");
        JSObject ret = new JSObject();
        ret.put("path", apk.getAbsolutePath());
        ret.put("size", apk.length());
        installApk(apk);
        try { call.resolve(ret); } catch (Exception ignored) {}
    }

    private int signatureFlags() {
        // GET_SIGNING_CERTIFICATES = 0x8000000 sur API 28+. Fallback 0 sur anciennes versions.
        return Build.VERSION.SDK_INT >= 28 ? 0x8000000 : 0;
    }

    private boolean signatureMatchesInstalled(File f) {
        try {
            PackageInfo inst = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signatureFlags());
            PackageInfo cand = getContext().getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), signatureFlags());
            if (inst == null || cand == null) return false;
            String a = null, b = null;
            try {
                if (Build.VERSION.SDK_INT >= 28 && inst.signingInfo != null && cand.signingInfo != null) {
                    a = android.util.Base64.encodeToString(inst.signingInfo.getApkContentsSigners()[0].toCharsString().getBytes(), 0);
                    b = android.util.Base64.encodeToString(cand.signingInfo.getApkContentsSigners()[0].toCharsString().getBytes(), 0);
                    // Comparaison simple via charsString.
                    String ai = inst.signingInfo.hasMultipleSigners() ? "" : inst.signingInfo.getApkContentsSigners()[0].toCharsString();
                    String bi = cand.signingInfo.hasMultipleSigners() ? "" : cand.signingInfo.getApkContentsSigners()[0].toCharsString();
                    return ai.equals(bi);
                }
            } catch (Exception ignored) {}
            if (inst.signatures != null && inst.signatures.length > 0) a = inst.signatures[0].toCharsString();
            if (cand.signatures != null && cand.signatures.length > 0) b = cand.signatures[0].toCharsString();
            return a != null && a.equals(b);
        } catch (Exception e) {
            return false;
        }
    }

    private String sha256Hex(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte v : md.digest()) sb.append(String.format("%02x", v));
        return sb.toString();
    }

    private void emitProgress(int pct, long done, long total) {
        synchronized (emitLock) {
            long now = System.currentTimeMillis();
            if (now - lastProgressEmitMs < 200) return;
            lastProgressEmitMs = now;
        }
        try {
            JSObject p = new JSObject();
            p.put("percent", pct);
            p.put("done", done);
            p.put("total", total);
            notifyListeners("progress", p, true);
        } catch (Exception ignored) {}
    }

    private void emitState(String phase, String mirror, int mirrorIndex, int attempt, int httpCode, String errorCode, String message) {
        statePhase = phase == null ? "" : phase;
        stateMirror = mirror == null ? "" : mirror;
        stateMirrorIndex = mirrorIndex;
        stateAttempt = attempt;
        stateHttpCode = httpCode;
        stateErrorCode = errorCode == null ? "" : errorCode;
        stateMessage = message == null ? "" : message;
        try {
            JSObject s = new JSObject();
            s.put("phase", statePhase);
            s.put("mirror", stateMirror);
            s.put("mirrorIndex", mirrorIndex);
            s.put("attempt", attempt);
            s.put("httpCode", httpCode);
            s.put("errorCode", stateErrorCode);
            s.put("message", stateMessage);
            s.put("done", stateDone.get());
            s.put("total", stateTotal.get());
            notifyListeners("state", s, true);
        } catch (Exception ignored) {}
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
            File apk = findApkFile(fileName);
            if (apk == null || !apk.exists() || apk.length() < MIN_APK_SIZE) {
                call.reject("APK absent");
                return;
            }
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

    @PluginMethod
    public void installLatest(PluginCall call) {
        try {
            int current = installedVersionCode();
            File best = null;
            int bestCode = current;
            for (File dir : updateDirs()) {
                File[] files = dir.listFiles();
                if (files == null) continue;
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

    private java.util.List<File> updateDirs() {
        java.util.List<File> dirs = new java.util.ArrayList<>();
        try {
            File d = getContext().getExternalFilesDir(UPDATE_DIR);
            if (d != null) dirs.add(d);
        } catch (Exception ignored) {}
        try {
            File ext = new File(Environment.getExternalStorageDirectory(), UPDATE_DIR);
            if (!dirs.contains(ext)) dirs.add(ext);
        } catch (Exception ignored) {}
        return dirs;
    }

    private File findApkFile(String fileName) {
        for (File dir : updateDirs()) {
            File f = new File(dir, fileName);
            if (f.exists() && f.length() >= MIN_APK_SIZE) return f;
        }
        File d = getContext().getExternalFilesDir(UPDATE_DIR);
        if (d == null) d = getContext().getCacheDir();
        return new File(d, fileName);
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
            call.reject("Reglages indisponibles");
        }
    }

    private void installApk(final File apk) {
        final android.app.Activity activity = getActivity();
        Runnable task = () -> {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                    Log.i(TAG, "unknown sources not allowed, opening settings");
                    UpdaterLog.add("unknown sources -> settings");
                    openUnknownSources();
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                try {
                    Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                    intent.setData(uri);
                    intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    Log.i(TAG, "install intent ACTION_INSTALL_PACKAGE");
                    UpdaterLog.add("install intent sent");
                } catch (Exception e) {
                    Log.w(TAG, "ACTION_INSTALL_PACKAGE failed, fallback ACTION_VIEW", e);
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    UpdaterLog.add("install fallback ACTION_VIEW");
                }
            } catch (Exception e) {
                Log.e(TAG, "install failed", e);
                UpdaterLog.add("install FAILED " + e.getMessage());
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
