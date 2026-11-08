package ma.marocjobs.hub;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Vérifie les alertes dans le cloud même quand l'app est fermée (toutes les ~15 min)
 * et affiche une notification Android dès qu'une nouveauté est publiée.
 *
 * Deux canaux distincts :
 *  - "updates" : nouveautés générales (icône verte historique) ;
 *  - "smart"   : alertes intelligentes filtrées (icône violette différente).
 */
public class UpdateWorker extends Worker {

    static final String ALERTS_URL = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/alerts.json";
    static final String MARCHES_META_URL = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/marches-meta.json";
    static final String JOBS_URL = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/jobs-smart.json";
    static final String CHANNEL_ID = "updates";
    static final String SMART_CHANNEL_ID = "smart";
    static final String WORK_NAME = "mjh-updates";
    static final String SMART_PREFS = "mjh_smart";

    public UpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        boolean ok = false;
        String alertsUpdatedAt = "";

        try {
            JSONObject root = new JSONObject(http(ALERTS_URL));
            String updatedAt = root.optString("updatedAt", "");
            alertsUpdatedAt = updatedAt;
            int total = root.optInt("total", 0);
            JSONArray alerts = root.optJSONArray("alerts");

            int newCount = 0;
            String title = "Nouveautés ASSOULI AUTOX";
            String text = "";

            if (alerts != null && alerts.length() > 0) {
                JSONObject a = alerts.optJSONObject(0);
                if (a != null) {
                    JSONObject counts = a.optJSONObject("counts");
                    newCount = counts != null ? counts.optInt("new", 0) : 0;
                    text = a.optString("body", "");
                    String t = a.optString("title", "");
                    if (t.length() > 0) title = t;
                }
            }

            SharedPreferences sp = ctx.getSharedPreferences("mjh_notify", Context.MODE_PRIVATE);
            String last = sp.getString("updatedAt", "");

            if (!updatedAt.isEmpty() && !updatedAt.equals(last)) {
                sp.edit().putString("updatedAt", updatedAt).apply();
                if (!last.isEmpty() && newCount > 0) {
                    String body = text.replaceAll("\\s+", " ").trim();
                    if (body.length() > 220) body = body.substring(0, 217) + "…";
                    if (body.isEmpty()) body = newCount + " nouvelle(s) offre(s) — " + total + " suivies";
                    notifyNow(ctx, newCount + " nouvelle(s) offre(s) • " + total + " suivies", body);
                }
            }
            ok = true;
        } catch (Exception ignored) {}

        // Marchés publics : petit fichier meta (pas les 2 Mo du catalogue).
        // « newestAt » ne change que lorsqu'une consultation inédite arrive.
        try {
            JSONObject meta = new JSONObject(http(MARCHES_META_URL));
            String newestAt = meta.optString("newestAt", "");
            int new24 = meta.optInt("new24h", 0);
            int open = meta.optInt("open", 0);
            SharedPreferences sp = ctx.getSharedPreferences("mjh_notify", Context.MODE_PRIVATE);
            String lastMarch = sp.getString("marchesNewestAt", "");
            if (!newestAt.isEmpty() && !newestAt.equals(lastMarch)) {
                sp.edit().putString("marchesNewestAt", newestAt).apply();
                if (!lastMarch.isEmpty() && new24 > 0) {
                    notifyNow(ctx,
                        "Marchés publics • " + new24 + " nouveau(x)",
                        new24 + " nouvelle(s) consultation(s) — " + open + " marchés ouverts à consulter.");
                }
            }
            ok = true;
        } catch (Exception ignored) {}

        // Alertes intelligentes : uniquement si l'utilisateur les a activées.
        try {
            if (checkSmart(ctx, alertsUpdatedAt)) ok = true;
        } catch (Exception ignored) {}

