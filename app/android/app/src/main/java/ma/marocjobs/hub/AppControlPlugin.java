package ma.marocjobs.hub;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AppControl — permet à l'interface web de fermer complètement l'APK
 * lorsqu'un compte est désactivé depuis l'APK admin.
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
}
