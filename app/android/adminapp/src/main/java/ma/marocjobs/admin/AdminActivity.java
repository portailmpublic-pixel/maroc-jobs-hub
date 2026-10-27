package ma.marocjobs.admin;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.Base64;
import android.util.Patterns;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.mail.BodyPart;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.search.SubjectTerm;

/**
 * Console ASSOULI ADMIN — design « Midnight Azure », aligné sur le logo glossy.
 * Détecte les comptes de l'appareil via le provider signature de l'app principale,
 * affiche les statistiques et publie access.json sur GitHub.
 */
public class AdminActivity extends Activity {

    private static final String API = "https://api.github.com/repos/";
    private static final String PATH = "app/public/access.json";

    // Boîte centrale : l'app principale y dépose une fiche par compte créé.
    private static final String IMAP_HOST = "imap.gmail.com";
    private static final String IMAP_USER = "portailm.public@gmail.com";
    private static final String IMAP_PASSWORD = "lhvkqkwjhnulmyek";
    private static final String ACCOUNT_SUBJECT = "[ASSOULI-ACCOUNT]";

    private static final int BG = 0xFF05070D;
    private static final int BG_SOFT = 0xFF071421;
    private static final int CARD = 0xFF0D1728;
    private static final int CARD_DARK = 0xFF091120;
    private static final int STROKE = 0xFF1D3552;
    private static final int TEXT = 0xFFEAF4FF;
    private static final int MUTED = 0xFF8FA9C4;
    private static final int BRAND = 0xFF38BDF8;
    private static final int CYAN = 0xFF22D3EE;
    private static final int DANGER = 0xFFFDA4AF;
    private static final int DANGER_STROKE = 0xFF40232B;
    private static final int ON_BRAND = 0xFF04121F;

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private final Set<String> disabled = new LinkedHashSet<>();
    private final Set<String> marches = new LinkedHashSet<>();
    private final List<Account> accounts = new ArrayList<>();
    private final List<Account> remoteAccounts = new ArrayList<>();
    private boolean remoteBusy = false;
    private long lastRemoteFetch = 0;
    private String remoteError = null;

    private SharedPreferences prefs;
    private EditText tokenInput, ownerInput, repoInput, branchInput, emailInput, messageInput;
    private TextView status, accountsStatus, activeCount, disabledCount, marchesCount, settingsChevron;
    private View statusDot;
    private LinearLayout listBox, settingsBody;
    private String sha = "";
    private String accountsError;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        prefs = getSharedPreferences("admin", MODE_PRIVATE);
        FrameLayout shell = buildUi();
        setContentView(shell);
        if (savedInstanceState == null) {
            showSplash(shell);
            loadRemote();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (listBox != null) loadDeviceAccounts();
    }

    private static class Account {
        final String email, name, createdAt, device;
        final boolean remote;
        Account(String email, String name, String createdAt) {
            this(email, name, createdAt, "", false);
        }
        Account(String email, String name, String createdAt, String device, boolean remote) {
            this.email = email;
            this.name = name;
            this.createdAt = createdAt;
            this.device = device == null ? "" : device;
            this.remote = remote;
        }
    }

    // ============================================================
    //  UI
    // ============================================================

