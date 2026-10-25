package ma.marocjobs.hub;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Redémarre la surveillance des nouveautés après un redémarrage du téléphone
 * ou une mise à jour de l'APK. WorkManager conserve déjà ses tâches, ce
 * receiver force une vérification immédiate dès que le système le permet.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            UpdateWorker.ensureChannel(context);
            UpdateWorker.schedule(context);
        } catch (Exception ignored) {}
    }
}
