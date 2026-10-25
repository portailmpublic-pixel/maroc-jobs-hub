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
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.BackoffPolicy;
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
import java.util.concurrent.TimeUnit;

/**
 * Vérifie les alertes dans le cloud même quand l'app est fermée (toutes les ~15 min)
 * et affiche une notification Android dès qu'une nouveauté est publiée.
 */
public class UpdateWorker extends Worker {

    static final String ALERTS_URL = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/alerts.json";
    static final String MARCHES_META_URL = "https://raw.githubusercontent.com/portailmpublic-pixel/maroc-jobs-hub/master/app/public/marches-meta.json";
    static final String CHANNEL_ID = "updates";
    static final String WORK_NAME = "mjh-updates";

    public UpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        try {
            JSONObject root = new JSONObject(http(ALERTS_URL));
            String updatedAt = root.optString("updatedAt", "");
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

            // Marchés publics : petit fichier meta (pas les 2 Mo du catalogue).
            // « newestAt » ne change que lorsqu'une consultation inédite arrive.
            try {
                JSONObject meta = new JSONObject(http(MARCHES_META_URL));
                String newestAt = meta.optString("newestAt", "");
                int new24 = meta.optInt("new24h", 0);
                int open = meta.optInt("open", 0);
                String lastMarch = sp.getString("marchesNewestAt", "");
                if (!newestAt.isEmpty() && !newestAt.equals(lastMarch)) {
                    sp.edit().putString("marchesNewestAt", newestAt).apply();
                    if (!lastMarch.isEmpty() && new24 > 0) {
                        notifyNow(ctx,
                            "Marchés publics • " + new24 + " nouveau(x)",
                            new24 + " nouvelle(s) consultation(s) — " + open + " marchés ouverts à consulter.");
                    }
                }
            } catch (Exception ignored) {}

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    static void schedule(Context ctx) {
        try {
            ensureChannel(ctx);
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
}
