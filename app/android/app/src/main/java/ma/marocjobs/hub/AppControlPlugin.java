package ma.marocjobs.hub;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * AppControl — permet à l'interface web de fermer complètement l'APK
 * lorsqu'un compte est désactivé depuis l'APK admin, et d'ouvrir les
 * réglages Android utiles aux notifications en arrière-plan.
 */
@CapacitorPlugin(name = "AppControl")
public class AppControlPlugin extends Plugin {

    @PluginMethod
    public void close(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);

        final Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            activity.finishAffinity();
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                Process.killProcess(Process.myPid());
                System.exit(0);
            }, 320);
        });
    }

    /** Ouvre l'ecran d'exemption d'optimisation de batterie (sans permission restreinte). */
    @PluginMethod
    public void background(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        try {
            Activity activity = getActivity();
            if (activity == null) { call.resolve(ret); return; }
            // Play Store: pas de REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (permission restreinte).
            // On ouvre directement la liste des applications a exclure.
            activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            ret.put("ok", true);
        } catch (Exception ignored) {}
        call.resolve(ret);
    }

    /** Ouvre l'écran Android des notifications de l'application. */
    @PluginMethod
    public void notificationSettings(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        try {
            Activity activity = getActivity();
            if (activity == null) { call.resolve(ret); return; }
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            activity.startActivity(i);
            ret.put("ok", true);
        } catch (Exception e) {
            try {
                Activity activity = getActivity();
                if (activity != null) {
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                    ret.put("ok", true);
                }
            } catch (Exception ignored) {}
        }
        call.resolve(ret);
    }

    /**
     * Enregistre les filtres des alertes intelligentes pour le worker Android.
     * On ne stocke que les filtres (jamais l'historique complet) : le worker
     * garde son propre fichier « déjà vu ».
     */
    @PluginMethod
    public void saveSmartPrefs(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        try {
            String prefs = call.getString("prefs", "");
            if (prefs == null) prefs = "";
            if (prefs.length() > 200000) {
                call.reject("Préférences trop volumineuses");
                return;
            }
            Context ctx = getContext();
            ctx.getSharedPreferences(UpdateWorker.SMART_PREFS, Context.MODE_PRIVATE)
                .edit().putString("prefs", prefs).apply();
            UpdateWorker.ensureChannel(ctx);
            UpdateWorker.schedule(ctx);
            ret.put("ok", true);
        } catch (Exception ignored) {}
        call.resolve(ret);
    }

    /** Notification de test avec l'icône intelligente (canal distinct). */
    @PluginMethod
    public void smartTest(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        try {
            if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
                call.resolve(ret);
                return;
            }
            UpdateWorker.notifySmartNow(
                getContext(),
                "Alerte intelligente",
                "Exemple : Développeur — Casablanca (CDI). Cette notification utilise une icône différente des alertes générales."
            );
            ret.put("ok", true);
        } catch (Exception ignored) {}
        call.resolve(ret);
    }

    /** Renvoie les identifiants déjà notifiés en arrière-plan. */
    @PluginMethod
    public void getSmartSeen(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ids", "[]");
        try {
            SharedPreferences sp = getContext().getSharedPreferences(UpdateWorker.SMART_PREFS, Context.MODE_PRIVATE);
            ret.put("ids", sp.getString("seen", "[]"));
        } catch (Exception ignored) {}
        call.resolve(ret);
    }

    /** Fusionne les identifiants vus côté WebView avec ceux du worker natif. */
    @PluginMethod
    public void mergeSmartSeen(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", false);
        try {
            String raw = call.getString("ids", "[]");
            JSONArray incoming = new JSONArray(raw == null ? "[]" : raw);
            SharedPreferences sp = getContext().getSharedPreferences(UpdateWorker.SMART_PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(sp.getString("seen", "[]"));
            LinkedHashSet<String> set = new LinkedHashSet<>();
            for (int i = 0; i < old.length(); i++) {
                String s = old.optString(i, "");
                if (!s.isEmpty()) set.add(s);
            }
            for (int i = 0; i < incoming.length(); i++) {
                String s = incoming.optString(i, "");
                if (!s.isEmpty()) set.add(s);
            }
            List<String> list = new ArrayList<>(set);
            if (list.size() > 6000) list = new ArrayList<>(list.subList(list.size() - 6000, list.size()));
            sp.edit().putString("seen", new JSONArray(list).toString()).apply();
            ret.put("ok", true);
        } catch (Exception ignored) {}
        call.resolve(ret);
    }
}
