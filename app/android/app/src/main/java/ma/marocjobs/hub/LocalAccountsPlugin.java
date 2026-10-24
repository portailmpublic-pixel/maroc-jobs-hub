package ma.marocjobs.hub;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LocalAccounts — copie la liste des comptes locaux dans un stockage natif,
 * lisible uniquement par l'APK admin signé avec la même clé (permission signature).
 */
@CapacitorPlugin(name = "LocalAccounts")
public class LocalAccountsPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String json = call.getString("accounts", "[]");
        if (json == null || json.trim().isEmpty()) json = "[]";
        getContext()
            .getSharedPreferences("accounts_store", Context.MODE_PRIVATE)
            .edit()
            .putString("json", json)
            .apply();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
