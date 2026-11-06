package ma.marocjobs.hub;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.os.Build;

import org.json.JSONObject;

import java.util.Properties;

import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;

/**
 * SmtpMail — envoie le code de vérification depuis portailm.public@gmail.com
 * (Gmail SMTP + mot de passe d'application) vers l'adresse de l'utilisateur.
 */
@CapacitorPlugin(name = "SmtpMail")
public class MailPlugin extends Plugin {

    private static final String SENDER = "portailm.public@gmail.com";
    // Injecte depuis app/android/secrets.properties (jamais commite).
    private static final String APP_PASSWORD = BuildConfig.SMTP_PASSWORD;

    @PluginMethod
    public void send(final PluginCall call) {
        final String to = call.getString("to", "");
        final String code = call.getString("code", "");
        final String name = call.getString("name", "");

        if (to == null || to.trim().isEmpty() || code == null || code.trim().isEmpty()) {
            call.reject("Adresse e-mail ou code manquant");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Properties p = new Properties();
                    p.put("mail.smtp.auth", "true");
                    p.put("mail.smtp.starttls.enable", "true");
                    p.put("mail.smtp.host", "smtp.gmail.com");
                    p.put("mail.smtp.port", "587");
                    p.put("mail.smtp.connectiontimeout", "25000");
                    p.put("mail.smtp.timeout", "25000");
                    p.put("mail.smtp.writetimeout", "25000");

                    Session session = Session.getInstance(p, new Authenticator() {
                        @Override
                        protected PasswordAuthentication getPasswordAuthentication() {
                            return new PasswordAuthentication(SENDER, APP_PASSWORD);
                        }
                    });

                    MimeMessage msg = new MimeMessage(session);
                    msg.setFrom(new InternetAddress(SENDER, "ASSOULI AUTOX"));
                    msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to.trim(), false));
                    msg.setSubject("Code de vérification — ASSOULI AUTOX", "UTF-8");

                    String html = "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:26px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">"
                        + "<h2 style=\"margin:0 0 6px;color:#0f766e;font-size:22px\">ASSOULI AUTOX</h2>"
                        + "<p style=\"color:#475569;margin:0 0 18px\">Plateforme emploi, marchés publics &amp; exams</p>"
                        + "<p>Bonjour " + escape(name) + ",</p>"
                        + "<p>Voici votre code de vérification :</p>"
                        + "<p style=\"font-size:36px;font-weight:800;letter-spacing:12px;color:#0f172a;margin:20px 0;text-align:center;background:#f0fdfa;padding:14px 0;border-radius:12px\">" + code + "</p>"
                        + "<p style=\"color:#64748b\">Ce code est valable <b>10 minutes</b>.</p>"
                        + "<p style=\"color:#94a3b8;font-size:12px;margin-top:22px\">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.</p>"
                        + "</div>";

