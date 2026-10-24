package ma.marocjobs.admin;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.util.Base64;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AdminActivity extends Activity {

    private static final String API = "https://api.github.com/repos/";
    private static final String PATH = "app/public/access.json";
    private static final int BG = Color.parseColor("#05070D");
    private static final int CARD = Color.parseColor("#0E1526");
    private static final int TEXT = Color.parseColor("#EAF2FF");
    private static final int MUTED = Color.parseColor("#8AA0B8");
    private static final int BRAND = Color.parseColor("#14E0B4");

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private final Set<String> disabled = new LinkedHashSet<>();

    private SharedPreferences prefs;
    private EditText tokenInput, ownerInput, repoInput, branchInput, emailInput, messageInput;
    private TextView status, listTitle;
    private LinearLayout listBox;
    private String sha = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("admin", MODE_PRIVATE);
        setContentView(buildUi());
        if (savedInstanceState == null) loadRemote();
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(28));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("ASSOULI ADMIN");
        title.setTextColor(TEXT);
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Activer / désactiver les comptes ASSOULI AUTOX (distant)");
        sub.setTextColor(MUTED);
        sub.setTextSize(12);
        sub.setPadding(0, dp(2), 0, dp(14));
        root.addView(sub);

        tokenInput = field(root, "Jeton GitHub (fine-grained, Contents: Read/Write)", prefs.getString("token", BuildConfig.GITHUB_TOKEN), true);
        ownerInput = field(root, "Compte GitHub", prefs.getString("owner", "portailmpublic-pixel"), false);
        repoInput = field(root, "Dépôt", prefs.getString("repo", "maroc-jobs-hub"), false);
        branchInput = field(root, "Branche", prefs.getString("branch", "master"), false);

        LinearLayout loadRow = row(root);
        Button load = button(loadRow, "Charger access.json", true);
        load.setOnClickListener(v -> loadRemote());
        Button save = button(loadRow, "Enregistrer", false);
        save.setOnClickListener(v -> saveRemote());

        status = new TextView(this);
        status.setTextColor(MUTED);
        status.setTextSize(12);
        status.setPadding(0, dp(10), 0, dp(12));
        status.setText("Prêt.");
        root.addView(status);

        TextView addTitle = new TextView(this);
        addTitle.setText("Désactiver un compte");
        addTitle.setTextColor(TEXT);
        addTitle.setTextSize(15);
        addTitle.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(addTitle);

        emailInput = new EditText(this);
        emailInput.setHint("email@exemple.com");
        emailInput.setHintTextColor(Color.parseColor("#5C7186"));
        emailInput.setTextColor(TEXT);
        emailInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        emailInput.setBackgroundColor(CARD);
        emailInput.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ep.topMargin = dp(8);
        root.addView(emailInput, ep);

        LinearLayout addRow = row(root);
        Button disableBtn = button(addRow, "Désactiver", false);
        disableBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty() || !e.contains("@")) { status.setText("Entrez un e-mail valide."); return; }
            disabled.add(e);
            emailInput.setText("");
            renderList();
            status.setText("Ajouté. Touchez « Enregistrer » pour publier.");
        });
        Button enableBtn = button(addRow, "Activer", true);
        enableBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty()) { status.setText("Entrez l’e-mail à activer."); return; }
            if (disabled.remove(e)) {
                renderList();
                status.setText("Retiré. Touchez « Enregistrer » pour publier.");
            } else {
                status.setText("Cet e-mail n’est pas dans la liste désactivée.");
            }
            emailInput.setText("");
        });

        messageInput = field(root, "Message affiché au compte bloqué", prefs.getString("message", "Ce compte a été désactivé par l’administrateur."), false);

        listTitle = new TextView(this);
        listTitle.setText("Comptes désactivés (0)");
        listTitle.setTextColor(TEXT);
        listTitle.setTextSize(15);
        listTitle.setTypeface(Typeface.DEFAULT_BOLD);
        listTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(listTitle);

        listBox = new LinearLayout(this);
        listBox.setOrientation(LinearLayout.VERTICAL);
        root.addView(listBox);

        TextView foot = new TextView(this);
        foot.setText("Sécurité : le jeton reste sur ce téléphone. Il doit avoir le droit « Contents: Read and write » sur ce dépôt uniquement.");
        foot.setTextColor(MUTED);
        foot.setTextSize(10.5f);
        foot.setPadding(0, dp(18), 0, 0);
        root.addView(foot);

        return scroll;
    }

    private EditText field(LinearLayout parent, String label, String value, boolean secret) {
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextColor(MUTED);
        l.setTextSize(11);
        l.setPadding(0, dp(12), 0, dp(4));
        parent.addView(l);

        EditText e = new EditText(this);
        e.setText(value);
        e.setTextColor(TEXT);
        e.setSingleLine(true);
        e.setBackgroundColor(CARD);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        if (secret) e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        parent.addView(e, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private LinearLayout row(LinearLayout parent) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setPadding(0, dp(12), 0, 0);
        parent.addView(r);
        return r;
    }

    private Button button(LinearLayout row, String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(12.5f);
        b.setAllCaps(false);
        b.setTextColor(primary ? Color.parseColor("#03251E") : TEXT);
        if (primary) b.setBackgroundColor(BRAND);
        else b.setBackgroundColor(Color.parseColor("#1A2438"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lp.rightMargin = dp(8);
        row.addView(b, lp);
        return b;
    }

    private void renderList() {
        listBox.removeAllViews();
        listTitle.setText("Comptes désactivés (" + disabled.size() + ")");
        if (disabled.isEmpty()) {
            TextView tv = new TextView(this);
            tv.setText("Aucun compte désactivé.");
            tv.setTextColor(MUTED);
            tv.setTextSize(12);
            listBox.addView(tv);
            return;
        }
        List<String> items = new ArrayList<>(disabled);
        for (String email : items) {
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setBackgroundColor(CARD);
            r.setPadding(dp(12), dp(8), dp(8), dp(8));
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rp.topMargin = dp(6);
            listBox.addView(r, rp);

            TextView tv = new TextView(this);
            tv.setText(email);
            tv.setTextColor(TEXT);
            tv.setTextSize(12.5f);
            tv.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            r.addView(tv);

            Button on = new Button(this);
            on.setText("Activer");
            on.setTextSize(10.5f);
            on.setAllCaps(false);
            on.setTextColor(BRAND);
            on.setBackgroundColor(Color.TRANSPARENT);
            on.setOnClickListener(v -> {
                disabled.remove(email);
                renderList();
                status.setText("Activé localement. Touchez « Enregistrer » pour publier.");
            });
            r.addView(on);
        }
    }

    private void loadRemote() {
        savePrefs();
        final String owner = ownerInput.getText().toString().trim();
        final String repo = repoInput.getText().toString().trim();
        final String branch = branchInput.getText().toString().trim();
        final String token = tokenInput.getText().toString().trim();
        if (owner.isEmpty() || repo.isEmpty()) { status.setText("Compte / dépôt manquant."); return; }
        status.setText("Chargement…");
        pool.execute(() -> {
            try {
                String url = API + owner + "/" + repo + "/contents/" + PATH + "?ref=" + branch;
                JSONObject res = request("GET", url, null, token.isEmpty() ? null : token);
                sha = res.optString("sha", "");
                String content = res.optString("content", "").replace("\n", "").replace("\r", "");
                String json = new String(Base64.decode(content, Base64.DEFAULT), StandardCharsets.UTF_8);
                JSONObject root = new JSONObject(json);
                JSONArray arr = root.optJSONArray("disabled");
                disabled.clear();
                if (arr != null) for (int i = 0; i < arr.length(); i++) disabled.add(arr.optString(i).toLowerCase(Locale.ROOT));
                String msg = root.optString("message", "");
                runOnUiThread(() -> {
                    if (!msg.isEmpty()) messageInput.setText(msg);
                    renderList();
                    status.setText("Chargé : " + disabled.size() + " compte(s) désactivé(s).");
                });
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Erreur chargement : " + e.getMessage()));
            }
        });
    }

    private void saveRemote() {
        savePrefs();
        final String owner = ownerInput.getText().toString().trim();
        final String repo = repoInput.getText().toString().trim();
        final String branch = branchInput.getText().toString().trim();
        final String token = tokenInput.getText().toString().trim();
        if (token.isEmpty()) { status.setText("Jeton GitHub requis pour enregistrer."); return; }
        if (owner.isEmpty() || repo.isEmpty()) { status.setText("Compte / dépôt manquant."); return; }
        final String message = messageInput.getText().toString().trim();
        status.setText("Enregistrement…");
        pool.execute(() -> {
            try {
                String url = API + owner + "/" + repo + "/contents/" + PATH;
                if (sha == null || sha.isEmpty()) {
                    JSONObject cur = request("GET", url + "?ref=" + branch, null, token);
                    sha = cur.optString("sha", "");
                }
                JSONObject payload = new JSONObject();
                JSONArray arr = new JSONArray();
                for (String e : disabled) arr.put(e);
                SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                payload.put("updatedAt", fmt.format(new Date()));
                payload.put("disabled", arr);
                payload.put("message", message.isEmpty() ? "Ce compte a été désactivé par l’administrateur." : message);

                byte[] bytes = payload.toString(2).getBytes(StandardCharsets.UTF_8);
                JSONObject body = new JSONObject();
                body.put("message", "Admin: update disabled accounts");
                body.put("content", Base64.encodeToString(bytes, Base64.NO_WRAP));
                body.put("branch", branch);
                if (!sha.isEmpty()) body.put("sha", sha);

                JSONObject res = request("PUT", url, body.toString().getBytes(StandardCharsets.UTF_8), token);
                JSONObject content = res.optJSONObject("content");
                if (content != null) sha = content.optString("sha", sha);
                runOnUiThread(() -> status.setText("Publié ✓ Les appareils appliqueront au prochain contrôle."));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Erreur enregistrement : " + e.getMessage()));
            }
        });
    }

    private JSONObject request(String method, String urlStr, byte[] body, String token) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(urlStr).openConnection();
        con.setRequestMethod(method);
        con.setConnectTimeout(20000);
        con.setReadTimeout(20000);
        con.setRequestProperty("Accept", "application/vnd.github+json");
        con.setRequestProperty("User-Agent", "ASSOULI-ADMIN");
        if (token != null && !token.isEmpty()) con.setRequestProperty("Authorization", "token " + token);
        if (body != null) {
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = con.getOutputStream()) { os.write(body); }
        }
        int code = con.getResponseCode();
        InputStream is = code >= 200 && code < 300 ? con.getInputStream() : con.getErrorStream();
        StringBuilder sb = new StringBuilder();
        if (is != null) {
            BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
        }
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code + " " + sb.toString().replaceAll("\\s+", " ").substring(0, Math.min(90, sb.length())));
        return new JSONObject(sb.toString());
    }

    private void savePrefs() {
        prefs.edit()
            .putString("token", tokenInput.getText().toString().trim())
            .putString("owner", ownerInput.getText().toString().trim())
            .putString("repo", repoInput.getText().toString().trim())
            .putString("branch", branchInput.getText().toString().trim())
            .putString("message", messageInput.getText().toString().trim())
            .apply();
    }
}
