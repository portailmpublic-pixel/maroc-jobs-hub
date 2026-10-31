package ma.marocjobs.hub;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
