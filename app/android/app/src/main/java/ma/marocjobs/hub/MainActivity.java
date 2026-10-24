package ma.marocjobs.hub;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MailPlugin.class);
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(LocalAccountsPlugin.class);
        super.onCreate(savedInstanceState);
        UpdateWorker.schedule(this);
    }
}