        return ok ? Result.success() : Result.retry();
    }

    static void schedule(Context ctx) {
        try {
            ensureChannel(ctx);
            ensureSmartChannel(ctx);
            Constraints c = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(c)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build();
            // UPDATE remplace l'ancien travail (icône / réglages corrigés).
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, req);

            // Une vérification rapide à chaque ouverture de l'app.
            OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(UpdateWorker.class)
                .setConstraints(c)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build();
            WorkManager.getInstance(ctx).enqueueUniqueWork(
                WORK_NAME + "-now", ExistingWorkPolicy.REPLACE, once);
        } catch (Exception ignored) {}
    }

    static void ensureChannel(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Nouveautés ASSOULI AUTOX", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Nouvelles offres, marchés publics, concours et examens");
            ch.enableVibration(true);
            ch.enableLights(true);
            ch.setLightColor(0xFF14E0B4);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {}
        ensureSmartChannel(ctx);
    }

    static void ensureSmartChannel(Context ctx) {
        try {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                SMART_CHANNEL_ID, "Alertes intelligentes", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Offres filtrées selon vos villes, types de travail et contrats");
            ch.enableVibration(true);
            ch.enableLights(true);
            ch.setLightColor(0xFF7C5CFF);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {}
    }

    /**
     * Compare jobs.json avec les identifiants déjà vus et notifie uniquement
     * les nouvelles offres qui correspondent aux filtres enregistrés.
     * Le premier passage amorce l'historique sans notifier.
     */
    private static boolean checkSmart(Context ctx, String alertsUpdatedAt) {
        SharedPreferences sp = ctx.getSharedPreferences(SMART_PREFS, Context.MODE_PRIVATE);
        String raw = sp.getString("prefs", "");
        if (raw == null || raw.isEmpty()) return true;
        JSONObject p;
        try { p = new JSONObject(raw); } catch (Exception e) { return true; }
        if (!p.optBoolean("enabled", false)) return true;

        // Le petit alerts.json sert de signal : s'il n'a pas changé depuis la
        // dernière vérification, inutile de retélécharger jobs-smart.json.
        String lastSmartAt = sp.getString("smartAlertsAt", "");
        if (alertsUpdatedAt != null && !alertsUpdatedAt.isEmpty() && alertsUpdatedAt.equals(lastSmartAt)) {
            return true;
        }

        JSONArray cities = p.optJSONArray("cities");
        JSONArray types = p.optJSONArray("types");
        JSONArray contracts = p.optJSONArray("contracts");

        HttpResult res;
        try {
            res = httpCached(JOBS_URL, sp.getString("jobsEtag", ""));
        } catch (Exception e) {
            return false;
        }
        if (res.notModified) return true;
        if (res.etag != null && !res.etag.isEmpty()) {
            sp.edit().putString("jobsEtag", res.etag).apply();
        }

        JSONArray jobs;
        try {
            String body = res.body == null ? "" : res.body.trim();
            if (body.startsWith("[")) {
                jobs = new JSONArray(body);
            } else {
                JSONObject root = new JSONObject(body);
                jobs = root.optJSONArray("jobs");
            }
        } catch (Exception e) {
            return false;
        }
        if (jobs == null) return true;
        if (alertsUpdatedAt != null && !alertsUpdatedAt.isEmpty()) {
            sp.edit().putString("smartAlertsAt", alertsUpdatedAt).apply();
        }

        Set<String> seen = readSeen(sp);
        boolean seeded = sp.getBoolean("seeded", false);
        List<JSONObject> fresh = new ArrayList<>();
        Set<String> current = new LinkedHashSet<>();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null) continue;
            String id = j.optString("id", "");
            if (id.isEmpty()) continue;
            current.add(id);
            if (!seen.contains(id)) fresh.add(j);
        }
        saveSeen(sp, current);

        if (!seeded) {
            sp.edit().putBoolean("seeded", true).apply();
            return true;
        }
        if (fresh.isEmpty()) return true;

        List<JSONObject> matched = new ArrayList<>();
        for (JSONObject j : fresh) {
            if (smartMatches(j, cities, types, contracts)) matched.add(j);
        }
        if (matched.isEmpty()) return true;

        String title = "Alerte intelligente • " + matched.size() + " nouvelle" + (matched.size() > 1 ? "s" : "");
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < matched.size() && i < 3; i++) {
            JSONObject j = matched.get(i);
            if (i > 0) body.append(" • ");
            body.append(j.optString("title", "Offre"));
            String city = j.optString("city", "");
            if (!city.isEmpty()) body.append(" — ").append(city);
        }
        if (matched.size() > 3) body.append(" • +").append(matched.size() - 3);
        String text = body.toString();
        if (text.length() > 240) text = text.substring(0, 237) + "…";
        notifySmartNow(ctx, title, text);
        return true;
    }

    private static boolean smartMatches(JSONObject j, JSONArray cities, JSONArray types, JSONArray contracts) {
        String type = smartTypeOf(j);
        if (types != null && types.length() > 0) {
            boolean ok = false;
            for (int i = 0; i < types.length(); i++) {
                if (type.equals(types.optString(i, ""))) { ok = true; break; }
            }
            if (!ok) return false;
        }
        if (cities != null && cities.length() > 0) {
            String c = norm(j.optString("city", ""));
            boolean ok = false;
            for (int i = 0; i < cities.length(); i++) {
                String x = norm(cities.optString(i, ""));
                if (!x.isEmpty() && (c.equals(x) || c.contains(x) || x.contains(c))) { ok = true; break; }
            }
            if (!ok) return false;
        }
        if (contracts != null && contracts.length() > 0) {
            String c = norm(j.optString("contract", ""));
            boolean ok = false;
            for (int i = 0; i < contracts.length(); i++) {
                String x = norm(contracts.optString(i, ""));
                if (!x.isEmpty() && (c.equals(x) || c.contains(x) || x.contains(c))) { ok = true; break; }
            }
            if (!ok) return false;
        }
        return true;
    }

    private static String smartTypeOf(JSONObject j) {
        if ("concours".equalsIgnoreCase(j.optString("kind", ""))) return "concours";
        String category = j.optString("category", "");
        String contract = norm(j.optString("contract", ""));
        String title = norm(j.optString("title", ""));
        if ("stages".equalsIgnoreCase(category)
            || contract.contains("stage")
            || title.startsWith("stage")
            || title.contains(" stagiaire")
            || title.contains(" stage ")
            || title.contains("-stage")
            || title.contains("(stage")) {
            return "stage";
        }
        return "emploi";
    }

    private static String norm(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    private static Set<String> readSeen(SharedPreferences sp) {
        Set<String> set = new LinkedHashSet<>();
        try {
            JSONArray a = new JSONArray(sp.getString("seen", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String s = a.optString(i, "");
                if (!s.isEmpty()) set.add(s);
            }
        } catch (Exception ignored) {}
        return set;
    }

    private static void saveSeen(SharedPreferences sp, Collection<String> ids) {
        List<String> list = new ArrayList<>(ids);
        if (list.size() > 6000) list = new ArrayList<>(list.subList(list.size() - 6000, list.size()));
        sp.edit().putString("seen", new JSONArray(list).toString()).apply();
    }

    private static String http(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(20000);
        con.setReadTimeout(20000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("Cache-Control", "no-cache");
        con.setRequestProperty("User-Agent", "ASSOULI-AUTOX-App");
        try {
            int code = con.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            StringBuilder sb = new StringBuilder();
            BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            return sb.toString();
        } finally {
            con.disconnect();
        }
    }

    static class HttpResult {
        String body = "";
        String etag = "";
        boolean notModified = false;
    }

    private static HttpResult httpCached(String url, String etag) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        con.setInstanceFollowRedirects(true);
        con.setRequestProperty("Cache-Control", "no-cache");
        con.setRequestProperty("User-Agent", "ASSOULI-AUTOX-App");
        if (etag != null && !etag.isEmpty()) con.setRequestProperty("If-None-Match", etag);
        try {
            int code = con.getResponseCode();
            HttpResult r = new HttpResult();
            if (code == 304) {
                r.notModified = true;
                return r;
            }
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            String newEtag = con.getHeaderField("ETag");
            r.etag = newEtag == null ? "" : newEtag;
            StringBuilder sb = new StringBuilder();
            BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            r.body = sb.toString();
            return r;
        } finally {
            con.disconnect();
        }
    }

    static void notifyNow(Context ctx, String title, String text) {
        try {
            ensureChannel(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, intent == null ? new Intent() : intent, flags);

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_autox)
                .setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(), R.drawable.ic_notif_large))
                .setColor(0xFF14E0B4)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis())
                .setAutoCancel(true)
                .setContentIntent(pi);

            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (Exception ignored) {}
    }

    /** Notification d'alerte intelligente : canal et icône volontairement différents. */
    static void notifySmartNow(Context ctx, String title, String text) {
        try {
            ensureSmartChannel(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 2, intent == null ? new Intent() : intent, flags);

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, SMART_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_smart)
                .setLargeIcon(BitmapFactory.decodeResource(ctx.getResources(), R.drawable.ic_notif_smart_large))
                .setColor(0xFF7C5CFF)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis())
                .setAutoCancel(true)
                .setContentIntent(pi);

            nm.notify(70000 + (int) (System.currentTimeMillis() % 1000), b.build());
        } catch (Exception ignored) {}
    }
}