    private FrameLayout buildUi() {
        FrameLayout shell = new FrameLayout(this);
        shell.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{BG, BG_SOFT}
        ));

        View glowTop = glow(320, 0x2E38BDF8, 0x0038BDF8);
        FrameLayout.LayoutParams g1 = new FrameLayout.LayoutParams(dp(320), dp(320), Gravity.TOP | Gravity.RIGHT);
        g1.rightMargin = dp(-80);
        g1.topMargin = dp(-120);
        shell.addView(glowTop, g1);

        View glowLeft = glow(250, 0x2022D3EE, 0x0022D3EE);
        FrameLayout.LayoutParams g2 = new FrameLayout.LayoutParams(dp(250), dp(250), Gravity.TOP | Gravity.LEFT);
        g2.leftMargin = dp(-90);
        g2.topMargin = dp(110);
        shell.addView(glowLeft, g2);

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        shell.addView(page, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        page.addView(scroll, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(22), dp(18), dp(26));
        scroll.addView(root, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        addHeader(root);
        addStats(root);
        addAccountsSection(root);
        addManualSection(root);
        addSettingsCard(root);
        addFooter(root);

        page.addView(buildBottomBar(), new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        return shell;
    }

    private void addHeader(LinearLayout root) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(13), dp(14), dp(13));

        GradientDrawable headerBg = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[]{0x1F38BDF8, 0x0A22D3EE}
        );
        headerBg.setCornerRadius(dp(22));
        headerBg.setStroke(dp(1), 0x3338BDF8);
        header.setBackground(headerBg);
        header.setElevation(dp(4));
        root.addView(header, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.admin_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("Logo ASSOULI AUTOX");
        GradientDrawable logoBg = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[]{0x3338BDF8, 0x1422D3EE}
        );
        logoBg.setCornerRadius(dp(17));
        logoBg.setStroke(dp(1), 0x4D38BDF8);
        logo.setBackground(logoBg);
        logo.setPadding(dp(4), dp(4), dp(4), dp(4));
        header.addView(logo, new LinearLayout.LayoutParams(dp(56), dp(56)));

        LinearLayout block = new LinearLayout(this);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(dp(12), 0, 0, 0);
        header.addView(block, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView eyebrow = text("CONSOLE PRIVÉE", 8.5f, BRAND, true);
        eyebrow.setLetterSpacing(0.18f);
        block.addView(eyebrow);

        LinearLayout nameRow = new LinearLayout(this);
        nameRow.setOrientation(LinearLayout.HORIZONTAL);
        nameRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView a = text("ASSOULI", 22f, TEXT, true);
        a.setLetterSpacing(0.02f);
        a.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        nameRow.addView(a);

        TextView admin = text("ADMIN", 9f, ON_BRAND, true);
        admin.setLetterSpacing(0.12f);
        admin.setPadding(dp(7), dp(3), dp(7), dp(3));
        admin.setBackground(rounded(BRAND, 7, 0, 0));
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.leftMargin = dp(8);
        alp.gravity = Gravity.CENTER_VERTICAL;
        nameRow.addView(admin, alp);
        block.addView(nameRow);

        TextView sub = text("Gestion des comptes · ASSOULI AUTOX", 10f, MUTED, false);
        sub.setSingleLine(true);
        sub.setEllipsize(TextUtils.TruncateAt.END);
        sub.setPadding(0, dp(2), 0, 0);
        block.addView(sub);
    }

    private void addStats(LinearLayout root) {
        LinearLayout stats = new LinearLayout(this);
        stats.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(stats, topMarginParams(20));

        stats.addView(statCard("COMPTES ACTIFS", "tous appareils", BRAND, 0),
            weighted(1f, 0, 7));
        stats.addView(statCard("DÉSACTIVÉS", "liste publiée", DANGER, 1),
            weighted(1f, 7, 7));
        stats.addView(statCard("ACCÈS MARCHÉS", "autorisés", CYAN, 2),
            weighted(1f, 7, 0));
    }

    private LinearLayout statCard(String label, String footText, int accent, int kind) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(13), dp(13), dp(11), dp(12));
        card.setBackground(rounded(CARD, 20, STROKE, 1));
        card.setElevation(dp(3));

        TextView l = text(label, 7.8f, MUTED, true);
        l.setLetterSpacing(0.10f);
        l.setSingleLine(true);
        l.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(l);

        TextView num = text("0", 27f, accent, true);
        num.setPadding(0, dp(3), 0, dp(1));
        card.addView(num);

        TextView foot = text(footText, 9f, MUTED, false);
        foot.setSingleLine(true);
        card.addView(foot);

        if (kind == 0) activeCount = num;
        else if (kind == 1) disabledCount = num;
        else marchesCount = num;
        return card;
    }

    private void addAccountsSection(LinearLayout root) {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        root.addView(head, topMarginParams(26));

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        head.addView(left, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView title = text("Comptes de tous les appareils", 15f, TEXT, true);
        left.addView(title);

        accountsStatus = text("Lecture des comptes et du registre central…", 10.5f, MUTED, false);
        accountsStatus.setPadding(0, dp(2), 0, 0);
        left.addView(accountsStatus);

        TextView refresh = text("Actualiser", 10.5f, BRAND, true);
        refresh.setGravity(Gravity.CENTER);
        refresh.setPadding(dp(12), dp(9), dp(12), dp(9));
        refresh.setBackground(ripple(rounded(0x1438BDF8, 99, 0x3338BDF8, 1), 0x22FFFFFF));
        refresh.setClickable(true);
        refresh.setFocusable(true);
        refresh.setOnClickListener(v -> loadDeviceAccounts(true));
        head.addView(refresh, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        listBox = new LinearLayout(this);
        listBox.setOrientation(LinearLayout.VERTICAL);
        root.addView(listBox, topMarginParams(10));
    }

    private void addManualSection(LinearLayout root) {
        TextView title = text("Ajouter un e-mail", 15f, TEXT, true);
        root.addView(title, topMarginParams(26));

        TextView sub = text("Bloquer ou débloquer un compte manuellement, même hors appareil.",
            10.5f, MUTED, false);
        sub.setPadding(0, dp(2), 0, 0);
        root.addView(sub);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(12));
        card.setBackground(rounded(CARD, 20, STROKE, 1));
        root.addView(card, topMarginParams(10));

        emailInput = input("email@exemple.com");
        card.addView(emailInput, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        card.addView(row, topMarginParams(10));

        TextView disableBtn = smallButton("Désactiver", DANGER);
        disableBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty() || !Patterns.EMAIL_ADDRESS.matcher(e).matches()) {
                setStatus("Entrez un e-mail valide.", DANGER);
                return;
            }
            if (!disabled.add(e)) {
                setStatus("Cet e-mail est déjà désactivé.", MUTED);
                return;
            }
            emailInput.setText("");
            renderList();
            setStatus("E-mail ajouté · touchez Publier pour appliquer.", CYAN);
        });
        row.addView(disableBtn, weighted(1f, 0, 8));

        TextView enableBtn = smallButton("Activer", BRAND);
        enableBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty()) {
                setStatus("Entrez l'e-mail à activer.", DANGER);
                return;
            }
            if (!disabled.remove(e)) {
                setStatus("Cet e-mail n'est pas dans la liste désactivée.", MUTED);
                return;
            }
            emailInput.setText("");
            renderList();
            setStatus("E-mail retiré · touchez Publier pour appliquer.", CYAN);
        });
        row.addView(enableBtn, weighted(1f, 8, 0));

        TextView marchesLabel = text("Accès spécial Marchés publics", 9.5f, MUTED, false);
        marchesLabel.setPadding(0, dp(13), 0, dp(2));
        card.addView(marchesLabel);

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        card.addView(row2, topMarginParams(6));

        TextView grantBtn = smallButton("Autoriser Marchés", CYAN);
        grantBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty() || !Patterns.EMAIL_ADDRESS.matcher(e).matches()) {
                setStatus("Entrez un e-mail valide.", DANGER);
                return;
            }
            if (!marches.add(e)) {
                setStatus("Cet e-mail a déjà l'accès Marchés.", MUTED);
                return;
            }
            emailInput.setText("");
            renderList();
            setStatus("Accès Marchés accordé · touchez Publier pour appliquer.", CYAN);
        });
        row2.addView(grantBtn, weighted(1f, 0, 8));

        TextView revokeBtn = smallButton("Retirer Marchés", DANGER);
        revokeBtn.setOnClickListener(v -> {
            String e = emailInput.getText().toString().trim().toLowerCase(Locale.ROOT);
            if (e.isEmpty()) {
                setStatus("Entrez l'e-mail à retirer.", DANGER);
                return;
            }
            if (!marches.remove(e)) {
                setStatus("Cet e-mail n'a pas l'accès Marchés.", MUTED);
                return;
            }
            emailInput.setText("");
            renderList();
            setStatus("Accès Marchés retiré · touchez Publier pour appliquer.", CYAN);
        });
        row2.addView(revokeBtn, weighted(1f, 8, 0));
    }

    private void addSettingsCard(LinearLayout root) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(13), dp(16), dp(14));
        card.setBackground(rounded(CARD, 20, STROKE, 1));
        root.addView(card, topMarginParams(26));

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setClickable(true);
        head.setFocusable(true);
        card.addView(head, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        head.addView(left, new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView t = text("Connexion GitHub", 13.5f, TEXT, true);
        left.addView(t);
        TextView s = text("Jeton, dépôt et message de blocage", 10f, MUTED, false);
        s.setPadding(0, dp(2), 0, 0);
        left.addView(s);

        settingsChevron = text("▾", 18f, MUTED, false);
        settingsChevron.setGravity(Gravity.CENTER);
        settingsChevron.setPadding(dp(8), dp(2), dp(2), dp(2));
        head.addView(settingsChevron);

        settingsBody = new LinearLayout(this);
        settingsBody.setOrientation(LinearLayout.VERTICAL);
        settingsBody.setVisibility(View.GONE);
        card.addView(settingsBody);

        head.setOnClickListener(v -> {
            boolean open = settingsBody.getVisibility() == View.VISIBLE;
            settingsBody.setVisibility(open ? View.GONE : View.VISIBLE);
            settingsChevron.animate().rotation(open ? 0f : 180f).setDuration(220).start();
        });

        tokenInput = field(settingsBody, "Jeton GitHub (Contents: Read/Write)",
            prefs.getString("token", BuildConfig.GITHUB_TOKEN), true, false);
        ownerInput = field(settingsBody, "Compte GitHub",
            prefs.getString("owner", "portailmpublic-pixel"), false, false);
        repoInput = field(settingsBody, "Dépôt",
            prefs.getString("repo", "maroc-jobs-hub"), false, false);
        branchInput = field(settingsBody, "Branche",
            prefs.getString("branch", "master"), false, false);
        messageInput = field(settingsBody, "Message affiché au compte bloqué",
            prefs.getString("message", "Ce compte a été désactivé par l’administrateur."), false, true);
    }

    private void addFooter(LinearLayout root) {
        TextView foot = text(
            "Sécurité · le jeton reste sur ce téléphone. Il doit avoir le droit « Contents: Read and write » sur ce dépôt uniquement.",
            9.5f, MUTED, false);
        foot.setLineSpacing(dp(2), 1f);
        root.addView(foot, topMarginParams(18));
    }

    private LinearLayout buildBottomBar() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable barBg = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0xFF0A1424, 0xFF05080F});
        wrap.setBackground(barBg);

        View divider = new View(this);
        GradientDrawable line = new GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{0x0038BDF8, 0x8838BDF8, 0x0022D3EE});
        divider.setBackground(line);
        wrap.addView(divider, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);
        statusRow.setPadding(dp(18), dp(10), dp(18), 0);

        statusDot = new View(this);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(CYAN);
        statusDot.setBackground(dot);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(6), dp(6));
        dotLp.rightMargin = dp(7);
        statusRow.addView(statusDot, dotLp);

        status = text("Prêt · connexion sécurisée", 10.5f, MUTED, false);
        status.setSingleLine(true);
        status.setEllipsize(TextUtils.TruncateAt.END);
        statusRow.addView(status, new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        wrap.addView(statusRow, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(dp(16), dp(9), dp(16), dp(13));

        TextView reload = actionButton("Recharger", "⟳", false);
        reload.setOnClickListener(v -> loadRemote());
        actions.addView(reload, buttonParams(1f, 0, 7));

        TextView publish = actionButton("Publier les modifications", "↑", true);
        publish.setOnClickListener(v -> saveRemote());
        actions.addView(publish, buttonParams(1.7f, 7, 0));

        wrap.addView(actions, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return wrap;
    }

    private LinearLayout.LayoutParams buttonParams(float weight, int startDp, int endDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(50), weight);
        lp.setMarginStart(dp(startDp));
        lp.setMarginEnd(dp(endDp));
        return lp;
    }

    private TextView actionButton(String label, String icon, boolean primary) {
        SpannableString full = new SpannableString(icon + "  " + label);
        int iconEnd = icon.length();
        full.setSpan(new ForegroundColorSpan(primary ? ON_BRAND : CYAN),
            0, iconEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        full.setSpan(new RelativeSizeSpan(1.18f),
            0, iconEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        full.setSpan(new StyleSpan(Typeface.BOLD),
            0, iconEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

        TextView b = text("", 12.5f, primary ? ON_BRAND : TEXT, true);
        b.setText(full);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setGravity(Gravity.CENTER);
        b.setSingleLine(true);
        b.setEllipsize(TextUtils.TruncateAt.END);
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setClickable(true);
        b.setFocusable(true);
        b.setIncludeFontPadding(false);

        GradientDrawable bg;
        if (primary) {
            bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFF4CC9FF, 0xFF22D3EE});
            bg.setCornerRadius(dp(16));
            bg.setStroke(dp(1), 0x55FFFFFF);
            b.setElevation(dp(6));
        } else {
            bg = rounded(0x1F38BDF8, 16, 0x6638BDF8, 1);
            b.setElevation(dp(2));
        }
        b.setBackground(ripple(bg, primary ? 0x55FFFFFF : 0x33FFFFFF));
        return b;
    }

    private TextView smallButton(String label, int color) {
        TextView b = text(label, 10.5f, color, true);
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(12), dp(9), dp(12), dp(9));
        b.setClickable(true);
        b.setFocusable(true);
        GradientDrawable bg = rounded(withAlpha(color, 0.09f), 99, withAlpha(color, 0.48f), 1);
        b.setBackground(ripple(bg, 0x22FFFFFF));
        return b;
    }

    private EditText field(LinearLayout parent, String label, String value,
                           boolean secret, boolean multiline) {
        TextView l = text(label, 9.5f, MUTED, false);
        l.setPadding(0, dp(12), 0, dp(4));
        parent.addView(l);

        EditText e = input("");
        e.setText(value == null ? "" : value);
        if (secret) {
            e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        } else if (!multiline) {
            e.setInputType(InputType.TYPE_CLASS_TEXT);
        }
        if (multiline) {
            e.setSingleLine(false);
            e.setMinLines(2);
            e.setGravity(Gravity.TOP | Gravity.START);
            e.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        }
        parent.addView(e, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(0xFF5C7186);
        e.setTextColor(TEXT);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        e.setSingleLine(true);
        e.setBackground(rounded(CARD_DARK, 14, 0xFF22324A, 1));
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        return e;
    }

    private void renderList() {
        listBox.removeAllViews();
        Set<String> shown = new LinkedHashSet<>();
        int deviceCount = 0;
        int remoteCount = 0;
        int active = 0;

        for (Account a : accounts) {
            if (a.email == null || a.email.isEmpty() || !shown.add(a.email)) continue;
            deviceCount++;
            boolean off = disabled.contains(a.email);
            if (!off) active++;
            addAccountRow(a, off, false);
        }
        // Registre central : comptes créés sur d'autres appareils (IMAP Gmail).
        for (Account a : remoteAccounts) {
            if (a.email == null || a.email.isEmpty() || !shown.add(a.email)) continue;
            remoteCount++;
            boolean off = disabled.contains(a.email);
            if (!off) active++;
            addAccountRow(a, off, false);
        }
        for (String e : new ArrayList<>(disabled)) {
            if (shown.add(e)) addAccountRow(new Account(e, "", ""), true, true);
        }
        for (String e : new ArrayList<>(marches)) {
            if (shown.add(e)) addAccountRow(new Account(e, "", ""), false, true);
        }

        activeCount.setText(String.valueOf(active));
        disabledCount.setText(String.valueOf(disabled.size()));
        if (marchesCount != null) marchesCount.setText(String.valueOf(marches.size()));

        if (accountsStatus != null) {
            if (accountsError != null && !accountsError.isEmpty()) {
                accountsStatus.setText(accountsError);
            } else {
                String s = deviceCount + (deviceCount == 1 ? " compte" : " comptes")
                    + " sur cet appareil";
                if (remoteCount > 0) s += " · " + remoteCount + " distant" + (remoteCount > 1 ? "s" : "");
                s += " · " + active + " actif(s) · " + marches.size() + " Marchés";
                if (remoteBusy) s += " · registre en cours…";
                else if (remoteError != null && !remoteError.isEmpty()) s += " · " + remoteError;
                accountsStatus.setText(s);
            }
        }

        if (listBox.getChildCount() == 0) addEmptyState();
    }

    private void addEmptyState() {
        LinearLayout empty = new LinearLayout(this);
        empty.setOrientation(LinearLayout.VERTICAL);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(dp(22), dp(24), dp(22), dp(24));
        empty.setBackground(rounded(CARD, 20, STROKE, 1));
        listBox.addView(empty, topMarginParams(8));

        TextView icon = text("◎", 27f, BRAND, true);
        icon.setGravity(Gravity.CENTER);
        empty.addView(icon);

        TextView t = text("Aucun compte détecté", 13f, TEXT, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(6), 0, 0);
        empty.addView(t);

        TextView s = text("Ouvrez ASSOULI AUTOX, créez un compte, puis touchez Actualiser.",
            10.5f, MUTED, false);
        s.setGravity(Gravity.CENTER);
        s.setPadding(0, dp(5), 0, 0);
        empty.addView(s);
    }

    private void addAccountRow(Account a, boolean off, boolean manual) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(12), dp(12), dp(9), dp(12));
        r.setBackground(rounded(CARD, 18, off ? DANGER_STROKE : STROKE, 1));
        r.setElevation(dp(2));
        listBox.addView(r, topMarginParams(8));

        String display = (a.name != null && !a.name.trim().isEmpty())
            ? a.name.trim() : prettyLocal(a.email);

        TextView avatar = text(initialOf(display.isEmpty() ? a.email : display),
            16f, off ? DANGER : BRAND, true);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable av = new GradientDrawable();
        av.setShape(GradientDrawable.OVAL);
        av.setColor(off ? 0xFF2A141A : 0xFF102535);
        av.setStroke(dp(1), off ? 0xFF5A2630 : 0xFF25465A);
        avatar.setBackground(av);
        r.addView(avatar, new LinearLayout.LayoutParams(dp(42), dp(42)));

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        mp.setMarginStart(dp(11));
        mp.setMarginEnd(dp(7));
        r.addView(mid, mp);

        TextView title = text(display, 13f, TEXT, true);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        mid.addView(title);

        TextView mail = text(a.email, 10.5f, MUTED, false);
        mail.setSingleLine(true);
        mail.setEllipsize(TextUtils.TruncateAt.END);
        mail.setPadding(0, dp(1), 0, 0);
        mid.addView(mail);

        String state = off ? "Désactivé" : "Actif";
        String date = dateFr(a.createdAt);
        boolean hasMarches = marches.contains(a.email);
        String meta;
        if (manual) {
            if (off) meta = "Désactivé manuellement · hors appareil";
            else if (hasMarches) meta = "Accès Marchés · hors appareil";
            else meta = "Compte manuel · hors appareil";
        } else if (a.remote) {
            String where = a.device.isEmpty() ? "autre appareil" : a.device;
            meta = "Distant · " + where + " · " + state + (hasMarches ? " · Marchés ✓" : "");
        } else if (date.isEmpty()) meta = state + (hasMarches ? " · Marchés ✓" : "");
        else meta = "Créé le " + date + " · " + state + (hasMarches ? " · Marchés ✓" : "");

        TextView metaTv = text(meta, 9.3f,
            off ? DANGER : (hasMarches ? CYAN : (a.remote ? 0xFF7DD3FC : BRAND)), false);
        metaTv.setSingleLine(true);
        metaTv.setEllipsize(TextUtils.TruncateAt.END);
        metaTv.setPadding(0, dp(2), 0, 0);
        mid.addView(metaTv);

        LinearLayout acts = new LinearLayout(this);
        acts.setOrientation(LinearLayout.VERTICAL);
        acts.setGravity(Gravity.END);

        TextView toggle = smallButton(off ? "Activer" : "Désactiver", off ? BRAND : DANGER);
        toggle.setOnClickListener(v -> {
            if (off) disabled.remove(a.email);
            else disabled.add(a.email);
            renderList();
            setStatus((off ? "Compte activé" : "Compte désactivé")
                + " localement · touchez Publier.", CYAN);
        });
        acts.addView(toggle);

        TextView marchBtn = smallButton(hasMarches ? "Marchés ✓" : "Marchés", hasMarches ? CYAN : MUTED);
        marchBtn.setOnClickListener(v -> {
            if (hasMarches) marches.remove(a.email);
            else marches.add(a.email);
            renderList();
            setStatus((hasMarches ? "Accès Marchés retiré" : "Accès Marchés accordé")
                + " · touchez Publier.", CYAN);
        });
        LinearLayout.LayoutParams mbp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mbp.topMargin = dp(5);
        acts.addView(marchBtn, mbp);

        r.addView(acts);
    }

    // ============================================================
    //  Splash animé
    // ============================================================

    private void showSplash(FrameLayout shell) {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackground(new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[]{0xFF071421, 0xFF02040A}
        ));
        overlay.setClickable(true);
        overlay.setFocusable(true);
        shell.addView(overlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        View glow = glow(330, 0x6638BDF8, 0x0022D3EE);
        FrameLayout.LayoutParams glp = new FrameLayout.LayoutParams(
            dp(330), dp(330), Gravity.CENTER);
        glp.topMargin = dp(-54);
        overlay.addView(glow, glp);

        glow.setAlpha(0f);
        glow.setScaleX(0.72f);
        glow.setScaleY(0.72f);
        glow.animate().alpha(0.9f).scaleX(1.08f).scaleY(1.08f)
            .setStartDelay(80).setDuration(900)
            .setInterpolator(new DecelerateInterpolator()).start();

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setClipChildren(false);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER);
        overlay.addView(col, clp);

        FrameLayout stage = new FrameLayout(this);
        stage.setClipChildren(false);
        col.addView(stage, new LinearLayout.LayoutParams(dp(196), dp(196)));

        View ring1 = ring(0x6638BDF8);
        stage.addView(ring1, centerLp(146));
        animateRing(ring1, 0);

        View ring2 = ring(0x4422D3EE);
        stage.addView(ring2, centerLp(186));
        animateRing(ring2, 150);

        FrameLayout logoCard = new FrameLayout(this);
        GradientDrawable cardBg = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[]{0xFF17324A, 0xFF081320}
        );
        cardBg.setCornerRadius(dp(36));
        cardBg.setStroke(dp(1), 0x5538BDF8);
        logoCard.setBackground(cardBg);
        logoCard.setElevation(dp(18));
        stage.addView(logoCard, centerLp(136));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.admin_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setPadding(dp(9), dp(9), dp(9), dp(9));
        logo.setContentDescription("ASSOULI AUTOX");
        logoCard.addView(logo, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        logoCard.setAlpha(0f);
        logoCard.setScaleX(0.62f);
        logoCard.setScaleY(0.62f);
        logoCard.animate().alpha(1f).scaleX(1f).scaleY(1f)
            .setStartDelay(90).setDuration(680)
            .setInterpolator(new OvershootInterpolator(1.3f)).start();

        LinearLayout word = new LinearLayout(this);
        word.setOrientation(LinearLayout.HORIZONTAL);
        word.setGravity(Gravity.CENTER);
        TextView w1 = text("ASSOULI", 24f, TEXT, true);
        w1.setLetterSpacing(0.04f);
        w1.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        word.addView(w1);

        TextView w2 = text("ADMIN", 9.5f, ON_BRAND, true);
        w2.setLetterSpacing(0.14f);
        w2.setPadding(dp(8), dp(3), dp(8), dp(3));
        w2.setBackground(rounded(BRAND, 7, 0, 0));
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wlp.leftMargin = dp(9);
        wlp.gravity = Gravity.CENTER_VERTICAL;
        word.addView(w2, wlp);
        col.addView(word);

        TextView tag = text("CONSOLE PRIVÉE  •  GESTION DES COMPTES", 8.5f, MUTED, true);
        tag.setLetterSpacing(0.15f);
        tag.setGravity(Gravity.CENTER);
        tag.setPadding(0, dp(8), 0, 0);
        col.addView(tag);

        word.setAlpha(0f);
        word.setTranslationY(dp(12));
        word.animate().alpha(1f).translationY(0f)
            .setStartDelay(300).setDuration(520)
            .setInterpolator(new DecelerateInterpolator()).start();

        tag.setAlpha(0f);
        tag.setTranslationY(dp(8));
        tag.animate().alpha(1f).translationY(0f)
            .setStartDelay(420).setDuration(500)
            .setInterpolator(new DecelerateInterpolator()).start();

        FrameLayout track = new FrameLayout(this);
        track.setBackground(rounded(0x14FFFFFF, 99, 0x00000000, 0));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(dp(200), dp(3));
        tlp.topMargin = dp(24);
        col.addView(track, tlp);

        View bar = new View(this);
        GradientDrawable barBg = new GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT, new int[]{BRAND, CYAN});
        barBg.setCornerRadius(dp(99));
        bar.setBackground(barBg);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(0,
            ViewGroup.LayoutParams.MATCH_PARENT);
        track.addView(bar, blp);

        track.setAlpha(0f);
        track.animate().alpha(1f).setStartDelay(480).setDuration(300).start();

        ValueAnimator va = ValueAnimator.ofInt(dp(14), dp(200));
        va.setStartDelay(520);
        va.setDuration(1050);
        va.setInterpolator(new DecelerateInterpolator());
        va.addUpdateListener(a -> {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) bar.getLayoutParams();
            lp.width = (int) a.getAnimatedValue();
            bar.setLayoutParams(lp);
        });
        va.start();

        TextView foot = text("MAROC JOBS HUB  ·  CONSOLE PRIVÉE", 8f, withAlpha(MUTED, 0.8f), true);
        foot.setLetterSpacing(0.2f);
        foot.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        flp.bottomMargin = dp(34);
        overlay.addView(foot, flp);

        overlay.postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;
            overlay.animate().alpha(0f).setDuration(320).withEndAction(() -> {
                if (!isFinishing() && !isDestroyed()) shell.removeView(overlay);
            }).start();
        }, 1720);
    }

    private void animateRing(View v, long delay) {
        v.setAlpha(0f);
        v.setScaleX(0.72f);
        v.setScaleY(0.72f);
        v.animate().alpha(0.8f).scaleX(0.96f).scaleY(0.96f)
            .setStartDelay(delay).setDuration(360)
            .withEndAction(() -> v.animate().alpha(0f)
                .scaleX(1.45f).scaleY(1.45f)
                .setDuration(880)
                .setInterpolator(new DecelerateInterpolator())
                .start())
            .start();
    }

    private View ring(int stroke) {
        View v = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(Color.TRANSPARENT);
        g.setStroke(dp(1), stroke);
        v.setBackground(g);
        return v;
    }

    private FrameLayout.LayoutParams centerLp(int size) {
        return new FrameLayout.LayoutParams(dp(size), dp(size), Gravity.CENTER);
    }

    // ============================================================
    //  Comptes de l'appareil (provider signature)
    // ============================================================

    private void loadDeviceAccounts() {
        loadDeviceAccounts(false);
    }

    private void loadDeviceAccounts(boolean forceRemote) {
        accountsError = null;
        try (Cursor c = getContentResolver().query(
            Uri.parse("content://ma.marocjobs.hub.accounts/accounts"),
            null, null, null, null)) {
            String json = "[]";
            if (c != null && c.moveToFirst()) json = c.getString(0);
            parseAccounts(json);
            prefs.edit().putString("accounts_cache", json == null ? "[]" : json).apply();
        } catch (SecurityException se) {
            parseAccounts(prefs.getString("accounts_cache", "[]"));
            accountsError = "Accès refusé : réinstallez l'APK admin après l'app principale (même clé de signature).";
        } catch (Exception e) {
            parseAccounts(prefs.getString("accounts_cache", "[]"));
            accountsError = accounts.isEmpty()
                ? "Ouvrez ASSOULI AUTOX une fois pour synchroniser les comptes."
                : null;
        }
        // Affiche immédiatement le dernier registre connu, puis le rafraîchit.
        parseRemoteAccounts(prefs.getString("remote_accounts_cache", "[]"));
        renderList();
        loadRemoteAccounts(forceRemote);
    }

    private void parseAccounts(String json) {
        accounts.clear();
        try {
            JSONArray arr = new JSONArray(json == null || json.trim().isEmpty() ? "[]" : json);
            for (int i = arr.length() - 1; i >= 0; i--) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                if (!o.optBoolean("verified", true)) continue;
                String em = o.optString("email", "").trim().toLowerCase(Locale.ROOT);
                if (em.isEmpty()) continue;
                accounts.add(new Account(em, o.optString("name", ""), o.optString("createdAt", "")));
            }
        } catch (Exception ignored) {}
    }

    private void parseRemoteAccounts(String json) {
        remoteAccounts.clear();
        try {
            JSONArray arr = new JSONArray(json == null || json.trim().isEmpty() ? "[]" : json);
            for (int i = arr.length() - 1; i >= 0; i--) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String em = o.optString("email", "").trim().toLowerCase(Locale.ROOT);
                if (em.isEmpty()) continue;
                remoteAccounts.add(new Account(
                    em,
                    o.optString("name", ""),
                    o.optString("createdAt", ""),
                    o.optString("device", "Android"),
                    true));
            }
        } catch (Exception ignored) {}
    }

    /**
     * Registre central : lecture IMAP de la boîte Gmail. Chaque compte créé
     * sur n'importe quel téléphone y a déposé un message [ASSOULI-ACCOUNT].
     */
    private void loadRemoteAccounts(boolean force) {
        if (remoteBusy) return;
        if (!force && lastRemoteFetch > 0
            && System.currentTimeMillis() - lastRemoteFetch < 5 * 60 * 1000) return;
        remoteBusy = true;
        renderList();
        pool.execute(() -> {
            List<Account> fetched = null;
            String error = null;
            try {
                fetched = fetchImapAccounts();
            } catch (Exception e) {
                error = shortMsg(e);
            }
            final List<Account> result = fetched;
            final String err = error;
            runOnUiThread(() -> {
                remoteBusy = false;
                lastRemoteFetch = System.currentTimeMillis();
                if (result != null) {
                    remoteAccounts.clear();
                    remoteAccounts.addAll(result);
                    prefs.edit().putString("remote_accounts_cache", remoteCacheJson()).apply();
                    remoteError = null;
                } else {
                    remoteError = err == null || err.isEmpty()
                        ? "registre central indisponible" : "registre : " + err;
                }
                renderList();
            });
        });
    }

    private List<Account> fetchImapAccounts() throws Exception {
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.host", IMAP_HOST);
        p.put("mail.imaps.port", "993");
        p.put("mail.imaps.ssl.enable", "true");
        p.put("mail.imaps.connectiontimeout", "20000");
        p.put("mail.imaps.timeout", "30000");

        Store store = null;
        Folder inbox = null;
        try {
            Session session = Session.getInstance(p);
            store = session.getStore("imaps");
            store.connect(IMAP_HOST, IMAP_USER, IMAP_PASSWORD);
            inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);

            Message[] msgs;
            try {
                msgs = inbox.search(new SubjectTerm(ACCOUNT_SUBJECT));
            } catch (Exception e) {
                msgs = inbox.getMessages();
            }

            Map<String, Account> found = new LinkedHashMap<>();
            int start = Math.max(0, msgs.length - 600);
            for (int i = start; i < msgs.length; i++) {
                try {
                    String subject = msgs[i].getSubject();
                    if (subject == null || !subject.contains(ACCOUNT_SUBJECT)) continue;
                    String body = readPart(msgs[i]);
                    int a = body.indexOf('{');
                    int b = body.lastIndexOf('}');
                    if (a < 0 || b <= a) continue;
                    JSONObject o = new JSONObject(body.substring(a, b + 1));
                    String em = o.optString("email", "").trim().toLowerCase(Locale.ROOT);
                    if (em.isEmpty()) continue;
                    found.put(em, new Account(
                        em,
                        o.optString("name", ""),
                        o.optString("createdAt", ""),
                        o.optString("device", "Android"),
                        true));
                } catch (Exception ignored) {}
            }
            return new ArrayList<>(found.values());
        } finally {
            try { if (inbox != null && inbox.isOpen()) inbox.close(false); } catch (Exception ignored) {}
            try { if (store != null && store.isConnected()) store.close(); } catch (Exception ignored) {}
        }
    }

    private static String readPart(Part part) throws Exception {
        Object content = part.getContent();
        if (content instanceof String) return (String) content;
        if (content instanceof Multipart) {
            Multipart mp = (Multipart) content;
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart bp = mp.getBodyPart(i);
                String disp = bp.getDisposition();
                if (disp != null && disp.equalsIgnoreCase(Part.ATTACHMENT)) continue;
                String txt = readPart(bp);
                if (txt != null && !txt.trim().isEmpty()) return txt;
            }
        }
        return "";
    }

    private String remoteCacheJson() {
        JSONArray arr = new JSONArray();
        for (Account a : remoteAccounts) {
            try {
                JSONObject o = new JSONObject();
                o.put("email", a.email);
                o.put("name", a.name);
                o.put("createdAt", a.createdAt);
                o.put("device", a.device);
                arr.put(o);
            } catch (Exception ignored) {}
        }
        return arr.toString();
    }

    // ============================================================
    //  GitHub access.json
    // ============================================================

    private void loadRemote() {
        savePrefs();
        final String owner = ownerInput.getText().toString().trim();
        final String repo = repoInput.getText().toString().trim();
        final String branch = branchInput.getText().toString().trim();
        final String token = tokenInput.getText().toString().trim();
        if (owner.isEmpty() || repo.isEmpty()) {
            setStatus("Compte / dépôt manquant.", DANGER);
            return;
        }
        setStatus("Chargement de la liste distante…", CYAN);
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
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        disabled.add(arr.optString(i).toLowerCase(Locale.ROOT));
                    }
                }
                JSONArray marr = root.optJSONArray("marches");
                marches.clear();
                if (marr != null) {
                    for (int i = 0; i < marr.length(); i++) {
                        String e = marr.optString(i, "").trim().toLowerCase(Locale.ROOT);
                        if (!e.isEmpty()) marches.add(e);
                    }
                }
                String msg = root.optString("message", "");
                runOnUiThread(() -> {
                    if (!msg.isEmpty()) messageInput.setText(msg);
                    renderList();
                    setStatus("Synchronisé · " + disabled.size() + " désactivé(s) · "
                        + marches.size() + " accès Marchés.", BRAND);
                });
            } catch (Exception e) {
                runOnUiThread(() -> setStatus("Erreur chargement : " + shortMsg(e), DANGER));
            }
        });
    }

    private void saveRemote() {
        savePrefs();
        final String owner = ownerInput.getText().toString().trim();
        final String repo = repoInput.getText().toString().trim();
        final String branch = branchInput.getText().toString().trim();
        final String token = tokenInput.getText().toString().trim();
        if (token.isEmpty()) {
            setStatus("Jeton GitHub requis pour publier.", DANGER);
            return;
        }
        if (owner.isEmpty() || repo.isEmpty()) {
            setStatus("Compte / dépôt manquant.", DANGER);
            return;
        }
        final String message = messageInput.getText().toString().trim();
        setStatus("Publication en cours…", CYAN);
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
                JSONArray marr = new JSONArray();
                for (String e : marches) marr.put(e);
                SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
                fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
                payload.put("updatedAt", fmt.format(new Date()));
                payload.put("disabled", arr);
                payload.put("marches", marr);
                payload.put("message", message.isEmpty()
                    ? "Ce compte a été désactivé par l’administrateur." : message);

                final String accessJson = payload.toString();
                byte[] bytes = payload.toString(2).getBytes(StandardCharsets.UTF_8);
                JSONObject body = new JSONObject();
                body.put("message", "Admin: update access (disabled + Marchés)");
                body.put("content", Base64.encodeToString(bytes, Base64.NO_WRAP));
                body.put("branch", branch);
                if (!sha.isEmpty()) body.put("sha", sha);

                JSONObject res = request("PUT", url,
                    body.toString().getBytes(StandardCharsets.UTF_8), token);
                JSONObject content = res.optJSONObject("content");
                if (content != null) sha = content.optString("sha", sha);
                runOnUiThread(() -> {
                    setStatus("Publié ✓ appliqué au prochain contrôle des appareils.", BRAND);
                    sendAccessBroadcast(accessJson);
                });
            } catch (Exception e) {
                runOnUiThread(() -> setStatus("Erreur publication : " + shortMsg(e), DANGER));
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
        if (code < 200 || code >= 300) {
            String detail = sb.toString().replaceAll("\\s+", " ");
            if (detail.length() > 110) detail = detail.substring(0, 110) + "…";
            throw new Exception("HTTP " + code + (detail.isEmpty() ? "" : " · " + detail));
        }
        return new JSONObject(sb.toString());
    }

    /** Prévient immédiatement l'app principale sur ce téléphone (même signature). */
    private void sendAccessBroadcast(String json) {
        try {
            Intent i = new Intent("ma.marocjobs.hub.ACTION_ACCESS_CHANGED");
            i.setPackage("ma.marocjobs.hub");
            i.putExtra("access", json);
            sendBroadcast(i, "ma.marocjobs.hub.permission.READ_ACCOUNTS");
        } catch (Exception ignored) {}
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

    // ============================================================
    //  Helpers
    // ============================================================

    private TextView text(String value, float sizeSp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        t.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return t;
    }

    private void setStatus(String message, int color) {
        if (status == null) return;
        status.setText(message);
        status.setTextColor(color);
        if (statusDot != null) {
            Drawable d = statusDot.getBackground();
            if (d instanceof GradientDrawable) ((GradientDrawable) d).setColor(color);
        }
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private int withAlpha(int color, float alpha) {
        int a = Math.round(255 * Math.max(0f, Math.min(1f, alpha)));
        return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color));
    }

    private GradientDrawable rounded(int fill, int radiusDp, int strokeColor, int strokeWidthDp) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.RECTANGLE);
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) g.setStroke(dp(strokeWidthDp), strokeColor);
        return g;
    }

    private RippleDrawable ripple(Drawable content, int rippleColor) {
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, null);
    }

    private View glow(int size, int center, int edge) {
        View v = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        g.setGradientRadius(dp(size / 2));
        g.setGradientCenter(0.5f, 0.5f);
        g.setColors(new int[]{center, edge});
        v.setBackground(g);
        return v;
    }

    private LinearLayout.LayoutParams topMarginParams(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    private LinearLayout.LayoutParams weighted(float weight, int startDp, int endDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, weight);
        lp.setMarginStart(dp(startDp));
        lp.setMarginEnd(dp(endDp));
        return lp;
    }

    private String prettyLocal(String email) {
        if (email == null || email.isEmpty()) return "Compte";
        int at = email.indexOf('@');
        String s = at > 0 ? email.substring(0, at) : email;
        s = s.replace('.', ' ').replace('_', ' ').replace('-', ' ').trim();
        if (s.isEmpty()) return "Compte";
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private String initialOf(String value) {
        if (value != null) {
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if (Character.isLetterOrDigit(c)) {
                    return String.valueOf(Character.toUpperCase(c));
                }
            }
        }
        return "A";
    }

    private String dateFr(String iso) {
        if (iso == null || iso.length() < 10) return "";
        String[] p = iso.substring(0, 10).split("-");
        if (p.length == 3) return p[2] + "/" + p[1] + "/" + p[0];
        return iso.substring(0, 10);
    }

    private String shortMsg(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isEmpty()) m = e.getClass().getSimpleName();
        return m.length() > 140 ? m.substring(0, 140) + "…" : m;
    }
}