                    msg.setContent(html, "text/html; charset=UTF-8");
                    Transport.send(msg);

                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    String m = e.getMessage();
                    call.reject(m == null ? "Envoi de l'e-mail impossible" : m);
                }
            }
        }).start();
    }

    /**
     * Registre central des comptes : envoie une fiche JSON à la boîte Gmail
     * de l'application. L'APK admin lit ensuite cette boîte en IMAP pour
     * afficher les comptes créés sur n'importe quel appareil.
     */
    @PluginMethod
    public void registerAccount(final PluginCall call) {
        final String email = call.getString("email", "").trim().toLowerCase();
        if (email.isEmpty()) {
            call.reject("Adresse e-mail manquante");
            return;
        }
        final String name = call.getString("name", "");
        final String createdAt = call.getString("createdAt", "");
        final String device = call.getString("device", "Android");
        final String appVersion = call.getString("appVersion", "");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String model = (Build.MANUFACTURER + " " + Build.MODEL).trim();
                    String deviceLabel = (device == null || device.trim().isEmpty() || "Android".equalsIgnoreCase(device))
                        ? (model.isEmpty() ? "Android" : model)
                        : device;
                    JSONObject o = new JSONObject();
                    o.put("type", "account");
                    o.put("email", email);
                    o.put("name", name == null ? "" : name);
                    o.put("createdAt", createdAt == null ? "" : createdAt);
                    o.put("device", deviceLabel);
                    o.put("appVersion", appVersion == null ? "" : appVersion);
                    String at = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
                        .format(new java.util.Date());
                    o.put("at", at);

                    Properties p = new Properties();
                    p.put("mail.smtp.auth", "true");
                    p.put("mail.smtp.starttls.enable", "true");
                    p.put("mail.smtp.host", "smtp.gmail.com");
                    p.put("mail.smtp.port", "587");
                    p.put("mail.smtp.connectiontimeout", "25000");
                    p.put("mail.smtp.timeout", "25000");
                    p.put("mail.smtp.writetimeout", "25000");

                    Session session = Session.getInstance(p, new Authenticator() {
                        @Override
                        protected PasswordAuthentication getPasswordAuthentication() {
                            return new PasswordAuthentication(SENDER, APP_PASSWORD);
                        }
                    });

                    MimeMessage msg = new MimeMessage(session);
                    msg.setFrom(new InternetAddress(SENDER, "ASSOULI AUTOX"));
                    msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(SENDER, false));
                    msg.setSubject("[ASSOULI-ACCOUNT] " + email, "UTF-8");

                    // multipart/alternative : le JSON texte reste EN PREMIER car
                    // l'APK admin lit la première partie non vide via IMAP.
                    MimeMultipart multipart = new MimeMultipart("alternative");

                    MimeBodyPart textPart = new MimeBodyPart();
                    textPart.setText(o.toString(), "UTF-8");
                    multipart.addBodyPart(textPart);

                    // Le HTML est un bonus : s'il échoue, le JSON texte part
                    // quand même (l'APK admin et l'e-mail restent fonctionnels).
                    try {
                        MimeBodyPart htmlPart = new MimeBodyPart();
                        htmlPart.setContent(
                            buildAccountHtml(email, name, createdAt, deviceLabel, appVersion, at),
                            "text/html; charset=UTF-8"
                        );
                        multipart.addBodyPart(htmlPart);
                    } catch (Exception ignored) {}

                    msg.setContent(multipart);
                    Transport.send(msg);

                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    String m = e.getMessage();
                    call.reject(m == null ? "Enregistrement du compte impossible" : m);
                }
            }
        }).start();
    }

    private static String accountRow(String label, String value) {
        return "<tr>"
            + "<td style=\"padding:13px 16px;background:#f7fafc;border-bottom:1px solid #e3ebf2;"
            + "font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#7a8fa3;font-weight:700;width:36%;\">"
            + label + "</td>"
            + "<td style=\"padding:13px 16px;border-bottom:1px solid #e3ebf2;font-size:14px;"
            + "color:#0b1d33;font-weight:700;word-break:break-word;\">"
            + value + "</td></tr>";
    }

    private static String buildAccountHtml(String email, String name, String createdAt,
                                           String deviceLabel, String appVersion, String at) {
        String safeEmail = escape(email);
        String safeName = escape(name == null || name.trim().isEmpty() ? "Non renseigné" : name);
        String safeDevice = escape(deviceLabel);
        String safeVersion = escape(appVersion == null || appVersion.trim().isEmpty() ? "—" : appVersion);
        String safeDate = escape(createdAt == null || createdAt.trim().isEmpty() ? at : createdAt);
        String mailto = "mailto:" + safeEmail;

        String rows = accountRow("Nom", safeName)
            + accountRow("E-mail", safeEmail)
            + accountRow("Appareil", safeDevice)
            + accountRow("Version", safeVersion)
            + accountRow("Inscription", safeDate);

        return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<title>Nouveau compte ASSOULI AUTOX</title></head>"
            + "<body style=\"margin:0;padding:0;background:#eef3f8;"
            + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
            + "color:#1b2a3d;\">"
            + "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;\">"
            + "Nouveau compte ASSOULI AUTOX&#160;: " + safeEmail + "</div>"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
            + "style=\"background:#eef3f8;padding:28px 14px;\"><tr><td align=\"center\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
            + "style=\"max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;"
            + "box-shadow:0 18px 40px -24px rgba(11,29,51,.45);\">"
            + "<tr><td style=\"background:linear-gradient(135deg,#0b1d33 0%,#0e3b52 55%,#0a7f6b 100%);"
            + "padding:30px 28px 26px;\">"
            + "<div style=\"font-size:11px;letter-spacing:2.5px;text-transform:uppercase;"
            + "color:#7cf2da;font-weight:700;\">ASSOULI AUTOX</div>"
            + "<h1 style=\"margin:10px 0 0;font-size:24px;line-height:1.25;color:#ffffff;"
            + "font-weight:800;\">Nouveau compte créé</h1>"
            + "<p style=\"margin:8px 0 0;font-size:13px;color:#b9d4e4;\">"
            + "Une nouvelle inscription vient d&rsquo;&ecirc;tre enregistr&eacute;e.</p>"
            + "</td></tr>"
            + "<tr><td style=\"padding:26px 28px 8px;\">"
            + "<p style=\"margin:0 0 16px;font-size:14px;line-height:1.6;color:#40556b;\">"
            + "Bonjour, un utilisateur vient de cr&eacute;er un compte sur "
            + "<strong>ASSOULI AUTOX</strong>. Voici les informations transmises&nbsp;:</p>"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
            + "style=\"border:1px solid #e3ebf2;border-radius:14px;overflow:hidden;\">"
            + rows
            + "</table>"
            + "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:22px 0 4px;\">"
            + "<tr><td style=\"border-radius:12px;background:#0a7f6b;\">"
            + "<a href=\"" + mailto + "\" style=\"display:inline-block;padding:13px 22px;"
            + "font-size:13.5px;font-weight:800;color:#ffffff;text-decoration:none;\">"
            + "R&eacute;pondre &agrave; l&rsquo;utilisateur</a></td></tr></table>"
            + "</td></tr>"
            + "<tr><td style=\"padding:18px 28px 26px;\">"
            + "<p style=\"margin:0;font-size:11px;line-height:1.6;color:#8a9bab;\">"
            + "Message automatique envoy&eacute; par l&rsquo;application ASSOULI AUTOX. "
            + "Aucune action n&rsquo;est requise.</p>"
            + "</td></tr></table></td></tr></table></body></html>";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
