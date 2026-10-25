package ma.marocjobs.hub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private BroadcastReceiver accessReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MailPlugin.class);
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(LocalAccountsPlugin.class);
        registerPlugin(AppControlPlugin.class);
        super.onCreate(savedInstanceState);
        UpdateWorker.ensureChannel(this);
        UpdateWorker.schedule(this);
        askNotificationPermission();
        registerAccessReceiver();
    }

    /** Android 13+ : sans cette permission, aucune notification ne peut s'afficher. */
    private void askNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 9001);
            }
        } catch (Exception ignored) {}
    }

    /**
     * L'APK admin envoie access.json après publication. La signature partagée
     * protège ce broadcast : l'app se ferme immédiatement si le compte est bloqué.
     */
    private void registerAccessReceiver() {
        accessReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                final String json = intent.getStringExtra("access");
                if (bridge == null) return;
                final WebView web = bridge.getWebView();
                if (web == null) return;
                web.post(() -> {
                    String js = "window.__mjhAccess=" + JSONObject.quote(json == null ? "" : json)
                        + ";window.dispatchEvent(new Event('access-changed'));";
                    web.evaluateJavascript(js, null);
                });
            }
        };

        IntentFilter filter = new IntentFilter("ma.marocjobs.hub.ACTION_ACCESS_CHANGED");
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(accessReceiver, filter,
                    "ma.marocjobs.hub.permission.READ_ACCOUNTS", null,
                    Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(accessReceiver, filter,
                    "ma.marocjobs.hub.permission.READ_ACCOUNTS", null);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        if (accessReceiver != null) {
            try { unregisterReceiver(accessReceiver); } catch (Exception ignored) {}
            accessReceiver = null;
        }
        super.onDestroy();
    }
}
